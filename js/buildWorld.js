// buildWorld.js — pure data→scene compiler.
// From corner-anchored room rectangles (x,z = NW corner, width→+x, depth→+z)
// it emits ONE collisionGroup (floors + walls + ceilings, all visible AND fed to
// the Octree) with doorway gaps subtracted, plus roomZones (for HUD/minimap) and
// a spawn {x,z,yaw}. Photo panels are built separately and are NOT collidable.

import * as THREE from 'three';

const FLOOR_MAT = {
  hardwood_oak: { color: 0x9c6b3f, roughness: 0.55 },
  lvp_greywash: { color: 0xa29e95, roughness: 0.6 },
  carpet_beige: { color: 0xc3b7a3, roughness: 0.95 },
  tile_ceramic: { color: 0xdcd7ce, roughness: 0.25 },
  tile_marble:  { color: 0xe8e5de, roughness: 0.14 },
  concrete:     { color: 0x939393, roughness: 0.8 },
};
const WALL_COLOR    = 0xe8e3d9;
const CEIL_COLOR    = 0xf4f1ea;
const FACE_YAW = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

const r3 = (v) => Math.round(v * 1000) / 1000;

function mergeIntervals(list) {
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of list) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractGaps(intervals, gaps) {
  let segs = intervals.map((iv) => iv.slice());
  for (const g of gaps) {
    const next = [];
    for (const [a, b] of segs) {
      if (g[1] <= a + 1e-6 || g[0] >= b - 1e-6) { next.push([a, b]); continue; }
      if (g[0] > a + 1e-6) next.push([a, g[0]]);
      if (g[1] < b - 1e-6) next.push([g[1], b]);
    }
    segs = next;
  }
  return segs.filter(([a, b]) => b - a > 0.06);
}

function sharedEdge(A, B) {
  const ax0 = A.x, ax1 = A.x + A.width, az0 = A.z, az1 = A.z + A.depth;
  const bx0 = B.x, bx1 = B.x + B.width, bz0 = B.z, bz1 = B.z + B.depth;
  const zo = [Math.max(az0, bz0), Math.min(az1, bz1)];
  const xo = [Math.max(ax0, bx0), Math.min(ax1, bx1)];
  if (Math.abs(ax1 - bx0) < 1e-3 && zo[1] - zo[0] > 1e-3) return { axis: 'v', line: ax1, span: zo };
  if (Math.abs(ax0 - bx1) < 1e-3 && zo[1] - zo[0] > 1e-3) return { axis: 'v', line: ax0, span: zo };
  if (Math.abs(az1 - bz0) < 1e-3 && xo[1] - xo[0] > 1e-3) return { axis: 'h', line: az1, span: xo };
  if (Math.abs(az0 - bz1) < 1e-3 && xo[1] - xo[0] > 1e-3) return { axis: 'h', line: az0, span: xo };
  return null;
}

export function buildWorld(listing) {
  const rooms = listing.rooms || [];
  const t = (listing.defaults && listing.defaults.wallThickness) || 0.12;
  const maxCeil = Math.max(2.6, ...rooms.map((r) => r.height || 2.6));
  const collisionGroup = new THREE.Group();

  // ---- Floors + ceilings (per room) --------------------------------------
  for (const r of rooms) {
    const cx = r.x + r.width / 2, cz = r.z + r.depth / 2, h = r.height || 2.6;
    const fm = FLOOR_MAT[r.floorMaterial] || FLOOR_MAT.lvp_greywash;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(r.width, 0.2, r.depth),
      new THREE.MeshStandardMaterial({ color: fm.color, roughness: fm.roughness })
    );
    floor.position.set(cx, -0.1, cz);
    collisionGroup.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(r.width, 0.2, r.depth),
      new THREE.MeshStandardMaterial({ color: CEIL_COLOR, roughness: 1 })
    );
    ceil.position.set(cx, h + 0.1, cz);
    collisionGroup.add(ceil);
  }

  // ---- Wall lines: collect every room edge, merged per line --------------
  const vLines = new Map(); // x → [[z0,z1]]
  const hLines = new Map(); // z → [[x0,x1]]
  const push = (map, key, a, b) => {
    const k = r3(key);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push([Math.min(a, b), Math.max(a, b)]);
  };
  for (const r of rooms) {
    const x0 = r.x, x1 = r.x + r.width, z0 = r.z, z1 = r.z + r.depth;
    push(vLines, x0, z0, z1);
    push(vLines, x1, z0, z1);
    push(hLines, z0, x0, x1);
    push(hLines, z1, x0, x1);
  }

  // ---- Door/opening gaps per line ----------------------------------------
  const vGaps = new Map(); // x → [[z0,z1]]
  const hGaps = new Map(); // z → [[x0,x1]]
  const byId = new Map(rooms.map((r) => [r.id, r]));
  for (const op of listing.openings || []) {
    const A = byId.get(op.between[0]), B = byId.get(op.between[1]);
    if (!A || !B) continue;
    const e = sharedEdge(A, B);
    if (!e) { console.warn(`[roam] no shared wall for opening ${op.between.join(' ↔ ')}`); continue; }
    const w = op.width || 0.95;
    const mid = op.center != null
      ? (e.axis === 'v' ? op.center.z : op.center.x)
      : (e.span[0] + e.span[1]) / 2;
    let g0 = mid - w / 2, g1 = mid + w / 2;
    g0 = Math.max(g0, e.span[0]); g1 = Math.min(g1, e.span[1]);
    const map = e.axis === 'v' ? vGaps : hGaps;
    const k = r3(e.line);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push([g0, g1]);
  }

  // ---- Emit wall segments (openings are full-height cased openings) -------
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.96 });
  for (const [x, segsRaw] of vLines) {
    const segs = subtractGaps(mergeIntervals(segsRaw), vGaps.get(x) || []);
    for (const [z0, z1] of segs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(t, maxCeil, z1 - z0), wallMat);
      wall.position.set(x, maxCeil / 2, (z0 + z1) / 2);
      collisionGroup.add(wall);
    }
  }
  for (const [z, segsRaw] of hLines) {
    const segs = subtractGaps(mergeIntervals(segsRaw), hGaps.get(z) || []);
    for (const [x0, x1] of segs) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, maxCeil, t), wallMat);
      wall.position.set((x0 + x1) / 2, maxCeil / 2, z);
      collisionGroup.add(wall);
    }
  }

  // ---- Room zones (HUD label + minimap) ----------------------------------
  const roomZones = rooms.map((r) => ({
    id: r.id, name: r.name, type: r.type,
    x: r.x, z: r.z, width: r.width, depth: r.depth,
  }));

  // ---- Bounds + spawn -----------------------------------------------------
  const bounds = {
    minX: Math.min(...rooms.map((r) => r.x)),
    maxX: Math.max(...rooms.map((r) => r.x + r.width)),
    minZ: Math.min(...rooms.map((r) => r.z)),
    maxZ: Math.max(...rooms.map((r) => r.z + r.depth)),
  };
  const spawnRoom = byId.get((listing.spawn && listing.spawn.room)) || byId.get('entry') || rooms[0];
  const facing = (listing.spawn && listing.spawn.facing) || 'west';
  const spawn = {
    x: spawnRoom.x + spawnRoom.width / 2,
    z: spawnRoom.z + spawnRoom.depth / 2,
    yaw: FACE_YAW[facing] ?? Math.PI / 2,
  };

  return { collisionGroup, roomZones, bounds, spawn };
}
