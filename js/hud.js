// hud.js — in-experience HUD: current-room label (fed by roomZones), facts chip,
// crosshair state, idle-fade of ambient chrome, and a live 2D minimap (room
// outlines + player dot + heading cone) driven by the SAME roomZones array.

const $ = (id) => document.getElementById(id);

export function createHUD({ listing, roomZones, bounds }) {
  const addressEl = $('hud-address');
  const roomEl = $('room-label');
  const factsEl = $('facts-chip');
  const crosshair = $('crosshair');
  const hud = $('hud');
  const mm = $('minimap').querySelector('canvas');
  const ctx = mm.getContext('2d');

  addressEl.textContent = listing.address || '';
  factsEl.innerHTML = factsLine(listing);

  const W = mm.width, H = mm.height, PAD = 14;
  const worldW = bounds.maxX - bounds.minX;
  const worldD = bounds.maxZ - bounds.minZ;
  const scale = Math.min((W - 2 * PAD) / worldW, (H - 2 * PAD) / worldD);
  const offX = (W - worldW * scale) / 2;
  const offY = (H - worldD * scale) / 2;
  const toMapX = (x) => offX + (x - bounds.minX) * scale;
  const toMapY = (z) => offY + (z - bounds.minZ) * scale;

  let currentId = null;
  let idle = 0;

  function roomAt(x, z) {
    for (const r of roomZones) {
      if (x >= r.x && x <= r.x + r.width && z >= r.z && z <= r.z + r.depth) return r;
    }
    return null;
  }

  function setRoom(name) {
    roomEl.style.opacity = '0';
    setTimeout(() => { roomEl.textContent = name; roomEl.style.opacity = '1'; }, 130);
  }

  function drawMinimap(px, pz, yaw, cur) {
    ctx.clearRect(0, 0, W, H);
    for (const r of roomZones) {
      const x = toMapX(r.x), y = toMapY(r.z), w = r.width * scale, h = r.depth * scale;
      if (cur && r.id === cur.id) { ctx.fillStyle = 'rgba(200,169,106,0.22)'; ctx.fillRect(x, y, w, h); }
      ctx.strokeStyle = 'rgba(154,160,171,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    const mx = toMapX(px), my = toMapY(pz);
    // heading cone: world dir = (-sin yaw, -cos yaw); +x→right, +z→down
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    const ang = Math.atan2(dz, dx);
    ctx.fillStyle = 'rgba(228,207,154,0.28)';
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.arc(mx, my, 16, ang - 0.32, ang + 0.32);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#E4CF9A';
    ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, Math.PI * 2); ctx.fill();
  }

  function update(pos, yaw, moving) {
    const cur = roomAt(pos.x, pos.z);
    if (cur && cur.id !== currentId) { currentId = cur.id; setRoom(cur.name); }
    idle = moving ? 0 : idle + 1;
    hud.classList.toggle('idle', idle > 180);
    drawMinimap(pos.x, pos.z, yaw, cur);
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
