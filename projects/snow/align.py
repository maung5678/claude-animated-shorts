# word timings via faster-whisper, matched to the script words -> words.json [{word,start,end}]
import json, re
from faster_whisper import WhisperModel
H = __file__.rsplit("/", 1)[0]
m = WhisperModel("small.en", device="cpu", compute_type="int8")
import wave, numpy as np
from scipy.signal import resample_poly
with wave.open(f"{H}/voice.wav") as w: x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
segs, _ = m.transcribe(resample_poly(x, 1, 3).astype(np.float32), word_timestamps=True, beam_size=5)
asr = [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
lines = json.load(open(f"{H}/lines.json"))
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
import difflib
out = []
for L in lines:  # match script words to ASR words inside the line span; unmatched words interpolate
    words = L["text"].split()
    inside = [x for x in asr if x[1] >= L["start"] - 0.15 and x[2] <= L["end"] + 0.25]
    sm = difflib.SequenceMatcher(None, [norm(w) for w in words], [norm(x[0]) for x in inside], autojunk=False)
    T = [None] * len(words)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size): T[blk.a + k] = inside[blk.b + k][1:]
    # anchors at the line ends, then linear fill by character length
    if T[0] is None: T[0] = (L["start"], None)
    for i in range(len(words)):
        if T[i] is None or T[i][1] is None:
            j = next((k for k in range(i + 1, len(words)) if T[k] and T[k][1] is not None), None)
            t0 = T[i][0] if T[i] else T[i - 1][1]
            t1 = T[j][0] if j is not None else L["end"]
            n = (j if j is not None else len(words)) - i
            seg = [len(norm(w)) or 1 for w in words[i:i + n]]; tot = sum(seg); t = t0
            for k in range(n):
                d = (t1 - t0) * seg[k] / tot; T[i + k] = (t, t + d); t += d
    for w, (s0, e0) in zip(words, T): out.append({"word": w, "start": round(s0, 3), "end": round(e0, 3), "line": L["i"]})
json.dump(out, open(f"{H}/words.json", "w"), indent=0)
print("words", len(out), "asr", len(asr))
print(" ".join(a[0] for a in asr))
