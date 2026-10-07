"""Build the C simulator with Clang/lld or python's ziglang package."""
from pathlib import Path
import shutil, subprocess, sys
root=Path(__file__).resolve().parents[1]
exports=['input_ptr','input_capacity','regs_ptr','memory_ptr','kind_ptr','get_pc','get_nzp','get_privileged','get_steps','get_entry','get_words','get_last_address','get_last_before','get_last_after','get_last_pc','label_ptr','label_len','error_ptr','load_obj','reset_cpu','set_entry','step_cpu']
if shutil.which('clang'):
    cc=['clang','--target=wasm32']
else:
    cc=[sys.executable,'-m','ziglang','cc','-target','wasm32-freestanding']
args=cc+['-O2','-nostdlib','-ffreestanding','-fno-builtin','-Iinclude','-Wl,--no-entry','-Wl,--initial-memory=16777216','-Wl,--max-memory=16777216']
args += ['-Wl,--export='+name for name in exports]
subprocess.run(args+['src/lc4_cpu.c','src/lc4_web.c','-o','dist/lc4.wasm'],cwd=root,check=True)
print('Built dist/lc4.wasm from C source')
