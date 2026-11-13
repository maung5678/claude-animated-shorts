// Timeline of "The Tower That Cooked a Car": 18 shots timed to the voice (voice/words.json), story state (melt,
// beam, fins, clouds) and the camera grammar of the bridge short: smootherstep glides 18-40 f, cuts on big jumps,
// every hold creeps in, flip-kicks on impacts, a white flash after the hook, crossfades at place changes.
export const FPS = 30;
export const TOTAL = 2060;
export const D0 = 0; // ground level (build.ts default house base)
export type V3 = [number, number, number];

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
export const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 4;
export const lin = (pts: [number, number][], x: number) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
};

// ---------------- places (world metres; street runs along x, tower on the north side, y up) ----------------
export const TOWER_Z = -15;          // south face base line
export const CAR: V3 = [4, 0, -2.6];  // parked at the north kerb, nose toward +x
export const SPOT: V3 = [4, 1.45, -2.6];
export const SHOP: V3 = [-24, 0, -7.5]; // shop door (doormat in front)
export const BIKE: V3 = [-20.6, 0.14, -4.5];
export const EGG: V3 = [14.55, 0.06, -4.75];
export const REPORTER_AT: V3 = [14.0, 0, -5.6];
export const LAB: V3 = [420, 0, 0];   // explanation back street (golden)
export const PARK: V3 = [-40, 0, 62]; // the kid in the park, south of the street
export const PODIUM: V3 = [0, 0, -10.5];
export const VEGAS: V3 = [2400, 0, 0];

// ---------------- shots ----------------
export type Light = "day" | "golden" | "grey" | "desert";
export type ShotDef = { id: number; a: number; b: number; light: Light; sunAz?: number; sunEl?: number; set: "street" | "lab" | "park" | "vegas" };
export const SHOTS: ShotDef[] = [
  { id: 1, a: 0, b: 140, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 2, a: 140, b: 298, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 3, a: 298, b: 424, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 4, a: 424, b: 543, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 5, a: 543, b: 663, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 6, a: 663, b: 750, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 7, a: 750, b: 861, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 8, a: 861, b: 998, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 9, a: 998, b: 1094, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 10, a: 1094, b: 1160, light: "grey", set: "street", sunAz: 155, sunEl: 48 },
  { id: 11, a: 1160, b: 1216, light: "day", set: "street", sunAz: 4, sunEl: 24 },
  { id: 12, a: 1216, b: 1310, light: "golden", set: "lab", sunAz: 150, sunEl: 16 },
  { id: 13, a: 1310, b: 1409, light: "golden", set: "lab", sunAz: 150, sunEl: 16 },
  { id: 14, a: 1409, b: 1485, light: "golden", set: "park", sunAz: 25, sunEl: 10 },
  { id: 15, a: 1485, b: 1621, light: "golden", set: "park", sunAz: 4, sunEl: 8 },
  { id: 16, a: 1621, b: 1786, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 17, a: 1786, b: 1877, light: "day", set: "street", sunAz: 155, sunEl: 48 },
  { id: 18, a: 1877, b: TOTAL, light: "desert", set: "vegas", sunAz: 25, sunEl: 50 },
];
/** crossfades (frames) at place / time changes; a white 4-frame flash after the hook */
export const XFADE: Record<number, number> = { 10: 8, 12: 8, 14: 8, 16: 8, 18: 8 };
export const FLASH_AT = 140;

export const shotAt = (f: number) => SHOTS.find((s) => f >= s.a && f < s.b) ?? SHOTS[SHOTS.length - 1];
export const layersAt = (f: number): { id: number; alpha: number }[] => {
  for (const s of SHOTS) {
    const x = XFADE[s.id];
    if (x && f >= s.a - x / 2 && f < s.a + x / 2) return [{ id: s.id - 1, alpha: 1 }, { id: s.id, alpha: (f - (s.a - x / 2) + 1) / (x + 1) }];
  }
  return [{ id: shotAt(f).id, alpha: 1 }];
};

