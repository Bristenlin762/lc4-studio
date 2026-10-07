import {Engine,demoObject} from './engine.js';
import {hex,signed,decode} from './decoder.js';
const $=id=>document.getElementById(id), engine=new Engine();
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let ready=false,running=false,loading=false,page=0,addresses=[],programName='',runToken=0;
const pageSize=64;
function status(text,type=''){ $('status').textContent=text;$('status').className=type; }
function parseAddress(value){const s=value.trim().replace(/^0x/i,'').replace(/^x/i,'');if(!/^[0-9a-f]{1,4}$/i.test(s))throw Error('Enter a hexadecimal address from x0000 to xFFFF.');return parseInt(s,16);}
function controls(){for(const id of ['step','run','reset','entry-button'])$(id).disabled=!ready||!engine.loaded||running||loading;$('pause').disabled=!running;$('demo').disabled=!ready||running||loading;$('file').disabled=!ready||running||loading;$('entry').disabled=running;}
function rebuildAddresses(){const k=engine.kinds(),f=$('filter').value;addresses=[];for(let a=0;a<65536;a++)if(f==='all'||f==='loaded'&&k[a]||f==='code'&&k[a]===1||f==='data'&&k[a]===2)addresses.push(a);page=Math.min(page,Math.max(0,Math.ceil(addresses.length/pageSize)-1));}
function goAddress(a,ensure=false){let i=addresses.indexOf(a);if(i<0&&ensure){$('filter').value='all';rebuildAddresses();i=a;}if(i<0)throw Error('Address is hidden by the current view. Choose All memory to inspect it.');page=Math.floor(i/pageSize);renderMemory();}
function renderMemory(){
  const s=engine.state(),m=engine.memory(),k=engine.kinds();const visible=addresses.slice(page*pageSize,(page+1)*pageSize);
  $('memory-rows').innerHTML=visible.length?visible.map(a=>`<tr class="${a===s.pc?'current ':''}${engine.last?.store?.address===a?'written':''}"><td>${a===s.pc?'▶':''}</td><td>${hex(a)}</td><td>${hex(m[a])}</td><td>${escape(engine.label(a))}</td><td class="${k[a]!==1?'data-value':''}">${escape(k[a]===1?decode(m[a],a):k[a]===2?'.FILL '+hex(m[a])+' · '+signed(m[a]):'—')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty">No addresses in this view.</td></tr>';
  $('page-label').textContent=addresses.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,addresses.length)} of ${addresses.length.toLocaleString()}`:'0 addresses';
  $('prev').disabled=page===0;$('next').disabled=(page+1)*pageSize>=addresses.length;
}
function render(){
  const s=engine.state(),last=engine.last;$('pc').textContent=hex(s.pc);$('nzp').textContent=(s.nzp&4?'N':'')+(s.nzp&2?'Z':'')+(s.nzp&1?'P':'');$('mode').textContent=s.privileged?'Supervisor':'User';$('step-count').textContent=s.steps.toLocaleString()+' steps';$('word-count').textContent=s.words.toLocaleString()+' loaded words';
  $('registers').innerHTML=s.regs.map((v,i)=>`<div class="reg ${last?.regs.includes(i)?'changed':''}"><span>R${i}</span><strong>${hex(v)}</strong><span class="number">${signed(v)}</span></div>`).join('');
  if(last){$('last').className='detail';$('last').innerHTML=`<code>${hex(last.pc)} · ${escape(last.assembly)}</code><p>PC ${hex(last.before.pc)} → ${hex(s.pc)}</p>`+last.regs.map(i=>`<p>R${i}: ${hex(last.before.regs[i])} → ${hex(last.after.regs[i])}</p>`).join('')+`<p>NZP: ${last.before.nzp===4?'N':last.before.nzp===2?'Z':'P'} → ${s.nzp===4?'N':s.nzp===2?'Z':'P'}</p>`+(last.store?`<p>Memory ${hex(last.store.address)}: ${hex(last.store.before)} → ${hex(last.store.after)}</p>`:'');}
  else{$('last').className='detail empty-detail';$('last').textContent='Step through a program to inspect its effects.';}
  $('writes').innerHTML=engine.changes.length?engine.changes.map(w=>`<div class="write">${hex(w.address)}: ${hex(w.before)} → <strong>${hex(w.after)}</strong><br><small>Step ${w.step}</small></div>`).join(''):'STR writes will appear here.';
  $('writes').className=engine.changes.length?'detail':'detail empty-detail';
  rebuildAddresses();if($('follow').checked){const i=addresses.indexOf(s.pc);if(i>=0)page=Math.floor(i/pageSize);}renderMemory();controls();
}
function load(bytes,name){
  engine.load(bytes);programName=name;$('filename').textContent=name;$('entry').value=hex(engine.state().entry);page=0;$('filter').value='loaded';render();status(`Loaded ${name}. Start at ${hex(engine.state().pc)}. Step to watch the program execute.`);
}
function oneStep(){try{const r=engine.step();render();status(r.ok?`Executed ${engine.last.assembly} at ${hex(engine.last.pc)}.`:r.reason,r.ok?'':'stopped');return r;}catch(e){status(e.message,'error');return {ok:false};}}
function pause(){running=false;runToken++;controls();}
async function run(limit){
  if(!engine.loaded||running||loading)throw Error('Load a program and pause execution before running.');
  if(!Number.isInteger(limit)||limit<1||limit>100000)throw Error('Run limit must be an integer from 1 to 100,000.');
  running=true;controls();const token=++runToken;let count=0,reason='';status('Running…');
  try{
    while(running&&token===runToken&&count<limit){
      for(let n=0;n<100&&count<limit;n++){const r=engine.step();if(!r.ok){reason=r.reason;running=false;break;}count++;}
      render();if(running)await new Promise(requestAnimationFrame);
    }
    if(token===runToken){running=false;render();status(reason||`Paused after ${count.toLocaleString()} instructions: run limit reached.`,'stopped');}
    return {executed:count,state:engine.state(),reason:reason||(!running?'Paused or run limit reached':'')};
  }catch(e){running=false;controls();status(e.message,'error');throw e;}
}
$('demo').onclick=()=>{try{load(demoObject(),'demo.obj · Sum 1 through 5');}catch(e){status(e.message,'error');}};
$('file').onchange=async ev=>{
  loading=true;controls();
  try{const files=Array.from(ev.target.files);if(!files.length)return;const total=files.reduce((n,f)=>n+f.size,0);if(total>4*1024*1024)throw Error('Total object size must not exceed 4 MiB.');const arrays=await Promise.all(files.map(f=>f.arrayBuffer()));const merged=new Uint8Array(total);let p=0;for(const b of arrays){merged.set(new Uint8Array(b),p);p+=b.byteLength;}load(merged,files.map(f=>f.name).join(' + '));}catch(e){status(e.message,'error');}finally{ev.target.value='';loading=false;controls();}
};
$('step').onclick=oneStep;$('run').onclick=()=>run(Number($('limit').value)).catch(e=>status(e.message,'error'));
$('pause').onclick=()=>{pause();render();status('Paused. Step or Run to continue.','stopped');};
$('reset').onclick=()=>{engine.reset();render();status('Reset to the loaded program’s initial registers and memory.');};
$('filter').onchange=()=>{page=0;rebuildAddresses();renderMemory();};
$('prev').onclick=()=>{page--;renderMemory();};$('next').onclick=()=>{page++;renderMemory();};
$('jump-form').onsubmit=ev=>{ev.preventDefault();try{$('follow').checked=false;goAddress(parseAddress($('address').value),true);}catch(e){status(e.message,'error');}};
$('pc-jump').onclick=()=>{try{goAddress(engine.state().pc,true);}catch(e){status(e.message,'error');}};
$('follow').onchange=()=>{if(engine.loaded)render();};
$('entry-form').onsubmit=ev=>{ev.preventDefault();try{engine.entry(parseAddress($('entry').value));render();status('Start address updated; registers and memory reset.');}catch(e){status(e.message,'error');}};
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='s'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!['INPUT','TEXTAREA','SELECT','BUTTON'].includes(document.activeElement?.tagName)&&engine.loaded&&!running){e.preventDefault();oneStep();}});
function registerTools(){
  const ctx=document.modelContext;if(!ctx?.registerTool)return;
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tools=[
    {name:'read_lc4_state',title:'Read LC4 state',description:'Read the loaded CPU registers, program counter, condition code and instruction count.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>engine.state()},
    {name:'step_lc4',title:'Step LC4 instructions',description:'Execute 1 to 100 instructions on the loaded program and update the visible debugger.',inputSchema:{type:'object',properties:{count:{type:'integer',minimum:1,maximum:100}},required:['count'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||!Number.isInteger(input.count)||input.count<1||input.count>100||running)throw Error('Count must be 1–100, with execution paused.');let r;for(let i=0;i<input.count;i++){r=oneStep();if(!r.ok)break;}return r;}},
    {name:'reset_lc4',title:'Reset LC4',description:'Restore the loaded program’s initial registers and memory.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(!engine.loaded||running||loading)throw Error('Load a program and pause before resetting.');engine.reset();render();status('Program reset.');return engine.state();}}
  ];
  for(const t of tools)try{Promise.resolve(ctx.registerTool(t,{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
try{const response=await fetch('lc4.wasm');if(!response.ok)throw Error('C execution engine could not be loaded.');await engine.init(await response.arrayBuffer());ready=true;render();status('Ready. Load an LC4 .obj file or try the summation demo.');registerTools();}catch(e){status(e.message,'error');controls();}
