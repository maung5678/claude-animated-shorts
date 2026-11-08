// Timeline of "Snow Queen of Bethel" (Bethel, Maine, February 2008): shots timed to the voice words
// (~/snow-short/voice/words.json, frame = s x 30), with the bridge/whale camera grammar.
export const FPS = 30;
export const TOTAL = 2062;
export const D0 = 0;
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---------------- places ----------------
// Bethel common at the origin (Olympia stands at 0,0,0 facing -z); the beach, the diagram set and the Austrian valley
// are far-away sets in the same scene.
export const BEACH: V3 = [3000, 0, 0];
export const DIAG: V3 = [0, 0, -3000];
export const AUSTRIA: V3 = [-3000, 0, 0];
const hill = (x: number, z: number) => 6 * Math.sin(x * 0.012 + 1) * Math.sin(z * 0.015 + 0.5) + 4 * Math.sin(x * 0.006 - z * 0.008);
/** ground height: flat town common (r < 70), rolling snowy hills further out */
export const groundY = (x: number, z: number) => {
  const r = Math.hypot(x, z);
  if (Math.abs(x) > 1000 || Math.abs(z) > 1000) return 0; // the far sets are flat
  return r < 70 ? 0 : (hill(x, z) + 5) * smooth((r - 70) / 60);
};
export const at = (x: number, z: number, dy = 0): V3 => [x, groundY(x, z) + dy, z];

// Olympia: 122 ft = 37.2 m. Three balls stacked (radii 10 / 7.4 / 5.4 m).
export const OLY = { r1: 10, r2: 7.4, r3: 5.4 };
export const olyCentres = (melt = 0) => {
  const { r1, r2, r3 } = OLY, k1 = 1 - 0.55 * melt, k2 = 1 - 0.45 * melt, k3 = 1 - 0.35 * melt;
  const y1 = r1 * 0.92 * k1, y2 = y1 + r1 * 0.85 * k1 + r2 * 0.8 * k2, y3 = y2 + r2 * 0.82 * k2 + r3 * 0.85 * k3;
  return { y1, y2, y3, k1, k2, k3, top: y3 + r3 * k3 };
};
export const FACE_Y = olyCentres().y3; // head centre
export const CRANE: V3 = [26, 0, 6];
export const TOWER: V3 = [-30, 0, 4]; // the ten-story building (for scale)
export const TABLE: V3 = [-22, 0, -30]; // town meeting table
export const RIBBON_Z = -14;

// ---------------- story beats ----------------
export const T_TIMELAPSE: [number, number] = [380 / FPS, 468 / FPS]; // shot 5: the snow rises
export const T_SLIP = 520 / FPS; // a volunteer slips (shot 6)
export const T_SCALE = 920 / FPS; // "thirteen million": the scale needle spins
export const T_WINK = 1064 / FPS; // "luckily": the senator and Olympia wink
export const T_COLLAPSE = 1420 / FPS; // "falls apart"
export const T_NOSE = 1876 / FPS; // "confirmed": Austria's carrot drops
export const T_WINK2 = 2019 / FPS; // final wink on "eyelashes"
/** how much of Olympia is built (0 base .. 1 complete) at story time t */
export const builtAt = (id: number, t: number) => {
  if (id === 5) return 0.25 + 0.35 * smooth((t - T_TIMELAPSE[0]) / (T_TIMELAPSE[1] - T_TIMELAPSE[0]));
  if (id === 6 || id === 16) return 0.6;
  return 1;
};

// ---------------- shots ----------------
export type Light = "day" | "golden" | "flash" | "frigid" | "beach" | "summer" | "dusk";
export type ShotDef = { id: number; a: number; b: number; light: Light; tau: (t: number) => number; sunAz?: number; sunEl?: number };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 118, light: "day", tau: (t) => t },
  { id: 2, a: 118, b: 157, light: "day", tau: (t) => t },
  { id: 3, a: 157, b: 314, light: "flash", tau: (t) => t },
  { id: 4, a: 314, b: 358, light: "day", tau: (t) => t },
  { id: 5, a: 358, b: 468, light: "day", tau: (t) => t },
  { id: 6, a: 468, b: 579, light: "day", tau: (t) => t },
  { id: 7, a: 579, b: 684, light: "day", tau: (t) => t },
  { id: 8, a: 684, b: 815, light: "day", tau: (t) => t },
  { id: 9, a: 815, b: 968, light: "day", tau: (t) => t },
  { id: 10, a: 968, b: 1108, light: "day", tau: (t) => t },
  { id: 11, a: 1108, b: 1164, light: "day", tau: (t) => t },
  { id: 12, a: 1164, b: 1249, light: "beach", tau: (t) => t },
  { id: 13, a: 1249, b: 1362, light: "beach", tau: (t) => t },
  { id: 14, a: 1362, b: 1474, light: "beach", tau: (t) => t },
  { id: 15, a: 1474, b: 1584, light: "frigid", tau: (t) => t },
  { id: 16, a: 1584, b: 1674, light: "day", tau: (t) => t },
  { id: 17, a: 1674, b: 1763, light: "summer", tau: (t) => t },
  { id: 18, a: 1763, b: 1907, light: "day", tau: (t) => t },
  { id: 19, a: 1907, b: TOTAL, light: "dusk", tau: (t) => t },
];
export const XFADE: Record<number, number> = { 3: 8, 4: 8, 12: 8, 14: 8, 15: 8, 16: 8, 17: 10, 18: 10, 19: 10 };
export const FLASH_AT = -10; // no white flash in this short
export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

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
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

