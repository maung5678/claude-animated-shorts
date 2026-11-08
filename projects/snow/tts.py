# Piper TTS: one sentence at a time, joined with fixed pauses -> voice.wav (48 kHz mono 16-bit) + lines.json
import json, re, sys, wave, numpy as np
from piper import PiperVoice, SynthesisConfig
from scipy.signal import resample_poly
HERE = __file__.rsplit("/", 1)[0]
VOICE = sys.argv[1] if len(sys.argv) > 1 else "en_US-ryan-high"
SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
text = open(f"{HERE}/../SCRIPT.md", encoding="utf-8").read().split("newengland.com (The Snow Queen of Bethel, Maine); heraldnet.com (Snow: fun facts, science and a record snowwoman)")[1]
lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
v = PiperVoice.load(f"{HERE}/model/{VOICE}.onnx")
sr = v.config.sample_rate
cfg = SynthesisConfig(length_scale=SCALE, noise_scale=0.5, noise_w_scale=0.6)
# longer breath before beat changes (snap, luckily, explanation, consequence, callback)
BEAT = {"But the town wanted more.", "When they were done, she stood a hundred and twenty-two feet tall, and weighed about thirteen million pounds.",
        "But why does snow stick together at all?", "Olympia didn't finish melting until the end of July.", "So the tallest snowperson in history is still a lady from Maine with skis for eyelashes."}
out, meta, t = [], [], 0.35
out.append(np.zeros(int(0.35 * sr), np.int16))
for i, l in enumerate(lines):
    say = l.replace("2020", "twenty twenty").replace("2008", "two thousand eight").replace("1999", "nineteen ninety-nine")
    a = np.concatenate([c.audio_int16_array for c in v.synthesize(say, syn_config=cfg)])
    # trim silence
    nz = np.where(np.abs(a) > 300)[0]; a = a[max(0, nz[0] - int(.02 * sr)): nz[-1] + int(.05 * sr)]
    meta.append({"i": i, "text": l, "start": round(t, 3), "end": round(t + len(a) / sr, 3)})
    out.append(a); t += len(a) / sr
    nxt = lines[i + 1] if i + 1 < len(lines) else None
    gap = 0.8 if nxt is None else (0.48 if nxt in BEAT else 0.22)
    out.append(np.zeros(int(gap * sr), np.int16)); t += gap
y = np.concatenate(out).astype(np.float32)
y = resample_poly(y, 48000, sr); y = np.clip(y, -32767, 32767).astype(np.int16)
with wave.open(f"{HERE}/voice.wav", "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(y.tobytes())
json.dump(meta, open(f"{HERE}/lines.json", "w"), indent=1)
print(VOICE, SCALE, "duration", round(len(y) / 48000, 2), "s")
