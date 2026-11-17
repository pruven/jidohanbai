import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';

async function port() {const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function machine(t,env={}) {
  const folder=await mkdtemp(resolve(tmpdir(),'mystery-test-'));const p=await port();
  if(env.PEERS==='SELF')env={...env,PEERS:`http://127.0.0.1:${p}`};
  const child=spawn(process.execPath,['server.js'],{env:{...process.env,PEERS:'',PEER_TOKEN:'test-token',DEMO:'false',DATA_DIR:folder,PORT:String(p),...env},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{const done=once(child,'exit');child.kill();await done;await rm(folder,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error('Server failed to start');})]);
  const base=`http://127.0.0.1:${p}`;
  return {base,request:(path,options={})=>fetch(base+path,{...options,headers:{'X-Vending-Request':'1',...options.headers}})};
}
async function upload(m,name='hello.txt',body='a little good',extra={}) {return m.request('/api/files',{method:'POST',body,headers:{'X-File-Name':encodeURIComponent(name),'X-File-Category':'Notes',...extra}});}

test('local contributions persist in catalog, require authentication, and can be removed',async t=>{
  const m=await machine(t);const uploaded=await upload(m);assert.equal(uploaded.status,201);const f=await uploaded.json();assert.equal(f.category,'Notes');
  let status=await (await m.request('/api/status')).json();assert.equal(status.files.length,1);assert.equal(status.available,0);assert.equal(status.demo,false);
  assert.equal((await m.request('/peer/catalog')).status,401);
  const catalog=await (await m.request('/peer/catalog',{headers:{authorization:'Bearer test-token'}})).json();assert.equal(catalog.files[0].name,'hello.txt');
  assert.equal((await m.request('/api/files/'+f.id,{method:'DELETE'})).status,200);
  status=await (await m.request('/api/status')).json();assert.equal(status.files.length,0);
});
test('draw streams a real peer file and excludes own contributions',async t=>{
  const friend=await machine(t,{MACHINE_NAME:'Friend'});assert.equal((await upload(friend,'friend.txt','from the other machine')).status,201);
  const m=await machine(t,{PEERS:friend.base});assert.equal((await upload(m,'mine.txt','my file')).status,201);
  const response=await m.request('/api/draw',{method:'POST'});assert.equal(response.status,200);const draw=await response.json();assert.equal(draw.name,'friend.txt');assert.equal(draw.owner,'Friend');assert.equal(draw.content,undefined);
  const download=await m.request(draw.download);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/^attachment/);assert.equal(await download.text(),'from the other machine');
  const status=await (await m.request('/api/status')).json();assert.equal(status.available,1);assert.equal(status.peers[0].online,true);assert.equal(status.activity[0].kind,'received');
});
test('demo offers built-in downloadable files; production empty draw fails clearly',async t=>{
  const m=await machine(t,{DEMO:'true'});const draw=await (await m.request('/api/draw',{method:'POST'})).json();assert.match(draw.id,/^demo-/);assert.ok((await (await m.request(draw.download)).text()).length>0);
  const empty=await machine(t);assert.equal((await empty.request('/api/draw',{method:'POST'})).status,409);assert.equal((await empty.request('/api/download/invalid')).status,410);
});
test('rejects unsupported, empty, oversized and cross-origin uploads',async t=>{
  const m=await machine(t);assert.equal((await upload(m,'program.exe')).status,415);assert.equal((await upload(m,'empty.txt','')).status,413);
  assert.equal((await upload(m,'large.txt',Buffer.alloc(20*1024*1024+1))).status,413);
  assert.equal((await upload(m,'hello.txt','hey',{Origin:'https://other.example'})).status,403);
  assert.equal((await m.request('/api/files',{method:'POST',body:'oops',headers:{'X-Vending-Request':'','X-File-Name':'hello.txt'}})).status,403);
  assert.equal((await m.request('/api/status',{headers:{'Tailscale-User-Login':'someone@example.com'}})).status,403);
  assert.equal((await m.request('/api/status',{headers:{'X-Forwarded-For':'100.64.0.1'}})).status,403);
  assert.equal((await upload(m,'big.txt','x'.repeat(20*1024*1024+1))).status,413);
  assert.equal((await upload(m,'empty.txt','')).status,413);
  assert.equal((await upload(m,'hello.txt','x',{Origin:'https://unrelated.example'})).status,403);
});
test('unavailable peers do not cause draws from own machine',async t=>{
  const m=await machine(t,{PEERS:`http://127.0.0.1:${await port()}`});await upload(m);
  const state=await (await m.request('/api/status')).json();assert.equal(state.peers[0].online,false);assert.equal(state.demo,false);assert.equal(state.available,0);
  assert.equal((await m.request('/api/draw',{method:'POST'})).status,409);
});

test('a machine cannot draw its own files when mistakenly listed as a peer',async t=>{
  const m=await machine(t,{PEERS:'SELF'});await upload(m);
  const state=await (await m.request('/api/status')).json();assert.equal(state.available,0);
  assert.equal((await m.request('/api/draw',{method:'POST'})).status,409);
});

test('local test uploads replace starter files in stock and can be vended and streamed',async t=>{
  const m=await machine(t,{DEMO:'true'});
  const before=await (await m.request('/api/status')).json();assert.equal(before.available,3);
  const file=await (await upload(m,'my-art.txt','my actual artwork')).json();
  const after=await (await m.request('/api/status')).json();
  assert.equal(after.available,1);assert.equal(after.stock[0].id,file.id);assert.equal(after.stock[0].local,true);
  const draw=await (await m.request('/api/draw',{method:'POST'})).json();assert.equal(draw.id,file.id);assert.equal(draw.local,true);
  assert.equal(await (await m.request(draw.download)).text(),'my actual artwork');
  await m.request(`/api/files/${file.id}`,{method:'DELETE'});
  assert.equal((await m.request(draw.download)).status,410);
  assert.equal((await (await m.request('/api/status')).json()).available,3);
  await m.request('/api/files/'+file.id,{method:'DELETE'});
  assert.equal((await m.request(draw.download)).status,410);
  const empty=await (await m.request('/api/status')).json();assert.equal(empty.available,3);
});
