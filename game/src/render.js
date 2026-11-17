// The painter: a neon arena on one canvas.
//
// A drifting starfield over deep nebulae, glowing vector ships, additive
// sparks and a HUD that always tells the player the score, the wave and the
// lives left. Everything is drawn from code; there are no image or font
// files to load.
//
// v2 adds the look of the new systems: warp-in warning rings, the dasher's
// telegraphed lunge line, hit flashes on struck ships, a muzzle flash at
// the player's nose, a red vignette when the player is hurt and a pulsing
// last-life warning, a slow blue tint while Chrono runs, and the boss
// itself — a big many-pointed Tyrant with a health bar across the top of
// the screen and a flashing warning before each of its attacks.

import { COMBO_WINDOW, COLORS, ENEMIES, MAX_MULTIPLIER, WIN_WAVE } from './config.js';
import { createRandom } from './random.js';

const TAU = Math.PI * 2;

// The player's dart: a pointed nose, swept wings and a notch at the tail.
// `flame` stretches an engine tongue out of the back when thrusting.
function dartPath(ctx, x, y, angle, radius, flame) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(radius * 1.25, 0);
  ctx.lineTo(-radius * 0.8, radius * 0.75);
  ctx.lineTo(-radius * 0.35, 0);
  ctx.lineTo(-radius * 0.8, -radius * 0.75);
  ctx.closePath();
  if (flame) {
    ctx.moveTo(-radius * 0.8, radius * 0.4);
    ctx.lineTo(-radius * (1.5 + flame * 0.7), 0);
    ctx.lineTo(-radius * 0.8, -radius * 0.4);
    ctx.closePath();
  }
  ctx.restore();
}

