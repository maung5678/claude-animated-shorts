// Our cast as lit flat sprites in the 3D world. Each frame every character asks for a drawing (a key + a draw call);
// the pool keeps one canvas per distinct drawing, so soldiers marching in step share canvases (7 head shapes x 4
// outfits). Characters are yaw-only billboards shaded by cardShade() (scene tint, bright floor, side gradient toward
// the sun, painted crescent in the drawing); standing ones get a soft multiply contact blob. Effects are unlit cards.
// Cards, effects and blobs live on the NOINK layer so the world ink pass never outlines their quads.
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, fxBurst, fxSplash, fxShadow, fxContact, fxPuff, Outfit, Expr, FrontOpts, SideOpts,
  DRIVER, REPORTER, SHOPKEEPER, KIDW, FITTER, JUDGE1, JUDGE2, SUNBATHER, OFFICE,
  fxDrip, fxSteam, fxSmoke, fxSizzle, fxPanEgg, fxShell, fxThermo, fxBowl, fxPigeon, fxConfetti, fxWobble, fxDrizzle, fxLeaf, fxTrophy,
} from "./toon";
import { FPS, SHOTS, V3, smooth, clamp01, CAR, SHOP, BIKE, EGG, REPORTER_AT, LAB, PARK, PODIUM, VEGAS, State } from "./story";
import { LIGHTS } from "./lights";
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
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
/** sun = world direction TOWARD the sun (optional: when absent the scene's shadow-casting light is used) */
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

const hh = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
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
export const SUN_FROM = SUN;
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
const SWAPS: Record<number, number[]> = {};
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

// ---------------- staging by shot ----------------
export type Stage = { places: Place[]; fx: FxPlace[] };
const FRONT = { side: false, mirror: false };
const W = (t: number, a: number) => t >= a - LEAD; // reaction lands 2 f before the word
const one = (cam: CamInfo, i: number, o: Outfit, okey: string, x: number, y: number, z: number, fo: FrontOpts, t: number, out: Stage, sc = 1, shadow = true) => {
  out.places.push(person(cam, { i, o, okey }, x, y, z, FRONT, { ...fo, blink: lidAt(t, i) }, {}, sc));
  if (shadow) blob(out, x, y, z, sc);
};
const fxq = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, x: number, y: number, z: number, w: number, h: number, extra: Partial<FxPlace> = {}) =>
  out.fx.push({ key, cw, ch, draw, x, y, z, w, h, ...extra });
const loop = (t: number, per: number, off = 0) => q(((t / per + off) % 1 + 1) % 1, 24);

const drips = (out: Stage, t: number, pts: V3[], col = "#1d2026", size = 0.18) => pts.forEach(([x, y, z], i) => {
  const u = q((t * 0.9 + i * 0.41) % 1, 20);
  fxq(out, `drip${col}${u}`, 200, 400, (p) => fxDrip(p, u, col), x, y - size, z, size * 0.5, size);
});

