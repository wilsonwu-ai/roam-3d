// player.js — capsule-vs-Octree first-person controller.
// Adapted from the official three.js games/fps reference (fixed sub-stepping,
// depenetration, floor test) with custom SPRINT, CROUCH (with un-crouch probe),
// and JUMP tuned to house scale (apex < ceiling so you can't hop through it).

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';

const GRAVITY      = 30;
const RADIUS       = 0.3;    // body half-width; capsule Ø 0.6 < smallest 0.9 doorway
const STAND_H      = 1.7;    // eye height standing (m)
const CROUCH_H     = 0.95;   // eye height crouched
const JUMP_V       = 7.6;    // apex ≈ 0.96 m — a realistic hop, never clears a 2.6 m ceiling
const ACCEL_GROUND = 26;
const ACCEL_AIR    = 6;

const _fwd  = new THREE.Vector3();
const _side = new THREE.Vector3();

export function createPlayer({ octree, camera }) {
  const collider = new Capsule(
    new THREE.Vector3(0, RADIUS, 0),
    new THREE.Vector3(0, STAND_H, 0),
    RADIUS
  );
  const velocity = new THREE.Vector3();
  let onFloor = false;
  let currentH = STAND_H;
  let wantCrouch = false;

  function spawnAt(x, z, yBase = 0) {
    collider.start.set(x, yBase + RADIUS, z);
    collider.end.set(x, yBase + STAND_H, z);
    velocity.set(0, 0, 0);
    currentH = STAND_H;
    onFloor = false;
    camera.position.copy(collider.end);
  }

  function forwardVector() {
    camera.getWorldDirection(_fwd);
    _fwd.y = 0; _fwd.normalize();
    return _fwd;
  }
  function sideVector() {
    camera.getWorldDirection(_side);
    _side.y = 0; _side.normalize();
    _side.cross(camera.up);
    return _side;
  }

  function applyControls(dt, intent) {
    wantCrouch = !!intent.crouch;
    let accel = onFloor ? ACCEL_GROUND : ACCEL_AIR;
    if (intent.sprint && !wantCrouch) accel *= 1.8;
    if (wantCrouch) accel *= 0.5;
    const d = dt * accel;
    if (intent.moveF) velocity.add(forwardVector().multiplyScalar(d));
    if (intent.moveB) velocity.add(forwardVector().multiplyScalar(-d));
    if (intent.moveL) velocity.add(sideVector().multiplyScalar(-d));
    if (intent.moveR) velocity.add(sideVector().multiplyScalar(d));
    if (onFloor && !wantCrouch && intent.jump) velocity.y = JUMP_V;
  }

  function collisions() {
    const result = octree.capsuleIntersect(collider);
    onFloor = false;
    if (result) {
      onFloor = result.normal.y >= 0.15;
      if (!onFloor) velocity.addScaledVector(result.normal, -result.normal.dot(velocity));
      if (result.depth >= 1e-10) collider.translate(result.normal.multiplyScalar(result.depth));
    }
  }

  function physics(dt) {
    let damping = Math.exp(-4 * dt) - 1;
    if (!onFloor) { velocity.y -= GRAVITY * dt; damping *= 0.12; }
    velocity.addScaledVector(velocity, damping);
    collider.translate(_fwd.copy(velocity).multiplyScalar(dt));
    collisions();
  }

  function updateCrouch(dt) {
    const target = wantCrouch ? CROUCH_H : STAND_H;
    let allow = true;
    // Before standing back up, make sure a full-height capsule is clear above.
    if (!wantCrouch && currentH < STAND_H - 1e-3) {
      const probe = new Capsule(collider.start.clone(), collider.start.clone(), RADIUS);
      probe.end.y = collider.start.y + (STAND_H - RADIUS);
      const hit = octree.capsuleIntersect(probe);
      if (hit && hit.depth > 1e-4) allow = false; // low ceiling — stay crouched
    }
    if (allow) currentH += (target - currentH) * Math.min(1, 12 * dt);
    collider.end.y = collider.start.y + (currentH - RADIUS);
  }

  // One fixed sub-step of simulation.
  function update(dt, intent) {
    applyControls(dt, intent);
    physics(dt);
    updateCrouch(dt);
    camera.position.copy(collider.end);
    if (collider.end.y < -12) spawnAt(collider.end.x, collider.end.z); // safety net
  }

  return {
    collider,
    spawnAt,
    update,
    get onFloor() { return onFloor; },
    get crouching() { return currentH < (STAND_H + CROUCH_H) / 2; },
    position: () => collider.end,
  };
}
