// VOIDLIGHT v2 — tuning, roster and palette in one place.
//
// Everything that decides how the game feels lives here: the player's ship,
// the six regular enemy kinds, the two Tyrant bosses, the five power-ups
// (the Chrono time-slow is new in v2) and the neon colours the renderer
// paints with. Changing a number here retunes the game without touching the
// simulation, the boss brain or the painter.

export const STEP = 1 / 60;
export const BEST_KEY = 'voidlight.best';

// Ten waves, the last one is the final boss. Three lives, no continues.
export const WIN_WAVE = 10;
export const LIVES = 3;
export const BOSS_WAVES = [5, 10];

// The player's ship: quick to steer, quick to fire.
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED = 360;
export const PLAYER_ACCEL = 2600;
export const PLAYER_FIRE_INTERVAL = 0.13;
export const PLAYER_BULLET_SPEED = 720;
export const PLAYER_BULLET_RADIUS = 5;
export const INVULN_SECONDS = 2.5;

// Scoring: kills build a combo — eight kills inside the window raises the
// multiplier a tier, up to x5 — and a cleared wave pays 250 per wave number.
export const COMBO_WINDOW = 2.5;
export const COMBO_PER_TIER = 8;
export const MAX_MULTIPLIER = 5;
export const WAVE_CLEAR_BONUS = 250;

// Every ship warps in before it can fight: a warning ring shows where it
// will appear, and while it is warping it can neither shoot nor be shot.
export const WARP_SECONDS = 0.55;

// Regular enemies: what they pay, how big they are, how many hits they
// take, how fast they move and the colour they glow. The dasher (a dart
// that pauses, telegraphs a line, then lunges) and the orbiter (a ring
// that circles the player and fires aimed orbs) are new in v2. The sniper
// is new in v3: an ice-white star that holds a long firing distance,
// takes aim down a thin telegraph line, and fires one very fast bolt.
export const ENEMIES = {
  chaser: { points: 100, radius: 15, hp: 1, speed: 108, color: '#ff2e63' },
  weaver: { points: 150, radius: 14, hp: 1, speed: 150, color: '#ffd319' },
  splitter: { points: 200, radius: 20, hp: 2, speed: 85, color: '#3dff8e' },
  mini: { points: 50, radius: 9, hp: 1, speed: 210, color: '#3dff8e' },
  shooter: { points: 250, radius: 17, hp: 2, speed: 95, color: '#b967ff' },
  dasher: { points: 175, radius: 14, hp: 1, speed: 150, color: '#ff7a1a' },
  orbiter: { points: 225, radius: 16, hp: 2, speed: 110, color: '#2ee6c8' },
  sniper: { points: 275, radius: 15, hp: 2, speed: 80, color: '#b8f1ff' },
};
export const ENEMY_BULLET_SPEED = 170;
export const ENEMY_BULLET_RADIUS = 6;

// The dasher's rhythm: hold still and aim, lunge along the telegraphed
// line, then drift slowly while it recovers.
export const DASHER_STALK_SECONDS = 0.65;
export const DASHER_DASH_SECONDS = 0.32;
export const DASHER_DASH_SPEED = 560;
export const DASHER_RECOVER_SECONDS = 0.85;

// The orbiter keeps this distance from the player and fires this often.
export const ORBITER_RANGE = 235;
export const ORBITER_FIRE_INTERVAL = 2.2;

// The sniper's rhythm: hold a long firing distance and strafe, take aim
// down a telegraph line for a beat, fire one fast bolt, then cool down.
// At most two snipers join any one wave, so the player is never fenced in
// by crossing aim lines.
export const SNIPER_AIM_SECONDS = 1.1;
export const SNIPER_COOL_SECONDS = 2.6;
export const SNIPER_BOLT_SPEED = 430;
export const SNIPER_MAX_RANGE = 640;
export const SNIPER_PER_WAVE = 2;

// The two Tyrants. The mid-boss on wave 5 is the Void Tyrant; the final
// boss on wave 10 is the Void Tyrant Prime — bigger, tougher, faster, and
// with one extra attack (the sweeping spread) of its own.
export const BOSSES = {
  tyrant: {
    name: 'VOID TYRANT',
    radius: 46,
    hp: 60,
    speed: 62,
    score: 5000,
    color: '#ff2e63',
    attackGap: 2.6,
    radialOrbs: 14,
    fanOrbs: 5,
    escorts: 3,
  },
  prime: {
    name: 'VOID TYRANT PRIME',
    radius: 58,
    hp: 110,
    speed: 74,
    score: 10000,
    color: '#ff5df2',
    attackGap: 2.0,
    radialOrbs: 18,
    fanOrbs: 7,
    escorts: 4,
  },
};
// A boss flashes and pings this long before each attack lands, so the
// player always gets a chance to dodge. Below half health it enrages and
// its attacks come this much faster.
export const BOSS_TELEGRAPH_SECONDS = 0.7;
export const BOSS_ENRAGE_FACTOR = 0.62;
export const BOSS_ORB_SPEED = 155;

// Power-ups. A kill drops one 12% of the time, from a table shared by all
// six kinds. Shield blocks one hit; rapid doubles the fire rate; spread
// fires three shots at once; bomb clears the field; chrono — new in v2 —
// slows every enemy and enemy bullet to 40% while the player stays fast;
// overdrive — new in v3 — makes the player's rounds pierce through one
// extra ship and quickens the trigger for 8 seconds.
export const DROP_CHANCE = 0.12;
export const POWERUP_SECONDS = 9;
export const POWERUP_FALL_SPEED = 55;
export const POWERUP_RADIUS = 13;
export const CHRONO_SECONDS = 6;
export const CHRONO_SLOW = 0.4;
// While Chrono runs, the player's own bullets fly a quarter faster too:
// the time dilation favours the pilot, not just the slowdown.
export const CHRONO_BULLET_BOOST = 1.25;
export const OVERDRIVE_SECONDS = 8;
export const OVERDRIVE_FIRE_FACTOR = 0.6;

// A wave clear and a boss kill both freeze the action for a beat: enemies
// crawl at this fraction of speed while the slow-motion lasts.
export const SLOWMO_FACTOR = 0.28;
export const SLOWMO_WAVE_SECONDS = 0.7;
export const SLOWMO_BOSS_SECONDS = 1.1;

// Neon palette for the arena, the ships and the interface.
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
  chrono: '#7ad7ff',
  overdrive: '#ffb347',
  sniper: '#b8f1ff',
  dasher: '#ff7a1a',
  orbiter: '#2ee6c8',
  boss: '#ff2e63',
  bossPrime: '#ff5df2',
  danger: '#ff3b30',
};

export const SCREENS = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  OVER: 'over',
  WIN: 'win',
};
