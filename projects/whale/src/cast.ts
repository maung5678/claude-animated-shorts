// "Raining Whale" cast: our own flat cartoon people, gulls and effects in the 3D beach (same card machinery as the
// bridge short: canvas pool, lit yaw-only billboards, contact blobs, unlit effect cards on the NOINK layer).
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, KID, fxBurst, fxShadow, fxContact, fxGull, fxPuffC, fxStink, fxSpark, fxBow, fxKetchup, fxBit, fxStars,
  fxHat, fxCooler, fxArrow, fxAlarm, Outfit, Expr, FrontOpts, SideOpts, SKINS, INK, Pose,
} from "./toon";
import {
  FPS, V3, smooth, clamp01, hh, groundY, at, SHOTS, has, CRATES, PLUNGER, TRUCK, CAR, CAMSTAND, PARK, PACKET, T_PUSH, T_BLAST, T_FLAT,
  T_STOMP, T_SQUIRT, CREST, CHUNKS, chunkAt, carChunkDrop, SIGN,
} from "./story";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

// ---------------- canvas pool ----------------
type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

// ---------------- sprite meshes ----------------
const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit: 1000 units = 2.16 m
export const SU_SWING = 2.3 / 1830; // swing canvas: rope of 1830 units = 2.3 m
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);
/** world roots that hold actors (to find the scene's sun when world.ts does not pass it) */
const ROOTS = new Set<THREE.Object3D>();

/** lit flat character: cardShade() material, receives shadows (dims to the bright floor only), casts its silhouette
 *  when world.ts says so (golden). Drawn after the contact blobs (renderOrder 1). */
export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D, geo: THREE.BufferGeometry = BODY) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    // rim width is in output pixels: tell the card shader the render height (1920 = 1080 x 1920 frame)
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
    ROOTS.add(parent);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
/** unlit effect card: hard cut-out (ink drawings), soft see-through (dust, mist) or a multiply ground blob */
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mat.alphaToCoverage = false; // A2C + MSAA left 1 px sky-depth seams on blurred far cards (POST)
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  use(soft: boolean) { this.mesh.material = soft ? this.soft : this.mat; }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      // no mipmaps: at grazing views the mip chain averages the blob with its white surround and it fades out
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    }
    else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

// ---------------- placements ----------------
export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number]; sy?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const q = (v: number, n = 120) => Math.round(v * n) / n;
/** head-shape seed: 7 shapes, so marching soldiers in step still share canvases */
const seedOf = (i: number) => ((i * 5 + 3) % 7) + 1;
/** drawing resolution by distance: [canvas w, h, scale from the 600 x 1000 design]; sized for the 1440 x 2560 final */
const tier = (d: number): [number, number, number] =>
  d < 3.2 ? [1800, 3000, 3.0] : d < 6.5 ? [1080, 1800, 1.8] : d < 16 ? [480, 800, 0.8] : [240, 400, 0.4];

// ---------------- light ----------------
const SUN = new THREE.Vector3(0.5, 0.75, -0.4).normalize();
const tmp = new THREE.Vector3();
let LNAME: "day" | "golden" = "day";
const lname = (l: string): "day" | "golden" => (l === "golden" || l === "dusk" ? "golden" : "day");
const sunOf = (root: THREE.Object3D) => {
  let s: THREE.DirectionalLight | null = null;
  root.traverse((o) => { if (!s && o instanceof THREE.DirectionalLight && o.castShadow) s = o; });
  return s as THREE.DirectionalLight | null;
};
/** the sun of the world that is calling: the attached root whose sun target sits on this camera's view axis */
const findSun = (cam: CamInfo, out: THREE.Vector3) => {
  if (cam.sun) return out.copy(cam.sun).normalize();
  let best: THREE.DirectionalLight | null = null, err = Infinity;
  for (const r of ROOTS) {
    if (!r.parent) continue;
    const s = sunOf(r);
    if (!s) continue;
    const d = tmp.copy(s.target.position).sub(cam.pos), e = Math.abs(d.dot(cam.right)) / (d.length() || 1);
    if (e < err) { err = e; best = s; }
  }
  return best ? out.copy(best.position).sub(best.target.position).normalize() : out;
};
/** canvas angle the sun comes FROM on an upright card facing the camera, in 45-degree steps (small texture cache) */
const light2D = (cam: CamInfo, mirror: boolean) => {
  const sx = SUN.dot(cam.right) * (mirror ? -1 : 1), sy = -SUN.y;
  return Math.round(Math.atan2(sy, sx) / (Math.PI / 4)) * (Math.PI / 4);
};

/** front / side view and mirroring for someone at (x, z) walking along (dx, dz); fs = foreshortening of the walk */
const viewOf = (cam: CamInfo, x: number, z: number, dx: number, dz: number) => {
  const tx = cam.pos.x - x, tz = cam.pos.z - z, tl = Math.hypot(tx, tz) || 1;
  const c = (tx * dx + tz * dz) / tl;
  return { side: c < 0.57, mirror: dx * cam.right.x + dz * cam.right.z < 0, fs: Math.round(Math.sqrt(Math.max(0, 1 - c * c)) * 20) / 20 };
};

// ---------------- life: blinks and reaction timing ----------------
/** reference expression and action changes land 0-3 f before the word onset */
const LEAD = 2 / FPS;
/** eyelid 0 open .. 1 shut. Reference: gaps 0.5-2.3 s, 4-frame blink half / shut / shut / half, plus a blink across
 *  every expression swap (the shut frames hide the swap) */
const LID = [0.5, 1, 1, 0.5];
const lidAt = (t: number, i: number, swaps: number[] = []) => {
  const f = Math.round(t * FPS);
  for (const ts of swaps) { const k = f - Math.round((ts - LEAD) * FPS) + 1; if (k >= 0 && k < 4) return LID[k]; }
  let s = Math.round(-60 * hh(i, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hh(i * 31 + n, 13)); // next blink 0.5-2.3 s later
  }
  return 0;
};
const fkey = (o: object) => JSON.stringify(o, (_k, v) => (typeof v === "number" ? q(v) : v));

