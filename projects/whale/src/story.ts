// Timeline of "Raining Whale" (Florence, Oregon, 12 Nov 1970): shots timed to the voice words
// (~/whale-short/voice/words.json, frame = seconds x 30), the blast physics (blubber chunks on ballistic arcs) and the
// camera grammar of the bridge short: smootherstep glides, hard cuts on big reframes, creeping push-ins on every hold,
// 7-frame flip kicks on impacts, no hand-held float.
export const FPS = 30;
export const TOTAL = 2086;
export const D0 = 0; // beach level (build.ts helpers default to this height)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---------------- the place ----------------
// sea toward +z (waterline z ~ 20), the whale lies along x at the origin, head toward +x; dunes rise behind the beach
// (z -26 .. -58) to a plateau at CREST with the crowd on the crest and the parking lot + park behind it.
export const SEA_Y = -0.35;
export const CREST = 5.5;
const dune = (x: number, z: number) => 0.9 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.13 + 0.4) + 0.5 * Math.sin(x * 0.043 - z * 0.05);
/** inside the flat parking lot / park (1) .. open dunes (0) */
export const lotK = (x: number, z: number) => {
  const lot = Math.min(x + 34, 18 - x, z + 88, -64 - z), park = Math.min(x + 58, -26 - x, z + 92, -64 - z);
  return Math.max(smooth(lot / 3), smooth(park / 3));
};
/** ground height at (x, z): wet beach sloping into the sea, flat dry sand, dunes rising to the crest plateau */
export const groundY = (x: number, z: number) => {
  if (z > 16) return -0.045 * (z - 16) + 0.19;
  if (z > -26) return 0.005 * (16 - z) - 0.0;
  const u = smooth((-26 - z) / 32), base = 0.21 + (CREST - 0.21) * u;
  const amp = u * (1 - u) * 3.2 + (z < -56 ? 0.3 : 0);
  return base + dune(x, z) * amp * (1 - lotK(x, z));
};
export const WHALE_L = 13.7; // 45 ft
export const CRATES: [number, number, number] = [-1.2, 0, -2.4]; // dynamite pile against the landward flank
export const PLUNGER: V3 = [9.5, 0, -40];
export const TRUCK: V3 = [13, 0, -10];
export const SIGN: V3 = [-9.5, 0, -7.5];
export const CAR: V3 = [-7.5, 0, -74]; // the warner's brand-new car in the lot
export const CAMSTAND: V3 = [7.5, 0, -57.6]; // TV camera tripod on the crest
export const PARK: V3 = [-42, 0, -78]; // memorial park (lawn on the plateau west of the lot)
export const PACKET: V3 = [3, 0, -78]; // the ketchup packet on the lot
export const at = (x: number, z: number, dy = 0): V3 => [x, groundY(x, z) + dy, z];

// ---------------- story time ----------------
export const T_PUSH = 809 / FPS; // "pushed"
export const T_BLAST = 829 / FPS; // the plunger bottoms out
export const T_FLAT = 1240 / FPS; // "flattened"
export const T_STOMP = 1447 / FPS; // "ketchup"
export const T_SQUIRT = 1500 / FPS; // "shoots out"

