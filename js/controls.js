// controls.js — manual pointer-lock mouse-look (for full sensitivity + invert-Y
// control) plus keyboard intent. Look-only: it never moves the player; the
// capsule in player.js is the sole source of truth for position.

import * as THREE from 'three';

const BASE_SENS = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.02;

export function createControls({ camera, domElement, settings, onLock, onUnlock, onAction }) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  euler.setFromQuaternion(camera.quaternion);
  const keys = {};
  let locked = false;
  let sprintToggled = false;

  function onMouseMove(e) {
    if (!locked) return;
    const s = BASE_SENS * (settings.sensitivity ?? 1);
    euler.y -= e.movementX * s;
    euler.x -= e.movementY * s * (settings.invertY ? -1 : 1);
    euler.x = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, euler.x));
    camera.quaternion.setFromEuler(euler);
  }

  function onLockChange() {
    locked = document.pointerLockElement === domElement;
    if (locked) onLock && onLock();
    else onUnlock && onUnlock();
  }

  function onKeyDown(e) {
    keys[e.code] = true;
    if (!locked) return; // don't fight the DOM UI when unlocked
    if (e.code === 'Space' || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') e.preventDefault();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && settings.sprintMode === 'toggle') sprintToggled = !sprintToggled;
    if (e.code === 'KeyM' || e.code === 'KeyE') onAction && onAction(e.code);
  }
  function onKeyUp(e) { keys[e.code] = false; }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    lock() { if (domElement.requestPointerLock) domElement.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    isLocked: () => locked,
    setYaw(yaw) { euler.set(0, yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(euler); },
    resetKeys() { for (const k in keys) keys[k] = false; sprintToggled = false; },
    getIntent() {
      const hold = settings.sprintMode !== 'toggle';
      const shift = keys.ShiftLeft || keys.ShiftRight;
      return {
        moveF:  keys.KeyW || keys.ArrowUp,
        moveB:  keys.KeyS || keys.ArrowDown,
        moveL:  keys.KeyA || keys.ArrowLeft,
        moveR:  keys.KeyD || keys.ArrowRight,
        jump:   !!keys.Space,
        sprint: hold ? !!shift : sprintToggled,
        crouch: !!(keys.ControlLeft || keys.ControlRight || keys.KeyC),
      };
    },
  };
}