// 1: crane up from her feet to her face (the reveal)
const S1a = (f: number): Shot => { const u = glide((f - 6) / 100); return { pos: [5, 1.6 + 16 * u, -58 + 6 * u], look: [0, 4 + 26 * u, 0], fov: 46 - 4 * u, roll: 0 }; };
// 2: side by side with the ten-story building, man on the roof
const S2a = (f: number) => zoom([-8, 14, -70], [-12, 19, 2], 44, pushK(f, 118, 0.002, 0.006, 25));
// 3: 1999 flashback: Angus + the mayor polishing the trophy
const S3a = (f: number) => dolly([-2.8, 1.7, -21], [-1.6, 1.9, -15.4], pushK(f, 157, 0.0022), { fov: 42 });
const S3b = (f: number) => zoom([-3, 1.7, -24], [0, 18, 0], 50, pushK(f, 245, 0.0018));
// 4: the town meeting: the mayor slams the table and points up
const S4a = (f: number) => dolly(add(TABLE, [1.2, 1.6, -5.2]), add(TABLE, [0, 1.7, 0.4]), pushK(f, 314, 0.003, 0.008, 22), { fov: 40, roll: -0.03 });
// 5: crane time-lapse, wide
const S5a = (f: number) => zoom([-40, 12, -62], [4, 14, 0], 42, pushK(f, 358, 0.0015));
// 6: volunteers stomping on the top layer, then the layer-cake side view
const S6a = (f: number) => { const y = olyCentres().y2 + 0.4; return dolly([3, y + 2.2, -9.5], [0, y + 1.0, -2], pushK(f, 468, 0.0025), { fov: 42 }); };
const S6b = (f: number) => zoom([0, 12, -60], [0, 12, 0], 40, pushK(f, 545, 0.002));
// 7: the face: wreath eyes come down, ski lashes; then the skier left in boots
const S7a = (f: number) => dolly([4, FACE_Y + 1, -20], [0, FACE_Y + 0.4, 0], pushK(f, 579, 0.0022), { fov: 40 });
const S7b = (f: number) => dolly([2.4, 1.6, -26], [0.6, 1.4, -21.5], pushK(f, 640, 0.0025), { fov: 40, roll: 0.035 });
// 8: the painter and his red tire; the spruce arms go up
const S8a = (f: number) => dolly([-6.2, 1.6, -24.5], [-8.6, 1.2, -20.5], pushK(f, 684, 0.0025), { fov: 40 });
const S8b = (f: number) => zoom([10, 4, -52], [0, 22, 0], 46, pushK(f, 770, 0.0018), { roll: -0.03 });
// 9: the full reveal with the crowd, then the giant scale
const S9a = (f: number) => zoom([0, 3, -78], [0, 18, 0], 44, pushK(f, 815, 0.0018));
const S9b = (f: number) => dolly([6, 2.0, -24], [0, 1.2, -13], pushK(f, 915, 0.003, 0.007, 25), { fov: 44, roll: 0.035 });
// 10: the senator cuts the ribbon; then the matching wink
const S10a = (f: number) => dolly([1.5, 1.7, -22], [-0.5, 1.6, RIBBON_Z - 2], pushK(f, 968, 0.0022), { fov: 40 });
const S10b = (f: number) => zoom([-1, 1.4, -26], [-0.4, 6, 0], 50, pushK(f, 1058, 0.002), { roll: 0.04 });
// 11: the kid's snowball crumbles; the dog tilts its head
const S11a = (f: number) => dolly([7.6, 0.9, -24.6], [5.6, 0.85, -21.8], pushK(f, 1108, 0.003), { fov: 40 });
// 12-13: diagram set: the snowflake with its wet skin; two flakes pressed together
const S12a = (f: number) => dolly(add(DIAG, [0, 3, -9]), add(DIAG, [0, 3, 0]), pushK(f, 1164, 0.003), { fov: 40 });
const S13a = (f: number) => dolly(add(DIAG, [0, 3, -10]), add(DIAG, [0, 3, 0]), pushK(f, 1249, 0.002, 0.007, 25), { fov: 42 });
// 14: the beach: the dry castle falls, the damp one holds
const S14a = (f: number) => dolly(add(BEACH, [1.6, 1.1, -5.2]), add(BEACH, [0.2, 0.7, 0]), pushK(f, 1362, 0.0025), { fov: 40 });
const S14b = (f: number) => dolly(add(BEACH, [1.2, 1.0, -4.4]), add(BEACH, [0.2, 0.75, 0]), pushK(f, 1430, 0.003), { fov: 40, roll: -0.035 });
// 15: frigid day: powder blows away
const S15a = (f: number) => dolly([30, 1.1, -38], [28, 1.0, -34.6], pushK(f, 1474, 0.0025), { fov: 40 });
// 16: back on top: slow stomp
const S16a = (f: number) => { const y = olyCentres().y2 + 0.4; return dolly([1.8, y + 1.0, -6.4], [0, y + 0.9, -2.5], pushK(f, 1584, 0.003, 0.007, 30), { fov: 38 }); };
// 17: summer melt, then the last little pile
const S17a = (f: number) => zoom([-10, 3, -46], [0, 6, 0], 44, pushK(f, 1674, 0.0018));
const S17b = (f: number) => dolly([3, 1.6, -12], [0, 1.2, -2], pushK(f, 1720, 0.0025), { fov: 42 });
// 18: Austria: crane up their snowman; the official shrugs, the carrot falls
const S18a = (f: number) => zoom(add(AUSTRIA, [-6, 3, -70]), add(AUSTRIA, [0, 16, 0]), 46, pushK(f, 1763, 0.0018));
const S18b = (f: number) => dolly(add(AUSTRIA, [2.2, 1.6, -24]), add(AUSTRIA, [0.5, 1.4, -19]), pushK(f, 1840, 0.0025), { fov: 42 });
// 19: dusk finale: wide crane-out with everyone, then the face and the wink
const S19a = (f: number): Shot => { const u = glide((f - 1907) / 90); return { pos: [2, 2 + 8 * u, -40 - 30 * u], look: [0, 10 + 8 * u, 0], fov: 44, roll: 0 }; };
const S19b = (f: number) => dolly([1.5, FACE_Y + 0.4, -26], [0, FACE_Y + 0.4, 0], pushK(f, 1990, 0.002, 0.005, 30), { fov: 40 });