/** blubber chunks: ballistic arcs from the whale, most of them up and landward (the sand pushed back) */
export type Chunk = { p0: V3; v: V3; s: number; spin: V3; t0: number; land: number; end: V3 };
const G = 9.8;
export const CHUNKS: Chunk[] = (() => {
  const out: Chunk[] = [];
  for (let i = 0; i < 90; i++) {
    const big = i < 30, vy = 15 + hh(i, 1) * 15, landward = i % 6 !== 0;
    const vz = landward ? -(4 + hh(i, 2) * 11) : 2 + hh(i, 2) * 6;
    const vx = (hh(i, 3) - 0.5) * 16;
    const p0: V3 = [(hh(i, 4) - 0.5) * 8, 1.2 + hh(i, 5) * 1.2, -1.4 + hh(i, 6) * 1.2];
    const s = big ? 0.5 + hh(i, 7) * 0.6 : 0.16 + hh(i, 7) * 0.28;
    let tl = (2 * vy) / G;
    for (let k = 0; k < 8; k++) {
      const x = p0[0] + vx * tl, z = p0[2] + vz * tl, gy = groundY(x, z) + s * 0.3;
      const a = -0.5 * G, b = vy, c = p0[1] - gy;
      tl = (-b - Math.sqrt(b * b - 4 * a * c)) / (2 * a);
    }
    const end: V3 = [p0[0] + vx * tl, 0, p0[2] + vz * tl];
    end[1] = groundY(end[0], end[2]) + s * 0.3;
    out.push({ p0, v: [vx, vy, vz], s, spin: [hh(i, 8) * 9, hh(i, 9) * 9, hh(i, 10) * 9], t0: T_BLAST, land: tl, end });
  }
  return out;
})();
/** chunk position at story time t (null before the blast); after landing it rests where it hit */
export const chunkAt = (c: Chunk, t: number): { p: V3; rot: V3; landed: boolean } | null => {
  const u = t - c.t0;
  if (u < 0) return null;
  const k = Math.min(u, c.land);
  const p: V3 = u >= c.land ? c.end : [c.p0[0] + c.v[0] * u, c.p0[1] + c.v[1] * u - 0.5 * G * u * u, c.p0[2] + c.v[2] * u];
  return { p, rot: [c.spin[0] * k, c.spin[1] * k, c.spin[2] * k], landed: u >= c.land };
};
/** height above the car roof of the chunk that flattens it (lands on "flattened") */
export const carChunkDrop = (t: number) => { const u = T_FLAT - t; return u <= 0 ? 0 : 0.5 * G * u * u; };

// ---------------- shots ----------------
export type Light = "day" | "golden" | "blast" | "dusk";
export type Cast =
  | "hook" | "beach" | "stink" | "sign" | "truck" | "engineer" | "gulls" | "warner" | "crates" | "crowd" | "tvcam" | "plunger" | "blast"
  | "rain" | "dazed" | "newcar" | "flat" | "neat" | "ketchup" | "over" | "after" | "whales" | "park";
export type ShotDef = { id: number; a: number; b: number; light: Light; tau: (t: number) => number; sunAz?: number; sunEl?: number };
// tau = story time (s). Most shots run on the narration clock; the hook is a flash-forward of the crate pile, the
// explanation shots replay the blast, the 1979 and 2020 shots are their own times.
const replay = (f0: number, t0: number) => (t: number) => t0 + (t - f0 / FPS);
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 140, light: "day", tau: (t) => t + 20 },
  { id: 2, a: 140, b: 288, light: "day", tau: (t) => t },
  { id: 3, a: 288, b: 411, light: "day", tau: (t) => t },
  { id: 4, a: 411, b: 531, light: "day", tau: (t) => t },
  { id: 5, a: 531, b: 649, light: "day", tau: (t) => t },
  { id: 6, a: 649, b: 715, light: "day", tau: (t) => t },
  { id: 7, a: 715, b: 846, light: "day", tau: (t) => t },
  { id: 8, a: 846, b: 1004, light: "blast", tau: (t) => t },
  { id: 9, a: 1004, b: 1062, light: "day", tau: (t) => t + 3 },
  { id: 10, a: 1062, b: 1222, light: "day", tau: (t) => t },
  { id: 11, a: 1222, b: 1262, light: "day", tau: (t) => t },
  { id: 12, a: 1262, b: 1418, light: "day", tau: (t) => (t < 1350 / FPS ? T_BLAST - 1 : replay(1350, T_BLAST - 0.5)(t)) },
  { id: 13, a: 1418, b: 1544, light: "day", tau: (t) => t },
  { id: 14, a: 1544, b: 1655, light: "day", tau: replay(1544, T_BLAST + 1.6) },
  { id: 15, a: 1655, b: 1760, light: "day", tau: (t) => t + 40 },
  { id: 16, a: 1760, b: 1918, light: "dusk", tau: (t) => t },
  { id: 17, a: 1918, b: TOTAL, light: "day", tau: (t) => t },
];
export const XFADE: Record<number, number> = { 12: 8, 13: 8, 15: 8, 16: 10, 17: 10 };
export const FLASH_AT = 140;
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};
/** which beats a shot stages (cast.ts + world.ts read this) */
export const CAST: Record<number, Cast[]> = {
  1: ["hook", "crates"], 2: ["beach", "stink", "crates"], 3: ["sign", "truck", "crates"], 4: ["engineer", "gulls", "crates", "truck"],
  5: ["warner", "crowd"], 6: ["crates", "hook"], 7: ["crowd", "tvcam", "plunger", "blast", "crates"], 8: ["rain", "crowd", "blast"],
  9: ["dazed", "rain"], 10: ["newcar", "rain"], 11: ["flat", "rain"], 12: ["neat", "blast", "crates"], 13: ["ketchup"],
  14: ["over", "blast", "crowd"], 15: ["after"], 16: ["whales"], 17: ["park"],
};
export const has = (id: number, c: Cast) => CAST[id].includes(c);

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mix = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mix(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
const pushK = (f: number, f0: number, rate: number, punch = 0, n = 35) => {
  const x = Math.max(0, f - f0);
  let s = rate * x;
  if (punch > rate) for (let i = 0; i < Math.min(x, n); i++) s += (punch - rate) * Math.max(0, Math.min(1, (i + 0.5) / 8, (n - i - 0.5) / 8));
  return Math.exp(-s);
};
const dolly = (pos: V3, look: V3, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos: [look[0] + (pos[0] - look[0]) * k, look[1] + (pos[1] - look[1]) * k, look[2] + (pos[2] - look[2]) * k], look, ...rest });
const zoom = (pos: V3, look: V3, fov: number, k: number, rest: Partial<Cam> = {}): Shot =>
  ({ pos, look, fov: (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) * k), ...rest });
