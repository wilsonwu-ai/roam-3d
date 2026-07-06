// loadListing.js — fetch + validate the single source of truth.
// Validation is loud-but-non-fatal: we log problems and still render best-effort.

function overlaps1D(a0, a1, b0, b1) {
  return a0 < b1 - 1e-6 && b0 < a1 - 1e-6; // touching edges do NOT count as overlap
}

export function validateListing(listing) {
  const rooms = listing.rooms || [];
  const issues = [];

  // 1) No two rooms may overlap in BOTH x and z.
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const A = rooms[i], B = rooms[j];
      const ox = overlaps1D(A.x, A.x + A.width, B.x, B.x + B.width);
      const oz = overlaps1D(A.z, A.z + A.depth, B.z, B.z + B.depth);
      if (ox && oz) issues.push(`Rooms overlap: "${A.id}" ✕ "${B.id}"`);
    }
  }

  // 2) Every room must be reachable (undirected BFS over connections).
  const byId = new Map(rooms.map(r => [r.id, r]));
  const adj = new Map(rooms.map(r => [r.id, new Set()]));
  for (const r of rooms) {
    for (const c of (r.connections || [])) {
      if (byId.has(c)) { adj.get(r.id).add(c); adj.get(c).add(r.id); }
      else issues.push(`Room "${r.id}" connects to unknown room "${c}"`);
    }
  }
  const start = (listing.spawn && listing.spawn.room && byId.has(listing.spawn.room))
    ? listing.spawn.room
    : (byId.has('entry') ? 'entry' : rooms[0] && rooms[0].id);
  if (start) {
    const seen = new Set([start]);
    const q = [start];
    while (q.length) {
      const cur = q.shift();
      for (const n of (adj.get(cur) || [])) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    for (const r of rooms) if (!seen.has(r.id)) issues.push(`Room "${r.id}" is unreachable from "${start}"`);
  }

  if (issues.length) {
    console.warn(`[roam] listing.json has ${issues.length} issue(s):`);
    issues.forEach(m => console.warn('   • ' + m));
  } else {
    console.log(`[roam] listing OK — ${rooms.length} rooms, all reachable from "${start}".`);
  }
  return issues;
}

export async function loadListing(url = './listing.json') {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  const listing = await res.json();
  validateListing(listing);
  return listing;
}
