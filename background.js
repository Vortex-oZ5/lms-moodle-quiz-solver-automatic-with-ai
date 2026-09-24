// Fast local scanner: scan pages in parallel and do not wait for a full load
// when the content script is already ready. This keeps multi-question pages
// (for example several questions on one quiz page) in a single scan.
// Fast + complete local scanner.
// Pages are scanned concurrently, but each page is allowed enough time for
// Moodle/LMS content to finish rendering before its result is accepted.
const SCAN_TIMEOUT = 6500;
const SCAN_RETRY_MS = 25;
const SCAN_STABLE_MS = 180;
const SCAN_MIN_SETTLE_MS = 350;

function questionSignature(list) {
  return JSON.stringify((Array.isArray(list) ? list : []).map(q => [
    String(q?.question || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    (q?.options || []).map(o => String(o?.text ?? o ?? '').replace(/\s+/g, ' ').trim().toLowerCase())
  ]));
}

async function waitForContentScript(tabId, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ping = await chrome.tabs.sendMessage(tabId, { type: 'PING_LOCAL_SCAN' });
      if (ping?.success) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 35));
  }
  return false;
}

async function scanTab(tabId, timeoutMs = SCAN_TIMEOUT) {
  await waitForContentScript(tabId);

  const start = Date.now();
  let best = [];
  let bestSignature = '';
  let stableSince = 0;
  let firstNonEmptyAt = 0;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_CURRENT_LOCAL' });
      if (res?.success) {
        const questions = Array.isArray(res.questions) ? res.questions : [];
        const sig = questionSignature(questions);

        if (questions.length > best.length || (questions.length === best.length && sig !== bestSignature)) {
          best = questions;
          bestSignature = sig;
          stableSince = Date.now();
          if (!firstNonEmptyAt && questions.length) firstNonEmptyAt = Date.now();
        } else if (questions.length === best.length && questions.length > 0) {
          if (!firstNonEmptyAt) firstNonEmptyAt = Date.now();
          // Do not finish immediately after the first stable result. LMS pages
          // often append question blocks shortly after document_idle.
          if (Date.now() - firstNonEmptyAt >= SCAN_MIN_SETTLE_MS &&
              Date.now() - stableSince >= SCAN_STABLE_MS) {
            return best;
          }
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, SCAN_RETRY_MS));
  }
  return best;
}


function normalizeTargetUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return String(url || '');
  }
}

