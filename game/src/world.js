// VOIDLIGHT v2 — the simulation.
//
// Everything that happens in the arena lives here: the player ship, its
// bullets, six regular enemy kinds, the two Tyrant bosses, five power-ups,
// waves, the combo multiplier and the score. It knows nothing about drawing
// or sound. Each step returns an `fx` object — the events that happened and
// the bursts, rings and floating texts the main loop should play — so the
// same world can be staged for a screenshot, driven by a scripted test, or
// run live behind the renderer.
//
// v2 changes, in one place: enemies warp in with a warning ring before they
// can fight or be hit; two new kinds (dasher, orbiter) join the roster;
// waves 5 and 10 are boss waves with no regular spawn queue; a Chrono
// pickup slows every enemy and enemy bullet while the player stays fast;
// wave clears and boss kills trigger a short slow-motion beat; and the
// world now reports muzzle flashes, hit flashes and the moment the combo
// hits its maximum, so the renderer and the audio can answer them.

import {
  BOSS_WAVES,
  CHRONO_SECONDS,
  CHRONO_SLOW,
  COMBO_PER_TIER,
  COMBO_WINDOW,
  DASHER_DASH_SECONDS,
  DASHER_DASH_SPEED,
  DASHER_RECOVER_SECONDS,
  DASHER_STALK_SECONDS,
  DROP_CHANCE,
  ENEMIES,
  ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_SPEED,
  INVULN_SECONDS,
  LIVES,
  MAX_MULTIPLIER,
  ORBITER_FIRE_INTERVAL,
  ORBITER_RANGE,
  PLAYER_ACCEL,
  PLAYER_BULLET_RADIUS,
  PLAYER_BULLET_SPEED,
  PLAYER_FIRE_INTERVAL,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  POWERUP_FALL_SPEED,
  POWERUP_RADIUS,
  POWERUP_SECONDS,
  SLOWMO_BOSS_SECONDS,
  SLOWMO_FACTOR,
  SLOWMO_WAVE_SECONDS,
  WARP_SECONDS,
  WAVE_CLEAR_BONUS,
  WIN_WAVE,
} from './config.js';
import { bossKillScore, EVENT_BOSS_DIE, EVENT_BOSS_SPAWN, EVENT_BOSS_TELEGRAPH, makeBoss, stepBoss } from './boss.js';

export { EVENT_BOSS_DIE, EVENT_BOSS_SPAWN, EVENT_BOSS_TELEGRAPH };
export const EVENT_NONE = 0;
export const EVENT_KILL = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_POWERUP = 32;
export const EVENT_SHOOT = 64;
export const EVENT_ENEMY_SHOOT = 128;
export const EVENT_DASH = 2048;
export const EVENT_CHRONO = 4096;
export const EVENT_MAX_COMBO = 8192;

const TAU = Math.PI * 2;

// A point just outside one edge of the arena, where a ship warps in.
function edgePoint(rng, width, height, margin) {
  const side = Math.floor(rng.next() * 4);
  if (side === 0) return { x: rng.range(0, width), y: -margin };
  if (side === 1) return { x: width + margin, y: rng.range(0, height) };
  if (side === 2) return { x: rng.range(0, width), y: height + margin };
  return { x: -margin, y: rng.range(0, height) };
}

// The mix for a normal wave: the count grows by three a wave, the easy
// kinds lead, and the newer kinds join as the waves go on — dasher from
// wave 3, orbiter from wave 4.
function waveQueue(rng, wave) {
  const kinds = ['chaser'];
  if (wave >= 2) kinds.push('weaver');
  if (wave >= 3) kinds.push('splitter', 'dasher');
  if (wave >= 4) kinds.push('shooter', 'orbiter');
  const count = 3 + wave * 3;
  const queue = [];
  for (let i = 0; i < count; i += 1) {
    const pool = i < 3 ? kinds.slice(0, Math.min(2, kinds.length)) : kinds;
    queue.push(rng.pick(pool));
  }
  return queue;
}

