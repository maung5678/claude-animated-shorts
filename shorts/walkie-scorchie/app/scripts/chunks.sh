#!/bin/bash
# renders the film in chunks of 206 frames (resumable): out/final/chunk_NN.mp4, then joins them with the mix
cd "$(dirname "$0")/.."
mkdir -p out/final
for k in $(seq 0 9); do
  a=$((k * 206)); b=$((a + 205)); [ $b -gt 2059 ] && b=2059
  f=out/final/chunk_$(printf %02d $k).mp4
  [ -s "$f" ] && continue
  npx remotion render src/index.ts WalkieShort "$f.tmp.mp4" --frames=$a-$b --codec h264 --crf 16 --concurrency 1 \
    --browser-executable /opt/pw-browsers/chromium --gl swangle --timeout 600000 --log error && mv "$f.tmp.mp4" "$f"
  echo "chunk $k done $(date +%T)"
done
echo ALLDONE