async function scanQuestionPages(targets, currentUrl = '', currentQuestions = []) {
  const rawList = Array.isArray(targets) ? targets.filter(t => t?.url) : [];
  const seenUrls = new Set();
  const list = [];

  // Never open the page that is already visible: its content script can scan it
  // immediately, and one page may contain many questions.
  const currentKey = normalizeTargetUrl(currentUrl);
  for (const target of rawList) {
    const key = normalizeTargetUrl(target.url);
    if (!key || key === currentKey || seenUrls.has(key)) continue;
    seenUrls.add(key);
    list.push({ ...target, url: key });
  }

  // If the LMS exposes a numbered quiz navigator but some buttons have
  // unusual/missing hrefs, reconstruct their page URLs from the current
  // attempt URL. This is especially important for Moodle-style 1..N
  // navigation where several questions can belong to one page.
  if (list.length < rawList.length) {
    const base = (() => {
      try {
        const u = new URL(currentUrl);
        u.hash = '';
        return u;
      } catch { return null; }
    })();
    if (base) {
      const existingPages = new Set(list.map(t => Number(t.pageIndex)));
      for (const target of rawList) {
        const p = Number(target.pageIndex);
        if (!Number.isFinite(p) || p < 0 || existingPages.has(p)) continue;
        const u = new URL(base.href);
        u.searchParams.set('page', String(p));
        const key = normalizeTargetUrl(u.href);
        if (key !== currentKey && !seenUrls.has(key)) {
          seenUrls.add(key);
          list.push({ ...target, url: key });
        }
      }
      list.sort((a, b) => Number(a.pageIndex) - Number(b.pageIndex));
    }
  }

  if (!list.length) {
    return { questions: Array.isArray(currentQuestions) ? currentQuestions : [], pages: rawList.length, errors: [] };
  }

  // A few parallel tabs are faster in practice than opening every page at once,
  // while avoiding a browser/network overload.
  const concurrency = Math.min(4, list.length);
  const results = new Array(list.length);
  const errors = [];
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= list.length) return;
      const target = list[index];
      let tabId = null;
      try {
        const tab = await chrome.tabs.create({ url: target.url, active: false });
        tabId = tab.id;
        if (!tabId) throw new Error('Could not create scan tab');

        // Do not wait for tab.status === "complete". The content script is
        // available as soon as document_idle runs; scanTab polls rapidly.
        results[index] = await scanTab(tabId);
        if (!results[index].length) {
          await new Promise(r => setTimeout(r, 300));
          results[index] = await scanTab(tabId, 4000);
        }
        // A very late-rendering page gets one final pass before being marked
        // empty. This prevents one slow page from silently disappearing.
        if (!results[index].length) {
          await new Promise(r => setTimeout(r, 500));
          results[index] = await scanTab(tabId, 3000);
        }
      } catch (e) {
        results[index] = [];
        errors.push({ page: target.pageNumber || index + 1, error: e?.message || String(e) });
      } finally {
        if (tabId) { try { await chrome.tabs.remove(tabId); } catch {} }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const questions = Array.isArray(currentQuestions) ? currentQuestions.map((q, i) => ({
    id: i,
    question: String(q?.question || '').trim(),
    options: (q?.options || []).map(o => ({ text: String(o?.text ?? o).trim() })).filter(o => o.text),
    type: q?.type || 'single'
  })).filter(q => q.question.length >= 3 && q.options.length >= 2) : [];

  const seen = new Set();
  for (const q of questions) {
    const key = JSON.stringify([
      q.question.toLowerCase().replace(/\s+/g, ' '),
      q.options.map(o => o.text.toLowerCase().replace(/\s+/g, ' '))
    ]);
    seen.add(key);
  }

  for (const page of results) {
    for (const q of page || []) {
      const normalized = {
        id: questions.length,
        question: String(q?.question || '').trim(),
        options: (q?.options || []).map(o => ({ text: String(o?.text ?? o).trim() })).filter(o => o.text),
        type: q?.type || 'single'
      };
      if (normalized.question.length < 3 || normalized.options.length < 2) continue;
      const key = JSON.stringify([
        normalized.question.toLowerCase().replace(/\s+/g, ' '),
        normalized.options.map(o => o.text.toLowerCase().replace(/\s+/g, ' '))
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      normalized.id = questions.length;
      questions.push(normalized);
    }
  }

  return { questions, pages: rawList.length, errors };
}


async function getAIConfig(){
  const d=await chrome.storage.local.get({vortex_ai:{provider:'openai',apiKey:'',endpoint:'',model:''}});
  const cfg={provider:'openai',apiKey:'',endpoint:'',model:'',...(d.vortex_ai||{})};
  if(cfg.provider==='gemini' && (!cfg.model || /^gemini-2\.0/i.test(String(cfg.model||'')))){
    cfg.model='gemini-3.8-flash';
    await chrome.storage.local.set({vortex_ai:cfg});
  }
  return cfg;
}
function providerDefaults(provider){
  return ({
    openai:{endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4o-mini'},
    gemini:{endpoint:'',model:'gemini-3.8-flash'},
    anthropic:{endpoint:'https://api.anthropic.com/v1/messages',model:'claude-3-5-haiku-latest'},
    groq:{endpoint:'https://api.groq.com/openai/v1/chat/completions',model:'llama-3.3-70b-versatile'},
    openrouter:{endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'openai/gpt-4o-mini'},
    custom:{endpoint:'',model:''}
  })[provider]||{};
}
const AI_TIMEOUT_MS=30000;
const AI_RETRYABLE=new Set([408,409,425,429,500,502,503,504]);
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function fetchWithTimeout(url, options={}, timeout=AI_TIMEOUT_MS){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{...options,signal:controller.signal});}
  catch(e){if(e?.name==='AbortError') throw new Error('AI request timed out after 30 seconds. Check your connection or try again.'); throw e;}
  finally{clearTimeout(timer);}
}
async function fetchRetry(url, options={}, attempts=3){
  let lastError=null;
  for(let i=0;i<attempts;i++){
    try{
      const r=await fetchWithTimeout(url,options);
      if(r.ok || !AI_RETRYABLE.has(r.status) || i===attempts-1) return r;
      const retryAfter=Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter)&&retryAfter>0 ? Math.min(retryAfter*1000,8000) : 700*Math.pow(2,i) + Math.floor(Math.random()*250));
    }catch(e){
      lastError=e;
      if(i===attempts-1) throw e;
      await sleep(700*Math.pow(2,i) + Math.floor(Math.random()*250));
    }
  }
  throw lastError||new Error('AI request failed');
}
async function listGeminiModels(key){
  const r=await fetchWithTimeout('https://generativelanguage.googleapis.com/v1beta/models?key='+encodeURIComponent(key),{method:'GET'});
  const text=await r.text();
  if(!r.ok) throw new Error(`Gemini model list ${r.status}: ${text.slice(0,260)}`);
  const data=JSON.parse(text);
  return (data.models||[]).filter(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,'')).filter(Boolean);
}
async function geminiGenerate(key, model, prompt, test){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const body={
    contents:[{parts:[{text:prompt}]}],
    generationConfig:{maxOutputTokens:test?32:4000}
  };
  const r=await fetchRetry(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body)},3);
  const text=await r.text();
  if(!r.ok) { const err=new Error(`Gemini ${r.status}: ${text.slice(0,500)}`); err.status=r.status; throw err; }
  const data=JSON.parse(text);
  const out=data?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim()||'';
  if(!out){
    const reason=data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `Gemini returned no text (${reason}).` : 'Gemini returned an empty response.');
  }
  return out;
}
async function aiRequest(config, prompt, test=false){
  const provider=config.provider||'openai';
  const key=String(config.apiKey||'').trim();
  if(!key) throw new Error('API key is not configured. Open AI Settings first.');
  const d=providerDefaults(provider);
  const endpoint=(config.endpoint||d.endpoint||'').trim();
  const model=(config.model||d.model||'').trim();

  if(provider==='gemini'){
    if(!model) throw new Error('Gemini model is required');
    try {
      return await geminiGenerate(key,model,prompt,test);
    } catch(e) {
      // If a saved model was shut down/renamed, discover a currently usable
      // generateContent model and retry once. This avoids hard-coded model rot.
      if(e?.status===404){
        try{
          const available=await listGeminiModels(key);
          const preferred=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-2.5-flash','gemini-2.5-flash-lite'];
          const next=preferred.find(x=>available.includes(x)) || available.find(x=>/flash/i.test(x) && !/image|tts|live|audio/i.test(x));
          if(next && next!==model){
            const updated={...config,model:next};
            await chrome.storage.local.set({vortex_ai:updated});
            return await geminiGenerate(key,next,prompt,test);
          }
        }catch(discoveryError){
          throw new Error(`${e.message} | Model discovery failed: ${discoveryError?.message||discoveryError}`);
        }
      }
      throw e;
    }
  }

  if(!endpoint) throw new Error('API endpoint is required');
  const headers={'Content-Type':'application/json','Authorization':`Bearer ${key}`};
  if(provider==='anthropic'){
    headers['anthropic-version']='2023-06-01';
    headers['anthropic-dangerous-direct-browser-access']='true';
    delete headers.Authorization;
    headers['x-api-key']=key;
  }
  const body=provider==='anthropic'
    ? {model,max_tokens:test?32:4000,messages:[{role:'user',content:prompt}]}
    : {model,messages:[{role:'system',content:'You are a study assistant. Return concise answer suggestions and explanations. Never claim to have interacted with the webpage.'},{role:'user',content:prompt}],max_tokens:test?32:4000};
  const r=await fetchRetry(endpoint,{method:'POST',headers,body:JSON.stringify(body)},3);
  const text=await r.text();
  if(!r.ok) throw new Error(`${provider} ${r.status}: ${text.slice(0,500)}`);
  const data=JSON.parse(text);
  if(provider==='anthropic') return data?.content?.map(x=>x.text||'').join('')||'';
  return data?.choices?.[0]?.message?.content||'';
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    notifications_enabled: true,
    super_mode_enabled: false,
    lazybot_manual_collected_questions_v1: [],
    lazybot_manual_answers_v1: {},
    lazybot_super_session_v2: null,
    stats: { solved: 0, lastSolve: null }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'START_LOCAL_SCAN') {
        const result = await scanQuestionPages(message.targets || [], message.currentUrl || '', message.currentQuestions || []);
        sendResponse({ success: true, ...result });
        return;
      }
      if (message?.type === 'GET_RUNTIME_TAB_ID') { sendResponse({ success: true, tabId: sender?.tab?.id ?? null }); return; }
      if (message?.type === 'OPEN_AI_SETTINGS') { await chrome.runtime.openOptionsPage(); sendResponse({success:true}); return; }
      if (message?.type === 'AI_TEST_CONNECTION') { const cfg=message.config||await getAIConfig(); await aiRequest(cfg,'Reply with the single word OK.',true); sendResponse({success:true}); return; }
      if (message?.type === 'AI_ANSWER_KEY') {
        const cfg = await getAIConfig();
        const questions = Array.isArray(message.questions) ? message.questions : [];
        if (!questions.length) throw new Error('No scanned questions available.');
        const compact = questions.map((q, i) => `${i + 1}. ${q.question}\n${(q.options || []).map((o, j) => `${String.fromCharCode(65 + j)}. ${o.text}`).join('\n')}`).join('\n\n');
        const prompt = `You are given a batch of multiple-choice study questions. Solve every question independently and return ONLY a compact answer key in exactly this format: 1.a,2.b,3.c,4.d. Use lowercase letters. Include exactly one entry for every numbered question from 1 through ${questions.length}. Do not include explanations, markdown, code fences, extra text, or question numbers outside the key.\n\nQUESTIONS:\n${compact}`;
        let text = '';
        let lastError = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            text = await aiRequest(cfg, prompt, false);
            if (String(text || '').trim()) break;
          } catch (err) {
            lastError = err;
            if (attempt < 2) await sleep(900);
          }
        }
        if (!String(text || '').trim()) throw (lastError || new Error('AI returned an empty response.'));
        const normalized = String(text || '').replace(/```[a-z]*|```/gi, ' ').replace(/[\n\r]+/g, ' ');
        const matches = [...normalized.matchAll(/(?:^|[^0-9])(\d+)\s*[.)\-:]?\s*([A-Da-d])(?=\s*(?:,|;|$))/g)];
        const byNumber = new Map();
        for (const m of matches) { const n = Number(m[1]); if (n >= 1 && n <= questions.length && !byNumber.has(n)) byNumber.set(n, m[2].toLowerCase()); }
        if (byNumber.size !== questions.length) {
          const fallback = [...normalized.matchAll(/(\d+)\s*[.)\-:]?\s*([A-Da-d])/g)];
          for (const m of fallback) { const n = Number(m[1]); if (n >= 1 && n <= questions.length && !byNumber.has(n)) byNumber.set(n, m[2].toLowerCase()); }
        }
        if (byNumber.size !== questions.length) throw new Error(`AI returned ${byNumber.size}/${questions.length} answers. Try again.`);
        const key = Array.from({length: questions.length}, (_, i) => `${i + 1}.${byNumber.get(i + 1)}`).join(',');
        sendResponse({ success: true, key, count: byNumber.size });
        return;
      }
      if (message?.type === 'AI_STUDY') { const cfg=await getAIConfig(); const questions=Array.isArray(message.questions)?message.questions:[]; if(!questions.length) throw new Error('No scanned questions available.'); const compact=questions.map((q,i)=>`${i+1}. ${q.question}
${(q.options||[]).map((o,j)=>`${String.fromCharCode(65+j)}. ${o.text}`).join('\n')}`).join('\n\n'); const prompt=`Analyze these scanned study questions. For each question, give the most likely correct option letter and a one-sentence explanation. Return numbered results like 1. C — explanation. This is for study/review; do not describe any browser automation or submission.\n\n${compact}`; const text=await aiRequest(cfg,prompt,false); sendResponse({success:true,text}); return; }
      if (message?.type === 'PING') { sendResponse({ success: true }); return; }
      sendResponse({ success: false, error: 'Unknown message type' });
    } catch (e) {
      sendResponse({ success: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
