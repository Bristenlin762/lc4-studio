export const hex = n => 'x' + (n & 65535).toString(16).toUpperCase().padStart(4,'0');
export const signed = (n,b=16) => (n & ((1<<b)-1)) - ((n & (1<<(b-1))) ? (1<<b) : 0);
export function decode(w,pc) {
  const op=w>>>12,d=(w>>>9)&7,s=(w>>>6)&7,t=w&7,sub=(w>>>3)&7;
  const R=n=>'R'+n, imm=b=>'#'+signed(w,b), target=b=>hex(pc+1+signed(w,b));
  switch(op){
    case 0: { const c=(w>>>9)&7; return c ? 'BR'+((c&4?'n':'')+(c&2?'z':'')+(c&1?'p':''))+' '+target(9) : 'NOP'; }
    case 1: return w&32 ? `ADD ${R(d)}, ${R(s)}, ${imm(5)}` : sub<4 ? `${['ADD','MUL','SUB','DIV'][sub]} ${R(d)}, ${R(s)}, ${R(t)}` : '.INVALID';
    case 2: {const m=(w>>>7)&3;return `${['CMP','CMPU','CMPI','CMPIU'][m]} ${R(d)}, ${m<2?R(t):m===2?imm(7):'#'+(w&127)}`;}
    case 4: return w&2048 ? 'JSR '+hex((pc&32768)|((w&2047)<<4)) : 'JSRR '+R(s);
    case 5: return w&32 ? `AND ${R(d)}, ${R(s)}, ${imm(5)}` : sub<4 ? `${['AND','NOT','OR','XOR'][sub]} ${R(d)}, ${R(s)}${sub===1?'':', '+R(t)}` : '.INVALID';
    case 6: return `LDR ${R(d)}, ${R(s)}, ${imm(6)}`;
    case 7: return `STR ${R(d)}, ${R(s)}, ${imm(6)}`;
    case 8: return 'RTI';
    case 9: return `CONST ${R(d)}, ${imm(9)}`;
    case 10: {const m=(w>>>4)&3;return m===3 ? `MOD ${R(d)}, ${R(s)}, ${R(t)}` : `${['SLL','SRA','SRL'][m]} ${R(d)}, ${R(s)}, #${w&15}`;}
    case 12: return w&2048 ? 'JMP '+target(11) : s===7 ? 'RET' : 'JMPR '+R(s);
    case 13: return `HICONST ${R(d)}, #${w&255}`;
    case 15: return 'TRAP '+hex(w&255)+' (unsupported)';
    default: return '.INVALID '+hex(w);
  }
}
