#!/usr/bin/env bash
# One-shot installer for the cartoon-3d-short skill.
#   1. installs the skill into ~/.claude/skills/cartoon-3d-short
#   2. scaffolds a Remotion + three.js project (default ~/shorts-studio) with the bridge short registered
#   3. copies the sound pipeline to ~/bridge-short/audio and installs its Python deps
#
# usage: ./install.sh [project_dir]        env: SKIP_NPM=1 / SKIP_PIP=1 to skip installs
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="${HOME}/.claude/skills/cartoon-3d-short"
PROJ="${1:-${HOME}/shorts-studio}"
AUDIO_DIR="${HOME}/bridge-short/audio"

say() { printf '\n==> %s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 ($2)"; exit 1; }; }

need node  "install Node 18+ from https://nodejs.org"
need npm   "comes with Node"
need python3 "install Python 3.10+"
command -v ffmpeg >/dev/null 2>&1 || echo "WARNING: ffmpeg not found - needed for muxing and loudness QA."

# 1. Skill ---------------------------------------------------------------------------------------------
say "Installing skill -> ${SKILL_DIR}"
mkdir -p "${SKILL_DIR}"
if [ "$(cd "${SKILL_DIR}" && pwd)" != "${HERE}" ]; then
  # copy everything except git metadata
  tar -C "${HERE}" --exclude=.git -cf - . | tar -C "${SKILL_DIR}" -xf -
fi

# 2. Remotion project ----------------------------------------------------------------------------------
say "Scaffolding Remotion project -> ${PROJ}"
mkdir -p "${PROJ}/src/videos/bridge" "${PROJ}/scripts" "${PROJ}/public/bridge/kenney" "${PROJ}/out" "${PROJ}/src/sandboxes"
cp -f "${HERE}"/templates/bridge/* "${PROJ}/src/videos/bridge/"
cp -f "${HERE}"/templates/scripts/* "${PROJ}/scripts/"

[ -f "${PROJ}/package.json" ] || cat > "${PROJ}/package.json" <<'JSON'
{
  "name": "shorts-studio",
  "private": true,
  "type": "module",
  "scripts": {
    "studio": "remotion studio src/index.ts",
    "typecheck": "tsc --noEmit",
    "still": "remotion still src/index.ts BridgeShort out/still.jpg --frame=100 --scale=0.5 --gl=swangle",
    "render": "remotion render src/index.ts BridgeShort out/bridge/video.mp4 --codec h264 --crf 16 --scale 1.3333",
    "stills": "node scripts/bridge-stills.mjs"
  }
}
JSON

[ -f "${PROJ}/tsconfig.json" ] || cat > "${PROJ}/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true,
    "lib": ["DOM", "ES2020"]
  },
  "include": ["src"]
}
JSON

[ -f "${PROJ}/remotion.config.ts" ] || cat > "${PROJ}/remotion.config.ts" <<'TS'
import { Config } from "@remotion/cli/config";
Config.setVideoImageFormat("jpeg");
// three.js needs WebGL: swangle works everywhere (CPU); use "angle" on Windows with a GPU for ~5x speed.
Config.setChromiumOpenGlRenderer(process.platform === "win32" ? "angle" : "swangle");
TS

[ -f "${PROJ}/src/index.ts" ] || cat > "${PROJ}/src/index.ts" <<'TS'
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
TS

[ -f "${PROJ}/src/Root.tsx" ] || cat > "${PROJ}/src/Root.tsx" <<'TSX'
import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";

// Register each new short next to BridgeShort (copy src/videos/bridge -> src/videos/<name>).
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
TSX

[ -f "${PROJ}/.gitignore" ] || printf 'node_modules/\nout/\nbackup/\n' > "${PROJ}/.gitignore"

cat > "${PROJ}/public/bridge/kenney/README.txt" <<'TXT'
Optional Kenney CC0 props (the world builds without them; missing models are skipped).
Download "Nature Kit" and "Fantasy Town Kit" from https://kenney.nl/assets and copy these .glb files here:
tree_oak tree_default tree_detailed tree_fat tree_cone tree-high-round tree plant_bushLarge plant_bushDetailed
plant_bush hedge flower_redA flower_yellowA flower_purpleA grass_large grass lily_large lantern cart stall-red
stall-green stall-bench banner-red banner-green windmill canoe
TXT

if [ "${SKIP_NPM:-0}" != 1 ]; then
  say "Installing npm packages (Remotion, three.js, R3F, postprocessing)"
  # Pinned to a tested stack: @react-three/postprocessing 3 (R3F 9 / React 19) renders an empty canvas inside
  # Remotion with this composer setup, so stay on React 18 + R3F 8 + @react-three/postprocessing 2.
  ( cd "${PROJ}" && npm install --no-fund --no-audit \
      remotion@4.0.541 @remotion/cli@4.0.541 @remotion/three@4.0.541 @remotion/bundler@4.0.541 @remotion/renderer@4.0.541 \
      react@18.3.1 react-dom@18.3.1 three@0.169.0 @react-three/fiber@8.18.0 @react-three/postprocessing@2.19.1 postprocessing@6 \
  && npm install --no-fund --no-audit -D typescript@5 @types/react@18 @types/three@0.169.0 )
fi

# 3. Sound pipeline ------------------------------------------------------------------------------------
say "Copying sound pipeline -> ${AUDIO_DIR}"
mkdir -p "${AUDIO_DIR}" "${HOME}/bridge-short/voice"
cp -n "${HERE}"/templates/audio/* "${AUDIO_DIR}/" 2>/dev/null || true
cp -n "${HERE}/templates/SCRIPT_example.md" "${HOME}/bridge-short/SCRIPT.md" 2>/dev/null || true

if [ "${SKIP_PIP:-0}" != 1 ]; then
  say "Installing Python deps (numpy, scipy, pillow)"
  python3 -m pip install --quiet numpy scipy pillow 2>/dev/null \
    || python3 -m pip install --quiet --user numpy scipy pillow 2>/dev/null \
    || python3 -m pip install --quiet --break-system-packages numpy scipy pillow
fi

say "Done."
cat <<EOF
  Skill:    ${SKILL_DIR}
  Project:  ${PROJ}   (cd there, then: npx remotion studio  |  npm run still  |  npm run render)
  Audio:    ${AUDIO_DIR}
  In Claude Code say: "Use the cartoon short skill and make a short about ..."
  Tip: export REMOTION_TMP=/path/on/a/big/drive  (each bundle copies public/ into the temp folder)
EOF
