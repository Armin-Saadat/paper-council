import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
export const DEFAULTS = { gemini: { binary: 'bin/agy', model: 'gemini-4-argon-high' }, grok: { binary: 'runtime/grok', model: 'grok-4.7', effort: 'xhigh' }, claude: { model: 'claude-opus-5-5', effort: 'max', max_tokens: 16384, key_file: 'state/claude-api-key' } };
export async function agentConfig(root) {
  let local = {};
  try { local = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  return Object.fromEntries(Object.entries(DEFAULTS).map(([p,c])=>[p,{...c,...local[p]}]));
}
export async function runAgent({ root, cwd, provider, prompt, model, onChild = ()=>{}, timeoutMs = 300000 }) {
  const config = (await agentConfig(root))[provider];
  if (!config) throw Error('Unknown provider');
  const requestedModel = model || config.model;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(requestedModel)) throw Error('Invalid model ID');
  if (provider === 'gemini' && !requestedModel.startsWith('gemini-')) throw Error('Select a Gemini model for the Gemini participant');
  const binary = provider === 'claude' ? process.execPath : path.resolve(root, config.binary);
  await mkdir(cwd,{recursive:true,mode:0o700});
  await writeFile(path.join(cwd,'request.txt'),prompt,{mode:0o600});
  const args = provider === 'claude' ? [path.join(root,'claude-api.mjs'),requestedModel,path.join(cwd,'request.txt')] : provider === 'gemini'
    ? ['--model',requestedModel,'--disable-slash-commands','--output-format','text']
    : ['--prompt-file',path.join(cwd,'request.txt'),'--model',requestedModel,'--output-format','json','--tools','','--deny','*','--permission-mode','dontAsk','--no-subagents','--no-plan','--disable-web-search','--max-turns','1'];
  if (provider === 'grok' && config.effort) {
    if (!['low','medium','high','xhigh'].includes(config.effort)) throw Error('Invalid Grok reasoning effort');
    args.push('--reasoning-effort', config.effort);
  }
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}` };
  for (const k of ['ANTHROPIC_API_KEY','CLAUDE_API_KEY','ANTHROPIC_AUTH_TOKEN','GEMINI_API_KEY','GOOGLE_API_KEY','XAI_API_KEY','OPENAI_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_GENAI_USE_VERTEXAI','GOOGLE_GENAI_USE_GCA']) delete env[k];
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe']});
    onChild(child);
    let stdout='',stderr='',failure,spawnError;
    const stop=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
    const timer=setTimeout(()=>{failure='Agent timed out after five minutes';stop();},timeoutMs);
    child.stdout.on('data',chunk=>{if(stdout.length+chunk.length>2_000_000){failure='Agent output exceeded 2 MB';stop();}else stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-8000);});
    child.on('error',e=>{spawnError=e;});
    child.stdin.on('error',()=>{});
    child.stdin.end(provider==='gemini'?prompt:undefined);
    child.on('close',code=>{
      clearTimeout(timer); onChild(null);
      if(failure || spawnError || code!==0) return reject(Error(failure || spawnError?.message || `Agent exited ${code}: ${stderr}`));
      let text=stdout.trim(),usage,reportedModel;
      if(provider==='grok' || provider==='claude') {
        let data;try{data=JSON.parse(stdout);}catch{return reject(Error(`${provider} returned invalid JSON`));}
        if(data.error || data.is_error) return reject(Error(`${provider} reported an error`));
        if(data.stopReason && data.stopReason!=='end_turn') return reject(Error(`${provider} stopped early: ${data.stopReason}`));
        text=data.text ?? data.response ?? data.result;
        if(typeof text!=='string') return reject(Error(`${provider} returned no text response`));
        usage=data.usage;reportedModel=data.modelUsage?Object.keys(data.modelUsage):undefined;
      }
      if(!text?.trim()) return reject(Error(`Agent returned no text. ${stderr}`));
      // Headless agy can deny a tool and still exit zero. Do not treat such a turn as complete.
      if(provider==='gemini' && /(?:tool.*(?:denied|not permitted)|permission denied|requires approval)/i.test(stderr)) return reject(Error('Gemini attempted a denied tool; no complete reply accepted'));
      resolve({provider,response:text.trim(),requested_model:requestedModel,requested_effort:['grok','claude'].includes(provider)?config.effort:undefined,reported_models:reportedModel,usage,model_provenance:provider==='claude'?'Model reported by the Claude API response.':'CLI model requested; provider routing is not independently attested.'});
    });
  });
}
