// usage: node scripts/sample.mjs <outDir> <everyNth> [scale] [from] [to] — one browser tab, the world is built once
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
const [out, nth = "50", scale = "0.5", from = "0", to = ""] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browserExecutable = "/opt/pw-browsers/chromium", chromiumOptions = { gl: "swangle" };
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts"), publicDir: path.resolve("public") });
const composition = await selectComposition({ serveUrl, id: process.env.COMP || "WalkieShort", browserExecutable, chromiumOptions });
const t0 = Date.now();
await renderFrames({ composition, serveUrl, outputDir: out, imageFormat: "jpeg", jpegQuality: 85, scale: Number(scale), concurrency: Number(process.env.CONC || 1),
  everyNthFrame: Number(nth), frameRange: [Number(from), Number(to || composition.durationInFrames - 1)], browserExecutable, chromiumOptions,
  timeoutInMilliseconds: 600000, inputProps: JSON.parse(process.env.PROPS || "{}"),
  onFrameUpdate: (n) => process.stdout.write(`\rframes ${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`),
  onStart: () => {}, onBrowserLog: (l) => { if (l.type === "error" && !l.text.includes("404") && !l.text.includes("Failed to load")) console.log("\n[err]", l.text.slice(0, 200)); } });
console.log("\ndone", ((Date.now() - t0) / 1000).toFixed(0) + "s");
