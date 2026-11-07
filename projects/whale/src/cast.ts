// "Raining Whale" cast: our own flat cartoon people, gulls and effects in the 3D beach (same card machinery as the
// bridge short: canvas pool, lit yaw-only billboards, contact blobs, unlit effect cards on the NOINK layer).
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, KID, fxBurst, fxShadow, fxContact, fxGull, fxPuffC, fxStink, fxSpark, fxBow, fxKetchup, fxBit, fxStars,
  Outfit, Expr, FrontOpts, SideOpts, SKINS, INK,
} from "./toon";
import {
  FPS, V3, smooth, clamp01, hh, groundY, at, SHOTS, has, CRATES, PLUNGER, TRUCK, CAR, CAMSTAND, PARK, PACKET, T_PUSH, T_BLAST, T_FLAT,
  T_STOMP, T_SQUIRT, CREST, CHUNKS, chunkAt, carChunkDrop,
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
  scale?: number; mirror?: boolean; yaw?: number; geo?: "body" | "swing"; roll?: number; size?: [number, number, number];
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
const WORKER = (v: number): O => ({ jacket: ["#e8892c", "#dc7a2a", "#ef9d3c"][v % 3], pants: "#3b4a6b", boots: "#5a3b2a", hat: "hardhat", cap: "#f2c230", skin: SKINS[v % 4], buttons: "#f1efe6" });
const ENGINEER: O = { jacket: "#f1efe6", pants: "#5a5f6e", boots: "#3a2a20", hat: "hardhat", cap: "#f7f5ee", moustache: "#4a3020", build: "stout", buttons: "#c9ccd2", skin: SKINS[1] };
const WARNER: O = { jacket: "#6b7342", pants: "#4a4038", boots: "#3a2a20", hat: "cap", cap: "#6b4a33", moustache: "#5a4030", skin: SKINS[2], buttons: "#c8b27a" };
const REPORTER: O = { jacket: "#8c3b4a", pants: "#3b3f52", boots: "#2a2020", hat: "hair", hair: "#3a2a20", skin: SKINS[0] };
const CAMERAMAN: O = { jacket: "#3f6fb5", pants: "#4a4038", boots: "#3a2a20", hat: "cap", cap: "#2f5f6a", skin: SKINS[3] };
const COATS = ["#d9a441", "#b5653f", "#2f6a6a", "#7a5a3a", "#7a8a3a", "#3f6fb5", "#8c3b4a", "#c25a7a"];
const HAIR = ["#3a2a20", "#7a4a2a", "#d9b46a", "#2a2020", "#a8643a"];
const CROWD = (v: number): O => {
  const o: O = { jacket: COATS[v % 8], pants: ["#3b3f52", "#5a4a3a", "#2f4a6a"][v % 3], boots: "#4a3426", skin: SKINS[v % 4], hat: v % 5 === 3 ? "cap" : "hair", cap: "#3b5b9a", hair: HAIR[v % 5] };
  if (v % 3 === 1) o.dress = ["#d9a441", "#c25a7a", "#5a8fc2", "#e8892c"][v % 4];
  if (v % 7 === 2) o.moustache = "#3a2a20";
  return o;
};
const CROWD_O = Array.from({ length: 8 }, (_, v) => CROWD(v));

/** a standing / walking person at ground level (x, z); front view unless `side` */
const who = (i: number, o: O, okey: string) => ({ i, o, okey });
const stand = (out: Stage, cam: CamInfo, t: number, i: number, o: O, okey: string, x: number, z: number, fo: FrontOpts, sc = 1, dy = 0) => {
  const y = groundY(x, z);
  out.places.push(person(cam, who(i, o, okey), x, y + dy, z, { side: false, mirror: false }, { mode: "stand", blink: lidAt(t, i), ...fo }, {}, sc));
  if (dy < 0.05) blob(out, x, y, z, sc);
};
const walkSide = (out: Stage, cam: CamInfo, t: number, i: number, o: O, okey: string, x: number, z: number, dx: number, dz: number, phase: number, expr: Expr, sc = 1) => {
  const y = groundY(x, z), view = viewOf(cam, x, z, dx, dz);
  const fo: FrontOpts = { mode: "stroll", phase, expr, blink: lidAt(t, i) };
  const so: SideOpts = { mode: "march", phase, expr, stomp: 0.6, stride: view.fs, blink: lidAt(t, i) };
  out.places.push(person(cam, who(i, o, okey), x, y, z, view, fo, so, sc));
  blob(out, x, y, z, sc);
};
const fxAt = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, p: V3, w: number, h: number, extra: Partial<FxPlace> = {}) =>
  out.fx.push({ key, cw, ch, draw, x: p[0], y: p[1], z: p[2], w, h, ...extra });