type Who = { i: number; o: Outfit; okey: string };
/** one character drawing in the 600 x 1000 design space, sized by distance, lit from the scene's sun */
const person = (cam: CamInfo, who: Who, x: number, y: number, z: number, view: { side: boolean; mirror: boolean }, fo: FrontOpts, so: SideOpts, scale = 1): Place & { tierKey: string } => {
  const d = cam.pos.distanceTo(tmp.set(x, y + 1.2, z)) / scale;
  const [w, h, k] = tier(d);
  const mirror = view.side && view.mirror, light = light2D(cam, mirror), seed = seedOf(who.i);
  const f2: FrontOpts = { ...fo, light, seed }, s2: SideOpts = { ...so, light, seed };
  const key = view.side ? `S|${who.okey}|${fkey(s2)}` : `F|${who.okey}|${fkey(f2)}`;
  return {
    key, x, y, z, scale, mirror, tierKey: `${w}`,
    draw: (p) => (view.side ? bodySide(p, who.o, s2) : bodyFront(p, who.o, f2)),
    size: [w, h, k],
  };
};

/** ground shadow under a standing / sitting card (review rounds 2-4), multiply, blue-violet: a TIGHT contact pool right under
 *  the feet (~.5 on screen at the core) so nobody floats, plus by day (cards cast no real shadow) a lighter soft tail
 *  stretched AWAY from the sun, length ~1.6 m / tan(sun elevation), capped. Golden: world.ts casts real card shadows. */
