# "Snow Queen of Bethel" soundtrack: own synthesized SFX + the comic oompah score, mixed under the narration.
# Reuses the helpers of whale_audio.py (same DSP kit). Picture constants mirror src/videos/snow/story.ts.
import json, os
import numpy as np
from dsp import (SR, ns, tt, rng, lp, hp, bp, colored, pan, st, place, widen, make_ir, convolve_st, integrated, true_peak, read_wav, write_wav, dbg)
import instruments as I
import sfx_gen as G
import whale_audio as W

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
FPS, TOTAL = 30, 2062
DUR = TOTAL / FPS; N = ns(DUR); fr = lambda f: f / FPS
CUES = []


def addm(*xs):
    n = max(len(x) for x in xs); y = np.zeros(n)
    for x in xs: y[:len(x)] += x
    return y


def cue(sf, t, name, desc, x, db, p=0.0, send=0.15):
    x = np.asarray(x, float); x = pan(x, p) if x.ndim == 1 else x
    place(sf["dry"], x, t, dbg(db)); place(sf["wet"], x, t, dbg(db) * send); CUES.append((t, name, desc, db))


def crunch(r, slow=1.0):
    """boot into packed snow: a short crisp crunch"""
    d = 0.18 * slow; n = ns(d)
    x = bp(colored(n, r, 0.6), 700, 6000) * np.exp(-np.arange(n) / SR / (0.04 * slow))
    grains = np.zeros(n)
    for k in range(int(25 * slow)): i = int(r.uniform(0, n - 200)); grains[i:i + 60] += r.uniform(-1, 1) * np.exp(-np.arange(60) / 12)
    y = x / (np.std(x) * 4 + 1e-9) + 0.5 * hp(grains, 1500)
    return y / np.max(np.abs(y))


def wind(r, dur, level=1.0, howl=False):
    n = ns(dur); t = np.arange(n) / SR
    y = bp(colored(n, r, 1.2), 200, 2400) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 5.3))
    if howl: y += 0.4 * np.sin(2 * np.pi * np.cumsum(420 + 120 * np.sin(2 * np.pi * t / 3.1)) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * t / 4.1))
    return widen(y / np.std(y) * 0.12 * level, r, 14, 0.9)


def cheer(r, dur, n=14):
    y = np.zeros(ns(dur + 1))
    for k in range(n):
        h = G.hurrah(rng(int(r.integers(1e6))), r.uniform(120, 260), r.uniform(0.9, 1.25), kid=k % 4 == 0)
        W.place_m(y, h * r.uniform(0.5, 1.0), ns(r.uniform(0, dur * 0.6)))
    y = widen(y / (np.max(np.abs(y)) + 1e-9), r, 12, 1.0)
    ap = st(G.applause(dur, r, 30)); n = min(ap.shape[1], y.shape[1])
    y[:, :n] += 0.6 * ap[:, :n] / (np.max(np.abs(ap)) + 1e-9)
    return y / (np.max(np.abs(y)) + 1e-9)


def ding(m=96, vel=0.6):
    return I.glock(I.m2f(m), vel, rng(m), 1.4)


