#include "lc4_cpu.h"
#include <stddef.h>
const char *lc4_error = "";

void lc4_cpu_init(lc4_cpu *cpu, uint16_t start_address) {
    unsigned char *bytes = (unsigned char *)cpu;
    for (size_t i = 0; i < sizeof(*cpu); ++i) bytes[i] = 0;
    lc4_error = "";

    cpu->pc = start_address; 
    cpu->nzp = LC4_Z;
    cpu->halted = false;
}

static void update_nzp(lc4_cpu *cpu, uint16_t value) {
    if (value == 0) {
        cpu->nzp = LC4_Z;
    } else if ((value & 0x8000u) != 0) {
        cpu->nzp = LC4_N;
    } else {
        cpu->nzp = LC4_P;
    }
    
}

/* Sign-extend the lower 'bits' bits of a 16-bit value to a 32-bit signed integer */
static int32_t sign_extend(uint16_t value, unsigned int bits)
{
    uint32_t mask = (1u << bits) - 1u;
    int32_t result = (int32_t)(value & mask);

    if ((value & (1u << (bits - 1u))) != 0) {
        result -= (int32_t)(1u << bits);
    }

    return result;
}

/* Compare two 16-bit values and update the NZP flag accordingly */
static void compare_nzp(lc4_cpu *cpu, int32_t a, int32_t b)
{
    if (a < b) {
        cpu->nzp = LC4_N;
    } else if (a == b) {
        cpu->nzp = LC4_Z;
    } else {
        cpu->nzp = LC4_P;
    }
}

