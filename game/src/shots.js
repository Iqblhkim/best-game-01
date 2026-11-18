// Staging for screenshots: each named shot arranges one readable scene from
// the game's own state — the title, a busy mid-fight moment with its HUD, a
// victory and a game over — then the main loop paints it twice and raises
// window.__shotReady. Every placement is derived from the arena size and a
// fixed seed, so the same shot always renders the same frame.
//
// v2 re-stages the play shot as the wave-10 boss fight: the Void Tyrant
// Prime filling the top of the arena with its health bar, its aimed orbs
// in flight, the player firing with spread shot under a Chrono slow, a
// dasher telegraphing its lunge and an orbiter circling in. The victory
// shot now shows the boss-defeat flourish with the boss bonus in the stats.

import { SCREENS } from './config.js';

export function stageShot(name, world, particles) {
  const state = world.state;
  const width = state.width;
  const height = state.height;
  particles.clear();
  state.bullets = [];
  state.enemyBullets = [];
  state.powerups = [];
  state.enemies = [];
  state.boss = null;
  state.shake = 0;

  if (name === 'start') {
    world.reset();
    world.seedDemo();
    state.score = 0;
    state.wave = 1;
    state.lives = 3;
    state.banner = '';
    state.bannerTimer = 0;
    return { screen: SCREENS.TITLE, best: Math.max(state.best, 12400) };
  }

  if (name === 'play') {
    world.reset();
    state.wave = 10;
    state.waveState = 'boss';
    state.spawnQueue = [];
    state.score = 18450;
    state.best = Math.max(state.best, 18450);
    state.combo = 32;
    state.comboTimer = 2.1;
    state.multiplier = 5;
    state.lives = 2;
    state.banner = 'VOID TYRANT PRIME';
    state.bannerSub = 'Destroy the Prime to win';
    state.bannerTimer = 1.6;
    const player = state.player;
    player.x = width * 0.42;
    player.y = height * 0.62;
    player.angle = -0.9;
    player.thrust = 1;
    player.spreadUntil = state.time + 6;
    player.chronoUntil = state.time + 4;
    player.overdriveUntil = state.time + 6;
    // The Prime itself, mid-fight: just over half health, telegraphing its
    // next attack so the warning ring shows.
    const boss = world.addBoss(true, width * 0.62, height * 0.30);
    boss.hp = 58;
    boss.warp = 0;
    boss.telegraph = 0.45;
    boss.pendingAttack = 'fan';
    boss.angle = 0.6;
    // Its court: a dasher winding up a lunge, an orbiter circling, a
    // sniper taking aim down its telegraph line, and two regular ships
    // closing in.
    const dasher = world.addEnemy('dasher', width * 0.24, height * 0.34);
    dasher.dashState = 'stalk';
    dasher.dashTimer = 0.5;
    dasher.dashAngle = Math.atan2(player.y - height * 0.34, player.x - width * 0.24);
    dasher.angle = dasher.dashAngle;
    const sniper = world.addEnemy('sniper', width * 0.13, height * 0.28);
    sniper.sniperState = 'aim';
    sniper.sniperTimer = 0.7;
    sniper.sniperAngle = Math.atan2(player.y - height * 0.28, player.x - width * 0.13);
    sniper.angle = sniper.sniperAngle;
    const orbiter = world.addEnemy('orbiter', width * 0.84, height * 0.58);
    orbiter.orbitAngle = -0.8;
    const chaser = world.addEnemy('chaser', width * 0.78, height * 0.18);
    chaser.angle = 2.6;
    const shooter = world.addEnemy('shooter', width * 0.16, height * 0.72);
    shooter.angle = -0.4;
    // The player's spread fire, climbing toward the boss.
    const shots = [
      [-0.9, 120],
      [-0.74, 150],
      [-1.06, 90],
      [-0.9, 60],
      [-0.62, 185],
      [-1.18, 185],
    ];
    for (const [angle, distance] of shots) {
      world.addBullet(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, angle);
    }
    // The Prime's aimed orbs, already in flight toward the player, plus
    // one sniper bolt streaking in from the left.
    const orbAngles = [-2.5, -2.2, -1.9, -2.7, -2.35];
    for (const angle of orbAngles) {
      state.enemyBullets.push({
        x: boss.x + Math.cos(angle) * 90,
        y: boss.y + Math.sin(angle) * 90,
        vx: Math.cos(angle) * 155,
        vy: Math.sin(angle) * 155,
        radius: 7,
      });
    }
    const boltAngle = Math.atan2(player.y - height * 0.28, player.x - width * 0.13);
    state.enemyBullets.push({
      x: width * 0.13 + Math.cos(boltAngle) * 190,
      y: height * 0.28 + Math.sin(boltAngle) * 190,
      vx: Math.cos(boltAngle) * 430,
      vy: Math.sin(boltAngle) * 430,
      radius: 7,
      sniper: true,
    });
    world.addPowerup('chrono', width * 0.56, height * 0.42);
    state.muzzle = { x: player.x + Math.cos(player.angle) * 22, y: player.y + Math.sin(player.angle) * 22, angle: player.angle, timer: 0.06 };
    particles.burst(width * 0.72, height * 0.44, '#ff5df2', 22, 300);
    particles.burst(width * 0.3, height * 0.7, '#ffd319', 14, 220);
    particles.ring(width * 0.72, height * 0.44, '#ff5df2', 70);
    particles.text(width * 0.72, height * 0.44 - 26, '+500', '#ff5df2');
    particles.text(width * 0.3, height * 0.7 - 20, '+150', '#ffd319');
    return { screen: SCREENS.PLAY, best: state.best };
  }

  if (name === 'win') {
    world.reset();
    state.wave = 10;
    state.waveState = 'clear';
    state.spawnQueue = [];
    state.score = 24850;
    state.best = 24850;
    state.kills = 186;
    state.shotsFired = 512;
    state.time = 412;
    state.maxMultiplier = 5;
    state.bossesKilled = 2;
    state.lives = 2;
    state.bossBonus = 10000;
    state.bossName = 'VOID TYRANT PRIME';
    state.banner = '';
    state.bannerTimer = 0;
    const player = state.player;
    player.x = width * 0.5;
    player.y = height * 0.56;
    player.angle = -Math.PI / 2;
    player.shield = true;
    // The flourish where the Prime died: gold and white bursts, wide rings.
    const golds = ['#ffd319', '#35f0ff', '#ff5df2', '#3dff8e', '#ffffff'];
    for (let i = 0; i < 26; i += 1) {
      particles.burst(width * (0.15 + 0.7 * ((i * 37) % 100) / 100), height * (0.2 + 0.55 * ((i * 53) % 100) / 100), golds[i % golds.length], 10, 180);
    }
    particles.burst(width * 0.5, height * 0.3, '#ff5df2', 40, 380);
    particles.burst(width * 0.5, height * 0.3, '#ffffff', 26, 300);
    particles.ring(width * 0.5, height * 0.3, '#ff5df2', 160);
    particles.ring(width * 0.5, height * 0.3, '#ffffff', 110);
    particles.text(width * 0.5, height * 0.3 - 30, '+10000', '#ffd319');
    return { screen: SCREENS.WIN, best: state.best };
  }

  // 'end'
  world.reset();
  state.wave = 6;
  state.waveState = 'fighting';
  state.spawnQueue = [];
  state.score = 7320;
  state.best = Math.max(state.best, 12400);
  state.kills = 87;
  state.shotsFired = 241;
  state.time = 265;
  state.maxMultiplier = 3;
  state.bossesKilled = 1;
  state.lives = 0;
  state.banner = '';
  state.bannerTimer = 0;
  const player = state.player;
  player.x = width * 0.5;
  player.y = height * 0.55;
  particles.burst(player.x, player.y, '#35f0ff', 30, 320);
  particles.burst(player.x, player.y, '#ff2e63', 20, 260);
  particles.ring(player.x, player.y, '#ff2e63', 110);
  world.addEnemy('chaser', width * 0.3, height * 0.3);
  world.addEnemy('weaver', width * 0.72, height * 0.28);
  world.addEnemy('shooter', width * 0.78, height * 0.7);
  world.addEnemy('dasher', width * 0.24, height * 0.72);
  const endSniper = world.addEnemy('sniper', width * 0.62, height * 0.18);
  endSniper.sniperState = 'cool';
  endSniper.sniperTimer = 1;
  return { screen: SCREENS.OVER, best: state.best };
}
