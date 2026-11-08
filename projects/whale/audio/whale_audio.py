# "Raining Whale" soundtrack: own synthesized SFX + an original comic oompah score, mixed under the narration.
# Picture time constants mirror ~/shorts-studio/src/videos/whale/story.ts (frame = s x 30). Everything is numpy/scipy,
# built on the bridge short's DSP kit (dsp.py, instruments.py, sfx_gen.py).
# Writes: mix.wav (48 kHz stereo 24-bit, exact picture length), stem_voice/music/sfx.wav, cues.md.
import json, math, os, subprocess
import numpy as np
from dsp import (SR, ns, tt, rng, lp, hp, bp, peq, colored, smooth_noise, fades, pan, st, place, widen, make_ir, convolve_st,
                 integrated, true_peak, read_wav, write_wav, dbg, reson)
import instruments as I
import sfx_gen as G

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FPS = 30
TOTAL = 2086
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS

# ---------------- picture constants (story.ts) ----------------
T_PUSH, T_BLAST, T_FLAT, T_STOMP, T_SQUIRT = fr(809), fr(829), fr(1240), fr(1447), fr(1500)
SHOTS = {1: (0, 140), 2: (140, 288), 3: (288, 411), 4: (411, 531), 5: (531, 649), 6: (649, 715), 7: (715, 846), 8: (846, 1004),
         9: (1004, 1062), 10: (1062, 1222), 11: (1222, 1262), 12: (1262, 1418), 13: (1418, 1544), 14: (1544, 1655), 15: (1655, 1760),
         16: (1760, 1918), 17: (1918, TOTAL)}
S = lambda i: (fr(SHOTS[i][0]), fr(SHOTS[i][1]))
CREST = 5.5


def hh(i, s=0):
    v = math.sin(i * 127.1 + s * 311.7) * 43758.5453
    return v - math.floor(v)


def smooth(x):
    u = min(1, max(0, x)); return u * u * (3 - 2 * u)


def lotK(x, z):
    lot = min(x + 34, 18 - x, z + 88, -64 - z); park = min(x + 58, -26 - x, z + 92, -64 - z)
    return max(smooth(lot / 3), smooth(park / 3))


def groundY(x, z):
    if z > 16: return -0.045 * (z - 16) + 0.19
    if z > -26: return 0.005 * (16 - z)
    u = smooth((-26 - z) / 32); base = 0.21 + (CREST - 0.21) * u
    amp = u * (1 - u) * 3.2 + (0.3 if z < -56 else 0)
    dune = 0.9 * math.sin(x * 0.11 + 1.3) * math.sin(z * 0.13 + 0.4) + 0.5 * math.sin(x * 0.043 - z * 0.05)
    return base + dune * amp * (1 - lotK(x, z))


def chunks():
    out = []
    for i in range(90):
        big = i < 30; vy = 15 + hh(i, 1) * 15; landward = i % 6 != 0
        vz = -(4 + hh(i, 2) * 11) if landward else 2 + hh(i, 2) * 6
        vx = (hh(i, 3) - 0.5) * 16
        p0 = [(hh(i, 4) - 0.5) * 8, 1.2 + hh(i, 5) * 1.2, -1.4 + hh(i, 6) * 1.2]
        s = 0.5 + hh(i, 7) * 0.6 if big else 0.16 + hh(i, 7) * 0.28
        tl = 2 * vy / 9.8
        for _ in range(8):
            x, z = p0[0] + vx * tl, p0[2] + vz * tl; gy = groundY(x, z) + s * 0.3
            a, b, c = -4.9, vy, p0[1] - gy
            tl = (-b - math.sqrt(b * b - 4 * a * c)) / (2 * a)
        out.append(dict(t=T_BLAST + tl, x=p0[0] + vx * tl, z=p0[2] + vz * tl, s=s))
    return out


# ---------------- small synth helpers ----------------
def env_exp(n, tau):
    return np.exp(-np.arange(n) / SR / tau)


def thump(r, f0=55, f1=32, dur=1.0, tau=0.25):
    t = tt(dur); f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / tau)


