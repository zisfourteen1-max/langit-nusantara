// Keyboard + mouse + touch input. Held keys steer; one-shot presses (gear,
// flaps, pause, confirm, mute) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost or counted twice.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_GEAR = 4;
export const ACTION_FLAPS = 8;
export const ACTION_MUTE = 16;
export const ACTION_RESTART = 32;

const PITCH_UP = new Set(['ArrowUp', 'KeyW']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyS']);
const BANK_LEFT = new Set(['ArrowLeft', 'KeyA']);
const BANK_RIGHT = new Set(['ArrowRight', 'KeyD']);
const THROTTLE_UP = new Set(['ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseSteer = null; // {x, y} in canvas pixels, or null

  function keyDown(event) {
    if (PITCH_UP.has(event.code) || PITCH_DOWN.has(event.code)
      || BANK_LEFT.has(event.code) || BANK_RIGHT.has(event.code)
      || THROTTLE_UP.has(event.code) || THROTTLE_DOWN.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
      return;
    }
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (event.code === 'KeyG') {
      if (!event.repeat) actions |= ACTION_GEAR;
    } else if (event.code === 'KeyF') {
      if (!event.repeat) actions |= ACTION_FLAPS;
    } else if (event.code === 'KeyM') {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code === 'KeyR') {
      if (!event.repeat) actions |= ACTION_RESTART;
    }
  }
  function keyUp(event) {
    held.delete(event.code);
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', (event) => {
    mouseSteer = { x: event.clientX, y: event.clientY };
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointermove', (event) => {
    if (mouseSteer) mouseSteer = { x: event.clientX, y: event.clientY };
  });
  target.addEventListener('pointerup', () => { mouseSteer = null; });

  const has = (set) => [...set].some((code) => held.has(code));

  return {
    /** Analog steering for this frame: pitch/bank -1..1, throttle -1..1. */
    steering(canvasWidth, canvasHeight) {
      let pitch = (has(PITCH_UP) ? 1 : 0) - (has(PITCH_DOWN) ? 1 : 0);
      let bank = (has(BANK_RIGHT) ? 1 : 0) - (has(BANK_LEFT) ? 1 : 0);
      const throttle = (has(THROTTLE_UP) ? 1 : 0) - (has(THROTTLE_DOWN) ? 1 : 0);
      if (mouseSteer) {
        // Mouse steers toward the pointer: above centre = climb, sides = bank.
        const rect = target.getBoundingClientRect();
        const nx = (mouseSteer.x - rect.left) / Math.max(rect.width, 1) - 0.5;
        const ny = (mouseSteer.y - rect.top) / Math.max(rect.height, 1) - 0.5;
        pitch = Math.max(-1, Math.min(1, -ny * 2.4));
        bank = Math.max(-1, Math.min(1, nx * 2.4));
      }
      return { pitch, bank, throttle };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
