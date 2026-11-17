// The Void Tyrant boss brain.
//
// A boss is one big many-pointed ship with a health pool, an attack cycle
// and an enrage. It lives in the world's state as `state.boss`; this module
// owns everything about how it behaves and nothing about drawing or sound —
// it reports what it does through the `fx` object it is handed, the same
// event channel the world uses, so the main loop can play the right sounds
// and the renderer can flash the right warnings.
//
// The cycle is always: wait, telegraph (flash + ping, ~0.7 s), fire, wait
// again. The three attacks are a radial burst in every direction, an aimed
// fan at the player, and summoning escort ships. The Prime adds a fourth:
// a sweeping spread that tracks the player. Below half health the boss
// enrages — its gaps shrink and it drifts toward the player instead of
// holding its distance.

import {
  BOSS_ENRAGE_FACTOR,
  BOSS_ORB_SPEED,
  BOSS_TELEGRAPH_SECONDS,
  BOSSES,
} from './config.js';

export const EVENT_BOSS_TELEGRAPH = 256;
export const EVENT_BOSS_DIE = 512;
export const EVENT_BOSS_SPAWN = 1024;

const TAU = Math.PI * 2;

function aimAt(boss, player) {
  return Math.atan2(player.y - boss.y, player.x - boss.x);
}

function launchOrb(fx, x, y, angle, speed) {
  fx.enemyBullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 7,
  });
}

// Build a fresh boss. `prime` picks the wave-10 Tyrant Prime; otherwise
// this is the wave-5 Void Tyrant. `x` and `y` place it where it warps in.
export function makeBoss(prime, x, y) {
  const spec = prime ? BOSSES.prime : BOSSES.tyrant;
  return {
    kind: 'boss',
    prime,
    name: spec.name,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: spec.radius,
    hp: spec.hp,
    maxHp: spec.hp,
    speed: spec.speed,
    score: spec.score,
    color: spec.color,
    angle: -Math.PI / 2,
    spin: 0,
    attackIndex: 0,
    attackGap: spec.attackGap,
    attackTimer: 1.4,
    telegraph: 0,
    pendingAttack: null,
    enraged: false,
    hitFlash: 0,
    warp: 0.8,
    spawnAge: 0,
  };
}

// Pick the boss's next attack. The Prime rotates through four patterns;
// the Tyrant through three. Summoning is skipped when the field is already
// crowded, so the player is never buried under escorts.
function chooseAttack(boss, escortCount) {
  const patterns = boss.prime
    ? ['radial', 'fan', 'summon', 'sweep']
    : ['radial', 'fan', 'summon'];
  let attack = patterns[boss.attackIndex % patterns.length];
  boss.attackIndex += 1;
  if (attack === 'summon' && escortCount >= 6) attack = 'radial';
  return attack;
}

function fireAttack(boss, attack, world, fx) {
  const player = world.player;
  const spec = boss.prime ? BOSSES.prime : BOSSES.tyrant;
  const origin = boss.radius * 0.7;
  if (attack === 'radial') {
    const count = spec.radialOrbs;
    const offset = world.rng.next() * TAU;
    for (let i = 0; i < count; i += 1) {
      const angle = offset + (i / count) * TAU;
      launchOrb(fx, boss.x + Math.cos(angle) * origin, boss.y + Math.sin(angle) * origin, angle, BOSS_ORB_SPEED);
    }
  } else if (attack === 'fan') {
    const base = aimAt(boss, player);
    const count = spec.fanOrbs;
    for (let i = 0; i < count; i += 1) {
      const spread = (i - (count - 1) / 2) * 0.22;
      launchOrb(fx, boss.x + Math.cos(base) * origin, boss.y + Math.sin(base) * origin, base + spread, BOSS_ORB_SPEED + 25);
    }
  } else if (attack === 'sweep') {
    // The Prime's signature: a wide spread that tracks the player, fired
    // as three quick fans so the wall of orbs sweeps across the arena.
    const base = aimAt(boss, player);
    for (let fan = -1; fan <= 1; fan += 1) {
      const centre = base + fan * 0.45;
      for (let i = 0; i < 4; i += 1) {
        const spread = (i - 1.5) * 0.16;
        launchOrb(fx, boss.x + Math.cos(centre) * origin, boss.y + Math.sin(centre) * origin, centre + spread, BOSS_ORB_SPEED + 40);
      }
    }
  } else {
    // Summon: a few small escorts warp in around the boss.
    const escorts = spec.escorts;
    for (let i = 0; i < escorts; i += 1) {
      const angle = (i / escorts) * TAU + world.rng.next() * 0.6;
      world.spawnEscort('chaser', boss.x + Math.cos(angle) * (boss.radius + 30), boss.y + Math.sin(angle) * (boss.radius + 30));
    }
  }
  fx.events |= 128; // EVENT_ENEMY_SHOOT — reuse the world's enemy-fire bit.
}