def noise_burst(r, dur, lo, hi, tau, slope=1.0):
    n = ns(dur); x = colored(n, r, slope)
    return bp(x, lo, hi) * env_exp(n, tau) / (np.std(x) + 1e-9)


def boom(r, big=1.0):
    """the blast: crack + low thump + body + rumbling tail + sand hiss falling back"""
    d = 5.0; n = ns(d)
    y = np.zeros(n)
    crack = hp(colored(ns(0.05), r, 0.0), 1500) * env_exp(ns(0.05), 0.008); y[:len(crack)] += 0.9 * crack / np.max(np.abs(crack))
    th = thump(r, 70, 28, 2.5, 0.55); y[:len(th)] += 1.1 * th
    body = noise_burst(r, 2.0, 40, 900, 0.35, 1.0); y[:len(body)] += 0.55 * body
    tail = lp(colored(n, r, 2.0), 160) * np.exp(-np.arange(n) / SR / 1.6); y += 0.9 * tail / (np.std(tail) * 3)
    hiss = noise_burst(r, 3.2, 1800, 6500, 1.0, 0.5) * np.clip(np.arange(ns(3.2)) / ns(0.3), 0, 1); y[ns(0.25):ns(0.25) + len(hiss)] += 0.12 * hiss
    return big * y / np.max(np.abs(y))


def splat(r, size=1.0):
    """wet blubber landing: soft thump + squelch"""
    d = 0.5; n = ns(d)
    th = thump(r, 120 / (0.6 + size), 60, d, 0.07 + 0.05 * size)
    sq = bp(colored(n, r, 0.5), 300, 2500) * env_exp(n, 0.05)
    sq = reson(sq, r.uniform(500, 900), 4) * 0.8 + sq
    y = 0.9 * th + 0.5 * sq / (np.std(sq) * 4 + 1e-9)
    return y / np.max(np.abs(y)) * min(1.0, 0.45 + 0.6 * size)


def fall_whistle(r, dur, f0=2400, f1=700):
    t = tt(dur); f = f0 * (f1 / f0) ** (t / dur)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.15, 0, 1) * np.clip((dur - t) / 0.03, 0, 1) * (0.3 + 0.7 * t / dur)
    return y * 0.5


def gull(r, calls=3):
    """seagull 'kyow' calls: falling nasal tone with harmonics"""
    out = np.zeros(ns(calls * 0.42 + 0.3))
    for k in range(calls):
        d = r.uniform(0.25, 0.36); t = tt(d)
        f = r.uniform(1500, 1800) * (0.62 + 0.38 * np.exp(-t / 0.08)) * (1 + 0.04 * np.sin(2 * np.pi * 28 * t))
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum(np.sin(ph * h) / h ** 1.2 for h in range(1, 7))
        x = reson(x, 2600, 3) + 0.4 * x
        x *= np.clip(t / 0.02, 0, 1) * np.clip((d - t) / 0.06, 0, 1)
        i = ns(k * r.uniform(0.36, 0.46)); out[i:i + len(x)] += x / np.max(np.abs(x))
    return out * 0.6


def flaps(r, n=6, rate=7.0):
    out = np.zeros(ns(n / rate + 0.3))
    for k in range(n):
        x = bp(colored(ns(0.08), r, 1.0), 300, 2500) * env_exp(ns(0.08), 0.02)
        i = ns(k / rate); out[i:i + len(x)] += x / (np.max(np.abs(x)) + 1e-9) * (1 - k / (n + 2))
    return out * 0.5


def thunk(r, f=180, dur=0.25):
    """wooden crate set down"""
    t = tt(dur)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / (0.06 / m)) for m, a in [(1, 1), (2.3, 0.5), (3.9, 0.3)])
    x += 0.4 * noise_burst(r, dur, 200, 3000, 0.01)
    return x / np.max(np.abs(x))


