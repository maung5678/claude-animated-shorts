// "Raining Whale" cast: our own flat cartoon people, gulls and effects in the 3D beach (same card machinery as the
// bridge short: canvas pool, lit yaw-only billboards, contact blobs, unlit effect cards on the NOINK layer).
import * as THREE from "three";
import {
  Pen, bodyFront, bodySide, KID, fxBurst, fxShadow, fxContact, fxStars, fxPuffC, fxSpark, fxGull,
  fxHat, fxDog, fxSled, fxTrophy, fxFlake, fxMitten, fxThermo, fxDial, fxCup, fxConf, Outfit, Expr, FrontOpts, SideOpts, SKINS, INK, Pose,
} from "./toon";
import {
  FPS, V3, smooth, clamp01, hh, groundY, at, SHOTS, OLY, olyCentres, FACE_Y, TOWER, TABLE, RIBBON_Z, BEACH, DIAG, AUSTRIA,
  T_SLIP, T_SCALE, T_WINK, T_COLLAPSE, T_NOSE, T_WINK2,
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
const MAYOR: O = { jacket: "#d6343b", pants: "#2b2b33", boots: "#2a2020", hat: "hair", hair: "#5a3b2a", skin: SKINS[1], buttons: "#ffcc29", dress: "#d6343b" };
const OPER: O = { jacket: "#3a6a3a", pants: "#2f4470", boots: "#5a3b2a", hat: "beanie", cap: "#ffcc29", skin: SKINS[2], moustache: "#5a4030", buttons: "#f6f0d8" };
const VOL = (k: number): O => ({ jacket: ["#ff7a26", "#2f6fd0", "#7c3fb0", "#2f8a4f", "#e2a92e", "#d6343b"][k % 6], pants: ["#2f4470", "#3b3f52", "#5a4a3a"][k % 3], boots: "#3a2a20",
  hat: "beanie", cap: ["#ffcc29", "#e0303a", "#2f6fd0", "#ffffff", "#ff7a26"][k % 5], skin: SKINS[k % 4], moustache: k % 5 === 2 ? "#4a3020" : undefined });
const VOLS = Array.from({ length: 6 }, (_, k) => VOL(k));
const KIDW: O = { ...KID, jacket: "#ff4f9a", pants: "#2f4470", hat: "beanie", cap: "#ffcc29" };
const KID_SWIM: O = { ...KID, jacket: "#ff4f9a", pants: "#ffcc29", boots: KID.boots, hat: "hair", hair: "#5a3b2a" };
const KID_PUFF: O = { ...KIDW, jacket: "#7fd8ff", build: "kid" };
const SEN: O = { jacket: "#3f6fb5", pants: "#3f6fb5", boots: "#2a2020", hat: "hair", hair: "#d9b46a", skin: SKINS[0], buttons: "#ffffff", dress: "#3f6fb5" };
const AUS: O = { jacket: "#2f6f45", pants: "#6b4a33", boots: "#3a2a20", hat: "cap", cap: "#2f6f45", skin: SKINS[0], moustache: "#a8643a" };
const JUDGE: O = { jacket: "#2b2b33", pants: "#2b2b33", boots: "#1a1a1a", hat: "hair", hair: "#8a8a8a", skin: SKINS[2], buttons: "#c9ccd2" };
const PAINTER: O = { jacket: "#f6f4ee", pants: "#2f4470", boots: "#3a2a20", hat: "beanie", cap: "#e0303a", skin: SKINS[3] };
const SKIER: O = { jacket: "#ffcc29", pants: "#2f6fd0", boots: "#2b2b33", hat: "beanie", cap: "#2f6fd0", skin: SKINS[0] };
const SUM = (k: number): O => ({ jacket: ["#ffcc29", "#5fd0b4", "#ff7a26"][k % 3], pants: "#3f6fb5", boots: "#f4f1ea", hat: "hair", hair: ["#3a2a20", "#d9b46a", "#a8643a"][k % 3], skin: SKINS[k % 4] });

const who = (i: number, o: O, okey: string) => ({ i, o, okey });
type Act = FrontOpts & { dy?: number; sy?: number; swaps?: number[]; noBlob?: boolean };
const stand = (out: Stage, cam: CamInfo, t: number, i: number, o: O, okey: string, x: number, z: number, a: Act, sc = 1, baseY?: number) => {
  const y = baseY ?? groundY(x, z), dy = a.dy ?? 0;
  const pl = person(cam, who(i, o, okey), x, y + dy, z, { side: false, mirror: false }, { mode: "stand", blink: lidAt(t, i, a.swaps), ...a }, {}, sc);
  if (a.sy) pl.sy = a.sy;
  out.places.push(pl);
  if (!a.noBlob) blob(out, x, y, z, sc, dy > 0.05 ? Math.max(0.35, 1 - dy) : 1);
};
const fxAt = (out: Stage, key: string, cw: number, ch: number, draw: (p: Pen) => void, p: V3, w: number, h: number, extra: Partial<FxPlace> = {}) =>
  out.fx.push({ key, cw, ch, draw, x: p[0], y: p[1], z: p[2], w, h, ...extra });
const F = (f: number) => f / FPS;
const k01 = (t: number, a: number, b: number) => smooth((t - F(a)) / (F(b) - F(a)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const osc = (t: number, hz: number, i = 0) => Math.sin(t * hz * Math.PI * 2 + i);
const hop = (t: number, a: number, b: number, h: number) => { const u = (t - F(a)) / (F(b) - F(a)); return u > 0 && u < 1 ? 4 * h * u * (1 - u) : 0; };
const dog = (out: Stage, t: number, p: V3, tilt: number, s = 0.9) => fxAt(out, `dog${q(tilt, 10)}`, 300, 240, (pp) => fxDog(pp, q(tilt, 10)), [p[0], p[1] + s * 0.4, p[2]], s, s * 0.8);
const confetti = (out: Stage, t: number, c: V3, n: number, r: number) => {
  for (let i = 0; i < n; i++) {
    const y = c[1] + r - (((t * (0.8 + hh(i, 2)) + hh(i, 3) * 3) % 3) / 3) * r, x = c[0] + (hh(i, 4) - 0.5) * 2 * r + 0.3 * Math.sin(t * 2 + i), z = c[2] + (hh(i, 5) - 0.5) * r;
    fxAt(out, `conf${i % 5}`, 60, 30, (p) => fxConf(p, i % 5), [x, y, z], 0.16, 0.08, { rot: t * 4 + i });
  }
};
/** the crowd of townsfolk on the common, cheering on cue */
const crowd = (out: Stage, cam: CamInfo, t: number, n: number, z0: number, spread: number, cheer: boolean, exprs: Expr[] = ["excited", "laugh", "proud", "grin"]) => {
  for (let i = 0; i < n; i++) {
    const row = i % 3, x = (i / n - 0.5) * spread + (hh(i) - 0.5) * 1.2, z = z0 - row * 1.6 - hh(i, 2) * 0.8;
    const jump = cheer ? hop(t % 1.2, 0.0 + hh(i, 3) * 12, 14 + hh(i, 3) * 12, 0.25) : 0;
    stand(out, cam, t, 100 + i, VOLS[i % 6], `v${i % 6}`, x, z, { expr: exprs[i % exprs.length], pose: cheer ? (i % 3 === 0 ? "up" : i % 3 === 1 ? "point" : undefined) : undefined, wave: cheer && i % 3 === 2 ? q(osc(t, 2, i), 12) : undefined, dy: jump });
  }
};

/** everything with a face in shot `id` at time t */
export const stage = (id: number, t: number, cam: CamInfo): Stage => {
  const out: Stage = { places: [], fx: [] };
  const s = SHOTS[id - 1];
  LNAME = lname(s.light);
  findSun(cam, SUN);
  const n = t * 30;
  const c = olyCentres();

  if (id === 1) {
    // townsfolk at her feet cheer and toss their hats as the camera cranes up
    crowd(out, cam, t, 12, -13, 22, true);
    stand(out, cam, t, 50, KIDW, "kid", 2.4, -15.5, { expr: "laugh", pose: "jump", dy: Math.abs(osc(t, 1.3)) * 0.4 }, 0.75);
    dog(out, t, at(4.4, -15.8), 0.3 * osc(t, 0.8));
  }
  if (id === 2) {
    // a man on the roof of the ten-story building looks up; his coffee cup drops
    const look = n > 122;
    stand(out, cam, t, 60, VOLS[1], "v1", TOWER[0] + 2, TOWER[2] - 4.5, look ? { expr: "shock", pose: "flinch", headTilt: -10, swaps: [F(122)] } : { expr: "smile", prop: "icecream" }, 1, 31);
    if (look) { const u = t - F(124); fxAt(out, "cup", 120, 120, fxCup, [TOWER[0] + 2.6, 31.9 - 4.9 * u * u, TOWER[2] - 4.6], 0.4, 0.4, { rot: u * 8 }); }
  }
  if (id === 3) {
    // 1999: the mayor polishes the trophy in front of Angus, then holds it up proudly
    const up = n > 230;
    stand(out, cam, t, 1, MAYOR, "mayor", -1.8, -15.6, up ? { expr: "smug", pose: "up", swaps: [F(230)] } : { expr: "proud", pose: "polish", swing: q((t * 1.6) % 1, 16) });
    fxAt(out, "trophy", 160, 200, fxTrophy, up ? at(-1.8, -15.7, 2.65) : at(-1.25, -15.75, 1.25), 0.5, 0.62);
    if (!up) { const v = q((t * 1.3) % 1, 20); fxAt(out, `spark${v}`, 200, 200, (p) => fxSpark(p, v), at(-1.1, -15.9, 1.55), 0.35, 0.35); }
    crowd(out, cam, t, 8, -12, 14, n > 280, ["proud", "grin", "excited", "smile"]);
  }
  if (id === 4) {
    // town meeting: she slams the table on "more", then points up; everyone straightens
    const slam = n >= 336, pt = n > 344;
    stand(out, cam, t, 1, MAYOR, "mayor", TABLE[0] + 0.2, TABLE[2] + 1.0, pt ? { expr: "smug", pose: "point", swaps: [F(336), F(344)] } : slam ? { expr: "angry", pose: "cover", dy: 0, sy: 0.94 } : { expr: "angry", pose: "hips" });
    [[-1.8, -1.0], [1.9, -0.9], [-0.6, -1.9]].forEach(([dx, dz], i) => stand(out, cam, t, 110 + i, VOLS[i + 2], `v${i + 2}`, TABLE[0] + dx, TABLE[2] + dz, slam ? { expr: "excited", pose: "up", dy: hop(t, 338 + i * 2, 350 + i * 2, 0.22) } : { expr: "neutral", headTilt: 4 }));
    if (slam && n < 342) { const v = (n - 336) / 6; fxAt(out, `burst${q(v, 10)}`, 500, 500, (p) => fxBurst(p, q(v, 10)), at(TABLE[0], TABLE[2] + 0.3, 1.2), 1.0, 1.0); }
  }
  if (id === 5) {
    // the crane operator waves from his cab (high up); small figures on top ride the rising snow
    stand(out, cam, t, 2, OPER, "oper", 27.6, 4.6, { expr: "grin", wave: q(osc(t, 1.5), 12), noBlob: true }, 1.4, 48.3);
  }
  if (id === 6 || id === 16) {
    // volunteers stomping in rhythm on the top layer; one slips and lands on his backside (shot 6)
    const top = c.y2 + 0.4 + (0.6 - 0.6) * 6, beat = (t * 2) % 1;
    for (let i = 0; i < 5; i++) {
      const x = -3 + i * 1.6, z = -3.8 + (i % 2) * 1.2;
      if (id === 6 && i === 3 && t > T_SLIP) {
        const u = t - T_SLIP;
        stand(out, cam, t, 120 + i, VOLS[i], `v${i}`, x, z, u < 0.3 ? { expr: "shock", pose: "flinch", dy: hop(t, 520, 529, 0.4), sy: 1.08 } : u < 0.8 ? { mode: "sit", expr: "shock" } : { mode: "sit", expr: "laugh" }, 1, top);
        if (u > 0.3 && u < 0.5) fxAt(out, `burst${q((u - 0.3) / 0.2, 10)}`, 500, 500, (p) => fxBurst(p, q((u - 0.3) / 0.2, 10), "#ffffff"), [x, top + 0.2, z - 0.1], 1.2, 1.2);
        if (u > 0.4) { const v = q((t * 0.9) % 1, 30); fxAt(out, `stars${v}`, 420, 210, (p) => fxStars(p, v), [x, top + 1.5, z], 0.7, 0.35); }
        continue;
      }
      const ph = q((beat + (id === 16 ? 0 : i * 0.02)) % 1, 12), slow = id === 16 ? 0.5 : 1;
      stand(out, cam, t, 120 + i, VOLS[i], `v${i}`, x, z, { expr: id === 16 ? "angry" : (["laugh", "grin", "excited", "grin", "laugh"] as Expr[])[i], mode: "march", phase: id === 16 ? q(((t * slow) % 1), 60) : ph, lift: 90, dy: 0 }, 1, top);
      if (id === 16 && ((t * slow) % 1) < 0.08) fxAt(out, `spark${q(((t * slow) % 1) / 0.08, 10)}`, 200, 200, (p) => fxSpark(p, q(((t * slow) % 1) / 0.08, 10)), [x - 0.15, top + 0.1, z - 0.2], 0.5, 0.5);
    }
  }
  if (id === 7) {
    if (n < 640) {
      // a worker in a lift basket guides the wreath into place
      stand(out, cam, t, 3, VOLS[1], "v1", -3.6, -5.2, { expr: n > 600 ? "grin" : "worried", pose: "up", noBlob: true }, 1, FACE_Y - 1.8);
    } else {
      // the skier who gave up her skis: standing in ski boots, sad; a friend pats her back
      stand(out, cam, t, 4, SKIER, "skier", 0.6, -21.5, { expr: n > 660 ? "sad" : "worried", pose: n > 660 ? "palm" : "shrug", swaps: [F(660)] });
      stand(out, cam, t, 5, VOLS[4], "v4", -0.9, -21.0, { expr: "laugh", pose: "point", facing: 1 });
    }
  }
  if (id === 8) {
    if (n < 770) {
      // the painter rolls a tire red, then stands proud with red paint on his face
      const proud = n > 729;
      stand(out, cam, t, 6, PAINTER, "painter", -8.4, -21.4, proud ? { expr: "proud", pose: "hips", swaps: [F(729)] } : { expr: "grin", pose: "polish", swing: q((t * 2.2) % 1, 16) });
      fxAt(out, "tireRed", 200, 140, (p) => { p.ell(100, 80, 90, 50, "#2b2b33", 8); p.ell(100, 70, 90, 46, "#e0303a", 8); p.ell(100, 70, 40, 18, "#2b2b33", 6); }, at(-9.6, -20.2, 0.45), 1.4, 0.98);
      if (proud) for (let i = 0; i < 4; i++) fxAt(out, "splatdot", 64, 64, (p) => p.ell(32, 32, 24, 20, "#d02a1e", 4), at(-8.4 + (hh(i) - 0.5) * 0.25, -21.5, 1.75 + hh(i, 2) * 0.25), 0.08, 0.07);
    } else {
      // a lumberjack watches the spruce arms go up, hands on hips
      stand(out, cam, t, 7, AUS, "lumber", 6, -40, { expr: "smug", pose: "hips" }, 1.3);
    }
  }
  if (id === 9) {
    if (n < 915) { crowd(out, cam, t, 24, -26, 40, true); confetti(out, t, [0, 0, -24], 50, 14); }
    else {
      // the giant scale: the needle spins round on "thirteen million"
      const a = -Math.PI / 2 + Math.max(0, t - T_SCALE) * 14;
      fxAt(out, `dial${q(a % (Math.PI * 2), 24)}`, 300, 300, (p) => fxDial(p, q(a % (Math.PI * 2), 24)), [0, 2.3, -13.6], 3.0, 3.0);
      stand(out, cam, t, 8, VOLS[0], "v0", 3.4, -14.6, { expr: t > T_SCALE ? "shock" : "excited", pose: t > T_SCALE ? "flinch" : "point", facing: -1 });
    }
  }
  if (id === 10) {
    if (n < 1058) {
      // the senator cuts the ribbon; the mayor applauds
      stand(out, cam, t, 9, SEN, "sen", -0.6, RIBBON_Z - 0.8, n > 1000 ? { expr: "smile", wave: q(osc(t, 1.5), 12) } : { expr: "smile", prop: "clipboard" });
      stand(out, cam, t, 1, MAYOR, "mayor", 2.4, RIBBON_Z - 1.4, { expr: "proud", pose: n > 1000 ? "up" : "hips", dy: n > 1000 ? hop(t, 1002, 1014, 0.2) : 0 });
      if (n > 1000) confetti(out, t, [0, 0, RIBBON_Z - 1], 26, 4);
    } else {
      // "luckily, Snowe": she strikes Olympia's pose and they wink together; the crowd laughs
      const wink = t > T_WINK;
      stand(out, cam, t, 9, SEN, "sen", -1.6, -19.5, { expr: wink ? "smug" : "smile", pose: "hips", swaps: [T_WINK], blink: wink && t < T_WINK + 0.5 ? 0.5 : undefined }, 1.2);
      crowd(out, cam, t, 6, -18, 12, wink, ["laugh"]);
    }
  }
  if (id === 11) {
    // the kid tries a snowball; it crumbles; she scratches her head; the dog tilts its head
    const crumble = n > 1127;
    stand(out, cam, t, 50, KIDW, "kid", 5.6, -21.8, crumble ? { expr: n > 1140 ? "worried" : "shock", pose: n > 1140 ? "palm" : "shrug", swaps: [F(1127), F(1140)] } : { expr: "grin", pose: "carry" as Pose }, 0.8);
    if (crumble) for (let i = 0; i < 8; i++) { const u = t - F(1127); fxAt(out, "snowbit", 64, 64, (p) => p.ell(32, 32, 22, 20, "#ffffff", 4), [5.75 + (hh(i) - 0.5) * 0.4, Math.max(0.05, 0.95 - 4.9 * u * u * (0.6 + hh(i, 2))), -22.0], 0.08, 0.08); }
    dog(out, t, at(4.7, -21.6), crumble ? 0.8 : 0, 0.7);
  }
  if (id === 12) {
    // the snowflake with its wet skin, turning slowly; a thermometer sits just above freezing
    fxAt(out, "flakeWet", 512, 512, (p) => fxFlake(p, true), [DIAG[0], DIAG[1] + 3, DIAG[2]], 5, 5, { rot: t * 0.25 });
    fxAt(out, "thermo", 100, 320, (p) => fxThermo(p, 0.42), [DIAG[0] + 2.6, DIAG[1] + 1.4, DIAG[2] - 1], 0.6, 1.9);
  }
  if (id === 13) {
    // two flakes pushed together by mittens; a water bridge, then a sparkle as it freezes
    const k = k01(t, 1260, 1300);
    for (const sd of [-1, 1]) {
      const x = DIAG[0] + sd * (2.6 - 1.15 * k);
      fxAt(out, "flake", 512, 512, (p) => fxFlake(p, false), [x, DIAG[1] + 3, DIAG[2]], 3, 3, { rot: sd * 0.3 });
      fxAt(out, "mitten", 200, 200, fxMitten, [x + sd * 1.9, DIAG[1] + 3, DIAG[2] - 0.3], sd * -1.1, 1.1);
    }
    if (k > 0.9) fxAt(out, "bridge", 128, 64, (p) => p.ell(64, 32, 60, 26, "rgba(60,160,235,0.55)", 0), [DIAG[0], DIAG[1] + 3, DIAG[2] - 0.2], 0.7, 0.35, { soft: true });
    if (n > 1335 && n < 1352) { const v = q((n - 1335) / 17, 20); fxAt(out, `spark${v}`, 200, 200, (p) => fxSpark(p, v), [DIAG[0], DIAG[1] + 3, DIAG[2] - 0.3], 1.4, 1.4); }
  }
  if (id === 14) {
    const bx = BEACH[0], bz = BEACH[2];
    if (n < 1430) stand(out, cam, t, 50, KID_SWIM, "kidSwim", bx + 0.9, bz - 0.6, t < T_COLLAPSE ? { expr: "proud", pose: "hips" } : { expr: "shock", pose: "flinch", sy: 1.05, swaps: [T_COLLAPSE] }, 0.8, 0);
    else stand(out, cam, t, 50, KID_SWIM, "kidSwim", bx + 0.9, bz - 0.6, { expr: n > 1451 ? "smug" : "grin", pose: "hips", swaps: [F(1451)] }, 0.8, 0);
    if (t >= T_COLLAPSE && n < 1430) { const u = t - T_COLLAPSE; for (let i = 0; i < 4; i++) { const sz = 0.6 + u; fxAt(out, `sanddust${i % 3}`, 512, 512, (p) => fxPuffC(p, i % 3, "#f6dca8", "#c7a874"), [bx + 0.2 + (i - 1.5) * 0.3, 0.3 + u * 0.4, bz - 0.2], sz, sz, { soft: true }); } }
  }
  if (id === 15) {
    // a frigid day: the bundled-up kid scoops powder and it blows away in the wind
    stand(out, cam, t, 50, KID_PUFF, "kidPuff", 28, -34.6, { expr: n > 1540 ? "deadpan" : "sad", pose: n > 1527 ? "shrug" : "carry" as Pose, swaps: [F(1527)] }, 0.85);
    if (n > 1527) for (let i = 0; i < 16; i++) { const u = (t - F(1527)) * (0.8 + hh(i)); fxAt(out, "powder", 64, 64, (p) => p.ell(32, 32, 20, 20, "#ffffff", 0), [28.4 + u * 2.4 + hh(i, 2) * 0.3, 1.0 + hh(i, 3) * 0.3 + 0.2 * Math.sin(u * 5 + i), -34.7], 0.06, 0.06, { soft: true }); }
  }
  if (id === 17) {
    if (n < 1720) {
      // summer: people in shorts eat ice cream in the shade of the melting Olympia
      [[-3, -14, "icecream"], [2.6, -13.4, null], [5.4, -15, "icecream"]].forEach(([x, z, prop], i) =>
        stand(out, cam, t, 130 + i, SUM(i), `sum${i}`, x as number, z as number, { expr: (["grin", "smile", "laugh"] as Expr[])[i], prop: prop as "icecream" | null, mode: i === 1 ? "sit" : "stand" }));
    } else {
      // the last little pile: a kid slides down it
      const u = ((t - F(1720)) * 0.9) % 1;
      stand(out, cam, t, 50, KID_SWIM, "kidSwim", lerp(-1.2, 1.8, u), -2.6 - 0.5 * u, { expr: "laugh", pose: "up" }, 0.75, groundY(0, -2) + 2.4 * (1 - u) + 0.1);
    }
  }
  if (id === 18) {
    const ax = AUSTRIA[0], az = AUSTRIA[2];
    if (n < 1840) {
      stand(out, cam, t, 11, AUS, "aus", ax - 3.4, az - 20, { expr: "smug", pose: "hips" }, 1.1);
      for (let i = 0; i < 6; i++) stand(out, cam, t, 140 + i, VOLS[i], `v${i}`, ax - 8 + i * 3, az - 22 - (i % 2), { expr: "excited", pose: i % 2 ? "up" : "point", dy: hop(t % 1.3, 0, 12 + i, 0.2) });
    } else {
      // the official shrugs; the carrot nose falls; the Austrian deflates
      const fell = t > T_NOSE;
      stand(out, cam, t, 12, JUDGE, "judge", ax + 0.3, az - 19.4, { expr: "deadpan", pose: n > 1860 ? "shrug" : "hold" as Pose, prop: n > 1860 ? null : "clipboard", swaps: [F(1860)] });
      stand(out, cam, t, 11, AUS, "aus", ax + 1.8, az - 18.6, { expr: fell ? "sad" : "worried", pose: fell ? "palm" : "hips", swaps: [T_NOSE] });
    }
  }
  if (id === 19) {
    if (n < 1990) {
      // dusk: everyone from the story lined up in front of Olympia
      stand(out, cam, t, 1, MAYOR, "mayor", -2.2, -16.4, { expr: "proud", pose: "up" });
      fxAt(out, "trophy", 160, 200, fxTrophy, at(-2.2, -16.5, 2.65), 0.5, 0.62);
      stand(out, cam, t, 9, SEN, "sen", 0.2, -16.2, { expr: "smile", wave: q(osc(t, 1.2), 12) });
      stand(out, cam, t, 2, OPER, "oper", 2.6, -16.0, { expr: "grin", pose: "hips" });
      stand(out, cam, t, 6, PAINTER, "painter", 4.8, -16.6, { expr: "proud" });
      stand(out, cam, t, 4, SKIER, "skier", -4.4, -16.1, { expr: "grin", pose: "point", facing: 1 });
      stand(out, cam, t, 50, KIDW, "kid", 1.4, -17.6, { expr: "laugh", dy: Math.abs(osc(t, 1.2)) * 0.25 }, 0.75);
      fxAt(out, "sled", 300, 120, fxSled, at(2.2, -17.8, 0.18), 0.9, 0.36);
      dog(out, t, at(-0.8, -17.7), 0.4 * osc(t, 0.7), 0.7);
    }
  }
  void clamp01; void OLY; void T_WINK2; void INK; void fxGull; void fxHat; void fxShadow; void fxContact; void bodyFront; void bodySide;
  return out;
};
