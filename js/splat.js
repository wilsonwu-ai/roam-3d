// splat.js — real 3D Gaussian Splat showcase via @mkkellogg/gaussian-splats-3d.
// Isolated page (three@0.160). sharedMemoryForWorkers:false is REQUIRED on
// GitHub Pages (no COOP/COEP headers → no SharedArrayBuffer). Reads the splat
// source + honesty note from listing.json so it stays the single source of truth.

import * as THREE from 'three';

const params = new URLSearchParams(location.search);
const loadingEl = document.getElementById('splat-loading');
const DEFAULT_SPLAT = 'https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat';

init();

async function init() {
  let cfg = {};
  try {
    const r = await fetch('./listing.json', { cache: 'no-cache' });
    if (r.ok) cfg = (await r.json()).splat || {};
  } catch { /* use defaults */ }

  const src = params.get('src') || cfg.src || DEFAULT_SPLAT;
  if (cfg.label) document.getElementById('splat-label').textContent = cfg.label;
  if (cfg.note) document.getElementById('splat-note').textContent = cfg.note;

  let GS;
  try {
    GS = await import('@mkkellogg/gaussian-splats-3d');
  } catch (e) {
    return fail('Could not load the 3D splat engine from the CDN. Check your connection and reload.', e);
  }

  try {
    const viewer = new GS.Viewer({
      cameraUp: [0, -1, 0],                 // these public sample splats are y-down
      initialCameraPosition: [-1, -1, 2.6],
      initialCameraLookAt: [0, 0, 0],
      sharedMemoryForWorkers: false,        // GitHub Pages has no COOP/COEP → no SAB
      useBuiltInControls: true,
    });
    await viewer.addSplatScene(src, {
      showLoadingUI: true,
      splatAlphaRemovalThreshold: 5,
      progressiveLoad: true,
    });
    viewer.start();
    loadingEl.classList.add('hidden');
  } catch (e) {
    fail('Could not load the splat scene. It may be large or temporarily unavailable.', e);
  }
}

function fail(msg, e) {
  console.error('[roam:splat]', msg, e);
  loadingEl.innerHTML =
    '<div class="msg">' + msg +
    '<br><br><a class="gate-splat-link" href="./index.html">← Back to walking the home</a></div>';
  loadingEl.classList.remove('hidden');
}