// Advance the boss one step. `world` is a small view of the simulation the
// boss needs: the player, the arena size, the seeded rng, a way to spawn
// escorts, and the live escort count. Returns nothing; everything the boss
// does lands in `fx` (events, bullets, floating text).
export function stepBoss(boss, world, dt, fx) {
  boss.spawnAge += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  boss.spin += dt * (boss.enraged ? 1.6 : 0.9);
  boss.angle = boss.spin;
  if (boss.warp > 0) {
    boss.warp = Math.max(0, boss.warp - dt);
    return;
  }

  const player = world.player;
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy) || 1;
  const nx = dx / distance;
  const ny = dy / distance;

  // Movement: hold a fighting distance and strafe; enraged, close in.
  let wantX = 0;
  let wantY = 0;
  if (boss.enraged) {
    wantX = nx;
    wantY = ny;
  } else if (distance > 300) {
    wantX = nx;
    wantY = ny;
  } else if (distance < 210) {
    wantX = -nx;
    wantY = -ny;
  }
  const strafe = Math.sin(boss.spawnAge * 0.7) * 0.55;
  boss.vx += (wantX - ny * strafe) * boss.speed * 1.6 * dt;
  boss.vy += (wantY + nx * strafe) * boss.speed * 1.6 * dt;
  const speed = Math.hypot(boss.vx, boss.vy);
  const cap = boss.speed * (boss.enraged ? 1.7 : 1.25);
  if (speed > cap) {
    boss.vx = (boss.vx / speed) * cap;
    boss.vy = (boss.vy / speed) * cap;
  }
  boss.x = Math.min(Math.max(boss.x + boss.vx * dt, boss.radius), world.width - boss.radius);
  boss.y = Math.min(Math.max(boss.y + boss.vy * dt, boss.radius), world.height - boss.radius);

  // Enrage once, the moment health drops to half.
  if (!boss.enraged && boss.hp <= boss.maxHp / 2) {
    boss.enraged = true;
    boss.attackGap *= BOSS_ENRAGE_FACTOR;
    fx.texts.push({ x: boss.x, y: boss.y - boss.radius - 18, text: `${boss.name} ENRAGED!`, color: '#ff3b30' });
  }

  // Attack cycle: count down, telegraph, then fire.
  if (boss.telegraph > 0) {
    boss.telegraph -= dt;
    if (boss.telegraph <= 0) {
      fireAttack(boss, boss.pendingAttack, world, fx);
      boss.pendingAttack = null;
      boss.attackTimer = boss.attackGap * world.rng.range(0.85, 1.15);
    }
    return;
  }
  boss.attackTimer -= dt;
  if (boss.attackTimer <= 0) {
    boss.pendingAttack = chooseAttack(boss, world.escortCount);
    boss.telegraph = BOSS_TELEGRAPH_SECONDS;
    fx.events |= EVENT_BOSS_TELEGRAPH;
  }
}

// What the boss pays when it dies, before the wave-clear bonus: its own
// score value, multiplied by the combo at the moment of the kill.
export function bossKillScore(boss, multiplier) {
  return boss.score * multiplier;
}
