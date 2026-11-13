// Scenery of "The Tower That Cooked a Car": the curved glass tower (concave south face, wider at the top, sky garden
// crown), the City street (office blocks with painted facades, pavements, lamps, plaza), the parked car (procedural,
// meltable), a bike, the sunshade fins + cradle, the award podium, and three far-away sets: the explanation back
// street (flat / curved shop window), the park, and the Las Vegas hotel with its pool. All painted + two-tone lit.
import * as THREE from "three";
import { Batch, V, lam, boxGeo, quad, house, prop, inTheWay, setSight, Ray, Kit, roofMat } from "./build";
import { ctex, rep, rng, facadeHD, stoneHD, cobbleHD, grassHD, jit } from "./paint";
import { twoTone } from "./shade";
import { TOWER_Z, CAR, BIKE, SHOP, LAB, PARK, PODIUM, VEGAS, V3 } from "./story";

// ---------------- tower shape ----------------
export const TH = 160;
const wAt = (y: number) => 38 + 26 * (y / TH) ** 1.4;               // width grows with height
const zfAt = (y: number) => TOWER_Z + 13 * (y / TH) ** 1.7;           // south face leans out over the street
const CONC = 4.2;                                                    // horizontal concavity of the south face (m)
const DEPTH = 30;
/** a point on the south face: s in -1..1 across, y up */
export const towerFace = (s: number, y: number): V3 => {
  const w = wAt(y);
  return [s * w / 2, y, zfAt(y) - CONC * (1 - s * s)];
};
/** outward (south) normal of the face near (s, y) */
export const towerNormal = (s: number, y: number): V3 => {
  const a = towerFace(s - 0.01, y), b = towerFace(s + 0.01, y), c = towerFace(s, y + 0.5);
  const u = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), v = V(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const n = u.cross(v).normalize();
  return [n.x, n.y, n.z];
};

