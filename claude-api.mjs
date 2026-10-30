import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The parent owns timeouts/cancellation by terminating this dedicated process.
// Never print the credential, request headers, raw API errors, or thinking blocks.
export async function requestClaude({ config, model, prompt, key, fetchImpl = fetch }) {
  if (!/^claude-[a-zA-Z0-9._-]+$/.test(model)) throw Error('Invalid Claude model');
  if (!['low','medium','high','max'].includes(config.effort)) throw Error('Invalid Claude effort');
  if (!Number.isInteger(config.max_tokens) || config.max_tokens < 1 || config.max_tokens > 32768) throw Error('Claude max_tokens must be 1–32768');
  if (!key || /\s/.test(key)) throw Error('Claude API key is missing or malformed; save only the key in the configured private file');
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(290000),
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: config.max_tokens,
      thinking: { type: 'adaptive' }, output_config: { effort: config.effort },
      messages: [{ role: 'user', content: prompt }] })
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(`Claude API HTTP ${response.status}; check credentials, model access, balance or rate limits. No retry was made.`);
  }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > 2_000_000) throw Error('Claude API response exceeded 2 MB');
    chunks.push(Buffer.from(chunk));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (data.stop_reason !== 'end_turn') throw Error(`Claude did not finish normally (${['max_tokens','tool_use','refusal','pause_turn','stop_sequence'].includes(data.stop_reason)?data.stop_reason:'unexpected stop'}); no complete reply accepted`);
  if (!Array.isArray(data.content) || data.content.some(b=>!['text','thinking','redacted_thinking'].includes(b.type))) throw Error('Claude returned unsupported content');
  const text = data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
  if (!text) throw Error('Claude returned no text response');
  return { text, stopReason: 'end_turn', usage: data.usage, modelUsage: { [data.model || model]: {} } };
}

async function main() {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const { agentConfig } = await import('./agents.mjs');
  const config = (await agentConfig(root)).claude;
  const keyPath = path.resolve(root, config.key_file);
  const info = await stat(keyPath);
  if (!info.isFile() || (info.mode & 0o077)) throw Error('Claude key file must be a private file (chmod 600)');
  const key = (await readFile(keyPath,'utf8')).trim();
  const prompt = await readFile(process.argv[3],'utf8');
  const reply = await requestClaude({config,model:process.argv[2],prompt,key});
  process.stdout.write(JSON.stringify(reply));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    // Only our deliberately safe messages cross the process boundary.
    const message = /^(Claude |Invalid Claude)/.test(error.message) ? error.message : 'Claude API request failed; check connectivity and the private key file. No retry was made.';
    process.stderr.write(message); process.exitCode = 1;
  });
}
