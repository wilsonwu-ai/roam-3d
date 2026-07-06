// photoPanels.js — aspect-correct, unlit, eye-height framed listing photos.
// Each room's real photo hangs on a tagged wall so "you see the room you're
// standing in". Panels are DECOR ONLY (never added to the collision Octree).
// If an image is missing (before a real Zillow capture), a tasteful generated
// placeholder is shown and swapped the moment the real photo loads.

import * as THREE from 'three';

const loader = new THREE.TextureLoader();
loader.crossOrigin = 'anonymous';
const FACE_YAW = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 };

function placeholderTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 768;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 768);
  grd.addColorStop(0, '#242731'); grd.addColorStop(1, '#15171d');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 768);
  g.strokeStyle = 'rgba(200,169,106,0.5)'; g.lineWidth = 3;
  g.strokeRect(26, 26, 972, 716);
  g.fillStyle = '#C8A96A'; g.font = '600 34px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('◈', 512, 300);
  g.fillStyle = '#F5F6F8'; g.font = '500 54px Georgia, serif';
  g.fillText(title || 'Room', 512, 396);
  g.fillStyle = '#9AA0AB'; g.font = '400 24px Inter, sans-serif';
  g.fillText(sub || '', 512, 448);
  g.fillStyle = '#626772'; g.font = '400 19px Inter, sans-serif';
  g.fillText('PHOTO PENDING — add via tools/capture-listing.md', 512, 690);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPhotoPanels(rooms, elevMap = {}, defaultFloor = 'main') {
  const group = new THREE.Group();
  const targets = []; // interactable image planes (for raycast inspect)

  for (const room of rooms) {
    const elev = elevMap[room.floor || defaultFloor] || 0;
    for (const photo of (room.photos || [])) {
      const g = new THREE.Group();
      const maxH = Math.min(1.7, (room.height || 2.6) - 0.6);

      const mat = new THREE.MeshBasicMaterial({
        map: placeholderTexture(room.name, photo.caption || ''),
        toneMapped: false,
      });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: 0x15140f, roughness: 0.6 })
      );
      frame.position.z = -0.012;
      panel.userData = { url: photo.url, caption: photo.caption || '', room: room.name };
      targets.push(panel);
      g.add(frame, panel);

      const sizeTo = (aspect) => {
        const h = maxH, w = h * aspect;
        panel.scale.set(w, h, 1);
        frame.scale.set(w + 0.11, h + 0.11, 1);
      };
      sizeTo(1024 / 768);

      // Try the real photo; keep the placeholder on failure.
      loader.load(
        photo.url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          mat.map = t; mat.needsUpdate = true;
          if (t.image && t.image.width) sizeTo(t.image.width / t.image.height);
        },
        undefined,
        () => { /* placeholder stays */ }
      );

      // Place + orient onto the tagged wall (room x,z = NW corner).
      const cx = room.x + room.width / 2, cz = room.z + room.depth / 2;
      const y = elev + Math.min(1.45, (room.height || 2.6) / 2 + 0.15);
      const inset = 0.07;
      const off = photo.offsetX || 0;
      switch (photo.wall) {
        case 'north': g.position.set(cx + off, y, room.z + inset); break;
        case 'south': g.position.set(cx + off, y, room.z + room.depth - inset); break;
        case 'west':  g.position.set(room.x + inset, y, cz + off); break;
        case 'east':  g.position.set(room.x + room.width - inset, y, cz + off); break;
        default:      g.position.set(cx, y, room.z + inset);
      }
      g.rotation.y = FACE_YAW[photo.wall] ?? 0;
      group.add(g);
    }
  }

  return { group, targets };
}
