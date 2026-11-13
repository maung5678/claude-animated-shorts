# voice.wav from SCRIPT.md lines (Kokoro TTS, one steady male voice), then words.json (faster-whisper word times).
import sys, json, re, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
VOICE = sys.argv[1] if len(sys.argv) > 1 else "am_michael"; SPEED = float(sys.argv[2]) if len(sys.argv) > 2 else 1.1
lines = [l for l in open("../SCRIPT.md").read().split("\n\n")[-1].strip().split("\n") if l.strip()]
k = Kokoro("/root/models/kokoro.onnx", "/root/models/voices.npz")
SR = 24000; GAP = 0.10; out = []; starts = []
for l in lines:
    a, sr = k.create(l, voice=VOICE, speed=SPEED, lang="en-us"); assert sr == SR
    # trim silence
    nz = np.where(np.abs(a) > 0.01)[0]; a = a[max(0, nz[0] - 240): nz[-1] + 480]
    starts.append(sum(len(x) for x in out) / SR); out += [a, np.zeros(int(GAP * SR), np.float32)]
v = np.concatenate([np.zeros(int(0.05 * SR), np.float32)] + out)
starts = [s + 0.05 for s in starts]
sf.write("voice.wav", v, SR); print("dur", len(v) / SR, "words", sum(len(l.split()) for l in lines))
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
from scipy.signal import resample_poly
segs, _ = m.transcribe(resample_poly(v, 2, 3).astype(np.float32), word_timestamps=True, initial_prompt=" ".join(lines))
words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for s in segs for w in s.words]
json.dump({"lines": [{"text": l, "start": round(s, 3)} for l, s in zip(lines, starts)], "words": words}, open("words.json", "w"), indent=1)
print(len(words), "words timed")
