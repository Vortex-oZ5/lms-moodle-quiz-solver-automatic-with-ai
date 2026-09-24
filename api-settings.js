const $=id=>document.getElementById(id);
const DEFAULTS={provider:'openai',apiKey:'',endpoint:'',model:''};
const PROVIDERS={openai:{endpoint:'https://api.openai.com/v1/chat/completions',model:'gpt-4o-mini'},gemini:{endpoint:'',model:'gemini-3.8-flash'},anthropic:{endpoint:'https://api.anthropic.com/v1/messages',model:'claude-3-5-haiku-latest'},groq:{endpoint:'https://api.groq.com/openai/v1/chat/completions',model:'llama-3.3-70b-versatile'},openrouter:{endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'openai/gpt-4o-mini'},custom:{endpoint:'',model:''}};
async function load(){
 const d=await chrome.storage.local.get({vortex_ai:DEFAULTS});
 const x={...DEFAULTS,...d.vortex_ai};
 if(x.provider==='gemini' && (!x.model || /^gemini-2\.0/i.test(String(x.model||'')))){x.model='gemini-3.8-flash';await chrome.storage.local.set({vortex_ai:x});}
 $('provider').value=x.provider;$('apiKey').value=x.apiKey;$('endpoint').value=x.endpoint||PROVIDERS[x.provider]?.endpoint||'';$('model').value=x.model||PROVIDERS[x.provider]?.model||'';toggleEndpoint();updateProviderNote();
}
function toggleEndpoint(){$('endpointWrap').style.display=$('provider').value==='gemini'?'none':'block';}
function updateProviderNote(){const notes={openai:'OpenAI API key',gemini:'Google AI Studio / Gemini API key',anthropic:'Anthropic API key',groq:'Groq API key',openrouter:'OpenRouter API key',custom:'Any OpenAI-compatible API key'};const el=$('providerNote');if(el)el.textContent=notes[$('provider').value]||'Provider API key';}

$('provider').addEventListener('change',()=>{const p=PROVIDERS[$('provider').value]||{};$('endpoint').value=p.endpoint||'';$('model').value=p.model||'';toggleEndpoint();updateProviderNote();});
$('show').addEventListener('click',()=>{$('apiKey').type=$('apiKey').type==='password'?'text':'password';$('show').textContent=$('apiKey').type==='password'?'Show':'Hide';});
async function save(){const value={provider:$('provider').value,apiKey:$('apiKey').value.trim(),endpoint:$('endpoint').value.trim(),model:$('model').value.trim()};await chrome.storage.local.set({vortex_ai:value});$('status').textContent='Saved locally.';return value;}
$('save').addEventListener('click',save);
$('test').addEventListener('click',async()=>{const v=await save();$('status').textContent='Testing…';try{const r=await chrome.runtime.sendMessage({type:'AI_TEST_CONNECTION',config:v});$('status').textContent=r?.success?'Connection OK.':`Test failed: ${r?.error||'Unknown error'}`;}catch(e){$('status').textContent=`Test failed: ${e.message}`;}});
load();
