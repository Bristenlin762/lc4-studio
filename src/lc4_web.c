/* Browser adapter: bounded, big-endian LC4 object parser and CPU state API.
 * Adapts the CODE/DATA/SYMBOL parsing flow of Lulin He's course loader
 * to an in-memory input buffer; no host files, linked lists or stdio required. */
#include "lc4_cpu.h"
#include <stddef.h>
#define MAX_INPUT (4u * 1024u * 1024u)
static unsigned char input[MAX_INPUT], saved_input[MAX_INPUT];
static lc4_cpu cpu, initial, staging;
static unsigned char kind[65536], stage_kind[65536], initial_kind[65536];
static unsigned int symbols[65536], stage_symbols[65536];
static unsigned short lengths[65536], stage_lengths[65536];
static unsigned int steps, entry, words, initial_words;
static unsigned int last_address = 65536, last_before, last_after, last_pc = 65536;
static const char *web_error = "";
static unsigned int word(unsigned int p) { return ((unsigned int)input[p] << 8) | input[p+1]; }
static void copy_cpu(lc4_cpu *to, const lc4_cpu *from) {
    unsigned char *d=(unsigned char *)to; const unsigned char *s=(const unsigned char *)from;
    for (size_t i=0;i<sizeof(*to);i++) d[i]=s[i];
}
unsigned char *input_ptr(void) { return input; }
unsigned int input_capacity(void) { return MAX_INPUT; }
lc4_cpu *cpu_ptr(void) { return &cpu; }
unsigned short *regs_ptr(void) { return cpu.regs; }
unsigned short *memory_ptr(void) { return cpu.memory; }
unsigned char *kind_ptr(void) { return kind; }
unsigned int get_pc(void) { return cpu.pc; }
unsigned int get_nzp(void) { return cpu.nzp; }
unsigned int get_privileged(void) { return cpu.privileged; }
unsigned int get_steps(void) { return steps; }
unsigned int get_entry(void) { return entry; }
unsigned int get_words(void) { return words; }
unsigned int get_last_address(void) { return last_address; }
unsigned int get_last_before(void) { return last_before; }
unsigned int get_last_after(void) { return last_after; }
unsigned int get_last_pc(void) { return last_pc; }
unsigned int label_ptr(unsigned int a) { return a<65536 ? (unsigned int)(size_t)(saved_input + symbols[a]) : 0; }
unsigned int label_len(unsigned int a) { return a<65536 ? lengths[a] : 0; }
const char *error_ptr(void) { return web_error; }
int load_obj(unsigned int size) {
    web_error="";
    if (!size || size>MAX_INPUT) { web_error="Empty file or input exceeds 4 MiB"; return 1; }
    lc4_cpu_init(&staging,0);
    for(unsigned int a=0;a<65536;a++) { stage_kind[a]=0;stage_symbols[a]=0;stage_lengths[a]=0; }
    unsigned int p=0, first=65536, count=0;
    while(p<size) {
        if(size-p<2) {web_error="Truncated section header";return 1;}
        unsigned int tag=word(p);p+=2;
        if(tag==0xF17E) {
            if(size-p<2){web_error="Truncated filename section";return 1;}
            unsigned int n=word(p);p+=2;
            if(n>size-p){web_error="Truncated filename body";return 1;} p+=n;continue;
        }
        if(tag==0x715E) {
            if(size-p<6){web_error="Truncated line-number section";return 1;}p+=6;continue;
        }
        if(tag!=0xCADE && tag!=0xDADA && tag!=0xC3B7) {web_error="Unknown LC4 object section (expected CADE, DADA or C3B7)";return 1;}
        if(size-p<4){web_error="Truncated address/count fields";return 1;}
        unsigned int a=word(p),n=word(p+2);p+=4;
        if(tag==0xC3B7) {
            if(n>size-p){web_error="Truncated symbol body";return 1;}
            stage_symbols[a]=p;stage_lengths[a]=n;p+=n;
        } else {
            if(n>65536-a){web_error="Section exceeds address xFFFF";return 1;}
            if(n>(size-p)/2){web_error="Truncated code/data body";return 1;}
            if(tag==0xCADE && n && first==65536) first=a;
            for(unsigned int i=0;i<n;i++) {
                if(!stage_kind[a+i])count++;
                staging.memory[a+i]=(unsigned short)word(p);p+=2;
                stage_kind[a+i]=tag==0xCADE?1:2;
            }
        }
    }
    if(first==65536){web_error="Object contains no code section";return 1;}
    staging.pc=(unsigned short)first;staging.privileged=first>=0x8000;
    copy_cpu(&cpu,&staging);copy_cpu(&initial,&staging);
    for(unsigned int a=0;a<65536;a++) {kind[a]=initial_kind[a]=stage_kind[a];symbols[a]=stage_symbols[a];lengths[a]=stage_lengths[a];}
    for(unsigned int i=0;i<size;i++)saved_input[i]=input[i];
    entry=first;words=initial_words=count;steps=0;last_pc=last_address=65536;return 0;
}
void reset_cpu(void) {
    copy_cpu(&cpu,&initial);for(unsigned int a=0;a<65536;a++)kind[a]=initial_kind[a];
    steps=0;words=initial_words;last_pc=last_address=65536;web_error="";
}
int set_entry(unsigned int address) {
    if(address>65535 || initial_kind[address]!=1){web_error="Start address must be loaded code";return 1;}
    entry=address;initial.pc=(unsigned short)address;initial.privileged=address>=0x8000;reset_cpu();return 0;
}
int step_cpu(void) {
    web_error="";last_address=65536;
    if(kind[cpu.pc]!=1){web_error="Stopped: PC is outside loaded code";return 2;}
    unsigned int ins=cpu.memory[cpu.pc], op=ins>>12, addr=65536, before=0;
    if(op==7){
        int off=(int)(ins&63);if(off&32)off-=64;
        addr=(unsigned short)((int)cpu.regs[(ins>>6)&7]+off);before=cpu.memory[addr];
    }
    unsigned int oldpc=cpu.pc;
    if(lc4_cpu_step(&cpu)){web_error=lc4_error;return 1;}
    last_pc=oldpc;steps++;
    if(addr<65536){last_address=addr;last_before=before;last_after=cpu.memory[addr];if(!kind[addr]){kind[addr]=2;words++;}}
    return 0;
}
