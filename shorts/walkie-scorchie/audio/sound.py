# Soundtrack of "The Tower That Cooked a Car": original synthesized score (cheeky pizzicato + bassoon two-step,
# 112 BPM in F), synthesized SFX on the picture's word clock, and the mix: voice gain only, music ducked under the
# voice (user standard: music +3 dB, SFX -6 dB), master to -14 LUFS / -1 dBTP. Writes mix.wav, stems, cues.md.
import json, os
import numpy as np
from scipy import signal
from dsp import SR, TAU, ns, tt, rng, lp, hp, bp, colored, smooth_noise, fades, phase, modal, pan, st, place, widen, make_ir, convolve_st, \
    integrated, true_peak, read_wav, write_wav, dbg, shape, momentary_max
import instruments as I
import sfx_gen as G

HERE = os.path.dirname(os.path.abspath(__file__))
FPS, TOTAL = 30, 2060
DUR = TOTAL / FPS
N = ns(DUR)
W = json.load(open(os.path.join(HERE, "../voice/words.json")))

# ---------------------------------------------------------------- voice
v, vsr = read_wav(os.path.join(HERE, "../voice/voice.wav"))
v = signal.resample_poly(v[0], SR, vsr)
voice = np.zeros(N); voice[: min(N, len(v))] = v[:N]
voice = st(voice)

# ---------------------------------------------------------------- score
BPM = 112; B = 60 / BPM; BAR = 4 * B
F = I.m2f
CH = {"F": [53, 57, 60], "Dm": [50, 53, 57], "Gm": [55, 58, 62], "C7": [48, 52, 55, 58], "Bb": [46, 50, 53], "A7": [45, 49, 52, 55], "Fd": [53, 56, 60]}
LOOP = ["F", "Dm", "Gm", "C7"]
MEL = [(0, 72, 0.5), (0.5, 74, 0.5), (1, 76, 1), (2, 72, 0.5), (3, 69, 1),   # cheeky tune per 2 bars (beat, midi, len)
       (4, 70, 0.5), (4.5, 72, 0.5), (5, 74, 1), (6, 70, 0.5), (6.5, 67, 0.5), (7, 72, 1)]
tracks = {k: np.zeros((2, N)) for k in ["bass", "pizz", "mel", "perc", "pad", "brass"]}
R = rng(2013)

def bar_block(t0, bars, vel=0.7, mel=True, brass=False, chords=LOOP):
    for b in range(bars):
        tb = t0 + b * BAR; ch = CH[chords[b % len(chords)]]
        if tb >= DUR: return
        for k, beat in enumerate([0, 2]):  # bassoon-ish bass on 1 and 3 (root, fifth)
            m = ch[0] - 12 if k == 0 else ch[2] - 24
            place(tracks["bass"], pan(I.brass(F(m), B * 0.8, vel * 0.8, R, kind="soft", scoop=-10), -0.2), tb + beat * B)
        for beat in [1, 3]:  # pizz chord on the off-beats
            for m in ch[:3]: place(tracks["pizz"], pan(I.pluck(F(m + 12), vel * 0.45, R, 0.5, 0.6), 0.3), tb + beat * B + R.uniform(0, 0.008))
        for beat in [0, 1, 2, 3]: place(tracks["perc"], pan(I.brush(vel * (0.5 if beat % 2 else 0.3), R, 0.25), 0.15), tb + beat * B)
        if mel:
            for (bt, m, ln) in MEL:
                if (b % 2) * 4 <= bt < (b % 2) * 4 + 4:
                    place(tracks["mel"], pan(I.pluck(F(m), vel * 0.7, R, 0.6, 0.8) + 0.5 * I.glock(F(m + 12), vel * 0.25, R, 0.6), 0.05), tb + (bt - (b % 2) * 4) * B)
        if brass:
            for beat in [1, 3]: place(tracks["brass"], pan(I.brass(F(ch[1] + 12), B * 0.5, vel * 0.5, R, kind="stab"), -0.3), tb + beat * B)

