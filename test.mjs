import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtemp,mkdir,copyFile,symlink,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),tmp=await mkdtemp(path.join(os.tmpdir(),'paper-council-test-'));let c;
const mock=`#!${process.execPath}
const fs=require('fs');const p=require('path');const gem=p.basename(process.argv[1])==='agy';
if(process.env.GEMINI_API_KEY||process.env.XAI_API_KEY||process.env.ANTHROPIC_API_KEY)process.exit(9);
const args=process.argv.slice(2);let input='';
if(!gem && args[args.indexOf('--reasoning-effort')+1]!=='xhigh')process.exit(8);
function reply(){if(gem && input.includes('FAIL_GEMINI')){process.stderr.write('mock denied');process.exit(3);}const out='Reply from '+(gem?'gemini':'grok');setTimeout(()=>{process.stdout.write(gem?out:JSON.stringify({text:out,stopReason:'end_turn'}));},input.includes('SLOW_TEST')?2000:100);}
if(gem){process.stdin.on('data',d=>input+=d);process.stdin.on('end',reply);}else{input=fs.readFileSync(args[args.indexOf('--prompt-file')+1],'utf8');reply();}
`;
try{
 for(const name of ['server.mjs','agents.mjs'])await copyFile(path.join(root,name),path.join(tmp,name));
 await writeFile(path.join(tmp,'claude-api.mjs'),`import {readFile} from 'node:fs/promises'; if(process.env.ANTHROPIC_API_KEY)process.exit(9); const prompt=await readFile(process.argv[3],'utf8');setTimeout(()=>process.stdout.write(JSON.stringify({text:'Reply from claude',stopReason:'end_turn',usage:{output_tokens:5},modelUsage:{'claude-opus-5-5':{}}})),prompt.includes('SLOW_TEST')?2000:100);`);
 await symlink(path.join(root,'node_modules'),path.join(tmp,'node_modules'));await mkdir(path.join(tmp,'runtime'));
 for(const name of ['grok','agy'])await writeFile(path.join(tmp,'runtime',name),mock,{mode:0o755});
 await writeFile(path.join(tmp,'config.json'),JSON.stringify({gemini:{binary:'runtime/agy'}}));
 c=new Client({name:'test',version:'1'});await c.connect(new StdioClientTransport({command:process.execPath,args:[path.join(tmp,'server.mjs')],env:{...process.env,GEMINI_API_KEY:'must-not-pass',XAI_API_KEY:'must-not-pass',ANTHROPIC_API_KEY:'must-not-pass'}}));
 const call=async(name,args={})=>{const r=await c.callTool({name,arguments:args});let data;try{data=JSON.parse(r.content[0].text);}catch{data={error:r.content[0].text};}return {error:!!r.isError,data};};
 const wait=async id=>{for(let n=0;n<100;n++){const j=(await call('get_result',{id})).data;if(j.status!=='running')return j;await new Promise(r=>setTimeout(r,40));}throw Error('job hung');};
 assert.equal((await c.listTools()).tools.length,10);
 assert.equal((await call('get_session',{session_id:'../../bad'})).error,true);
 const s=(await call('create_session',{title:'Test paper',brief:'Test question',sources:'Source S1',manuscript:'Draft zero'})).data;
 await call('post_message',{session_id:s.id,message:'Codex position'});
 const round=(await call('run_round',{session_id:s.id,prompt:'Critique the claim',phase:'critique'})).data;
 assert(round.id);
 assert.equal((await call('post_message',{session_id:s.id,message:'Conflicting mutation'})).error,true);
 const j=await wait(round.id);assert.equal(j.status,'completed');assert.equal(j.responses.length,2);
 const sess=(await call('get_session',{session_id:s.id})).data;assert.equal(sess.messages.length,4);assert.deepEqual(sess.messages.slice(-2).map(m=>m.author),['gemini','grok']);
 const reqA=await readFile(path.join(tmp,'state',round.id,'gemini/request.txt'),'utf8');const reqB=await readFile(path.join(tmp,'state',round.id,'grok/request.txt'),'utf8');assert.equal(reqA,reqB);assert(reqA.includes('Codex position'));assert(reqA.includes('Source S1'));
 const r2=(await call('run_round',{session_id:s.id,prompt:'Rebut the other author',phase:'rebuttal'})).data;assert.equal((await wait(r2.id)).status,'completed');
 const second=await readFile(path.join(tmp,'state',r2.id,'gemini/request.txt'),'utf8');assert(second.includes('Reply from grok'));assert(second.includes('Reply from gemini'));
 assert.equal((await call('save_draft',{session_id:s.id,expected_revision:0,manuscript:'Integrated draft',change_note:'Integrated critique'})).data.revision,1);
 assert.equal((await call('save_draft',{session_id:s.id,expected_revision:0,manuscript:'Stale',change_note:'bad'})).error,true);
 assert.equal(JSON.parse(await readFile(path.join(tmp,'state/sessions',s.id,'draft-0.json'),'utf8')).manuscript,'Draft zero');
 const partial=(await call('run_round',{session_id:s.id,prompt:'FAIL_GEMINI',phase:'discuss'})).data;assert.equal((await wait(partial.id)).status,'partial');
 const lone=(await call('ask_model',{provider:'grok',prompt:'SLOW_TEST'})).data;
 await call('cancel_job',{id:lone.id});assert.equal((await wait(lone.id)).status,'cancelled');
 const s4=(await call('create_session',{title:'Four participants',brief:'Fresh evidence'})).data;
 const four=(await call('run_round',{session_id:s4.id,prompt:'All three external participants',participants:['gemini','grok','claude']})).data;
 const fourResult=await wait(four.id);assert.equal(fourResult.status,'completed');assert.equal(fourResult.responses.length,3);
 const packets=await Promise.all(['gemini','grok','claude'].map(p=>readFile(path.join(tmp,'state',four.id,p,'request.txt'),'utf8')));assert.equal(packets[0],packets[1]);assert.equal(packets[1],packets[2]);
 assert.equal((await call('get_session',{session_id:s4.id})).data.messages.at(-1).author,'claude');
 const stopClaude=(await call('ask_model',{provider:'claude',prompt:'SLOW_TEST'})).data;await call('cancel_job',{id:stopClaude.id});assert.equal((await wait(stopClaude.id)).status,'cancelled');
 assert.equal((await call('list_sessions')).data.length,2);
 await c.close();c=null;
 const jobs=await readdir(path.join(tmp,'state'));assert(jobs.some(n=>n.endsWith('.json')));
 console.log('PASS: MCP protocol; CLI key isolation; identical round snapshots; cross-agent history; session locks; manuscript revisions; partial failures; cancellation; persistent records.');
}finally{if(c)await c.close();await rm(tmp,{recursive:true,force:true});}
