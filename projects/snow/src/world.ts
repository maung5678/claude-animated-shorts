// "Snow Queen of Bethel": the whole place as one three.js scene. Bethel common under snow (height field, hills,
// mountains, houses, church, the ten-story building for scale), Olympia (three snow balls with wreath eyes, ski
// lashes, tire lips and buttons, spruce arms) and her construction (crane + bucket, layer cut), the 1999 snowman Angus,
// the summer melt, plus three far sets: the beach (sandcastles), the diagram stage (snowflakes) and an Austrian valley.
import * as THREE from "three";
import { Batch, V, lam, Kit, Ray, prop, setSight, house } from "./build";
import { ctex, rng, cloudHD, facadeHD } from "./paint";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import {
  FPS, SHOTS, ShotDef, V3, camAt, groundY, OLY, olyCentres, CRANE, TOWER, TABLE, RIBBON_Z, BEACH, DIAG, AUSTRIA, builtAt,
  T_TIMELAPSE, T_COLLAPSE, T_NOSE, smooth, hh,
} from "./story";

export const loadKit = () => Promise.resolve({} as Kit);

const repT = (t: THREE.Texture) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true; return t; };
const snowTex = () => repT(ctex("snowHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(150,170,220,${0.08 + r() * 0.12})`; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 4, 2 + r() * 2); }
  g.strokeStyle = "rgba(140,160,215,0.22)"; g.lineWidth = 4;
  for (let k = 0; k < 22; k++) { const y = r() * 1024; g.beginPath(); for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + 12 * Math.sin(x * 0.012 + k)); g.stroke(); }
}));
const flat = (col: string) => lam("c" + col, () => ({ color: col }));
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, shadow = true) => {
  const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
};
const snowBall = (r: number) => new THREE.SphereGeometry(r, 64, 40);
/** z on the front of a sphere of radius r at offset (x, y) from its centre, nudged out by d */
const front = (r: number, x: number, y: number, d = 0.12) => -Math.sqrt(Math.max(0, r * r - x * x - y * y)) - d;