const glassTex = (key: string, base: string, sky: string, frame: string) => ctex("glass" + key, 512, 512, (g, r) => {
  // 4 panes x 4 floors per tile: pane 1.5 m wide, floor 3.6 m; sky reflections as soft diagonal bands
  const gr = g.createLinearGradient(0, 0, 512, 512);
  gr.addColorStop(0, sky); gr.addColorStop(0.5, base); gr.addColorStop(1, sky);
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) { // per-pane tint jitter
    const x = (i % 4) * 128, y = Math.floor(i / 4) * 128;
    g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "20,40,70"},${(0.04 + r() * 0.08).toFixed(3)})`; g.fillRect(x, y, 128, 128);
  }
  g.fillStyle = "rgba(255,255,255,0.18)";
  for (const o of [60, 300]) { g.beginPath(); g.moveTo(o, 0); g.lineTo(o + 70, 0); g.lineTo(o - 190, 512); g.lineTo(o - 260, 512); g.closePath(); g.fill(); }
  g.fillStyle = frame;
  for (let k = 0; k < 4; k++) { g.fillRect(k * 128, 0, 7, 512); g.fillRect(0, k * 128, 512, 10); }
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let k = 0; k < 4; k++) g.fillRect(0, k * 128 + 10, 512, 3);
});
const glassMat = (key: string, base: string, sky: string, frame: string) => {
  const m = twoTone(new THREE.MeshPhongMaterial({ map: glassTex(key, base, sky, frame), specular: "#cfe0f0", shininess: 70, side: THREE.DoubleSide }), 0.5);
  return m;
};

/** grid surface from a param function (i across, j up), uv in metres / tile size */
const sheet = (nx: number, ny: number, at: (u: number, v: number) => V3, tileU: number, tileV: number, flip = false) => {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= ny; j++) {
    let s = 0, prev: V3 | null = null;
    for (let i = 0; i <= nx; i++) {
      const p = at(i / nx, j / ny);
      if (prev) s += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
      prev = p;
      pos.push(...p); uv.push(s / tileU, p[1] / tileV);
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 2, d = a + nx + 1;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
};

export const buildTower = (root: THREE.Object3D) => {
  const glass = glassMat("tower", "#5f8fb8", "#b9d4ea", "#3a4656");
  const NX = 28, NY = 40, grp = new THREE.Group();
  const back = (u: number, v: number): V3 => { const y = v * TH, w = wAt(y); return [(u * 2 - 1) * w / 2, y, TOWER_Z - DEPTH + 2 * (1 - (u * 2 - 1) ** 2)]; };
  const parts = [
    sheet(NX, NY, (u, v) => towerFace(u * 2 - 1, v * TH), 6, 14.4),
    sheet(NX, NY, back, 6, 14.4, true),
    sheet(8, NY, (u, v) => { const y = v * TH, f = towerFace(-1, y), b = back(0, v); return [f[0], y, f[2] + (b[2] - f[2]) * u]; }, 6, 14.4, true),
    sheet(8, NY, (u, v) => { const y = v * TH, f = towerFace(1, y), b = back(1, v); return [f[0], y, f[2] + (b[2] - f[2]) * u]; }, 6, 14.4),
  ];
  for (const g of parts) { const m = new THREE.Mesh(g, glass); m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  // roof + sky garden crown (green-tinted glass box with a curved top), lobby band at the foot
  const crown = glassMat("crown", "#7fae9a", "#d4ece2", "#3a4a46");
  const top = sheet(NX, 6, (u, v) => { const f = towerFace(u * 2 - 1, TH), b = back(u, 1); return [f[0], TH + 9 * Math.sin(Math.PI * v * 0.5) * (1 - 0.3 * (u * 2 - 1) ** 2), f[2] + (b[2] - f[2]) * v]; }, 6, 6, true);
  const tm = new THREE.Mesh(top, crown); tm.castShadow = true; grp.add(tm);
  const lobby = lam("lobby", () => ({ color: "#3d4452" }));
  const lb = new THREE.Mesh(boxGeo(V(-17, 0, TOWER_Z - 26), V(17, 6.5, TOWER_Z - 2.2)), lobby); lb.receiveShadow = true; grp.add(lb);
  root.add(grp);
  return grp;
};

/** sunshade: horizontal slats over the upper south face, one mesh per row (installed from the top down) */
export const buildFins = (root: THREE.Object3D) => {
  const m = lam("fin", () => ({ color: "#d5d9de" }));
  const rows: { y: number; mesh: THREE.Mesh }[] = [];
  for (let y = TH - 3; y > 52; y -= 2.4) {
    const g = sheet(30, 1, (u, v) => { const s = u * 2 - 1, f = towerFace(s, y), n = towerNormal(s, y); const out = 0.4 + v * 1.1; return [f[0] + n[0] * out, y - 0.18 * v, f[2] + n[2] * out]; }, 4, 4);
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.visible = false; root.add(mesh); rows.push({ y, mesh });
  }
  return rows;
};

/** window-cleaning style cradle hung on two cables in front of the face */
export const CRADLE: V3 = [-6, 50, 0];
export const buildCradle = (root: THREE.Object3D) => {
  const g = new THREE.Group(), f = towerFace(-6 / (wAt(50) / 2), 50), n = towerNormal(-6 / (wAt(50) / 2), 50);
  const x = f[0] + n[0] * 2.2, z = f[2] + n[2] * 2.2;
  CRADLE[0] = x; CRADLE[1] = 50; CRADLE[2] = z;
  const steel = lam("cradle", () => ({ color: "#c9ced6" })), yel = lam("cradleY", () => ({ color: "#e8b830" }));
  g.add(new THREE.Mesh(boxGeo(V(x - 3, 49.6, z - 0.6), V(x + 3, 50.0, z + 0.6)), yel));
  for (const [a, b] of [[-3, -0.6], [-3, 0.6], [3, -0.6], [3, 0.6]]) g.add(new THREE.Mesh(boxGeo(V(x + a - 0.05, 50, z + b - 0.05), V(x + a + 0.05, 51.1, z + b + 0.05)), steel));
  g.add(new THREE.Mesh(boxGeo(V(x - 3, 51.05, z - 0.65), V(x + 3, 51.15, z - 0.55)), steel));
  g.add(new THREE.Mesh(boxGeo(V(x - 3, 51.05, z + 0.55), V(x + 3, 51.15, z + 0.65)), steel));
  for (const a of [-2.6, 2.6]) g.add(new THREE.Mesh(boxGeo(V(x + a - 0.03, 51.1, z - 0.03), V(x + a + 0.03, TH, z + 0.03)), steel));
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  g.visible = false; root.add(g);
  return g;
};

// ---------------- the City ----------------
type BStyle = { wall: string; shutter: string; brick?: boolean };
const BSTYLES: BStyle[] = [
  { wall: "#e2d6bc", shutter: "#3a4656" }, { wall: "#d9c49c", shutter: "#2f5f6a" }, { wall: "#c47a5c", shutter: "#3b3f52", brick: true },
  { wall: "#e8dcc4", shutter: "#5a3b2a" }, { wall: "#cfb48a", shutter: "#2f6a43" }, { wall: "#d7c8ae", shutter: "#8c3b4a" },
];
/** flat-roofed City block (front faces +z after yaw), painted facades, parapet + roof units */
export const block = (b: Batch, x: number, z: number, yaw: number, w: number, d: number, h: number, si: number, door = true) => {
  const across = Math.abs(Math.sin(yaw)) > 0.5, hx = (across ? d : w) / 2 + 0.4, hz = (across ? w : d) / 2 + 0.4;
  if (inTheWay(x - hx, x + hx, 0, h + 1.5, z - hz, z + hz)) return;
  const st = BSTYLES[si % BSTYLES.length], m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  const front = lam(`bf${si}_${w}_${h}_${door}`, () => ({ map: facadeHD(`bf${si}_${w}_${h}_${door}`, w, h, { ...st, door }, door ? 40 : 20) }));
  const side = lam(`bs${si}_${d}_${h}`, () => ({ map: facadeHD(`bs${si}_${d}_${h}`, d, h, st, 20) }));
  const hw = w / 2, hd = d / 2;
  b.add(quad(V(-hw, 0, hd), V(hw, 0, hd), V(hw, h, hd), V(-hw, h, hd)), front, m);
  b.add(quad(V(hw, 0, -hd), V(-hw, 0, -hd), V(-hw, h, -hd), V(hw, h, -hd)), front, m);
  b.add(quad(V(-hw, 0, -hd), V(-hw, 0, hd), V(-hw, h, hd), V(-hw, h, -hd)), side, m);
  b.add(quad(V(hw, 0, hd), V(hw, 0, -hd), V(hw, h, -hd), V(hw, h, hd)), side, m);
  const roofM = lam("flatroof", () => ({ color: "#8e8a84" })), trim = lam("trimStone", () => ({ color: "#efe3c8" }));
  b.add(quad(V(-hw, h, hd), V(hw, h, hd), V(hw, h, -hd), V(-hw, h, -hd)), roofM, m);
  b.add(boxGeo(V(-hw - 0.15, h, hd - 0.4), V(hw + 0.15, h + 0.9, hd + 0.15)), trim, m);       // parapet front
  b.add(boxGeo(V(-hw - 0.15, h - 0.6, hd), V(hw + 0.15, h - 0.3, hd + 0.25)), trim, m);       // cornice
  if (w > 8) b.add(boxGeo(V(-hw * 0.4, h, -hd * 0.5), V(hw * 0.1, h + 2.2, hd * 0.2)), lam("roofunit", () => ({ color: "#b8b4ac" })), m);
  b.add(boxGeo(V(-hw - 0.05, -0.05, -hd - 0.05), V(hw + 0.05, 0.5, hd + 0.05), 2), lam("plinthHD", () => ({ map: stoneHD("copeHD") })), m);
  // shop awning on ground-floor fronts
  if (door && si % 2 === 0) {
    const aw = lam("awning" + si, () => ({ color: ["#2f6a43", "#8c3b4a", "#2f5f6a"][si % 3], side: THREE.DoubleSide }));
    b.add(quad(V(-hw + 0.5, 3.2, hd), V(hw - 0.5, 3.2, hd), V(hw - 0.5, 2.6, hd + 1.4), V(-hw + 0.5, 2.6, hd + 1.4)), aw, m);
  }
};
/** distant glass skyscraper (simple box, glass texture) */
const glassBlock = (b: Batch, x: number, z: number, w: number, d: number, h: number, mat: THREE.Material) => {
  if (inTheWay(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2)) return;
  b.add(boxGeo(V(x - w / 2, 0, z - d / 2), V(x + w / 2, h, z + d / 2), 12), mat);
};

const asphalt = () => ctex("asphalt", 1024, 1024, (g, r) => {
  g.fillStyle = "#5d5f66"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${(0.03 + r() * 0.05).toFixed(3)})`; const s = 2 + r() * 6; g.fillRect(r() * 1024, r() * 1024, s, s); }
  for (let i = 0; i < 6; i++) { g.strokeStyle = "rgba(30,30,36,0.35)"; g.lineWidth = 3; g.beginPath(); let x = r() * 1024, y = r() * 1024; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 80; y += r() * 60; g.lineTo(x, y); } g.stroke(); }
});
const paving = () => ctex("paving", 1024, 1024, (g, r) => {
  g.fillStyle = "#b8b0a2"; g.fillRect(0, 0, 1024, 1024);
  const s = 128;
  for (let y = 0; y < 1024; y += s) for (let x = 0; x < 1024; x += s) {
    g.fillStyle = jit(r, "#cfc6b5", 0.06, 4, 0.2); g.fillRect(x + 3, y + 3, s - 6, s - 6);
  }
});