const faded = (alpha: number, draw: (p: Pen) => void) => (p: Pen) => { p.g.globalAlpha = alpha; draw(p); p.g.globalAlpha = 1; };

// gulls: circling flyers and perched ones
const gull = (out: Stage, t: number, i: number, p: V3, size = 0.9, perched = false) => {
  const flap = perched ? 0 : q(0.5 + 0.5 * Math.sin(t * 9 + i * 1.7), 6);
  fxAt(out, perched ? "gullP" : `gull${flap}`, 400, 240, (pp) => fxGull(pp, flap, perched), p, size, size * 0.6, { rot: perched ? 0 : 0.15 * Math.sin(t * 2 + i) });
};
const circling = (out: Stage, t: number, n: number, c: V3, r: number) => {
  for (let i = 0; i < n; i++) {
    const a = t * (0.5 + 0.1 * (i % 3)) + (i / n) * Math.PI * 2;
    gull(out, t, i, [c[0] + Math.cos(a) * r * (0.7 + 0.3 * hh(i)), c[1] + 1.5 * hh(i, 2) + 0.4 * Math.sin(t * 1.3 + i), c[2] + Math.sin(a) * r * 0.6]);
  }
};

// the crowd on the crest (rope line at z -55.5)
const CROWD_SPOTS: [number, number][] = Array.from({ length: 34 }, (_, i) => {
  const row = i % 3, k = Math.floor(i / 3);
  return [-17 + k * 3.0 + row * 1.0 + (hh(i) - 0.5) * 0.9, -57.2 - row * 1.5 - hh(i, 2) * 0.6];
});
const WARN_AT: [number, number] = [-4, -58.4];
const crowd = (out: Stage, cam: CamInfo, id: number, t: number, tau: number, force?: Expr) => {
  CROWD_SPOTS.forEach(([x0, z0], i) => {
    if (Math.hypot(x0 - WARN_AT[0], z0 - WARN_AT[1]) < 1.2 || Math.hypot(x0 - CAMSTAND[0], z0 - CAMSTAND[2]) < 1.6) return;
    const o = CROWD_O[i % 8], okey = `c${i % 8}`, ii = i + 100;
    const ub = tau - T_BLAST;
    let expr: Expr = (["smile", "neutral", "grin", "smile_closed"] as Expr[])[i % 4];
    if (id === 7) expr = t > 820 / FPS ? "nervous" : (["grin", "smile", "laugh", "smile_closed"] as Expr[])[i % 4];
    if (ub > 0) expr = ub < 1.2 ? "shock" : i % 3 === 0 ? "pained" : "shock";
    // when the chunks come down (~4 s after the blast) every third one runs for it
    if (ub > 3.4 && i % 3 === 0 && id !== 14) {
      const run = ub - 3.4, dx = (i % 2 ? 1 : -1);
      walkSide(out, cam, t, ii, o, okey, x0 + dx * 2.6 * run, z0 - 0.6 * run, dx, -0.2, q((run * 2.4) % 1, 12), "shock");
      return;
    }
    if (force) expr = force;
    const look = ub > 0 && ub < 3.4 ? 0 : Math.round(Math.sin(i * 1.7));
    stand(out, cam, t, ii, o, okey, x0, z0, { expr, look: Math.max(-1, Math.min(1, look)), headTilt: ub > 0 && ub < 4 ? -6 : 0 });
  });
};
const warner = (out: Stage, cam: CamInfo, t: number, id: number) => {
  let expr: Expr = "neutral", wave: number | undefined;
  if (id === 5) { expr = t < 560 / FPS ? "neutral" : t < 600 / FPS ? "stern" : "nervous"; if (t > 600 / FPS && t < 640 / FPS) wave = q(Math.sin(t * 10), 20); }
  stand(out, cam, t, 7, WARNER, "warner", WARN_AT[0], WARN_AT[1], { expr, wave, facing: 1 });
};
const press = (out: Stage, cam: CamInfo, t: number, tau: number) => {
  const shock = tau > T_BLAST;
  stand(out, cam, t, 8, CAMERAMAN, "camman", CAMSTAND[0] - 0.2, CAMSTAND[2] - 0.9, { expr: shock ? "shock" : "neutral", prop: "tvcam" });
  stand(out, cam, t, 9, REPORTER, "reporter", CAMSTAND[0] - 1.6, CAMSTAND[2] - 0.3, { expr: shock ? "shock" : "smile", prop: "mic", facing: -1 });
};