const rolled = (s: (f: number) => Shot, roll: number) => (f: number): Shot => ({ ...s(f), roll });

// framings (each pushes in from the frame its key starts)
const S1a = (f: number) => dolly([-9, 2.2, -13], [0.5, 1.4, -1], pushK(f, 0, 0.0022), { fov: 42 });
const S1b = (f: number) => dolly([-4.4, 1.2, -6.6], [CRATES[0], 0.75, CRATES[2]], pushK(f, 96, 0.0025, 0.006, 30), { fov: 36, roll: 0.04 });
const S2a = (f: number) => zoom([34, 24, 44], [0, 1, -4], 42, pushK(f, 140, 0.002));
const S2b = (f: number) => dolly([15, 3.2, 10.5], [-1, 1.6, 0], pushK(f, 185, 0.002), { fov: 40, roll: -0.035 });
const S2c = (f: number) => dolly([11, 2.0, -3.6], [5.4, 1.7, 0], pushK(f, 265, 0.0025, 0.006, 22), { fov: 38 });
const S3a = (f: number) => dolly(at(SIGN[0] - 2.6, SIGN[2] - 5, 1.5), at(SIGN[0], SIGN[2], 1.75), pushK(f, 288, 0.0022, 0.006, 32), { fov: 38 });
const S3b = (f: number) => dolly(at(TRUCK[0] + 7, TRUCK[2] - 12, 2.3), at(TRUCK[0] - 1.5, TRUCK[2] + 1, 1.4), pushK(f, 372, 0.0025), { fov: 40, roll: 0.035 });
const S4a = (f: number) => dolly([9.4, 1.75, -12.6], [6.2, 1.55, -6.6], pushK(f, 411, 0.0022), { fov: 38 });
const S4b = (f: number) => dolly([-6, 1.3, -9], [1.2, 3.6, 0], pushK(f, 480, 0.0025), { fov: 42, roll: -0.04 });
const S5a = (f: number) => dolly(at(3, -46, 2.2), at(-2, -58.5, 1.3), pushK(f, 531, 0.002), { fov: 42 });
const S5b = (f: number) => dolly(at(-2.4, -54.9, 1.55), at(-4, -58.4, 1.5), pushK(f, 572, 0.0022, 0.006, 32), { fov: 38 });
const S5c = rolled(S5b, 0.04);
const S6a = (f: number) => dolly([-6.8, 1.6, -9.6], [-1.0, 1.9, -2.6], pushK(f, 649, 0.004, 0.008, 30), { fov: 44, roll: -0.03 });
const S7a = (f: number) => zoom(at(-8, -68, 4.5), [0, 1.5, -2], 40, pushK(f, 715, 0.0018));
const S7b = (f: number) => dolly(at(CAMSTAND[0] + 1.6, CAMSTAND[2] + 3.8, 1.6), at(CAMSTAND[0] - 0.7, CAMSTAND[2] - 0.5, 1.45), pushK(f, 760, 0.0025), { fov: 38, roll: 0.035 });
const S7c = (f: number) => dolly(at(PLUNGER[0] + 1.4, PLUNGER[2] - 3.4, 1.45), at(PLUNGER[0], PLUNGER[2] + 0.3, 1.05), pushK(f, 795, 0.003, 0.008, 25), { fov: 40 });
const S7d = (f: number) => zoom(at(-4, -60, 2.5), [0, 7, 0], 42, pushK(f, 834, 0.0015));
const S8a = (f: number) => zoom(at(-4, -60, 2.5), [0, 12, -8], 46, pushK(f, 846, 0.0015), { roll: -0.03 });
const S8b = (f: number) => dolly(at(8, -49, 1.9), at(-2, -59, 1.2), pushK(f, 900, 0.002), { fov: 46, roll: 0.03 });
const S8c = (f: number) => dolly(at(-1, -67, 1.6), at(-6, -73.5, 0.8), pushK(f, 950, 0.0025), { fov: 44 });
const S8d = (f: number) => dolly(at(2.5, -53.6, 1.55), at(-1.5, -58.6, 1.4), pushK(f, 975, 0.003), { fov: 42, roll: -0.04 });
const S9a = (f: number) => dolly(at(1.2, -54.3, 1.6), at(-0.8, -58.6, 1.35), pushK(f, 1004, 0.0022), { fov: 40 });
const S10a = (f: number) => dolly(at(CAR[0] + 5.4, CAR[2] + 6.0, 1.75), at(CAR[0] + 0.4, CAR[2] + 1.2, 1.15), pushK(f, 1062, 0.0022), { fov: 40 });
const S10b = (f: number) => dolly(at(CAR[0] + 4.2, CAR[2] + 5.0, 1.6), at(CAR[0] + 0.8, CAR[2] + 1.6, 1.25), pushK(f, 1128, 0.002, 0.006, 32), { fov: 38, roll: 0.035 });
const S11a = (f: number) => dolly(at(CAR[0] + 6.4, CAR[2] + 7.0, 2.2), at(CAR[0] + 0.3, CAR[2] + 1.0, 1.6), pushK(f, 1222, 0.003), { fov: 42 });
const S12a = (f: number) => dolly([7, 4.5, -14], [0, 1.2, 0], pushK(f, 1262, 0.002), { fov: 42 });
const S12b = (f: number) => zoom(at(0, -46, 2), [0, 9, 0], 46, pushK(f, 1350, 0.0015), { roll: 0.03 });
const S13a = (f: number) => dolly(at(PACKET[0] + 2.6, PACKET[2] - 3.2, 1.0), at(PACKET[0] + 0.1, PACKET[2], 0.75), pushK(f, 1418, 0.0025), { fov: 40 });
const S13b = (f: number) => dolly(at(PACKET[0] + 0.7, PACKET[2] - 2.6, 1.0), at(PACKET[0] - 0.9, PACKET[2] + 0.5, 0.9), pushK(f, 1478, 0.003, 0.007, 26), { fov: 40, roll: -0.04 });
const S14a = (f: number) => zoom(at(2, -51.5, 0.9), [0, 13, -78], 52, pushK(f, 1544, 0.0015));
const S14b = (f: number) => zoom(at(-1, -53, 0.8), [0, 18, -85], 56, pushK(f, 1600, 0.0015), { roll: -0.04 });
const S15a = (f: number) => dolly([-14, 6, -18], [0, 1.2, 0], pushK(f, 1655, 0.0018), { fov: 40 });
const S15b = (f: number) => dolly([-2.6, 1.8, -11.5], [1.3, 2.2, -5.2], pushK(f, 1708, 0.0025), { fov: 42, roll: 0.035 });
const S16a = (f: number) => zoom([-46, 19, -30], [6, 0, 6], 40, pushK(f, 1760, 0.0018));
const S16b = (f: number) => dolly([6, 1.7, -8], [3.2, 1.45, -3.6], pushK(f, 1860, 0.0025, 0.006, 30), { fov: 38 });
const S17a = (f: number) => dolly(at(PARK[0] + 5, PARK[2] - 6, 1.7), at(PARK[0], PARK[2], 1.55), pushK(f, 1918, 0.0022), { fov: 40 });
const S17b = (f: number) => dolly(at(PARK[0] + 3.2, PARK[2] - 3.8, 1.6), at(PARK[0] - 0.2, PARK[2], 1.65), pushK(f, 2020, 0.002, 0.006, 30), { fov: 38 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }, { f: 96, cut: true, s: S1b }], // cut on "half a ton"
  2: [{ f: 140, s: S2a }, { f: 172, dur: 34, s: S2b }, { f: 265, cut: true, s: S2c }], // glide on "forty-five foot", cut on "stink"
  3: [{ f: 288, s: S3a }, { f: 372, cut: true, s: S3b }], // cut on "highway department"
  4: [{ f: 411, s: S4a }, { f: 480, cut: true, s: S4b }], // cut on "seagulls"
  5: [{ f: 531, s: S5a }, { f: 572, cut: true, s: S5b }, { f: 612, dur: 20, s: S5c }], // roll on "way too much"
  6: [{ f: 649, s: S6a }],
  7: [{ f: 715, s: S7a }, { f: 760, cut: true, s: S7b }, { f: 795, cut: true, s: S7c }, { f: 834, cut: true, s: S7d }],
  8: [{ f: 846, s: S8a }, { f: 900, cut: true, s: S8b }, { f: 950, cut: true, s: S8c }, { f: 975, cut: true, s: S8d }],
  9: [{ f: 1004, s: S9a }],
  10: [{ f: 1062, s: S10a }, { f: 1128, dur: 30, s: S10b }],
  11: [{ f: 1222, s: S11a }],
  12: [{ f: 1262, s: S12a }, { f: 1350, cut: true, s: S12b }], // cut on "It pushes out"
  13: [{ f: 1418, s: S13a }, { f: 1478, cut: true, s: S13b }],
  14: [{ f: 1544, s: S14a }, { f: 1600, cut: true, s: S14b }],
  15: [{ f: 1655, s: S15a }, { f: 1708, cut: true, s: S15b }], // cut on "seagulls"
  16: [{ f: 1760, s: S16a }, { f: 1860, cut: true, s: S16b }],
  17: [{ f: 1918, s: S17a }, { f: 2020, dur: 30, s: S17b }],
};