export const stage = (id: number, t: number, st: State, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = s.light === "golden" ? "golden" : "day";
  findSun(cam, SUN);
  const [cx, , cz] = CAR;
  switch (id) {
    case 1:
      if (st.melt > 0.25) drips(out, t, [[cx + 1.0, 0.9, cz + 0.98], [cx - 0.6, 0.62, cz + 0.98], [cx + 2.4, 0.55, cz + 0.6]]);
      break;
    case 3: {
      const tip = smooth((t - 13.1) / 0.5) * 0.45 - 0.05;
      fxq(out, `bowl${q(tip, 30)}`, 500, 400, (p) => fxBowl(p, tip), 95, 100, 45, 24, 19);
      break;
    }
    case 4: {
      one(cam, 1, DRIVER, "drv", cx + 2.2, 0, cz + 1.75, { mode: "stand", expr: W(t, 15.84) ? "smile" : "neutral", prop: "fob", facing: -1 }, t, out);
      if (t >= 15.84 && t < 16.24) { const u = q((t - 15.84) / 0.4, 12); fxq(out, `fob${u}`, 500, 500, (p) => fxBurst(p, u, "#fff3b0", 8, 30, 200), cx, 1.6, cz + 0.4, 0.9, 0.9); }
      break;
    }
    case 5: {
      const u = clamp01((t - 18.1) / 2.2), x = -1.8 + 3.4 * u;
      one(cam, 1, DRIVER, "drv", x, 0, cz + 1.9, { mode: u < 1 ? "stroll" : "stand", phase: q((t * 0.9) % 1, 60), expr: "smile", prop: "coffee" }, t, out);
      drips(out, t, [[cx + 1.08, 0.86 - 0.25 * st.mirror, cz + 1.25]], "#1f232b", 0.12);
      break;
    }
    case 6: {
      const drop = t >= 22.64 - LEAD;
      one(cam, 1, DRIVER, "drv", cx - 2.6, 0, cz + 1.75, { mode: "stand", expr: drop ? "shock" : "nervous", prop: drop ? null : "coffee", armsUp: W(t, 24.56) }, t, out);
      if (drop) {
        const u = clamp01((t - 22.64) / 0.35), y = 1.0 - 0.95 * u * u;
        if (u < 1) fxq(out, "cup", 120, 200, (p) => { p.poly([[25, 30], [95, 30], [85, 190], [35, 190]], "#f4efe4", 6); p.poly([[20, 10], [100, 10], [100, 32], [20, 32]], "#3b2a20", 6); }, cx - 2.3, y, cz + 2.0, 0.12, 0.2, { rot: u * 2 });
        else fxq(out, "coffeePuddle", 300, 150, (p) => { p.ell(150, 75, 140, 60, "#7a4a24", 0); p.ell(120, 60, 50, 16, "#a8723f", 0); }, cx - 2.3, 0.02, cz + 2.0, 0.6, 0.3, { flat: true });
      }
      drips(out, t, [[cx + 2.55, 0.6, cz], [cx + 1.0, 0.9, cz + 0.98], [cx - 1.0, 1.1, cz + 0.98]]);
      if (t > 23.6) { const u = loop(t, 0.5); fxq(out, `wob${u}`, 400, 200, (p) => fxWobble(p, u), cx, 1.7, cz + 1.2, 2.2, 1.1, { soft: true }); }
      break;
    }
    case 7: {
      const stamp = W(t, 26.22) ? Math.abs(Math.sin(t * 9)) * 0.12 : 0;
      one(cam, 3, SHOPKEEPER, "shop", SHOP[0] + 0.7, 0.14 + stamp, SHOP[2] + 1.3, { mode: "stand", expr: W(t, 26.22) ? "shock" : "nervous", armsUp: W(t, 26.64) }, t, out, 1, false);
      blob(out, SHOP[0] + 0.7, 0.14, SHOP[2] + 1.3);
      fxq(out, "doormat", 300, 200, (p) => { p.poly([[20, 30], [280, 30], [280, 170], [20, 170]], "#9a6a3a", 8); p.ell(160, 100, 60, 34, "#3a2414", 0); }, SHOP[0], 0.16, SHOP[2] + 0.75, 1.0, 0.6, { flat: true });
      for (const [dx, k] of [[-0.2, 0], [0.25, 0.5]] as const) { const u = loop(t, 1.6, k); fxq(out, `smoke${u}`, 300, 500, (p) => fxSmoke(p, u), SHOP[0] + dx, 0.6, SHOP[2] + 0.8, 0.5, 0.85, { soft: true }); }
      for (let i = 0; i < 3; i++) one(cam, 20 + i, OFFICE(i), `off${i}`, -30 + i * 2.2, 0.14, 5.6 + (i % 2) * 0.6, { mode: "stand", expr: "neutral" }, t, out);
      break;
    }
    case 8: {
      const cut = t >= 31.05;
      if (!cut) one(cam, 2, REPORTER, "rep", REPORTER_AT[0], 0.14, REPORTER_AT[2], { mode: "stand", expr: "grin", prop: "pan" }, t, out);
      else {
        const cracked = t >= 31.3, k = cracked ? clamp01((t - 31.3) / 1.5) : -1;
        fxq(out, `pan${q(k, 12)}`, 600, 260, (p) => fxPanEgg(p, k), EGG[0], EGG[1] + 0.13, EGG[2], 0.62, 0.27);
        if (t >= 31.1 && t < 31.6) { const u = q((t - 31.1) / 0.5, 15); fxq(out, `shell${u}`, 300, 300, (p) => fxShell(p, u), EGG[0] + 0.03, EGG[1] + 0.32, EGG[2], 0.3, 0.3); }
        if (t >= 32.7) { const u = loop(t, 0.6); fxq(out, `siz${u}`, 400, 300, (p) => fxSizzle(p, u), EGG[0] + 0.03, EGG[1] + 0.25, EGG[2] + 0.02, 0.4, 0.3);
          const v = loop(t, 1.2); fxq(out, `steam${v}`, 300, 400, (p) => fxSteam(p, v), EGG[0] + 0.03, EGG[1] + 0.42, EGG[2], 0.3, 0.4, { soft: true }); }
      }
      break;
    }
    case 9: {
      const fan = q(0.5 + 0.5 * Math.sin(t * 14), 6);
      one(cam, 2, REPORTER, "rep", REPORTER_AT[0], 0.14, REPORTER_AT[2], { mode: "stand", expr: W(t, 34.9) ? "shock" : "pained", armL: "fan", fanK: fan }, t, out);
      fxq(out, "panDone", 600, 260, (p) => fxPanEgg(p, 1), EGG[0], EGG[1] + 0.13, EGG[2], 0.62, 0.27);
      const k = 0.3 + 0.7 * smooth((t - 33.6) / 1.3), pop = t >= 34.9 ? q(clamp01((t - 34.9) / 0.5), 15) : 0;
      fxq(out, `thermo${q(k, 30)}_${pop}`, 240, 900, (p) => fxThermo(p, k, pop), REPORTER_AT[0] + 0.75, 1.0, REPORTER_AT[2] + 0.45, 0.42, 1.58);
      const u = loop(t, 0.7); fxq(out, `wob${u}`, 400, 200, (p) => fxWobble(p, u), REPORTER_AT[0] + 0.2, 0.3, REPORTER_AT[2] + 1.2, 2.4, 0.9, { soft: true });
      break;
    }
    case 10: case 11: {
      const cols = ["#c03030", "#2a2a2a", "#2f5f9a", "#2f6a43", "#d8a030", "#7b5ac9", "#2a2a2a"];
      const sun = id === 11 && W(t, 39.86);
      for (let i = 0; i < 7; i++) {
        const x = 6 + i * 1.5 + (hh(i) - 0.5) * 0.4, z = 5.2 + (i % 2) * 1.0;
        one(cam, 30 + i, OFFICE(i), `off${i}`, x, 0.14, z, { mode: "stand", expr: sun ? (i % 2 ? "shock" : "pained") : "neutral", prop: "umbrella", umbrellaCol: cols[i], facing: i < 3 ? 1 : -1 }, t, out);
      }
      if (id === 10) { const u = loop(t, 0.8); fxq(out, `drz${u}`, 400, 600, (p) => fxDrizzle(p, u), 4, 2.6, 2.6, 3.4, 5.1, { soft: true }); }
      break;
    }
    case 13: {
      const fly = t >= 46.3 - LEAD, u = clamp01((t - 46.3) / 0.8);
      const [x, y] = [LAB[0] - 3.2 + (fly ? 0.6 * u : 0), fly ? 0.2 + 2.4 * u * u : 0.2];
      fxq(out, `pigeon${fly ? q(loop(t, 0.18), 4) + 0.1 : 0}`, 300, 300, (p) => fxPigeon(p, fly ? 0.3 + 0.7 * loop(t, 0.18) : 0), x, y, LAB[2] + 0.6, 0.42, 0.42);
      if (fly && u < 1) { const v = q(u, 15); fxq(out, `puff${v}`, 300, 300, (p) => fxPuff(p, v), LAB[0] - 3.2, 0.15, LAB[2] + 0.6, 0.6, 0.6, { soft: true }); }
      break;
    }
    case 14: case 15: {
      one(cam, 4, KIDW, "kid", PARK[0], 0.05, PARK[2], { mode: "stand", expr: W(t, 47.62) ? "grin" : "smile", prop: "magnifier", headTilt: 6 }, t, out);
      const burn = clamp01((t - 47.4) / 1.0);
      fxq(out, `leaf${q(burn, 10)}`, 300, 200, (p) => fxLeaf(p, burn), PARK[0] + 0.42, 0.07, PARK[2] + 0.3, 0.26, 0.17, { flat: true, rot: 0.4 });
      if (burn > 0.1) { const u = loop(t, 1.3); fxq(out, `smoke${u}`, 300, 500, (p) => fxSmoke(p, u), PARK[0] + 0.44, 0.22, PARK[2] + 0.3, 0.16, 0.28, { soft: true }); }
      break;
    }
    case 16: {
      one(cam, 1, DRIVER, "drv", cx + 2.4, 0, cz + 1.8, { mode: "stand", expr: "grin", prop: "envelope", armL: "up" }, t, out);
      for (const [i, dx] of [[40, -1.2], [41, 1.3]] as const) {
        const hit = (t * 2.1 + i) % 1 < 0.5;
        one(cam, i, FITTER, `fit`, CRADLE_AT[0] + dx, CRADLE_AT[1], CRADLE_AT[2], { mode: "stand", expr: "grin", prop: "wrench", headTilt: hit ? 4 : -4 }, t, out, 1, false);
      }
      break;
    }
    case 17: {
      one(cam, 50, JUDGE1, "j1", PODIUM[0] - 1.9, 0.14, PODIUM[2] + 0.5, { mode: "stand", expr: "stern", prop: "clipboard", armL: "thumb" }, t, out);
      one(cam, 51, JUDGE2, "j2", PODIUM[0] + 1.9, 0.14, PODIUM[2] + 0.5, { mode: "stand", expr: W(t, 61.16) ? "stern" : "neutral", armL: "thumb", facing: -1 }, t, out);
      fxq(out, "trophy", 300, 400, fxTrophy, PODIUM[0], 1.08 + 0.36, PODIUM[2], 0.54, 0.72);
      fxq(out, "pigeonSit", 300, 300, (p) => fxPigeon(p, 0), PODIUM[0] + 0.05, 1.08 + 0.78, PODIUM[2] + 0.02, 0.3, 0.3);
      const u = loop(t, 2.2); fxq(out, `conf${u}`, 500, 500, (p) => fxConfetti(p, u), PODIUM[0], 2.6, PODIUM[2] + 0.8, 3.0, 3.0);
      break;
    }
    case 18: {
      const [vx, , vz] = VEGAS, jump = clamp01((t - 67.0) / 0.5);
      const sx = vx - 7.6, sz = vz + 42.4;
      if (jump < 1) {
        const y = 0.42 + 1.4 * Math.sin(Math.PI * jump), z = sz + 6.0 * jump;
        one(cam, 60, SUNBATHER, "sun", sx, y, z, t < 66.0 ? { mode: "sit", expr: "smile_closed" } : { mode: jump > 0 ? "fall" : "stand", expr: "shock", armsUp: true }, t, out, 1, jump === 0);
        if (t >= 66.0) { const u = loop(t, 0.9); fxq(out, `hair${u}`, 300, 500, (p) => fxSmoke(p, u), sx, y + (t < 66 ? 1.4 : 2.05), z, 0.5, 0.85, { soft: true }); }
      }
      if (t >= 67.25) { const u = q(clamp01((t - 67.25) / 1.1), 30); fxq(out, `splash${u}`, 800, 800, (p) => fxSplash(p, u), sx, 1.2, sz + 7.2, 3.4, 3.4); }
      break;
    }
  }
  return out;
};
export const CRADLE_AT: V3 = [0, 50, 0];
export { FPS };