// workers + engineer at the whale
const crew = (out: Stage, cam: CamInfo, t: number, id: number) => {
  const spots: [number, number, Expr, FrontOpts["prop"]][] = [
    [CRATES[0] + 2.2, CRATES[2] - 0.9, "grin", "crate"], [CRATES[0] - 2.4, CRATES[2] - 1.1, "smile", "crate"], [CRATES[0] + 0.3, CRATES[2] - 2.2, "neutral", "crate"],
  ];
  spots.forEach(([x, z, expr, prop], i) => {
    const bob = 0.02 * Math.sin(t * 5 + i);
    stand(out, cam, t, 20 + i, WORKER(i), `w${i}`, x, z, { expr, prop, look: i === 2 ? 1 : 0 }, 1, Math.max(0, bob));
  });
  if (id === 6) stand(out, cam, t, 6, ENGINEER, "eng", CRATES[0] + 4.2, CRATES[2] - 1.6, { expr: "grin", prop: "clipboard" });
};
const truckCrew = (out: Stage, cam: CamInfo, t: number) => {
  [[TRUCK[0] - 2.6, TRUCK[2] - 2.2], [TRUCK[0] - 4.0, TRUCK[2] - 1.0], [TRUCK[0] - 1.2, TRUCK[2] - 3.4]].forEach(([x, z], i) =>
    stand(out, cam, t, 30 + i, WORKER(i + 1), `w${i + 1}`, x, z, { expr: (["grin", "smile", "neutral"] as Expr[])[i], prop: i === 1 ? "shovel" : null }));
  stand(out, cam, t, 6, ENGINEER, "eng", TRUCK[0] - 5.4, TRUCK[2] - 3.0, { expr: "smile", prop: "clipboard" });
};
const engineerPlan = (out: Stage, cam: CamInfo, t: number) => {
  const wave = t > 438 / FPS && t < 470 / FPS ? q(Math.sin(t * 7), 20) : undefined;
  stand(out, cam, t, 6, ENGINEER, "eng", 6.2, -6.6, { expr: t > 452 / FPS ? "grin" : "smile", prop: wave === undefined ? "clipboard" : null, wave, facing: -1 });
};

// the blast: flash burst, sand + smoke plume (by story time, so the replays show it too)
const SAND = ["#f1d9a6", "#c7a874"], SMOKE = ["#d9d5cf", "#9d968e"];
const blast = (out: Stage, tau: number) => {
  const u = tau - T_BLAST;
  if (u < 0) return;
  if (u < 0.5) fxAt(out, `bigburst${q(u / 0.5, 30)}`, 500, 500, (p) => fxBurst(p, q(u / 0.5, 30), "#fff3b0", 14, 30, 240), [0, 3, -0.8], 22, 22);
  for (let i = 0; i < 16; i++) {
    const t0 = i * 0.035, k = u - t0;
    if (k < 0 || k > 7) continue;
    const rise = 26 * (1 - Math.exp(-k * 0.9)) * (0.5 + 0.7 * hh(i, 1)), spread = (hh(i, 2) - 0.5) * 12 * (1 - Math.exp(-k));
    const size = 4 + 11 * (1 - Math.exp(-k * 1.3)) * (0.6 + 0.6 * hh(i, 3));
    const fade = q(Math.min(1, Math.max(0, (7 - k) / 3)) * 0.95, 8);
    if (fade <= 0) continue;
    const col = i % 3 === 0 ? SMOKE : SAND, seed = i % 5;
    fxAt(out, `puff${seed}${col[0]}${fade}`, 512, 512, faded(fade, (p) => fxPuffC(p, seed, col[0], col[1])),
      [spread, 1.5 + rise, -0.5 + (hh(i, 4) - 0.5) * 4 - 1.5 * k * 0.2], size, size, { soft: true, rot: (hh(i, 5) - 0.5) * 0.8 });
  }
};
/** small bits raining near a camera position (shot 8+) and lying on the ground afterwards */
const bits = (out: Stage, cam: CamInfo, tau: number, c: [number, number], r: number, n: number, landedOnly = false) => {
  const u = tau - T_BLAST;
  if (u < 3.0) return;
  for (let i = 0; i < n; i++) {
    const land = 3.6 + 2.6 * hh(i, 11), x = c[0] + (hh(i, 12) - 0.5) * 2 * r, z = c[1] + (hh(i, 13) - 0.5) * 2 * r, gy = groundY(x, z);
    const k = land - u, y = k > 0 ? gy + 0.5 * 9.8 * k * k : gy + 0.07;
    if (landedOnly && k > 0) continue;
    if (y > gy + 30) continue;
    const s = 0.16 + 0.22 * hh(i, 14), seed = i % 4;
    fxAt(out, `bit${seed}`, 128, 96, (p) => fxBit(p, seed), [x, y, z], s, s * 0.75, { rot: k > 0 ? u * 3 + i : hh(i, 15) });
  }
};