export const buildCity = (root: THREE.Object3D, kit: Kit, rays: Ray[]) => {
  setSight(rays);
  const b = new Batch(), r = rng(23);
  // ground: road (z -4..4), pavements, plaza, a big paved ground beyond
  const road = lam("road", () => ({ map: rep(asphalt(), 1, 1) }));
  const pave = lam("pave", () => ({ map: rep(paving(), 1, 1) }));
  const ground = lam("cityGround", () => ({ map: rep(paving(), 1, 1), color: "#d8d2c6" }));
  const up = (x0: number, x1: number, z0: number, z1: number, y: number, tile: number) => quad(V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), (x1 - x0) / tile, (z1 - z0) / tile);
  b.add(up(-700, 700, -4, 4, 0, 10), road);
  for (const [z0, z1] of [[-7.5, -4], [4, 7.5]]) b.add(up(-700, 700, z0, z1, 0.14, 3), pave);
  b.add(up(-22, 22, -16, -7.5, 0.14, 3), pave);
  b.add(up(-900, 900, -900, -7.5, 0.0, 6), ground);
  b.add(up(-900, 900, 7.5, 900, 0.0, 6), ground);
  const kerb = lam("kerb", () => ({ color: "#d9d4c8" }));
  for (const z of [-4, 4]) b.add(boxGeo(V(-700, 0, z - 0.15), V(700, 0.15, z + 0.15)), kerb);
  // lane markings
  const paint = lam("lineWhite", () => ({ color: "#f3efe4" })), yellow = lam("lineYellow", () => ({ color: "#e8c040" }));
  for (let x = -300; x < 300; x += 6) b.add(up(x, x + 3, -0.08, 0.08, 0.012, 3), paint);
  for (const z of [-3.75, 3.75]) for (const dz of [-0.06, 0.06]) b.add(up(-700, 700, z + dz - 0.04, z + dz + 0.04, 0.012, 3), yellow);
  // north row (tower plaza gap at |x| < 22), south row, back blocks
  const row = (zFront: number, sign: number, x0: number, x1: number, seed: number) => {
    let x = x0;
    while (x < x1) {
      const w = [9, 11, 13][Math.floor(r() * 3)], h = [14, 17, 20, 23][Math.floor(r() * 4)], cx = x + w / 2;
      if (!(sign < 0 && Math.abs(cx - SHOP[0]) < 6)) block(b, cx, zFront + sign * 7, sign < 0 ? 0 : Math.PI, w, 14, h, Math.floor(r() * 6) + seed);
      x += w + 0.1;
    }
  };
  row(-7.5, -1, -200, -28.5, 0); row(-7.5, -1, 22.5, 200, 1); row(7.5, 1, -200, 200, 2);
  block(b, SHOP[0], -14.5, 0, 9, 14, 17, 4, true); // the doormat shop (door centred at SHOP)
  for (const zr of [-60, -90, 40, 70, 100]) for (let x = -260; x < 260; x += 20 + r() * 10) {
    if (Math.abs(x) < 34 && zr < 0) continue;
    if (Math.hypot(x - PARK[0], zr - PARK[2]) < 26) continue;
    block(b, x, zr, zr < 0 ? 0 : Math.PI, 14 + Math.floor(r() * 3) * 3, 16, [18, 27, 36][Math.floor(r() * 3)], Math.floor(r() * 6), false);
  }
  // the wider City: far blocks and a few glass towers, river to the south
  const gm = [glassMat("cityA", "#7f9cb4", "#d6e4ee", "#4a5562"), glassMat("cityB", "#8aa7a8", "#dbe9e6", "#4a5a5a"), glassMat("cityC", "#9a9488", "#e8e2d4", "#5a544a")];
  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2, d = 140 + r() * 380, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8 - 40;
    if (z > 190) continue;
    if (r() < 0.12) glassBlock(b, x, z, 26, 26, 70 + r() * 70, gm[i % 3]);
    else block(b, x, z, Math.round(r() * 3) * (Math.PI / 2), 16 + Math.floor(r() * 3) * 4, 18, [18, 27, 36][Math.floor(r() * 3)], Math.floor(r() * 6), false);
  }
  const river = lam("thames", () => ({ color: "#4f86ad" }));
  b.add(up(-900, 900, 230, 420, 0.03, 50), river);
  for (let k = 0; k < 4; k++) { const sx = -300 + k * 200; b.add(boxGeo(V(sx, 6, 228), V(sx + 14, 8, 422)), lam("bridgeStone", () => ({ color: "#cfc6b5" }))); }
  // church spires among the blocks (period City churches, generic)
  for (const [x, z] of [[-120, -150], [90, -170], [180, 60], [-200, 90]] as const) {
    if (inTheWay(x - 5, x + 5, 0, 60, z - 5, z + 5)) continue;
    b.add(boxGeo(V(x - 4, 0, z - 4), V(x + 4, 30, z + 4), 4), lam("towerstone", () => ({ map: stoneHD("tstoneHD") })));
    const sp = new THREE.ConeGeometry(4.2, 22, 8); sp.translate(x, 41, z); b.add(sp, roofMat("#8f97a8"));
  }
  // street furniture: lamps both sides, bollards and trees on the plaza, bike rack
  const iron = lam("lampIron", () => ({ color: "#2c3036" }));
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.2) });
  for (const z of [-5.2, 5.2]) for (let x = -150; x <= 150; x += 14) {
    if (inTheWay(x - 0.4, x + 0.4, 0, 5, z - 0.4, z + 0.4, true)) continue;
    b.add(new THREE.CylinderGeometry(0.08, 0.12, 5, 8).translate(x, 2.5, z), iron);
    b.add(boxGeo(V(x - 0.25, 4.9, z - 0.25), V(x + 0.25, 5.4, z + 0.25)), glow);
  }
  for (let x = -18; x <= 18; x += 3) if (Math.abs(x) > 2) b.add(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 10).translate(x, 0.6, -7.8), iron);
  for (const x of [-15, 15]) prop(b, kit, "tree_oak", x, 0.14, -12, 7);
  const rack = lam("rack", () => ({ color: "#9aa0a8" }));
  for (const dx of [-1.6, 0, 1.6]) {
    const x = BIKE[0] + dx + 0.9;
    b.add(new THREE.TorusGeometry(0.4, 0.035, 6, 16, Math.PI).translate(x, 0.14, BIKE[2] - 0.5), rack);
  }
  b.build(root);
  setSight([]);
};