def metal_crunch(r, dur=1.0, big=1.0):
    n = ns(dur); y = np.zeros(n)
    th = thump(r, 90, 40, dur, 0.18); y[:len(th)] += th
    for k in range(int(30 * big)):
        c = G.clink(r, r.uniform(700, 3500), dur=r.uniform(0.05, 0.2), bright=0.8)
        i = ns(r.uniform(0, 0.25) ** 1.5); place_m(y, c * r.uniform(0.2, 0.5), i)
    cr = bp(colored(n, r, 0.3), 400, 6000) * env_exp(n, 0.12); y += 0.5 * cr / (np.std(cr) * 3)
    gl = hp(colored(ns(0.6), r, 0.0), 3500) * env_exp(ns(0.6), 0.12)  # glass
    place_m(y, 0.3 * gl / (np.std(gl) * 3), ns(0.03))
    return y / np.max(np.abs(y))


def place_m(buf, x, i):
    a, b = max(0, i), min(len(buf), i + len(x))
    if b > a: buf[a:b] += x[a - i:b - i]


def horn(dur=1.3):
    t = tt(dur)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (349, 440))
    x = bp(x, 300, 3200)
    return x / np.max(np.abs(x)) * np.clip(t / 0.02, 0, 1) * np.clip((dur - t) / 0.25, 0, 1) * (1 - 0.35 * t / dur)


def whir(r, dur):
    t = tt(dur)
    m = np.sin(2 * np.pi * 2300 * t + 3 * np.sin(2 * np.pi * 24 * t)) * 0.3
    cl = bp(colored(len(t), r, 0.0), 1500, 6000) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 24 * t)))
    return (m + 0.25 * cl / np.std(cl)) * np.clip(t / 0.15, 0, 1) * np.clip((dur - t) / 0.2, 0, 1) * 0.5


def surf(r, dur, level=1.0, period=6.4, ph=0.0):
    n = ns(dur); t = np.arange(n) / SR
    sw = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * (t / period) + ph)) ** 3
    low = lp(colored(n, r, 1.6), 600); hiss = bp(colored(n, r, 0.4), 1200, 7000)
    y = low / np.std(low) * 0.6 * sw + hiss / np.std(hiss) * 0.25 * np.roll(sw, ns(0.6)) ** 2
    return widen(y * level * 0.3, r, 13, 0.9)


def squirt(r, dur=0.45):
    t = tt(dur); f = 900 * (1 - 0.5 * t / dur)
    x = bp(colored(len(t), r, 0.3), 400, 3500) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t))
    x += 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.15)
    return x / np.max(np.abs(x)) * np.clip(t / 0.01, 0, 1) * np.clip((dur - t) / 0.1, 0, 1)


def wobble(r, dur=1.0):
    """comic stink 'bwaaah': low tuba with a slow vibrato wobble"""
    x = I.brass(I.m2f(36), dur, 0.7, r, kind="tuba", scoop=-40, fall=-3)
    t = np.arange(len(x)) / SR
    return x * (0.75 + 0.25 * np.sin(2 * np.pi * 6 * t))


# ---------------- SFX cues ----------------
CUES = []


def cue(sf, t, name, desc, x, db, p=0.0, send=0.15):
    x = np.asarray(x, float)
    x = pan(x, p) if x.ndim == 1 else x
    place(sf["dry"], x, t, dbg(db)); place(sf["wet"], x, t, dbg(db) * send)
    CUES.append((t, name, desc, db))


