// hud.js — floor-aware in-experience HUD: current-floor badge + room label
// (from roomZones on the player's floor), facts chip, crosshair state, idle
// fade, and a live 2D minimap that shows only the current floor.

const $ = (id) => document.getElementById(id);

export function createHUD({ listing, roomZones, bounds, floors }) {
  const addressEl = $('hud-address');
  const roomEl = $('room-label');
  const badgeEl = $('floor-badge');
  const factsEl = $('facts-chip');
  const crosshair = $('crosshair');
  const hud = $('hud');
  const mm = $('minimap').querySelector('canvas');
  const ctx = mm.getContext('2d');

  addressEl.textContent = listing.address || '';
  factsEl.innerHTML = factsLine(listing);

  const F = (floors && floors.length) ? floors : [{ id: 'main', name: 'Main', elevation: 0 }];
  const multiFloor = F.length > 1;

  const W = mm.width, H = mm.height, PAD = 14;
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const scale = Math.min((W - 2 * PAD) / worldW, (H - 2 * PAD) / worldD);
  const offX = (W - worldW * scale) / 2;
  const offY = (H - worldD * scale) / 2;
  const toMapX = (x) => offX + (x - bounds.minX) * scale;
  const toMapY = (z) => offY + (z - bounds.minZ) * scale;

  let currentId = null;
  let currentFloorId = null;
  let idle = 0;

  function floorAt(y) {
    let best = F[0];
    for (const f of F) if (f.elevation <= y - 0.8 + 1e-6) best = f; // F ascending
    return best;
  }
  function roomAt(x, z, floorId) {
    for (const r of roomZones) {
      if (r.floor !== floorId) continue;
      if (x >= r.x && x <= r.x + r.width && z >= r.z && z <= r.z + r.depth) return r;
    }
    return null;
  }
  function setRoom(name) {
    roomEl.style.opacity = '0';
    setTimeout(() => { roomEl.textContent = name; roomEl.style.opacity = '1'; }, 130);
  }
  function setBadge(f) {
    if (!badgeEl) return;
    if (!multiFloor) { badgeEl.classList.add('hidden'); return; }
    const idx = F.indexOf(f) + 1;
    badgeEl.textContent = `${(f.name || f.id).toUpperCase()} · ${idx}/${F.length}`;
    badgeEl.classList.remove('hidden');
  }

  function drawMinimap(px, pz, yaw, cur, floorId) {
    ctx.clearRect(0, 0, W, H);
    for (const r of roomZones) {
      if (r.floor !== floorId) continue;
      const x = toMapX(r.x), y = toMapY(r.z), w = r.width * scale, h = r.depth * scale;
      if (cur && r.id === cur.id) { ctx.fillStyle = 'rgba(200,169,106,0.22)'; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = 'rgba(154,160,171,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    const mx = toMapX(px), my = toMapY(pz);
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const ang = Math.atan2(dz, dx);
    ctx.fillStyle = 'rgba(228,207,154,0.28)';
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, 16, ang - 0.32, ang + 0.32); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E4CF9A';
    ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, Math.PI * 2); ctx.fill();
  }

  function update(pos, yaw, moving) {
    const f = floorAt(pos.y);
    if (f.id !== currentFloorId) { currentFloorId = f.id; setBadge(f); }
    const cur = roomAt(pos.x, pos.z, f.id);
    if (cur && cur.id !== currentId) { currentId = cur.id; setRoom(cur.name); }
    idle = moving ? 0 : idle + 1;
    hud.classList.toggle('idle', idle > 180);
    drawMinimap(pos.x, pos.z, yaw, cur, f.id);
  }

  function setInteract(on) { crosshair.classList.toggle('interact', on); }
  function setCrosshairVisible(on) { crosshair.classList.toggle('off', !on); }
  function nudge() { idle = 0; }

  return { update, setInteract, setCrosshairVisible, nudge };
}

function factsLine(l) {
  const parts = [];
  if (l.beds != null) parts.push(`<b>${l.beds}</b> bd`);
  if (l.baths != null) parts.push(`<b>${l.baths}</b> ba`);
  if (l.sqft != null) parts.push(`<b>${Number(l.sqft).toLocaleString()}</b> sqft`);
  if (l.yearBuilt) parts.push(`Built ${l.yearBuilt}`);
  return parts.join(' &nbsp;·&nbsp; ');
}