/** impact kicks (frame-time seconds, gain) */
const KICKS: [number, number][] = [[T_BLAST + 5 / FPS, 2.2], [T_BLAST + 17 / FPS, 1.0], [T_FLAT, 2.0], [T_STOMP, 0.6]];
export const kickAt = (t: number) => {
  let a = 0;
  for (const [t0, g] of KICKS) {
    const n = Math.floor((t - t0) * FPS + 1e-6);
    if (n >= 0 && n < 7) a += g * (n % 2 ? -1 : 1) * (1 - n / 7) ** 1.5;
  }
  return a;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), a = kickAt(T(f));
  if (!a) return c;
  const d: V3 = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const L = Math.hypot(...d), h = Math.hypot(d[0], d[2]) || 1;
  const m = (3 / 640) * Math.tan((c.fov * Math.PI) / 360) * L * a;
  return { ...c, look: [c.look[0] - (d[2] / h) * m, c.look[1] + 0.6 * m, c.look[2] + (d[0] / h) * m], roll: c.roll + a * 0.004 };
};

// ---------------- lens ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 3 }, { f: 96, cInf: 14 },
  { f: 140, cInf: 0 }, { f: 265, cInf: 13 },
  { f: 288, cInf: 12 }, { f: 372, cInf: 7 },
  { f: 411, cInf: 12 }, { f: 480, cInf: 0 },
  { f: 531, cInf: 6 }, { f: 572, cInf: 13 },
  { f: 649, cInf: 12 },
  { f: 715, cInf: 0 }, { f: 760, cInf: 13 }, { f: 795, cInf: 15 }, { f: 834, cInf: 0 },
  { f: 900, cInf: 6 }, { f: 950, cInf: 8 }, { f: 975, cInf: 8 },
  { f: 1004, cInf: 11 },
  { f: 1062, cInf: 9 }, { f: 1128, dur: 30, cInf: 12 }, { f: 1222, cInf: 6 },
  { f: 1262, cInf: 0 },
  { f: 1418, cInf: 12 }, { f: 1478, cInf: 15 },
  { f: 1544, cInf: 0 },
  { f: 1655, cInf: 0 }, { f: 1708, cInf: 9 },
  { f: 1760, cInf: 4 }, { f: 1860, cInf: 12 },
  { f: 1918, cInf: 9 }, { f: 2020, dur: 30, cInf: 12 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