def build_sfx():
    r = rng(1970)
    sf = {"dry": np.zeros((2, N)), "wet": np.zeros((2, N))}
    # ambience: surf by the whale; softer up on the crest, in the lot and the park
    amb = [(0, S(4)[1], 1.0), (S(5)[0], S(5)[1], 0.45), (S(6)[0], S(6)[1], 1.0), (S(7)[0], S(9)[1], 0.45), (S(10)[0], S(11)[1], 0.3),
           (S(12)[0], S(12)[1], 0.8), (S(13)[0], S(13)[1], 0.25), (S(14)[0], S(14)[1], 0.4), (S(15)[0], S(16)[1], 1.0), (S(17)[0], DUR, 0.3)]
    for a, b, lv in amb:
        x = surf(rng(int(a * 10) + 3), b - a + 0.3, lv, ph=a)
        x[:, :ns(0.12)] *= np.linspace(0, 1, ns(0.12)); x[:, -ns(0.2):] *= np.linspace(1, 0, ns(0.2))
        cue(sf, a, "surf", f"surf + foam hiss (level {lv})", x, -21, send=0.05)
    br = G.breeze(DUR, rng(5), 0.8)
    cue(sf, 0, "breeze", "sea breeze bed, whole film", br, -30, send=0.0)
    for a, b in [S(2), S(15), S(17)]:
        cue(sf, a + 0.6, "gulls_far", "distant gulls", gull(rng(int(a * 7)), 2) * 0.5, -26, 0.5)
    # hook + flash
    cue(sf, fr(96), "crate_thunk", "a dynamite case set on the pile ('half a ton')", thunk(rng(11)), -14, 0.2)
    cue(sf, fr(118), "crate_thunk2", "another case", thunk(rng(12), 160), -17, -0.2)
    cue(sf, fr(140) - 0.55, "flash_whoosh", "reverse swell into the white flash", G.whoosh(0.75, rng(13), peak=0.7, f_lo=500, f_hi=4000), -14)
    cue(sf, fr(189) - 0.5, "glide_whoosh", "camera glide down along the whale", G.whoosh(1.0, rng(14), peak=0.5), -22)
    cue(sf, fr(265), "stink", "comic stink wobble on 'stink'", wobble(rng(15), 1.0), -16)
    cue(sf, fr(288) + 0.05, "sign_ding", "the whale-crossing sign", I.glock(I.m2f(88), 0.6, rng(16), 1.4), -20, -0.3)
    cue(sf, fr(372), "truck_idle", "highway truck idling", lp(colored(ns(1.3), rng(17), 1.5), 140) * 3 * np.clip(tt(1.3) / 0.1, 0, 1) * np.clip((1.3 - tt(1.3)) / 0.2, 0, 1), -16, 0.3)
    beeps = np.zeros(ns(1.1))
    for k in range(3): b = np.sin(2 * np.pi * 1050 * tt(0.18)) * np.clip((0.18 - tt(0.18)) / 0.02, 0, 1); place_m(beeps, b, ns(k * 0.36))
    cue(sf, fr(380), "truck_beeps", "truck reversing beeps", beeps * 0.4, -24, 0.4)
    cue(sf, fr(480), "gulls", "gulls over the whale on 'seagulls'", gull(rng(18), 4), -14, -0.2)
    cue(sf, fr(500), "gulls2", "more gulls", gull(rng(19), 3), -18, 0.4)
    # crowd murmur on the crest (shots 5, 7)
    for a, b in [S(5), S(7)]:
        mur = np.zeros(ns(b - a))
        for k in range(10):
            v = G.babble(b - a, rng(30 + k + int(a)), rng(k).uniform(100, 230), rng(k).uniform(0.9, 1.2), active=0.6)
            mur[:len(v)] += v[:len(mur)]
        mur *= np.clip(tt(b - a) / 0.3, 0, 1)
        cue(sf, a, "crowd_murmur", "crowd chatter on the crest", widen(lp(mur, 3000), rng(31), 15, 1.0), -28)
    for k in range(5): cue(sf, fr(649) + 0.15 + k * 0.33, "crates", "cases stacked against the whale", thunk(rng(40 + k), 150 + 25 * k), -17 - k, (k - 2) * 0.2)
    cue(sf, fr(760), "tv_camera", "TV film camera whirring", whir(rng(41), 1.15), -16, 0.2)
    rat = G.stick_slip(T_BLAST - T_PUSH + 0.05, 45, rng(42)) if hasattr(G, "stick_slip") else np.zeros(1)
    cue(sf, T_PUSH, "plunger", "plunger handle ratcheting down", hp(rat, 400), -16)
    cue(sf, T_BLAST - 0.02, "plunger_click", "plunger bottoms out", thunk(rng(43), 420, 0.12), -12)
    # THE BLAST
    cue(sf, T_BLAST, "BOOM", "half a ton of dynamite: crack, thump, body, rumble, sand hiss", widen(boom(rng(44)), rng(45), 9, 0.6), -1, send=0.35)
    for k in range(6):
        cue(sf, T_BLAST + 0.35 + k * 0.12, "whoa", "crowd 'whoa'", G.whoa(rng(50 + k)), -17 - k, (k - 2.5) * 0.25)
    # raining whale: whistles + splats from the real landing table (shot 8 runs at story time)
    ch = chunks()
    for i, c in enumerate(ch):
        if not (S(8)[0] < c["t"] < S(8)[1]): continue
        near = c["z"] < -40
        db = (-12 if near else -24) + 6 * (c["s"] - 0.5)
        cue(sf, c["t"], "splat", f"chunk {i} lands ({'crest/lot' if near else 'beach'})", splat(rng(100 + i), c["s"]), db, (c["x"] / 20))
        if c["s"] > 0.85 and near:
            cue(sf, c["t"] - 1.1, "fall_whistle", f"cartoon falling whistle, chunk {i}", fall_whistle(rng(200 + i), 1.1), -22, c["x"] / 20)
        if near and abs(c["z"] + 74) < 6: cue(sf, c["t"] + 0.01, "car_hit", f"chunk {i} on a car", metal_crunch(rng(300 + i), 0.6, 0.4), -18, c["x"] / 25)
    for k in range(40):  # small bits patter near the camera
        tk = T_BLAST + 3.6 + 2.6 * hh(k, 11)
        if tk < S(8)[1]: cue(sf, tk, "bit", "small bit pattering down", splat(rng(400 + k), 0.2), -26, (hh(k, 12) - 0.5) * 1.6)
    for k in range(5): cue(sf, fr(985) + k * 0.2, "oof", "crowd hit by bits", G.oof(rng(60 + k), ["oof", "ow", "ugh", "oh", "oof"][k]), -18, (k - 2) * 0.3)
    # luckily / unluckily
    tw = np.zeros(ns(1.8))
    for k, m in enumerate([96, 100, 103, 108, 103, 100]): place_m(tw, I.glock(I.m2f(m), 0.4, rng(70 + k), 0.8), ns(k * 0.28))
    cue(sf, fr(1012), "stars", "dizzy stars twinkle", tw, -22)
    for k in range(6): cue(sf, fr(1075) + k * 0.6, "sparkle", "new-car sparkle", I.glock(I.m2f(98 + (k % 3) * 4), 0.35, rng(80 + k), 0.6), -24, (k % 3 - 1) * 0.5)
    cue(sf, T_FLAT - 1.0, "flat_whistle", "the chunk falling onto the car", fall_whistle(rng(90), 1.0, 2600, 600), -16)
    cue(sf, T_FLAT, "CRUNCH", "chunk flattens the brand-new car: thump, metal, glass", widen(metal_crunch(rng(91), 1.6, 1.0), rng(92), 8, 0.5), -3, send=0.25)
    cue(sf, T_FLAT + 0.35, "horn", "the crushed car's horn sticks on", horn(1.25), -16, 0.2)
    # explanation
    pl = np.zeros(ns(1.6))
    for k in range(10): place_m(pl, thunk(rng(500 + k), 600 + 40 * k, 0.1) * 0.5, ns(k * 0.12))
    cue(sf, fr(1316), "neat_ticks", "neat little cubes clicking into place", pl, -20)
    slow = boom(rng(44))[::1]
    slow = np.interp(np.arange(0, len(slow), 0.5), np.arange(len(slow)), slow)[:ns(4.5)]
    cue(sf, fr(1350) + 0.15, "slow_boom", "the blast again, slowed down", lp(slow, 2500), -6, send=0.4)
    cue(sf, T_STOMP, "stomp", "kid stomps the ketchup packet", thump(rng(93), 160, 70, 0.3, 0.05), -12)
    cue(sf, T_STOMP + 0.01, "squirt", "ketchup shoots out one side", squirt(rng(94)), -13, -0.3)
    cue(sf, T_STOMP + 0.32, "splat_shirt", "ketchup hits the engineer's shirt", splat(rng(95), 0.35), -14, -0.4)
    for k in range(6):
        tk = fr(1556) + k * 0.55
        cue(sf, tk, "overhead", "chunk whooshing overhead", G.whoosh(0.8, rng(600 + k), peak=0.45, f_lo=200, f_hi=1500), -15 - (k % 2) * 3, (k % 3 - 1) * 0.6)
    cue(sf, fr(1690) + 0.3, "gull_return", "one gull arrives...", gull(rng(97), 2), -16, 0.5)
    cue(sf, fr(1714), "gull_leave", "...and flaps off for good", flaps(rng(98), 8) , -15, -0.4)
    # storyboard v2 acting
    for k, f in enumerate([300, 318, 336, 354]): cue(sf, fr(f), "sign_hammer", "hammer on the whale-crossing sign", G.hammer_hit(rng(800 + k), 0.6), -15, -0.2)
    cue(sf, fr(366), "truck_skid", "truck skids in on the sand", hp(G.whoosh(0.9, rng(810), peak=0.4, f_lo=300, f_hi=3000), 200) + 0.5 * noise_burst(rng(811), 0.9, 800, 6000, 0.3), -12, 0.4)
    for k in range(3): cue(sf, fr(390 + k * 7), "crew_land", "worker lands in the sand", thump(rng(820 + k), 140, 70, 0.25, 0.04), -16, 0.3)
    cue(sf, fr(100), "gull_alarm", "gull on the crates squawks", gull(rng(830), 1), -14, 0.2)
    cue(sf, fr(276), "gull_faint", "gull keels over: soft plop", thump(rng(831), 300, 150, 0.2, 0.03), -18)
    cue(sf, fr(678), "tower_top", "last case on top of the tower", thunk(rng(832), 200), -13)
    cue(sf, T_FLAT + 0.02, "warner_jump", "he jumps out of his cap", G.whoosh(0.4, rng(833), peak=0.3, f_lo=600, f_hi=3000), -18)
    cue(sf, fr(1428), "kid_jump", "kid winds up and jumps", G.whoosh(0.5, rng(834), peak=0.5, f_lo=400, f_hi=2500), -20)
    cue(sf, fr(1714), "gull_doubletake", "gull double-take squawk", gull(rng(835), 2), -13, 0.3)
    cue(sf, fr(1726), "gull_flee", "gull flaps off fast", flaps(rng(836), 10, 12), -14, -0.5)
    cue(sf, fr(2010), "gull_sign", "gull lands on the park sign", flaps(rng(837), 4), -20, -0.3)
    birds = G.bird_chirps(S(17)[1] - S(17)[0], rng(99), 0.6)
    cue(sf, S(17)[0], "park_birds", "birds in the park", birds, -24, 0.2)
    kids = np.zeros(ns(4.0))
    for k in range(3): v = G.babble(4.0, rng(700 + k), 300 + 40 * k, 1.4, rate=6, active=0.5); kids[:len(v)] += v[:len(kids)]
    cue(sf, S(17)[0] + 0.5, "kids", "kids playing in the park", lp(kids, 4000), -28, -0.2)
    return sf