const CONTACT: Record<"day" | "golden", [number, number, number]> = { day: [0.2, 0.21, 0.33], golden: [0.24, 0.2, 0.33] };
const TAIL: [number, number, number] = [0.42, 0.44, 0.62];
const toSrgb = (v: number) => { const c = clamp01(v); return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; };
const hexOf = (c: [number, number, number], k: number) => "#" + c.map((v) => Math.round(255 * toSrgb(1 - (1 - v) * k)).toString(16).padStart(2, "0")).join("");
const blob = (out: Stage, x: number, y: number, z: number, sc = 1, k = 1) => {
  const hl = Math.hypot(SUN.x, SUN.z) || 1, ox = -SUN.x / hl, oz = -SUN.z / hl, rot = Math.atan2(-ox, -oz);
  if (LNAME === "day") {
    const el = Math.asin(Math.min(0.99, Math.max(0.1, SUN.y)));
    const len = Math.min(2.4, Math.max(0.5, 1.6 / Math.tan(el))) * sc, h = len + 0.55 * sc, c = 0.3 * h; // feet at v = .2 of the card
    const tc = hexOf(TAIL, k);
    out.fx.push({ key: `blob|shadow|${tc}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, tc), x: x + ox * c, y: y + 0.018, z: z + oz * c,
      w: 0.72 * sc, h, flat: true, rot });
  }
  const cc = hexOf(CONTACT[LNAME], k);
  out.fx.push({ key: `blob|contact|${cc}`, cw: 128, ch: 128, draw: (p) => fxContact(p, cc), x: x + ox * 0.03 * sc, y: y + 0.022, z: z + oz * 0.03 * sc,
    w: 0.52 * sc, h: 0.4 * sc, flat: true, rot });
};

export type Stage = { places: Place[]; fx: FxPlace[] };

// ---------------- our cast ----------------
type O = Outfit;
const WORKER = (v: number): O => ({ jacket: ["#ff7a26", "#f2621c", "#ff9330"][v % 3], pants: "#2f4470", boots: "#5a3b2a", hat: "hardhat", cap: "#ffcc29", skin: SKINS[v % 4], buttons: "#f6f0d8" });
const ENGINEER: O = { jacket: "#f6f4ee", pants: "#5a5f6e", boots: "#3a2a20", hat: "hardhat", cap: "#f8f6f0", moustache: "#4a3020", build: "stout", buttons: "#c9ccd2", skin: SKINS[1] };
const ENG_OLD: O = { ...ENGINEER, moustache: "#d8d4cc" };
const WARNER: O = { jacket: "#5f6d34", pants: "#4a4038", boots: "#3a2a20", hat: "cap", cap: "#6b4a33", moustache: "#5a4030", skin: SKINS[2], buttons: "#c8b27a" };
const WARNER_OLD: O = { ...WARNER, moustache: "#e6e1d8" };
const REPORTER: O = { jacket: "#c23a4f", pants: "#3b3f52", boots: "#2a2020", hat: "hair", hair: "#3a2a20", skin: SKINS[0] };
const CAMERAMAN: O = { jacket: "#2f6fd0", pants: "#4a4038", boots: "#3a2a20", hat: "cap", cap: "#1f4a55", skin: SKINS[3] };
const KID2: O = { ...KID, jacket: "#2f6fd0", cap: "#ffcc29" };
const COATS = ["#e2a92e", "#c25a7a", "#2f8a8a", "#8b5e3c", "#7c9a2f", "#5a7fe0", "#d9542e", "#9a4fb0"];
const HAIR = ["#3a2a20", "#7a4a2a", "#d9b46a", "#2a2020", "#a8643a"];
const CROWD = (v: number): O => {
  const o: O = { jacket: COATS[v % 8], pants: ["#3b3f52", "#5a4a3a", "#2f4a6a"][v % 3], boots: "#4a3426", skin: SKINS[v % 4], hat: v % 5 === 3 ? "cap" : "hair", cap: "#3b5b9a", hair: HAIR[v % 5] };
  if (v % 3 === 1) o.dress = ["#e2a92e", "#c25a7a", "#5a8fc2", "#ff7a26"][v % 4];
  if (v % 7 === 2) o.moustache = "#3a2a20";
  return o;
};
const CROWD_O = Array.from({ length: 8 }, (_, v) => CROWD(v));
const noHat = (o: O): O => ({ ...o, hat: o.hat === "hardhat" || o.hat === "cap" ? "hair" : o.hat, hair: o.hair ?? "#3a2a20" });

const who = (i: number, o: O, okey: string) => ({ i, o, okey });
/** front-view person at ground (x, z); dy lifts the card (jumps, standing on things); sy squashes/stretches it */
type Act = FrontOpts & { dy?: number; sy?: number; swaps?: number[]; noBlob?: boolean };
const stand = (out: Stage, cam: CamInfo, t: number, i: number, o: O, okey: string, x: number, z: number, a: Act, sc = 1) => {
  const y = groundY(x, z), dy = a.dy ?? 0;
  const pl = person(cam, who(i, o, okey), x, y + dy, z, { side: false, mirror: false }, { mode: "stand", blink: lidAt(t, i, a.swaps), ...a }, {}, sc);
  if (a.sy) pl.sy = a.sy;
  out.places.push(pl);
  if (!a.noBlob) blob(out, x, y, z, sc, dy > 0.05 ? Math.max(0.35, 1 - dy) : 1);
};
const walkSide = (out: Stage, cam: CamInfo, t: number, i: number, o: O, okey: string, x: number, z: number, dx: number, dz: number, phase: number, expr: Expr, sc = 1) => {
  const y = groundY(x, z), view = viewOf(cam, x, z, dx, dz);
  const fo: FrontOpts = { mode: "stroll", pose: "run", phase, expr, blink: lidAt(t, i), tilt: 6 };
  const so: SideOpts = { mode: "march", phase, expr, stomp: 0.9, stride: 1.3 * view.fs, blink: lidAt(t, i) };
  out.places.push(person(cam, who(i, o, okey), x, y, z, view, fo, so, sc));
  blob(out, x, y, z, sc);
};
const fxAt = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, p: V3, w: number, h: number, extra: Partial<FxPlace> = {}) =>
  out.fx.push({ key, cw, ch, draw, x: p[0], y: p[1], z: p[2], w, h, ...extra });
const faded = (alpha: number, draw: (p: Pen) => void) => (p: Pen) => { p.g.globalAlpha = alpha; draw(p); p.g.globalAlpha = 1; };
const F = (f: number) => f / FPS;
/** 0 before a, 1 after b, smooth between (frames) */
const k01 = (t: number, a: number, b: number) => smooth((t - F(a)) / (F(b) - F(a)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const osc = (t: number, hz: number, i = 0) => Math.sin(t * hz * Math.PI * 2 + i);
/** a jump arc: height h peaking halfway through [a, b] frames */
const hop = (t: number, a: number, b: number, h: number) => { const u = (t - F(a)) / (F(b) - F(a)); return u > 0 && u < 1 ? 4 * h * u * (1 - u) : 0; };

// gulls
const gull = (out: Stage, t: number, i: number, p: V3, size = 0.9, perched = false, mirror = false) => {
  const flap = perched ? 0 : q(0.5 + 0.5 * Math.sin(t * 9 + i * 1.7), 6);
  fxAt(out, perched ? "gullP" : `gull${flap}`, 400, 240, (pp) => fxGull(pp, flap, perched), p, mirror ? -size : size, size * 0.6, { rot: perched ? 0 : 0.15 * Math.sin(t * 2 + i) });
};
const bibGull = (out: Stage, t: number, i: number, p: V3, size = 0.6) => {
  const bob = 0.04 * Math.max(0, osc(t, 2.2, i)), lean = q(0.12 * osc(t, 1.1, i * 2), 10);
  fxAt(out, `gullBib${lean}`, 400, 300, (pp) => { pp.g.translate(0, 40); fxGull(pp, 0, true); pp.g.translate(0, -40); pp.poly([[250, 150], [300, 150], [276, 210]], "#ffffff", 5); pp.stroke([[250, 150], [300, 150]], 6, "#d23a35"); },
    [p[0], p[1] + bob, p[2]], size, size * 0.75, { rot: lean });
};
const faintGull = (out: Stage, p: V3, size = 0.6) =>
  fxAt(out, "gullFaint", 400, 240, (pp) => { pp.g.translate(400, 240); pp.g.rotate(Math.PI); fxGull(pp, 0, true); pp.g.setTransform(1, 0, 0, 1, 0, 0); pp.stroke([[255, 150], [275, 170]], 6); pp.stroke([[275, 150], [255, 170]], 6); }, p, size, size * 0.6, { rot: 0.2 });
const circling = (out: Stage, t: number, n: number, c: V3, r: number) => {
  for (let i = 0; i < n; i++) {
    const a = t * (0.5 + 0.1 * (i % 3)) + (i / n) * Math.PI * 2;
    gull(out, t, i, [c[0] + Math.cos(a) * r * (0.7 + 0.3 * hh(i)), c[1] + 1.5 * hh(i, 2) + 0.4 * Math.sin(t * 1.3 + i), c[2] + Math.sin(a) * r * 0.6]);
  }
};
const hatFly = (out: Stage, t: number, t0: number, p: V3, col: string, kind: "hard" | "cap", vx = 1.2) => {
  const u = t - t0;
  if (u < 0 || u > 1.6) return;
  const y = p[1] + 4.2 * u - 4.9 * u * u;
  if (y < groundY(p[0], p[2]) + 0.05) return;
  fxAt(out, `hat${kind}${col}`, 128, 96, (pp) => fxHat(pp, col, kind), [p[0] + vx * u, y, p[2]], 0.42, 0.32, { rot: u * 9 });
};

// the crowd on the crest (rope line at z -55.5)
const CROWD_SPOTS: [number, number][] = Array.from({ length: 34 }, (_, i) => {
  const row = i % 3, k = Math.floor(i / 3);
  return [-17 + k * 3.0 + row * 1.0 + (hh(i) - 0.5) * 0.9, -57.2 - row * 1.5 - hh(i, 2) * 0.6];
});
const WARN_AT: [number, number] = [-4, -58.4];
const COOLER_AT: [number, number] = [1.2, -57.6];
const crowd = (out: Stage, cam: CamInfo, id: number, t: number, tau: number) => {
  const ub = tau - T_BLAST;
  const back = id === 7 ? -1.3 * k01(t, 715, 770) : id > 7 ? -1.3 : 0; // "the crowd was moved back"
  CROWD_SPOTS.forEach(([x0, z00], i) => {
    if (Math.hypot(x0 - WARN_AT[0], z00 - WARN_AT[1]) < 1.2 || Math.hypot(x0 - CAMSTAND[0], z00 - CAMSTAND[2]) < 1.6 || Math.hypot(x0 - COOLER_AT[0], z00 - COOLER_AT[1]) < 1.2) return;
    const z0 = z00 + back;
    const o = CROWD_O[i % 8], okey = `c${i % 8}`, ii = i + 100;
    const ph = hh(i, 5) * 0.4; // everyone reacts a little apart
    let a: Act = { expr: (["smile", "neutral", "grin", "smile_closed"] as Expr[])[i % 4], look: Math.round(Math.sin(t * 0.7 + i * 1.7)) };
    if (id === 5) {
      // heads turn toward the warner when he speaks up; the nearest ones point at him
      const near = Math.abs(x0 - WARN_AT[0]) < 6;
      a = { expr: t > F(560) ? (near ? "worried" : "neutral") : "smile", look: t > F(548) + ph ? (x0 > WARN_AT[0] ? -1 : 1) : 0, pose: near && i % 4 === 1 && t > F(590) ? "point" : undefined, facing: x0 > WARN_AT[0] ? -1 : 1 };
    }
    if (id === 7 && ub < 0) a = { expr: t > F(815) ? "worried" : (["excited", "grin", "laugh", "excited"] as Expr[])[i % 4], pose: t < F(770) && i % 5 === 0 ? "point" : undefined, dy: t < F(770) ? hop(t, 735 + i * 3, 750 + i * 3, 0.12) : 0 };
    if (ub >= 0 && ub < 0.7) { a = { expr: "shock", pose: "flinch", tilt: -8 * smooth(ub / 0.15) }; if (i % 3 === 2) hatFly(out, t, T_BLAST + 0.05 + ph * 0.2, [x0, groundY(x0, z0) + 2.0, z0], "#3b5b9a", "cap", (hh(i) - 0.5) * 3); }
    if (ub >= 0.7 && ub < 3.4) a = { expr: "shock", look: 0, headTilt: -8, pose: i % 4 === 0 ? "point" : undefined };
    if (ub >= 3.4 && id !== 14) {
      const r = ub - 3.4;
      if (i % 3 === 0) { // run for it
        const dx = i % 2 ? 1 : -1;
        walkSide(out, cam, t, ii, o, okey, x0 + dx * 3.2 * r, z0 - 0.8 * r, dx, -0.2, q((r * 2.6) % 1, 12), "panic");
        return;
      }
      a = i % 3 === 1 ? { mode: "sit", pose: "cover", expr: "panic" } : { pose: "cover", expr: "panic", dy: 0.02 * Math.abs(osc(t, 3, i)) };
    }
    if (id === 14) { const d = 0.25 + (x0 + 17) * 0.03; a = t - F(1544) > d ? { mode: "sit", pose: "cover", expr: "panic" } : { expr: "shock", headTilt: -8 }; }
    stand(out, cam, t, ii, o, okey, x0, z0, a);
  });
  // the man who dives behind the cooler
  if (id >= 7 && id <= 8) {
    const r = ub - 3.4;
    fxAt(out, "cooler", 200, 140, fxCooler, at(COOLER_AT[0], COOLER_AT[1], 0.24), 0.62, 0.43);
    stand(out, cam, t, 140, CROWD_O[6], "c6", COOLER_AT[0] - 0.05, COOLER_AT[1] - 0.45, r > 0 ? { mode: "sit", pose: "cover", expr: "panic", dy: -0.15 } : { expr: ub > 0 ? "shock" : "excited" });
  }
};
const KID_SHOULDERS = (out: Stage, cam: CamInfo, t: number, id: number) => {
  // a kid on dad's shoulders (shot 7, before the blast)
  const [x, z] = CROWD_SPOTS[10];
  stand(out, cam, t, 141, CROWD_O[4], "c4", x + 0.2, z - 1.3 * k01(t, 715, 770) - 0.25, { expr: "grin", noBlob: false });
  stand(out, cam, t, 142, KID, "kid", x + 0.2, z - 1.3 * k01(t, 715, 770) - 0.24, { expr: t > F(815) ? "shock" : "laugh", pose: t > F(815) ? "cover" : "up", dy: 1.45, noBlob: true }, 0.7);
  void id;
};
const warnerCrest = (out: Stage, cam: CamInfo, t: number, id: number, tau: number) => {
  let a: Act = { expr: "neutral", facing: 1 };
  if (id === 5) {
    // raises a hand on "army", then waves both arms and shakes his head on "way too much"
    if (t < F(560)) a = { expr: "neutral", look: 1 };
    else if (t < F(600)) a = { expr: "worried", pose: "point", facing: 1, swaps: [F(560)] };
    else a = { expr: "panic", pose: osc(t, 2.4) > 0 ? "up" : "shrug", look: osc(t, 3) > 0 ? 1 : -1, swaps: [F(560), F(600)] };
  }
  if (id === 7) a = tau < T_BLAST ? { expr: "worried", pose: "palm" } : { expr: "shock", pose: "flinch" };
  if (id === 8) a = tau - T_BLAST < 3.4 ? { expr: "shock", look: 0, headTilt: -8 } : { mode: "sit", pose: "cover", expr: "panic" };
  stand(out, cam, t, 7, WARNER, "warner", WARN_AT[0], WARN_AT[1] - (id >= 7 ? 1.3 : 0), a);
};
const press = (out: Stage, cam: CamInfo, t: number, tau: number) => {
  const after = tau > T_BLAST;
  stand(out, cam, t, 8, CAMERAMAN, "camman", CAMSTAND[0] - 0.2, CAMSTAND[2] - 0.9, { expr: after ? "shock" : "smug", prop: "tvcam", dy: after ? hop(tau, 829 * 1, 838, 0.15) : 0 });
  const thumbs = t > F(775) && t < F(795);
  stand(out, cam, t, 9, REPORTER, "reporter", CAMSTAND[0] - 1.6, CAMSTAND[2] - 0.3,
    after ? { expr: "shock", pose: "flinch" } : thumbs ? { expr: "grin", wave: 0.8, facing: 0 } : { expr: "excited", prop: "mic", facing: -1 });
};

// the blast: flash burst, sand + smoke plume (by story time, so the replays show it too)
const SAND = ["#f6dca8", "#c7a874"], SMOKE = ["#e4dfd8", "#9d968e"];
const blast = (out: Stage, tau: number) => {
  const u = tau - T_BLAST;
  if (u < 0) return;
  if (u < 0.5) fxAt(out, `bigburst${q(u / 0.5, 30)}`, 500, 500, (p) => fxBurst(p, q(u / 0.5, 30), "#fff3b0", 14, 30, 240), [0, 3, -0.8], 24, 24);
  for (let i = 0; i < 18; i++) {
    const t0 = i * 0.03, k = u - t0;
    if (k < 0 || k > 7) continue;
    const rise = 28 * (1 - Math.exp(-k * 0.9)) * (0.5 + 0.7 * hh(i, 1)), spread = (hh(i, 2) - 0.5) * 13 * (1 - Math.exp(-k));
    const size = 4 + 12 * (1 - Math.exp(-k * 1.3)) * (0.6 + 0.6 * hh(i, 3));
    const fade = q(Math.min(1, Math.max(0, (7 - k) / 3)) * 0.95, 8);
    if (fade <= 0) continue;
    const col = i % 3 === 0 ? SMOKE : SAND, seed = i % 5;
    fxAt(out, `puff${seed}${col[0]}${fade}`, 512, 512, faded(fade, (p) => fxPuffC(p, seed, col[0], col[1])),
      [spread, 1.5 + rise, -0.5 + (hh(i, 4) - 0.5) * 4 - 0.3 * k], size, size, { soft: true, rot: (hh(i, 5) - 0.5) * 0.8 });
  }
};
const bits = (out: Stage, tau: number, c: [number, number], r: number, n: number, landedOnly = false) => {
  const u = tau - T_BLAST;
  if (u < 3.0) return;
  for (let i = 0; i < n; i++) {
    const land = 3.6 + 2.6 * hh(i, 11), x = c[0] + (hh(i, 12) - 0.5) * 2 * r, z = c[1] + (hh(i, 13) - 0.5) * 2 * r, gy = groundY(x, z);
    const k = land - u, y = k > 0 ? gy + 0.5 * 9.8 * k * k : gy + 0.07;
    if ((landedOnly && k > 0) || y > gy + 30) continue;
    const s = 0.16 + 0.22 * hh(i, 14), seed = i % 4;
    fxAt(out, `bit${seed}`, 128, 96, (p) => fxBit(p, seed), [x, y, z], s, s * 0.75, { rot: k > 0 ? u * 3 + i : hh(i, 15) });
  }
};
const dust = (out: Stage, t: number, t0: number, p: V3, size = 1.2, n = 4) => {
  const u = t - t0;
  if (u < 0 || u > 0.9) return;
  for (let i = 0; i < n; i++) {
    const fade = q(0.85 * (1 - u / 0.9), 6), s = size * (0.5 + u) * (0.7 + 0.4 * hh(i, 3));
    fxAt(out, `dust${i % 3}${fade}`, 512, 512, faded(fade, (pp) => fxPuffC(pp, i % 3, SAND[0], SAND[1])), [p[0] + (i - n / 2) * 0.35 * size * (0.4 + u), p[1] + 0.25 * size + u * 0.5, p[2]], s, s, { soft: true });
  }
};

/** everything with a face in shot `id` at time t (tau = story time) */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], tau = s.tau(t);
  LNAME = lname(s.light);
  findSun(cam, SUN);
  const C = (dx: number, dz: number): [number, number] => [CRATES[0] + dx, CRATES[2] + dz];

  if (id === 1) {
    // a worker runs in with a case; the engineer stands proud, then points at the whale on "dynamite"
    const u = k01(t, 0, 75), [x, z] = [lerp(-5.6, -3.0, u), lerp(-5.2, -5.9, u)];
    stand(out, cam, t, 20, WORKER(0), "w0", x, z, u < 1 ? { expr: "excited", prop: "crate", pose: "run", mode: "stroll", phase: q((t * 2.4) % 1, 12), tilt: 10, dy: 0.05 * Math.abs(osc(t, 2.4)) } : { expr: "grin", prop: "crate" });
    if (u < 1) dust(out, t, F(Math.floor(t * 30 / 9) * 9), at(x + 0.3, z), 0.6, 2);
    stand(out, cam, t, 6, ENGINEER, "eng", -4.9, -7.9, t < F(118) ? { expr: "proud", pose: "hips" } : { expr: "smug", pose: "point", facing: 1, swaps: [F(118)] });
    stand(out, cam, t, 21, WORKER(1), "w1", C(2.6, -1.4)[0], C(2.6, -1.4)[1], { expr: "grin", prop: "crate" });
  }
  if (id === 2 && t < F(250)) {
    // tiny people around the whale for scale: a kid "measures" it with open arms
    stand(out, cam, t, 60, KID, "kid", -3.2, 3.4, { expr: "excited", pose: "up", dy: hop(t, 160, 175, 0.25) + hop(t, 200, 215, 0.25) }, 0.75);
    stand(out, cam, t, 61, CROWD_O[1], "c1", 3.4, 4.0, { expr: "shock", pose: "point", facing: -1 });
    stand(out, cam, t, 62, CROWD_O[5], "c5", 6.4, 3.0, { expr: "excited", pose: "up" });
  }
  if (id === 1 && t > F(96)) {
    // crates CU: last case slammed down, dust, the gull on the pile jumps
    dust(out, t, F(100), [CRATES[0] + 0.6, 1.15, CRATES[2] + 0.2], 0.8);
    const jump = hop(t, 100, 112, 0.35);
    gull(out, t, 3, [CRATES[0] - 0.2, 1.32 + jump, CRATES[2] + 0.35], 0.55, true);
    if (t > F(100) && t < F(118)) fxAt(out, "alarm", 200, 120, fxAlarm, [CRATES[0] - 0.15, 1.75 + jump, CRATES[2] + 0.35], 0.35, 0.21);
    stand(out, cam, t, 22, WORKER(1), "w1", C(-1.6, -1.0)[0], C(-1.6, -1.0)[1], { expr: t > F(110) ? "grin" : "worried", pose: t > F(110) ? "palm" : undefined, swaps: [F(110)] });
  }
  if (id === 2 && t > F(240)) {
    // a gull lands on the head, sniffs, keels over; a passer-by pinches her nose
    if (t < F(268)) { const u = k01(t, 240, 268); gull(out, t, 4, [lerp(8, 5.5, u), lerp(5.5, 3.0, u), lerp(1.5, 0.3, u)], 0.6); }
    else if (t < F(276)) gull(out, t, 4, [5.5, 2.95, 0.3], 0.55, true);
    else faintGull(out, [5.5, 2.75, 0.3], 0.55);
    if (t > F(250)) fxAt(out, `stink${q((t * 0.7) % 1, 20)}`, 400, 420, (p) => fxStink(p, q((t * 0.7) % 1, 20)), [5.2, 3.6, 0.3], 2.2, 2.3);
    stand(out, cam, t, 63, CROWD_O[1], "c1", 8.3, -2.4, { expr: t > F(268) ? "disgust" : "neutral", pose: t > F(268) ? "palm" : undefined, facing: -1, swaps: [F(268)] });
  }
  if (id === 3 && t < F(372)) {
    // a worker hammers the sign in; it wobbles; the gull on top gets bounced
    const hits = [300, 318, 336, 354];
    let k = 1;
    for (const h of hits) { const n = t * 30 - h; if (n >= -9 && n < -5) k = Math.min(k, 1 - smooth((n + 9) / 4)); else if (n >= -5 && n < 0) k = 0; }
    stand(out, cam, t, 23, WORKER(2), "w2", SIGN[0] + 0.45, SIGN[2] - 0.3, { expr: "deadpan", prop: ["hammer", q(k, 20)], facing: -1 });
    const last = Math.max(...hits.filter((h) => t * 30 >= h), -99);
    const jig = last > 0 ? hop(t, last, last + 8, 0.25) : 0;
    gull(out, t, 3, [SIGN[0], groundY(SIGN[0], SIGN[2]) + 2.72 + jig, SIGN[2]], 0.5, true);
    for (const h of hits) if (t * 30 >= h && t * 30 < h + 5) { const v = q((t * 30 - h) / 5, 10); fxAt(out, `burst${v}`, 500, 500, (p) => fxBurst(p, v), [SIGN[0] + 0.1, groundY(SIGN[0], SIGN[2]) + 2.35, SIGN[2] - 0.2], 0.6, 0.6); }
  }
  if (id === 3 && t >= F(372)) {
    // the truck has just skidded in; the crew jumps down one by one, the engineer steps out last
    dust(out, t, F(372), [TRUCK[0] + 1.5, groundY(TRUCK[0], TRUCK[2]) + 0.3, TRUCK[2] - 1], 2.2, 5);
    [[TRUCK[0] + 2.0, TRUCK[2] - 4.6], [TRUCK[0] + 3.4, TRUCK[2] - 5.4], [TRUCK[0] + 1.0, TRUCK[2] - 6.0]].forEach(([x, z], i) => {
      const f0 = 380 + i * 7, dy = hop(t, f0, f0 + 10, 0.55), land = t * 30 > f0 + 10 && t * 30 < f0 + 14;
      stand(out, cam, t, 30 + i, WORKER(i + 1), `w${i + 1}`, x, z, { expr: (["excited", "grin", "excited"] as Expr[])[i], pose: dy > 0 ? "jump" : i === 1 ? "hips" : undefined, prop: i === 2 ? "shovel" : null, dy, sy: land ? 0.9 : dy > 0 ? 1.06 : 1 });
    });
    stand(out, cam, t, 6, ENGINEER, "eng", TRUCK[0] + 4.4, TRUCK[2] - 6.8, { expr: "smug", prop: "clipboard", facing: -1 });
  }
  if (id === 4 && t < F(480)) {
    // the plan, as a lecture: pointing at the easel drawing
    const pt = t > F(430);
    stand(out, cam, t, 6, ENGINEER, "eng", 7.1, -7.7, { expr: t > F(452) ? "smug" : "proud", pose: pt ? "point" : "hips", facing: 1, swaps: [F(430), F(452)] });
  }
  if (id === 4 && t >= F(480)) {
    [-3.2, -1.6, 0, 1.6, 3.2].forEach((x, i) => bibGull(out, t, i, [x, 3.15 - Math.abs(x) * 0.05, 0.3], 1.0));
    circling(out, t, 6, [0.5, 7, 0], 7);
  }
  if (id === 5 || id === 7 || id === 8) crowd(out, cam, id, t, tau);
  if (id === 5 || id === 7 || id === 8) warnerCrest(out, cam, t, id, tau);
  if (id === 6) {
    // the tower of cases: the engineer sets the last one on top and dusts off his hands; a worker sweats below
    const top = t > F(680);
    stand(out, cam, t, 6, ENGINEER, "eng", CRATES[0] + 0.2, CRATES[2] - 0.1, top ? { expr: "proud", pose: "hips", dy: 2.25, noBlob: true, swaps: [F(680)] } : { expr: "smug", prop: "crate", dy: 2.25 + hop(t, 660, 672, 0.15), noBlob: true });
    if (t > F(678) && t < F(690)) dust(out, t, F(678), [CRATES[0] + 0.2, 2.3, CRATES[2] + 0.2], 0.7, 3);
    stand(out, cam, t, 20, WORKER(0), "w0", C(-2.3, -1.4)[0], C(-2.3, -1.4)[1], { expr: "worried", prop: "crate", dy: 0.03 * Math.abs(osc(t, 2)) });
    stand(out, cam, t, 21, WORKER(1), "w1", C(2.6, -1.0)[0], C(2.6, -1.0)[1], { expr: t > F(690) ? "worried" : "deadpan", pose: t > F(690) ? "palm" : undefined });
  }
  if (id === 7) {
    KID_SHOULDERS(out, cam, t, id);
    if (t < F(770)) stand(out, cam, t, 24, WORKER(1), "w1", -9, -53.8, { expr: "stern", pose: "shrug", facing: 1 });
  }
  if (id === 7 || id === 8 || id === 14) press(out, cam, t, tau);
  if (id === 7 && t >= F(795)) {
    // anticipation: up on his toes, then all his weight on the plunger
    const pre = k01(t, 798, 806), push = k01(t, 809, 829);
    const dy = 0.08 * pre * (1 - push), sy = 1 + 0.06 * pre * (1 - push) - 0.1 * push;
    stand(out, cam, t, 6, ENGINEER, "eng", PLUNGER[0], PLUNGER[2] + 0.75, { expr: push > 0.1 ? "grin" : "excited", prop: ["plunger", q(push, 20)], dy, sy, swaps: [F(809)] });
  }
  if (id === 8) bits(out, tau, [cam.pos.x, cam.pos.z - 4], 7, 40);
  if (id === 9) {
    // everyone gets up, goo on heads; one sits dazed under circling stars; a kid laughs and points
    CROWD_SPOTS.slice(0, 22).forEach(([x, z0], i) => {
      const z = z0 - 1.3, up = k01(t, 1004 + (i % 5) * 4, 1020 + (i % 5) * 4);
      stand(out, cam, t, 100 + i, CROWD_O[i % 8], `c${i % 8}`, x, z, i % 4 === 1 ? { mode: "sit", expr: "dizzy" } : { expr: up < 1 ? "panic" : "dizzy", mode: up < 0.5 ? "sit" : "stand", look: Math.round(osc(t, 0.8, i)) });
      if (i % 2 === 0) fxAt(out, `bit${i % 4}`, 128, 96, (p) => fxBit(p, i % 4), at(x + 0.05, z, (i % 4 === 1 ? 1.65 : 2.12)), 0.32, 0.24);
      if (i % 4 === 1) { const u = q((t * 0.9 + i * 0.1) % 1, 30); fxAt(out, `stars${u}`, 420, 210, (p) => fxStars(p, u), at(x, z, 1.95), 0.7, 0.35); }
    });
    stand(out, cam, t, 142, KID, "kid", -1.6, -57.4, { expr: "laugh", pose: "point", facing: -1, dy: hop(t, 1030, 1042, 0.18) }, 0.7);
    bits(out, tau, [cam.pos.x, cam.pos.z - 4], 7, 40, true);
  }
  if (id === 10 || id === 11) {
    const W: [number, number] = [CAR[0] + 1.9, CAR[2] + 2.7];
    if (id === 10) {
      // polishing the new car, then a proud lean on "brand new car"
      const proud = t > F(1145);
      stand(out, cam, t, 7, WARNER, "warner", W[0], W[1], proud ? { expr: "proud", pose: "hips", swaps: [F(1145)] } : { expr: "smile", pose: "polish", swing: q((t * 1.6) % 1, 16), facing: -1 });
      fxAt(out, "bow", 400, 260, fxBow, at(CAR[0] - 0.2, CAR[2], 1.88), 0.9, 0.58);
      for (let i = 0; i < 3; i++) { const v = q(((t * 0.8 + i * 0.33) % 1), 20); fxAt(out, `spark${v}`, 200, 200, (p) => fxSpark(p, v), at(CAR[0] - 1.6 + i * 1.5, CAR[2] + 0.95, 1.0 + 0.4 * i), 0.5, 0.5); }
    } else {
      // he jumps clean out of his cap when it lands, then just stands there
      const hit = t >= T_FLAT, n = (t - T_FLAT) * 30;
      const a: Act = !hit ? { expr: "worried", headTilt: -6, look: 0 } : n < 12 ? { expr: "panic", pose: "jump", dy: hop(t, 1240, 1252, 0.5), sy: n < 3 ? 1.12 : 1 } : { expr: "deadpan", swaps: [F(1252)] };
      stand(out, cam, t, 7, hit ? noHat(WARNER) : WARNER, hit ? "warnerNoHat" : "warner", W[0], W[1], a);
      hatFly(out, t, T_FLAT, [W[0], groundY(W[0], W[1]) + 2.1, W[1]], "#6b4a33", "cap", 1.4);
      if (!hit) fxAt(out, "bow", 400, 260, fxBow, at(CAR[0] - 0.2, CAR[2], 1.88), 0.9, 0.58);
      if (hit && t < T_FLAT + 0.4) { const v = (t - T_FLAT) / 0.4; fxAt(out, `bigburst${q(v, 30)}`, 500, 500, (p) => fxBurst(p, q(v, 30), "#fff3b0", 12, 30, 230), at(CAR[0], CAR[2] + 0.6, 1.4), 3.4, 3.4); }
      if (hit) dust(out, t, T_FLAT, [CAR[0], groundY(CAR[0], CAR[2]) + 0.4, CAR[2] + 1.2], 2.4, 5);
    }
    bits(out, T_BLAST + 8, [CAR[0] + 1, CAR[2] + 2], 5, 16, true);
  }
  if (id === 12 && t < F(1350)) {
    // the imagined neat version: the engineer leans in, nods, shrugs when the cross comes down
    const x = t > F(1322);
    stand(out, cam, t, 6, ENGINEER, "eng", 4.6, -7.2, x ? { expr: "innocent", pose: "shrug", swaps: [F(1322)] } : { expr: "proud", pose: "hips", headTilt: 6 * osc(t, 1.2) });
  }
  if (has(id, "blast")) blast(out, tau);
  if (id === 12 && t >= F(1350)) {
    // force arrows: the sand pushes back up, the blast goes up and out (no text)
    const g = k01(t, 1356, 1372), g2 = k01(t, 1372, 1392);
    for (const x of [-3, 3]) if (g > 0) fxAt(out, "arrowS", 200, 400, (p) => fxArrow(p, "#e8b04a"), [x, -0.2 + 1.2 * g, -1.2], 1.0, 2.0 * g + 0.01);
    if (g2 > 0) for (const [x, r] of [[0, 0], [-3.5, 0.5], [3.5, -0.5]]) fxAt(out, "arrowB", 200, 400, (p) => fxArrow(p), [x, 6 + 3 * g2, -1.2], 2.2, 4.4 * g2 + 0.01, { rot: r });
  }
  if (id === 13) {
    // the kid winds up, jumps, stomps; the jet hits the engineer's white shirt; he looks down, then at us
    const sx = PACKET[0], sz = PACKET[2];
    const air = hop(t, 1428, 1447, 0.65), landed = t >= T_STOMP;
    stand(out, cam, t, 50, KID, "kid", sx + 0.05, sz + 0.25, landed ? { expr: t < F(1480) ? "excited" : "worried", mode: "march", phase: 0, lift: 0, sy: t * 30 - 1447 < 3 ? 0.86 : 1, swaps: [F(1480)] }
      : air > 0 ? { expr: "grin", pose: "jump", dy: air, sy: 1.08 } : { expr: "smug", sy: t > F(1420) ? 0.92 : 1 }, 0.8);
    const hitT = T_STOMP + 0.3, hit = t > hitT;
    const eA: Act = !hit ? { expr: "smug", prop: "clipboard", facing: 1 } : t < F(1490) ? { expr: "shock", pose: "flinch", sy: 1.04 } : t < F(1505) ? { expr: "sad", headTilt: 12 } : { expr: "angry", pose: "hips", facing: 0, swaps: [F(1490), F(1505)] };
    stand(out, cam, t, 6, ENGINEER, "eng", sx - 1.3, sz + 0.6, eA);
    const u = (t - T_STOMP) / 0.3;
    if (u >= 0) { const k = q(Math.min(1, u), 20); fxAt(out, `ketchup${k}`, 600, 300, (p) => fxKetchup(p, k), [sx - 0.6, groundY(sx, sz) + 0.3, sz + 0.35], 1.5, 0.75); }
    if (hit) for (let i = 0; i < 6; i++) fxAt(out, "splatdot", 64, 64, (p) => p.ell(32, 32, 24, 20, "#d02a1e", 4), [sx - 1.3 + (hh(i, 3) - 0.5) * 0.4, groundY(sx, sz) + 0.9 + hh(i, 4) * 0.55, sz + 0.45], 0.13, 0.11);
    if (t >= T_STOMP && t < T_STOMP + 5 / FPS) { const v = (t - T_STOMP) / (5 / FPS); fxAt(out, `burst${q(v, 30)}`, 500, 500, (p) => fxBurst(p, q(v, 30)), [sx, groundY(sx, sz) + 0.1, sz + 0.2], 0.9, 0.9); }
  }
  if (id === 14) crowd(out, cam, id, t, tau);
  if (id === 15) {
    // the whale is still there: head-scratching and face-palms; one gull lands, double-takes and leaves for good
    const late = t > F(1700);
    [[-4, -5.5], [4.5, -5.8], [-7.5, -3.5]].forEach(([x, z], i) => stand(out, cam, t, 30 + i, WORKER(i), `w${i}`, x, z,
      i === 0 ? { expr: "deadpan", pose: late ? "palm" : undefined, swaps: [F(1700)] } : i === 1 ? { expr: "deadpan", pose: "shrug" } : { expr: "sad", prop: "shovel" }));
    stand(out, cam, t, 6, ENGINEER, "eng", 1.5, -6.2, t < F(1708) ? { expr: "worried", pose: "palm" } : t < F(1735) ? { expr: "worried", pose: "point", facing: 1 } : { expr: "sad", swaps: [F(1708), F(1735)] });
    const n = t * 30;
    if (n > 1690 && n < 1712) { const u = (n - 1690) / 22; gull(out, t, 5, [lerp(9, 3.2, u), lerp(7, 2.9, u), lerp(1, 0.3, u)], 0.7); }
    else if (n >= 1712 && n < 1726) { gull(out, t, 5, [3.2, 2.95, 0.3], 0.55, true, Math.floor((n - 1712) / 4) % 2 === 1); if (n > 1714 && n < 1722) fxAt(out, "alarm", 200, 120, fxAlarm, [3.3, 3.45, 0.3], 0.3, 0.18); }
    else if (n >= 1726) { const u = (n - 1726) / 18; if (u < 1.5) gull(out, t * 2, 5, [3.2 - 9 * u * u, 3 + 5 * u, 0.3], 0.7, false, true); }
  }
  if (id === 16) {
    // 1979: the crew marches in with shovels; the old engineer hides a case behind his back and whistles
    if (t < F(1860)) [0, 1, 2, 3].forEach((i) => walkSide(out, cam, t, 30 + i, WORKER(i), `w${i}`, -18 + i * 2.6 + (t - F(1760)) * 1.4, -6 - (i % 2) * 1.2, 1, 0, q((t * 1.8 + i * 0.25) % 1, 12), "stern"));
    else {
      [[1.2, -3.2], [4.8, -4.4]].forEach(([x, z], i) => stand(out, cam, t, 30 + i, WORKER(i), `w${i}`, x, z, t > F(1893) ? { expr: "angry", pose: "hips", facing: i ? -1 : 1, swaps: [F(1893)] } : { expr: "stern", prop: "shovel" }));
      stand(out, cam, t, 6, ENG_OLD, "engOld", 3.2, -3.4, t > F(1893) ? { expr: "innocent", prop: "crate", look: 1, swaps: [F(1893)] } : { expr: "neutral", prop: "crate" });
    }
  }
  if (id === 17) {
    const n = t * 30;
    stand(out, cam, t, 7, WARNER_OLD, "warnerOld", PARK[0] + 0.9, PARK[2] + 0.6, n < 2040 ? { mode: "sit", expr: "proud" } : { mode: "sit", expr: "smug", wave: q(Math.sin(t * 5), 20), swaps: [F(2040)] });
    [[PARK[0] - 2.4, PARK[2] - 1.6], [PARK[0] + 3.4, PARK[2] - 2.2]].forEach(([x, z], i) => {
      const dx = Math.cos(t * 0.9 + i * 2);
      walkSide(out, cam, t, 60 + i, i ? KID2 : KID, `kid${i}`, x + Math.sin(t * 0.9 + i * 2) * 1.6, z, dx, 0, q((t * 2.2 + i * 0.5) % 1, 12), "laugh", 0.75);
    });
    stand(out, cam, t, 64, CROWD_O[2], "c2", PARK[0] - 3.6, PARK[2] + 1.6, { expr: "smile", pose: n > 1990 ? "point" : undefined, facing: 1 });
    // a gull comes in to land on the sign
    if (n < 2010) { const u = k01(t, 1960, 2010); gull(out, t, 9, at(PARK[0] - 1.2 + 6 * (1 - u), PARK[2] + 0.9, 2.62 + 4 * (1 - u)), 0.6); }
    else gull(out, t, 9, at(PARK[0] - 1.2, PARK[2] + 0.9, 2.62), 0.55, true);
  }
  void clamp01; void CREST; void CHUNKS; void chunkAt; void carChunkDrop; void T_SQUIRT; void TRUCK; void INK;
  return out;
};