// ---------------- the car ----------------
export type CarRig = { group: THREE.Group; body: THREE.Mesh; base: Float32Array; mirror: THREE.Group; badge: THREE.Mesh; lights: THREE.MeshBasicMaterial; paint: THREE.MeshPhongMaterial };
export const buildCar = (root: THREE.Object3D): CarRig => {
  const g = new THREE.Group();
  // side profile (x along the car, y up), extruded across z 1.8 m
  const sh = new THREE.Shape();
  const pts: [number, number][] = [[-2.45, 0.32], [-2.5, 0.75], [-2.3, 0.92], [-1.25, 1.0], [-0.75, 1.42], [0.75, 1.44], [1.35, 1.02], [2.35, 0.9], [2.5, 0.62], [2.45, 0.32]];
  sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.7, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 4, steps: 6 });
  geo.translate(0, 0, -0.85);
  const body = geo.toNonIndexed(); body.computeVertexNormals();
  const paint = twoTone(new THREE.MeshPhongMaterial({ color: "#1f232b", specular: "#9fb0c8", shininess: 90 }), 0.3);
  const mesh = new THREE.Mesh(body, paint); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  // windows (side glass strips slightly proud of the body), wheels, lights, badge, mirror
  const glass = twoTone(new THREE.MeshPhongMaterial({ color: "#7ea6c8", specular: "#ffffff", shininess: 100, side: THREE.DoubleSide }), 0.4);
  for (const s of [-1, 1]) {
    const w = new THREE.Shape(); w.moveTo(-1.1, 1.02); w.lineTo(-0.7, 1.36); w.lineTo(0.7, 1.38); w.lineTo(1.2, 1.04); w.closePath();
    const wg = new THREE.ShapeGeometry(w); wg.translate(0, 0, s * 0.95);
    g.add(new THREE.Mesh(wg, glass));
  }
  const tyre = lam("tyre", () => ({ color: "#1a1a1e" })), hub = lam("hub", () => ({ color: "#b8bcc4" }));
  for (const x of [-1.55, 1.55]) for (const z of [-0.82, 0.82]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18).rotateX(Math.PI / 2), tyre); t.position.set(x, 0.36, z); t.castShadow = true; g.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12).rotateX(Math.PI / 2), hub); h.position.set(x, 0.36, z); g.add(h);
  }
  const lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.05, 0.9) });
  for (const z of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.34), lights); l.position.set(2.52, 0.72, z); g.add(l); }
  const tail = new THREE.MeshBasicMaterial({ color: "#c0262c" });
  for (const z of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.34), tail); l.position.set(-2.52, 0.75, z); g.add(l); }
  const chrome = twoTone(new THREE.MeshPhongMaterial({ color: "#c9ced6", specular: "#ffffff", shininess: 120 }), 0.3);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16).rotateZ(Math.PI / 2), chrome); badge.position.set(2.53, 0.68, 0); g.add(badge);
  const mirror = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.16), paint); arm.position.set(0, 0, 0.08);
  const cup = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.24), paint); cup.position.set(0, 0, 0.26); cup.castShadow = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), glass); face.position.set(-0.085, 0, 0.26); face.rotation.y = -Math.PI / 2;
  mirror.add(arm, cup, face); mirror.position.set(1.05, 1.02, 0.92); g.add(mirror);
  const back = new THREE.Group(); // driver-side mirror on the far side too (static)
  const cup2 = cup.clone(); cup2.position.set(1.05, 1.02, -1.15); back.add(cup2); g.add(back);
  g.position.set(...CAR);
  root.add(g);
  return { group: g, body: mesh, base: (body.attributes.position.array as Float32Array).slice(), mirror, badge, lights, paint };
};
export const poseCar = (c: CarRig, melt: number, mirror: number, wavy: number, fixed: boolean, t: number, blink: number) => {
  const p = c.body.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
  for (let i = 0; i < a.length; i += 3) {
    const x = c.base[i], y = c.base[i + 1], z = c.base[i + 2];
    const top = Math.max(0, (y - 0.4) / 1.0);
    const wob = fixed ? 0 : wavy * 0.05 * Math.sin(x * 5.5 + y * 3 + 0.6 * Math.sin(t * 2)) * (0.4 + top);
    const sag = fixed ? 0 : melt * 0.09 * top * top * (1 - 0.3 * Math.cos(x * 1.4));
    a[i] = x; a[i + 1] = y - sag + wob * 0.6; a[i + 2] = z + Math.sign(z) * wob;
  }
  p.needsUpdate = true; c.body.geometry.computeVertexNormals();
  // wing mirror droops like a candle: rotates down and stretches
  c.mirror.rotation.set(fixed ? 0 : 1.15 * mirror, 0, fixed ? 0 : 0.2 * mirror);
  c.mirror.scale.set(1 - (fixed ? 0 : 0.2 * mirror), 1 - (fixed ? 0 : 0.25 * mirror), 1 + (fixed ? 0 : 0.9 * mirror));
  c.badge.scale.set(1, fixed ? 1 : 1 + 1.6 * melt, fixed ? 1 : 1 - 0.3 * melt);
  c.badge.position.y = 0.68 - (fixed ? 0 : 0.1 * melt);
  c.paint.shininess = fixed ? 140 : 90;
  c.lights.color.setRGB(1.1 + 3 * blink, 1.05 + 2.6 * blink, 0.9 + 1.6 * blink);
};

