// "Raining Whale": the whole place as one three.js scene. Sky, sea with a moving shoreline, the beach + dunes +
// crest plateau as one height field (lot asphalt and park lawn painted in by vertex colour), the whale, the dynamite
// pile, the highway truck and sign, the crowd's rope line, the TV tripod, the plunger, the cars in the lot, blubber
// chunks on their ballistic arcs, the imagined neat cubes, the 1979 row of whales, the 2020 park, a far headland
// with its lighthouse. update(id, f, camera) poses everything for shot `id` at frame f (pure function of id + f).
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Batch, V, lam, Kit, Ray, prop, setSight } from "./build";
import { ctex, rng, cloudHD, waterNear, waterFar } from "./paint";
import { Pen, fxWhaleSign } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, LFB, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage } from "./cast";
import {
  FPS, SHOTS, ShotDef, V3, camAt, groundY, lotK, SEA_Y, CREST, WHALE_L, CRATES, PLUNGER, TRUCK, SIGN, CAR, CAMSTAND, PARK, PACKET, CHUNKS, chunkAt,
  carChunkDrop, T_PUSH, T_BLAST, T_FLAT, T_STOMP, smooth, has, hh,
} from "./story";

export const loadKit = () => Promise.resolve({} as Kit);

// ---------------- painted textures ----------------
const repT = (t: THREE.Texture) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.needsUpdate = true; return t; };
const sandTex = () => repT(ctex("sandHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 9000; i++) { const v = 0.86 + r() * 0.2; g.fillStyle = `rgba(${Math.round(200 * v)},${Math.round(185 * v)},${Math.round(160 * v)},0.35)`; g.fillRect(r() * 1024, r() * 1024, 2 + r() * 3, 2 + r() * 2); }
  g.strokeStyle = "rgba(150,120,80,0.16)"; g.lineWidth = 3;
  for (let k = 0; k < 26; k++) { const y = r() * 1024; g.beginPath(); for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + 9 * Math.sin(x * 0.02 + k)); g.stroke(); }
}));
const whaleTex = () => ctex("whaleHD", 1024, 512, (g, r) => {
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#56607a"); gr.addColorStop(0.55, "#5d6680"); gr.addColorStop(0.72, "#7d8496"); gr.addColorStop(1, "#a7abb6");
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "rgba(30,34,52,0.22)"; g.lineWidth = 3; g.lineCap = "round";
  for (let k = 0; k < 140; k++) { const x = r() * 1024, y = 40 + r() * 300, l = 20 + r() * 50; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + 6 * (r() - 0.5), x + l, y); g.stroke(); }
  g.fillStyle = "rgba(235,235,240,0.5)";
  for (let k = 0; k < 40; k++) { g.beginPath(); g.ellipse(r() * 1024, 60 + r() * 220, 6 + r() * 12, 3 + r() * 5, r() * 3, 0, Math.PI * 2); g.fill(); } // scars
});
const crateTex = () => ctex("crateHD", 512, 256, (g, r) => {
  g.fillStyle = "#c99a5d"; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = "#8a6438"; g.lineWidth = 6;
  for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  for (let k = 0; k < 40; k++) { g.strokeStyle = "rgba(120,80,40,0.25)"; g.lineWidth = 2; const y = r() * 256; g.beginPath(); g.moveTo(r() * 512, y); g.lineTo(r() * 512, y + 2); g.stroke(); }
  g.fillStyle = "#c9373a"; g.fillRect(0, 104, 512, 48);
  g.strokeStyle = "#3a2418"; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
});
const foamTex = () => repT(ctex("foam", 512, 128, (g) => {
  g.clearRect(0, 0, 512, 128); g.fillStyle = "rgba(255,255,255,0.95)";
  g.beginPath(); g.moveTo(0, 128);
  for (let x = 0; x <= 512; x += 8) g.lineTo(x, 56 + 14 * Math.sin(x * 0.049) + 8 * Math.sin(x * 0.13));
  g.lineTo(512, 128); g.closePath(); g.fill();
  g.fillStyle = "rgba(255,255,255,0.6)";
  for (let x = 0; x < 512; x += 22) { g.beginPath(); g.ellipse(x + 8, 40 + 10 * Math.sin(x), 7, 4, 0, 0, Math.PI * 2); g.fill(); }
}));
const signTex = (kind: "diamond" | "park") => ctex("sign" + kind, 512, kind === "diamond" ? 512 : 352, (g) => fxWhaleSign(new Pen(g), kind));

