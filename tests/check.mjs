import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Engine,demoObject} from '../dist/engine.js';
import {decode} from '../dist/decoder.js';
const engine=await new Engine().init(fs.readFileSync(new URL('../dist/lc4.wasm',import.meta.url)));
let checks=0;function eq(a,b,msg){assert.deepEqual(a,b,msg);checks++;}
function object(code,address=0,data=[]){const bytes=[];const w=v=>bytes.push((v>>>8)&255,v&255);w(0xcade);w(address);w(code.length);code.forEach(w);for(const [a,values] of data){w(0xdada);w(a);w(values.length);values.forEach(w);}return Uint8Array.from(bytes);}
function one(ins,regs=[],address=0,data=[]){engine.load(object([ins],address,data));new Uint16Array(engine.e.memory.buffer,engine.e.regs_ptr(),8).set(regs);const r=engine.step();assert.equal(r.ok,true,r.reason);checks++;return engine.state();}
engine.load(demoObject());eq(engine.label(0),'START');eq(engine.label(0x2000),'RESULT');eq(engine.kinds()[0x2000],2);
for(let i=0;i<21;i++)assert.equal(engine.step().ok,true);
eq(engine.state().regs,[0,15,0x2000,15,0,0,0,0]);eq(engine.state().steps,21);eq(engine.memory()[0x2000],15);eq(engine.step().ok,false);engine.reset();eq(engine.memory()[0x2000],0);eq(engine.state().steps,0);
// Arithmetic, sign extension, overflow and NZP.
eq(one(0x1401,[7,3]).regs[2],10);eq(one(0x1409,[7,3]).regs[2],21);eq(one(0x1411,[7,3]).regs[2],4);eq(one(0x1419,[0xfff9,3]).regs[2],0xfffe);
eq(one(0x143f,[0]).regs[2],65535);eq(one(0x143f,[0]).nzp,4);eq(one(0x1401,[65535,1]).nzp,2);
// Signed/unsigned register and immediate compares.
eq(one(0x2001,[65535,1]).nzp,4);eq(one(0x2081,[65535,1]).nzp,1);eq(one(0x217f,[65535]).nzp,2);eq(one(0x2181,[65535]).nzp,1);
// Logic register/immediate variants.
eq(one(0x5401,[0xf0,0xff]).regs[2],0xf0);eq(one(0x5408,[0xf0]).regs[2],0xff0f);eq(one(0x5411,[0xf0,0x0f]).regs[2],0xff);eq(one(0x5419,[0xf0,0xff]).regs[2],15);eq(one(0x543f,[0xf0]).regs[2],0xf0);
// Constant construction and all shift/modulo variants.
eq(one(0x95ff).regs[2],65535);eq(one(0xd412,[0,0,0xabcd]).regs[2],0x12cd);
eq(one(0xa401,[3]).regs[2],6);eq(one(0xa411,[0x8000]).regs[2],0xc000);eq(one(0xa421,[0x8000]).regs[2],0x4000);eq(one(0xa431,[0xfff9,3]).regs[2],0xffff);eq(one(0xa410,[0x8000]).regs[2],0x8000);
// Memory read/write with negative offsets and address wrapping.
eq(one(0x643f,[0],0,[[0xffff,[123]]]).regs[2],123);
engine.load(object([0x743f]));new Uint16Array(engine.e.memory.buffer,engine.e.regs_ptr(),8).set([0,0,0xbeef]);engine.step();eq(engine.memory()[0xffff],0xbeef);eq(engine.last.store.address,0xffff);engine.reset();eq(engine.memory()[0xffff],0);eq(engine.kinds()[0xffff],0);eq(engine.state().words,1);
// Branch conditions, PC wrap, calls, return aliases, and privilege.
eq(one(0x0401).pc,2);eq(one(0x0201).pc,1);eq(one(0x0000).pc,1);eq(one(0x0000,[],0xffff).pc,0);
eq(one(0x4801).pc,16);eq(one(0x4801).regs[7],1);eq(one(0x4801,[],0x8000).pc,0x8010);
eq(one(0x41c0,[0,0,0,0,0,0,0,12]).pc,12);eq(engine.state().regs[7],1);
eq(one(0xc801).pc,2);eq(one(0xc1c0,[0,0,0,0,0,0,0,20]).pc,20);
engine.load(object([0x8000],0x8000));new Uint16Array(engine.e.memory.buffer,engine.e.regs_ptr(),8)[7]=0;eq(engine.step().ok,true);eq(engine.state().privileged,false);eq(engine.state().pc,0);
for(const ins of [0xf025,0x8000,0x1419,0xa431,0x3000,0x1420]){
  engine.load(object([ins]));const before=engine.state();const r=engine.step();
  if(ins===0x1420)assert.equal(r.ok,true);else{eq(r.ok,false);eq(engine.state(),before);}
}
// Loader errors must not partially replace a running program or its labels.
engine.load(demoObject());engine.step();const old=engine.state();
for(const bad of [new Uint8Array(),Uint8Array.of(0xca),Uint8Array.of(0xca,0xde,0,0,0,1),Uint8Array.of(1,2),object([0],0xffff).slice(0,-1),Uint8Array.of(0xca,0xde,0xff,0xff,0,2,0,0,0,0)]){assert.throws(()=>engine.load(bad));checks++;eq(engine.state(),old);eq(engine.label(0),'START');}
// Symbols can precede CODE sections; metadata sections are safely skipped.
const prefix=Uint8Array.of(0xc3,0xb7,0,0,0,3,65,66,67,0xf1,0x7e,0,1,120,0x71,0x5e,0,1,0,0,0,0);
const mixed=new Uint8Array(prefix.length+8);mixed.set(prefix);mixed.set(object([0x9001]),prefix.length);engine.load(mixed);eq(engine.label(0),'ABC');
assert.throws(()=>engine.entry(0x2000));checks++;eq(engine.state().pc,0);
// Disassembler variants.
eq(decode(0x03fd,4),'BRp x0002');eq(decode(0x6680,8),'LDR R3, R2, #0');eq(decode(0xc1c0,0),'RET');eq(decode(0xf025,0),'TRAP x0025 (unsupported)');
console.log(`${checks} checks passed: C/WebAssembly execution, loader validation, reset, labels and disassembly.`);
