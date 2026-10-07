#ifndef LC4_CPU_H // if LC4_CPU_H is not defined
#define LC4_CPU_H // then define it

#include <stdint.h>
#include <stdbool.h>

#define LC4_MEMORY_SIZE 65536u

/* NZP bit */
#define LC4_N 0X4u
#define LC4_Z 0X2u
#define LC4_P 0X1u

typedef struct {
    uint16_t regs[8];
    uint16_t pc;
    uint8_t nzp;
    uint16_t memory[LC4_MEMORY_SIZE]; /* every address contains a 16-bit word */

    bool halted;
    bool privileged;  /* PSR[15] */
} lc4_cpu;

void lc4_cpu_init(lc4_cpu *cpu, uint16_t start_address);




/* return 0 means successful execution */
extern const char *lc4_error;
int lc4_cpu_step(lc4_cpu *cpu);

#endif // LC4_CPU_H