// ---------------- geometry ----------------
const smooth01 = (x: number) => smooth(x);
/** the sperm whale: unit sphere stretched along x, boxy blunt head, tapering tail, flat belly on the sand */
const whaleBody = () => {
  const g = new THREE.SphereGeometry(1, 72, 36);
  const p = g.attributes.position as THREE.BufferAttribute, half = WHALE_L / 2 - 0.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = x; // -1 tail .. +1 head
    const head = smooth01((u - 0.05) / 0.4);
    const taper = 0.22 + 0.78 * smooth01((u + 1.0) / 0.95);
    const H = 1.45 * taper * (0.9 + 0.12 * head), Wd = 1.25 * taper * (0.92 + 0.12 * head);
    const ang = Math.atan2(y, z), n = 2 + 2.2 * head;
    const box = Math.pow(Math.abs(Math.cos(ang)) ** n + Math.abs(Math.sin(ang)) ** n, -1 / n);
    const k = 1 + (box - 1) * head, r = Math.hypot(y, z);
    let Y = y * H * k, Z = z * Wd * k;
    const X = (u > 0 ? Math.pow(u, 0.5 + 0.1 * (1 - r)) : -Math.pow(-u, 0.95)) * half;
    Y = Math.max(Y, -0.55 * H) + 0.55 * H;
    // a slight hump two thirds back
    Y += 0.18 * Math.exp(-(((u + 0.35) / 0.12) ** 2)) * Math.max(0, y);
    p.setXYZ(i, X, Y, Z);
    void r;
  }
  g.computeVertexNormals();
  return g;
};
const flukes = () => {
  const g = new THREE.SphereGeometry(1, 24, 12);
  g.scale(1.1, 0.14, 1.9);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), x = p.getX(i); p.setX(i, x - 0.6 * (Math.abs(z) / 1.9) ** 1.5); }
  g.translate(-WHALE_L / 2 - 0.4, 0.28, 0);
  g.computeVertexNormals();
  return g;
};
const lump = (seed: number) => {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position as THREE.BufferAttribute, r = rng(seed);
  const bumps = Array.from({ length: 6 }, () => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, 0.15 + r() * 0.2]);
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    let k = 1;
    for (const [a, b, c, s] of bumps) k += s * Math.max(0, v.dot(V(a, b, c).normalize())) ** 3;
    p.setXYZ(i, v.x * k * 1.2, v.y * k * 0.8, v.z * k);
  }
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (r: number, h: number, x: number, y: number, z: number, axis: "x" | "y" | "z" = "y", seg = 16) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2); if (axis === "z") g.rotateX(Math.PI / 2);
  return g.translate(x, y, z);
};
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, shadow = true) => {
  const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; parent.add(o); return o;
};
const flat = (col: string) => lam("c" + col, () => ({ color: col }));

/** a 1970 sedan (local +x forward), base on y = 0; returns the cabin so it can be crushed */
const sedan = (col: string) => {
  const g = new THREE.Group(), paint = flat(col), chrome = flat("#d8dbe0"), glass = flat("#5b6f8f"), tyre = flat("#26262c"), lamp = flat("#fff4c8");
  mesh(box(4.9, 0.62, 1.95, 0, 0.62, 0), paint, g);
  const cabin = new THREE.Group(); cabin.position.set(-0.3, 0.93, 0); g.add(cabin);
  mesh(box(2.5, 0.6, 1.75, 0, 0.3, 0), paint, cabin);
  mesh(box(2.3, 0.44, 1.78, 0, 0.3, 0), glass, cabin);
  mesh(box(2.56, 0.08, 1.8, 0, 0.62, 0), paint, cabin);
  for (const sx of [-1, 1]) mesh(box(0.2, 0.18, 2.0, sx * 2.5, 0.42, 0), chrome, g);
  for (const sz of [-1, 1]) for (const sx of [-1.5, 1.5]) mesh(cyl(0.34, 0.24, sx, 0.34, sz * 0.92, "z"), tyre, g);
  for (const sz of [-0.62, 0.62]) mesh(cyl(0.12, 0.06, 2.46, 0.66, sz, "x"), lamp, g, false);
  return { g, cabin };
};
const truck = () => {
  const g = new THREE.Group(), orange = flat("#e8892c"), white = flat("#f1efe6"), tyre = flat("#26262c"), glass = flat("#5b6f8f"), dark = flat("#4a4d57");
  mesh(box(2.2, 1.6, 2.3, 2.4, 1.45, 0), orange, g);
  mesh(box(2.24, 0.6, 2.0, 2.45, 1.85, 0), glass, g);
  mesh(box(4.6, 0.3, 2.4, -1.1, 0.95, 0), dark, g);
  for (const sz of [-1, 1]) mesh(box(4.6, 0.6, 0.1, -1.1, 1.35, sz * 1.15), orange, g);
  mesh(box(0.1, 0.6, 2.4, -3.35, 1.35, 0), orange, g);
  mesh(box(2.24, 0.14, 2.34, 2.4, 1.0, 0), white, g);
  for (const sz of [-1, 1]) for (const sx of [-2.2, 2.4]) mesh(cyl(0.45, 0.32, sx, 0.45, sz * 1.08, "z"), tyre, g);
  mesh(cyl(0.12, 0.25, 2.6, 2.4, 0, "y"), flat("#ffb02e"), g, false); // beacon
  return g;
};

