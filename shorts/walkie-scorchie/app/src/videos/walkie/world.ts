// The whole film as one three.js scene: sky, sun, clouds, the City street with the curved tower, the car, the
// sunbeam, the far sets (explanation street, park, Las Vegas) and the cast. update(id, f, camera) poses everything
// for shot `id` at frame f (a pure function of id + f), like the bridge short.
import * as THREE from "three";
import { Batch, V, lam, Kit, Ray } from "./build";
import { ctex, cloudHD } from "./paint";
import { Pen } from "./toon";
import { LIGHTS, LOOK, LightPreset } from "./lights";
import { TONE, CHAR, untone } from "./shade";
import { NOINK } from "./ink";
import { Pool, Actor, Fx, stage, CRADLE_AT } from "./cast";
import { FPS, SHOTS, camAt, stateAt, ShotDef, V3, LAB, VEGAS, SPOT } from "./story";
import {
  buildTower, buildFins, buildCradle, CRADLE, buildCity, buildCar, poseCar, CarRig, buildBike, poseBike, BikeRig, buildPodium,
  buildLab, LabRig, buildPark, buildVegas, VEGAS_FOCUS, towerFace,
} from "./city";

export const loadKit = () => Promise.resolve({} as Kit);

const discTex = () => ctex("sunDisc", 128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 58, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
const haloTex = () => ctex("sunHalo", 256, 256, (g) => {
  const im = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const u = Math.hypot(x - 127.5, y - 127.5) / 128;
    const a = (0.55 * Math.exp(-((u / 0.25) ** 2)) + 0.35 * Math.exp(-((u / 0.6) ** 2))) * (1 - Math.min(1, Math.max(0, (u - 0.8) / 0.2)));
    const i = (y * 256 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(im, 0, 0);
});
const spotTex = () => ctex("hotSpot", 256, 256, (g) => {
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,240,200,0.85)"); gr.addColorStop(0.6, "rgba(255,200,120,0.3)"); gr.addColorStop(1, "rgba(255,180,90,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
});

/** a soft additive light shaft between two points (open cone, fades along its length and at its silhouette) */
class Beam {
  mesh: THREE.Mesh; spot: THREE.Sprite; mat: THREE.ShaderMaterial;
  constructor(root: THREE.Object3D, r0: number, r1: number) {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 32, 1, true).translate(0, 0.5, 0); // y 0 = target (r1), y 1 = source (r0)
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 1 }, uCol: { value: new THREE.Color(1.6, 1.15, 0.55) } },
      vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uA; uniform vec3 uCol; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float edge = pow(abs(dot(vN, vV)), 1.6); float along = mix(1.0, 0.25, smoothstep(0.0, 1.0, vY));
          gl_FragColor = vec4(uCol * edge * along * uA * 0.3, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.layers.set(NOINK); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    this.spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: spotTex(), color: new THREE.Color(2.6, 2.1, 1.4), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.spot.layers.set(NOINK); this.spot.renderOrder = 5;
    root.add(this.mesh, this.spot);
  }
  set(from: V3, to: V3, a: number, spot = 2.4) {
    const v = V(from[0] - to[0], from[1] - to[1], from[2] - to[2]), len = v.length();
    this.mesh.position.set(...to); this.mesh.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize()); this.mesh.scale.set(1, len, 1);
    this.mat.uniforms.uA.value = a; this.mesh.visible = this.spot.visible = a > 0.01;
    this.spot.position.set(...to); this.spot.scale.setScalar(spot * Math.max(0.3, a));
    (this.spot.material as THREE.SpriteMaterial).opacity = Math.min(1, a);
  }
}

