; Standalone example. Final R1 = R3 = 15, memory[x2000] = 15.
; The browser stops when PC leaves loaded code; no TRAP required.
.CODE
.ADDR x0000
START
    CONST R0, #5
    CONST R1, #0
SUM_LOOP
    ADD R1, R1, R0
    ADD R0, R0, #-1
    BRp SUM_LOOP
    CONST R2, #0
    HICONST R2, x20
STORE_RESULT
    STR R1, R2, #0
    LDR R3, R2, #0
.DATA
.ADDR x2000
RESULT
    .FILL #0