/** every lens position of the film looking at its subject (props in front of it are left out) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) for (let f = s.a - 8; f < s.b + 8; f += 3) {
    const c = camAt(s.id, Math.max(0, Math.min(2085, f))), o = V(...c.pos), look = V(...c.look);
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
  private WU: Record<string, THREE.IUniform>;
  private sunDisc: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<"day" | "golden", THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private foam: THREE.Mesh;
  private whale = new THREE.Group(); private crater: THREE.Mesh; private crates = new THREE.Group();
  private chunks: THREE.InstancedMesh; private carChunk: THREE.Mesh;
  private plungerH = new THREE.Group(); private plunger = new THREE.Group();
  private truckG: THREE.Group; private signG = new THREE.Group(); private press = new THREE.Group(); private rope = new THREE.Group();
  private cars: { g: THREE.Group; cabin: THREE.Group }[] = []; private myCar: { g: THREE.Group; cabin: THREE.Group };
  private cubes: THREE.InstancedMesh; private pod: THREE.InstancedMesh; private podF: THREE.InstancedMesh;
  private park = new THREE.Group(); private packet: THREE.Mesh;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(_kit: Kit) {
    const R = this.root;
    setSight(sightLines());
    // ---- sky + light (as the bridge short) ----
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el)); gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1100, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK);
    R.add(this.sky);
    const disc = ctex("sunDisc", 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: disc, color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunDisc.frustumCulled = false; this.sunDisc.layers.set(NOINK); this.sunDisc.renderOrder = -0.5; R.add(this.sunDisc);
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(4096, 4096);
    R.add(this.hemi, this.sun, this.sun.target);
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)) };
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3, d = 620 + (i % 3) * 60;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      const w = 140 + (i % 4) * 30;
      m.position.set(Math.cos(a) * d, 110 + (i % 4) * 34, Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.layers.set(NOINK); this.clouds.push(m); R.add(m);
    }

    // ---- ground: one height field, vertex colours for wet sand / lot / park / dune grass ----
    const gw = 520, gd = 340, nx = 260, nz = 170;
    const gg = new THREE.PlaneGeometry(gw, gd, nx, nz); gg.rotateX(-Math.PI / 2); gg.translate(-40, 0, -140);
    const gp = gg.attributes.position as THREE.BufferAttribute, uv = gg.attributes.uv as THREE.BufferAttribute, cols: number[] = [];
    const cSand = new THREE.Color("#ead6a6"), cWet = new THREE.Color("#c4a878"), cDune = new THREE.Color("#e2cf9c"), cLot = new THREE.Color("#7b7774"), cLawn = new THREE.Color("#7bb55a"), cGrass = new THREE.Color("#b9b77a");
    const tmp = new THREE.Color();
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i), y = groundY(x, z);
      gp.setY(i, y); uv.setXY(i, x / 7, z / 7);
      tmp.copy(cSand);
      if (z > 13) tmp.lerp(cWet, smooth((z - 13) / 6));
      if (z < -34) tmp.lerp(cDune, 0.6).lerp(cGrass, 0.35 * smooth((-34 - z) / 20) * (0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.21)));
      const lot = Math.min(x + 34, 18 - x, z + 88, -64 - z), park = Math.min(x + 58, -26 - x, z + 92, -64 - z);
      if (lot > -0.5) tmp.lerp(cLot, smooth((lot + 0.5) / 1.2));
      if (park > -0.5) tmp.lerp(cLawn, smooth((park + 0.5) / 1.5));
      cols.push(tmp.r, tmp.g, tmp.b);
    }
    gg.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    gg.computeVertexNormals();
    const groundM = lam("groundV", () => ({ map: sandTex(), vertexColors: true }));
    const ground = new THREE.Mesh(gg, groundM); ground.receiveShadow = true; R.add(ground);
    // far headland to the north with its lighthouse on the point
    const hb = new Batch();
    const hill = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2); hill.scale(110, 70, 260);
    hb.add(hill, flat("#5e9a4c"), new THREE.Matrix4().makeTranslation(-250, -6, 190));
    hb.add(new THREE.CylinderGeometry(2.2, 2.8, 14, 16).translate(-182, 51, 105), flat("#f4f1ea"));
    hb.add(new THREE.CylinderGeometry(2.4, 2.4, 3, 16).translate(-182, 59.5, 105), flat("#2b2b33"));
    hb.add(new THREE.ConeGeometry(2.8, 2.5, 16).translate(-182, 62.2, 105), flat("#c9373a"));
    hb.add(box(9, 5, 7, -170, 38.5, 102), flat("#f4f1ea")); hb.add(new THREE.ConeGeometry(6.5, 3.5, 4).rotateY(Math.PI / 4).translate(-170, 42.7, 102), flat("#c9373a"));
    // dune grass + shrubs (cartoon vegetation; left out where a lens looks through them)
    const r = rng(7);
    for (let i = 0; i < 220; i++) {
      const x = -150 + r() * 260, z = -30 - r() * 80;
      if (lotK(x, z) > 0.1) continue;
      if (z < -54 && z > -66 && x > -24 && x < 22) continue; // crowd on the crest
      prop(hb, {} as Kit, r() < 0.7 ? "plant_bush" : "plant_bushDetailed", x, groundY(x, z) - 0.1, z, 0.6 + r() * 0.9, r() * 6);
    }
    for (let i = 0; i < 26; i++) { // shore pines on the plateau behind the lot
      const x = -120 + r() * 200, z = -96 - r() * 50;
      prop(hb, {} as Kit, r() < 0.5 ? "tree_cone" : "tree_oak", x, groundY(x, z) - 0.2, z, 8 + r() * 6, r() * 6);
    }
    hb.build(R);

    // ---- sea: the river shader of the bridge short, waves rolling toward the beach ----
    const wNear = waterNear(), wFar = waterFar();
    for (const t of [wNear, wFar]) { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; t.needsUpdate = true; }
    this.WU = {
      wNearC: { value: new THREE.Color() }, wMidC: { value: new THREE.Color() }, wFarC: { value: new THREE.Color() },
      wCrest: { value: new THREE.Color() }, wTrough: { value: new THREE.Color() }, wGlint: { value: new THREE.Color() },
      wShade: { value: new THREE.Vector3(0.5, 0.56, 0.72) }, wNearTex: { value: wNear }, wFarTex: { value: wFar }, wTime: { value: 0 },
    };
    const waterM = new THREE.MeshLambertMaterial({ color: 0xffffff });
    waterM.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.WU);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", WATER_DECL).replace("#include <map_fragment>", WATER_COL)
        .replace("#include <lights_fragment_begin>", "float sunVis = 1.0;\n" + LFB)
        .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\n  reflectedLight.directDiffuse = diffuseColor.rgb * mix(wShade, vec3(1.0), sunVis);\n  reflectedLight.indirectDiffuse = vec3(0.0);");
    };
    waterM.customProgramCacheKey = () => "sea1";
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1200).rotateX(-Math.PI / 2).translate(0, SEA_Y, 620), waterM);
    sea.receiveShadow = true; R.add(sea);
    const foamM = new THREE.MeshBasicMaterial({ map: foamTex(), transparent: true, depthWrite: false, color: new THREE.Color(1.15, 1.15, 1.15) });
    this.foam = new THREE.Mesh(new THREE.PlaneGeometry(900, 3.5).rotateX(-Math.PI / 2), foamM);
    this.foam.layers.set(NOINK); R.add(this.foam);
    (foamM.map as THREE.Texture).repeat.set(70, 1);

    // ---- the whale ----
    const whaleM = lam("whaleM", () => ({ map: whaleTex() }));
    const body = whaleBody(), fl = flukes();
    mesh(body, whaleM, this.whale); mesh(fl, whaleM, this.whale);
    const eyeM = flat("#1d1b22");
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.11, 12, 8).translate(3.9, 0.95, s * 1.08), eyeM, this.whale, false);
    mesh(box(3.6, 0.07, 0.06, 4.9, 0.32, -1.02).rotateY(0.02), eyeM, this.whale, false);
    R.add(this.whale);
    this.crater = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flat("#9a7d58"));
    this.crater.scale.set(4.5, 1, 3.2); this.crater.position.set(-1, 0.03, -2.6); this.crater.receiveShadow = true; R.add(this.crater);
    // the dynamite pile: 20 cases stacked in three rows against the landward flank
    const crateM = lam("crate", () => ({ map: crateTex() }));
    let n = 0;
    for (let row = 0; row < 3 && n < 20; row++) for (let k = 0; k < 8 - row && n < 20; k++, n++) {
      const g = box(0.62, 0.36, 0.42, CRATES[0] + (k - (7 - row) / 2) * 0.66 + row * 0.1, 0.18 + row * 0.37, CRATES[2] + row * 0.22 + (k % 2) * 0.05);
      g.rotateY(0); mesh(g, crateM, this.crates);
    }
    R.add(this.crates);
    // the plunger box (T handle rides down on "pushed")
    mesh(box(0.5, 0.4, 0.34, 0, 0.2, 0), flat("#8a5a34"), this.plunger);
    mesh(cyl(0.025, 0.55, 0, 0.45, 0), flat("#3a3d47"), this.plungerH); mesh(cyl(0.035, 0.46, 0, 0.72, 0, "x"), flat("#3a3d47"), this.plungerH);
    this.plunger.add(this.plungerH);
    this.plunger.position.set(PLUNGER[0], groundY(PLUNGER[0], PLUNGER[2]), PLUNGER[2]); R.add(this.plunger);
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(PLUNGER[0], groundY(PLUNGER[0], PLUNGER[2]) + 0.1, PLUNGER[2]),
      V(6, groundY(6, -25) + 0.03, -25), V(2, 0.04, -10), V(CRATES[0] + 1.5, 0.05, CRATES[2] - 0.4)]), 64, 0.025, 5), flat("#2b2b33"));
    R.add(wire);
    // the highway truck, the highway "whale crossing" sign
    this.truckG = truck(); this.truckG.position.set(TRUCK[0], groundY(TRUCK[0], TRUCK[2]), TRUCK[2]); this.truckG.rotation.y = 0.5; R.add(this.truckG);
    const postM = flat("#8d949c");
    mesh(box(0.1, 2.2, 0.1, 0, 1.1, 0), postM, this.signG);
    const dia = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: signTex("diamond"), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xe6e6e6 }));
    dia.position.set(0, 1.95, -0.07); dia.rotation.y = Math.PI; dia.layers.set(NOINK); this.signG.add(dia);
    mesh(box(0.8, 0.8, 0.04, 0, 1.95, 0).rotateZ(0), postM, this.signG).rotation.z = Math.PI / 4;
    this.signG.children[2].position.set(0, 1.95, 0); (this.signG.children[2] as THREE.Mesh).geometry = new THREE.BoxGeometry(0.78, 0.78, 0.04);
    this.signG.position.set(SIGN[0], groundY(SIGN[0], SIGN[2]), SIGN[2]); this.signG.rotation.y = 0.35; R.add(this.signG);
    // rope line on the crest + the TV tripod
    const ropeM = flat("#d9c79a"), woodM = flat("#8a5a34");
    for (let x = -21; x <= 21; x += 3) mesh(box(0.08, 1.0, 0.08, x, groundY(x, -55.5) + 0.5, -55.5), woodM, this.rope);
    for (let x = -21; x < 21; x += 3) {
      const a = V(x, groundY(x, -55.5) + 0.9, -55.5), b = V(x + 3, groundY(x + 3, -55.5) + 0.9, -55.5), m = a.clone().add(b).multiplyScalar(0.5).add(V(0, -0.15, 0));
      this.rope.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 8, 0.018, 4), ropeM));
    }
    R.add(this.rope);
    const ty = groundY(CAMSTAND[0], CAMSTAND[2]);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const leg = new THREE.Mesh(cyl(0.025, 1.45, 0, 0, 0), flat("#3a3d47")); leg.position.set(CAMSTAND[0] + Math.cos(a) * 0.3, ty + 0.68, CAMSTAND[2] + Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); this.press.add(leg); }
    mesh(box(0.6, 0.36, 0.3, CAMSTAND[0], ty + 1.55, CAMSTAND[2]), flat("#3a3d47"), this.press);
    mesh(cyl(0.1, 0.25, CAMSTAND[0], ty + 1.55, CAMSTAND[2] + 0.25, "z"), flat("#22242a"), this.press);
    R.add(this.press);
    // the lot: the warner's new car (mint), four others
    const lotCars: [number, number, string, number][] = [[CAR[0], CAR[2], "#7fc8b0", 0.0], [-13, -73.5, "#c9773a", 0.05], [3.5, -74.4, "#3f6fb5", -0.04], [9.5, -73.8, "#d9b44a", 0.02], [-18.5, -79, "#8c3b4a", 0.1], [9.5, -80.5, "#e8e3d4", 0]];
    for (const [x, z, c, yaw] of lotCars) {
      const s = sedan(c); s.g.position.set(x, groundY(x, z), z); s.g.rotation.y = Math.PI / 2 + yaw; R.add(s.g); this.cars.push(s);
    }
    this.myCar = this.cars[0];
    this.packet = new THREE.Mesh(box(0.16, 0.025, 0.1, 0, 0.0125, 0), flat("#d02a1e"));
    this.packet.position.set(PACKET[0], groundY(PACKET[0], PACKET[2]), PACKET[2]); R.add(this.packet);
    // blubber
    const blubM = lam("blubber", () => ({ color: "#c99d90" }));
    this.chunks = new THREE.InstancedMesh(lump(3), blubM, CHUNKS.length); this.chunks.castShadow = true; this.chunks.receiveShadow = true; this.chunks.frustumCulled = false; R.add(this.chunks);
    this.carChunk = mesh(lump(9).scale(1.1, 0.9, 1.0), blubM, R);
    // the imagined neat cubes (shot 12): the whale's volume as a grid of little boxes
    const cells: THREE.Vector3[] = [];
    const ray = new THREE.Raycaster(), wmesh = this.whale.children[0] as THREE.Mesh;
    body.computeBoundingBox();
    const wmat = wmesh.material as THREE.Material, side0 = wmat.side; wmat.side = THREE.DoubleSide; wmesh.updateMatrixWorld(true);
    for (let x = -6.3; x <= 6.4; x += 0.62) for (let y = 0.3; y <= 2.9; y += 0.62) for (let z = -1.5; z <= 1.5; z += 0.62) {
      ray.set(V(x, y, -5), V(0, 0, 1));
      const hits = ray.intersectObject(wmesh, false).map((h) => h.point.z);
      if (hits.length >= 2 && z > Math.min(...hits) + 0.1 && z < Math.max(...hits) - 0.1) cells.push(V(x, y, z));
    }
    wmat.side = side0;
    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), lam("cubeM", () => ({ color: "#5d6680" })), Math.max(1, cells.length));
    cells.forEach((c, i) => this.cubes.setMatrixAt(i, this.m4.makeTranslation(c.x, c.y, c.z)));
    this.cubes.castShadow = true; this.cubes.receiveShadow = true; this.cubes.frustumCulled = false; R.add(this.cubes);
    // 1979: forty-one whales along the beach
    this.pod = new THREE.InstancedMesh(body, whaleM, 41); this.podF = new THREE.InstancedMesh(fl, whaleM, 41);
    for (let i = 0; i < 41; i++) {
      const x = -150 + i * 5.6 + (hh(i, 1) - 0.5) * 2, z = 2 + (hh(i, 2) - 0.5) * 8 + (i % 2) * 3, s = 0.72 + 0.28 * hh(i, 3);
      this.m4.compose(V(x, groundY(x, z) - 0.05, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 1.2 + (hh(i, 4) - 0.5) * 1.2), V(s, s, s));
      this.pod.setMatrixAt(i, this.m4); this.podF.setMatrixAt(i, this.m4);
    }
    for (const m of [this.pod, this.podF]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; R.add(m); }
    // 2020: the memorial park: bench, picture sign on two posts, a few trees
    const pb = new Batch(), py = groundY(PARK[0], PARK[2]);
    pb.add(box(1.8, 0.08, 0.5, PARK[0] + 0.9, py + 0.48, PARK[2] + 0.7), woodM); pb.add(box(1.8, 0.4, 0.07, PARK[0] + 0.9, py + 0.78, PARK[2] + 1.0), woodM);
    for (const sx of [-0.8, 0.8]) pb.add(box(0.08, 0.48, 0.45, PARK[0] + 0.9 + sx, py + 0.24, PARK[2] + 0.7), flat("#3a3d47"));
    for (const sx of [-0.85, 0.85]) pb.add(box(0.12, 2.6, 0.12, PARK[0] - 1.2 + sx, py + 1.3, PARK[2] + 0.9), woodM);
    pb.add(box(2.0, 1.4, 0.08, PARK[0] - 1.2, py + 1.95, PARK[2] + 0.95), woodM);
    for (const [x, z, h] of [[PARK[0] - 6, PARK[2] + 5, 7], [PARK[0] + 7, PARK[2] + 6, 8], [PARK[0] - 9, PARK[2] - 4, 6]] as const) prop(pb, {} as Kit, "tree_oak", x, groundY(x, z) - 0.1, z, h);
    pb.build(this.park);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.28), new THREE.MeshBasicMaterial({ map: signTex("park"), color: 0xe6e6e6 }));
    face.position.set(PARK[0] - 1.2, py + 1.95, PARK[2] + 0.9); face.rotation.y = Math.PI; face.layers.set(NOINK); this.park.add(face);
    R.add(this.park);
  }

  /** camera-relative sun, frozen per shot */
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
    const t = f / FPS, s = SHOTS[id - 1], tau = s.tau(t), L = LIGHTS[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.15; cam.far = 1500; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const K = LOOK[s.light], sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 95);
    if (s.light === "golden") Rr = Math.max(Rr, 40);
    this.sun.position.copy(focus).addScaledVector(sunDir, 220); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 480; sc.updateProjectionMatrix();
    this.sun.shadow.bias = L.bias; this.sun.shadow.normalBias = L.normalBias * (Rr / 12);
    TONE.uLitCol.value.set(...L.lit); TONE.uShadeCol.value.set(...L.shade); TONE.uShadeLift.value.set(...L.lift);
    TONE.uLambert.value = L.lambert; TONE.uSideK.value = L.sideK; TONE.uTerm.value = L.term; TONE.uBounce.value.set(...K.bounce); TONE.uSat.value = K.sat;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    // ---- sky, fog, sun, clouds ----
    const su = this.skyMat.uniforms;
    K.sky.c.forEach((h, i) => untone(h, su["c" + i].value));
    const e = K.sky.e.map((deg) => THREE.MathUtils.degToRad(deg));
    su.e.value.set(e[1], e[2], e[3], e[4]);
    this.sky.position.copy(cam.position);
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear + 20; this.fog.far = L.fogFar + 140;
    scene.fog = this.fog; scene.background = null;
    this.sunDisc.visible = s.light === "golden";
    if (this.sunDisc.visible) { this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900); this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(1.7))); }
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i]; m.lookAt(cam.position.x, m.position.y, cam.position.z); (m.material as THREE.MeshBasicMaterial).map = this.cloudMaps[s.light][i % 4];
    }
    // ---- sea + shoreline ----
    const W = this.WU, wc = K.water;
    untone(wc.near, W.wNearC.value); untone(wc.mid, W.wMidC.value); untone(wc.far, W.wFarC.value);
    untone(wc.crest, W.wCrest.value); untone(wc.trough, W.wTrough.value); untone(wc.glint, W.wGlint.value);
    W.wShade.value.set(...wc.shade); W.wTime.value = t;
    const surge = 1.2 * Math.sin(t * 0.9);
    this.foam.position.set(0, SEA_Y + 0.03 + 0.045 * Math.max(0, -surge), 27.8 - surge);
    (this.foam.material as THREE.MeshBasicMaterial).map!.offset.set(t * 0.01, 0);

    // ---- props by beat ----
    const blasted = tau >= T_BLAST && id < 16;
    const neat = id === 12 && f < 1350;
    this.whale.visible = id !== 16 && id !== 17 && !neat;
    this.cubes.visible = neat;
    this.crater.visible = blasted && id !== 13;
    this.crates.visible = !blasted && id <= 12 && !neat;
    this.pod.visible = this.podF.visible = id === 16;
    this.park.visible = id === 17;
    this.truckG.visible = id <= 15;
    this.signG.visible = id <= 15;
    this.rope.visible = this.press.visible = id >= 5 && id <= 14;
    this.plunger.visible = id >= 4 && id <= 14;
    const k = smooth((t - (T_PUSH - 0.05)) / (T_BLAST - T_PUSH));
    this.plungerH.position.y = id === 7 ? -0.3 * k : id > 7 ? -0.3 : 0;
    for (const car of this.cars) car.g.visible = id <= 15;
    const crushed = (id === 11 && t >= T_FLAT) || id === 13 || id === 14 || id === 15;
    this.myCar.cabin.scale.y = crushed ? 0.28 : 1; this.myCar.cabin.position.y = crushed ? 0.82 : 0.93;
    this.myCar.g.children[0].scale.y = crushed ? 0.75 : 1;
    this.packet.visible = id === 13;
    this.packet.scale.y = id === 13 && t >= T_STOMP ? 0.3 : 1;
    // the chunk that lands on the new car (shot 11 on), resting on the roof afterwards
    const cy = groundY(CAR[0], CAR[2]);
    this.carChunk.visible = id === 11 || id === 13;
    this.carChunk.position.set(CAR[0] - 0.3, cy + (crushed ? 1.5 : 2.0) + (id === 11 ? carChunkDrop(t) : 0), CAR[2]);
    this.carChunk.rotation.set(0.3, 0.6 + (id === 11 ? (T_FLAT - t) * 2 : 0), 0.1);
    // blubber in flight / on the ground
    let ni = 0;
    if (blasted && id !== 13 && id !== 17) for (const ch of CHUNKS) {
      const p = chunkAt(ch, tau);
      if (!p) continue;
      this.m4.compose(V(...p.p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rot)), V(ch.s, ch.s * (p.landed ? 0.7 : 1), ch.s));
      this.chunks.setMatrixAt(ni++, this.m4);
    }
    this.chunks.count = ni; this.chunks.instanceMatrix.needsUpdate = true;

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
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc2 : sc2, sc2, sc2);
      a.mesh.castShadow = L.actorShadow;
      used.push(a);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    let fi = 0;
    const fused: Fx[] = [];
    for (const p of st.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const ef = this.fx(fi++);
      ef.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      ef.use(!!p.soft);
      ef.mesh.visible = true;
      ef.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) ef.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { ef.mesh.quaternion.copy(cam.quaternion); ef.mesh.rotateZ(p.rot ?? 0); }
      ef.mesh.scale.set(p.w, p.h, 1);
      fused.push(ef);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const ef of fused) ef.bind();
    void has; void CREST;
    return focus;
  }
}