function polyPath(ctx, x, y, angle, radius, sides) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = angle + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// A many-pointed star: alternating long and short spikes, for the Tyrant.
function starPath(ctx, x, y, angle, radius, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = angle + (i / (points * 2)) * TAU;
    const r = i % 2 === 0 ? radius : radius * 0.55;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 960;
  let height = 600;
  let dpr = 1;

  // A fixed-seed starfield: the same sky every load, three depths drifting.
  const skyRandom = createRandom(1337);
  const stars = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const count = [70, 46, 26][layer];
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: skyRandom.next(),
        y: skyRandom.next(),
        size: [1, 1.5, 2.2][layer],
        layer,
        phase: skyRandom.next() * TAU,
        speed: [0.4, 0.8, 1.4][layer],
      });
    }
  }
  const nebulae = [
    { x: 0.2, y: 0.25, radius: 0.42, color: 'rgba(88, 40, 180, 0.20)' },
    { x: 0.82, y: 0.2, radius: 0.36, color: 'rgba(16, 110, 140, 0.18)' },
    { x: 0.68, y: 0.85, radius: 0.44, color: 'rgba(180, 30, 90, 0.13)' },
    { x: 0.12, y: 0.8, radius: 0.34, color: 'rgba(20, 90, 120, 0.14)' },
  ];

  function glowText(text, x, y, font, fill, blur = 18, align = 'center') {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fill;
    ctx.shadowBlur = blur;
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function paintBackground(time) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, COLORS.backgroundTop);
    gradient.addColorStop(1, COLORS.backgroundBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const nebula of nebulae) {
      const nx = nebula.x * width + Math.sin(time * 0.02 + nebula.x * 9) * 14;
      const ny = nebula.y * height + Math.cos(time * 0.017 + nebula.y * 7) * 10;
      const radius = nebula.radius * Math.max(width, height);
      const fill = ctx.createRadialGradient(nx, ny, 0, nx, ny, radius);
      fill.addColorStop(0, nebula.color);
      fill.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fill;
      ctx.fillRect(nx - radius, ny - radius, radius * 2, radius * 2);
    }
    ctx.restore();

    for (const star of stars) {
      const drift = ((time * star.speed * 2 + star.x * width) % width);
      const twinkle = 0.55 + 0.45 * Math.sin(time * 1.4 + star.phase);
      ctx.globalAlpha = 0.35 + 0.5 * twinkle * (star.layer + 1) / 3;
      ctx.fillStyle = star.layer === 2 ? '#cfe9ff' : '#9db8dd';
      ctx.fillRect(drift, star.y * height, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  function paintPlayerShip(x, y, angle, radius, color, flame) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(6, 10, 24, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    dartPath(ctx, x, y, angle, radius, flame);
    ctx.fill();
    ctx.stroke();
    if (flame) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffb347';
      ctx.shadowColor = '#ff9f1c';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-radius * 0.8, radius * 0.32);
      ctx.lineTo(-radius * (1.35 + flame * 0.6), 0);
      ctx.lineTo(-radius * 0.8, -radius * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * radius * 0.35, y + Math.sin(angle) * radius * 0.35, 2.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The ring that warns where a ship is about to warp in, shrinking as the
  // warp finishes. While it shows, the ship is not solid yet.
  function paintWarpRing(enemy, time) {
    const progress = 1 - enemy.warp / 0.55;
    const radius = enemy.radius * (2.2 - progress * 1.2);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.55 * (1 - progress);
    ctx.strokeStyle = enemy.color;
    ctx.shadowColor = enemy.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time * 40;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function paintEnemy(enemy, time) {
    const spec = ENEMIES[enemy.kind];
    const color = spec.color;
    if (enemy.warp > 0) {
      paintWarpRing(enemy, time);
      return;
    }
    // The dasher aims its lunge out loud: a dashed line toward the player
    // while it pauses, so the dash never comes out of nowhere.
    if (enemy.kind === 'dasher' && enemy.dashState === 'stalk') {
      const pulse = 0.45 + 0.4 * Math.sin(time * 14);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(enemy.x + Math.cos(enemy.dashAngle) * 280, enemy.y + Math.sin(enemy.dashAngle) * 280);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    const pulse = 1 + 0.08 * Math.sin(time * 6 + enemy.phase);
    const radius = enemy.radius * pulse;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(8, 8, 20, 0.92)';
    ctx.lineWidth = 2.5;
    if (enemy.kind === 'chaser' || enemy.kind === 'mini') {
      dartPath(ctx, enemy.x, enemy.y, enemy.angle, radius, 0);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === 'weaver') {
      polyPath(ctx, enemy.x, enemy.y, enemy.angle, radius, 4);
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === 'splitter') {
      polyPath(ctx, enemy.x, enemy.y, enemy.angle + time * 0.8, radius, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      polyPath(ctx, enemy.x, enemy.y, -enemy.angle, radius * 0.4, 6);
      ctx.fill();
    } else if (enemy.kind === 'shooter') {
      polyPath(ctx, enemy.x, enemy.y, enemy.angle, radius, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(enemy.x, enemy.y);
      ctx.lineTo(enemy.x + Math.cos(enemy.angle) * (radius + 8), enemy.y + Math.sin(enemy.angle) * (radius + 8));
      ctx.stroke();
    } else if (enemy.kind === 'dasher') {
      // A slim dart, nose first along its dash line.
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.rotate(enemy.dashState === 'dash' ? enemy.dashAngle : enemy.angle);
      ctx.beginPath();
      ctx.moveTo(radius * 1.5, 0);
      ctx.lineTo(-radius * 0.7, radius * 0.5);
      ctx.lineTo(-radius * 0.3, 0);
      ctx.lineTo(-radius * 0.7, -radius * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (enemy.kind === 'orbiter') {
      // A ring ship: two circles, one spinning slowly inside the other.
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, radius * 0.55, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = color;
      const dotA = enemy.orbitAngle;
      ctx.beginPath();
      ctx.arc(enemy.x + Math.cos(dotA) * radius * 0.55, enemy.y + Math.sin(dotA) * radius * 0.55, 2.5, 0, TAU);
      ctx.fill();
    }
    // A hit flashes the ship pale for a beat.
    if (enemy.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, enemy.hitFlash * 6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, radius * 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function paintBoss(boss, time) {
    if (boss.warp > 0) {
      paintWarpRing(boss, time);
      return;
    }
    const color = boss.color;
    const telegraphing = boss.telegraph > 0;
    const flash = telegraphing && Math.floor(time * 10) % 2 === 0;
    const radius = boss.radius * (1 + 0.04 * Math.sin(time * 5));
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = flash ? '#ffffff' : color;
    ctx.fillStyle = flash ? 'rgba(120, 20, 40, 0.95)' : 'rgba(10, 6, 20, 0.95)';
    ctx.lineWidth = 3;
    starPath(ctx, boss.x, boss.y, boss.angle, radius, boss.prime ? 10 : 8);
    ctx.fill();
    ctx.stroke();
    // Inner ring and core eye, turning with the ship.
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius * 0.55, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = flash ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius * 0.22 + Math.sin(time * 4) * 2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, radius * 0.1, 0, TAU);
    ctx.fill();
    if (boss.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, boss.hitFlash * 5);
      ctx.fillStyle = '#ffffff';
      starPath(ctx, boss.x, boss.y, boss.angle, radius, boss.prime ? 10 : 8);
      ctx.fill();
    }
    ctx.restore();
    // The telegraph ring: it closes in on the boss as the attack approaches.
    if (telegraphing) {
      const progress = 1 - boss.telegraph / 0.7;
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(time * 16);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, radius + 44 - progress * 30, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function paintPowerup(powerup, time) {
    const colors = { shield: COLORS.shield, rapid: COLORS.rapid, spread: COLORS.spread, bomb: COLORS.bomb, chrono: COLORS.chrono };
    const glyphs = { shield: 'S', rapid: 'R', spread: '3', bomb: 'B', chrono: 'C' };
    const color = colors[powerup.kind];
    const bob = Math.sin(time * 3 + powerup.x) * 3;
    const blink = powerup.life < 2 ? (Math.sin(time * 14) > 0 ? 1 : 0.35) : 1;
    ctx.save();
    ctx.globalAlpha = blink;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = color;
    ctx.fillStyle = 'rgba(8, 10, 24, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(powerup.x, powerup.y + bob, powerup.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (powerup.kind === 'chrono') {
      // A little clock face around the C.
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y + bob, powerup.radius * 0.62, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyphs[powerup.kind], powerup.x, powerup.y + bob + 0.5);
    ctx.restore();
  }

  function paintLives(lives) {
    for (let i = 0; i < 3; i += 1) {
      const x = width - 30 - i * 30;
      const y = 30;
      ctx.save();
      if (i < lives) {
        ctx.shadowColor = COLORS.player;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = COLORS.player;
        ctx.fillStyle = 'rgba(6, 14, 24, 0.9)';
        ctx.lineWidth = 1.8;
        dartPath(ctx, x, y, -Math.PI / 2, 10, 0);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = COLORS.dimText;
        ctx.lineWidth = 1.5;
        dartPath(ctx, x, y, -Math.PI / 2, 10, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // The boss health bar: the Tyrant's name and a long bar across the top.
  function paintBossBar(boss) {
    if (!boss) return;
    const barWidth = Math.min(460, width * 0.42);
    const x = (width - barWidth) / 2;
    const y = 84;
    const fraction = Math.max(0, boss.hp / boss.maxHp);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillStyle = boss.enraged ? '#ff3b30' : boss.color;
    ctx.shadowColor = boss.color;
    ctx.shadowBlur = 10;
    ctx.fillText(boss.enraged ? `${boss.name} — ENRAGED` : boss.name, width / 2, y - 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(8, 10, 26, 0.85)';
    ctx.strokeStyle = boss.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, 12, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = boss.enraged ? '#ff3b30' : boss.color;
    if (fraction > 0.02) {
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, (barWidth - 4) * fraction, 8, 4);
      ctx.fill();
    }
    ctx.restore();
  }

  function paintHud(state, best) {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.shadowColor = COLORS.player;
    ctx.shadowBlur = 10;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${String(state.score).padStart(6, '0')}`, 20, 28);
    ctx.shadowBlur = 0;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`BEST ${String(Math.max(best, state.score)).padStart(6, '0')}`, 20, 54);
    if (state.multiplier > 1) {
      const fraction = state.comboTimer / COMBO_WINDOW;
      ctx.fillStyle = COLORS.gold;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.fillText(state.multiplier >= MAX_MULTIPLIER ? `COMBO x${state.multiplier} — MAX!` : `COMBO x${state.multiplier}`, 20, 78);
      ctx.fillStyle = 'rgba(255, 211, 25, 0.25)';
      ctx.fillRect(20, 90, 120, 5);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(20, 90, 120 * fraction, 5);
    }
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`WAVE ${state.wave} / ${WIN_WAVE}`, width / 2, 28);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`${state.enemies.length + (state.boss ? 1 : 0)} HOSTILES`, width / 2, 52);
    paintBossBar(state.boss);
    paintLives(state.lives);
    ctx.textAlign = 'right';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('P pause · M mute · R restart', width - 20, height - 18);
    // Active power-up timers, bottom left — Chrono gets its own chip.
    let chipX = 20;
    const chips = [];
    const player = state.player;
    if (player) {
      if (player.shield) chips.push(['SHIELD', COLORS.shield]);
      if (state.time < player.rapidUntil) chips.push([`RAPID ${Math.ceil(player.rapidUntil - state.time)}s`, COLORS.rapid]);
      if (state.time < player.spreadUntil) chips.push([`SPREAD ${Math.ceil(player.spreadUntil - state.time)}s`, COLORS.spread]);
      if (state.time < player.chronoUntil) chips.push([`CHRONO ${Math.ceil(player.chronoUntil - state.time)}s`, COLORS.chrono]);
    }
    ctx.textAlign = 'left';
    for (const [label, color] of chips) {
      ctx.font = '700 12px system-ui, sans-serif';
      const chipWidth = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(8, 12, 26, 0.8)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(chipX, height - 38, chipWidth, 22, 11);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(label, chipX + 9, height - 27);
      chipX += chipWidth + 8;
    }
    // One life left: a pulsing warning under the wave counter.
    if (state.lives === 1) {
      const pulse = 0.55 + 0.45 * Math.sin(state.time * 6);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.textAlign = 'center';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillStyle = COLORS.danger;
      ctx.shadowColor = COLORS.danger;
      ctx.shadowBlur = 12;
      ctx.fillText('⚠ LAST LIFE ⚠', width / 2, state.boss ? 118 : 78);
      ctx.restore();
    }
    ctx.restore();
  }

  function paintBanner(state) {
    if (state.bannerTimer <= 0 || !state.banner) return;
    const alpha = Math.min(1, state.bannerTimer * 2);
    ctx.save();
    ctx.globalAlpha = alpha;
    const isClear = state.banner.includes('CLEARED') || state.banner.includes('DESTROYED');
    glowText(state.banner, width / 2, height * 0.3, '800 40px system-ui, sans-serif', isClear ? COLORS.gold : COLORS.text, 24);
    if (state.bannerSub) {
      glowText(state.bannerSub, width / 2, height * 0.3 + 40, '600 16px system-ui, sans-serif', COLORS.dimText, 8);
    }
    ctx.restore();
  }

  function shade(alpha) {
    ctx.fillStyle = `rgba(3, 5, 14, ${alpha})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Full-screen overlays for feel: the red hurt vignette, the soft red
  // edge while on the last life, and the cool Chrono tint.
  function paintOverlays(state) {
    const player = state.player;
    const chronoOn = player && state.time < player.chronoUntil;
    if (chronoOn) {
      ctx.save();
      ctx.fillStyle = `rgba(122, 215, 255, ${0.05 + 0.02 * Math.sin(state.time * 3)})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    if (state.hurtFlash > 0 || state.lives === 1) {
      const edge = state.lives === 1 ? 0.10 + 0.05 * Math.sin(state.time * 5) : 0;
      const strength = Math.max(state.hurtFlash * 0.6, edge);
      if (strength > 0.01) {
        const gradient = ctx.createRadialGradient(
          width / 2, height / 2, Math.min(width, height) * 0.42,
          width / 2, height / 2, Math.max(width, height) * 0.72,
        );
        gradient.addColorStop(0, 'rgba(255, 40, 40, 0)');
        gradient.addColorStop(1, `rgba(255, 40, 40, ${strength})`);
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }
  }

  function paintTitle(state, best) {
    shade(0.62);
    const cx = width / 2;
    glowText('VOIDLIGHT', cx, height * 0.24, '900 92px system-ui, sans-serif', '#35f0ff', 30);
    glowText('N E O N   A R E N A', cx, height * 0.24 + 62, '700 22px system-ui, sans-serif', '#ff5df2', 16);
    glowText('Survive 10 waves. Clear Wave 10 to win.', cx, height * 0.42, '600 19px system-ui, sans-serif', COLORS.text, 8);
    glowText('Face the VOID TYRANT on Wave 5 — and the TYRANT PRIME on Wave 10.', cx, height * 0.42 + 28, '700 16px system-ui, sans-serif', COLORS.gold, 10);
    ctx.save();
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('WASD / ARROWS — move      MOUSE — aim      HOLD CLICK / SPACE — fire', cx, height * 0.52);
    ctx.fillText('Grab power-ups:  S shield   R rapid fire   3 spread shot   B void bomb   C chrono', cx, height * 0.52 + 26);
    ctx.fillText('Watch for the warp rings — nothing attacks out of nowhere.', cx, height * 0.52 + 52);
    ctx.restore();
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.save();
    ctx.globalAlpha = pulse;
    glowText('▶  CLICK OR PRESS ENTER TO START', cx, height * 0.70, '800 24px system-ui, sans-serif', COLORS.gold, 18);
    ctx.restore();
    if (best > 0) glowText(`BEST  ${best}`, cx, height * 0.80, '700 18px system-ui, sans-serif', COLORS.dimText, 6);
    glowText('An original arcade game — no downloads, no network, just you and the void.', cx, height - 28, '500 13px system-ui, sans-serif', COLORS.dimText, 0);
  }

  function paintOver(state, best, won) {
    shade(won ? 0.45 : 0.66);
    const cx = width / 2;
    if (won) {
      glowText('VOID MASTER!', cx, height * 0.26, '900 72px system-ui, sans-serif', COLORS.gold, 30);
      glowText('YOU WIN — ALL 10 WAVES CLEARED', cx, height * 0.26 + 56, '700 20px system-ui, sans-serif', COLORS.text, 12);
      const tyrant = state.bossName || 'VOID TYRANT PRIME';
      glowText(`${tyrant} DESTROYED`, cx, height * 0.26 + 88, '700 18px system-ui, sans-serif', '#ff5df2', 12);
    } else {
      glowText('GAME OVER', cx, height * 0.3, '900 72px system-ui, sans-serif', COLORS.accent, 30);
      glowText('THE VOID CLAIMS ANOTHER PILOT', cx, height * 0.3 + 56, '700 18px system-ui, sans-serif', COLORS.text, 10);
    }
    const isBest = state.score >= best && state.score > 0;
    glowText(`SCORE  ${state.score}`, cx, height * 0.5, '800 34px system-ui, sans-serif', COLORS.text, 14);
    if (won && state.bossBonus > 0) {
      glowText(`BOSS BONUS  +${state.bossBonus}`, cx, height * 0.5 + 40, '800 20px system-ui, sans-serif', COLORS.gold, 12);
    }
    glowText(isBest ? '★ NEW BEST ★' : `BEST  ${best}`, cx, height * 0.5 + (won && state.bossBonus > 0 ? 78 : 42), '700 18px system-ui, sans-serif', isBest ? COLORS.gold : COLORS.dimText, 10);
    ctx.save();
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(`Waves cleared: ${won ? WIN_WAVE : state.wave - 1} / ${WIN_WAVE}      Kills: ${state.kills}      Shots: ${state.shotsFired}`, cx, height * 0.5 + (won && state.bossBonus > 0 ? 116 : 82));
    ctx.restore();
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 3.2);
    ctx.save();
    ctx.globalAlpha = pulse;
    glowText('PRESS ENTER OR CLICK TO PLAY AGAIN', cx, height * 0.74, '800 22px system-ui, sans-serif', COLORS.gold, 16);
    ctx.restore();
  }

  return {
    resize(cssWidth, cssHeight, ratio) {
      width = cssWidth;
      height = cssHeight;
      dpr = ratio;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
    },
    draw(state, screen, best, particles) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      if (state.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      paintBackground(state.time);
      for (const powerup of state.powerups) paintPowerup(powerup, state.time);
      for (const enemy of state.enemies) paintEnemy(enemy, state.time);
      if (state.boss) paintBoss(state.boss, state.time);
      if (state.player && screen !== 'over') {
        const player = state.player;
        const blink = player.invuln > 0 && Math.floor(state.time * 12) % 2 === 0;
        ctx.save();
        if (blink) ctx.globalAlpha = 0.35;
        const flame = player.thrust ? 0.6 + Math.random() * 0.6 : 0;
        paintPlayerShip(player.x, player.y, player.angle, player.radius, COLORS.player, flame);
        if (player.shield) {
          ctx.strokeStyle = COLORS.shield;
          ctx.shadowColor = COLORS.shield;
          ctx.shadowBlur = 14;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(player.x, player.y, player.radius + 9 + Math.sin(state.time * 5) * 2, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // The muzzle flash: a bright star where the bullets leave the ship.
      if (state.muzzle) {
        const m = state.muzzle;
        const strength = m.timer / 0.07;
        ctx.fillStyle = `rgba(200, 251, 255, ${strength})`;
        ctx.shadowColor = '#c8fbff';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 7 * strength + 2, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 255, ${strength})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(m.x - Math.cos(m.angle) * 10, m.y - Math.sin(m.angle) * 10);
        ctx.lineTo(m.x + Math.cos(m.angle) * 12, m.y + Math.sin(m.angle) * 12);
        ctx.stroke();
      }
      for (const bullet of state.bullets) {
        ctx.strokeStyle = COLORS.bullet;
        ctx.shadowColor = COLORS.bullet;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bullet.x - bullet.vx * 0.012, bullet.y - bullet.vy * 0.012);
        ctx.lineTo(bullet.x, bullet.y);
        ctx.stroke();
      }
      for (const bullet of state.enemyBullets) {
        ctx.fillStyle = COLORS.enemyBullet;
        ctx.shadowColor = COLORS.enemyBullet;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      if (particles) particles.draw(ctx);
      ctx.restore();

      paintOverlays(state);

      if (screen === 'play' || screen === 'paused') {
        paintHud(state, best);
        paintBanner(state);
      }
      if (screen === 'title') paintTitle(state, best);
      if (screen === 'paused') {
        shade(0.55);
        glowText('PAUSED', width / 2, height * 0.42, '900 64px system-ui, sans-serif', COLORS.text, 24);
        glowText('Press P to resume', width / 2, height * 0.42 + 56, '600 18px system-ui, sans-serif', COLORS.dimText, 8);
      }
      if (screen === 'over') paintOver(state, best, false);
      if (screen === 'win') paintOver(state, best, true);
    },
  };
}
