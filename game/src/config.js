// VOIDLIGHT — Neon Arena. Tuning and palette in one place, so the feel of the
// game can be changed without touching the simulation or the renderer.

export const STEP = 1 / 60;
export const BEST_KEY = 'voidlight.best';

// The player wins by clearing wave 10; losing all lives ends the run.
export const WIN_WAVE = 10;
export const LIVES = 3;

// Player ship.
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED = 360;
export const PLAYER_ACCEL = 2600;
export const PLAYER_FIRE_INTERVAL = 0.13;
export const PLAYER_BULLET_SPEED = 640;
export const PLAYER_BULLET_RADIUS = 4;
export const INVULN_SECONDS = 2;

// Scoring. Kills feed a combo: every 8 kills without a 2.5 s gap raises the
// multiplier by one, up to x5. A cleared wave pays 250 times its number.
export const COMBO_WINDOW = 2.5;
export const COMBO_PER_TIER = 8;
export const MAX_MULTIPLIER = 5;
export const WAVE_CLEAR_BONUS = 250;

// Enemy kinds: points, radius, hit points, speed and the colour they glow.
export const ENEMIES = {
  chaser: { points: 100, radius: 15, hp: 1, speed: 125, color: '#ff2e63' },
  weaver: { points: 150, radius: 14, hp: 1, speed: 165, color: '#ffd319' },
  splitter: { points: 200, radius: 20, hp: 2, speed: 85, color: '#3dff8e' },
  mini: { points: 50, radius: 9, hp: 1, speed: 210, color: '#3dff8e' },
  shooter: { points: 250, radius: 17, hp: 2, speed: 95, color: '#b967ff' },
};
export const ENEMY_BULLET_SPEED = 170;
export const ENEMY_BULLET_RADIUS = 6;

// Power-ups: a kill drops one 12% of the time. Shield blocks one hit, rapid
// doubles the fire rate, spread fires three shots at once, bomb clears the
// field. Timed ones last this long.
export const DROP_CHANCE = 0.12;
export const POWERUP_SECONDS = 9;
export const POWERUP_FALL_SPEED = 55;
export const POWERUP_RADIUS = 13;

// Neon palette for the arena and the interface.
export const COLORS = {
  backgroundTop: '#070a1c',
  backgroundBottom: '#04050d',
  player: '#35f0ff',
  bullet: '#c8fbff',
  enemyBullet: '#ff5d7a',
  text: '#eaf6ff',
  dimText: '#8fa8c8',
  accent: '#ff2e63',
  gold: '#ffd319',
  shield: '#4dff88',
  rapid: '#ff9f1c',
  spread: '#ff5df2',
  bomb: '#ffffff',
};

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  OVER: 'over',
  WIN: 'win',
};