/** a snowperson: three balls + optional features; set(built 0..1, melt 0..1) */
class Snowperson {
  g = new THREE.Group();
  private balls: THREE.Mesh[] = []; private cap: THREE.Mesh; private feats = new THREE.Group(); private arms: THREE.Group[] = [];
  carrot: THREE.Mesh | null = null;
  constructor(kind: "olympia" | "angus" | "austria", scale = 1) {
    const S = lam("snowBody", () => ({ map: snowTex() })), { r1, r2, r3 } = OLY;
    for (const r of [r1, r2, r3]) this.balls.push(mesh(snowBall(r * scale), S, this.g));
    this.cap = mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), S, this.g); this.cap.visible = false;
    const c = olyCentres(), fy = c.y3 * scale, fr = r3 * scale;
    const ink = flat("#2b2b33");
    if (kind === "olympia") {
      for (const s of [-1, 1]) {
        const ex = s * fr * 0.38, ey = fy + fr * 0.12, ez = front(fr, ex, fr * 0.12, 0.25);
        const wreath = mesh(new THREE.TorusGeometry(fr * 0.2, fr * 0.07, 12, 32), flat("#2f8a4f"), this.feats); wreath.position.set(ex, ey, ez);
        const bow = mesh(new THREE.SphereGeometry(fr * 0.06, 12, 8), flat("#d6343b"), this.feats); bow.position.set(ex, ey - fr * 0.2, ez - 0.05);
        const pupil = mesh(new THREE.SphereGeometry(fr * 0.07, 16, 12), ink, this.feats); pupil.position.set(ex, ey, ez + 0.05);
        const skiCols = ["#ff5a3c", "#2f6fd0", "#ffcc29", "#7c3fb0", "#2f8a4f", "#ff7a26", "#e0303a", "#5fd0b4"];
        for (let k = 0; k < 8; k++) {
          const ski = mesh(box(0.14, fr * 0.36, 0.05, 0, fr * 0.18, 0), flat(skiCols[k]), this.feats);
          ski.position.set(ex + (k - 3.5) * fr * 0.05, ey + fr * 0.2, ez - 0.1); ski.rotation.z = -s * 0.1 + (k - 3.5) * 0.08; ski.rotation.x = -0.5;
        }
      }
      for (const dy of [-0.02, 0.06]) { const lip = mesh(new THREE.TorusGeometry(fr * 0.13, fr * 0.06, 12, 28), flat("#e0303a"), this.feats); lip.scale.set(1.6, 0.55, 1); lip.position.set(0, fy - fr * 0.42 + dy * fr, front(fr, 0, -fr * 0.42, 0.2)); }
      for (let i = 0; i < 3; i++) { const b = mesh(new THREE.TorusGeometry(r2 * scale * 0.12, r2 * scale * 0.05, 10, 24), ink, this.feats); const oy = r2 * scale * (0.45 - i * 0.42); b.position.set(0, c.y2 * scale + oy, front(r2 * scale, 0, oy, 0.15)); }
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(), tree = flat("#2f6f45"), trunk = flat("#7a4f33");
        mesh(new THREE.CylinderGeometry(0.25, 0.4, 9, 8).translate(0, 4.5, 0), trunk, arm);
        for (let k = 0; k < 4; k++) mesh(new THREE.ConeGeometry(2.6 - k * 0.5, 3.4, 10).translate(0, 3 + k * 1.9, 0), tree, arm);
        arm.position.set(s * r2 * scale * 0.85, c.y2 * scale + 1.5, 0); arm.rotation.z = -s * 1.0;
        this.arms.push(arm); this.feats.add(arm);
      }
    } else {
      for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(fr * 0.08, 16, 12), ink, this.feats); e.position.set(s * fr * 0.35, fy + fr * 0.15, front(fr, s * fr * 0.35, fr * 0.15, 0.05)); }
      if (kind === "angus") {
        mesh(new THREE.CylinderGeometry(fr * 0.6, fr * 0.6, fr * 1.0, 32).translate(0, fy + fr * 1.35, 0), ink, this.feats);
        mesh(new THREE.CylinderGeometry(fr * 0.95, fr * 0.95, fr * 0.08, 32).translate(0, fy + fr * 0.86, 0), ink, this.feats);
        for (let i = 0; i < 5; i++) { const m = mesh(new THREE.SphereGeometry(fr * 0.05, 8, 6), ink, this.feats); m.position.set((i - 2) * fr * 0.12, fy - fr * 0.4 + Math.abs(i - 2) * 0.04 * fr, front(fr, (i - 2) * fr * 0.12, -fr * 0.4, 0.05)); }
      } else {
        const scarf = mesh(new THREE.TorusGeometry(fr * 0.85, fr * 0.16, 12, 40).rotateX(Math.PI / 2), flat("#d6343b"), this.feats); scarf.position.y = fy - fr * 0.75;
        mesh(new THREE.CylinderGeometry(fr * 0.75, fr * 0.75, fr * 0.6, 32).translate(0, fy + fr * 1.0, 0), flat("#2f6f45"), this.feats);
      }
      this.carrot = mesh(new THREE.ConeGeometry(fr * 0.11, fr * 0.6, 16).rotateX(-Math.PI / 2).translate(0, 0, -fr * 0.3), flat("#ff8a2a"), this.feats);
      this.carrot.position.set(0, fy - fr * 0.05, front(fr, 0, -fr * 0.05, 0));
      for (let i = 0; i < 3; i++) { const b = mesh(new THREE.SphereGeometry(r2 * scale * 0.07, 10, 8), ink, this.feats); const oy = r2 * scale * (0.45 - i * 0.42); b.position.set(0, c.y2 * scale + oy, front(r2 * scale, 0, oy, 0.05)); }
    }
    this.g.add(this.feats);
    this.scale = scale;
  }
  private scale = 1;
  /** built: 0..1 (0.6 = the middle ball cut flat for the stompers); melt: 0..1 */
  set(built: number, melt: number) {
    const c = olyCentres(melt), s = this.scale, { r1, r2, r3 } = OLY;
    const ks = [c.k1, c.k2, c.k3], ys = [c.y1, c.y2, c.y3], rs = [r1, r2, r3];
    this.balls.forEach((b, i) => { const k = ks[i], w = 1 + (1 - k) * 0.8; b.scale.set(w, k, w); b.position.y = ys[i] * s; });
    this.balls[1].visible = built > 0.35; this.balls[2].visible = built > 0.95;
    this.feats.visible = built > 0.95;
    // a partly built middle ball shows as its lower half with a flat trampled top (the stomping floor)
    this.cap.visible = false;
    if (built > 0.35 && built <= 0.95) {
      const b = this.balls[1], cutY = ys[1] * s + (built - 0.6) * 6;
      b.geometry.dispose?.();
      const rr = r2 * s, h = THREE.MathUtils.clamp((cutY - ys[1] * s) / rr, -0.95, 0.95), th = Math.acos(h);
      b.geometry = new THREE.SphereGeometry(rr, 64, 40, 0, Math.PI * 2, th, Math.PI - th);
      this.cap.visible = true; this.cap.position.set(0, cutY, 0); this.cap.scale.setScalar(rr * Math.sin(th));
    } else if (!(this.balls[1].geometry as THREE.SphereGeometry).parameters || (this.balls[1].geometry as THREE.SphereGeometry).parameters.thetaLength !== Math.PI) {
      this.balls[1].geometry = snowBall(r2 * s);
    }
    for (const a of this.arms) a.rotation.z = Math.sign(a.position.x) * -(1.0 + 1.0 * melt);
    const c0 = olyCentres(0); this.feats.position.y = (c.y3 - c0.y3) * s; this.feats.position.z = -(1 - c.k3) * r3 * s * 0.3;
    void rs;
  }
}