def build_sfx():
    sf = {"dry": np.zeros((2, N)), "wet": np.zeros((2, N))}
    S = lambda a, b: (fr(a), fr(b))
    for a, b, lv, howl in [(0, 1164, 0.8, False), (1474, 1584, 2.0, True), (1584, 1674, 0.8, False), (1763, 1907, 1.0, False), (1907, TOTAL, 0.7, False)]:
        x = wind(rng(a + 7), fr(b - a) + 0.3, lv, howl); x[:, :ns(0.15)] *= np.linspace(0, 1, ns(0.15)); x[:, -ns(0.2):] *= np.linspace(1, 0, ns(0.2))
        cue(sf, fr(a), "wind", f"winter air (level {lv})", x, -24, send=0.0)
    beach = W.surf(rng(14), fr(1474 - 1362) + 0.3, 1.0); cue(sf, fr(1362), "surf", "summer beach surf", beach, -20)
    cue(sf, fr(1674), "birds", "summer birds", G.bird_chirps(fr(1763 - 1674), rng(17), 0.7), -22, 0.2)
    # 1 hook + 2 tower
    cue(sf, 0.2, "cheer", "townsfolk cheer at Olympia's feet", cheer(rng(1), 3.5), -14)
    cue(sf, fr(6), "crane_up", "camera crane up: long soft whoosh", G.whoosh(3.2, rng(2), peak=0.6, f_lo=250, f_hi=1500), -22)
    cue(sf, fr(122), "whoa", "man on the roof gasps", G.whoa(rng(3)), -14, -0.4)
    cue(sf, fr(126), "cup_drop", "his coffee cup tumbles off", G.whoosh(0.6, rng(4), peak=0.5, f_lo=800, f_hi=4000), -22, -0.4)
    # 3 1999
    for k in range(4): cue(sf, fr(170) + k * 0.6, "polish", "trophy polishing squeak", G.swing_squeak(rng(30 + k), 0.6, k % 2 == 0), -24, -0.3)
    for k in range(3): cue(sf, fr(175) + k * 0.9, "twinkle", "trophy sparkle", ding(100 + 4 * k, 0.35), -24, -0.2)
    cue(sf, fr(280), "cheer99", "1999 crowd cheers", cheer(rng(5), 1.6, 8), -20)
    # 4 meeting
    cue(sf, fr(336), "slam", "the mayor slams the table on 'more'", addm(W.thump(rng(6), 120, 55, 0.4, 0.07), 0.6 * W.thunk(rng(7), 140, 0.3)), -8)
    for k in range(3): cue(sf, fr(338) + k * 0.08, "hey", "townsfolk jump to attention", G.whoa(rng(40 + k)), -20, (k - 1) * 0.4)
    # 5 crane time-lapse
    cue(sf, fr(358), "crane_hum", "crane motor hum (rises with the time-lapse)", lp(colored(ns(3.7), rng(8), 1.4), 260) * np.linspace(0.6, 1.3, ns(3.7)) * 2.5, -20, 0.4)
    tk, k = fr(372), 0
    while tk < fr(466):
        dmp = W.thump(rng(50 + k), 110, 60, 0.3, 0.06); W.place_m(dmp, 0.5 * crunch(rng(60 + k)), 0)
        cue(sf, tk, "dump", "a bucket of snow dumped on top", dmp, -18 - min(6, k), 0.2)
        tk += max(0.25, 1.2 - k * 0.18); k += 1
    # 6 stomp + slip
    for k in range(int((fr(545) - fr(470)) * 2)): cue(sf, fr(470) + k * 0.5, "stomp", "volunteers stomping in step", crunch(rng(70 + k)), -14, ((k % 3) - 1) * 0.3)
    cue(sf, fr(520), "slip", "a volunteer slips", G.whoosh(0.35, rng(9), peak=0.4, f_lo=600, f_hi=3500), -16, 0.3)
    cue(sf, fr(529), "bump", "lands on his backside", W.thump(rng(10), 150, 70, 0.3, 0.05), -12, 0.3)
    cue(sf, fr(545), "layer_whoosh", "pull back to the layer cake", G.whoosh(0.9, rng(11), peak=0.5), -22)
    # 7 eyes + skis
    cue(sf, fr(605), "wreath", "wreath set in place", W.thunk(rng(12), 220, 0.3), -14)
    for k in range(5): cue(sf, fr(645) + k * 0.22, "ski_clack", "skis clacking up the chain", G.clink(rng(80 + k), 900 + 120 * k, 0.12, 0.6), -18, (k - 2) * 0.2)
    # 8 lips + arms
    for k in range(6): cue(sf, fr(690) + k * 0.3, "roller", "paint roller on the tire", bp(colored(ns(0.25), rng(90 + k), 0.5), 300, 2500) * np.hanning(ns(0.25)) * 0.6, -18, -0.3)
    cue(sf, fr(729), "ding_red", "painted!", ding(91, 0.5), -18)
    cue(sf, fr(778), "tree_whoosh", "spruce arms swing up", G.whoosh(1.2, rng(13), peak=0.5, f_lo=150, f_hi=1200), -14)
    # 9 reveal + scale
    cue(sf, fr(815), "cheer_big", "the reveal: cheers + applause", cheer(rng(15), 3.0, 20), -12)
    cue(sf, fr(920), "scale_spin", "the scale needle spins off", G.rattle(1.2, rng(16), 40.0), -14)
    bo = I.pluck(I.m2f(43), 0.9, rng(161), 1.0, 0.8); bo = bo * (1 + 0.3 * np.sin(2 * np.pi * 9 * np.arange(len(bo)) / SR))
    cue(sf, fr(920) + 0.05, "boing", "boing", bo, -12)
    # 10 senator
    cue(sf, fr(1000), "snip", "ribbon snip", G.clink(rng(17), 2600, 0.08, 1.0), -14)
    cue(sf, fr(1002), "applause", "applause", G.applause(2.0, rng(18), 24), -16)
    cue(sf, fr(1064), "wink", "the double wink", ding(103, 0.7), -12)
    cue(sf, fr(1070), "laugh", "crowd laughs", cheer(rng(19), 1.4, 8), -18)
    # 11 why
    cue(sf, fr(1127), "crumble", "the snowball crumbles", bp(colored(ns(0.5), rng(20), 0.5), 1500, 7000) * np.exp(-tt(0.5) / 0.15), -16, 0.2)
    cue(sf, fr(1140), "dog", "the dog's curious whine", np.sin(2 * np.pi * np.cumsum(np.linspace(900, 1300, ns(0.4))) / SR) * np.hanning(ns(0.4)) * 0.4, -20, -0.3)
    # 12-13 diagram
    cue(sf, fr(1166), "shimmer", "crystal shimmer", addm(*[np.pad(ding(m, 0.3), (ns(k * 0.09), 0)) for k, m in enumerate([96, 100, 103, 108, 112])]), -18)
    cue(sf, fr(1300), "squish", "the flakes meet", W.squirt(rng(21), 0.3), -18)
    fz = hp(G.rattle(0.4, rng(22), 120.0), 2500); W.place_m(fz, 0.4 * ding(108, 0.6)[:len(fz)], 0)
    cue(sf, fr(1338), "freeze", "freezes solid: crackle + sparkle", fz, -14)
    # 14 sandcastle
    cue(sf, fr(1420), "collapse", "the dry castle falls apart", addm(W.thump(rng(23), 90, 50, 0.4, 0.08), 0.5 * bp(colored(ns(0.4), rng(24), 0.6), 800, 5000) * np.exp(-tt(0.4) / 0.1)), -12)
    cue(sf, fr(1424), "gasp", "kid gasps", G.whoa(rng(25), base=300), -18)
    cue(sf, fr(1451), "ta_da", "damp castle holds: ta-da", ding(96, 0.6), -14)
    # 15 powder
    cue(sf, fr(1527), "powder", "powder blows away", G.whoosh(1.0, rng(26), peak=0.3, f_lo=1500, f_hi=7000), -16, 0.5)
    # 16 slow stomp
    for k in range(3): cue(sf, fr(1600) + k * 1.0, "slow_stomp", "slow-motion stomp", lp(crunch(rng(100 + k), 2.5), 3000), -10)
    # 17 summer + slide
    for k in range(6): cue(sf, fr(1680) + k * 0.8, "drip", "meltwater drips", I.pluck(I.m2f(84 + k % 3), 0.3, rng(110 + k), 0.2, 0.9), -24, (k % 3 - 1) * 0.5)
    cue(sf, fr(1722), "whee", "kid slides down the last pile", G.whoosh(1.2, rng(27), peak=0.6, f_lo=400, f_hi=2600), -16)
    # 18 Austria
    cue(sf, fr(1781), "cheer_at", "Austrian villagers cheer", cheer(rng(28), 2.2, 10), -16)
    cue(sf, fr(1876) + 0.25, "carrot", "the carrot nose drops: plop", W.thump(rng(29), 300, 140, 0.2, 0.03), -12)
    # 19 finale
    cue(sf, fr(1915), "cheer_end", "everyone cheers", cheer(rng(30), 3.0, 18), -15)
    cue(sf, fr(2019), "wink_end", "Olympia winks", ding(108, 0.8), -10)
    return sf


