import http from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, stat, rename, unlink } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const data = resolve(process.env.DATA_DIR || resolve(root, 'data'));
const maxSize = 20 * 1024 * 1024;
const types = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.txt':'text/plain', '.md':'text/plain', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav', '.mp4':'video/mp4', '.pdf':'application/pdf' };
const token = process.env.PEER_TOKEN || '';
const peers = (process.env.PEERS || '').split(',').filter(Boolean).map(value => {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PEERS must contain HTTP(S) origins only.');
  if (!token) throw new Error('Set PEER_TOKEN on every peer before connecting machines.');
  return url.origin;
});
const demo = !peers.length && process.env.DEMO !== 'false';
const tickets = new Map();
const activity = [];
const json = (res, status, value) => { res.writeHead(status, {'content-type':'application/json'}); res.end(JSON.stringify(value)); };
const error = (status, message) => Object.assign(new Error(message), { status });
const peerAuthorized = req => {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return token && supplied.length === expected.length && timingSafeEqual(supplied, expected);
};
const safeName = name => basename(name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 120) || 'surprise.txt';
const disposition = name => `attachment; filename="download${extname(name).replace(/[^.a-z0-9]/gi,'')}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, '%27')}`;
async function catalog() {
  const entries = await readdir(data);
  const files = await Promise.all(entries.filter(n=>n.endsWith('.json')).map(async n=> {
    try { const entry=JSON.parse(await readFile(resolve(data,n),'utf8')); await stat(resolve(data,entry.id+'.blob')); return entry; } catch { return null; }
  }));
  return files.filter(Boolean).sort((a,b)=>String(a.addedAt || a.createdAt || '').localeCompare(String(b.addedAt || b.createdAt || '')));
}
const demoFiles = [
  {id:'demo-1', name:'a-small-reminder.txt', size:78, type:'text/plain', category:'Other', owner:'Starter collection', content:'A small reminder: take a breath, stretch your shoulders, and make something kind.\n'},
  {id:'demo-2', name:'tiny-garden.txt', size:67, type:'text/plain', category:'Artwork', owner:'Starter collection', content:'      _\n    _/ \\_\n   (  .  )\n    \\ | /\n      |\n   ___|___\n  |_______|\n'},
  {id:'demo-3', name:'very-important-cat.txt', size:63, type:'text/plain', category:'Memes', owner:'Starter collection', content:' /\\_/\\\n( o.o )   This meeting could have been a nap.\n > ^ <\n'}
].map(f=>({...f,size:Buffer.byteLength(f.content)}));
function publicFile(f) { const {content, ...entry}=f; return entry; }
async function remoteCollections() {
  return Promise.all(peers.map(async origin=>{
    try {
      const response=await fetch(`${origin}/peer/catalog`, {headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(4000),redirect:'error'});
      if(!response.ok) throw new Error();
      const chunks=[]; let length=0;
      for await (const chunk of Readable.fromWeb(response.body)) {
        length+=chunk.length; if(length>1024*1024) throw new Error('Peer catalog is too large.');
        chunks.push(chunk);
      }
      const text=Buffer.concat(chunks).toString('utf8');
      const result=JSON.parse(text);
      if(!Array.isArray(result.files) || result.machineId === machineId) throw new Error();
      return {origin,name:String(result.name || new URL(origin).hostname).slice(0,80),online:true,files:result.files.filter(f=>/^[a-zA-Z0-9-]+$/.test(f.id)&&typeof f.name==='string'&&Number.isSafeInteger(f.size)&&f.size>0&&f.size<=maxSize).slice(0,1000).map(f=>({...publicFile(f),name:safeName(f.name),origin,owner:String(result.name||'A friend').slice(0,80)}))};
    } catch { return {origin,name:new URL(origin).hostname,online:false,files:[]}; }
  }));
}
function drawPool(remotes, files) {
  const remoteFiles = remotes.flatMap(peer => peer.files);
  if (!demo) return remoteFiles;
  // A standalone machine can test its real uploads; starter files only fill an empty machine.
  return files.length ? files.map(file => ({...file, local:true, owner:'You'})) : demoFiles;
}
function record(entry) { activity.unshift({id:randomUUID(),at:new Date().toISOString(),...entry}); activity.splice(30); }
await mkdir(data,{recursive:true});
let machineId;
try { machineId = (await readFile(resolve(data,'.machine-id'),'utf8')).trim(); }
catch { machineId=randomUUID(); await writeFile(resolve(data,'.machine-id'),machineId); }
export const server = http.createServer(async (req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url=new URL(req.url,'http://localhost');
    const path=url.pathname;
    if(path.startsWith('/peer/')) {
      if(!peerAuthorized(req)) throw error(401,'Peer authentication required.');
      if(req.method==='GET'&&path==='/peer/catalog') return json(res,200,{machineId,name:process.env.MACHINE_NAME || 'A friend',files:await catalog()});
      if(req.method==='GET'&&/^\/peer\/files\/[a-zA-Z0-9-]+$/.test(path)) {
        const file=(await catalog()).find(f=>f.id===path.split('/').pop());
        if(!file) throw error(404,'File is no longer available.');
        res.writeHead(200,{'content-type':'application/octet-stream','content-length':file.size,'content-disposition':disposition(file.name)});
        return await pipeline(createReadStream(resolve(data,file.id+'.blob')),res);
      }
      throw error(404,'Unknown peer endpoint.');
    }
    // Only the operator on this machine can use the UI API; tailnet peers use authenticated /peer routes.
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const localHost = ['localhost','127.0.0.1','[::1]'].includes(new URL(`http://${req.headers.host}`).hostname);
    if(path.startsWith('/api/') && (!local || !localHost || req.headers['tailscale-user-login'] || req.headers['x-forwarded-for'])) throw error(403,'Open the app on your own computer to use the controls.');
    if(path.startsWith('/api/') && req.method!=='GET') {
      if(req.headers['x-vending-request']!=='1' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)) throw error(403,'Request must come from this app.');
    }
    if(req.method==='GET'&&/^\/api\/files\/[a-zA-Z0-9-]+\/preview$/.test(path)) {
      const file=(await catalog()).find(entry=>entry.id===path.split('/')[3]);
      if(!file || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) throw error(404,'No image preview available.');
      res.writeHead(200,{'content-type':file.type,'content-length':file.size,'cache-control':'private, max-age=3600'});
      return await pipeline(createReadStream(resolve(data,file.id+'.blob')),res);
    }
    if(req.method==='DELETE'&&/^\/api\/files\/[a-zA-Z0-9-]+$/.test(path)) {
      const id=path.split('/').pop();
      if(!(await catalog()).some(f=>f.id===id)) throw error(404,'File not found.');
      await unlink(resolve(data,id+'.json')); await unlink(resolve(data,id+'.blob'));
      return json(res,200,{ok:true});
    }
    if(req.method==='GET'&&path==='/api/status') {
      const [remote,files]=await Promise.all([remoteCollections(),catalog()]);
      const pool=drawPool(remote,files);
      return json(res,200,{name:process.env.MACHINE_NAME || 'My machine',demo,files,
        peers:remote.map(({files,...peer})=>({...peer,count:files.length})),
        available:pool.length,stock:[...pool].sort((a,b)=>String(b.addedAt || b.createdAt || '').localeCompare(String(a.addedAt || a.createdAt || ''))).slice(0,6).map(publicFile),activity});
    }
    if(req.method==='POST'&&path==='/api/files') {
      let name;try{name=safeName(decodeURIComponent(req.headers['x-file-name']||''));}catch{throw error(400,'Invalid filename.');}
      const type=types[extname(name).toLowerCase()];
      if(!type) throw error(415,'Choose an image, audio, video, PDF, or text file.');
      const length=Number(req.headers['content-length']);
      if(!Number.isSafeInteger(length)||length<=0||length>maxSize) throw error(413,'Files must be between 1 byte and 20 MB.');
      const files=await catalog();if(files.length>=1000)throw error(409,'The machine is full. Remove a contribution first.');
      const id=randomUUID();const temporary=resolve(data,id+'.tmp');let size=0;
      const limit=new Transform({transform(chunk,encoding,callback){size+=chunk.length;callback(size>maxSize?error(413,'File exceeds 20 MB.'):null,chunk);}});
      const { createWriteStream }=await import('node:fs');
      try{
        await pipeline(req,limit,createWriteStream(temporary,{flags:'wx'}));
        if(size!==length)throw error(400,'Upload was incomplete.');
        const category=['Wild card','Memes','Artwork','Photos','Music','Notes'].includes(req.headers['x-file-category'])?req.headers['x-file-category']:'Wild card';
        const entry={id,name,size,type,category,addedAt:new Date().toISOString()};
        await rename(temporary,resolve(data,id+'.blob'));await writeFile(resolve(data,id+'.json'),JSON.stringify(entry));
        record({kind:'contribution',name});return json(res,201,entry);
      }catch(e){await unlink(temporary).catch(()=>{});await unlink(resolve(data,id+'.blob')).catch(()=>{});throw e;}
    }
    if(req.method==='POST'&&path==='/api/draw') {
      const [remotes,files]=await Promise.all([remoteCollections(),catalog()]);
      const candidates=drawPool(remotes,files);
      if(!candidates.length) throw error(409,'No surprises available. Ask a friend to connect and contribute a file.');
      const file=candidates[randomInt(candidates.length)];
      for(const [key,ticket] of tickets) if(ticket.expires<Date.now()) tickets.delete(key);
      if(tickets.size>=200) tickets.delete(tickets.keys().next().value);
      const ticket=randomUUID(); tickets.set(ticket,{file,expires:Date.now()+300000});
      return json(res,200,{...publicFile(file),download:`/api/download/${ticket}`});
    }
    if(req.method==='GET'&&path.startsWith('/api/download/')) {
      const key=path.split('/').pop(); const ticket=tickets.get(key);
      if(!ticket || ticket.expires<Date.now()) throw error(410,'This download expired. Draw another file.');
      const {file}=ticket; let source;
      if(file.local) {
        const current=(await catalog()).find(entry=>entry.id===file.id);
        if(!current) throw error(410,'This file was removed from the machine. Draw another file.');
        source=createReadStream(resolve(data,current.id+'.blob'));
      } else if(file.origin) {
        const response=await fetch(`${file.origin}/peer/files/${file.id}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000),redirect:'error'});
        if(!response.ok) throw error(502,'Your friend went offline. Try another draw.');
        source=Readable.fromWeb(response.body);
      } else source=Readable.from([Buffer.from(file.content)]);
      res.writeHead(200,{'content-type':'application/octet-stream','content-disposition':disposition(file.name)});
      let size=0;
      await pipeline(source,new Transform({transform(chunk,encoding,done){size+=chunk.length; done(size>maxSize?error(502,'Peer file exceeds size limit.'):null,chunk);}}),res);
      record({kind:'received',name:file.name,owner:file.owner}); return;
    }
    if(req.method==='GET') {
      const pages={'/':'index.html','/style.css':'style.css','/app.js':'app.js','/favicon.svg':'favicon.svg'};
      const file=pages[path];
      if(file) { const content=await readFile(resolve(root,'public',file));res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'}[extname(file)]});res.end(content);return; }
    }
    throw error(404,'Not found.');
  } catch(err) { if(res.headersSent) res.destroy(); else json(res,err.status||500,{error:err.status?err.message:'Something went wrong. Please try again.'}); }
});
server.requestTimeout=90000;
if(process.argv[1]===fileURLToPath(import.meta.url)) server.listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log(`Mystery File Vending Machine · http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));