// ---------------- the bike ----------------
export type BikeRig = { group: THREE.Group; seat: THREE.Mesh };
export const buildBike = (root: THREE.Object3D): BikeRig => {
  const g = new THREE.Group(), fr = lam("bikeRed", () => ({ color: "#2f6aa8" })), tyre = lam("tyre", () => ({ color: "#1a1a1e" }));
  for (const x of [-0.55, 0.55]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 24), tyre); w.position.set(x, 0.36, 0); g.add(w); }
  const bar = (a: V3, b: V3) => { const v = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, v.length(), 6), fr);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize()); g.add(m); };
  bar([-0.55, 0.36, 0], [-0.1, 0.36, 0]); bar([-0.1, 0.36, 0], [-0.2, 0.86, 0]); bar([-0.2, 0.86, 0], [0.42, 0.84, 0]); bar([-0.1, 0.36, 0], [0.42, 0.84, 0]);
  bar([0.42, 0.84, 0], [0.55, 0.36, 0]); bar([0.42, 0.84, 0], [0.38, 1.0, 0]); bar([0.3, 1.0, -0.25], [0.3, 1.0, 0.25]); bar([-0.55, 0.36, 0], [-0.2, 0.86, 0]);
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8).scale(1.6, 0.45, 0.9), lam("seat", () => ({ color: "#2a2a2e" })));
  seat.position.set(-0.22, 0.93, 0); seat.castShadow = true; g.add(seat);
  g.traverse((o) => { o.castShadow = true; });
  g.position.set(...BIKE); g.rotation.y = 0.5; root.add(g);
  return { group: g, seat };
};
export const poseBike = (bk: BikeRig, sag: number) => {
  bk.seat.scale.set(1 + 0.3 * sag, 1 + 0.8 * sag, 1 + 0.15 * sag);
  bk.seat.position.y = 0.93 - 0.08 * sag; bk.seat.rotation.z = -0.25 * sag;
};