Q = 60 / 112
F = I.m2f


def build_music():
    r = rng(2008); m = np.zeros((2, N))
    put = lambda x, t, db, p=0.0: place(m, pan(x, p) if np.asarray(x).ndim == 1 else x, t, dbg(db))
    CH, PROG, MEL = W.CH, W.PROG, W.MEL

    def band(t0, bars, vel=1.0, sleigh=True):
        for b in range(bars):
            tb = t0 + b * 4 * Q
            if tb >= DUR: break
            ch = CH[PROG[b % 8]]
            for beat in (0, 2): put(I.brass(F(ch[0] + (7 if beat else 0)), Q * 0.8, 0.7 * vel, r, kind="tuba"), tb + beat * Q, -8)
            for beat in (1, 3):
                for k, nn in enumerate(ch[1]): put(I.pluck(F(nn), 0.45 * vel, r, 0.4, 0.6), tb + beat * Q + 0.004 * k, -15, 0.25)
            if sleigh:
                for e in range(8): put(hp(colored(ns(0.08), r, 0.0), 5000) * np.exp(-tt(0.08) / 0.02) * 0.5, tb + e * Q / 2, -24, 0.4)
            for (bb, bt, ql, mi) in MEL:
                if bb == b % 8: put(I.glock(F(mi), 0.6 * vel, r, max(0.4, ql * Q * 1.6)), tb + bt * Q, -12, -0.2)
        return t0 + bars * 4 * Q
    band(0.1, 8)                                   # hook through the 1999 flashback
    band(fr(358), int((fr(968) - fr(358)) / (4 * Q)))  # the build, up to the reveal
    for nn in [65, 69, 72, 77]: put(I.brass(F(nn), 1.2, 0.7, r, kind="horn"), fr(815), -12)
    put(I.cymbal(0.6, r, 2.0), fr(815), -16)
    for nn in [72, 77, 81]: put(I.brass(F(nn), 0.6, 0.6, r, kind="horn"), fr(1083), -14)   # "Snowe" fanfare
    t = fr(1110)
    for b in range(int((fr(1662) - t) / (4 * Q))):
        ch = CH[["F", "Dm", "Bb", "C7"][b % 4]]
        put(I.pad([F(nn) for nn in ch[1]], 4 * Q, 0.3, r), t + b * 4 * Q, -12)
        for k in range(8): put(I.vibes(F(ch[1][k % 3] + 12), 0.35, r, 0.6), t + b * 4 * Q + k * Q / 2, -13, 0.2)
    put(I.pad([F(nn) for nn in [53, 60, 65, 69]], 3.0, 0.4, r, att=0.6, rel=1.0), fr(1676), -14)
    for k, (nn, d) in enumerate([(58, .5), (57, .5), (56, .5), (55, 1.4)]): put(I.brass(F(nn), d, 0.7, r, kind="horn", fall=(-2 if k == 3 else 0)), fr(1880) + k * 0.5, -11)
    band(fr(1910), 4)
    for nn in [53, 60, 65, 69, 72]: put(I.brass(F(nn), 1.6, 0.8, r, kind="horn"), fr(2019), -11)
    put(I.brass(F(41), 1.6, 0.8, r, kind="tuba"), fr(2019), -8); put(I.cymbal(0.7, r, 2.2), fr(2019), -14)
    return m