// ---------------- story state (t = seconds on the voice clock) ----------------
export type State = {
  melt: number;    // car body / badge melt 0..1
  mirror: number;  // wing mirror droop 0..1
  wavy: number;    // panel wobble amplitude 0..1
  fixed: boolean;  // repaired, shiny (shot 16)
  beam: number;    // reflected beam strength 0..1
  beamTo: V3;      // where it lands
  fins: number;    // sunshade fins installed from the top down, 0..1 of the face
  clouds: number;  // 0 = overcast, 1 = parted (shots 10-11)
  seat: number;    // bike seat sag 0..1
  window: "flat" | "curved";
};
export const stateAt = (id: number, t: number): State => {
  const s: State = { melt: 0, mirror: 0, wavy: 0, fixed: false, beam: 0, beamTo: SPOT, fins: 0, clouds: 1, seat: 0, window: "flat" };
  switch (id) {
    case 1: s.melt = smooth((t - 1.6) / 1.6); s.mirror = s.melt * 0.8; s.wavy = s.melt * 0.6; s.beam = 1; break;
    case 2: case 3: s.beam = 0.75; break;
    case 4: s.beam = 0.9; break;
    case 5: s.melt = 0.55; s.mirror = 0.55 + 0.45 * smooth((t - 20.9) / 0.9); s.wavy = 0.3; s.beam = 1; break;
    case 6: s.melt = 0.55 + 0.45 * smooth((t - 22.2) / 0.7); s.mirror = 1; s.wavy = 0.3 + 0.7 * smooth((t - 23.6) / 0.95); s.beam = 1; break;
    case 7: s.melt = 1; s.mirror = 1; s.wavy = 1; s.beam = 1; s.beamTo = [SHOP[0], 0.05, SHOP[2] + 0.9]; s.seat = smooth((t - 27.6) / 0.8); break;
    case 8: case 9: s.melt = 1; s.mirror = 1; s.wavy = 1; s.beam = 1; s.beamTo = [EGG[0], EGG[1], EGG[2]]; break;
    case 10: s.melt = 1; s.mirror = 1; s.wavy = 1; s.clouds = 0; break;
    case 11: s.melt = 1; s.mirror = 1; s.wavy = 1; s.clouds = smooth((t - 39.0) / 0.9); s.beam = smooth((t - 39.75) / 0.35); break;
    case 12: s.window = "flat"; break;
    case 13: s.window = "curved"; break;
    case 16: s.fixed = true; s.fins = 0.55 + 0.45 * smooth((t - 56.8) / 2.0); break;
    case 17: s.fixed = true; s.fins = 1; break;
    case 18: s.beam = 1; break;
  }
  return s;
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
type Shot = Partial<Cam> & { pos: V3; look: V3 };
type Key = { f: number; dur?: number; cut?: boolean; s: (f: number) => Shot };
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };
const mixCam = (a: Cam, b: Cam, k: number): Cam => ({
  pos: a.pos.map((v, i) => v + (b.pos[i] - v) * k) as V3, look: a.look.map((v, i) => v + (b.look[i] - v) * k) as V3,
  fov: a.fov + (b.fov - a.fov) * k, roll: a.roll + (b.roll - a.roll) * k,
});
const full = (c: Shot): Cam => ({ fov: 40, roll: 0, ...c });
const run = (keys: Key[], f: number) => {
  let cur = full(keys[0].s(f));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    cur = k.cut ? full(k.s(f)) : mixCam(cur, full(k.s(f)), glide((f - k.f) / (k.dur ?? 24)));
  }
  return cur;
};
const T = (f: number) => f / FPS;
const Fw = (w: number) => Math.round(w * FPS); // voice second -> frame
/** creeping push-in toward the look point: rate per frame since f0, plus a punch (0.6 %/f) for n frames from fp */
const push = (pos: V3, look: V3, f: number, f0: number, rate = 0.0025, fp = -1, n = 30): V3 => {
  let k = rate * Math.max(0, f - f0);
  if (fp >= 0) k += 0.0035 * Math.min(n, Math.max(0, f - fp));
  k = Math.min(k, 0.6);
  return pos.map((v, i) => v + (look[i] - v) * k) as V3;
};
const P = (pos: V3, look: V3, f0: number, rate = 0.0025, fp = -1, fov = 40, roll = 0) => (f: number): Shot => ({ pos: push(pos, look, f, f0, rate, fp), look, fov, roll });

