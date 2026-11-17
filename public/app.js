const $ = id => document.getElementById(id);
let state = {files:[], peers:[], available:0, demo:true, activity:[]};
let collection = [];
let busy = false;
try { collection = JSON.parse(sessionStorage.getItem('mystery-collection') || '[]'); if(!Array.isArray(collection)) collection=[]; } catch {}
const bytes = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`;
function el(tag, text, className) { const node = document.createElement(tag); if(text) node.textContent=text; if(className) node.className=className; return node; }
let toastTimer;
function toast(message) { $('toast').textContent=message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000); }
async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'X-Vending-Request':'1',...options.headers}});
  const data=await response.json(); if(!response.ok) throw new Error(data.error || 'The machine hit a snag. Try again.'); return data;
}
function empty(container,title,description) { const box=el('div',null,'empty-state'); box.append(el('span','✷'),el('h2',title),el('p',description)); container.replaceChildren(box); }
function fileCard(file,action,label) {
  const card=el('article',null,'file-card');card.append(el('span',file.category==='Memes'?'☺':'▧','file-symbol'),el('h2',file.name),el('p',`${file.category || 'Wild card'} · ${bytes(file.size)}`));
  if(file.owner) card.append(el('p',`From ${file.owner}`));
  const button=el('button',label,'secondary-button');button.addEventListener('click',()=>action(file,button));card.append(button);return card;
}
function renderLists() {
  $('my-count').textContent=state.files.length; $('collection-count').textContent=collection.length;
  const own=$('contributions-list');own.replaceChildren();
  if(!state.files.length) empty(own,'A good surprise starts with you.','Add a file to give your friends something to find.');
  state.files.forEach(f=>own.append(fileCard(f,async(file,button)=>{ button.disabled=true;try{await api(`/api/files/${file.id}`,{method:'DELETE'});toast('File removed from the machine.');await refresh();}catch(e){toast(e.message);button.disabled=false;} },'Remove contribution')));
  const found=$('collection-list');found.replaceChildren();
  if(!collection.length) empty(found,'Your collection is a blank canvas.','Press the vending button and see what comes your way.');
  collection.forEach(f=>{ const card=fileCard(f, file=>{if(Date.now()-file.drawnAt>300000) return toast('This download has expired. Vend another surprise.');download(file);},Date.now()-f.drawnAt>300000?'Download expired':'Download file ↓');found.append(card); });
  const peers=$('peers-list');peers.replaceChildren();
  if(!state.peers.length) empty(peers,'Good surprises are better with friends.','No peers configured yet. Follow the setup below to connect.');
  state.peers.forEach(p=>{const card=el('article',null,'file-card');card.append(el('span',p.online?'↔':'○','file-symbol'),el('h2',p.name),el('p',`${p.online?'Online':'Offline'} · ${p.count} shared files`));peers.append(card);});
}
function renderActivity() {
  const list=$('activity-list');
  if(!state.activity.length)return;
  list.replaceChildren();state.activity.slice(0,3).forEach(item=>{
    const row=el('div',null,'activity-row');const info=el('div');info.append(el('strong',item.kind==='contribution'?'File added to the mix':'File downloaded'),el('span',item.name));row.append(el('span',item.kind==='contribution'?'↑':'↙','activity-glyph'),info,el('time','just now'));list.append(row);
  });
}
function renderStock() {
  const grid=$('stock-grid');grid.replaceChildren();
  const stock=state.stock || [];
  for(let i=0;i<6;i++) {
    const file=stock[i];const card=el('div',null,`stock-item${file ? (file.local?' local-item':'') : ' stock-empty'}`);
    card.append(el('span',String(i+1).padStart(2,'0')));
    if(file) {
      const symbol=file.local?(file.name.split('.').pop() || 'FILE').toUpperCase():'?';
      if(file.local && file.type?.startsWith('image/') && file.size<=2*1024*1024) {
        const image=el('img');image.src=`/api/files/${file.id}/preview`;image.alt='';image.width=100;image.height=60;image.loading='lazy';card.append(image);
      } else card.append(el('span',symbol,file.local?'stock-symbol file-extension':'stock-symbol'));
      card.append(el('strong',file.local?file.name:'Mystery file'));
      if(file.local)card.append(el('span','YOURS','stock-badge'));
      card.title=file.local?file.name:'A surprise waiting to be vended';
    } else card.append(el('span','＋','stock-symbol'),el('strong','Open slot'));
    grid.append(card);
  }
  const shared=$('shared-list');shared.replaceChildren();$('shared-count').textContent=state.files.length;
  state.files.slice(-3).reverse().forEach(file=>{const row=el('div',null,'shared-row');row.append(el('span','▧'),el('strong',file.name));shared.append(row);});
  $('shared-hint').textContent=state.files.length
    ? (state.demo?'In the local test pool. You can vend these files now.':'Shared with friends. Your own draws use files from other computers.')
    : 'Add a file to see it here.';
}
async function refresh() {
  try {
    state=await api('/api/status');
    const online=state.peers.filter(peer=>peer.online).length;
    $('connection-label').textContent=state.demo?'Local test mode':`${online} peers connected`;
    $('network-state').textContent=state.demo?'LOCAL TEST':'TAILNET';
    $('vend-button').disabled=busy || state.available===0;$('round-vend').disabled=busy || state.available===0;
    $('file-count').textContent=state.available;$('peer-count').textContent=online;
    $('stock-label').textContent=`${state.available} ${state.available===1?'file':'files'} ready to vend`;
    $('network-note').textContent=state.demo
      ? (state.files.length?'Your uploads are in the local vending pool. Connect friends for a peer exchange.':'Three starter files to try. Add a file to replace them with your own uploads.')
      : `${state.files.length} files shared by you. Your own files are excluded from your draws.`;
    $('draw-note').textContent=state.demo
      ? (state.files.length?'Local test: draws from your uploaded files.':'Starter files only. Add your own file or connect friends.')
      : 'A random file from someone else’s computer.';
    $('machine-name').textContent=state.name;
    if(!busy)$('machine-display').replaceChildren(document.createTextNode(state.available?'Ready for a surprise':'Waiting for files'),el('span',state.demo?'Local test mode':`${online} friends connected`));
    renderLists();renderStock();renderActivity();
  } catch(e) { $('connection-label').textContent='Machine offline'; $('stock-label').textContent='Connection lost'; toast(e.message); }
}
function showView(view) {document.querySelectorAll('.view').forEach(node=>node.classList.toggle('hidden',node.id!==`view-${view}`));document.querySelectorAll('[data-view]').forEach(button=>{const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});renderLists();}
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
function openUpload() {$('upload-form').reset();$('selected-file').textContent='Choose a file or drop it here';$('upload-message').textContent='';$('upload-dialog').showModal();}
$('contribute-button').addEventListener('click',openUpload);$('add-file-button').addEventListener('click',openUpload);
for(const id of ['help-button','sidebar-help'])$(id).addEventListener('click',()=>$('help-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
$('file-input').addEventListener('change',()=>{$('selected-file').textContent=$('file-input').files[0]?.name||'Choose a file or drop it here';});
for(const name of ['dragenter','dragover'])$('drop-zone').addEventListener(name,event=>{event.preventDefault();$('drop-zone').classList.add('dragging');});
for(const name of ['dragleave','drop'])$('drop-zone').addEventListener(name,event=>{event.preventDefault();$('drop-zone').classList.remove('dragging');if(name==='drop'&&event.dataTransfer.files.length){$('file-input').files=event.dataTransfer.files;$('file-input').dispatchEvent(new Event('change'));}});
$('upload-form').addEventListener('submit',async event=>{
  event.preventDefault();const file=$('file-input').files[0];if(!file)return;if(file.size>20*1024*1024)return $('upload-message').textContent='Choose a file smaller than 20 MB.';
  $('upload-submit').disabled=true;$('upload-message').textContent='Adding your surprise…';
  try {await api('/api/files',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-File-Category':$('category-input').value},body:file});$('upload-dialog').close();await refresh();toast(state.demo?'File added to the mix. You can vend it now.':'File shared. Your friends can now draw it.');}
  catch(e){$('upload-message').textContent=e.message;}finally{$('upload-submit').disabled=false;}
});
function download(file) {const a=el('a');a.href=file.download;a.download=file.name;document.body.append(a);a.click();a.remove();}
async function vend() {
  if(busy)return;busy=true;$('vend-button').disabled=true;$('round-vend').disabled=true;$('vend-label').textContent='Picking a mystery file…';$('vending-machine').classList.add('vending');$('machine-display').replaceChildren(document.createTextNode('Picking your file…'),el('span','A little suspense.'));
  try {
    const [file]=await Promise.all([api('/api/draw',{method:'POST'}),new Promise(resolve=>setTimeout(resolve,1200))]);file.drawnAt=Date.now();collection.unshift(file);collection=collection.slice(0,50);try{sessionStorage.setItem('mystery-collection',JSON.stringify(collection));}catch{}
    $('result-name').textContent=file.name;$('result-meta').textContent=`${file.category || 'Wild card'} · ${bytes(file.size)}`;$('result-from').textContent=file.local?'From your uploads — local test mode.':file.id.startsWith('demo-')?'A built-in starter file. Upload a file to try your own.':`Shared by ${file.owner}.`;
    $('download-button').href=file.download;$('download-button').download=file.name;$('result-dialog').showModal();renderLists();
  } catch(e){toast(e.message);}finally{busy=false;$('vend-button').disabled=state.available===0;$('round-vend').disabled=state.available===0;$('vend-label').textContent='Vend a mystery file';$('vending-machine').classList.remove('vending');$('machine-display').replaceChildren(document.createTextNode('Ready for a surprise'),el('span',state.demo?'Local test mode':'From your friends'));}
}
$('vend-button').addEventListener('click',vend);$('round-vend').addEventListener('click',vend);$('another-button').addEventListener('click',()=>{$('result-dialog').close();vend();});
$('download-button').addEventListener('click',()=>setTimeout(refresh,500));
refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);