# sections (s): main theme from the first word, stop-time for the double line, soft pad for the explanation,
# theme back with brass, sad trombone on "worst", bright Vegas tag, button on the splash
bar_block(0.0, int(36.4 // BAR), 0.7)
place(tracks["brass"], pan(I.brass(F(41), 0.4, 0.8, R, kind="stab"), 0), 38.74)                       # "Unluckily": stab
place(tracks["perc"], I.triangle(0.7, R, 2.0), 39.95); place(tracks["perc"], I.cymbal(0.5, R, 2.5), 39.95)
for i, m in enumerate([72, 76, 79, 84]): place(tracks["mel"], pan(I.glock(F(m), 0.6, R, 1.5), 0.2), 39.95 + i * 0.07)
bar_block(40.3, 1, 0.55, mel=False)
for k, (t0, chd) in enumerate([(41.0, "F"), (43.6, "Gm"), (46.2, "Bb"), (48.8, "C7"), (51.4, "F")]):  # explanation pad + vibes
    place(tracks["pad"], I.pad([F(m) for m in CH[chd]], 2.6, 0.5, R, att=0.4, rel=0.6), t0)
    for j, m in enumerate(CH[chd] + [CH[chd][0] + 12]): place(tracks["mel"], pan(I.vibes(F(m + 12), 0.35, R, 1.2), 0.25 * (j - 1.5)), t0 + j * B)
bar_block(53.8, int((61.0 - 53.8) // BAR), 0.8, brass=True)
for i, (m, d) in enumerate([(58, 0.32), (57, 0.32), (56, 0.32), (55, 1.1)]):                         # sad trombone "worst"
    place(tracks["brass"], pan(I.brass(F(m - 12), d, 0.75, R, kind="horn", fall=-1.2 if i == 3 else 0), 0), 61.1 + i * 0.36)
bar_block(62.7, int((DUR - 62.7) // BAR) + 1, 0.8, brass=True, chords=["F", "Bb", "C7", "F"])
place(tracks["perc"], I.cymbal(0.9, R, 2.0), 67.25); place(tracks["brass"], pan(I.brass(F(41), 0.9, 0.9, R, kind="stab"), 0), 67.25)
music = sum(tracks.values())
ir = make_ir(1.4, 7, hf=0.6)
music = music + 0.18 * convolve_st(music, ir)[:, :N]
# end the score with the picture
music[:, ns(DUR - 0.25):] *= np.linspace(1, 0, N - ns(DUR - 0.25))[None, :]

# ---------------------------------------------------------------- sfx
sfx = np.zeros((2, N)); CUES = []
def ev(t, x, name, g=1.0, p=0.0):
    place(sfx, pan(x, p) if np.asarray(x).ndim == 1 else x, t, g); CUES.append((t, name))
def sizzle(dur, r, lvl=1.0):
    n = ns(dur); nz = r.standard_normal(n)
    cr = (r.random(n) < 0.004) * r.standard_normal(n) * 3
    return fades(hp(nz * 0.25 + cr, 2500) * lvl * (0.6 + 0.4 * smooth_noise(n, r, 8)), 0.05, 0.1)
def gliss(f0, f1, dur, wob=0.0, wr=7.0, kind="sine"):
    t = tt(dur); f = f0 * (f1 / f0) ** (t / dur) * (1 + wob * np.sin(TAU * wr * t))
    y = np.sin(phase(f)) if kind == "sine" else signal.sawtooth(phase(f), 0.5)
    return fades(y * np.minimum(1, t / 0.01), 0.005, 0.05)
def beep(f, d=0.08): t = tt(d); return fades(np.sin(TAU * f * t) * 0.6 + 0.2 * np.sin(TAU * 2 * f * t), 0.003, 0.01)
def thud(r, f=70, d=0.25): t = tt(d); return np.exp(-t / 0.06) * np.sin(phase(f * (1 + 0.6 * np.exp(-t / 0.01)))) + bp(r.standard_normal(len(t)), 200, 2000, 1) * np.exp(-t / 0.01) * 0.3
def pop(r): t = tt(0.15); return np.exp(-t / 0.02) * np.sin(phase(900 * (1 - 0.5 * t / 0.15))) + hp(r.standard_normal(len(t)), 2000) * np.exp(-t / 0.004)
def ratchet(r, dur, rate=14): out = np.zeros(ns(dur));
for _ in []: pass
def amb_city(dur, r):
    n = ns(dur); rumble = lp(colored(n, r, 1.2), 300) * 0.5; air = G.breeze(dur, r, 0.6)
    return st(rumble) * 0.6 + widen(air, r, 13, 0.8) * 0.5
r = rng(7)
# beds
for (a, b, kind) in [(0, 36.5, "city"), (53.8, 62.66, "city")]:
    x = amb_city(b - a, r); x[:, :ns(0.3)] *= np.linspace(0, 1, ns(0.3)); x[:, -ns(0.3):] *= np.linspace(1, 0, ns(0.3)); place(sfx, x * 0.35, a)
rain_a, rain_b = 36.45, 39.86
n = ns(rain_b - rain_a); rain = widen(hp(colored(n, r, 0.3), 900) * 0.25 + (r.random(n) < 0.002) * r.standard_normal(n) * 0.6, r, 9, 1.0); rain[:, :ns(0.15)] *= np.linspace(0, 1, ns(0.15))
ev(rain_a, rain, "rain hush (cuts dead when the sun comes out)", 0.8)
ev(62.66, widen(G.breeze(6.0, r, 0.8, 0.3, 1200), r, 11, 0.8), "desert breeze", 0.35)
ev(62.66, widen(lp(colored(ns(6.0), r, 0.8), 1200) * 0.2, r, 7, 1.0), "pool lapping", 0.3)
# hook
ev(0.3, sizzle(2.4, r) * np.linspace(0.2, 1.0, ns(2.4)), "rising sizzle on the car", 0.9)
ev(2.7, gliss(420, 140, 0.9, 0.06, 6), "car sags: drooping wobble", 0.55)
ev(3.3, G.clink(r, 2600, 0.1) * 0.5, "drip plink", 0.6, 0.3); ev(3.9, G.clink(r, 2300, 0.1) * 0.5, "drip plink", 0.6, -0.2)
ev(4.35, G.whoosh(0.5, r, peak=0.35) , "whoosh into the flash", 0.7)
# setting
ev(8.4, G.whoosh(1.2, r, peak=0.6, f_lo=200, f_hi=1400, tail=0.4), "aerial glide whoosh", 0.6)
ev(13.18, I.glock(F(96), 0.7, r, 0.8) + G.clink(r, 3200, 0.2) * 0.4, "glass bowl ting", 0.6)
# park / return
ev(15.84, np.concatenate([beep(2300), np.zeros(ns(0.06)), beep(2300)]), "key fob chirp-chirp", 0.6, 0.3)
for k in range(5): ev(18.2 + k * 0.45, G.stroll_step(r, 0.6) * 0.6, "footstep", 0.6, -0.2)
ev(20.25, G.whoosh(0.25, r, peak=0.08, f_lo=600, f_hi=3000), "cut whoosh to the mirror", 0.4)
ev(21.0, gliss(700, 180, 0.7, 0.03, 9), "melting mirror bloop", 0.55)
ev(21.75, G.clink(r, 2100, 0.12) * 0.6, "candle drip", 0.6)
ev(22.64, thud(r, 180, 0.2) * 0.6 + G.clink(r, 1800, 0.08) * 0.3, "coffee cup clatter", 0.7, -0.3)
ev(22.9, G.bubbles(0.35, r, 300, 300, 1800) * 0.6, "coffee splash", 0.6, -0.3)
ev(23.6, gliss(220, 260, 1.0, 0.12, 11, "saw") * 0.25, "rubbery panel warble", 0.6)
ev(24.56, thud(r, 60, 0.3), "kick: wavy", 0.8)
# doormat, bike
ev(25.0, G.whoosh(0.5, r, peak=0.15, f_lo=500, f_hi=3500, tail=0.15), "whip pan down the street", 0.6)
ev(26.2, sizzle(1.4, r, 0.7), "doormat smoulder", 0.7, -0.2)
for k in range(5): ev(26.3 + k * 0.33, thud(r, 90, 0.18) * 0.6, "stamp", 0.6, -0.2)
ev(28.2, gliss(160, 90, 0.5, 0.05, 14, "saw") * 0.3, "bike seat squish", 0.6, 0.3)
# egg
ev(29.9, G.clink(r, 900, 0.3) + thud(r, 120, 0.2) * 0.3, "pan clank", 0.6)
ev(31.14, G.clink(r, 3000, 0.08) + bp(r.standard_normal(ns(0.06)), 1500, 6000, 1) * np.exp(-tt(0.06) / 0.01), "egg crack", 0.7)
ev(32.7, sizzle(3.7, r, 1.2), "egg sizzle", 0.9)
ev(33.6, gliss(500, 1800, 1.28, 0.01, 6) * 0.35, "thermometer slide-whistle up", 0.6, -0.3)
ev(34.9, pop(r), "thermometer pop (kick)", 0.8, -0.3)
# sun
ev(39.95, G.whoosh(0.4, r, peak=0.1, f_lo=1500, f_hi=6000, tail=0.3), "sun glint shimmer", 0.4)
# explanation
for i, tp in enumerate([41.66, 41.9, 42.14]): ev(tp, I.glock(F(88 + i), 0.5, r, 0.5), "flat window ray ping", 0.45, -0.3 + 0.3 * i)
for i, tp in enumerate([44.72, 44.9, 45.08]): ev(tp, I.glock(F(84 + 3 * i), 0.5, r, 0.5), "curved window ray ping", 0.45, -0.3 + 0.3 * i)
ev(46.24, gliss(2400, 600, 0.25) * 0.5 + sizzle(0.4, r), "zap: rays meet", 0.7)
ev(46.3, bp(r.standard_normal(ns(0.5)), 300, 2500, 1) * (np.sin(TAU * 12 * tt(0.5)) > 0) * np.exp(-tt(0.5) / 0.25) * 0.5, "pigeon flap", 0.6, -0.2)
ev(47.6, sizzle(1.0, r, 0.5), "leaf smoulders", 0.6)
ev(49.4, G.whoosh(1.6, r, peak=0.7, f_lo=150, f_hi=1100, tail=0.5), "pull back up to the tower", 0.7)
# consequence
ev(54.0, G.whoosh(0.5, r, peak=0.25), "crossfade whoosh", 0.4)
for k in range(10): ev(56.3 + k * 0.22, G.clink(r, 1400 + 200 * (k % 3), 0.06) * 0.7, "ratchet click", 0.45, 0.3)
for tp in (58.12, 58.6): ev(tp, thud(r, 80, 0.3) + G.clink(r, 800, 0.2) * 0.5, "fin clunk (kick)", 0.7, 0.3)
ev(61.2, bp(r.standard_normal(ns(0.3)), 400, 3000, 1) * np.exp(-tt(0.3) / 0.08) * 0.3, "sad confetti pff", 0.5)
ev(62.6, G.whoosh(0.6, r, peak=0.3), "crossfade to Las Vegas", 0.5)
ev(66.1, sizzle(1.2, r, 0.8), "hair singeing", 0.8, -0.2)
ev(66.95, G.whoa(r, 210, 0.45), "yelp", 0.5, -0.2)
ev(67.25, G.splash_big(r)[: ns(DUR - 67.25)], "pool splash on the last word", 0.9)

# ---------------------------------------------------------------- mix
on = np.zeros(N)
for w in W["words"]: on[ns(w["s"]) : ns(w["e"] + 0.1)] = 1
duck = signal.lfilter([1 - 0.999], [1, -0.999], on)
duck = dbg(-3.0 * np.clip(duck * 3, 0, 1))
v_l = integrated(voice)
music *= dbg(v_l - 10.0 - integrated(music))            # music bed ~10 LU under the voice (+3 dB standard)
music *= duck[None, :]
sfx *= dbg(v_l - 13.0 - integrated(sfx))                 # SFX -6 dB vs the bridge's -7 LU reference
mix = voice + music + sfx
g = dbg(-14.0 - integrated(mix)); mix *= g; voice *= g; music *= g; sfx *= g
# look-ahead peak limiter to -1 dBTP
ceil = dbg(-1.2); up = signal.resample_poly(mix, 4, 1, axis=-1); pk = np.abs(up).max(0).reshape(-1, 4).max(1)[:N]
gr = np.minimum(1, ceil / np.maximum(pk, 1e-9)); win = ns(0.005)
gr = -signal.lfilter([1], [1], np.zeros(1)) if False else gr
gr = np.minimum.accumulate(gr[::-1])[::-1] if False else gr
from scipy.ndimage import minimum_filter1d, uniform_filter1d
gr = uniform_filter1d(minimum_filter1d(gr, win * 2), win)
mix *= gr[None, :]
for name, x in [("mix", mix), ("stem_voice", voice), ("stem_music", music), ("stem_sfx", sfx)]: write_wav(os.path.join(HERE, name + ".wav"), x)
with open(os.path.join(HERE, "cues.md"), "w") as fh:
    fh.write("# The Tower That Cooked a Car: soundtrack cues\n\nAll sound is original and synthesized (numpy/scipy). Voice: Kokoro TTS `am_michael`, gain only.\n\n")
    fh.write(f"- Integrated {integrated(mix):.1f} LUFS, true peak {true_peak(mix):.1f} dBTP, length {N / SR:.3f} s\n")
    fh.write(f"- Stems: voice {integrated(voice):.1f}, music {integrated(music):.1f}, sfx {integrated(sfx):.1f} LUFS\n\n| time (s) | event |\n|---|---|\n")
    for t, nm in sorted(CUES): fh.write(f"| {t:.2f} | {nm} |\n")
print("mix", integrated(mix), true_peak(mix), N / SR)