/** lens positions of every street shot (houses / blocks in their way are left out of the city) */
const sightLines = (): Ray[] => {
  const out: Ray[] = [];
  for (const s of SHOTS) {
    if (s.set !== "street") continue;
    for (let f = s.a - 8; f < s.b + 8; f += 2) {
      const c = camAt(s.id, Math.max(0, f)), o = V(...c.pos), look = V(...c.look);
      const fw = look.clone().sub(o), len = Math.min(fw.length(), 60);
      fw.normalize();
      const rt = fw.clone().cross(V(0, 1, 0)).normalize(), up = rt.clone().cross(fw);
      const ty = Math.tan((c.fov * Math.PI) / 360), tx = ty * (9 / 16);
      for (const [sx, sy] of [[0, 0], [-0.6, 0], [0.6, 0], [0, 0.6], [0, -0.4]])
        out.push({ o, d: fw.clone().addScaledVector(rt, sx * tx).addScaledVector(up, sy * ty), len, core: sx === 0 && sy === 0 });
    }
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
  private sunDisc: THREE.Sprite; private sunHalo: THREE.Sprite;
  private sunCache = new Map<number, THREE.Vector3>();
  private cloudMaps: Record<string, THREE.Texture[]>;
  private clouds: THREE.Mesh[] = [];
  private deck: { m: THREE.Mesh; x: number }[] = [];
  private car: CarRig; private bike: BikeRig;
  private fins: { y: number; mesh: THREE.Mesh }[]; private cradle: THREE.Group; private podium: THREE.Group;
  private lab: LabRig; private rays: { flat: THREE.Group; curved: THREE.Group };
  private beam: Beam; private vbeam: Beam;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private sph = new THREE.Sphere();

  constructor(kit: Kit) {
    const R = this.root;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() }, e: { value: new THREE.Vector4() } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform vec3 c0, c1, c2, c3, c4; uniform vec4 e; varying vec3 vP;
        void main(){ float el = asin(clamp(normalize(vP).y, -1.0, 1.0));
          vec3 c = mix(c0, c1, smoothstep(0.0, e.x, el)); c = mix(c, c2, smoothstep(e.x, e.y, el));
          c = mix(c, c3, smoothstep(e.y, e.z, el)); c = mix(c, c4, smoothstep(e.z, e.w, el));
          gl_FragColor = vec4(c, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 48, 24), this.skyMat);
    this.sky.renderOrder = -1; this.sky.frustumCulled = false; this.sky.layers.set(NOINK); R.add(this.sky);
    this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(), color: new THREE.Color(6.0, 4.4, 2.4), fog: false, depthWrite: false }));
    this.sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color(1, 1, 1), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunDisc.renderOrder = -0.5; this.sunHalo.renderOrder = 5;
    for (const m of [this.sunDisc, this.sunHalo]) { m.frustumCulled = false; m.layers.set(NOINK); R.add(m); }
    this.hemi = new THREE.HemisphereLight("#cfe6ff", "#6c5c8c", 1.1);
    this.sun = new THREE.DirectionalLight("#fff0d6", 2.6);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    R.add(this.hemi, this.sun, this.sun.target);
    const grey = { lit: "#c9ced5", mid: "#aeb4bd", shade: "#8e95a1" };
    this.cloudMaps = { day: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)), golden: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.golden.cloud)),
      grey: [0, 1, 2, 3].map((k) => cloudHD(k, grey)), desert: [0, 1, 2, 3].map((k) => cloudHD(k, LOOK.day.cloud)) };
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.day[i % 4], color: new THREE.Color(1.1, 1.1, 1.1), transparent: true, depthWrite: false, fog: false }));
      m.layers.set(NOINK); m.frustumCulled = false; this.clouds.push(m); R.add(m);
    }
    // overcast deck for shots 10-11: grey cloud cards over the street, sliding apart when the sun comes out
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.cloudMaps.grey[i % 4], transparent: true, depthWrite: false, fog: false }));
      const x = -260 + (i % 8) * 74 + (i > 7 ? 37 : 0), y = 70 + (i > 7 ? 70 : 0) + (i % 3) * 20, z = 300 + (i % 4) * 30;
      m.position.set(z, y, x); m.scale.set(190, 95, 1); m.layers.set(NOINK); m.frustumCulled = false; m.visible = false;
      this.deck.push({ m, x }); R.add(m);
    }
    // ---- the places ----
    buildCity(R, kit, sightLines());
    buildTower(R);
    this.fins = buildFins(R);
    this.cradle = buildCradle(R);
    CRADLE_AT[0] = CRADLE[0]; CRADLE_AT[1] = CRADLE[1] + 0.02; CRADLE_AT[2] = CRADLE[2];
    this.car = buildCar(R);
    this.bike = buildBike(R);
    this.podium = buildPodium(R);
    this.lab = buildLab(R, kit);
    buildPark(R, kit);
    buildVegas(R);
    this.rays = this.buildRays(R);
    this.beam = new Beam(R, 9, 0.7);
    this.vbeam = new Beam(R, 18, 1.0);
  }

  /** diagram rays for the explanation shots: parallel sun rays hit the window, flat = spread, curved = converge */
  private buildRays(R: THREE.Object3D) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.7) });
    const seg = (g: THREE.Group, a: V3, b: V3, w = 0.05) => {
      const v = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = new THREE.Mesh(new THREE.CylinderGeometry(w, w, v.length(), 6), mat);
      m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize());
      m.layers.set(NOINK); g.add(m);
    };
    const [X, , Z] = LAB, flat = new THREE.Group(), curved = new THREE.Group();
    const wz = Z - 4.8, hits = [-3.4, -2.0, -0.6];
    // incoming: from the upper left sky down onto the glass
    for (const hx of hits) for (const g of [flat, curved]) seg(g, [X + hx - 9, 9.5, wz + 7], [X + hx, 1.9, wz]);
    // flat: mirror bounce keeps them parallel, landing spread out on the cobbles toward the lens
    for (const hx of hits) seg(flat, [X + hx, 1.9, wz], [X + hx + 2.6, 0.05, wz + 5.6]);
    const glow = (g: THREE.Group, p: V3, s: number, k: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: spotTex(), color: new THREE.Color(2.2 * k, 1.8 * k, 1.1 * k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.position.set(...p); sp.scale.setScalar(s); sp.layers.set(NOINK); g.add(sp);
    };
    for (const hx of hits) glow(flat, [X + hx + 2.6, 0.12, wz + 5.6], 1.4, 0.6);
    const F: V3 = [X - 3.2, 0.1, Z + 0.6]; // the hot spot the curved window makes
    for (const hx of hits) seg(curved, [X + hx, 1.9, wz + (hx === -2.0 ? 0 : 0.35)], F);
    glow(curved, [F[0], 0.3, F[2]], 1.8, 1.6);
    flat.visible = curved.visible = false;
    R.add(flat, curved);
    return { flat, curved };
  }

  /** camera-relative sun, frozen per shot */
  private shotSun(id: number, s: ShotDef, L: LightPreset) {
    let v = this.sunCache.get(id);
    if (v) return v;
    let fx = 0, fz = 0;
    for (let f = s.a; f < s.b; f += 3) {
      const c = camAt(id, f), x = c.look[0] - c.pos[0], z = c.look[2] - c.pos[2], n = Math.hypot(x, z) || 1;
      fx += x / n; fz += z / n;
    }
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
    const t = f / FPS, s = SHOTS[id - 1], st = stateAt(id, t), L = LIGHTS[s.light], K = LOOK[s.light];
    // ---- camera ----
    const c = camAt(id, f);
    cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look); cam.rotateZ(c.roll);
    cam.fov = c.fov; cam.near = 0.1; cam.far = 3000; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const focus = V(...c.look), dist = cam.position.distanceTo(focus);
    cam.layers.enable(NOINK);
    // ---- light rig ----
    const sunDir = this.shotSun(id, s, L);
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    let Rr = THREE.MathUtils.clamp(dist * 1.15 + 7, 12, 140);
    if (s.light === "golden") Rr = Math.max(Rr, 30);
    if (id === 2 || id === 3 || id === 15 || id === 18) Rr = 220;
    this.sun.position.copy(focus).addScaledVector(sunDir, 400); this.sun.target.position.copy(focus);
    const sc = this.sun.shadow.camera;
    sc.left = -Rr; sc.right = Rr; sc.top = Rr; sc.bottom = -Rr; sc.near = 20; sc.far = 900; sc.updateProjectionMatrix();
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
    untone(L.fog, this.fog.color); this.fog.near = L.fogNear; this.fog.far = L.fogFar;
    if (id === 2 || id === 3 || id === 15 || id === 18) { this.fog.near = 120; this.fog.far = 1100; }
    scene.fog = this.fog; scene.background = null;
    const showSun = s.light === "golden" || id === 11;
    this.sunDisc.visible = this.sunHalo.visible = showSun;
    if (showSun) {
      const k = id === 11 ? Math.min(1, st.clouds * 1.3) : 1;
      this.sunDisc.position.copy(cam.position).addScaledVector(sunDir, 900);
      this.sunDisc.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(id === 11 ? 2.4 : 1.7)) * k);
      this.sunHalo.position.copy(this.sunDisc.position); this.sunHalo.scale.setScalar(2 * 900 * Math.tan(THREE.MathUtils.degToRad(24)) * k);
      (this.sunHalo.material as THREE.SpriteMaterial).color.set(s.light === "golden" ? L.sunDisc : "#fff4d8").multiplyScalar(1.3);
    }
    const cmaps = this.cloudMaps[s.light];
    for (let i = 0; i < this.clouds.length; i++) {
      const m = this.clouds[i], a = (i / this.clouds.length) * Math.PI * 2 + 0.3, d = 700 + (i % 3) * 80, w = 150 + (i % 4) * 40;
      m.position.set(cam.position.x + Math.cos(a) * d, 140 + (i % 4) * 45, cam.position.z + Math.sin(a) * d); m.scale.set(w, w / 2, 1);
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
      (m.material as THREE.MeshBasicMaterial).map = cmaps[i % 4];
      m.visible = s.light !== "grey";
    }
    for (const dk of this.deck) {
      dk.m.visible = id === 10 || id === 11;
      dk.m.position.z = dk.x + Math.sign(dk.x || 1) * 320 * st.clouds;
      dk.m.lookAt(cam.position.x, dk.m.position.y, cam.position.z);
      (dk.m.material as THREE.MeshBasicMaterial).color.setScalar(id === 11 ? 1.05 + 0.15 * st.clouds : 0.95);
    }
    // ---- story state ----
    poseCar(this.car, st.melt, st.mirror, st.wavy, st.fixed, t, id === 4 && t > 15.84 && t < 16.3 ? Math.max(0, Math.sin((t - 15.84) * 14)) : 0);
    poseBike(this.bike, st.seat);
    for (const r of this.fins) r.mesh.visible = r.y >= 160 - st.fins * (160 - 52);
    this.cradle.visible = id === 16;
    this.podium.visible = id === 17;
    this.lab.flat.visible = st.window === "flat"; this.lab.curved.visible = st.window === "curved";
    this.rays.flat.visible = id === 12; this.rays.curved.visible = id === 13;
    // the beam: from the middle of the curved face down to where it lands
    const src = towerFace(0.12, 72);
    const blink = id === 11 ? st.beam : st.beam;
    this.beam.set([src[0], src[1], src[2] + 2], st.beamTo ?? SPOT, s.set === "street" ? blink * (id === 2 || id === 3 ? 0.6 : 1) : 0, id === 2 || id === 3 ? 6 : 1.6);
    this.vbeam.set(VEGAS_FOCUS, [VEGAS[0] - 7.6, 1.4, VEGAS[2] + 42.4], id === 18 ? 1 : 0, 2.6);
    // ---- cast + effects ----
    const right = V(0, 0, 0).setFromMatrixColumn(cam.matrixWorld, 0);
    const sg = stage(id, t, st, { pos: cam.position, right });
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    let ai = 0;
    const used: Actor[] = [];
    for (const p of sg.places) {
      const sc2 = p.scale ?? 1;
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y + 1.1 * sc2, p.z), 3.5))) continue;
      const a = this.actor(ai++);
      const [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, p.draw);
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
    for (const p of sg.fx) {
      if (!this.frustum.intersectsSphere(this.sph.set(this.v.set(p.x, p.y, p.z), Math.max(p.w, p.h)))) continue;
      const e2 = this.fx(fi++);
      e2.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      e2.use(!!p.soft);
      e2.mesh.visible = true;
      e2.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e2.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e2.mesh.quaternion.copy(cam.quaternion); e2.mesh.rotateZ(p.rot ?? 0); }
      e2.mesh.scale.set(p.w, p.h, 1);
      fused.push(e2);
    }
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
    this.pool.flush();
    for (const a of used) a.bind();
    for (const e3 of fused) e3.bind();
    return focus;
  }
}
export { Pen, Batch };