// ketchup packet gag (shot 13): the kid stomps, the jet shoots out one side onto the engineer's white shirt
const ketchup = (out: Stage, cam: CamInfo, t: number) => {
  const sx = PACKET[0], sz = PACKET[2];
  const down = t >= T_STOMP - 1 / FPS;
  const phase = down ? 0 : q(0.25 * smooth((t - (T_STOMP - 0.8)) / 0.5), 20);
  stand(out, cam, t, 50, KID, "kid", sx + 0.05, sz + 0.25, { mode: "march", phase, lift: 80, expr: t < T_STOMP ? "grin" : t < T_SQUIRT ? "shock" : "nervous" } as FrontOpts, 0.8);
  const hit = t > T_STOMP + 0.3;
  stand(out, cam, t, 6, ENGINEER, "eng", sx - 1.3, sz + 0.6, { expr: hit ? "shock" : "smile", prop: "clipboard", facing: 1 });
  const u = (t - T_STOMP) / 0.35;
  if (u >= 0) {
    const k = q(Math.min(1, u), 20);
    fxAt(out, `ketchup${k}`, 600, 300, (p) => fxKetchup(p, k), [sx - 0.6, groundY(sx, sz) + 0.3, sz + 0.35], 1.5, 0.75, { rot: 0 });
  }
  if (hit) for (let i = 0; i < 5; i++)
    fxAt(out, "splatdot", 64, 64, (p) => p.ell(32, 32, 24, 20, "#d02a1e", 4), [sx - 1.3 + (hh(i, 3) - 0.5) * 0.4, groundY(sx, sz) + 0.9 + hh(i, 4) * 0.55, sz + 0.45], 0.12, 0.1);
  if (t >= T_STOMP && t < T_STOMP + 5 / FPS) {
    const v = (t - T_STOMP) / (5 / FPS);
    fxAt(out, `burst${q(v, 30)}`, 500, 500, (p) => fxBurst(p, q(v, 30)), [sx, groundY(sx, sz) + 0.1, sz + 0.2], 0.9, 0.9);
  }
};