const MIRROR: V3 = [CAR[0] + 1.05, 1.02, CAR[2] + 1.0];
export const CAMS: Record<number, Key[]> = {
  1: [
    { f: 0, s: P([8.6, 0.55, 2.6], [CAR[0] + 0.2, 0.75, CAR[2]], 0, 0.002, Fw(2.78), 40, 0) },
    { f: 52, dur: 40, s: (f) => ({ pos: push([16, 1.4, 30], [-1, 72, -24], f, 92, 0.0015), look: [-1, 72, -24], fov: 54, roll: 0.07 }) },
  ],
  2: [
    { f: 140, s: P([-150, 95, 230], [0, 55, -30], 140, 0.0012, -1, 42) },
    { f: Fw(8.62), dur: 36, s: P([-118, 120, 196], [0, 95, -30], Fw(8.62) + 36, 0.0015, -1, 42) },
  ],
  3: [
    { f: 298, s: P([175, 45, 25], [0, 80, -18], 298, 0.0012, -1, 42) },
    { f: Fw(12.9), dur: 30, s: P([168, 50, 45], [0, 82, -18], Fw(12.9) + 30, 0.0016, -1, 42, -0.08) },
  ],
  4: [{ f: 424, s: P([12.2, 1.6, 6.8], [5.2, 1.6, -2.0], 424, 0.0025, Fw(15.84), 40) }],
  5: [
    { f: 543, s: P([-4.5, 1.55, 3.5], [3.2, 1.2, -3.0], 543, 0.0025, -1, 40) },
    { f: Fw(20.3), cut: true, s: P([MIRROR[0] + 0.9, 1.3, MIRROR[2] + 1.7], [MIRROR[0], 0.85, MIRROR[2]], Fw(20.3), 0.003, Fw(21.62), 38) },
  ],
  6: [
    { f: 663, s: P([9.0, 1.3, 4.4], [5.0, 0.9, CAR[2]], 663, 0.002) },
    { f: 668, dur: 70, s: P([0.6, 1.35, 4.6], [3.2, 0.9, CAR[2]], 738, 0.003) },
  ],
  7: [
    { f: 750, s: P([-2, 1.5, 2.5], [3.5, 1.1, -3.0], 750, 0.002) },
    { f: 752, dur: 20, s: P([-16.6, 1.25, -1.6], [-23.2, 0.9, -6.6], 772, 0.0022, Fw(27.4), 40) },
  ],
  8: [
    { f: 861, s: P([REPORTER_AT[0] + 1.6, 0.9, REPORTER_AT[2] + 3.6], [REPORTER_AT[0], 0.95, REPORTER_AT[2]], 861, 0.0025) },
    { f: Fw(31.05), cut: true, s: P([EGG[0] + 0.32, 0.3, EGG[2] + 0.72], [EGG[0], 0.14, EGG[2]], Fw(31.05), 0.0025, Fw(32.7), 40) },
  ],
  9: [
    { f: 998, s: P([REPORTER_AT[0] + 1.0, 1.15, REPORTER_AT[2] + 3.7], [REPORTER_AT[0] - 0.25, 1.05, REPORTER_AT[2]], 998, 0.002) },
    { f: 1010, dur: 30, s: P([REPORTER_AT[0] + 1.0, 1.55, REPORTER_AT[2] + 3.5], [REPORTER_AT[0] - 0.25, 1.55, REPORTER_AT[2]], 1040, 0.002, Fw(34.85)) },
  ],
  10: [
    { f: 1094, s: P([-2, 1.2, 2.0], [40, 9, 7.5], 1094, 0.0015, -1, 50) },
    { f: 1100, dur: 40, s: P([-2, 1.6, 2.0], [40, 13, 7.5], 1140, 0.0015, -1, 50) },
  ],
  11: [{ f: 1160, s: P([-2, 1.6, 2.0], [40, 13, 7.5], 1160, 0.0018, Fw(39.95), 50) }],
  12: [
    { f: 1216, s: P([LAB[0] + 2.0, 2.4, LAB[2] + 9.5], [LAB[0] - 1.5, 2.6, LAB[2] - 2.0], 1216, 0.0015, -1, 46) },
    { f: 1226, dur: 40, s: P([LAB[0] + 1.0, 2.2, LAB[2] + 9.0], [LAB[0] - 2.2, 1.8, LAB[2] - 1.0], 1266, 0.0015, -1, 46) },
  ],
  13: [{ f: 1310, s: P([LAB[0] + 1.0, 2.2, LAB[2] + 9.0], [LAB[0] - 2.2, 1.6, LAB[2] - 0.6], 1310, 0.002, Fw(46.1), 46) }],
  14: [{ f: 1409, s: P([PARK[0] + 0.8, 0.95, PARK[2] + 2.4], [PARK[0] + 0.1, 0.7, PARK[2]], 1409, 0.0025, Fw(47.55)) }],
  15: [
    { f: 1485, s: P([PARK[0] + 0.8, 0.95, PARK[2] + 2.4], [PARK[0] + 0.1, 0.7, PARK[2]], 1409, 0.0025) },
    { f: 1487, dur: 44, s: P([PARK[0] + 2, 2.4, PARK[2] + 14], [0, 75, -30], 1531, 0.0013, Fw(53.3), 44) },
  ],
  16: [
    { f: 1621, s: P([10.2, 1.5, 4.0], [5.2, 1.4, -3.0], 1621, 0.002) },
    { f: Fw(56.25), dur: 32, s: P([12, 1.6, 7], [-2, 46, -12], Fw(56.25) + 32, 0.0015, -1, 46) },
  ],
  17: [{ f: 1786, s: P([0.6, 1.0, -0.6], [0, 2.4, -10.5], 1786, 0.0022, Fw(61.1), 54, 0.03) }],
  18: [
    { f: 1877, s: P([VEGAS[0] + 55, 22, VEGAS[2] + 175], [VEGAS[0], 70, VEGAS[2] - 30], 1877, 0.0012, -1, 50) },
    { f: Fw(65.3), dur: 40, s: P([VEGAS[0] - 6.0, 1.7, VEGAS[2] + 53], [VEGAS[0] - 7.6, 1.2, VEGAS[2] + 42.4], Fw(65.3) + 40, 0.0025, -1, 42) },
  ],
};
/** impact flip-shakes: frame, strength (radians of roll / metres) */
export const KICKS: [number, number][] = [[Fw(2.78), 0.6], [Fw(24.56), 1], [Fw(34.9), 0.8], [Fw(40.0), 0.7], [Fw(58.12), 0.6], [Fw(58.6), 0.5], [Fw(67.25), 1]];
export const kickAt = (f: number) => {
  let r = 0;
  for (const [k, s] of KICKS) { const n = f - k; if (n >= 0 && n < 7) r += s * (n % 2 ? -1 : 1) * (1 - n / 7); }
  return r;
};
export const camAt = (id: number, f: number): Cam => {
  const c = run(CAMS[id], f), k = kickAt(f);
  if (!k) return c;
  return { ...c, roll: c.roll + 0.012 * k, pos: [c.pos[0], c.pos[1] + 0.02 * k * (1 + c.pos[1] * 0.01), c.pos[2]] };
};

