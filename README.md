# Roam · Walk the Listing 🏠

A **first-person, WASD-walkable 3D real-estate experience** in the browser — walk
through a home like a video game (mouse-look, jump, crouch, sprint, wall
collision) — plus a **live 3D Gaussian Splat showcase**. No build step, no app,
no VR headset. Just open the page and walk.

> **Live:** `https://wilsonwu-ai.github.io/roam-3d/`

Inspired by the viral "someone killed the real-estate industry with 3D Gaussian
Splatting" thread pointing at [PlayCanvas](https://github.com/playcanvas). Roam
takes the honest, shippable version of that idea and makes it real today.

---

## What it does

| Mode | What you get |
|------|--------------|
| **Walk** (`index.html`) | A data-driven, procedurally-built house you explore in first person across **all three floors** — walk the **ramp staircases** between the lower level, main floor, and upstairs. WASD move · mouse look · Space jump · Shift sprint · Ctrl/C crouch · wall collision · floor-aware minimap + badge · room labels · click a photo to inspect. |
| **Splat** (`splat.html`) | A **real** 3D Gaussian Splat rendered live in your browser — a sample scene, honestly labeled (see below). |

### Controls

| Input | Action |
|---|---|
| `W A S D` / Arrows | Move |
| `Mouse` | Look (click to capture) |
| `Space` | Jump |
| `Shift` (hold) | Sprint |
| `Ctrl` / `C` | Crouch |
| `E` / `Click` | Inspect the photo you're facing |
| `M` | Toggle minimap |
| `Esc` | Pause / settings menu |

---

## The honest bit about "photoreal splats of any listing" 🎯

The viral thread conflates two different things:

1. **Scan a house with your phone → walk it** — *real*, but needs a **dense video
   capture** (hundreds of overlapping frames), **camera-pose estimation** (COLMAP /
   glomap), and **GPU training** of a Gaussian-Splat model.
2. **Any Zillow listing becomes a photoreal splat** — *not real*. You cannot
   reconstruct a splat from ~30 wide-angle marketing photos; they're sparse,
   non-overlapping, and unposed.

So Roam is deliberately split:

- The **Walk** experience is built from a listing's floor plan + its real room
  photos textured onto the walls — genuinely "walk the listing."
- The **Splat** mode loads a *real* public Gaussian splat as a **technology
  showcase**, clearly labeled "sample scene, not this listing." No dishonesty.

The real capture→splat pipeline (for when you *do* shoot a dense walkthrough) is
in [`tools/capture-listing.md`](tools/capture-listing.md).

---

## Architecture

Two **decoupled engines behind one shell** — which is what makes it robust on
GitHub Pages:

```
index.html  ──►  Three.js r185 (walkable house)      three@0.185.1  (pinned)
splat.html  ──►  @mkkellogg/gaussian-splats-3d 0.4.7  three@0.160.0  (pinned, isolated)
```

They never share a WebGL context or a `three` version, so the walkable house
(newest verified Three) and the splat viewer (which peer-depends on an older
Three) can't conflict.

`listing.json` is the **single source of truth**. Swapping in a real Zillow
listing is a data-and-images change only — **zero code**.

The world is **multi-floor**: each room declares a `floor`, floors have an
`elevation`, and `stairs` define walkable ramps between them. Stairwell cells use
`openToAbove` / `openToBelow` to leave a vertical shaft; the player walks the ramp
(a tilted collider with decorative treads) between levels. Cross-floor
`connections` keep the graph connected without cutting a horizontal doorway.

```
listing.json ──► buildWorld.js ──► per-floor walls (doorway gaps) + slabs + ceilings
                                    ├─ visible meshes (offset by floor elevation)
                                    ├─ Octree collision (walls + slabs + ramps)
                                    └─ room zones w/ floor (HUD label + floor-aware minimap)
              └► photoPanels.js ──► aspect-correct, unlit, SRGB photo panels (decor)
```

### Files

