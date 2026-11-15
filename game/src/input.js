// Keyboard and mouse, read as one input: a movement direction, an aim point,
// whether the fire button is held, and one-shot actions (confirm, pause,
// restart, mute) the main loop picks up once and clears.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const MOVE_KEYS = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let firing = false;
  let mouseX = 0;
  let mouseY = 0;
  let mouseSeen = false;

  function pressConfirm(event) {
    actions |= ACTION_CONFIRM;
    if (event) event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (MOVE_KEYS[event.code]) {
      held.add(event.code);
      event.preventDefault();
    } else if (event.code === 'Space' || event.code === 'Enter') {
      if (event.code === 'Space') firing = true;
      pressConfirm(event);
    } else if (event.code === 'KeyP' || event.code === 'Escape') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    }
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
    if (event.code === 'Space') firing = false;
  });

  window.addEventListener('blur', () => {
    held.clear();
    firing = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
  });

  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseSeen = true;
    firing = true;
    pressConfirm(event);
  });

  window.addEventListener('pointerup', () => {
    firing = false;
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    // A unit movement vector from the held keys, or [0, 0].
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const [dx, dy] = MOVE_KEYS[code];
        x += dx;
        y += dy;
      }
      if (x === 0 && y === 0) return [0, 0];
      const length = Math.hypot(x, y);
      return [x / length, y / length];
    },
    aim() {
      return { x: mouseX, y: mouseY, seen: mouseSeen };
    },
    isFiring() {
      return firing;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