// A one-line preview of what a wave brings, for the intro banner.
function wavePreview(wave) {
  if (wave === 5) return 'WAVE 5 — THE VOID TYRANT AWAKENS';
  if (wave === 10) return 'WAVE 10 — THE VOID TYRANT PRIME AWAKENS';
  const joining = [];
  if (wave === 3) joining.push('DASHERS JOIN THE HUNT');
  if (wave === 4) joining.push('ORBITERS JOIN THE HUNT');
  return joining.length > 0 ? `WAVE ${wave} — ${joining[0]}` : `WAVE ${wave}`;
}

export function createWorld(rng) {
  const state = {
    width: 960,
    height: 600,
    score: 0,
    best: 0,
    wave: 1,
    lives: LIVES,
    kills: 0,
    shotsFired: 0,
    time: 0,
    combo: 0,
    comboTimer: 0,
    multiplier: 1,
    maxComboAnnounced: false,
    waveState: 'idle',
    waveTimer: 0,
    spawnQueue: [],
    spawnTimer: 0,
    banner: '',
    bannerTimer: 0,
    bannerSub: '',
    shake: 0,
    hurtFlash: 0,
    slowmo: 0,
    boss: null,
    bossSpawned: false,
    bossBonus: 0,
    bossName: '',
    muzzle: null,
    player: null,
    bullets: [],
    enemyBullets: [],
    enemies: [],
    powerups: [],
  };

  function freshPlayer() {
    return {
      x: state.width / 2,
      y: state.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: PLAYER_RADIUS,
      fireCooldown: 0,
      invuln: 0,
      shield: false,
      rapidUntil: 0,
      spreadUntil: 0,
      chronoUntil: 0,
      thrust: 0,
    };
  }

  // A ship appears: first a warning ring at its entry point, then — once
  // its warp finishes — a solid ship that can fight and be hit.
  function spawnEnemy(kind, x, y) {
    const spec = ENEMIES[kind];
    const point = x === undefined ? edgePoint(rng, state.width, state.height, 40) : { x, y };
    const enemy = {
      kind,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      radius: spec.radius,
      hp: spec.hp,
      speed: spec.speed * rng.range(0.9, 1.1),
      angle: rng.next() * TAU,
      phase: rng.next() * TAU,
      fireCooldown: rng.range(1.2, 2.4),
      color: spec.color,
      spawnAge: 0,
      warp: WARP_SECONDS,
      hitFlash: 0,
      dashState: kind === 'dasher' ? 'stalk' : null,
      dashTimer: kind === 'dasher' ? DASHER_STALK_SECONDS : 0,
      dashAngle: 0,
      // The orbiter starts its circle where it actually is, so its first
      // orbit point is beside it instead of across the arena.
      orbitAngle: Math.atan2(point.y - state.player.y, point.x - state.player.x),
    };
    state.enemies.push(enemy);
    return enemy;
  }

  function spawnBoss(prime) {
    const boss = makeBoss(prime, state.width / 2, state.height * 0.28);
    state.boss = boss;
    state.bossSpawned = true;
    state.bossName = boss.name;
    state.banner = `${boss.name} AWAKENS`;
    state.bannerTimer = 2.2;
    state.bannerSub = prime ? 'Destroy the Prime to win' : 'Break its guard — dodge the telegraphs';
    state.shake = Math.max(state.shake, 10);
    return boss;
  }

  function startWave(wave) {
    state.wave = wave;
    state.banner = wavePreview(wave);
    state.bannerSub = '';
    state.bannerTimer = 2.0;
    if (BOSS_WAVES.includes(wave)) {
      // A boss wave has no regular spawn queue: only the boss, and the
      // escorts it summons. The boss warps in after a short drum-roll.
      state.spawnQueue = [];
      state.waveState = 'boss';
      state.waveTimer = 1.4;
      state.bossSpawned = false;
    } else {
      state.spawnQueue = waveQueue(rng, wave);
      state.spawnTimer = 0.6;
      state.waveState = 'spawning';
    }
  }

  function maybeAnnounceMaxCombo(fx) {
    if (state.multiplier >= MAX_MULTIPLIER && !state.maxComboAnnounced) {
      state.maxComboAnnounced = true;
      fx.events |= EVENT_MAX_COMBO;
      fx.texts.push({ x: state.player.x, y: state.player.y - 34, text: 'MAX COMBO x5!', color: '#ffd319' });
    }
  }

  function killEnemy(index, fx, award) {
    const enemy = state.enemies[index];
    const spec = ENEMIES[enemy.kind];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO_WINDOW;
    state.multiplier = 1 + Math.min(MAX_MULTIPLIER - 1, Math.floor(state.combo / COMBO_PER_TIER));
    maybeAnnounceMaxCombo(fx);
    const points = award === false ? 0 : spec.points * state.multiplier;
    state.score += points;
    fx.bursts.push({ x: enemy.x, y: enemy.y, color: spec.color, n: enemy.kind === 'splitter' ? 26 : 18 });
    fx.rings.push({ x: enemy.x, y: enemy.y, color: spec.color });
    if (points > 0) fx.texts.push({ x: enemy.x, y: enemy.y - 10, text: `+${points}`, color: spec.color });
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const angle = rng.next() * TAU;
        const mini = spawnEnemy('mini', enemy.x + Math.cos(angle) * 14, enemy.y + Math.sin(angle) * 14);
        mini.vx = Math.cos(angle) * 160;
        mini.vy = Math.sin(angle) * 160;
        mini.warp = 0;
      }
    } else if (award !== false && rng.chance(DROP_CHANCE)) {
      const kinds = ['shield', 'rapid', 'spread', 'bomb', 'chrono'];
      state.powerups.push({
        kind: rng.pick(kinds),
        x: enemy.x,
        y: enemy.y,
        vy: POWERUP_FALL_SPEED,
        radius: POWERUP_RADIUS,
        life: 9,
      });
    }
    return EVENT_KILL;
  }

  // The boss goes down: a big score bonus, the field's enemy bullets
  // vanish, the escorts burst, and several power-ups drop at once.
  function killBoss(fx) {
    const boss = state.boss;
    state.boss = null;
    const bonus = bossKillScore(boss, state.multiplier);
    const waveBonus = WAVE_CLEAR_BONUS * state.wave;
    state.bossBonus = bonus;
    state.score += bonus + waveBonus;
    state.kills += 1;
    state.enemyBullets = [];
    state.slowmo = SLOWMO_BOSS_SECONDS;
    state.shake = 20;
    fx.bursts.push({ x: boss.x, y: boss.y, color: boss.color, n: 70, speed: 420 });
    fx.bursts.push({ x: boss.x, y: boss.y, color: '#ffffff', n: 40, speed: 300 });
    fx.rings.push({ x: boss.x, y: boss.y, color: boss.color });
    fx.rings.push({ x: boss.x, y: boss.y, color: '#ffffff' });
    fx.texts.push({ x: boss.x, y: boss.y - boss.radius - 10, text: `+${bonus}`, color: '#ffd319' });
    fx.texts.push({ x: boss.x, y: boss.y - boss.radius - 34, text: `${boss.name} DESTROYED`, color: boss.color });
    for (const escort of state.enemies) {
      fx.bursts.push({ x: escort.x, y: escort.y, color: escort.color, n: 12 });
    }
    state.enemies = [];
    const dropKinds = ['shield', 'rapid', 'spread', 'chrono'];
    for (let i = 0; i < 3; i += 1) {
      const angle = (i / 3) * TAU + rng.next() * 0.8;
      state.powerups.push({
        kind: dropKinds[i % dropKinds.length],
        x: Math.min(Math.max(boss.x + Math.cos(angle) * 70, 30), state.width - 30),
        y: Math.min(Math.max(boss.y + Math.sin(angle) * 70, 30), state.height - 30),
        vy: 0,
        radius: POWERUP_RADIUS,
        life: 12,
      });
    }
    state.waveState = 'clear';
    state.waveTimer = 2.4;
    state.banner = `${boss.name} DESTROYED  +${bonus + waveBonus}`;
    state.bannerTimer = 2.4;
    state.bannerSub = state.wave >= WIN_WAVE ? 'The void is yours' : '';
    return EVENT_BOSS_DIE | EVENT_WAVE_CLEAR;
  }

  function applyPowerup(powerup, fx) {
    const player = state.player;
    if (powerup.kind === 'shield') {
      player.shield = true;
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'SHIELD UP', color: '#4dff88' });
    } else if (powerup.kind === 'rapid') {
      player.rapidUntil = state.time + POWERUP_SECONDS;
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'RAPID FIRE', color: '#ff9f1c' });
    } else if (powerup.kind === 'spread') {
      player.spreadUntil = state.time + POWERUP_SECONDS;
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'SPREAD SHOT', color: '#ff5df2' });
    } else if (powerup.kind === 'chrono') {
      player.chronoUntil = state.time + CHRONO_SECONDS;
      fx.events |= EVENT_CHRONO;
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'CHRONO — TIME SLOWS', color: '#7ad7ff' });
    } else if (powerup.kind === 'bomb') {
      fx.rings.push({ x: player.x, y: player.y, color: '#ffffff' });
      state.shake = Math.max(state.shake, 16);
      while (state.enemies.length > 0) killEnemy(0, fx, true);
      if (state.boss) {
        // A bomb hurts the boss hard but does not finish it outright.
        state.boss.hp -= 12;
        state.boss.hitFlash = 0.25;
      }
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'VOID BOMB!', color: '#ffffff' });
    }
  }

  function hurtPlayer(enemy, fx) {
    const player = state.player;
    if (player.shield) {
      player.shield = false;
      fx.rings.push({ x: player.x, y: player.y, color: '#4dff88' });
      fx.texts.push({ x: player.x, y: player.y - 24, text: 'SHIELD DOWN', color: '#4dff88' });
      return EVENT_NONE;
    }
    state.lives -= 1;
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    state.maxComboAnnounced = false;
    player.invuln = INVULN_SECONDS;
    state.shake = 14;
    state.hurtFlash = 1;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const length = Math.hypot(dx, dy) || 1;
    player.vx += (dx / length) * 320;
    player.vy += (dy / length) * 320;
    fx.bursts.push({ x: player.x, y: player.y, color: '#35f0ff', n: 26 });
    if (state.lives <= 0) return EVENT_HIT | EVENT_OVER;
    return EVENT_HIT;
  }

  function stepPlayer(dt, input, fx) {
    const player = state.player;
    const [dx, dy] = input.direction;
    player.vx += dx * PLAYER_ACCEL * dt;
    player.vy += dy * PLAYER_ACCEL * dt;
    const damp = Math.max(0, 1 - 6 * dt);
    if (dx === 0) player.vx *= damp;
    if (dy === 0) player.vy *= damp;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > PLAYER_SPEED) {
      player.vx = (player.vx / speed) * PLAYER_SPEED;
      player.vy = (player.vy / speed) * PLAYER_SPEED;
    }
    player.x = Math.min(Math.max(player.x + player.vx * dt, player.radius), state.width - player.radius);
    player.y = Math.min(Math.max(player.y + player.vy * dt, player.radius), state.height - player.radius);
    player.thrust = Math.hypot(dx, dy) > 0 ? 1 : 0;
    player.invuln = Math.max(0, player.invuln - dt);
    if (input.aimSeen) player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);

    player.fireCooldown -= dt;
    if (input.firing && player.fireCooldown <= 0) {
      const rapid = state.time < player.rapidUntil;
      const spread = state.time < player.spreadUntil;
      player.fireCooldown = rapid ? PLAYER_FIRE_INTERVAL / 2 : PLAYER_FIRE_INTERVAL;
      const offsets = spread ? [-0.16, 0, 0.16] : [0];
      for (const offset of offsets) {
        const angle = player.angle + offset;
        state.bullets.push({
          x: player.x + Math.cos(angle) * (player.radius + 6),
          y: player.y + Math.sin(angle) * (player.radius + 6),
          vx: Math.cos(angle) * PLAYER_BULLET_SPEED,
          vy: Math.sin(angle) * PLAYER_BULLET_SPEED,
          radius: PLAYER_BULLET_RADIUS,
          life: 1.3,
        });
      }
      state.shotsFired += offsets.length;
      state.muzzle = { x: player.x + Math.cos(player.angle) * (player.radius + 8), y: player.y + Math.sin(player.angle) * (player.radius + 8), angle: player.angle, timer: 0.07 };
      return EVENT_SHOOT;
    }
    return EVENT_NONE;
  }

  // One enemy's steering for one step. Warping ships hold still; the
  // dasher runs its stalk–dash–recover cycle; the orbiter circles the
  // player and fires; the rest hunt, wobble or keep their distance.
  function steerEnemy(enemy, dt, fx) {
    const player = state.player;
    if (enemy.warp > 0) return;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;

    if (enemy.kind === 'dasher') {
      enemy.dashTimer -= dt;
      if (enemy.dashState === 'stalk') {
        enemy.dashAngle = Math.atan2(dy, dx);
        enemy.vx *= 0.9;
        enemy.vy *= 0.9;
        if (enemy.dashTimer <= 0) {
          enemy.dashState = 'dash';
          enemy.dashTimer = DASHER_DASH_SECONDS;
          enemy.vx = Math.cos(enemy.dashAngle) * DASHER_DASH_SPEED;
          enemy.vy = Math.sin(enemy.dashAngle) * DASHER_DASH_SPEED;
          fx.events |= EVENT_DASH;
        }
      } else if (enemy.dashState === 'dash') {
        if (enemy.dashTimer <= 0) {
          enemy.dashState = 'recover';
          enemy.dashTimer = DASHER_RECOVER_SECONDS;
        }
      } else {
        enemy.vx *= Math.max(0, 1 - 3 * dt);
        enemy.vy *= Math.max(0, 1 - 3 * dt);
        if (enemy.dashTimer <= 0) {
          enemy.dashState = 'stalk';
          enemy.dashTimer = DASHER_STALK_SECONDS;
        }
      }
      return;
    }

    if (enemy.kind === 'orbiter') {
      enemy.orbitAngle += dt * 0.5;
      const wantX = player.x + Math.cos(enemy.orbitAngle) * ORBITER_RANGE;
      const wantY = player.y + Math.sin(enemy.orbitAngle) * ORBITER_RANGE;
      const ox = wantX - enemy.x;
      const oy = wantY - enemy.y;
      const od = Math.hypot(ox, oy) || 1;
      enemy.vx += (ox / od) * enemy.speed * 3 * dt;
      enemy.vy += (oy / od) * enemy.speed * 3 * dt;
      enemy.fireCooldown -= dt;
      if (enemy.fireCooldown <= 0 && distance < 560) {
        enemy.fireCooldown = ORBITER_FIRE_INTERVAL;
        state.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: nx * ENEMY_BULLET_SPEED,
          vy: ny * ENEMY_BULLET_SPEED,
          radius: ENEMY_BULLET_RADIUS,
        });
        fx.events |= EVENT_ENEMY_SHOOT;
      }
      return;
    }

    if (enemy.kind === 'chaser' || enemy.kind === 'mini' || enemy.kind === 'splitter') {
      enemy.vx += nx * enemy.speed * 2.2 * dt;
      enemy.vy += ny * enemy.speed * 2.2 * dt;
    } else if (enemy.kind === 'weaver') {
      enemy.phase += dt * 5;
      const wobble = Math.sin(enemy.phase) * 0.9;
      enemy.vx += (nx - ny * wobble) * enemy.speed * 2.4 * dt;
      enemy.vy += (ny + nx * wobble) * enemy.speed * 2.4 * dt;
    } else if (enemy.kind === 'shooter') {
      const want = distance > 300 ? 1 : distance < 210 ? -1 : 0;
      const strafe = Math.sin(enemy.phase + state.time * 0.8) * 0.8;
      enemy.vx += (nx * want - ny * strafe) * enemy.speed * 2 * dt;
      enemy.vy += (ny * want + nx * strafe) * enemy.speed * 2 * dt;
      enemy.fireCooldown -= dt;
      if (enemy.fireCooldown <= 0 && enemy.spawnAge > 0.8 && distance < 520) {
        enemy.fireCooldown = 2.4;
        state.enemyBullets.push({
          x: enemy.x,
          y: enemy.y,
          vx: nx * ENEMY_BULLET_SPEED,
          vy: ny * ENEMY_BULLET_SPEED,
          radius: ENEMY_BULLET_RADIUS,
        });
        fx.events |= EVENT_ENEMY_SHOOT;
      }
    }
  }

  function stepEnemies(dt, fx) {
    for (const enemy of state.enemies) {
      enemy.spawnAge += dt;
      enemy.hitFlash = Math.max(0, (enemy.hitFlash || 0) - dt);
      if (enemy.warp > 0) {
        enemy.warp = Math.max(0, enemy.warp - dt);
        // A warping ship is not solid yet, but it is already drifting in
        // toward the player at a third of its speed, so the warning ring
        // does not waste the player's opening volleys: the ship is closing
        // in while it phases in, and bullets can meet it once it is solid.
        const px = state.player.x - enemy.x;
        const py = state.player.y - enemy.y;
        const pd = Math.hypot(px, py) || 1;
        const drift = enemy.speed * 0.35;
        enemy.vx += ((px / pd) * drift - enemy.vx) * Math.min(1, 4 * dt);
        enemy.vy += ((py / pd) * drift - enemy.vy) * Math.min(1, 4 * dt);
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        continue;
      }
      steerEnemy(enemy, dt, fx);
      const speed = Math.hypot(enemy.vx, enemy.vy);
      const cap = enemy.kind === 'dasher' && enemy.dashState === 'dash'
        ? DASHER_DASH_SPEED * 1.05
        : enemy.speed * 1.35;
      if (speed > cap) {
        enemy.vx = (enemy.vx / speed) * cap;
        enemy.vy = (enemy.vy / speed) * cap;
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    }
    if (state.boss) {
      stepBoss(state.boss, {
        player: state.player,
        width: state.width,
        height: state.height,
        rng,
        escortCount: state.enemies.length,
        spawnEscort: (kind, x, y) => spawnEnemy(kind, x, y),
      }, dt, fx);
    }
  }

  function stepBullets(dt, fx, hostileDt) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > state.width + 20 || bullet.y < -20 || bullet.y > state.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      // The boss takes hits first: it is the biggest thing on the field.
      if (state.boss && state.boss.warp <= 0) {
        const boss = state.boss;
        const dx = bullet.x - boss.x;
        const dy = bullet.y - boss.y;
        const hit = boss.radius + bullet.radius;
        if (dx * dx + dy * dy < hit * hit) {
          state.bullets.splice(i, 1);
          boss.hp -= 1;
          boss.hitFlash = 0.12;
          fx.bursts.push({ x: bullet.x, y: bullet.y, color: boss.color, n: 5, speed: 140 });
          if (boss.hp <= 0) {
            fx.events |= killBoss(fx);
            return;
          }
          continue;
        }
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        if (enemy.warp > 0) continue;
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const hit = enemy.radius + bullet.radius;
        if (dx * dx + dy * dy < hit * hit) {
          state.bullets.splice(i, 1);
          enemy.hp -= 1;
          enemy.hitFlash = 0.14;
          fx.bursts.push({ x: bullet.x, y: bullet.y, color: enemy.color, n: 5, speed: 140 });
          if (enemy.hp <= 0) fx.events |= killEnemy(j, fx, true);
          break;
        }
      }
    }
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.enemyBullets[i];
      bullet.x += bullet.vx * hostileDt;
      bullet.y += bullet.vy * hostileDt;
      if (bullet.x < -20 || bullet.x > state.width + 20 || bullet.y < -20 || bullet.y > state.height + 20) {
        state.enemyBullets.splice(i, 1);
      }
    }
  }

  function stepCollisions(fx) {
    const player = state.player;
    if (player.invuln <= 0) {
      for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
        const enemy = state.enemies[i];
        if (enemy.warp > 0) continue;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const hit = player.radius + enemy.radius - 4;
        if (dx * dx + dy * dy < hit * hit) {
          // A ram still kills the enemy properly (a splitter splits), but
          // awards no points: the player paid for it with a life.
          fx.events |= killEnemy(i, fx, false);
          fx.events |= hurtPlayer(enemy, fx);
          break;
        }
      }
      if (state.boss && state.boss.warp <= 0) {
        const boss = state.boss;
        const dx = player.x - boss.x;
        const dy = player.y - boss.y;
        const hit = player.radius + boss.radius - 6;
        if (dx * dx + dy * dy < hit * hit) {
          fx.events |= hurtPlayer(boss, fx);
        }
      }
      for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
        const bullet = state.enemyBullets[i];
        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const hit = player.radius + bullet.radius - 4;
        if (dx * dx + dy * dy < hit * hit) {
          state.enemyBullets.splice(i, 1);
          fx.events |= hurtPlayer({ x: bullet.x, y: bullet.y }, fx);
          break;
        }
      }
    }
    for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
      const powerup = state.powerups[i];
      const dx = player.x - powerup.x;
      const dy = player.y - powerup.y;
      const hit = player.radius + powerup.radius + 4;
      if (dx * dx + dy * dy < hit * hit) {
        state.powerups.splice(i, 1);
        applyPowerup(powerup, fx);
        fx.events |= EVENT_POWERUP;
      }
    }
  }

  function stepSpawning(dt) {
    if (state.waveState === 'spawning') {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const kind = state.spawnQueue.shift();
        if (kind) {
          spawnEnemy(kind);
          state.spawnTimer = Math.max(0.35, 0.95 - state.wave * 0.05);
        } else {
          state.waveState = 'fighting';
        }
      }
    } else if (state.waveState === 'boss') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0 && !state.bossSpawned) {
        spawnBoss(state.wave === WIN_WAVE);
        return EVENT_BOSS_SPAWN;
      }
    } else if (state.waveState === 'fighting') {
      if (state.enemies.length === 0 && state.spawnQueue.length === 0) {
        const bonus = WAVE_CLEAR_BONUS * state.wave;
        state.score += bonus;
        state.enemyBullets = [];
        state.slowmo = SLOWMO_WAVE_SECONDS;
        state.waveState = 'clear';
        state.waveTimer = 2.2;
        state.banner = `WAVE ${state.wave} CLEARED  +${bonus}`;
        state.bannerSub = '';
        state.bannerTimer = 2.2;
        return EVENT_WAVE_CLEAR;
      }
    } else if (state.waveState === 'clear') {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        if (state.wave >= WIN_WAVE) return EVENT_WIN;
        startWave(state.wave + 1);
      }
    }
    return EVENT_NONE;
  }

  return {
    state,
    reset() {
      state.score = 0;
      state.wave = 1;
      state.lives = LIVES;
      state.kills = 0;
      state.shotsFired = 0;
      state.time = 0;
      state.combo = 0;
      state.comboTimer = 0;
      state.multiplier = 1;
      state.maxComboAnnounced = false;
      state.bullets = [];
      state.enemyBullets = [];
      state.enemies = [];
      state.powerups = [];
      state.shake = 0;
      state.hurtFlash = 0;
      state.slowmo = 0;
      state.boss = null;
      state.bossSpawned = false;
      state.bossBonus = 0;
      state.bossName = '';
      state.muzzle = null;
      state.banner = '';
      state.bannerSub = '';
      state.bannerTimer = 0;
      state.player = freshPlayer();
      startWave(1);
    },
    resize(width, height) {
      state.width = width;
      state.height = height;
      if (state.player) {
        state.player.x = Math.min(state.player.x, width - PLAYER_RADIUS);
        state.player.y = Math.min(state.player.y, height - PLAYER_RADIUS);
      }
    },
    // The title screen's living backdrop: ships drift, nothing can hurt
    // anything, and no wave ever starts.
    stepDemo(dt) {
      state.time += dt;
      for (const enemy of state.enemies) {
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.angle += dt * 0.6;
        if (enemy.x < -40) enemy.x = state.width + 30;
        if (enemy.x > state.width + 40) enemy.x = -30;
        if (enemy.y < -40) enemy.y = state.height + 30;
        if (enemy.y > state.height + 40) enemy.y = -30;
      }
      if (state.player) {
        state.player.angle += dt * 0.25;
        state.player.thrust = 1;
      }
    },
    seedDemo() {
      state.player = freshPlayer();
      state.player.x = state.width / 2;
      state.player.y = state.height * 0.62;
      state.enemies = [];
      state.boss = null;
      const kinds = ['chaser', 'weaver', 'splitter', 'shooter', 'dasher', 'orbiter'];
      for (let i = 0; i < kinds.length; i += 1) {
        spawnEnemy(kinds[i], rng.range(60, state.width - 60), rng.range(80, state.height - 120));
        const enemy = state.enemies[state.enemies.length - 1];
        enemy.vx = rng.range(-30, 30);
        enemy.vy = rng.range(-18, 18);
        enemy.warp = 0;
        enemy.spawnAge = 1;
      }
      state.bullets = [];
      state.enemyBullets = [];
      state.powerups = [];
    },
    addEnemy(kind, x, y) {
      const enemy = spawnEnemy(kind, x, y);
      enemy.spawnAge = 1;
      enemy.warp = 0;
      return enemy;
    },
    addBullet(x, y, angle) {
      state.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * PLAYER_BULLET_SPEED,
        vy: Math.sin(angle) * PLAYER_BULLET_SPEED,
        radius: PLAYER_BULLET_RADIUS,
        life: 1.3,
      });
    },
    addPowerup(kind, x, y) {
      state.powerups.push({ kind, x, y, vy: 0, radius: POWERUP_RADIUS, life: 9 });
    },
    addBoss(prime, x, y) {
      const boss = makeBoss(prime, x ?? state.width / 2, y ?? state.height * 0.28);
      state.boss = boss;
      state.bossSpawned = true;
      state.bossName = boss.name;
      state.waveState = 'boss';
      return boss;
    },
    // How fast the hostile side moves this step: Chrono slows it to 40%,
    // and a slow-motion beat (wave clear, boss kill) slows it further.
    timeScale() {
      let scale = 1;
      if (state.player && state.time < state.player.chronoUntil) scale *= CHRONO_SLOW;
      if (state.slowmo > 0) scale *= SLOWMO_FACTOR;
      return scale;
    },
    get chronoActive() {
      return !!state.player && state.time < state.player.chronoUntil;
    },
    step(dt, input) {
      const fx = { events: EVENT_NONE, bursts: [], rings: [], texts: [], enemyBullets: state.enemyBullets };
      state.time += dt;
      state.shake = Math.max(0, state.shake - 30 * dt);
      state.hurtFlash = Math.max(0, state.hurtFlash - 1.6 * dt);
      state.slowmo = Math.max(0, state.slowmo - dt);
      state.bannerTimer = Math.max(0, state.bannerTimer - dt);
      if (state.muzzle) {
        state.muzzle.timer -= dt;
        if (state.muzzle.timer <= 0) state.muzzle = null;
      }
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) {
          state.combo = 0;
          state.multiplier = 1;
          state.maxComboAnnounced = false;
        }
      }
      const hostileDt = dt * this.timeScale();
      fx.events |= stepPlayer(dt, input, fx);
      stepEnemies(hostileDt, fx);
      stepBullets(dt, fx, hostileDt);
      stepCollisions(fx);
      fx.events |= stepSpawning(dt);
      for (let i = state.powerups.length - 1; i >= 0; i -= 1) {
        const powerup = state.powerups[i];
        powerup.y += powerup.vy * dt;
        powerup.life -= dt;
        if (powerup.life <= 0 || powerup.y > state.height + 20) state.powerups.splice(i, 1);
      }
      return fx;
    },
  };
}