// ---------------- podium ----------------
export const buildPodium = (root: THREE.Object3D) => {
  const g = new THREE.Group(), cloth = lam("podium", () => ({ color: "#8a2f2a" })), top = lam("podiumTop", () => ({ color: "#a33c35" }));
  g.add(new THREE.Mesh(boxGeo(V(-1.0, 0.14, -0.5), V(1.0, 1.0, 0.5)), cloth), new THREE.Mesh(boxGeo(V(-1.05, 1.0, -0.55), V(1.05, 1.08, 0.55)), top));
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  g.position.set(...PODIUM); g.visible = false; root.add(g);
  return g;
};

// ---------------- far sets ----------------
/** explanation back street: wall of houses, a shop with a big window (flat or concave), cobbles */
export type LabRig = { flat: THREE.Object3D; curved: THREE.Object3D };
export const buildLab = (root: THREE.Object3D, kit: Kit): LabRig => {
  const b = new Batch(), [X, , Z] = LAB;
  const cob = lam("cobbleHD", () => ({ map: cobbleHD() }));
  b.add(quad(V(X - 60, 0, Z + 60), V(X + 60, 0, Z + 60), V(X + 60, 0, Z - 60), V(X - 60, 0, Z - 60), 12, 12), cob);
  for (const [dx, w, h, si] of [[-14, 8, 9.8, 1], [-5.5, 9, 8.4, 5], [3.2, 8, 9.8, 3], [11.6, 9, 8.4, 6], [-23, 9, 8.4, 0], [20.5, 8, 9.8, 2]] as const)
    house(b, X + dx, Z - 9, 0, w, 8, h, si, 0);
  // opposite side (behind the camera, for reflections of light) + shop frame around the window
  const frame = lam("shopFrame", () => ({ color: "#2f5f4a" }));
  b.add(boxGeo(V(X - 4.4, 0, Z - 5.05), V(X - 4.0, 3.4, Z - 4.7)), frame);
  b.add(boxGeo(V(X + 0.0, 0, Z - 5.05), V(X + 0.4, 3.4, Z - 4.7)), frame);
  b.add(boxGeo(V(X - 4.4, 3.2, Z - 5.05), V(X + 0.4, 3.6, Z - 4.7)), frame);
  b.add(boxGeo(V(X - 4.4, 0, Z - 5.05), V(X + 0.4, 0.5, Z - 4.7)), frame);
  for (const dx of [-12, 8]) prop(b, kit, "tree_default", X + dx, 0, Z - 3.5, 6);
  b.build(root);
  const glass = twoTone(new THREE.MeshPhongMaterial({ color: "#a9cce6", specular: "#ffffff", shininess: 110, side: THREE.DoubleSide }), 0.4);
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.7), glass); flat.position.set(X - 2.0, 1.85, Z - 4.85);
  const cg = new THREE.CylinderGeometry(3.0, 3.0, 2.7, 24, 1, true, Math.PI - 0.72, 1.44); // concave toward +z
  const curved = new THREE.Mesh(cg, glass); curved.position.set(X - 2.0, 1.85, Z - 4.85 - 3.0 + 0.55); curved.rotation.y = Math.PI;
  for (const m of [flat, curved]) { m.castShadow = false; m.receiveShadow = true; root.add(m); }
  return { flat, curved };
};

