all: dist/lc4.wasm

dist/lc4.wasm: src/lc4_cpu.c src/lc4_web.c include/lc4_cpu.h scripts/build_wasm.py
	python3 scripts/build_wasm.py

serve:
	python3 -m http.server 8000 --directory dist

check: all
	node tests/check.mjs

clean:
	rm -f dist/lc4.wasm
.PHONY: all serve check clean