# ---------------- music ----------------
Q = 60 / 112
F = I.m2f
CH = {"F": (41, [65, 69, 72]), "C7": (36, [64, 67, 70]), "Bb": (46, [65, 70, 74]), "Gm": (43, [67, 70, 74]), "Dm": (38, [65, 69, 74])}
PROG = ["F", "C7", "F", "Bb", "F", "C7", "Gm", "F"]
MEL = [  # (bar, beat, quarters, midi) bouncy glock theme
    (0, 0, 1, 72), (0, 1, .5, 74), (0, 1.5, .5, 76), (0, 2, 1, 77), (0, 3, 1, 72),
    (1, 0, 1.5, 76), (1, 1.5, .5, 74), (1, 2, 2, 70),
    (2, 0, .5, 69), (2, .5, .5, 70), (2, 1, 1, 72), (2, 2, 1, 77), (2, 3, 1, 81),
    (3, 0, 2, 79), (3, 2, 1, 77), (3, 3, 1, 74),
    (4, 0, 1, 72), (4, 1, .5, 74), (4, 1.5, .5, 76), (4, 2, 1, 77), (4, 3, 1, 79),
    (5, 0, 1, 81), (5, 1, 1, 79), (5, 2, 2, 76),
    (6, 0, 1, 74), (6, 1, 1, 77), (6, 2, 1, 76), (6, 3, 1, 72),
    (7, 0, 3, 77),
]


