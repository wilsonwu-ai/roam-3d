// buildWorld.js — pure data→scene compiler (multi-floor).
// Rooms carry a `floor` id; floors have an elevation. Each floor's rooms are
// built at that elevation with per-floor walls (doorways subtracted), floor
// slabs, and ceilings. `openToAbove` skips a room's ceiling and `openToBelow`
// skips its slab so a stairwell is a vertical shaft. `stairs` add walkable
// ramps between floors. Photo panels are built separately and never collidable.

import * as THREE from 'three';

const FLOOR_MAT = {
  hardwood_oak: { color: 0x9c6b3f, roughness: 0.55 },
  hardwood_light: { color: 0xc9a878, roughness: 0.5 },
  lvp_greywash: { color: 0xa29e95, roughness: 0.6 },
  carpet_beige: { color: 0xc3b7a3, roughness: 0.95 },
  tile_ceramic: { color: 0xdcd7ce, roughness: 0.25 },
  tile_marble:  { color: 0xe8e5de, roughness: 0.14 },
  concrete:     { color: 0x939393, roughness: 0.8 },
};
const WALL_COLOR = 0xe8e3d9;
const CEIL_COLOR = 0xf4f1ea;
const RAMP_COLOR = 0x8a7a5c;
const TREAD_COLOR = 0x6f5f45;
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

function buildStair(s, collisionGroup, decorGroup) {
  const { x, z, width: W, depth: D } = s.footprint;
  const eHigh = s.elevHigh, eLow = s.elevLow;
  const rise = eHigh - eLow;
  const alongZ = (s.highEdge === 'north' || s.highEdge === 'south');
  const run = alongZ ? D : W;
  const slopeLen = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);

  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(alongZ ? W : slopeLen, 0.3, alongZ ? slopeLen : W),
    new THREE.MeshStandardMaterial({ color: RAMP_COLOR, roughness: 0.85 })
  );
  ramp.position.set(x + W / 2, (eHigh + eLow) / 2, z + D / 2);
  // Tilt so the `highEdge` side sits at eHigh. Rotation about X by +angle puts
  // the -z (north) end high; mirror for the other edges. Verified by walking it.
  if (alongZ) ramp.rotation.x = (s.highEdge === 'north' ? angle : -angle);
  else        ramp.rotation.z = (s.highEdge === 'west' ? -angle : angle);
  collisionGroup.add(ramp);

  // Decorative treads (never collidable).
  const steps = Math.max(6, Math.round(run / 0.45));
  const treadMat = new THREE.MeshStandardMaterial({ color: TREAD_COLOR, roughness: 0.7 });
  for (let i = 0; i < steps; i++) {
    const f = (i + 0.5) / steps; // 0 (low) → 1 (high)
    const tread = new THREE.Mesh(
      new THREE.BoxGeometry(alongZ ? W - 0.12 : 0.34, 0.07, alongZ ? 0.34 : W - 0.12),
      treadMat
    );
    let px = x + W / 2, pz = z + D / 2;
    const py = eLow + f * rise + 0.17;
    if (alongZ) pz = (s.highEdge === 'north') ? (z + D) - f * D : z + f * D;
    else px = (s.highEdge === 'west') ? (x + W) - f * W : x + f * W;
    tread.position.set(px, py, pz);
    decorGroup.add(tread);
  }
}