const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 3) {
    const c = camAt(s.id, Math.max(0, Math.min(2061, f))), o = V(...c.pos), look = V(...c.look);
    if (Math.abs(o.x) > 1000 || Math.abs(o.z) > 1000) continue;
    const fw = look.clone().sub(o), len = fw.length();
    fw.normalize();
    const rt = fw.clone().cross(V(0, 1, 0)).normalize(), upv = rt.clone().cross(fw);
    const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
    for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
      out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(upv, sy * ty), len, core: sx === 0 && sy === 0 });
  }
  return out;
};

export class World {
  root = new THREE.Group();
  private pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private hemi: THREE.HemisphereLight; private sun: THREE.DirectionalLight;
  private sky: THREE.Mesh; private skyMat: THREE.ShaderMaterial;
  private fog = new THREE.Fog("#bccbec", 25, 420);
  private sunDisc: THREE.Sprite; private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<string, THREE.Texture[]>; private clouds: THREE.Mesh[] = [];
  private snowG: THREE.Mesh; private summerG: THREE.Mesh;
  private olympia: Snowperson; private angus: Snowperson; private austria: Snowperson;
  private crane = new THREE.Group(); private bucket = new THREE.Group(); private cable: THREE.Mesh;
  private table = new THREE.Group(); private ribbon = new THREE.Group(); private scaleP: THREE.Mesh;
  private beach = new THREE.Group(); private castleDry = new THREE.Group(); private castleMound: THREE.Mesh; private castleWet = new THREE.Group();
  private diag = new THREE.Group(); private alps = new THREE.Group();
  private flakes: THREE.Points; private flakePos: Float32Array;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    setSight(sightLines());
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    const disc = ctex("sunDisc", 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunDisc.frustumCulled = false; this.sunDisc.layers.set(NOINK); R.add(this.sunDisc);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6); this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = Object.fromEntries(Object.keys(LOOK).map((n) => [n, [0, 1, 2, 3].map((k) => cloudHD(k, LOOK[n as keyof typeof LOOK].cloud))]));
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 140 + (i % 4) * 30; m.position.set(Math.cos(a) * d, 110 + (i % 4) * 34, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- Bethel ground: snow and its summer twin ----
    const mkGround = (summer: boolean) => {
      const gg = new THREE.PlaneGeometry(900, 900, 220, 220); gg.rotateX(-Math.PI / 2);
      const gp = gg.attributes.position as THREE.BufferAttribute, uv = gg.attributes.uv as THREE.BufferAttribute, cols: number[] = [];
      const base = new THREE.Color(summer ? "#86c160" : "#f6f8fd"), path = new THREE.Color(summer ? "#a7cf78" : "#e3e9f7"), far = new THREE.Color(summer ? "#6aa64e" : "#eef2fb"), tmp = new THREE.Color();
      for (let i = 0; i < gp.count; i++) {
        const x = gp.getX(i), z = gp.getZ(i), y = groundY(x, z), r = Math.hypot(x, z);
        gp.setY(i, y); uv.setXY(i, x / 8, z / 8);
        tmp.copy(base).lerp(path, smooth((24 - r) / 8) * 0.8).lerp(far, smooth((r - 80) / 80) * 0.5);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
      gg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3)); gg.computeVertexNormals();
      const m = new THREE.Mesh(gg, summer ? lam("grassV", () => ({ vertexColors: true })) : lam("snowV", () => ({ map: snowTex(), vertexColors: true })));
      m.receiveShadow = true; R.add(m); return m;
    };
    this.snowG = mkGround(false); this.summerG = mkGround(true);
    // mountains around the valley
    const mb = new Batch(), r = rng(5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + r() * 0.2, d = 380 + r() * 160, h = 90 + r() * 110, w = 110 + r() * 60;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      mb.add(new THREE.ConeGeometry(w, h, 12).translate(x, h / 2 - 5, z), flat(i % 2 ? "#6f7fae" : "#7f8fc0"));
      mb.add(new THREE.ConeGeometry(w * 0.38, h * 0.38, 12).translate(x, h - h * 0.19 - 5 + 0.3, z), flat("#f4f8ff"));
    }
    // pines around the common
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2, d = 75 + r() * 140, x = Math.cos(a) * d, z = Math.sin(a) * d;
      prop(mb, {} as Kit, "tree_cone", x, groundY(x, z) - 0.2, z, 7 + r() * 7, r() * 6);
    }
    mb.build(R);
    // the town: houses ringing the common, the church, the ten-story building for scale
    const hb = new Batch();
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, d = 46 + (i % 3) * 9, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x - TOWER[0], z - TOWER[2]) < 16) continue;
      house(hb, x, z, Math.atan2(-x, -z), 7 + (i % 2) * 2, 8, 6 + (i % 3) * 1.4, i % 8, 0);
    }
    const tw = 14, th = 31;
    const fac = lam("tower10", () => ({ map: facadeHD("tower10", tw, th, { wall: "#b9a28e", shutter: "#3f6fb5" }) }));
    hb.add(box(tw, th, 12, TOWER[0], th / 2, TOWER[2]), fac);
    hb.add(box(tw + 0.6, 0.6, 12.6, TOWER[0], th + 0.3, TOWER[2]), flat("#f4f8ff"));
    hb.build(R);
    // the church (white, red spire)
    const ch = new THREE.Group();
    mesh(box(10, 9, 16, 0, 4.5, 0), flat("#f6f0e4"), ch); mesh(box(4.5, 17, 4.5, 0, 8.5, -9), flat("#f6f0e4"), ch);
    mesh(new THREE.ConeGeometry(3.5, 8, 4).rotateY(Math.PI / 4).translate(0, 21, -9), flat("#c9373a"), ch);
    mesh(new THREE.ConeGeometry(8.5, 4, 4).rotateY(Math.PI / 4).scale(1, 1, 1.6).translate(0, 11, 0), flat("#eef2fb"), ch);
    ch.position.set(34, 0, 52); ch.rotation.y = -0.6; R.add(ch);

    // ---- the snowpeople ----
    this.olympia = new Snowperson("olympia"); R.add(this.olympia.g);
    this.angus = new Snowperson("angus", 0.93); R.add(this.angus.g);
    this.austria = new Snowperson("austria", 1.03); this.austria.g.position.set(...AUSTRIA); R.add(this.austria.g);

    // ---- the crane, the meeting table, the ribbon, the scale ----
    const yel = flat("#ffb02e");
    mesh(box(2, 52, 2, 0, 26, 0), yel, this.crane); mesh(box(42, 1.6, 1.6, -14, 52, 0), yel, this.crane); mesh(box(3.5, 3, 3, 1.5, 49, 0), yel, this.crane);
    mesh(box(2.4, 1.8, 2.2, 0.8, 49.3, -1.6), flat("#a7d4ef"), this.crane); mesh(box(6, 4, 6, 8, 52, 0), flat("#5b5f6b"), this.crane);
    this.crane.position.set(...CRANE); R.add(this.crane);
    mesh(new THREE.CylinderGeometry(1.4, 1.1, 1.6, 20, 1, true), flat("#5b5f6b"), this.bucket);
    mesh(new THREE.CircleGeometry(1.35, 20).rotateX(-Math.PI / 2).translate(0, 0.7, 0), lam("snowBody", () => ({ map: snowTex() })), this.bucket);
    R.add(this.bucket);
    this.cable = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, -0.5, 0), flat("#2b2b33"), R, false);
    const wood = flat("#8a5a34");
    mesh(box(5, 0.15, 1.6, 0, 0.72, 0), wood, this.table); for (const sx of [-2.2, 2.2]) for (const sz of [-0.6, 0.6]) mesh(box(0.12, 0.72, 0.12, sx, 0.36, sz), wood, this.table);
    this.table.position.set(...TABLE); R.add(this.table);
    for (const sx of [-4, 4]) mesh(box(0.12, 1.2, 0.12, sx, 0.6, RIBBON_Z), wood, this.ribbon);
    for (const s of [-1, 1]) { const half = mesh(box(4, 0.12, 0.03, s * 2, 1.0, RIBBON_Z), flat("#e0303a"), this.ribbon); half.name = s < 0 ? "ribL" : "ribR"; }
    R.add(this.ribbon);
    this.scaleP = mesh(new THREE.CylinderGeometry(13, 13, 0.8, 48).translate(0, 0.4, 0), flat("#c9cdd6"), R);

    // ---- beach set: sand, sea, castles ----
    mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), flat("#f1c77f"), this.beach);
    mesh(new THREE.PlaneGeometry(240, 120).rotateX(-Math.PI / 2).translate(0, 0.05, 70), flat("#139aa8"), this.beach);
    mesh(new THREE.PlaneGeometry(240, 1.4).rotateX(-Math.PI / 2).translate(0, 0.08, 10.5), new THREE.MeshBasicMaterial({ color: "#ffffff" }), this.beach, false);
    const sandC = flat("#d9b06a"), damp = flat("#b98d52");
    for (const [g, m] of [[this.castleDry, sandC], [this.castleWet, damp]] as const) {
      mesh(box(1.2, 0.5, 0.8, 0, 0.25, 0), m, g);
      for (const sx of [-0.55, 0.55]) mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.85, 12).translate(sx, 0.42, 0), m, g);
      for (let k = 0; k < 4; k++) mesh(box(0.1, 0.1, 0.1, -0.45 + k * 0.3, 0.55, -0.35), m, g);
      mesh(new THREE.ConeGeometry(0.2, 0.3, 12).translate(0.55, 1.0, 0), m, g);
      g.position.set(BEACH[0] + 0.2, 0, BEACH[2]); this.beach.add(g);
    }
    mesh(box(0.02, 0.5, 0.02, 0.55, 1.35, 0), flat("#2b2b33"), this.castleWet); mesh(box(0.25, 0.14, 0.01, 0.68, 1.5, 0), flat("#e0303a"), this.castleWet);
    this.castleMound = mesh(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.32, 0.8), sandC, this.beach);
    this.castleMound.position.set(BEACH[0] + 0.2, 0, BEACH[2]);
    this.beach.children.slice(0, 3).forEach((c) => c.position.add(V(BEACH[0], 0, BEACH[2])));
    R.add(this.beach);

    // ---- diagram set: pale grid floor + backdrop ----
    const gridT = repT(ctex("gridHD", 512, 512, (g) => { g.fillStyle = "#eef6fd"; g.fillRect(0, 0, 512, 512); g.strokeStyle = "#c6dcee"; g.lineWidth = 3; for (let i = 0; i <= 512; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); } }));
    gridT.repeat.set(20, 20);
    const gm = new THREE.MeshBasicMaterial({ map: gridT, fog: false, side: THREE.DoubleSide });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), gm); fl.layers.set(NOINK); this.diag.add(fl);
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(80, 40).translate(0, 20, 6), gm); wl.layers.set(NOINK); this.diag.add(wl);
    this.diag.position.set(...DIAG); R.add(this.diag);

    // ---- Austria: snowy valley floor + big alps + chalets ----
    mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), lam("snowA", () => ({ map: snowTex(), color: "#eef2fb" })), this.alps);
    const ab = new Batch();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 0.7, d = 260 + (i % 3) * 60, h = 200 + (i % 4) * 50, w = 140;
      const x = Math.cos(a) * d * 1.4, z = Math.sin(a) * d;
      ab.add(new THREE.ConeGeometry(w, h, 6).translate(x, h / 2, z), flat("#7a8fd0"));
      ab.add(new THREE.ConeGeometry(w * 0.42, h * 0.42, 6).translate(x, h - h * 0.21 + 0.4, z), flat("#f4f8ff"));
    }
    for (let i = 0; i < 30; i++) { const x = -80 + (i * 37) % 160, z = 30 + (i * 53) % 80; prop(ab, {} as Kit, "tree_cone", x, 0, z, 8 + (i % 4) * 2, i); }
    ab.build(this.alps);
    for (let i = 0; i < 5; i++) { const hb2 = new Batch(); house(hb2, -30 + i * 15, 40 + (i % 2) * 8, Math.PI, 8, 8, 6, (i * 3) % 8, 0); hb2.build(this.alps); }
    this.alps.position.set(...AUSTRIA); R.add(this.alps);

    // ---- falling snow (points around the camera) ----
    const N = 900; this.flakePos = new Float32Array(N * 3);
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(this.flakePos, 3));
    const dotT = ctex("flakeDot", 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.6, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    this.flakes = new THREE.Points(fg, new THREE.PointsMaterial({ map: dotT, size: 0.09, transparent: true, depthWrite: false, fog: false, color: "#ffffff" }));
    this.flakes.frustumCulled = false; this.flakes.layers.set(NOINK); R.add(this.flakes);
  }

  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) { const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1; fx += x / n; fz += z / n; }
    const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
    const az = THREE.MathUtils.degToRad(s.sunAz ?? L.az), el = THREE.MathUtils.degToRad(s.sunEl ?? L.el);
    const hx = fx * Math.cos(az) - fz * Math.sin(az), hz = fz * Math.cos(az) + fx * Math.sin(az);
    v = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el)).normalize();
    this.sunCache.set(id, v);
    return v;
  }
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(id: number, f: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const t = f / FPS, s = SHOTS[id - 1], L = LIGHTS[s.light], K = LOOK[s.light];
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1600; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "dusk") Rr = Math.max(Rr, 40);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear + 40; this.fog.far = L.fogFar + 420;
    scene.fog = this.fog; scene.background = null;
    this.sunDisc.visible = s.light === "dusk";
    if (this.sunDisc.visible) { this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900); this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7))); }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i]; m.position.x = Math.cos((i / 11) * Math.PI * 2 + 0.3) * (620 + (i % 3) * 60) + cam.position.x; m.position.z = Math.sin((i / 11) * Math.PI * 2 + 0.3) * (620 + (i % 3) * 60) + cam.position.z;
      m.lookAt(cam.position.x, m.position.y, cam.position.z); (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }

    // ---- what exists in which shot ----
    const summer = id === 17, flash = id === 3;
    this.snowG.visible = !summer; this.summerG.visible = summer;
    const melt = id === 17 ? (f < 1720 ? 0.55 + 0.1 * smooth((f - 1674) / 46) : 0.92) : 0;
    this.olympia.g.visible = !flash && id !== 15 && !(id === 17 && f >= 1720 && false);
    this.olympia.set(builtAt(id, t), melt);
    if (id === 17 && f >= 1720) { this.olympia.g.scale.set(0.2, 0.14, 0.2); } else this.olympia.g.scale.set(1, 1, 1);
    this.angus.g.visible = flash; this.angus.set(1, 0);
    this.austria.set(1, 0);
    if (this.austria.carrot) {
      const u = t - T_NOSE;
      const ny = olyCentres().y3 * 1.03 - OLY.r3 * 1.03 * 0.05;
      this.austria.carrot.position.y = u > 0 ? Math.max(0.3 - AUSTRIA[1], ny - 4.9 * u * u * 6) : ny;
      this.austria.carrot.rotation.x = u > 0 ? Math.min(1.4, u * 3) : 0;
    }
    this.crane.visible = id === 5 || id === 6 || id === 7 || id === 8 || id === 16;
    this.bucket.visible = this.cable.visible = id === 5;
    if (id === 5) {
      // bucket after bucket: swing in from the stockpile, tip at the top, swing back (time-lapse speeds the cycles up)
      const k = (t - T_TIMELAPSE[0]) / (T_TIMELAPSE[1] - T_TIMELAPSE[0]), cyc = (Math.max(0, t - 358 / FPS) * (0.5 + 2.5 * smooth(k))) % 1;
      const sw = Math.sin(cyc * Math.PI), top = olyCentres().y2 + 6 + 0 * builtAt(5, t);
      const hookX = CRANE[0] - 4 - 26 * sw, hookY = 50 - (50 - top) * sw - 30 * (1 - sw);
      this.bucket.position.set(hookX, hookY, CRANE[2]); this.bucket.rotation.z = sw > 0.95 ? (sw - 0.95) * 20 : 0;
      this.cable.position.set(hookX, 51.2 + CRANE[1], CRANE[2]); this.cable.scale.set(1, 51.2 - hookY, 1);
      this.crane.rotation.y = 0;
    }
    this.table.visible = id === 4;
    this.ribbon.visible = id === 10;
    { const cut = id === 10 && f > 1000; for (const n of ["ribL", "ribR"]) { const o = this.ribbon.getObjectByName(n)!; o.rotation.z = cut ? (n === "ribL" ? -1.2 : 1.2) * Math.min(1, (f - 1000) / 8) : 0; o.position.x = (n === "ribL" ? -2 : 2) + (cut ? (n === "ribL" ? -1.5 : 1.5) : 0); } }
    this.scaleP.visible = id === 9 && f >= 915;
    this.beach.visible = id === 14;
    this.castleDry.visible = id === 14 && f < 1430 && t < T_COLLAPSE;
    this.castleMound.visible = id === 14 && f < 1430 && t >= T_COLLAPSE;
    this.castleWet.visible = id === 14 && f >= 1430;
    if (this.castleMound.visible) { const u = Math.min(1, (t - T_COLLAPSE) / 0.25); this.castleMound.scale.set(0.6 + 0.4 * u, 1, 0.6 + 0.4 * u); }
    this.diag.visible = id === 12 || id === 13;
    this.alps.visible = this.austria.g.visible = id === 18;
    // falling snow around the camera (not in summer, on the beach or on the diagram stage)
    const snowing = !(id === 12 || id === 13 || id === 14 || id === 17);
    this.flakes.visible = snowing;
    if (snowing) {
      const P = this.flakePos, n = P.length / 3, B = 14, fall = id === 15 ? 0.4 : 1.1, wind = id === 15 ? 6 : 0.4;
      for (let i = 0; i < n; i++) {
        const x0 = (hh(i, 1) - 0.5) * 2 * B, z0 = (hh(i, 2) - 0.5) * 2 * B, y0 = hh(i, 3) * 2 * B;
        const x = ((x0 + wind * t + 0.3 * Math.sin(t * 1.3 + i)) % (2 * B) + 3 * B) % (2 * B) - B, y = ((y0 - fall * t) % (2 * B) + 2 * B) % (2 * B) - B * 0.6;
        P[i * 3] = cam.position.x + x; P[i * 3 + 1] = cam.position.y + y; P[i * 3 + 2] = cam.position.z + z0;
      }
      this.flakes.geometry.attributes.position.needsUpdate = true;
    }

    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const st = stage(id, t, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of st.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, kk] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, kk, p.draw);
      a.mesh.visible = true; a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      const sy = p.sy ?? 1;
      a.mesh.scale.set((p.mirror ? -sc2 : sc2) / Math.sqrt(sy), sc2 * sy, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(Math.abs(p.w), p.h)))) continue;
      const ef = this.fx(fi++);
      ef.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      ef.use(!!p.soft); ef.mesh.visible = true; ef.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) ef.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { ef.mesh.quaternion.copy(cam.quaternion); ef.mesh.rotateZ(p.rot ?? 0); }
      ef.mesh.scale.set(p.w, p.h, 1);
      fused.push(ef);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const ef of fused) ef.bind();
    void flat; void T_COLLAPSE;
    return focus;
  }
}