// ---------------- lens blur (cInf in px at 1080 wide; 0 = sharp) ----------------
export type Dof = { f: number; dur?: number; cInf: number; focus?: (f: number) => V3 };
export const DOF: Dof[] = [
  { f: 0, cInf: 14, focus: () => [CAR[0] + 0.5, 1.0, CAR[2] + 1] }, { f: 52, dur: 30, cInf: 0 },
  { f: 424, cInf: 11, focus: () => [6.4, 1.5, -1.3] },
  { f: 543, cInf: 6, focus: () => [1.5, 1.5, -1.2] }, { f: Fw(20.3), dur: 1, cInf: 14, focus: () => MIRROR },
  { f: 663, cInf: 12, focus: () => [4.2, 0.9, CAR[2] + 0.95] },
  { f: 750, cInf: 0 }, { f: 772, dur: 10, cInf: 10, focus: () => [-23.5, 1.1, -6.4] }, { f: Fw(27.4), dur: 14, cInf: 10, focus: () => [BIKE[0], 0.9, BIKE[2]] },
  { f: 861, cInf: 12, focus: () => [REPORTER_AT[0], 1.5, REPORTER_AT[2]] }, { f: Fw(31.05), dur: 1, cInf: 13, focus: () => EGG },
  { f: 998, cInf: 12, focus: () => [REPORTER_AT[0], 1.5, REPORTER_AT[2]] },
  { f: 1094, cInf: 0 },
  { f: 1216, cInf: 6, focus: () => [LAB[0] - 2, 1.8, LAB[2] - 1] },
  { f: 1409, cInf: 13, focus: () => [PARK[0], 1.0, PARK[2]] }, { f: 1490, dur: 36, cInf: 0 },
  { f: 1621, cInf: 10, focus: () => [6.2, 1.5, -1.0] }, { f: Fw(56.25), dur: 24, cInf: 0 },
  { f: 1786, cInf: 5, focus: () => [PODIUM[0], 1.5, PODIUM[2]] },
  { f: 1877, cInf: 0 }, { f: Fw(65.3) + 20, dur: 20, cInf: 9, focus: () => [VEGAS[0] - 7.6, 1.2, VEGAS[2] + 44] },
];
export const dofAt = (f: number) => {
  let cur: { cInf: number; focus?: (f: number) => V3 } = { cInf: DOF[0].cInf, focus: DOF[0].focus };
  for (const d of DOF) {
    if (f < d.f) break;
    const k = glide((f - d.f) / (d.dur ?? 1));
    cur = { cInf: cur.cInf + (d.cInf - cur.cInf) * k, focus: d.focus ?? cur.focus };
  }
  return cur;
};
