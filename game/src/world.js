// VOIDLIGHT's simulation: the player ship, its bullets, four enemy kinds,
// power-ups, waves, the combo multiplier and the score. It knows nothing
// about drawing or sound: each step returns the events that happened and the
// effects (bursts, rings, floating text, screen shake) the main loop should
// play, so the same world can be staged for a screenshot or run live.

import {
  COMBO_PER_TIER,
  COMBO_WINDOW,
  DROP_CHANCE,
  ENEMIES,
  ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_SPEED,
  INVULN_SECONDS,
  LIVES,
  MAX_MULTIPLIER,
  PLAYER_ACCEL,
  PLAYER_BULLET_RADIUS,
  PLAYER_BULLET_SPEED,
  PLAYER_FIRE_INTERVAL,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  POWERUP_FALL_SPEED,
  POWERUP_RADIUS,
  POWERUP_SECONDS,
  WAVE_CLEAR_BONUS,
  WIN_WAVE,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_KILL = 1;
export const EVENT_HIT = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_WAVE_CLEAR = 16;
export const EVENT_POWERUP = 32;
export const EVENT_SHOOT = 64;
export const EVENT_ENEMY_SHOOT = 128;

const TWO_PI = Math.PI * 2;

function edgePoint(rng, width, height, margin) {
  const side = Math.floor(rng.next() * 4);
  if (side === 0) return { x: rng.range(0, width), y: -margin };
  if (side === 1) return { x: width + margin, y: rng.range(0, height) };
  if (side === 2) return { x: rng.range(0, width), y: height + margin };
  return { x: -margin, y: rng.range(0, height) };
}

function waveQueue(rng, wave) {
  // Later waves mix in the harder kinds; the count grows by three a wave.
  const kinds = ['chaser'];
  if (wave >= 2) kinds.push('weaver');
  if (wave >= 3) kinds.push('splitter');
  if (wave >= 4) kinds.push('shooter');
  const count = 5 + wave * 3;
  const queue = [];
  for (let i = 0; i < count; i += 1) {
    // Early slots of a wave are the easy kinds; the tail is anything.
    const pool = i < 3 ? kinds.slice(0, Math.min(2, kinds.length)) : kinds;
    queue.push(rng.pick(pool));
  }
  return queue;
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
    waveState: 'idle',
    waveTimer: 0,
    banner: '',
    bannerTimer: 0,
    shake: 0,
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
      thrust: 0,
    };
  }

  function spawnEnemy(kind, x, y) {
    const spec = ENEMIES[kind];
    const point = x === undefined ? edgePoint(rng, state.width, state.height, 40) : { x, y };
    state.enemies.push({
      kind,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
      radius: spec.radius,
      hp: spec.hp,
      speed: spec.speed * rng.range(0.9, 1.1),
      angle: rng.next() * TWO_PI,
      phase: rng.next() * TWO_PI,
      fireCooldown: rng.range(1.2, 2.4),
      color: spec.color,
      spawnAge: 0,
    });
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = waveQueue(rng, wave);
    state.spawnTimer = 0.6;
    state.waveState = 'spawning';
    state.banner = `WAVE ${wave}`;
    state.bannerTimer = 1.6;
  }

  function killEnemy(index, fx, award) {
    const enemy = state.enemies[index];
    const spec = ENEMIES[enemy.kind];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo += 1;
    state.comboTimer = COMBO_WINDOW;
    state.multiplier = 1 + Math.min(MAX_MULTIPLIER - 1, Math.floor(state.combo / COMBO_PER_TIER));
    const points = award === false ? 0 : spec.points * state.multiplier;
    state.score += points;
    fx.bursts.push({ x: enemy.x, y: enemy.y, color: spec.color, n: enemy.kind === 'splitter' ? 26 : 18 });
    fx.rings.push({ x: enemy.x, y: enemy.y, color: spec.color });
    if (points > 0) fx.texts.push({ x: enemy.x, y: enemy.y - 10, text: `+${points}`, color: spec.color });
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const angle = rng.next() * TWO_PI;
        state.enemies.push({
          kind: 'mini',
          x: enemy.x + Math.cos(angle) * 14,
          y: enemy.y + Math.sin(angle) * 14,
          vx: Math.cos(angle) * 160,
          vy: Math.sin(angle) * 160,
          radius: ENEMIES.mini.radius,
          hp: 1,
          speed: ENEMIES.mini.speed,
          angle,
          phase: rng.next() * TWO_PI,
          fireCooldown: 0,
          color: ENEMIES.mini.color,
          spawnAge: 0,
        });
      }
    } else if (award !== false && rng.chance(DROP_CHANCE)) {
      const kinds = ['shield', 'rapid', 'spread', 'bomb'];
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
    } else if (powerup.kind === 'bomb') {
      fx.rings.push({ x: player.x, y: player.y, color: '#ffffff' });
      state.shake = Math.max(state.shake, 16);
      // Keep killing until the field is empty: splitters leave minis behind,
      // and the bomb takes those too.
      while (state.enemies.length > 0) {
        killEnemy(0, fx, true);
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
    player.invuln = INVULN_SECONDS;
    state.shake = 14;
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
          life: 1.1,
        });
      }
      state.shotsFired += offsets.length;
      return EVENT_SHOOT;
    }
    return EVENT_NONE;
  }

  function stepEnemies(dt, fx) {
    const player = state.player;
    for (const enemy of state.enemies) {
      enemy.spawnAge += dt;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const nx = dx / distance;
      const ny = dy / distance;
      if (enemy.kind === 'chaser' || enemy.kind === 'mini' || enemy.kind === 'splitter') {
        enemy.vx += nx * enemy.speed * 2.2 * dt;
        enemy.vy += ny * enemy.speed * 2.2 * dt;
      } else if (enemy.kind === 'weaver') {
        enemy.phase += dt * 5;
        const wobble = Math.sin(enemy.phase) * 0.9;
        enemy.vx += (nx - ny * wobble) * enemy.speed * 2.4 * dt;
        enemy.vy += (ny + nx * wobble) * enemy.speed * 2.4 * dt;
      } else if (enemy.kind === 'shooter') {
        // Holds a firing distance: closes in when far, backs off when close,
        // and strafes sideways the whole time.
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
      const speed = Math.hypot(enemy.vx, enemy.vy);
      const cap = enemy.speed * 1.35;
      if (speed > cap) {
        enemy.vx = (enemy.vx / speed) * cap;
        enemy.vy = (enemy.vy / speed) * cap;
      }
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.angle = Math.atan2(enemy.vy, enemy.vx);
    }
  }

  function stepBullets(dt, fx) {
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.bullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (bullet.life <= 0 || bullet.x < -20 || bullet.x > state.width + 20 || bullet.y < -20 || bullet.y > state.height + 20) {
        state.bullets.splice(i, 1);
        continue;
      }
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const enemy = state.enemies[j];
        if (enemy.spawnAge < 0.25) continue;
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const hit = enemy.radius + bullet.radius;
        if (dx * dx + dy * dy < hit * hit) {
          state.bullets.splice(i, 1);
          enemy.hp -= 1;
          fx.bursts.push({ x: bullet.x, y: bullet.y, color: enemy.color, n: 5, speed: 140 });
          if (enemy.hp <= 0) fx.events |= killEnemy(j, fx, true);
          break;
        }
      }
    }
    for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
      const bullet = state.enemyBullets[i];
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
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
        if (enemy.spawnAge < 0.4) continue;
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
    } else if (state.waveState === 'fighting') {
      if (state.enemies.length === 0 && state.spawnQueue.length === 0) {
        const bonus = WAVE_CLEAR_BONUS * state.wave;
        state.score += bonus;
        state.enemyBullets = [];
        state.waveState = 'clear';
        state.waveTimer = 2.2;
        state.banner = `WAVE ${state.wave} CLEARED  +${bonus}`;
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
      state.bullets = [];
      state.enemyBullets = [];
      state.enemies = [];
      state.powerups = [];
      state.shake = 0;
      state.banner = '';
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
      const kinds = ['chaser', 'weaver', 'splitter', 'shooter', 'chaser', 'weaver'];
      for (let i = 0; i < kinds.length; i += 1) {
        spawnEnemy(kinds[i], rng.range(60, state.width - 60), rng.range(80, state.height - 120));
        const enemy = state.enemies[state.enemies.length - 1];
        enemy.vx = rng.range(-30, 30);
        enemy.vy = rng.range(-18, 18);
        enemy.spawnAge = 1;
      }
      state.bullets = [];
      state.enemyBullets = [];
      state.powerups = [];
    },
    addEnemy(kind, x, y) {
      spawnEnemy(kind, x, y);
      state.enemies[state.enemies.length - 1].spawnAge = 1;
    },
    addBullet(x, y, angle) {
      state.bullets.push({
        x,
        y,
        vx: Math.cos(angle) * PLAYER_BULLET_SPEED,
        vy: Math.sin(angle) * PLAYER_BULLET_SPEED,
        radius: PLAYER_BULLET_RADIUS,
        life: 1.1,
      });
    },
    addPowerup(kind, x, y) {
      state.powerups.push({ kind, x, y, vy: 0, radius: POWERUP_RADIUS, life: 9 });
    },
    step(dt, input) {
      const fx = { events: EVENT_NONE, bursts: [], rings: [], texts: [] };
      state.time += dt;
      state.shake = Math.max(0, state.shake - 30 * dt);
      state.bannerTimer = Math.max(0, state.bannerTimer - dt);
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) {
          state.combo = 0;
          state.multiplier = 1;
        }
      }
      fx.events |= stepPlayer(dt, input, fx);
      stepEnemies(dt, fx);
      stepBullets(dt, fx);
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