export function buildWorld(listing) {
  const rooms = listing.rooms || [];
  const t = (listing.defaults && listing.defaults.wallThickness) || 0.12;
  const collisionGroup = new THREE.Group();
  const decorGroup = new THREE.Group();

  // ---- Floors ----
  const floorDefs = (listing.floors && listing.floors.length)
    ? listing.floors.map((f) => ({ ...f }))
    : [{ id: 'main', elevation: 0 }];
  const sorted = [...floorDefs].sort((a, b) => a.elevation - b.elevation);
  sorted.forEach((f, i) => {
    f.wallTop = (i < sorted.length - 1) ? sorted[i + 1].elevation : f.elevation + 3.0;
  });
  const floorById = new Map(sorted.map((f) => [f.id, f]));
  const defaultFloor = sorted.find((f) => f.elevation === 0)?.id || sorted[0].id;
  const floorOf = (r) => r.floor || defaultFloor;
  const elevOf = (r) => (floorById.get(floorOf(r)) || { elevation: 0 }).elevation;

  const byId = new Map(rooms.map((r) => [r.id, r]));
  const roomZones = [];

  // ---- Build each floor ----
  for (const fdef of sorted) {
    const frooms = rooms.filter((r) => floorOf(r) === fdef.id);
    if (!frooms.length) continue;
    const elev = fdef.elevation;
    const wallH = fdef.wallTop - elev;

    // floors + ceilings + zones
    for (const r of frooms) {
      const cx = r.x + r.width / 2, cz = r.z + r.depth / 2, h = r.height || 2.7;
      if (!r.openToBelow) {
        const fm = FLOOR_MAT[r.floorMaterial] || FLOOR_MAT.lvp_greywash;
        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(r.width, 0.2, r.depth),
          new THREE.MeshStandardMaterial({ color: fm.color, roughness: fm.roughness })
        );
        floor.position.set(cx, elev - 0.1, cz);
        collisionGroup.add(floor);
      }
      if (!r.openToAbove) {
        const ceil = new THREE.Mesh(
          new THREE.BoxGeometry(r.width, 0.2, r.depth),
          new THREE.MeshStandardMaterial({ color: CEIL_COLOR, roughness: 1 })
        );
        ceil.position.set(cx, elev + h + 0.1, cz);
        collisionGroup.add(ceil);
      }
      roomZones.push({
        id: r.id, name: r.name, type: r.type, floor: fdef.id,
        x: r.x, z: r.z, width: r.width, depth: r.depth,
        yBase: elev, yTop: elev + (r.openToAbove ? wallH : h),
      });
    }

    // wall lines (edges merged within this floor)
    const vLines = new Map(), hLines = new Map();
    const push = (map, key, a, b) => {
      const k = r3(key);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push([Math.min(a, b), Math.max(a, b)]);
    };
    for (const r of frooms) {
      const x0 = r.x, x1 = r.x + r.width, z0 = r.z, z1 = r.z + r.depth;
      push(vLines, x0, z0, z1); push(vLines, x1, z0, z1);
      push(hLines, z0, x0, x1); push(hLines, z1, x0, x1);
    }

    // door gaps (explicit openings + same-floor connections)
    const vGaps = new Map(), hGaps = new Map();
    const doneEdges = new Set();
    const edgeKey = (a, b) => [a, b].sort().join('|');
    const froomIds = new Set(frooms.map((r) => r.id));
    const addGap = (A, B, width, center) => {
      const e = sharedEdge(A, B);
      if (!e) { console.warn(`[roam] no shared wall between "${A.id}" and "${B.id}"`); return; }
      const span = e.span[1] - e.span[0];
      let w = width != null ? width : Math.min(Math.max(span * 0.6, 0.95), 2.4);
      w = Math.min(w, span - 0.15);
      if (w <= 0) return;
      const mid = center != null ? (e.axis === 'v' ? center.z : center.x) : (e.span[0] + e.span[1]) / 2;
      const g0 = Math.max(mid - w / 2, e.span[0]);
      const g1 = Math.min(mid + w / 2, e.span[1]);
      const map = e.axis === 'v' ? vGaps : hGaps;
      const k = r3(e.line);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push([g0, g1]);
    };
    for (const op of listing.openings || []) {
      const A = byId.get(op.between[0]), B = byId.get(op.between[1]);
      if (!A || !B || floorOf(A) !== fdef.id || floorOf(B) !== fdef.id) continue;
      addGap(A, B, op.width, op.center);
      doneEdges.add(edgeKey(A.id, B.id));
    }
    for (const r of frooms) {
      for (const cid of (r.connections || [])) {
        if (!froomIds.has(cid)) continue; // cross-floor links handled by stairs, not doors
        const key = edgeKey(r.id, cid);
        if (doneEdges.has(key)) continue;
        addGap(r, byId.get(cid));
        doneEdges.add(key);
      }
    }

    // emit walls
    const wallMat = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.96 });
    for (const [x, segsRaw] of vLines) {
      const segs = subtractGaps(mergeIntervals(segsRaw), vGaps.get(x) || []);
      for (const [z0, z1] of segs) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(t, wallH, z1 - z0), wallMat);
        wall.position.set(x, elev + wallH / 2, (z0 + z1) / 2);
        collisionGroup.add(wall);
      }
    }
    for (const [z, segsRaw] of hLines) {
      const segs = subtractGaps(mergeIntervals(segsRaw), hGaps.get(z) || []);
      for (const [x0, x1] of segs) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, wallH, t), wallMat);
        wall.position.set((x0 + x1) / 2, elev + wallH / 2, z);
        collisionGroup.add(wall);
      }
    }
  }

  // ---- Stairs ----
  for (const s of listing.stairs || []) buildStair(s, collisionGroup, decorGroup);

  // ---- Bounds (all floors) + spawn ----
  const bounds = {
    minX: Math.min(...rooms.map((r) => r.x)),
    maxX: Math.max(...rooms.map((r) => r.x + r.width)),
    minZ: Math.min(...rooms.map((r) => r.z)),
    maxZ: Math.max(...rooms.map((r) => r.z + r.depth)),
  };
  const spawnRoom = byId.get((listing.spawn && listing.spawn.room)) || byId.get('foyer') || rooms[0];
  const facing = (listing.spawn && listing.spawn.facing) || 'north';
  const spawn = {
    x: spawnRoom.x + spawnRoom.width / 2,
    z: spawnRoom.z + spawnRoom.depth / 2,
    yaw: FACE_YAW[facing] ?? 0,
    elevation: elevOf(spawnRoom),
  };

  const floors = sorted.map((f) => ({ id: f.id, name: f.name || f.id, elevation: f.elevation, wallTop: f.wallTop }));
  const elevMap = Object.fromEntries(sorted.map((f) => [f.id, f.elevation]));

  return { collisionGroup, decorGroup, roomZones, bounds, spawn, floors, elevMap, defaultFloor };
}
