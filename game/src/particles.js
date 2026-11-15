// Sparks, shockwaves and floating score text: the juice that makes a hit feel
// like a hit. Particles are additive (drawn with 'lighter') so they bloom
// against the dark arena; texts rise and fade.

export function createParticles() {
  const sparks = [];
  const rings = [];
  const texts = [];

  return {
    burst(x, y, color, count = 18, speed = 260) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = speed * (0.3 + Math.random() * 0.7);
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          life: 0.45 + Math.random() * 0.4,
          age: 0,
          size: 1.5 + Math.random() * 2.5,
          color,
        });
      }
    },
    ring(x, y, color, maxRadius = 90) {
      rings.push({ x, y, age: 0, life: 0.45, maxRadius, color });
    },
    text(x, y, message, color = '#eaf6ff') {
      texts.push({ x, y, message, color, age: 0, life: 1.1 });
    },
    clear() {
      sparks.length = 0;
      rings.length = 0;
      texts.length = 0;
    },
    get count() {
      return sparks.length + rings.length + texts.length;
    },
    update(dt) {
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const p = sparks[i];
        p.age += dt;
        if (p.age >= p.life) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.2 * dt;
        p.vy *= 1 - 2.2 * dt;
      }
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        rings[i].age += dt;
        if (rings[i].age >= rings[i].life) rings.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.age += dt;
        t.y -= 34 * dt;
        if (t.age >= t.life) texts.splice(i, 1);
      }
    },
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of sparks) {
        const fade = 1 - p.age / p.life;
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * fade + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const r of rings) {
        const progress = r.age / r.life;
        ctx.globalAlpha = (1 - progress) * 0.8;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3 * (1 - progress) + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.maxRadius * progress + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      for (const t of texts) {
        const fade = 1 - t.age / t.life;
        ctx.save();
        ctx.globalAlpha = Math.min(1, fade * 2);
        ctx.font = '700 15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.shadowColor = t.color;
        ctx.shadowBlur = 8;
        ctx.fillText(t.message, t.x, t.y);
        ctx.restore();
      }
    },
  };
}