/** everything with a face in shot `id` at time t (tau = story time) */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1], tau = s.tau(t);
  LNAME = s.light;
  findSun(cam, SUN);
  if (has(id, "hook") || id === 6) crew(out, cam, t, id);
  if (has(id, "stink") && t > 250 / FPS) fxAt(out, `stink${q((t * 0.7) % 1, 20)}`, 400, 420, (p) => fxStink(p, q((t * 0.7) % 1, 20)), [5.5, 3.4, 0.3], 2.2, 2.3);
  if (has(id, "sign")) gull(out, t, 3, [-9.5, groundY(-9.5, -7.5) + 2.75, -7.5], 0.55, true);
  if (has(id, "truck") && id === 3) truckCrew(out, cam, t);
  if (has(id, "engineer")) engineerPlan(out, cam, t);
  if (has(id, "gulls")) { circling(out, t, 7, [0.5, 6.5, 0], 6); gull(out, t, 1, [1.5, 2.85, 0.2], 0.6, true); gull(out, t, 2, [-2.5, 2.6, 0.4], 0.6, true); }
  if (has(id, "warner")) warner(out, cam, t, id);
  if (has(id, "crowd") || has(id, "rain")) { if (id !== 10 && id !== 11 && id !== 9) crowd(out, cam, id, t, tau); }
  if (id === 7 || id === 8 || id === 14) press(out, cam, t, tau);
  if (id === 7 || id === 8) warner(out, cam, t, id);
  if (has(id, "plunger")) {
    const k = q(smooth((t - (T_PUSH - 0.05)) / (T_BLAST - T_PUSH)), 20);
    stand(out, cam, t, 6, ENGINEER, "eng", PLUNGER[0], PLUNGER[2] + 0.75, { expr: k > 0.5 ? "grin" : "stern", prop: ["plunger", k] });
  }
  if (has(id, "blast")) blast(out, tau);
  if (id === 8) bits(out, cam, tau, [cam.pos.x, cam.pos.z - 4], 7, 40);
  if (id === 9) {
    crowd(out, cam, 9, t, T_BLAST - 1, "dazed");
    bits(out, cam, tau, [cam.pos.x, cam.pos.z - 4], 7, 40, true);
    for (let i = 0; i < 14; i++) { const [x, z] = CROWD_SPOTS[i]; fxAt(out, `bit${i % 4}`, 128, 96, (p) => fxBit(p, i % 4), at(x + 0.05, z, 2.12), 0.3, 0.22); }
    const u = q((t * 0.9) % 1, 30); fxAt(out, `stars${u}`, 420, 210, (p) => fxStars(p, u), at(-0.8, -58.6, 2.35), 0.8, 0.4);
  }
  if (id === 10 || id === 11) {
    const flat = id === 11 && t >= T_FLAT;
    stand(out, cam, t, 7, WARNER, "warner", CAR[0] + 1.9, CAR[2] + 2.7, { expr: flat ? "shock" : id === 11 ? "nervous" : t > 1130 / FPS ? "grin" : "smile", facing: -1,
      wave: id === 10 && t > 1135 / FPS && t < 1175 / FPS ? q(Math.sin(t * 6), 20) : undefined });
    if (!flat) {
      fxAt(out, "bow", 400, 260, fxBow, at(CAR[0] - 0.2, CAR[2], 1.88), 0.9, 0.58);
      if (id === 10) for (let i = 0; i < 3; i++) { const v = q(((t * 0.8 + i * 0.33) % 1), 20); fxAt(out, `spark${v}`, 200, 200, (p) => fxSpark(p, v), at(CAR[0] - 1.6 + i * 1.5, CAR[2] + 0.95, 1.0 + 0.4 * i), 0.5, 0.5); }
    }
    if (id === 11 && t >= T_FLAT && t < T_FLAT + 0.4) {
      const v = (t - T_FLAT) / 0.4;
      fxAt(out, `bigburst${q(v, 30)}`, 500, 500, (p) => fxBurst(p, q(v, 30), "#fff3b0", 12, 30, 230), at(CAR[0], CAR[2] + 0.6, 1.4), 3.2, 3.2);
    }
    bits(out, cam, T_BLAST + 8, [CAR[0] + 1, CAR[2] + 2], 5, 16, true);
  }
  if (has(id, "ketchup")) ketchup(out, cam, t);
  if (has(id, "after")) {
    [[-4, -5.5], [4.5, -5.8], [-7.5, -3.5]].forEach(([x, z], i) => stand(out, cam, t, 30 + i, WORKER(i), `w${i}`, x, z, { expr: (["dazed", "nervous", "neutral"] as Expr[])[i], prop: "shovel" }));
    stand(out, cam, t, 6, ENGINEER, "eng", 1.5, -6.2, { expr: "nervous", prop: "clipboard" });
    // one gull comes in, sees it, and leaves for good
    const u = (t - 1690 / FPS) / 2.4;
    if (u > 0 && u < 1) { const a = u * Math.PI; gull(out, t, 5, [6 - 12 * u, 3 + 4 * Math.sin(a) + 3 * u, -1 + 2 * u], 0.9); }
  }
  if (has(id, "whales")) {
    [[1.2, -3.2], [4.8, -4.4], [-1.6, -5.0]].forEach(([x, z], i) => stand(out, cam, t, 30 + i, WORKER(i), `w${i}`, x, z, { expr: (["stern", "neutral", "stern"] as Expr[])[i], prop: "shovel" }));
    stand(out, cam, t, 6, ENGINEER, "eng", 3.2, -3.4, { expr: t > 1888 / FPS ? "whistle" : "neutral", prop: "shovel", look: t > 1888 / FPS ? 1 : 0 });
  }
  if (has(id, "park")) {
    stand(out, cam, t, 7, { ...WARNER, moustache: "#d8d4cc" }, "warnerOld", PARK[0] + 0.9, PARK[2] + 0.6, { mode: "sit", expr: t > 2030 / FPS ? "laugh" : "smile" }, 1, 0.0);
    [[PARK[0] - 2.4, PARK[2] - 1.6], [PARK[0] + 3.4, PARK[2] - 2.2]].forEach(([x, z], i) => {
      const ph = q((t * 1.6 + i * 0.5) % 1, 12);
      walkSide(out, cam, t, 60 + i, { ...KID, jacket: i ? "#3f6fb5" : "#f08a2c", cap: i ? "#f2c230" : "#e2453c" }, `kid${i}`, x + Math.sin(t * 0.9 + i) * 1.2, z, Math.cos(t * 0.9 + i), 0, ph, "laugh", 0.75);
    });
    stand(out, cam, t, 64, CROWD_O[2], "c2", PARK[0] - 3.6, PARK[2] + 1.6, { expr: "smile" });
    gull(out, t, 9, at(PARK[0] - 1.2, PARK[2] + 0.9, 2.62), 0.55, true);
  }
  return out;
};
