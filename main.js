// main.js — Roam bootstrap + state machine + render loop.
// States: gate → walk ↔ pause ↔ inspect ; mobile → mobile gate (no 3D).

import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { loadListing } from './js/loadListing.js';
import { buildWorld } from './js/buildWorld.js';
import { createPhotoPanels } from './js/photoPanels.js';
import { createPlayer } from './js/player.js';
import { createControls } from './js/controls.js';
import { createHUD } from './js/hud.js';
import { createUI } from './js/ui.js';

const STEPS = 5;

let controls, player, hud, ui, camera;
let hovered = null;
let state = 'gate';

boot().catch((err) => {
  console.error('[roam] fatal:', err);
  document.getElementById('load-msg').textContent = 'Could not load the walkthrough. See console.';
});

async function boot() {
  const listing = await loadListing('./listing.json');

  // UI first (owns settings, which controls needs). Actions close over vars set below.
  ui = createUI({
    listing,
    actions: { enter, pause, resume, exit, openSplat, applyFov, applyCrosshair },
  });
  const settings = ui.settings;

  // Mobile: skip the whole 3D engine, show the gate + photo-tour fallback.
  if (ui.isMobile()) { ui.showMobileGate(); return; }

  ui.setLoadProgress(0.2); ui.setLoadMsg('Loading engine…');

  // --- renderer / scene / camera / lights ---
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0f12);

  camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a2, 0.95));
  scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  const dir = new THREE.DirectionalLight(0xfff3e2, 0.5);
  dir.position.set(9, 22, 7);
  scene.add(dir);

  // --- world ---
  ui.setLoadProgress(0.5); ui.setLoadMsg('Building the home…');
  const { collisionGroup, roomZones, bounds, spawn } = buildWorld(listing);
  scene.add(collisionGroup);
  const worldOctree = new Octree();
  worldOctree.fromGraphNode(collisionGroup);

  ui.setLoadProgress(0.8); ui.setLoadMsg('Hanging the photos…');
  const panels = createPhotoPanels(listing.rooms || []);
  scene.add(panels.group);
  const targets = panels.targets;

  // --- player / controls / hud ---
  player = createPlayer({ octree: worldOctree, camera });
  player.spawnAt(spawn.x, spawn.z);

  controls = createControls({
    camera, domElement: renderer.domElement, settings,
    onLock, onUnlock, onAction,
  });
  controls.setYaw(spawn.yaw);

  hud = createHUD({ listing, roomZones, bounds });
  applyFov(settings.fov);
  applyCrosshair(settings.crosshair);

  buildLightbox();

  ui.setLoadProgress(1); ui.hideLoading(); ui.toGate();

  // Lightweight debug hook (harmless; aids QA + future debugging).
  window.__roam = {
    get state() { return state; },
    scene, camera, player, controls, octree: worldOctree, targets, spawn, bounds,
    wallCount: collisionGroup.children.length,
  };

  // --- interaction wiring ---
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || state !== 'walk') return;
    if (!controls.isLocked()) { controls.lock(); return; } // click to (re)capture mouse-look
    if (hovered) openInspect(hovered);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- loop ---
  const timer = new THREE.Timer();
  timer.connect(document); // r185: pauses on tab-hide → no giant delta on refocus
  const raycaster = new THREE.Raycaster();
  raycaster.far = 3.4;
  const _center = new THREE.Vector2(0, 0);

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(0.05, timer.getDelta()) / STEPS;

    if (state === 'walk') {
      const intent = controls.getIntent();
      for (let i = 0; i < STEPS; i++) player.update(dt, intent);
      const moving = intent.moveF || intent.moveB || intent.moveL || intent.moveR;
      hud.update(player.position(), camera.rotation.y, moving);

      if (controls.isLocked()) { // photo-inspect reticle only when the mouse is captured
        raycaster.setFromCamera(_center, camera);
        const hit = raycaster.intersectObjects(targets, false)[0];
        hovered = hit ? hit.object : null;
        hud.setInteract(!!hovered);
        document.getElementById('inspect-prompt').classList.toggle('show', !!hovered);
      } else {
        hovered = null;
      }
    }

    renderer.render(scene, camera);
  });

  // ---------- state actions ----------
  function enter() {
    if (state !== 'gate') return;
    state = 'walk';
    ui.toHUD(); ui.showHint();       // show HUD immediately — don't depend on lock succeeding
    controls.lock();                 // mouse-look engages if the browser grants it
    // Fallback: if pointer lock is blocked, offer a click-to-look shade so we never freeze on the gate.
    setTimeout(() => { if (state === 'walk' && !controls.isLocked()) ui.showResume(); }, 500);
  }
  function pause() { state = 'pause'; controls.unlock(); ui.openPause(); }
  function resume() { ui.hideResume(); ui.closePause(); state = 'walk'; controls.lock(); }
  function exit() {
    state = 'gate'; controls.unlock(); controls.resetKeys(); ui.hideResume();
    player.spawnAt(spawn.x, spawn.z); controls.setYaw(spawn.yaw);
    ui.toGate();
  }
  function onLock() {
    ui.hideResume(); ui.closePause();
    if (state !== 'inspect') { state = 'walk'; ui.toHUD(); }
  }
  function onUnlock() {
    controls.resetKeys();
    if (hud) hud.setInteract(false);
    document.getElementById('inspect-prompt').classList.remove('show');
    // Esc / alt-tab while genuinely walking → open the pause menu (settings reachable).
    if (state === 'walk') { state = 'pause'; ui.openPause(); }
  }
  function onAction(code) {
    if (code === 'KeyE' && hovered) openInspect(hovered);
    if (code === 'KeyM') document.getElementById('minimap').classList.toggle('hidden');
  }
  function applyFov(v) { camera.fov = v; camera.updateProjectionMatrix(); }
  function applyCrosshair(on) { hud && hud.setCrosshairVisible(on); }
  function openSplat() { window.location.href = (listing.splat && listing.splat.viewer) || './splat.html'; }

  function openInspect(target) {
    state = 'inspect';
    controls.unlock();
    const img = document.getElementById('lb-img');
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
    img.src = target.userData.url;
    document.getElementById('lb-cap').textContent =
      `${target.userData.room}${target.userData.caption ? ' — ' + target.userData.caption : ''}`;
    document.getElementById('lightbox').classList.remove('hidden');
  }
  function closeInspect() {
    document.getElementById('lightbox').classList.add('hidden');
    state = 'walk'; controls.lock();
  }

  function buildLightbox() {
    const lb = document.createElement('div');
    lb.className = 'overlay hidden'; lb.id = 'lightbox';
    lb.innerHTML =
      '<div class="card" style="width:min(920px,96vw);text-align:center">' +
      '<img id="lb-img" alt="" style="max-width:100%;max-height:68vh;border-radius:12px;border:1px solid var(--line);display:block;margin:0 auto"/>' +
      '<div id="lb-cap" style="margin-top:16px;color:var(--text-lo);font-size:14px"></div>' +
      '<div class="card-actions"><button class="btn btn-primary" id="lb-close">Back to walking</button></div></div>';
    document.body.appendChild(lb);
    document.getElementById('lb-close').addEventListener('click', closeInspect);
  }
}