int lc4_cpu_step(lc4_cpu *cpu) {
    lc4_error = "";
    if (cpu->halted) {
        lc4_error = "CPU is halted";
        return 1;
    }

    uint16_t instruction = cpu->memory[cpu->pc];

    unsigned int opcode = instruction >> 12;
    unsigned int rd = (instruction >> 9) & 0x7u;
    unsigned int rs = (instruction >> 6) & 0x7u;
    unsigned int rt = instruction & 0x7u;

    uint16_t next_pc = (uint16_t)(cpu->pc + 1u);
    uint16_t result = 0;

    bool write_reg = false;
    unsigned int destination = rd;
    const char *error = NULL;

    switch(opcode) {
    case 0x0: { /* NOP / BR */
        unsigned int condition = (instruction >> 9) & 0x7u;

        if ((condition & cpu->nzp) != 0) {
            next_pc = (uint16_t)(
                (int32_t)cpu->pc + 1 +
                sign_extend(instruction, 9)
            );
        }
        break;
    }

    case 0x1: { /* ADD / MUL / SUB / DIV */
        if ((instruction & 0x0020u) != 0) {
            result = (uint16_t)(
                (int32_t)cpu->regs[rs] +
                sign_extend(instruction, 5)
            );
        } else {
            unsigned int sub = (instruction >> 3) & 0x7u;

            int32_t a = sign_extend(cpu->regs[rs], 16);
            int32_t b = sign_extend(cpu->regs[rt], 16);

            switch (sub) {
            case 0:
                result = (uint16_t)(a + b);
                break;
            case 1:
                result = (uint16_t)(a * b);
                break;
            case 2:
                result = (uint16_t)(a - b);
                break;
            case 3:
                if (b == 0) {
                    error = "Division by zero";
                } else {
                    result = (uint16_t)(a / b);
                }
                break;
            default:
                error = "Invalid arithmetic sub-opcode";
                break;
            }
        }

        write_reg = true;
        break;
    }

    case 0x2: { /* CMP / CMPU / CMPI / CMPIU */
        unsigned int source = (instruction >> 9) & 0x7u;
        unsigned int sub = (instruction >> 7) & 0x3u;

        switch (sub) {
        case 0:
            compare_nzp(cpu,
                        sign_extend(cpu->regs[source], 16),
                        sign_extend(cpu->regs[rt], 16));
            break;

        case 1:
            compare_nzp(cpu,
                        cpu->regs[source],
                        cpu->regs[rt]);
            break;

        case 2:
            compare_nzp(cpu,
                        sign_extend(cpu->regs[source], 16),
                        sign_extend(instruction, 7));
            break;

        case 3:
            compare_nzp(cpu,
                        cpu->regs[source],
                        instruction & 0x007Fu);
            break;
        }
        break;
    }

    case 0x4: { /* JSR / JSRR */
        /*
        * Read Target Address and and then write to R7.
        * This ensures that JSRR R7 will use the original value of R7.
        */
        if ((instruction & 0x0800u) != 0) {
            next_pc = (uint16_t)(
                (cpu->pc & 0x8000u) |
                ((instruction & 0x07FFu) << 4)
            );
        } else {
            next_pc = cpu->regs[rs];
        }

        destination = 7;
        result = (uint16_t)(cpu->pc + 1u);
        write_reg = true;
        break;
    }

    case 0x5: { /* AND / NOT / OR / XOR */
        if ((instruction & 0x0020u) != 0) {
            result = (uint16_t)(
                cpu->regs[rs] &
                (uint16_t)sign_extend(instruction, 5)
            );
        } else {
            unsigned int sub = (instruction >> 3) & 0x7u;

            switch (sub) {
            case 0:
                result = cpu->regs[rs] & cpu->regs[rt];
                break;
            case 1:
                result = (uint16_t)~cpu->regs[rs];
                break;
            case 2:
                result = cpu->regs[rs] | cpu->regs[rt];
                break;
            case 3:
                result = cpu->regs[rs] ^ cpu->regs[rt];
                break;
            default:
                error = "Invalid logic sub-opcode";
                break;
            }
        }

        write_reg = true;
        break;
    }

    case 0x6: { /* LDR */
        uint16_t address = (uint16_t)(
            (int32_t)cpu->regs[rs] +
            sign_extend(instruction, 6)
        );

        result = cpu->memory[address];
        write_reg = true;
        break;
    }

    case 0x7: { /* STR */
        uint16_t address = (uint16_t)(
            (int32_t)cpu->regs[rs] +
            sign_extend(instruction, 6)
        );

        /* bits 11–9 of STR indicate the source register */
        cpu->memory[address] = cpu->regs[rd];
        break;
    }

    case 0x8: { /* RTI */
        if (!cpu->privileged) {
            error = "RTI requires privileged mode";
        } else {
            next_pc = cpu->regs[7];
            cpu->privileged = false;
        }
        break;
    }

    case 0x9: { /* CONST */
        result = (uint16_t)sign_extend(instruction, 9);
        write_reg = true;
        break;
    }

    case 0xA: { /* SLL / SRA / SRL / MOD */
        unsigned int sub = (instruction >> 4) & 0x3u;
        unsigned int amount = instruction & 0xFu;
        uint16_t value = cpu->regs[rs];

        switch (sub) {
        case 0: /* SLL */
            result = (uint16_t)((uint32_t)value << amount);
            break;

        case 1: /* SRA: arithmetic right shift, fills with sign bit */
            result = (uint16_t)(value >> amount);

            if ((value & 0x8000u) != 0 && amount != 0) {
                result = (uint16_t)(
                    result |
                    (0xFFFFu << (16u - amount))
                );
            }
            break;

        case 2: /* SRL */
            result = (uint16_t)(value >> amount);
            break;

        case 3: { /* MOD */
            int32_t a = sign_extend(value, 16);
            int32_t b = sign_extend(cpu->regs[rt], 16);

            if (b == 0) {
                error = "Modulo by zero";
            } else {
                result = (uint16_t)(a % b);
            }
            break;
        }
        }

        write_reg = true;
        break;
    }

    case 0xC: { /* JMP / JMPR */
        if ((instruction & 0x0800u) != 0) {
            next_pc = (uint16_t)(
                (int32_t)cpu->pc + 1 +
                sign_extend(instruction, 11)
            );
        } else {
            next_pc = cpu->regs[rs];
        }
        break;
    }

    case 0xD: { /* HICONST */
        result = (uint16_t)(
            (cpu->regs[rd] & 0x00FFu) |
            ((instruction & 0x00FFu) << 8)
        );

        write_reg = true;
        break;
    }

    case 0xF: /* TRAP deliberately excluded: stop before execution */
        error = "TRAP is not implemented; paused before execution";
        break;

    default:
        error = "Unsupported opcode";
        break;
    }

    if (error != NULL) {
        lc4_error = error;
        return 1;
    }

    if (write_reg) {
        cpu->regs[destination] = result;
        update_nzp(cpu, result);
    }

    cpu->pc = next_pc;
    return 0;
}