| Path | Purpose |
|---|---|
| `index.html` | App shell — pinned importmap, gate/HUD/pause DOM. |
| `main.js` | Bootstrap, state machine (gate→walk↔pause↔inspect), render loop. |
| `js/loadListing.js` | Fetch + validate (no room overlaps; BFS reachability). |
| `js/buildWorld.js` | Data→scene compiler (edge-merged walls with doorway subtraction). |
| `js/player.js` | Capsule-vs-Octree physics: gravity, jump, sprint, crouch (+ un-crouch ceiling probe). |
| `js/controls.js` | Pointer-lock mouse-look (sensitivity, invert-Y) + keyboard intent. |
| `js/hud.js` | Room label, facts, crosshair, live minimap with heading cone. |
| `js/ui.js` | Gate, pause/settings (localStorage), mobile gate, photo tour. |
| `js/splat.js` | mkkellogg splat viewer (reads `listing.splat` from `listing.json`). |
| `listing.json` | Floor plan + facts + photo map + splat config. |
| `css/styles.css` | Warm-neutral dark + brass premium visual system. |
| `.nojekyll` | Required so GitHub Pages serves all files. |

Physics mirror the canonical [three.js `games/fps`](https://threejs.org/examples/#games_fps)
reference: `Octree` + `Capsule`, `GRAVITY = 30`, fixed sub-stepping
(`Math.min(0.05, delta) / 5`) to prevent tunneling.

---

## Run it locally

```bash
python3 -m http.server 8123
# open http://127.0.0.1:8123/
```

No build, no npm install. Three.js and the splat lib load from a pinned CDN
(jsDelivr) via `<script type="importmap">`.

## Swap in a real Zillow listing

1. Follow [`tools/capture-listing.md`](tools/capture-listing.md) to grab facts +
   room photos into `assets/rooms/` (downscaled with `sips -Z 1600`).
2. Edit `listing.json`: facts, `heroImage`, and each room's `photos[].url`.
3. Reload. The world rebuilds from data — no code change.

Rooms not yet photographed render a tasteful "photo pending" placeholder, so the
app is always walkable.

---

## How this was built 🛠️

Built with **Claude Code** (Opus 4.8, 1M context) in a single session, using an
agentic pipeline:

**Skills invoked**
- `karpathy-guidelines` — first-principles framing for the research phase.
- `threejs` — engine grounding.
- `frontend-design` — the premium landing gate + HUD visual direction.
- `superpowers:using-superpowers` — skill discipline.

**Agent workflow** (5 parallel agents via the Workflow orchestrator, Karpathy framing)
1. **Three.js FPS engine** research — verified r185 APIs, CDN URLs, the `THREE.Timer`
   breaking change, collision/crouch/sprint code.
2. **Gaussian-splat integration** research — compared mkkellogg vs PlayCanvas
   `supersplat-viewer` vs engine gsplat; chose the isolated mkkellogg path;
   flagged the GitHub-Pages `SharedArrayBuffer` gotcha.
3. **UX / product spec** — screen flow, HUD, settings, accessibility, mobile.
4. **Zillow→floorplan data model** — the `listing.json` schema + a validated
   example floor plan.
5. **Architecture synthesis** — reconciled the four into this build plan.

**QA** — driven headlessly with Playwright: collision (sprint into a wall → stops
at the capsule radius), locomotion, doorway passage, and the splat load were all
verified before deploy.

**PlayCanvas / Gaussian-Splatting toolchain** (forked on this account, the same
stack the viral thread points at, kept for the real capture→splat roadmap):
[`engine`](https://github.com/wilsonwu-ai/engine) ·
[`supersplat`](https://github.com/wilsonwu-ai/supersplat) ·
[`supersplat-viewer`](https://github.com/wilsonwu-ai/supersplat-viewer) ·
[`splat-transform`](https://github.com/wilsonwu-ai/splat-transform) ·
[`video-scout`](https://github.com/wilsonwu-ai/video-scout).

**Runtime dependencies (CDN, pinned)**
- [`three@0.185.1`](https://www.npmjs.com/package/three) — walkable house.
- [`@mkkellogg/gaussian-splats-3d@0.4.7`](https://github.com/mkkellogg/GaussianSplats3D) + `three@0.160.0` — splat mode.
- Fonts: Fraunces + Inter (Google Fonts, with system fallbacks).
- Sample splat: [`train.splat`](https://huggingface.co/cakewalk/splat-data) (public).

---

## Roadmap

- [ ] Swap in a real captured Zillow listing (data + photos).
- [ ] **Walk *inside* a splat** — mkkellogg `DropInViewer` + the WASD rig on an isolated page.
- [ ] Touch controls (virtual joystick + drag-look) for a walkable mobile mode.
- [ ] End-to-end real capture→splat of a home (video-scout → COLMAP → 3DGS training → splat-transform).

## License / attribution

Personal, non-commercial proof-of-concept. Listing photos, when added, remain
© their listing agent / MLS — attributed on-screen and linked to source. Not
affiliated with Zillow or PlayCanvas.