def build_music():
    r = rng(112)
    m = np.zeros((2, N))

    def put(x, t, db, p=0.0):
        place(m, pan(x, p) if np.asarray(x).ndim == 1 else x, t, dbg(db))

    def bar_band(t0, bars, vel=1.0, mel=True, start_bar=0, snare=True):
        for b in range(bars):
            tb = t0 + b * 4 * Q
            if tb >= DUR: break
            ch = CH[PROG[(start_bar + b) % 8]]
            for beat in (0, 2):
                root = ch[0] if beat == 0 else ch[0] + 7
                put(I.brass(F(root), Q * 0.8, 0.75 * vel, r, kind="tuba"), tb + beat * Q, -8, -0.1)
            for beat in (1, 3):
                for k, n in enumerate(ch[1]):
                    put(I.pluck(F(n), 0.45 * vel, r, 0.4, 0.6), tb + beat * Q + 0.004 * k, -15, 0.25)
                if snare: put(I.brush(0.4 * vel, r), tb + beat * Q, -20, 0.1)
            if mel:
                for (bb, bt, ql, mi) in MEL:
                    if bb == (start_bar + b) % 8:
                        put(I.glock(F(mi), 0.6 * vel, r, max(0.4, ql * Q * 1.6)), tb + bt * Q, -12, -0.2)
        return t0 + bars * 4 * Q

    # A: 0 -> button: theme, then the snare roll up to the blast; dead stop on the blast
    t = 0.15
    t = bar_band(t, 8, 0.9)
    bars = int((fr(760) - t) / (4 * Q))
    t = bar_band(t, bars, 1.0, mel=True)
    roll = I.snare_roll(fr(760), T_BLAST - 0.03, 0.15, 0.9, r)
    for tk, v in roll: put(I.snare(v, r, 0.2), tk, -14, 0.1)
    put(I.timpani(F(41), 0.9, r, 1.8), fr(760), -12)
    # B: luckily (up) / unluckily (down) / ta-da for the new car
    for k, n in enumerate([72, 76, 79, 84]): put(I.pluck(F(n), 0.6, r, 0.5, 0.6), fr(1022) + k * 0.12, -12)
    for k, n in enumerate([84, 79, 76, 72]): put(I.pluck(F(n), 0.6, r, 0.5, 0.6), fr(1065) + k * 0.14, -12)
    for n in [65, 69, 72, 77]: put(I.brass(F(n), 0.9, 0.6, r, kind="horn"), fr(1150), -15, 0.1)
    put(I.cymbal(0.4, r, 1.6), fr(1150), -22)
    # C: explanation: light vibes ostinato + pad, F - Dm - Bb - C7
    t = fr(1266)
    for b in range(int((fr(1655) - t) / (4 * Q))):
        ch = CH[["F", "Dm", "Bb", "C7"][b % 4]]
        put(I.pad([F(n) for n in ch[1]], 4 * Q, 0.3, r), t + b * 4 * Q, -12)
        for k in range(8): put(I.vibes(F(ch[1][k % 3] + 12), 0.35, r, 0.6), t + b * 4 * Q + k * Q / 2, -13, 0.2)
        put(I.brass(F(ch[0]), Q * 1.6, 0.45, r, kind="soft"), t + b * 4 * Q, -9)
    # D: sad trombone on "most of the whale was still there"
    for k, (n, d) in enumerate([(58, .5), (57, .5), (56, .5), (55, 1.4)]):
        put(I.brass(F(n), d, 0.7, r, kind="horn", fall=(-2 if k == 3 else 0)), fr(1700) + k * 0.55, -10)
    # E: 1979 golden: warm pad + sparse glock
    put(I.pad([F(n) for n in [53, 60, 65, 69]], 5.2, 0.4, r, att=1.0, rel=1.2), fr(1762), -16)
    for k, n in enumerate([81, 77, 72, 74, 77]): put(I.glock(F(n), 0.35, r, 1.6), fr(1780) + k * 0.9, -20)
    # F: 2020: the theme again, button on "Memorial Park"
    t = fr(1922)
    bar_band(t, 2, 1.0)
    for n in [53, 60, 65, 69, 72]: put(I.brass(F(n), 1.6, 0.8, r, kind="horn"), fr(2037), -11)
    put(I.brass(F(41), 1.6, 0.8, r, kind="tuba"), fr(2037), -8); put(I.cymbal(0.7, r, 2.4), fr(2037), -14); put(I.glock(F(89), 0.7, r, 1.8), fr(2037), -12)
    return m


