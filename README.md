# LC4 Studio — Lulin He

**By Lulin He**

[Live Demo](https://lulin-lc4-studio.lh556.chatgpt.site) · [Source Code](https://github.com/Bristenlin762/lc4-studio)

An interactive, browser-based LC4 debugger powered by a **C CPU core compiled to WebAssembly**. Load PennSim-format LC4 `.obj` files, inspect memory and disassembled instructions, and watch registers and memory change during execution.

## Demo

The live demo is available at the link above. A recorded walkthrough will be added here.

<!-- After recording, create media/demo.gif and uncomment the preview below:
![LC4 simulator walkthrough](media/demo.gif)
-->
<!-- Add the uploaded video link here when it is ready. -->

## Try it

Open the deployed site and choose **Load demo**, then **Step** or **Run**. The included program sums 1 through 5, stores 15 at `x2000`, then loads it into R3. Choose **Go** with `x2000` to inspect the result. Reset restores both registers and the original memory image.

You can also select one or more `.obj` files at once. Files are parsed in selection order; later sections overwrite earlier words at the same address. The initial PC is the start of the first nonempty CODE section. Use **Start address → Apply & reset** to choose another loaded code address.

Object files are read and executed entirely in the browser tab. The app does not send object bytes to a server. Page reload discards the loaded session.

## Implemented

- Big-endian LC4 CODE (`CADE`), DATA (`DADA`) and SYMBOL (`C3B7`) sections; skips filename (`F17E`) and line-number (`715E`) metadata.
- Bounded loading with truncation, unknown-header and address-overflow checks. Failed loads preserve the existing CPU state and labels.
- ADD/MUL/SUB/DIV, CMP/CMPU/CMPI/CMPIU, AND/NOT/OR/XOR, CONST/HICONST, SLL/SRA/SRL/MOD, BR/NOP, JSR/JSRR, JMP/JMPR/RET, LDR/STR and RTI.
- 8 registers, PC, NZP, supervisor state, 65,536 addressable 16-bit memory words.
- Step, bounded asynchronous Run, Pause, Reset, editable starting address, memory paging and address navigation.
- Memory words and code disassembly, object labels, code/data classification, signed register values, last-instruction effects and recent memory writes.

## Deliberate limits

**TRAP is not executed.** It pauses before changing CPU state. PennSim operating-system routines, console I/O and memory-mapped devices are not emulated. RTI requires supervisor mode; a starting address at or above `x8000` initializes supervisor mode.

Execution pauses when the PC leaves a loaded CODE section. This is a debugger boundary, not an LC4 HALT instruction. Run has a configurable 1–100,000-instruction limit to keep loops bounded; it yields to the browser every 100 instructions for Pause.

Memory is a unified 16-bit array. The simulator does not enforce PennSim's full instruction/data privilege or device-access rules. Writes to loaded code are visible and subsequently re-disassembled. Unloaded addresses display a dash rather than being presented as code. Data addresses display `.FILL` values.

LEA and LC are assembler pseudo-instructions and RET is shown as the JMPR R7 alias. This app consumes assembled `.obj` files; it does not assemble arbitrary `.asm` source. The object loader caps combined input at 4 MiB. Reset uses the last successful loaded image.

## Architecture and project history

The C CPU core extends Lulin He's existing `lc4_cpu.c` and `lc4_cpu.h`. The browser loader adapts the CODE/DATA/SYMBOL parsing flow of her earlier C course loader to a bounded in-memory buffer, preserving the object-loading work while replacing host `FILE*` and linked-list storage with CPU arrays. The previous course files included starter contributions credited to `tjf`; they are not bundled as untouched original files in this project.

The original CLI bridge copied linked-list nodes into the CPU memory array. Here, `lc4_web.c` parses directly into a staging CPU image and commits it only after validation. The UI does not execute LC4 instructions in JavaScript: all CPU effects come from compiled C. JavaScript handles disassembly, browser controls and display.

| File | Responsibility |
| --- | --- |
| `include/lc4_cpu.h` | CPU state and execution interface |
| `src/lc4_cpu.c` | LC4 instruction semantics and NZP updates |
| `src/lc4_web.c` | Buffer loader, initial snapshot, labels and WebAssembly API |
| `dist/engine.js` | C/WebAssembly bridge and state inspection |
| `dist/decoder.js` | Instruction disassembly |
| `dist/app.js` | Browser controls, paging and effect highlighting |
| `dist/index.html`, `dist/style.css` | Responsive debugger UI |
| `dist/lc4.wasm` | Generated executable C core, checked in for immediate use |
| `examples/demo.asm`, `examples/demo.obj` | Standalone summation demo |
| `scripts/build_wasm.py` | Reproducible Clang or Zig build |
| `tests/check.mjs` | Execution and loader regression checks |

## Run locally

The built WebAssembly binary is included, so no C compiler is needed to try the interface:

```sh
make serve
```

Open `http://localhost:8000`. Alternatively: `python3 -m http.server 8000 --directory dist`. Opening `index.html` directly with a `file://` URL will not load the engine correctly; use the local HTTP server.

## Rebuild the C core

Use Clang with its WebAssembly linker, or install Zig's Python package:

```sh
python3 -m pip install ziglang
make
```

To force a rebuild after changing the compiler environment: `make clean && make`.

Run verification with Node.js 18 or later:

```sh
make check
```

## Demo recording

1. Load demo and show code, labels and registers.
2. Step into SUM_LOOP and explain R1 accumulation and NZP-controlled branching.
3. Run to the end of loaded code; show R1 = R3 = 15.
4. Jump to `x2000` and show the STR write from 0 to 15.
5. Reset and show original memory restored.
6. Load a separate `.obj` and inspect its entry address and code.

## Planned improvements

- Preserve loaded programs in the current browser session so users can switch between their object file and the built-in demo without selecting the file again. Currently, each Load .obj action opens the file chooser, and Load demo replaces the current image.
- Separate code/disassembly and data-memory views so memory values and STR updates can be inspected side by side. Currently, both use the same memory table, with a separate recent-writes panel.