/** park with a lawn, trees and a path (the kid with the magnifying glass) */
export const buildPark = (root: THREE.Object3D, kit: Kit) => {
  const b = new Batch(), [X, , Z] = PARK;
  const grass = lam("grassHD", () => ({ map: grassHD() }));
  const disc = new THREE.CircleGeometry(30, 40).rotateX(-Math.PI / 2).translate(X, 0.05, Z);
  const uv = disc.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 8);
  b.add(disc, grass);
  const path = lam("gravel", () => ({ color: "#d8c49a" }));
  b.add(quad(V(X - 30, 0.06, Z + 4.6), V(X + 30, 0.06, Z + 4.6), V(X + 30, 0.06, Z + 3.0), V(X - 30, 0.06, Z + 3.0), 10, 1), path);
  const r = rng(7);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, d = 17 + r() * 9, x = X + Math.cos(a) * d, z = Z + Math.sin(a) * d;
    if (z > Z + 8 && Math.abs(x - X) < 10) continue; // keep the view back toward the street open
    if (z < Z - 6 && Math.abs(x - X) < 14) continue; // and toward the tower
    prop(b, kit, ["tree_oak", "tree_fat", "tree_default"][i % 3], x, 0, z, 8 + r() * 3);
  }
  for (let i = 0; i < 10; i++) prop(b, kit, "plant_bush", X - 9 + i * 2.1, 0, Z - 3.5 - (i % 2), 0.9);
  b.add(boxGeo(V(X + 3.2, 0.42, Z - 1.5), V(X + 5.2, 0.5, Z - 1.0)), lam("bench", () => ({ color: "#8a5a34" })));
  b.build(root);
};

