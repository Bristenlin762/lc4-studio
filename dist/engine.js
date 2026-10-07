import {hex, signed, decode} from './decoder.js';
export class Engine {
  async init(bytes) {
    const result=await WebAssembly.instantiate(bytes,{}); this.e=result.instance.exports;
    this.bytes=new Uint8Array(this.e.memory.buffer);this.loaded=false;this.last=null;this.changes=[];
    return this;
  }
  string(p,n) {
    if(n===undefined){let q=p;while(this.bytes[q])q++;n=q-p;}
    return new TextDecoder().decode(this.bytes.subarray(p,p+n));
  }
  error(){return this.string(this.e.error_ptr());}
  load(bytes){
    if(!bytes.length || bytes.length>this.e.input_capacity())throw Error('Choose a nonempty LC4 .obj file, up to 4 MiB total.');
    this.bytes.set(bytes,this.e.input_ptr());
    if(this.e.load_obj(bytes.length))throw Error(this.error());
    this.loaded=true;this.last=null;this.changes=[];return this.state();
  }
  state(){
    const e=this.e;
    return {pc:e.get_pc(),nzp:e.get_nzp(),privileged:!!e.get_privileged(),steps:e.get_steps(),entry:e.get_entry(),words:e.get_words(),regs:Array.from(new Uint16Array(e.memory.buffer,e.regs_ptr(),8))};
  }
  memory(){return new Uint16Array(this.e.memory.buffer,this.e.memory_ptr(),65536);}
  kinds(){return new Uint8Array(this.e.memory.buffer,this.e.kind_ptr(),65536);}
  label(a){return this.string(this.e.label_ptr(a),this.e.label_len(a));}
  step(){
    if(!this.loaded)throw Error('Load a program first.');
    const before=this.state(),ins=this.memory()[before.pc],assembly=decode(ins,before.pc);
    const result=this.e.step_cpu();
    if(result)return {ok:false,reason:this.error(),state:this.state()};
    const after=this.state(),addr=this.e.get_last_address();
    this.last={pc:before.pc,ins,assembly,before,after,regs:after.regs.map((v,i)=>v!==before.regs[i]?i:-1).filter(i=>i>=0),store:addr<65536?{address:addr,before:this.e.get_last_before(),after:this.e.get_last_after()}:null};
    if(this.last.store){this.changes.unshift({...this.last.store,step:after.steps});this.changes=this.changes.slice(0,50);}
    return {ok:true,state:after,last:this.last};
  }
  reset(){this.e.reset_cpu();this.last=null;this.changes=[];return this.state();}
  entry(a){if(!Number.isInteger(a)||a<0||a>65535)throw Error('Enter a hexadecimal address from x0000 to xFFFF.');if(this.e.set_entry(a))throw Error(this.error());this.last=null;this.changes=[];return this.state();}
}
export function demoObject(){
  const data=[];const word=n=>data.push(n>>>8,n&255);
  const code=[0x9005,0x9200,0x1240,0x103f,0x03fd,0x9400,0xd420,0x7280,0x6680];
  word(0xcade);word(0);word(code.length);code.forEach(word);
  word(0xdada);word(0x2000);word(1);word(0);
  for(const [a,s] of [[0,'START'],[2,'SUM_LOOP'],[7,'STORE_RESULT'],[0x2000,'RESULT']]){word(0xc3b7);word(a);word(s.length);data.push(...new TextEncoder().encode(s));}
  return Uint8Array.from(data);
}
