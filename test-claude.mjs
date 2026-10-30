import assert from 'node:assert/strict';
import { requestClaude } from './claude-api.mjs';
const args = { config:{effort:'max',max_tokens:16384},model:'claude-opus-5-5',prompt:'Evidence packet',key:'test-secret' };
const payload = {stop_reason:'end_turn',model:'claude-opus-5-5',usage:{input_tokens:12,output_tokens:20},content:[{type:'thinking',thinking:'private'},{type:'text',text:'Agreed café'}]};
let calls=0;
const reply=await requestClaude({...args,fetchImpl:async(url,options)=>{
 calls++; assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(options.redirect,'error');
 const body=JSON.parse(options.body);assert.equal(body.output_config.effort,'max');assert.equal(body.max_tokens,16384);assert(!body.tools);assert(!options.body.includes(args.key));
 const bytes=Buffer.from(JSON.stringify(payload));
 return new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}}));
}});
assert.equal(reply.text,'Agreed café');assert(!JSON.stringify(reply).includes('private'));assert.equal(reply.usage.output_tokens,20);assert.equal(calls,1);
for(const status of [401,429,500]) {
 let attempts=0;
 await assert.rejects(requestClaude({...args,fetchImpl:async()=>{attempts++;return new Response('test-secret',{status});}}),e=>e.message.includes(`HTTP ${status}`)&&!e.message.includes(args.key));
 assert.equal(attempts,1);
}
for(const stop_reason of ['max_tokens','tool_use','refusal'])await assert.rejects(requestClaude({...args,fetchImpl:async()=>Response.json({...payload,stop_reason})}),/no complete reply/);
await assert.rejects(requestClaude({...args,key:'',fetchImpl:()=>{throw Error('must not call');}}),/missing or malformed/);
await assert.rejects(requestClaude({...args,fetchImpl:async()=>new Response('x'.repeat(2_000_001))}),/exceeded 2 MB/);
console.log('PASS: Claude request schema, UTF-8 streaming boundaries, usage, thinking exclusion, redacted errors, no retries, incomplete replies, missing key, response cap.');
