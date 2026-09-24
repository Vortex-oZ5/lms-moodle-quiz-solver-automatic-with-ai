
/* VorteX status notification - additive UI only */
(function initVorteXStatus() {
  const KEY = 'lazybot_vortex_status_notification_v1';
  const mount = async () => {
    if (document.getElementById("lazybot-vortex-status")) return;
    const el = document.createElement("div");
    el.id = "lazybot-vortex-status";
    el.innerHTML = '<span class="vortex-dot"></span><span class="vortex-text"></span><button class="vortex-hide" type="button" aria-label="Dismiss notification">×</button>';
    (document.body || document.documentElement).appendChild(el);
    const text = el.querySelector(".vortex-text");
    const hide = el.querySelector(".vortex-hide");
    let enabled = true;
    try {
      const saved = await chrome.storage.local.get({ [KEY]: true });
      enabled = saved[KEY] !== false;
    } catch {}
    hide.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove("is-visible");
    });
    window.__lazybotVorteXStatus = (message) => {
      if (!enabled) return;
      text.textContent = message;
      el.classList.add("is-visible");
      clearTimeout(window.__lazybotVorteXStatusTimer);
      window.__lazybotVorteXStatusTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
    };
    window.__lazybotVorteXSetNotificationEnabled = async (value) => {
      enabled = !!value;
      try { await chrome.storage.local.set({ [KEY]: enabled }); } catch {}
      if (!enabled) el.classList.remove("is-visible");
    };
    window.__lazybotVorteXGetNotificationEnabled = () => enabled;
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
// Lazy BoT 2.1 — Super Mode only. Local automation: no AI, no API.
(async () => {
  if (window.__LAZYBOT_SUPER_V21__) return;
  window.__LAZYBOT_SUPER_V21__ = true;

  const base = chrome.runtime.getURL('modules/');
  const [{ MCQScanner }, { QuestionParser }, { storageManager }] = await Promise.all([
    import(base + 'scanner.js'),
    import(base + 'parser.js'),
    import(base + 'storage.js')
  ]);

  await storageManager.init();

  const scanner = new MCQScanner();
  const parser = new QuestionParser();
  const SESSION_KEY = 'lazybot_super_session_v2';
  const QUESTIONS_KEY = 'lazybot_super_questions_v2';
  const ANSWERS_KEY = 'lazybot_super_answers_v2';
  const STATS_KEY = 'stats';

  let panel = null;
  let floating = null;
  let running = false;
  let scanVersion = 0;
  let scanCache = null;
  let lastSignature = '';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const POSITION_KEY = 'lazybot_super_float_position_v2';
  const FLOATING_VISIBILITY_KEY = 'lazybot_vortex_floating_button_v1';
  const ANSWER_POPUP_KEY = 'lazybot_vortex_answer_popup_v1';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const hashQuestion = q => parser.hashQuestion({
    question: clean(q.question),
    options: (q.options || []).map(o => clean(typeof o === 'string' ? o : o?.text))
  });

  function normalizeQuestion(q, index = 0) {
    return {
      id: index,
      question: clean(q.question),
      options: (q.options || []).map(o => ({ text: clean(typeof o === 'string' ? o : o?.text) })).filter(o => o.text),
      type: q.type || 'single'
    };
  }

  function fastScan(force = false) {
    if (!force && scanCache && scanCache.version === scanVersion) return scanCache.questions;
    const questions = scanner.scan().filter(q => q?.question && q?.options?.length >= 2);
    scanCache = { version: scanVersion, questions };
    return questions;
  }

  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length))) {
      scanVersion++;
      scanCache = null;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  function getSavedQuestions() {
    return chrome.storage.local.get({ [QUESTIONS_KEY]: [] }).then(x => Array.isArray(x[QUESTIONS_KEY]) ? x[QUESTIONS_KEY] : []);
  }
  function getAnswers() {
    return chrome.storage.local.get({ [ANSWERS_KEY]: {} }).then(x => x[ANSWERS_KEY] || {});
  }
  async function saveQuestions(questions) { await chrome.storage.local.set({ [QUESTIONS_KEY]: questions }); }
  async function saveAnswers(answers) { await chrome.storage.local.set({ [ANSWERS_KEY]: answers }); }
  async function getSession() { return (await chrome.storage.local.get({ [SESSION_KEY]: null }))[SESSION_KEY]; }
  async function getRuntimeTabId() {
    try { const r = await chrome.runtime.sendMessage({ type: 'GET_RUNTIME_TAB_ID' }); return Number.isInteger(r?.tabId) ? r.tabId : null; } catch { return null; }
  }
  async function setSession(patch) {
    const current = (await getSession()) || {};
    await chrome.storage.local.set({ [SESSION_KEY]: { ...current, ...patch, active: true, updatedAt: Date.now() } });
  }
  async function clearSession() { await chrome.storage.local.remove(SESSION_KEY); }

  function getPageIndex() {
    try { return Number.parseInt(new URL(location.href).searchParams.get('page') || '0', 10) || 0; } catch { return 0; }
  }

  function findTargets() {
    const nodes = [...document.querySelectorAll('a.qnbutton, .qnbutton a, a[href*="attempt.php"], a[href*="page="]')];
    const map = new Map();
    for (const el of nodes) {
      const href = el.getAttribute('href');
      if (!href) continue;
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) continue;
        const isAttemptPath = /(?:^|\/)attempt\.php$/i.test(url.pathname);
        const isQuizAttempt = url.searchParams.has('attempt') || isAttemptPath;
        const isCurrentAttemptPagination = /(?:^|\/)attempt\.php$/i.test(new URL(location.href).pathname) && url.pathname === new URL(location.href).pathname && url.searchParams.has('page');
        if (!isQuizAttempt && !isCurrentAttemptPagination) continue;
        const page = Number.parseInt(url.searchParams.get('page') || '', 10);
        const label = `${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`;
        const visible = Number.parseInt(label.match(/\b(\d+)\b/)?.[1] || '', 10);
        const index = Number.isFinite(page) ? page : (Number.isFinite(visible) ? visible - 1 : NaN);
        if (!Number.isFinite(index) || index < 0) continue;
        if (!map.has(index)) map.set(index, { pageIndex: index, pageNumber: index + 1, url: url.href });
      } catch {}
    }
    return [...map.values()].sort((a,b) => a.pageIndex - b.pageIndex);
  }

  function textOf(el) {
    if (!el) return '';
    return clean(`${el.textContent || ''} ${el.value || ''} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`);
  }

  function forbiddenNavigation(el) {
    const s = textOf(el).toLowerCase();
    return /\b(submit|finish|save|check|grade|grading|turn in|hand in|complete|finalize|attempt|end quiz)\b/.test(s);
  }

  function findNext() {
    const selectors = [
      'input[name="next"]', 'button[name="next"]',
      'input[type="submit"][value*="Next" i]', 'button[type="submit"][name*="next" i]',
      'button:not([type="button"])', 'a[role="button"]', '[role="button"]'
    ];
    const candidates = [];
    for (const selector of selectors) {
      try { candidates.push(...document.querySelectorAll(selector)); } catch {}
    }
    for (const el of candidates) {
      if (!(el instanceof HTMLElement) || el.hidden || el.disabled || forbiddenNavigation(el)) continue;
      const s = textOf(el).toLowerCase();
      if (/\b(next|next page|next question|continue|go to next|forward)\b/.test(s)) return el;
    }
    return null;
  }

  function currentSignature() {
    const qs = fastScan(true);
    return qs.map(q => `${clean(q.question).toLowerCase()}::${q.options.map(o => clean(o.text).toLowerCase()).join('|')}`).join('||');
  }

  async function waitForPageChange(before, timeout = 4500) {
    const start = Date.now();
    const oldUrl = location.href;
    while (Date.now() - start < timeout) {
      await sleep(35);
      if (location.href !== oldUrl) return true;
      const now = currentSignature();
      if (now && now !== before) return true;
    }
    return false;
  }

  async function clickNextAndWait(before) {
    const next = findNext();
    if (!next) return false;
    try {
      next.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {}
    // Let native input/change handlers finish before the navigation click.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    if (forbiddenNavigation(next)) return false;
    next.click();
    return await waitForPageChange(before, 4500);
  }

  function findLiveQuestionForSaved(savedQuestion, liveQuestions) {
    const targetHash = hashQuestion(savedQuestion);
    return liveQuestions.find(q => hashQuestion(q) === targetHash) || liveQuestions.find(q => clean(q.question).toLowerCase() === clean(savedQuestion.question).toLowerCase());
  }

  function selectOption(option) {
    const el = option?.element;
    const label = option?.labelElement;
    if (!el) return false;
    try {
      if (el.matches?.('input[type="radio"], input[type="checkbox"]')) {
        if (!el.checked) el.click();
        if (!el.checked && label) label.click();
        return !!el.checked;
      }
      const checked = el.getAttribute?.('aria-checked');
      if (checked !== 'true') el.click();
      if (el.getAttribute?.('aria-checked') === 'true') return true;
      if (label && label !== el) label.click();
      return true;
    } catch { return false; }
  }

  async function applyAnswersToPage(savedQuestions, answers) {
    const live = fastScan(true);
    let selected = 0;
    let matched = 0;
    for (const saved of savedQuestions) {
      const indices = answers[hashQuestion(saved)];
      if (!Array.isArray(indices) || !indices.length) continue;
      const q = findLiveQuestionForSaved(saved, live);
      if (!q) continue;
      matched++;
      for (const index of indices) {
        if (selectOption(q.options?.[index])) selected++;
      }
    }
    return { selected, matched, live: live.length };
  }

  function parseAnswerKey(raw, count) {
    const map = {};
    const input = String(raw || '').trim();
    if (!input) return map;
    const patterns = [
      /(?:^|[\s,;|]+)(\d+)\s*(?:[.):-]|=|=>)\s*([A-Za-z]+)(?=$|[\s,;|]+)/gi,
      /(?:^|[\n\r]+)\s*(\d+)\s*[.)-]\s*([A-Za-z]+)\s*(?=$|[\n\r]+)/gi
    ];
    for (const regex of patterns) {
      let m;
      while ((m = regex.exec(input))) {
        const n = Number(m[1]);
        if (!Number.isFinite(n) || n < 1 || n > count) continue;
        const indices = [];
        for (const ch of m[2].toUpperCase()) {
          const i = ch.charCodeAt(0) - 65;
          if (i >= 0 && i < 26 && !indices.includes(i)) indices.push(i);
        }
        if (indices.length) map[n - 1] = indices;
      }
    }
    return map;
  }

  function buildPack(questions) {
    const body = questions.map((q, i) => {
      const lines = [`${i + 1}. ${q.question}`];
      q.options.forEach((o, j) => lines.push(`   ${String.fromCharCode(65 + j)}. ${o.text}`));
      return lines.join('\n');
    }).join('\n\n');
    return [
      'STUDY ANSWER-KEY PROMPT',
      'Solve the following multiple-choice questions carefully.',
      'Return ONLY the answer key using exactly this format: 1.a,2.b,3.c,4.d',
      'Include every question number exactly once and preserve the original numbering.',
      'Do not add explanations, markdown, or extra text.',
      'Check each question against all of its options before giving the final key.',
      '', body
    ].join('\n');
  }

  function setStatus(text, tone = 'muted') {
    const el = panel?.querySelector('#lb-status');
    if (el) {
      el.textContent = text;
      el.dataset.tone = tone;
    }
    try { window.__lazybotVorteXStatus?.(String(text)); } catch {}
  }

  function updateStats(scanned, solved, mode = 'READY') {
    if (!panel) return;
    const q = panel.querySelector('#lb-q');
    const s = panel.querySelector('#lb-s');
    const m = panel.querySelector('#lb-mode');
    if (q) q.textContent = String(scanned);
    if (s) s.textContent = String(solved);
    if (m) m.textContent = mode;
  }

  async function incrementSolved(count) {
    const data = await chrome.storage.local.get({ [STATS_KEY]: { solved: 0, lastSolve: null } });
    const stats = data[STATS_KEY] || { solved: 0 };
    stats.solved = Number(stats.solved || 0) + count;
    stats.lastSolve = Date.now();
    await chrome.storage.local.set({ [STATS_KEY]: stats });
  }

  async function scanEverything() {
    setStatus('Scanning question pages…', 'active');
    const current = fastScan(true);
    const targets = findTargets();
    if (targets.length <= 1) {
      const normalized = current.map((q, i) => normalizeQuestion(q, i));
      await saveQuestions(normalized);
      setStatus(`Saved ${normalized.length} question${normalized.length === 1 ? '' : 's'}.`, 'ok');
      return normalized;
    }

    const result = await chrome.runtime.sendMessage({ type: 'START_LOCAL_SCAN', targets, currentUrl: location.href, currentQuestions: current.map(q => normalizeQuestion(q)) });
    if (result?.success && result.questions?.length) {
      const normalized = result.questions.map((q, i) => normalizeQuestion(q, i));
      await saveQuestions(normalized);
      const failed = Array.isArray(result.errors) ? result.errors.length : 0;
      setStatus(
        failed
          ? `Fast scan complete · ${normalized.length} questions · ${failed} page${failed === 1 ? '' : 's'} retried/failed`
          : `Fast scan complete · ${normalized.length} questions from ${targets.length} pages`,
        failed ? 'warn' : 'ok'
      );
      return normalized;
    }

    const normalized = current.map((q, i) => normalizeQuestion(q, i));
    await saveQuestions(normalized);
    setStatus(`Saved ${normalized.length} visible question${normalized.length === 1 ? '' : 's'}.`, 'warn');
    return normalized;
  }

  async function startAutoSolve() {
    if (running) return;
    running = true;
    try {
      const runtimeTabId = await getRuntimeTabId();
      const savedQuestions = await getSavedQuestions();
      const answers = await getAnswers();
      if (!savedQuestions.length || !Object.keys(answers).length) {
        setStatus('Paste an answer key first.', 'warn');
        return;
      }
      const answerCount = Object.keys(answers).length;
      if (answerCount < savedQuestions.length) {
        setStatus(`Parsed ${answerCount}/${savedQuestions.length}. Add the remaining answers to continue.`, 'warn');
        return;
      }

      await setSession({ index: 0, url: location.href, total: savedQuestions.length, tabId: runtimeTabId });
      updateStats(savedQuestions.length, 0, 'SOLVING');
      setStatus('Super Mode is solving…', 'active');

      for (let guard = 0; guard < Math.max(50, savedQuestions.length * 3); guard++) {
        const live = fastScan(true);
        if (!live.length) { await sleep(80); continue; }
        const before = currentSignature();
        const result = await applyAnswersToPage(savedQuestions, answers);
        if (result.selected) await incrementSolved(result.selected);

        const session = await getSession();
        const currentPage = getPageIndex();
        const targets = findTargets();
        const nextTarget = targets.find(t => t.pageIndex > currentPage);

        if (!nextTarget && !findNext()) {
          await clearSession();
          updateStats(savedQuestions.length, savedQuestions.length, 'DONE');
          setStatus(`Complete · selected ${result.selected} answer(s). No Finish/Submit action was used.`, 'ok');
          return;
        }

        await setSession({ index: Math.min((session?.index || 0) + 1, savedQuestions.length), url: location.href });
        const changed = await clickNextAndWait(before);
        if (changed) {
          // A normal navigation destroys this context; the new content script resumes from session.
          await sleep(80);
          continue;
        }

        // SPA fallback: if the Next control did not change the DOM, retry once after a short render turn.
        await sleep(70);
        const after = currentSignature();
        if (after === before) {
          setStatus('Waiting for the next question…', 'active');
          await sleep(160);
          if (currentSignature() === before) {
            await clearSession();
            setStatus('Stopped: the quiz did not expose a safe Next/Continue control.', 'warn');
            return;
          }
        }
      }
      await clearSession();
      setStatus('Stopped after reaching the safety limit.', 'warn');
    } finally {
      running = false;
      const remaining = await getSavedQuestions();
      const stored = await getAnswers();
      updateStats(remaining.length, Object.keys(stored).length, 'READY');
    }
  }

  async function resumeIfNeeded() {
    const session = await getSession();
    const answers = await getAnswers();
    const questions = await getSavedQuestions();
    if (!session?.active || !questions.length || !Object.keys(answers).length) return;
    const runtimeTabId = await getRuntimeTabId();
    if (session.tabId != null && runtimeTabId != null && Number(session.tabId) !== Number(runtimeTabId)) return;
    setTimeout(() => startAutoSolve().catch(() => {}), 300);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch {}
      ta.remove(); return ok;
    }
  }

  function closePanel() { panel?.remove(); panel = null; }

  function closeAnswerModal() {
    const el = document.getElementById('lazybot-answer-modal');
    if (el) el.remove();
  }

  function showAIStudyResult(text) {
    const old=document.getElementById('lazybot-ai-result'); if(old) old.remove();
    const el=document.createElement('div'); el.id='lazybot-ai-result';
    el.innerHTML=`<div class="lb-ai-card"><div class="lb-ai-head"><b>AI STUDY RESULTS</b><button id="lb-ai-close">×</button></div><pre id="lb-ai-text"></pre><div class="lb-ai-foot">Review the suggestions before using them.</div></div>`;
    document.body.appendChild(el); el.querySelector('#lb-ai-text').textContent=String(text||''); el.querySelector('#lb-ai-close').addEventListener('click',()=>el.remove());
  }

  async function openAnswerModal() {
    try { const pref = await chrome.storage.local.get({ [ANSWER_POPUP_KEY]: true }); if (pref[ANSWER_POPUP_KEY] === false) return; } catch {}
    closePanel();
    const questions = await getSavedQuestions();
    if (!questions.length) return;
    closeAnswerModal();
    const modal = document.createElement('div');
    modal.id = 'lazybot-answer-modal';
    modal.innerHTML = `
      <div class="lb-answer-card" role="dialog" aria-modal="true" aria-label="Answer key">
        <div class="lb-answer-head"><div class="lb-answer-title"><span class="lb-drag-grip" title="Drag">⠿</span><div><b>ANSWER KEY</b><small>${questions.length} questions scanned</small></div></div><div class="lb-answer-head-actions"><button id="lb-answer-menu" type="button" title="Show menu">☰</button><button id="lb-answer-ai" type="button" title="AI Solve">AI</button><button id="lb-answer-copy" type="button" title="Copy questions">⧉</button><button id="lb-answer-close" type="button" title="Close">×</button></div></div>
        <textarea id="lb-answer-modal-input" spellcheck="false" autocomplete="off" placeholder="Paste: 1.a, 2.b, 3.c, 4.d"></textarea>
        <div class="lb-answer-status" id="lb-answer-modal-status">Paste the complete key to start automation.</div>
      </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#lb-answer-modal-input');
    const status = modal.querySelector('#lb-answer-modal-status');
    modal.querySelector('#lb-answer-close').addEventListener('click', closeAnswerModal);
    modal.querySelector('#lb-answer-menu').addEventListener('click', async () => { closeAnswerModal(); await openSuperMode(); });
    modal.querySelector('#lb-answer-copy').addEventListener('click', async () => { const qs = await getSavedQuestions(); const ok = await copyText(buildPack(qs)); status.textContent = ok ? 'Questions copied.' : 'Clipboard blocked.'; });
    modal.querySelector('#lb-answer-ai').addEventListener('click', async () => {
      const qs=await getSavedQuestions();
      const btn=modal.querySelector('#lb-answer-ai');
      if(!qs.length){ status.textContent='No scanned questions available.'; return; }
      btn.disabled=true;
      let lastError=null;
      for(let attempt=1; attempt<=2; attempt++){
        status.textContent=attempt===1 ? `AI is analyzing ${qs.length} questions…` : 'First request did not complete · retrying…';
        try {
          const r=await chrome.runtime.sendMessage({type:'AI_ANSWER_KEY',questions:qs});
          if(!r?.success) throw new Error(r?.error||'AI request failed');
          const key=String(r.key||'').trim();
          if(!key) throw new Error('AI returned an empty answer key.');
          const parsed=parseAnswerKey(key, qs.length);
          if(Object.keys(parsed).length!==qs.length) throw new Error(`AI returned an incomplete key (${Object.keys(parsed).length}/${qs.length}).`);
          input.value=key;
          input.dispatchEvent(new Event('input',{bubbles:true}));
          status.textContent=`AI answer key inserted · ${r.count||qs.length}/${qs.length}`;
          btn.disabled=false;
          return;
        } catch(e){
          lastError=e;
          if(attempt<2) await new Promise(resolve=>setTimeout(resolve,900));
        }
      }
      status.textContent=`AI failed after 2 attempts: ${lastError?.message||'Unknown error'}`;
      btn.disabled=false;
    });
    let timer = null;
    const process = async () => {
      const qs = await getSavedQuestions();
      const parsed = parseAnswerKey(input.value, qs.length);
      const count = Object.keys(parsed).length;
      if (!count) return;
      status.textContent = `Parsed ${count}/${qs.length}`;
      if (count < qs.length) return;
      const answersByHash = {};
      for (const [index, indices] of Object.entries(parsed)) {
        const q = qs[Number(index)];
        if (q) answersByHash[hashQuestion(q)] = indices;
      }
      await saveAnswers(answersByHash);
      status.textContent = 'Key complete · starting…';
      updateStats(qs.length, count, 'SOLVING');
      setTimeout(async () => {
        closeAnswerModal();
        try { await startAutoSolve(); } catch (error) { console.error('[Lazy BoT] solve failed:', error); }
      }, 80);
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(process, 60);
    });

    // Draggable answer-key popup; position is persisted per browser profile.
    const POS_KEY = 'lazybot_vortex_answer_popup_position_v1';
    const card = modal.querySelector('.lb-answer-card');
    const head = modal.querySelector('.lb-answer-head');
    const place = (x, y, save=false) => {
      const maxX=Math.max(8,innerWidth-card.offsetWidth-8), maxY=Math.max(8,innerHeight-card.offsetHeight-8);
      const nx=Math.max(8,Math.min(maxX,Number(x)||8)), ny=Math.max(8,Math.min(maxY,Number(y)||8));
      card.style.position='fixed'; card.style.left=nx+'px'; card.style.top=ny+'px'; card.style.transform='none';
      if(save) chrome.storage.local.set({[POS_KEY]:{x:nx,y:ny}}).catch(()=>{});
    };
    try { const d=await chrome.storage.local.get({[POS_KEY]:null}); if(d[POS_KEY]) place(d[POS_KEY].x,d[POS_KEY].y); } catch {}
    let drag=false,dx=0,dy=0;
    head.style.cursor='move';
    head.addEventListener('pointerdown',e=>{ if(e.target.closest('button,textarea')) return; drag=true; const r=card.getBoundingClientRect(); dx=e.clientX-r.left; dy=e.clientY-r.top; head.setPointerCapture?.(e.pointerId); });
    head.addEventListener('pointermove',e=>{ if(!drag) return; place(e.clientX-dx,e.clientY-dy); });
    head.addEventListener('pointerup',e=>{ if(!drag) return; drag=false; const r=card.getBoundingClientRect(); place(r.left,r.top,true); });
    window.addEventListener('resize',()=>{ if(card.isConnected){ const r=card.getBoundingClientRect(); place(r.left,r.top); } },{passive:true});
    input.focus();
  }

  async function openSuperMode() {
    if (panel) { panel.querySelector('#lb-answer')?.focus(); return; }
    panel = document.createElement('section');
    panel.id = 'lazybot-super-panel';
    panel.innerHTML = `
      <div class="lb-head">
        <div class="lb-brand"><img class="lb-logo-img" src="${chrome.runtime.getURL('assets/icon48.png')}" alt="Vortex"><div><b>SUPER MODE</b><small>VORTEX • LOCAL</small></div></div>
        <div class="lb-head-actions">
          <button id="lb-menu" class="lb-menu" type="button" aria-label="Open menu" aria-expanded="false">☰</button>
          <button id="lb-close" class="lb-x" type="button" aria-label="Close">×</button>
        </div>
        <div id="lb-menu-popover" class="lb-menu-popover" hidden>
          <label class="lb-toggle-row">
            <span><b>Status notifications</b><small>Show scanning / solving at top center</small></span>
            <input id="lb-notification-toggle" type="checkbox">
            <i class="lb-switch"></i>
          </label>
          <label class="lb-toggle-row">
            <span><b>Floating button</b><small>Show or hide the draggable scan button</small></span>
            <input id="lb-floating-toggle" type="checkbox">
            <i class="lb-switch"></i>
          </label>
          <label class="lb-toggle-row">
            <span><b>Answer-key popup</b><small>Show centered popup after scanning</small></span>
            <input id="lb-answer-popup-toggle" type="checkbox">
            <i class="lb-switch"></i>
          </label>
          <label class="lb-toggle-row">
            <span><b>Background mode</b><small>Resume on the same quiz in another tab</small></span>
            <input id="lb-background-toggle" type="checkbox"><i class="lb-switch"></i>
          </label>
          <button id="lb-api-settings" class="lb-menu-link lb-api-link" type="button"><span class="lb-api-icon">✦</span><span class="lb-api-copy"><b>AI API Settings</b><small>Provider, key &amp; model</small></span><strong>↗</strong></button>
        </div>
      </div>
      <div class="lb-statusbar"><span class="lb-live"></span><span id="lb-status">Ready to scan.</span></div>
      <div class="lb-metrics"><div><small>SCANNED</small><strong id="lb-q">0</strong></div><div><small>SAVED</small><strong id="lb-s">0</strong></div><div><small>STATE</small><strong id="lb-mode">READY</strong></div></div>
      <div class="lb-actions"><button id="lb-scan" class="lb-primary" type="button">Scan</button><button id="lb-copy" class="lb-secondary" type="button">Copy</button><button id="lb-clear" class="lb-danger" type="button">Clear</button></div>
      <label class="lb-label" for="lb-answer">ANSWER KEY</label>
      <textarea id="lb-answer" class="lb-input" spellcheck="false" autocomplete="off" placeholder="Paste: 1.a,2.b,3.c,4.d"></textarea>
      <div class="lb-hint">Paste a complete key like <b>1.c, 2.b, 3.d</b>. The preserved Super Mode automation applies the key page-by-page and never clicks Finish/Submit.</div>
      <div class="lb-foot"><span>Created by <b>Vortex</b></span><span>PRIVATE • LOCAL</span></div>
    `;
    document.body.appendChild(panel);
    const saved = await getSavedQuestions();
    const answers = await getAnswers();
    const current = fastScan(false);
    updateStats(saved.length || current.length, Object.keys(answers).length, 'READY');
    if (saved.length) setStatus(`${saved.length} saved question${saved.length === 1 ? '' : 's'} ready.`, 'ok');

    panel.querySelector('#lb-close').addEventListener('click', closePanel);

    const menu = panel.querySelector('#lb-menu');
    const popover = panel.querySelector('#lb-menu-popover');
    const toggle = panel.querySelector('#lb-notification-toggle');
    const floatingToggle = panel.querySelector('#lb-floating-toggle');
    const answerPopupToggle = panel.querySelector('#lb-answer-popup-toggle');
    const backgroundToggle = panel.querySelector('#lb-background-toggle');
    panel.querySelector('#lb-api-settings').addEventListener('click',()=>chrome.runtime.sendMessage({type:'OPEN_AI_SETTINGS'}));
    try { const bg=await chrome.storage.local.get({vortex_background_mode:true}); backgroundToggle.checked=bg.vortex_background_mode!==false; } catch { backgroundToggle.checked=true; }
    backgroundToggle.addEventListener('change',()=>chrome.storage.local.set({vortex_background_mode:backgroundToggle.checked}));
    try { toggle.checked = window.__lazybotVorteXGetNotificationEnabled?.() !== false; } catch { toggle.checked = true; }
    try {
      const savedFloat = await chrome.storage.local.get({ [FLOATING_VISIBILITY_KEY]: true });
      floatingToggle.checked = savedFloat[FLOATING_VISIBILITY_KEY] !== false;
    } catch { floatingToggle.checked = true; }
    try { const savedPopup = await chrome.storage.local.get({ [ANSWER_POPUP_KEY]: true }); answerPopupToggle.checked = savedPopup[ANSWER_POPUP_KEY] !== false; } catch { answerPopupToggle.checked = true; }

    menu.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const open = !popover.hidden;
      popover.hidden = open;
      menu.setAttribute('aria-expanded', String(!open));
    });
    toggle.addEventListener('change', async () => {
      await window.__lazybotVorteXSetNotificationEnabled?.(toggle.checked);
    });
    answerPopupToggle.addEventListener('change', async () => { await chrome.storage.local.set({ [ANSWER_POPUP_KEY]: answerPopupToggle.checked }); if (!answerPopupToggle.checked) closeAnswerModal(); });
    floatingToggle.addEventListener('change', async () => {
      const enabled = floatingToggle.checked;
      await chrome.storage.local.set({ [FLOATING_VISIBILITY_KEY]: enabled });
      if (enabled) {
        createFloating();
      } else if (floating) {
        floating.remove();
        floating = null;
      }
    });
    panel.addEventListener('click', (e) => {
      if (!e.target.closest('#lb-menu') && !e.target.closest('#lb-menu-popover')) {
        popover.hidden = true;
        menu.setAttribute('aria-expanded', 'false');
      }
    });

    panel.querySelector('#lb-scan').addEventListener('click', async () => {
      if (running) return;
      const btn = panel.querySelector('#lb-scan'); btn.disabled = true; btn.textContent = '…';
      try { const qs = await scanEverything(); updateStats(qs.length, Object.keys(await getAnswers()).length, 'READY'); if (qs.length) setTimeout(openAnswerModal, 80); }
      catch (e) { setStatus(`Scan failed: ${e?.message || e}`, 'warn'); }
      finally { btn.disabled = false; btn.textContent = 'Scan'; }
    });
    panel.querySelector('#lb-copy').addEventListener('click', async () => {
      let qs = await getSavedQuestions();
      if (!qs.length) qs = await scanEverything();
      const ok = await copyText(buildPack(qs));
      setStatus(ok ? `Improved study prompt copied · ${qs.length} questions.` : 'Clipboard blocked.', ok ? 'ok' : 'warn');
    });
    panel.querySelector('#lb-clear').addEventListener('click', async () => {
      await saveQuestions([]); await saveAnswers({}); await clearSession();
      panel.querySelector('#lb-answer').value = '';
      updateStats(0, 0, 'READY'); setStatus('Local data cleared.', 'ok');
    });

    const input = panel.querySelector('#lb-answer');
    let pasteTimer = null;
    input.addEventListener('input', () => {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(async () => {
        const qs = await getSavedQuestions();
        const parsed = parseAnswerKey(input.value, qs.length);
        if (!Object.keys(parsed).length) return;
        const answersByHash = {};
        Object.entries(parsed).forEach(([index, indices]) => {
          const q = qs[Number(index)]; if (q) answersByHash[hashQuestion(q)] = indices;
        });
        await saveAnswers(answersByHash);
        updateStats(qs.length, Object.keys(answersByHash).length, 'READY');
        setStatus(`Key parsed · ${Object.keys(answersByHash).length}/${qs.length}.`, 'ok');
        closeAnswerModal();
      }, 180);
    });
    input.focus();
  }

  async function clearAfterUserFinish() {
    await saveQuestions([]);
    await saveAnswers({});
    await clearSession();
    if (panel) {
      const answer = panel.querySelector('#lb-answer');
      if (answer) answer.value = '';
      updateStats(0, 0, 'READY');
      setStatus('Finished attempt · local questions cleared.', 'ok');
    }
  }

  function isFinishControl(el) {
    if (!(el instanceof HTMLElement)) return false;
    const s = textOf(el).toLowerCase();
    return /\b(finish|finish attempt|submit all|submit quiz|turn in|hand in|complete attempt|end attempt)\b/.test(s);
  }

  function installFinishCleanup() {
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button,input[type="submit"],a,[role="button"]') : null;
      if (target && isFinishControl(target)) {
        setTimeout(() => { clearAfterUserFinish().catch(() => {}); }, 700);
      }
    }, true);
  }

  async function createFloating() {
    if (floating || !document.body) return;
    try {
      const saved = await chrome.storage.local.get({ [FLOATING_VISIBILITY_KEY]: true });
      if (saved[FLOATING_VISIBILITY_KEY] === false) return;
    } catch {}
    if (floating || !document.body) return;
    floating = document.createElement('button');
    floating.id = 'lazybot-super-scan';
    floating.type = 'button';
    floating.innerHTML = '<img class="lb-f-icon" src="' + chrome.runtime.getURL('assets/icon48.png') + '" alt="Scan">';
    floating.title = 'Lazy BoT — Super Mode scan';
    floating.setAttribute('aria-label', 'Scan with Super Mode');
    floating.style.setProperty('left', Math.max(8, window.innerWidth - 74) + 'px', 'important');
    floating.style.setProperty('top', Math.max(8, window.innerHeight - 74) + 'px', 'important');

    let dragging = false, moved = false, pointerId = null;
    let offsetX = 0, offsetY = 0;

    const applyPosition = (pos, save = false) => {
      const maxX = Math.max(8, window.innerWidth - 64);
      const maxY = Math.max(8, window.innerHeight - 64);
      const x = Math.max(8, Math.min(maxX, Number(pos?.x) || maxX));
      const y = Math.max(8, Math.min(maxY, Number(pos?.y) || maxY));
      floating.style.setProperty('left', x + 'px', 'important');
      floating.style.setProperty('top', y + 'px', 'important');
      floating.style.setProperty('right', 'auto', 'important');
      floating.style.setProperty('bottom', 'auto', 'important');
      if (save) chrome.storage.local.set({ [POSITION_KEY]: { x, y } }).catch(() => {});
    };

    chrome.storage.local.get({ [POSITION_KEY]: null }).then(data => {
      const pos = data[POSITION_KEY];
      // Existing saved positions are respected; otherwise start bottom-right.
      applyPosition(pos && Number.isFinite(Number(pos.x)) && Number.isFinite(Number(pos.y))
        ? pos : { x: window.innerWidth - 74, y: window.innerHeight - 74 });
    }).catch(() => applyPosition({ x: window.innerWidth - 74, y: window.innerHeight - 74 }));

    const stopDrag = (e) => {
      if (!dragging || (pointerId !== null && e.pointerId !== pointerId)) return;
      dragging = false;
      floating.classList.remove('is-dragging');
      try { floating.releasePointerCapture?.(pointerId); } catch {}
      const r = floating.getBoundingClientRect();
      applyPosition({ x: r.left, y: r.top }, true);
      pointerId = null;
    };

    floating.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      const r = floating.getBoundingClientRect();
      offsetX = e.clientX - r.left;
      offsetY = e.clientY - r.top;
      try { floating.setPointerCapture?.(pointerId); } catch {}
      floating.classList.add('is-dragging');
    }, { passive: false });

    floating.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      e.preventDefault();
      const nx = e.clientX - offsetX;
      const ny = e.clientY - offsetY;
      if (Math.abs(nx - floating.getBoundingClientRect().left) > 2 ||
          Math.abs(ny - floating.getBoundingClientRect().top) > 2) moved = true;
      applyPosition({ x: nx, y: ny });
    }, { passive: false });

    floating.addEventListener('pointerup', stopDrag);
    floating.addEventListener('pointercancel', stopDrag);
    floating.addEventListener('lostpointercapture', e => { if (dragging) stopDrag(e); });

    floating.addEventListener('click', async e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      if (running) return;
      try {
        // Floating button is a direct SCAN action. It must never open the
        // Super Mode menu/panel. Once scanning finishes, show only the
        // Answer Key popup (when enabled).
        e.preventDefault();
        e.stopPropagation();
        if (panel) closePanel();
        if (typeof closeAnswerModal === 'function') closeAnswerModal();

        const qs = await scanEverything();
        const savedPopup = await chrome.storage.local.get({ [ANSWER_POPUP_KEY]: true });
        if (qs.length && savedPopup[ANSWER_POPUP_KEY] !== false) {
          setTimeout(() => openAnswerModal().catch(() => {}), 80);
        }
      } catch (error) {
        console.error('[Vortex] floating scan failed:', error);
      }
    });

    window.addEventListener('resize', () => {
      if (!floating) return;
      const r = floating.getBoundingClientRect();
      applyPosition({ x: r.left, y: r.top });
    }, { passive: true });

    document.body.appendChild(floating);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'OPEN_SUPER_MODE' || message?.type === 'TRIGGER_SOLVE') {
      openSuperMode().then(() => sendResponse({ success: true })).catch(e => sendResponse({ success: false, error: e.message }));
      return true;
    }
    if (message?.type === 'STOP_SUPER_MODE') {
      clearSession().then(() => { running = false; sendResponse({ success: true }); });
      return true;
    }
    if (message?.type === 'GET_PAGE_INFO') {
      const qs = fastScan(true); sendResponse({ count: qs.length, lms: location.hostname }); return true;
    }
    if (message?.type === 'PING_LOCAL_SCAN') {
      sendResponse({ success: true, ready: true, url: location.href });
      return true;
    }
    if (message?.type === 'SCAN_CURRENT_LOCAL') {
      const qs = fastScan(true).map((q, i) => normalizeQuestion(q, i));
      sendResponse({ success: true, questions: qs }); return true;
    }
    if (message?.type === 'START_LOCAL_SCAN') {
      chrome.runtime.sendMessage({ type: 'START_LOCAL_SCAN', targets: message.targets || [] }).then(sendResponse).catch(e => sendResponse({ success:false, error:e.message }));
      return true;
    }
  });

  // The button is injected only once and never installs document key handlers.
  const boot = () => { createFloating().catch(() => {}); installFinishCleanup(); resumeIfNeeded(); };
  if (document.body) boot(); else new MutationObserver((_, obs) => { if (document.body) { obs.disconnect(); boot(); } }).observe(document.documentElement, { childList: true });
})();