const CAMS: Record<number, Key[]> = {
  1: [{ f: 0, s: S1a }], 2: [{ f: 118, s: S2a }], 3: [{ f: 157, s: S3a }, { f: 245, cut: true, s: S3b }], 4: [{ f: 314, s: S4a }],
  5: [{ f: 358, s: S5a }], 6: [{ f: 468, s: S6a }, { f: 545, cut: true, s: S6b }], 7: [{ f: 579, s: S7a }, { f: 640, cut: true, s: S7b }],
  8: [{ f: 684, s: S8a }, { f: 770, cut: true, s: S8b }], 9: [{ f: 815, s: S9a }, { f: 915, cut: true, s: S9b }],
  10: [{ f: 968, s: S10a }, { f: 1058, cut: true, s: S10b }], 11: [{ f: 1108, s: S11a }], 12: [{ f: 1164, s: S12a }], 13: [{ f: 1249, s: S13a }],
  14: [{ f: 1362, s: S14a }, { f: 1430, cut: true, s: S14b }], 15: [{ f: 1474, s: S15a }], 16: [{ f: 1584, s: S16a }],
  17: [{ f: 1674, s: S17a }, { f: 1720, cut: true, s: S17b }], 18: [{ f: 1763, s: S18a }, { f: 1840, cut: true, s: S18b }],
  19: [{ f: 1907, s: S19a }, { f: 1990, cut: true, s: S19b }],
};

const KICKS: [number, number][] = [[338 / FPS, 1.2], [T_SLIP + 0.3, 0.8], [T_COLLAPSE, 0.7], [T_NOSE + 0.35, 0.6]];
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
  { f: 0, cInf: 0 }, { f: 157, cInf: 10 }, { f: 245, cInf: 0 }, { f: 314, cInf: 12 }, { f: 358, cInf: 0 }, { f: 468, cInf: 8 }, { f: 545, cInf: 0 },
  { f: 579, cInf: 6 }, { f: 640, cInf: 12 }, { f: 684, cInf: 12 }, { f: 770, cInf: 0 }, { f: 915, cInf: 8 }, { f: 968, cInf: 11 }, { f: 1058, cInf: 4 },
  { f: 1108, cInf: 13 }, { f: 1164, cInf: 0 }, { f: 1362, cInf: 10 }, { f: 1474, cInf: 12 }, { f: 1584, cInf: 10 }, { f: 1674, cInf: 0 },
  { f: 1720, cInf: 9 }, { f: 1763, cInf: 0 }, { f: 1840, cInf: 11 }, { f: 1907, cInf: 0 }, { f: 1990, cInf: 6 },
];
export const dofAt = (f: number) => {
  let i = 0; while (i + 1 < DOF.length && f >= DOF[i + 1].f) i++;
  const d = DOF[i], p = DOF[Math.max(0, i - 1)];
  const k = d.dur ? Math.min(1, (f - d.f) / d.dur) : 1;
  return { cInf: p.cInf + (d.cInf - p.cInf) * k, focus: d.focus };
};