const WATER_DECL = `#include <common>
varying vec3 vWP;
uniform vec3 wNearC, wMidC, wFarC, wCrest, wTrough, wGlint, wShade;
uniform sampler2D wNearTex, wFarTex;
uniform float wTime;`;
const WATER_COL = `
  vec3 wV = vWP - cameraPosition;
  float wd = length(wV);
  float wDep = asin(clamp(-wV.y / wd, 0.0, 1.0));
  float wf = 1.0 - smoothstep(0.0, 0.42, wDep);
  vec3 wc = mix(mix(wNearC, wMidC, smoothstep(0.0, 0.55, wf)), wFarC, smoothstep(0.55, 1.0, wf));
  vec2 wp = vWP.xz + vec2(0.1 * wTime, -0.9 * wTime);   // swell rolling in toward the beach (-z)
  vec4 mk = mix(texture2D(wNearTex, wp / 8.0), texture2D(wFarTex, wp / 40.0 + 0.37), smoothstep(25.0, 90.0, wd));
  wc = mix(wc, wTrough, mk.g * 0.6);
  wc = mix(wc, wCrest, mk.r * 0.7);
  wc = mix(wc, wGlint, mk.b * (0.3 + 0.5 * wf));
  float shore = smoothstep(36.0, 28.0, vWP.z);
  wc = mix(wc, wCrest, 0.45 * shore);
  diffuseColor.rgb = wc;`;
