const $ = id => document.getElementById(id);
let state = {files:[], peers:[], available:0, demo:true, stock:[]};
let busy = false;
let uploading = false;
const bytes = size => size < 1024 ? `${size} B` : size < 1048576 ? `${(size/1024).toFixed(1)} KB` : `${(size/1048576).toFixed(1)} MB`;
function el(tag, text, className) {
  const node=document.createElement(tag);
  if(text) node.textContent=text;
  if(className) node.className=className;
  return node;
}
let toastTimer;
function toast(message) {
  $('toast').textContent=message;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000);
}
async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'X-Vending-Request':'1',...options.headers}});
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || 'The machine hit a snag. Try again.');
  return data;
}
function renderFiles() {
  $('my-count').textContent=state.files.length;
  const list=$('contributions-list');list.replaceChildren();
  if(!state.files.length) list.append(el('p','No files added yet.','empty-files'));
  [...state.files].reverse().forEach(file=>{
    const row=el('div',null,'shared-row');
    const info=el('div');info.append(el('strong',file.name),el('span',bytes(file.size)));
    const remove=el('button','×','remove-file');
    remove.type='button';remove.setAttribute('aria-label',`Remove ${file.name}`);
    remove.addEventListener('click',async()=>{
      remove.disabled=true;
      try {await api(`/api/files/${file.id}`,{method:'DELETE'});await refresh();toast('File removed from the mix.');}
      catch(error){toast(error.message);remove.disabled=false;}
    });
    row.append(info,remove);list.append(row);
  });
  const peers=$('peers-list');peers.replaceChildren();
  state.peers.forEach(peer=>peers.append(el('p',`${peer.name} · ${peer.online?'Online':'Offline'} · ${peer.count} files`)));
}
function renderStock() {
  const grid=$('stock-grid');grid.replaceChildren();
  for(let row=0;row<2;row++) {
    const shelf=el('div',null,'shelf-row');
    for(let col=0;col<3;col++) {
      const i=row*3+col;const file=state.stock[i];
      const card=el('div',null,`stock-item${file?(file.local?' local-item':''):' stock-empty'}`);
      card.append(el('span',`${row?'B':'A'}${col+1}`,'stock-number'));
      if(file) {
        const extension=file.local?(file.name.split('.').pop()||'FILE').toUpperCase():'???';
        card.append(el('span',extension,'packet-extension'));
        if(file.local && file.type?.startsWith('image/') && file.size<=2*1024*1024) {
          const img=el('img');img.src=`/api/files/${file.id}/preview`;img.alt='';img.width=100;img.height=60;img.loading='lazy';card.append(img);
        } else {
          let kind='mystery';let symbol='?';
          if(file.local) {
            if(file.type?.startsWith('image/')){kind='flower';symbol='✿';}
            else if(file.type?.startsWith('audio/')){kind='record';symbol='';}
            else if(file.type?.startsWith('video/')){kind='play';symbol='▶';}
            else {kind='note';symbol='a little<br>something';}
          }
          const art=el('span',null,`packet-art art-${kind}`);
          if(kind==='note')art.append(document.createTextNode('a little'),el('br'),document.createTextNode('something'));
          else art.textContent=symbol;
          card.append(art);
        }
        card.append(el('strong',file.local?file.name:'A mystery file'));
        card.title=file.local?file.name:'A surprise waiting to be vended';
      } else card.append(el('span','＋','empty-coil'),el('strong','Open slot'));
      shelf.append(card);
    }
    grid.append(shelf);
  }
}
function resetDisplay() {
  $('machine-display').replaceChildren(document.createTextNode(state.available?'READY':'EMPTY'),el('span',state.available?'TO SURPRISE':'ADD A FILE'),el('i','• • •'));
}
async function refresh() {
  try {
    state=await api('/api/status');
    const online=state.peers.filter(peer=>peer.online).length;
    $('connection-label').textContent=state.demo?'Local test':`${online} peers online`;
    $('vend-button').disabled=busy || state.available===0;$('round-vend').disabled=busy || state.available===0;
    $('stock-label').textContent=`${state.available} ${state.available===1?'file':'files'} in the mix`;
    $('draw-note').textContent=state.demo
      ? (state.files.length?'Local test · Draws from your uploads.':'Local test · Upload a file, or try a starter surprise.')
      : 'A random file from someone else’s computer.';
    $('sharing-note').textContent=state.demo
      ? 'Your uploads enter the local mix immediately.'
      : 'Your uploads go into your friends’ mix. Your draws come from their computers.';
    if(!busy) resetDisplay();
    renderStock();renderFiles();
    return true;
  } catch(error) {
    $('connection-label').textContent='Offline';$('vend-button').disabled=true;$('round-vend').disabled=true;
    $('stock-label').textContent='Connection lost';toast(error.message);return false;
  }
}
$('help-button').addEventListener('click',()=>$('help-dialog').showModal());
for(const id of ['open-upload','machine-upload'])$(id).addEventListener('click',()=>$('upload-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const rect=dialog.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();
}));
function selectFile() {
  const file=$('file-input').files[0];
  $('selected-file').textContent=file?.name||'Drop a file here';
  $('file-prompt').textContent=file?bytes(file.size):'or click to choose';
  $('drop-zone').classList.toggle('has-file',Boolean(file));
  $('upload-message').textContent='';
  $('upload-submit').disabled=!file||uploading;
}
$('file-input').addEventListener('change',selectFile);
for(const name of ['dragenter','dragover'])$('drop-zone').addEventListener(name,event=>{
  event.preventDefault();if(!uploading)$('drop-zone').classList.add('dragging');
});
for(const name of ['dragleave','drop'])$('drop-zone').addEventListener(name,event=>{
  event.preventDefault();$('drop-zone').classList.remove('dragging');
  if(name==='drop'&&!uploading&&event.dataTransfer.files.length){
    const files=new DataTransfer();files.items.add(event.dataTransfer.files[0]);
    $('file-input').files=files.files;selectFile();
  }
});
$('upload-form').addEventListener('submit',async event=>{
  event.preventDefault();if(uploading)return;
  const file=$('file-input').files[0];if(!file)return;
  if(!file.size||file.size>20*1024*1024){$('upload-message').textContent='Choose a file between 1 byte and 20 MB.';return;}
  uploading=true;$('upload-submit').disabled=true;$('file-input').disabled=true;
  $('upload-message').textContent='Adding your file…';
  try {
    const category=file.type==='image/gif'?'Memes':file.type.startsWith('image/')?'Artwork':file.type.startsWith('audio/')?'Music':file.type.startsWith('text/')?'Notes':'Wild card';
    await api('/api/files',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name),'X-File-Category':category},body:file});
    $('upload-form').reset();selectFile();
    const refreshed=await refresh();
    if(refreshed){
      $('upload-dialog').close();
      toast(state.demo?'Added to the mix. Ready to vend.':'Added. Your friends can draw it now.');
    } else $('upload-message').textContent='File saved. Reconnecting to the machine…';
  } catch(error){$('upload-message').textContent=error.message;}
  finally{uploading=false;$('file-input').disabled=false;$('upload-submit').disabled=!$('file-input').files.length;}
});
async function vend() {
  if(busy)return;
  busy=true;$('vend-button').disabled=true;$('round-vend').disabled=true;$('vend-label').textContent='Picking your file…';
  $('vending-machine').classList.add('vending');
  $('machine-display').replaceChildren(document.createTextNode('PICKING'),el('span','YOUR SURPRISE'));
  try {
    const [file]=await Promise.all([api('/api/draw',{method:'POST'}),new Promise(resolve=>setTimeout(resolve,900))]);
    $('result-name').textContent=file.name;$('result-meta').textContent=`${file.category||'Wild card'} · ${bytes(file.size)}`;
    $('result-from').textContent=file.local?'From your uploads · local test mode.':file.id.startsWith('demo-')?'A starter surprise. Add your own file to try it.':`Shared by ${file.owner}.`;
    $('download-button').href=file.download;$('download-button').download=file.name;
    $('result-dialog').showModal();
  } catch(error){toast(error.message);}
  finally{
    busy=false;$('vend-button').disabled=state.available===0;$('round-vend').disabled=state.available===0;$('vend-label').textContent='Vend a mystery file';
    $('vending-machine').classList.remove('vending');resetDisplay();
  }
}
$('vend-button').addEventListener('click',vend);
$('round-vend').addEventListener('click',vend);
$('another-button').addEventListener('click',()=>{$('result-dialog').close();vend();});
refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);
