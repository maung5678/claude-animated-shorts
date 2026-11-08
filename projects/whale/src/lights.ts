// Light presets per time of day. The sun is CAMERA-RELATIVE and frozen per shot (world.ts update()):
// az = degrees from the shot camera's forward axis (0 = sun straight ahead = backlight, +90 = screen right,
// 180 = behind camera), el = elevation. lit/shade/lift are LINEAR RGB multipliers for shade.ts (may exceed 1).
// Field names follow lighting.md 9.1 exactly (the CHAR and POST agents read them); values are tuned on renders.
type C3 = [number, number, number];
export type LightPreset = {
  az: number; el: number;
  lit: C3; shade: C3; lift: C3; lambert: number; sideK: number; term: number;      // world two-tone (shade.ts)
  charTint: C3; charShade: number; charGrad: number; bodyGrad: number; sideTint: C3; // character cards (cast.ts)
  blob: C3; actorShadow: boolean;                                                    // contact blobs / card shadows
  top: string; hor: string; skyCurve: C3; fog: string; fogNear: number; fogFar: number; sunDisc: string; // depth.md 6.5
  sunCol: string; sunI: number; sky: string; ground: string; hemiI: number;         // three lights (unpatched mats only)
  bias: number; normalBias: number;
};
export type LightName = "day" | "golden" | "blast" | "dusk";
export const LIGHTS = {
  day: {
    az: 75, el: 48,
    lit: [1.66, 1.52, 1.26], shade: [0.30, 0.26, 0.42], lift: [0.05, 0.05, 0.12], lambert: 0.35, sideK: 0.84, term: 0.2,
    charTint: [1.0, 0.94, 0.92], charShade: 0.86, charGrad: 0.07, bodyGrad: 0.2, sideTint: [0.92, 0.90, 0.96],
    blob: [0.62, 0.58, 0.58], actorShadow: false,
    top: "#3e7fd2", hor: "#b8d0ec", skyCurve: [0.0, 0.5, 0.6], fog: "#b8d0ec", fogNear: 25, fogFar: 300, sunDisc: "#000000",
    sunCol: "#fff3e0", sunI: 2.8, sky: "#dcecff", ground: "#b49a78", hemiI: 0.55,
    bias: -0.00025, normalBias: 0.015,
  },
  golden: {
    az: 6, el: 7,
    lit: [1.5, 0.68, 0.24], shade: [0.15, 0.15, 0.3], lift: [0.04, 0.06, 0.17], lambert: 0.35, sideK: 0.82, term: 0.07,
    charTint: [1.0, 0.78, 0.56], charShade: 0.88, charGrad: 0.1, bodyGrad: 0.25, sideTint: [0.85, 0.80, 0.95],
    blob: [0.75, 0.74, 0.9], actorShadow: true,
    top: "#6a4f8c", hor: "#ffd08a", skyCurve: [0.05, 0.6, 1.0], fog: "#efb489", fogNear: 50, fogFar: 380, sunDisc: "#ffcf9e",
    sunCol: "#ffab5e", sunI: 5.5, sky: "#d8b0b8", ground: "#8a6a60", hemiI: 0.5,
    bias: -0.0006, normalBias: 0.03,
  },
} as Record<LightName, LightPreset>;


LIGHTS.blast = { ...LIGHTS.day, lit: [1.75, 1.45, 1.05], shade: [0.34, 0.24, 0.36], fog: "#ffd9a0", charTint: [1.0, 0.92, 0.84] };
LIGHTS.dusk = { ...LIGHTS.golden, az: 25, el: 10, lit: [1.45, 0.98, 0.9], shade: [0.2, 0.17, 0.38], lift: [0.05, 0.04, 0.14],
  charTint: [1.0, 0.86, 0.86], sideTint: [0.88, 0.82, 0.96], top: "#4f4589", hor: "#ffc59a", fog: "#f2b4a6", sunDisc: "#ffe3a8", sunCol: "#ffb8a0", sunI: 4.5 };

/** world-only look per light (sky stops by elevation in degrees, river colours, cloud palette). All colours are
 *  ON-SCREEN targets under the current PBR-Neutral tone map; world.ts pre-inverts the tone map (shade.ts untone). */
export type WorldLook = {
  sky: { c: string[]; e: number[] };                         // 5 stops: c[i] at elevation e[i] (deg), smoothstep between
  water: { near: string; mid: string; far: string; crest: string; trough: string; glint: string; shade: C3 };
  bounce: C3;                                                 // shade.ts uBounce: albedo x bounce on shaded faces turned to the lens
  sat: number;                                                // shade.ts uSat: world albedo saturation (1 = as painted)
  cloud: { lit: string; mid: string; shade: string };
};
export const LOOK: Record<LightName, WorldLook> = {
  day: {
    // depth.md 2.2: horizon #9fb6e6 just above the skyline, upper sky #5e93d9 at ~20 deg (grade: frame top #5997e2)
    sky: { c: ["#c4e4f4", "#93ccef", "#55a3e6", "#3488dc", "#1f66c6"], e: [0, 3, 8, 16, 40] },
    water: { near: "#22b8b4", mid: "#139aa8", far: "#0f6f93", crest: "#a6eeea", trough: "#0b5878", glint: "#ffffff", shade: [0.5, 0.56, 0.72] },
    cloud: { lit: "#fbf8f1", mid: "#e1e5f3", shade: "#c3cbe9" },
    bounce: [0, 0, 0],
    sat: 1.16,
  },
  golden: {
    // sunset, not dusk: #ffd08a horizon, peach/orange through ~10 deg, warm rose at 20, muted warm mauve only near the top
    // (the golden grade adds ~+11/255 blue to shadows/mids, so these lean warm)
    sky: { c: ["#ffc47c", "#f7ae78", "#e8967c", "#c4848e", "#8a6f8a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#1e3a6e", mid: "#355f96", far: "#d4a48e", crest: "#d9a088", trough: "#16294f", glint: "#ffe2b0", shade: [0.42, 0.46, 0.72] },
    cloud: { lit: "#ffd2a8", mid: "#f2a08f", shade: "#a98fc4" },
    bounce: [0.04, 0.02, 0.0],
    sat: 1.1,
  },
  blast: {
    sky: { c: ["#ffe9a8", "#ffd27a", "#ffb45a", "#f79a52", "#e9784a"], e: [0, 4, 10, 20, 40] },
    water: { near: "#2fb2ac", mid: "#2f9fa5", far: "#2b7c8e", crest: "#ffe8b0", trough: "#1b5a70", glint: "#ffffff", shade: [0.55, 0.52, 0.66] },
    cloud: { lit: "#fff4d8", mid: "#ffd9a8", shade: "#e6a98e" },
    bounce: [0.03, 0.01, 0.0],
    sat: 1.18,
  },
  dusk: {
    sky: { c: ["#ffd3a1", "#ffb69a", "#f59aa0", "#b685ab", "#4f4589"], e: [0, 4, 10, 22, 45] },
    water: { near: "#545a9e", mid: "#6c6fb4", far: "#e8a8a0", crest: "#ffd0c0", trough: "#363c78", glint: "#ffe2c8", shade: [0.42, 0.42, 0.7] },
    cloud: { lit: "#ffd6c4", mid: "#f2a4b0", shade: "#a98fc4" },
    bounce: [0.03, 0.01, 0.02],
    sat: 1.1,
  },
};
