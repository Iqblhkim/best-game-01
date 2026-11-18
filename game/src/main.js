// Boot and the one loop: input is sampled every frame, the world advances
// in fixed 1/60 s steps (several in a slow frame, none in a fast one), and
// the renderer paints what is there. The game moves between five screens:
// title, play, paused, game over and victory.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|win|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
//
// v2: the main loop also answers the new world events — the boss roar when
// a Tyrant warps in, the ping before its attacks, the dasher's whoosh, the
// Chrono shimmer — and plays a low heartbeat while the player is down to
// their last life.

import { BEST_KEY, LIVES, STEP, SCREENS } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOSS_DIE,
  EVENT_BOSS_SPAWN,
  EVENT_BOSS_TELEGRAPH,
  EVENT_CHRONO,
  EVENT_DASH,
  EVENT_ENEMY_SHOOT,
  EVENT_HIT,
  EVENT_MAX_COMBO,
  EVENT_OVER,
  EVENT_OVERDRIVE,
  EVENT_POWERUP,
  EVENT_SHOOT,
  EVENT_SNIPER_AIM,
  EVENT_SNIPER_FIRE,
  EVENT_WAVE_CLEAR,
  EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createParticles } from './particles.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How often the last-life heartbeat thumps, in seconds. */
const HEARTBEAT_GAP = 0.95;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const particles = createParticles();
const audio = createAudio();
const input = createInput(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function fitCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;
  renderer.resize(cssWidth, cssHeight, ratio);
  world.resize(cssWidth, cssHeight);
}

function runShot(name) {
  fitCanvas();
  const staged = stageShot(name, world, particles);
  world.state.best = staged.best;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, staged.screen, staged.best, particles);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  fitCanvas();
  world.reset();
  world.seedDemo();
  window.addEventListener('resize', fitCanvas);

  let screen = SCREENS.TITLE;
  let best = readBest();
  let muted = false;
  let accumulator = 0;
  let last = performance.now();
  let heartbeatTimer = 0;
  let chronoTickTimer = 0;

  // Screen readers (and anyone watching the page's text) hear the screen
  // changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    particles.clear();
    accumulator = 0;
    heartbeatTimer = 0;
    screen = SCREENS.PLAY;
    announce(`Playing. ${LIVES} lives. Clear wave 10 to win.`);
  }

  function endGame(won) {
    screen = won ? SCREENS.WIN : SCREENS.OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) audio.victory();
    else audio.gameOver();
    announce(won
      ? `You win! Score ${world.state.score}. Best ${best}.`
      : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function applyFx(fx) {
    for (const burst of fx.bursts) particles.burst(burst.x, burst.y, burst.color, burst.n, burst.speed);
    for (const ring of fx.rings) particles.ring(ring.x, ring.y, ring.color);
    for (const text of fx.texts) particles.text(text.x, text.y, text.message, text.color);
    if (fx.events & EVENT_SHOOT) audio.shoot();
    if (fx.events & EVENT_ENEMY_SHOOT) audio.enemyShoot();
    if (fx.events & EVENT_HIT) audio.hit();
    if (fx.events & EVENT_POWERUP) audio.pickup();
    if (fx.events & EVENT_WAVE_CLEAR) audio.waveClear();
    if (fx.events & EVENT_BOSS_SPAWN) audio.bossRoar();
    if (fx.events & EVENT_BOSS_TELEGRAPH) audio.telegraph();
    if (fx.events & EVENT_BOSS_DIE) audio.bossDie();
    if (fx.events & EVENT_DASH) audio.dash();
    if (fx.events & EVENT_CHRONO) audio.chrono();
    if (fx.events & EVENT_SNIPER_AIM) audio.sniperCharge();
    if (fx.events & EVENT_SNIPER_FIRE) audio.sniperFire();
    if (fx.events & EVENT_OVERDRIVE) audio.overdrive();
    if (fx.events & EVENT_MAX_COMBO) announce('Maximum combo, times five.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && screen !== SCREENS.TITLE) {
      startGame();
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREENS.TITLE || screen === SCREENS.OVER || screen === SCREENS.WIN) startGame();
      else if (screen === SCREENS.PAUSED) {
        screen = SCREENS.PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREENS.PLAY) {
        screen = SCREENS.PAUSED;
        announce('Paused.');
      } else if (screen === SCREENS.PAUSED) {
        screen = SCREENS.PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    if (screen === SCREENS.TITLE) {
      world.stepDemo(STEP);
      particles.update(STEP);
      return;
    }
    const aim = input.aim();
    const [dx, dy] = input.direction();
    const fx = world.step(STEP, {
      direction: [dx, dy],
      aimX: aim.x,
      aimY: aim.y,
      aimSeen: aim.seen,
      firing: input.isFiring(),
    });
    applyFx(fx);
    particles.update(STEP);
    // The last-life heartbeat: a low thump about once a second.
    if (world.state.lives === 1) {
      heartbeatTimer -= STEP;
      if (heartbeatTimer <= 0) {
        audio.heartbeat();
        heartbeatTimer = HEARTBEAT_GAP;
      }
    }
    // A soft shimmer every couple of seconds while Chrono runs.
    if (world.chronoActive) {
      chronoTickTimer -= STEP;
      if (chronoTickTimer <= 0) {
        audio.chronoTick();
        chronoTickTimer = 2;
      }
    } else {
      chronoTickTimer = 0;
    }
    if (fx.events & EVENT_OVER) endGame(false);
    else if (fx.events & EVENT_WIN) endGame(true);
    else if (fx.events & EVENT_HIT) {
      announce(world.state.lives === 1 ? 'Hit. 1 life left.' : `Hit. ${world.state.lives} lives left.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREENS.TITLE || screen === SCREENS.PLAY) {
      while (accumulator >= STEP && (screen === SCREENS.TITLE || screen === SCREENS.PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      particles.update(STEP);
    }
    renderer.draw(world.state, screen, best, particles);
  }

  // Leaving the tab pauses a running game rather than letting ships fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREENS.PLAY) {
      screen = SCREENS.PAUSED;
      announce('Paused.');
    }
  });

  // A handle for automated play-testing: the live state and screen, read-only.
  window.__voidlight = {
    get state() {
      return world.state;
    },
    get screen() {
      return screen;
    },
  };

  announce('VOIDLIGHT. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
