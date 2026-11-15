// Staging for screenshots: each named shot arranges one readable scene from
// the game's own state — the title, a busy mid-fight moment with its HUD, a
// victory and a game over — then the main loop paints it twice and raises
// window.__shotReady. Every placement is derived from the arena size and a
// fixed seed, so the same shot always renders the same frame.

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
    state.wave = 4;
    state.waveState = 'fighting';
    state.spawnQueue = [];
    state.score = 2450;
    state.best = Math.max(state.best, 12400);
    state.combo = 17;
    state.comboTimer = 2.1;
    state.multiplier = 3;
    state.lives = 3;
    state.banner = 'WAVE 4';
    state.bannerTimer = 1.2;
    const player = state.player;
    player.x = width * 0.42;
    player.y = height * 0.58;
    player.angle = -0.5;
    player.thrust = 1;
    player.spreadUntil = state.time + 6;
    const spots = [
      ['chaser', 0.68, 0.3, -2.4],
      ['weaver', 0.78, 0.52, 2.8],
      ['splitter', 0.6, 0.18, 0.4],
      ['shooter', 0.85, 0.72, -2.9],
      ['chaser', 0.24, 0.26, 1.2],
      ['weaver', 0.16, 0.62, 0.9],
      ['splitter', 0.34, 0.82, -0.6],
      ['mini', 0.55, 0.42, 2.2],
    ];
    for (const [kind, fx, fy, angle] of spots) {
      world.addEnemy(kind, width * fx, height * fy);
      const enemy = state.enemies[state.enemies.length - 1];
      enemy.angle = angle;
      enemy.vx = Math.cos(angle + 1.2) * 40;
      enemy.vy = Math.sin(angle + 1.2) * 40;
    }
    const shots = [
      [-0.5, 120],
      [-0.34, 150],
      [-0.66, 90],
      [-0.5, 60],
      [-0.2, 180],
    ];
    for (const [angle, distance] of shots) {
      world.addBullet(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, angle);
    }
    world.addPowerup('rapid', width * 0.52, height * 0.3);
    particles.burst(width * 0.72, height * 0.4, '#ff2e63', 22, 300);
    particles.burst(width * 0.3, height * 0.7, '#ffd319', 14, 220);
    particles.ring(width * 0.72, height * 0.4, '#ff2e63', 70);
    particles.text(width * 0.72, height * 0.4 - 26, '+300', '#ff2e63');
    particles.text(width * 0.3, height * 0.7 - 20, '+150', '#ffd319');
    return { screen: SCREENS.PLAY, best: state.best };
  }

  if (name === 'win') {
    world.reset();
    state.wave = 10;
    state.waveState = 'clear';
    state.spawnQueue = [];
    state.score = 12850;
    state.best = 12850;
    state.kills = 142;
    state.shotsFired = 388;
    state.lives = 2;
    state.banner = '';
    state.bannerTimer = 0;
    const player = state.player;
    player.x = width * 0.5;
    player.y = height * 0.56;
    player.angle = -Math.PI / 2;
    player.shield = true;
    const golds = ['#ffd319', '#35f0ff', '#ff5df2', '#3dff8e', '#ffffff'];
    for (let i = 0; i < 26; i += 1) {
      particles.burst(width * (0.15 + 0.7 * ((i * 37) % 100) / 100), height * (0.2 + 0.55 * ((i * 53) % 100) / 100), golds[i % golds.length], 10, 180);
    }
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
  world.addEnemy('splitter', width * 0.24, height * 0.72);
  return { screen: SCREENS.OVER, best: state.best };
}
