# Raining Whale (exploding whale, Florence, Oregon, 1970)

A second short made with the cartoon-3d-short skill.

| Path | What it is |
|---|---|
| `SCRIPT.md` | Facts with sources, then the approved narration |
| `voice.wav`, `words.json`, `lines.json` | Narration: Piper TTS (`en_US-ryan-high`, length 0.86), with word timings from faster-whisper (`tts.py`, `align.py`) |
| `src/` | Remotion composition `WhaleShort` (copy it to `src/videos/whale/` and register it in `src/Root.tsx`) |
| `audio/whale_audio.py` | Synthesized SFX and an original oompah score, mixed under the voice. Needs `dsp.py`, `instruments.py` and `sfx_gen.py` from `templates/audio/` |
| `audio/cues.md` | Every sound cue with its time and frame |

Render: `npx remotion render src/index.ts WhaleShort out/whale/video.mp4 --codec h264 --crf 16`, then mux it with `audio/mix.wav` (`-map 0:v:0 -map 1:a:0`).