/** Las Vegas: concave hotel tower, podium, pool deck, palms, loungers, desert hills */
export const buildVegas = (root: THREE.Object3D) => {
  const b = new Batch(), [X, , Z] = VEGAS;
  const sand = lam("sand", () => ({ color: "#e2c08b" })), deck = lam("deck", () => ({ color: "#efe6d6" }));
  b.add(quad(V(X - 900, 0, Z + 900), V(X + 900, 0, Z + 900), V(X + 900, 0, Z - 900), V(X - 900, 0, Z - 900), 1, 1), sand);
  b.add(quad(V(X - 70, 0.05, Z + 95), V(X + 70, 0.05, Z + 95), V(X + 70, 0.05, Z - 20), V(X - 70, 0.05, Z - 20), 20, 20), deck);
  const pool = lam("pool", () => ({ color: "#3cbde0" }));
  b.add(quad(V(X - 30, 0.08, Z + 68), V(X + 30, 0.08, Z + 68), V(X + 30, 0.08, Z + 48), V(X - 30, 0.08, Z + 48), 4, 2), pool);
  const edge = lam("poolEdge", () => ({ color: "#f6f2ea" }));
  for (const [x0, z0, x1, z1] of [[-30.5, 47.5, 30.5, 48], [-30.5, 68, 30.5, 68.5], [-30.5, 47.5, -30, 68.5], [30, 47.5, 30.5, 68.5]] as const)
    b.add(boxGeo(V(X + x0, 0.05, Z + z0), V(X + x1, 0.22, Z + z1)), edge);
  const lounge = lam("lounger", () => ({ color: "#ffffff" }));
  for (let k = 0; k < 9; k++) { const x = X - 26 + k * 6.2; b.add(boxGeo(V(x, 0.3, Z + 41), V(x + 0.8, 0.42, Z + 43.2)), lounge); }
  // hotel: concave arc in plan facing the pool (+z)
  const glass = glassMat("vegas", "#6f93b0", "#d8e8f4", "#3a4656");
  const C = [X, Z + 60], R = 120, H = 170, A = 0.55;
  const face = sheet(30, 30, (u, v) => { const th = (u * 2 - 1) * A; return [C[0] + R * Math.sin(th), v * H, C[1] - R * Math.cos(th)]; }, 6, 14.4);
  const backF = sheet(30, 30, (u, v) => { const th = (u * 2 - 1) * A; return [C[0] + (R + 22) * Math.sin(th), v * H, C[1] - (R + 22) * Math.cos(th)]; }, 6, 14.4, true);
  const roof = sheet(30, 1, (u, v) => { const th = (u * 2 - 1) * A, rr = R + 22 * v; return [C[0] + rr * Math.sin(th), H, C[1] - rr * Math.cos(th)]; }, 6, 6, true);
  const ends = [-1, 1].map((s) => sheet(1, 30, (u, v) => { const th = s * A, rr = R + 22 * u; return [C[0] + rr * Math.sin(th), v * H, C[1] - rr * Math.cos(th)]; }, 6, 14.4, s > 0));
  for (const g of [face, backF, roof, ...ends]) { const m = new THREE.Mesh(g, glass); m.castShadow = true; m.receiveShadow = true; root.add(m); }
  b.add(boxGeo(V(X - 60, 0, Z - 70), V(X + 60, 12, Z - 40)), lam("vegasPodium", () => ({ color: "#d8c8a8" })));
  // palms
  const trunk = lam("palmTrunk", () => ({ color: "#9a6a3a" })), frond = lam("palmFrond", () => ({ color: "#4f9a3a", side: THREE.DoubleSide }));
  const palm = (x: number, z: number, h: number) => {
    for (let i = 0; i < 6; i++) { const y0 = (i / 6) * h, y1 = ((i + 1) / 6) * h, bend = 0.6 * (i / 6) ** 2;
      b.add(new THREE.CylinderGeometry(0.22 - i * 0.015, 0.25 - i * 0.015, y1 - y0, 8).translate(x + bend, (y0 + y1) / 2, z), trunk); }
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, g = new THREE.PlaneGeometry(4.2, 0.9, 6, 1), p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + 2.1) / 4.2; p.setXYZ(i, u * 4.0, -1.6 * u * u + 0.4 * u, p.getY(i) * (1 - 0.6 * u)); }
      g.computeVertexNormals();
      b.add(g, frond, new THREE.Matrix4().compose(V(x + 0.6, h, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a), V(1, 1, 1)));
    }
  };
  for (const [x, z, h] of [[-36, 52, 9], [36, 54, 10], [-38, 64, 8], [38, 66, 9], [-14, 76, 9.5], [16, 78, 8.5], [-50, 30, 10], [50, 32, 9]] as const) palm(X + x, Z + z, h);
  const hill = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hm = [lam("mesaA", () => ({ color: "#c08a5a" })), lam("mesaB", () => ({ color: "#b07a52" }))];
  ([[-500, -600, 300, 90, 160], [300, -700, 360, 110, 170], [700, -300, 260, 80, 160], [-750, -200, 280, 70, 150], [600, 500, 300, 70, 150], [-500, 600, 300, 80, 160]] as const)
    .forEach(([x, z, sx, sy, sz], i) => b.add(hill, hm[i % 2], new THREE.Matrix4().compose(V(X + x, -2, Z + z), new THREE.Quaternion(), V(sx, sy, sz))));
  b.build(root);
};
/** the Vegas beam source on the curved face */
export const VEGAS_FOCUS: V3 = [VEGAS[0] - 4, 80, VEGAS[2] - 52];
