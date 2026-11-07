# Claude Animated Shorts

The free Claude skill from the video **"How to Make Viral Animated Shorts Using Claude (Full Workflow)"**.

It makes 55-70 s vertical animated story shorts: 2D characters in a colourful 3D world, with ink outlines, a painted town, lens blur, gliding cameras, a march score and sound effects. Everything is rendered with three.js inside Remotion on your own PC, with no AI video generator.

Proven on **The Bridge That Fell for a Song**, a 67 s short about the 1831 Broughton bridge.

## What's inside
| Path | What it is |
|---|---|
| `SKILL.md` | The skill: the full pipeline, every rule, every fix, and the final look values |
| `templates/bridge/` | The full source of the bridge short: world, characters, ink, lens blur, grade, story/camera |
| `templates/audio/` | The synthesized sound: SFX, march music, the mix with ducking and loudness |
| `templates/scripts/` | Stills, side-by-side sheets, shot merge and frame-by-frame QA helpers |
| `references/STYLE_BIBLE.md` | The script and visual formula measured from 20 reference shorts |
| `references/reports/` | Seven measured reports: motion, depth, textures, characters, lighting, outlines, grade |
| `references/frames/` | 38 full-size reference frames (540x960) to compare your frames against |
| `references/sheets/` | 20 contact sheets, one per reference short, 60 frames each (1,200 frames) |

## Install
Quick install (Linux, macOS, or Git Bash/WSL on Windows; needs Node 18+, Python 3 and ffmpeg):
```bash
git clone https://github.com/maung5678/claude-animated-shorts.git
cd claude-animated-shorts && ./install.sh            # or: ./install.sh /path/to/project
```
It does three things:
1. Installs the skill to `~/.claude/skills/cartoon-3d-short/`.
2. Creates a Remotion + three.js project at `~/shorts-studio` with the bridge short registered as `BridgeShort` (React 18, R3F 8, `@react-three/postprocessing` 2, three 0.169, a tested stack).
3. Copies the sound pipeline to `~/bridge-short/audio/` and installs numpy, scipy and pillow.

Check that it works:
```bash
cd ~/shorts-studio
npx tsc --noEmit                                        # typecheck
node scripts/bridge-stills.mjs out/test_ 600,1500 0.5   # two test stills (~40 s bundle + ~30 s each on CPU)
npx remotion studio                                     # preview in the browser
```
Optional: drop the Kenney CC0 `.glb` props listed in `public/bridge/kenney/README.txt` into that folder. Without them the world still builds and the trees, stalls and similar props are left out.

Rendering options: `CHROME_PATH` picks a Chrome binary, and `REMOTION_GL` picks the WebGL backend (`angle` with a GPU on Windows, `swangle` for CPU on Linux, which is the default there).

Then in Claude Code say: *"Use the cartoon short skill and make a short about …"*.

Claude then follows `SKILL.md`: topic and facts, then script, then voice, then the shot plan in `story.ts`, then stills, then renders. Agents check your frames against the reports and the frames, and you get the final 2K render and sound mix.

## Notes
- Set `REMOTION_TMP` to a folder on a big drive. Every Remotion bundle copies `public/` (~1.3 GB) into the temp folder.
- Story, characters and voice should always be your own. Use the references for the look, not the content.

## License
The code and docs are MIT (see `LICENSE`). The reference frames are included for style study only.