def duck(m, words, depth=-9.0):
    g = np.zeros(N)
    spans = []
    for w in words:
        a, b = w["start"] - 0.08, w["end"] + 0.12
        if spans and a - spans[-1][1] < 0.3: spans[-1][1] = b
        else: spans.append([a, b])
    for a, b in spans: g[max(0, ns(a)):min(N, ns(b))] = 1
    # smooth attack/release
    k = ns(0.12); g = np.convolve(g, np.ones(k) / k, "same")
    return m * dbg(depth * g)[None, :]


def limiter(x, ceil=-1.0):
    c = dbg(ceil)
    env = np.max(np.abs(x), 0)
    k = ns(0.004)
    env = np.maximum.accumulate(np.lib.stride_tricks.sliding_window_view(np.pad(env, (0, k - 1), mode="edge"), k).max(1)[None, :], axis=0)[0]
    g = np.minimum(1.0, c / np.maximum(env, 1e-9))
    rel = ns(0.08)
    sm = np.copy(g)
    for i in range(1, len(sm)): sm[i] = min(g[i], sm[i - 1] + (1 - sm[i - 1]) / rel)
    return x * sm[None, :]


def main():
    vx, sr = read_wav(os.path.join(ROOT, "voice", "voice.wav"))
    v = st(vx[0])[:, :N]
    v = np.pad(v, ((0, 0), (0, N - v.shape[1])))
    words = json.load(open(os.path.join(ROOT, "voice", "words.json")))
    sf = build_sfx()
    room = make_ir(1.1, 21, pre=0.01, hf=1.6)
    sfx = sf["dry"] + convolve_st(sf["wet"].mean(0), room)
    mus = build_music()
    mus = mus + 0.25 * convolve_st(mus.mean(0), make_ir(1.4, 22, pre=0.015, hf=1.4))
    # levels: voice reference, music under it (+3 dB on the bed, ducked), SFX -6 dB from equal
    Lv = integrated(v)
    mus = duck(mus * dbg(Lv - 7 - integrated(mus)), words, -7.0)
    sfx = sfx * dbg(Lv - 6 - 6 - integrated(sfx) + 6)
    y = v + mus + sfx
    y = hp(y, 28, 2)
    y = y * dbg(-14.0 - integrated(y))
    y = limiter(y, -1.2)
    y = y * dbg(-14.0 - integrated(y))
    y = limiter(y, -1.0)
    write_wav(os.path.join(HERE, "mix.wav"), y)
    for nm, x in (("voice", v), ("music", mus), ("sfx", sfx)): write_wav(os.path.join(HERE, f"stem_{nm}.wav"), x)
    L = ["# Raining Whale: sound cues", "", f"mix.wav: {N} samples = {N / SR:.3f} s, integrated {integrated(y):.1f} LUFS, true peak {true_peak(y):.1f} dBTP", "",
         "| time (s) | frame | cue | what | dB |", "|---|---|---|---|---|"]
    for t, nm, d, db in sorted(CUES): L.append(f"| {t:.2f} | {round(t * FPS)} | {nm} | {d} | {db} |")
    open(os.path.join(HERE, "cues.md"), "w").write("\n".join(L) + "\n")
    print("mix", round(N / SR, 3), "s", "LUFS", round(integrated(y), 1), "TP", round(true_peak(y), 1), "cues", len(CUES))


if __name__ == "__main__":
    main()