def duck(m, words, depth=-7.0):
    g = np.zeros(N); spans = []
    for w in words:
        a, b = w["start"] - 0.08, w["end"] + 0.12
        if spans and a - spans[-1][1] < 0.3: spans[-1][1] = b
        else: spans.append([a, b])
    for a, b in spans: g[max(0, ns(a)):min(N, ns(b))] = 1
    k = ns(0.12); g = np.convolve(g, np.ones(k) / k, "same")
    return m * dbg(depth * g)[None, :]


def main():
    vx, _ = read_wav(os.path.join(ROOT, "voice", "voice.wav"))
    v = st(vx[0])[:, :N]; v = np.pad(v, ((0, 0), (0, N - v.shape[1])))
    words = json.load(open(os.path.join(ROOT, "voice", "words.json")))
    sf = build_sfx()
    sfx = sf["dry"] + convolve_st(sf["wet"].mean(0), make_ir(1.1, 21, pre=0.01, hf=1.6))
    mus = build_music(); mus = mus + 0.25 * convolve_st(mus.mean(0), make_ir(1.4, 22, pre=0.015, hf=1.4))
    Lv = integrated(v)
    mus = duck(mus * dbg(Lv - 7 - integrated(mus)), words)
    sfx = sfx * dbg(Lv - 6 - integrated(sfx))
    y = hp(v + mus + sfx, 28, 2)
    y = y * dbg(-14.0 - integrated(y)); y = W.limiter(y, -1.2); y = y * dbg(-14.0 - integrated(y)); y = W.limiter(y, -1.0)
    write_wav(os.path.join(HERE, "mix.wav"), y)
    L = ["# Snow Queen of Bethel: sound cues", "", f"mix.wav: {N / SR:.3f} s, {integrated(y):.1f} LUFS, TP {true_peak(y):.1f} dBTP", "", "| time (s) | frame | cue | what | dB |", "|---|---|---|---|---|"]
    for t, nm, d, db in sorted(CUES): L.append(f"| {t:.2f} | {round(t * FPS)} | {nm} | {d} | {db} |")
    open(os.path.join(HERE, "cues.md"), "w").write("\n".join(L) + "\n")
    print("mix", round(N / SR, 3), "LUFS", round(integrated(y), 1), "TP", round(true_peak(y), 1), "cues", len(CUES))


if __name__ == "__main__":
    main()
