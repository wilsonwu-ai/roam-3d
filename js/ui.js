// ui.js — all non-3D UI + settings. Owns the DOM overlays (gate, pause/settings,
// resume shade, mobile gate, photo tour, first-run hint) and a settings object
// persisted to localStorage. main.js drives it via the returned methods and
// receives user intent through the `actions` callbacks.

const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  sensitivity: 1.0,
  fov: 75,
  invertY: false,
  sprintMode: 'hold',
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  crosshair: true,
};

function factsLine(l, withYear) {
  const p = [];
  if (l.beds != null) p.push(`<b>${l.beds}</b> bd`);
  if (l.baths != null) p.push(`<b>${l.baths}</b> ba`);
  if (l.sqft != null) p.push(`<b>${Number(l.sqft).toLocaleString()}</b> sqft`);
  if (withYear && l.yearBuilt) p.push(`Built ${l.yearBuilt}`);
  return p.join(' &nbsp;·&nbsp; ');
}

export function createUI({ listing, actions }) {
  const settings = loadSettings();

  // ---- Gate content -------------------------------------------------------
  $('gate-price').textContent = listing.price != null ? '$' + Number(listing.price).toLocaleString() : '';
  $('gate-address').textContent = listing.address || '';
  $('gate-facts').innerHTML = factsLine(listing, true);
  if (listing.heroImage) {
    const probe = new Image();
    probe.onload = () => { $('gate-hero').style.backgroundImage = `url("${listing.heroImage}")`; };
    probe.src = listing.heroImage; // if it 404s, the gradient bg-color remains
  }
  if (listing.attribution) {
    const src = listing.sourceUrl ? ` · <a href="${listing.sourceUrl}" target="_blank" rel="noopener">source</a>` : '';
    $('attrib').innerHTML = listing.attribution + src;
  }

  // ---- Buttons / links ----------------------------------------------------
  $('enter-btn').addEventListener('click', () => actions.enter());
  $('help-btn').addEventListener('click', () => actions.pause());
  $('resume-btn').addEventListener('click', () => actions.resume());
  $('exit-btn').addEventListener('click', () => actions.exit());
  $('resume').addEventListener('click', () => actions.resume());
  for (const id of ['gate-splat-tab', 'gate-splat-link', 'hud-splat-tab', 'mobile-splat-link'])
    $(id).addEventListener('click', () => actions.openSplat());

  // ---- Settings wiring ----------------------------------------------------
  const sens = $('set-sens'), fov = $('set-fov');
  const invert = $('set-invert'), motion = $('set-motion'), cross = $('set-crosshair');
  const sprint = $('set-sprint');

  function reflect() {
    sens.value = settings.sensitivity; $('sens-val').textContent = settings.sensitivity.toFixed(1) + '×';
    fov.value = settings.fov; $('fov-val').textContent = settings.fov + '°';
    invert.classList.toggle('on', settings.invertY);
    motion.classList.toggle('on', settings.reduceMotion);
    cross.classList.toggle('on', settings.crosshair);
    [...sprint.children].forEach((b) => b.classList.toggle('on', b.dataset.v === settings.sprintMode));
    document.getElementById('gate').classList.toggle('reduce', settings.reduceMotion);
  }

  sens.addEventListener('input', () => { settings.sensitivity = +sens.value; $('sens-val').textContent = settings.sensitivity.toFixed(1) + '×'; save(settings); });
  fov.addEventListener('input', () => { settings.fov = +fov.value; $('fov-val').textContent = settings.fov + '°'; actions.applyFov(settings.fov); save(settings); });
  invert.addEventListener('click', () => { settings.invertY = !settings.invertY; invert.classList.toggle('on', settings.invertY); save(settings); });
  motion.addEventListener('click', () => { settings.reduceMotion = !settings.reduceMotion; reflect(); save(settings); });
  cross.addEventListener('click', () => { settings.crosshair = !settings.crosshair; cross.classList.toggle('on', settings.crosshair); actions.applyCrosshair(settings.crosshair); save(settings); });
  [...sprint.children].forEach((b) => b.addEventListener('click', () => { settings.sprintMode = b.dataset.v; reflect(); save(settings); }));
  reflect();

  // ---- Photo tour (mobile fallback) --------------------------------------
  const photos = (listing.rooms || []).flatMap((r) => (r.photos || []).map((p) => ({ url: p.url, caption: p.caption || r.name, room: r.name })));
  let ptIndex = 0;
  function renderTour() {
    if (!photos.length) return;
    const p = photos[ptIndex];
    const img = $('pt-img');
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; $('pt-cap').textContent = `${p.room} — photo pending`; };
    img.onload = () => { img.style.display = 'block'; };
    img.src = p.url;
    $('pt-cap').textContent = p.caption;
    $('pt-count').textContent = `${ptIndex + 1} / ${photos.length}`;
  }
  $('pt-prev').addEventListener('click', () => { ptIndex = (ptIndex - 1 + photos.length) % photos.length; renderTour(); });
  $('pt-next').addEventListener('click', () => { ptIndex = (ptIndex + 1) % photos.length; renderTour(); });
  $('pt-close').addEventListener('click', () => $('photo-tour').classList.add('hidden'));
  $('mobile-tour-btn').addEventListener('click', () => { renderTour(); $('photo-tour').classList.remove('hidden'); });

  // ---- First-run hint -----------------------------------------------------
  function showHint() {
    if (localStorage.getItem('roam.seenHint')) return;
    const hint = $('hint');
    hint.classList.remove('hidden', 'fade');
    const done = () => { hint.classList.add('fade'); setTimeout(() => hint.classList.add('hidden'), 700); localStorage.setItem('roam.seenHint', '1'); window.removeEventListener('keydown', done); };
    setTimeout(done, 4200);
    window.addEventListener('keydown', done, { once: true });
  }

  // ---- Screen transitions -------------------------------------------------
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');

  return {
    settings,
    isMobile: () => matchMedia('(pointer: coarse)').matches || innerWidth < 720,
    setLoadProgress(p) { $('load-bar').style.width = Math.round(p * 100) + '%'; },
    setLoadMsg(m) { $('load-msg').textContent = m; },
    hideLoading() { hide('loading'); },
    toGate() { show('gate'); hide('hud'); hide('pause'); hide('resume'); hide('attrib'); },
    toHUD() { hide('gate'); hide('pause'); hide('resume'); show('hud'); show('attrib'); },
    openPause() { show('pause'); hide('resume'); },
    closePause() { hide('pause'); },
    showResume() { show('resume'); },
    hideResume() { hide('resume'); },
    showMobileGate() { hide('loading'); hide('gate'); show('mobile-gate'); },
    showHint,
  };
}

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('roam.settings') || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function save(s) { try { localStorage.setItem('roam.settings', JSON.stringify(s)); } catch {} }
