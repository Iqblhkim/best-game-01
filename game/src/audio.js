// Synthesised sound effects with the Web Audio API: no audio files,
// nothing to download. The context is created on the first player gesture
// (browsers block sound before one), and every call is guarded so a game
// without audio still plays.
//
// v2 adds the boss sounds — a low roar when a Tyrant warps in, a ping
// before each of its attacks, a deeper roar when it dies — plus a shimmer
// for the Chrono pickup, a whoosh for the dasher's lunge, and a low
// heartbeat that the main loop plays while the player is on their last life.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.14;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') {
      context.resume().catch(() => {});
    }
  }

  // A short oscillator note that slides from one frequency to another.
  function blip({ type = 'square', from = 440, to = 220, seconds = 0.12, volume = 1, delay = 0 }) {
    if (muted || !ensure()) return;
    try {
      const start = context.currentTime + delay;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, from), start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + seconds);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + seconds + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  // Filtered noise: a burst that falls away fast. The filter's sweep
  // decides whether it sounds like an explosion or a whoosh.
  function noise(seconds = 0.3, volume = 0.8, fromHz = 2400, toHz = 180) {
    if (muted || !ensure()) return;
    try {
      const start = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * seconds));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(fromHz, start);
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, toHz), start + seconds);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  // A slow, deep swell: two detuned low saws sliding down under noise.
  function roar(seconds = 0.9, volume = 0.9) {
    if (muted || !ensure()) return;
    blip({ type: 'sawtooth', from: 110, to: 38, seconds, volume });
    blip({ type: 'sawtooth', from: 116, to: 42, seconds, volume: volume * 0.7, delay: 0.03 });
    noise(seconds * 0.8, volume * 0.5, 900, 120);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot() {
      blip({ type: 'square', from: 880, to: 320, seconds: 0.07, volume: 0.35 });
    },
    enemyShoot() {
      blip({ type: 'sawtooth', from: 300, to: 140, seconds: 0.14, volume: 0.25 });
    },
    explode(big = false) {
      noise(big ? 0.5 : 0.25, big ? 1 : 0.6);
      blip({ type: 'sine', from: 160, to: 40, seconds: big ? 0.4 : 0.25, volume: 0.7 });
    },
    hit() {
      noise(0.35, 0.9);
      blip({ type: 'sawtooth', from: 220, to: 50, seconds: 0.35, volume: 0.8 });
    },
    pickup() {
      blip({ type: 'sine', from: 520, to: 780, seconds: 0.09, volume: 0.5 });
      blip({ type: 'sine', from: 780, to: 1180, seconds: 0.12, volume: 0.5, delay: 0.08 });
    },
    // Chrono: a rising glassy shimmer, then a soft held shimmer while it runs.
    chrono() {
      [660, 880, 1108, 1318, 1760].forEach((freq, i) => {
        blip({ type: 'sine', from: freq, to: freq * 1.01, seconds: 0.22, volume: 0.4, delay: i * 0.06 });
      });
    },
    chronoTick() {
      blip({ type: 'sine', from: 1320, to: 1180, seconds: 0.1, volume: 0.12 });
    },
    // The boss warps in: a long low roar.
    bossRoar() {
      roar(1.1, 1);
    },
    // The warning ping a beat before a boss attack fires.
    telegraph() {
      blip({ type: 'sine', from: 1568, to: 1568, seconds: 0.12, volume: 0.45 });
      blip({ type: 'sine', from: 2093, to: 2093, seconds: 0.14, volume: 0.35, delay: 0.12 });
    },
    // The boss dies: a bigger roar under a long explosion.
    bossDie() {
      roar(1.4, 1);
      noise(0.9, 1, 1800, 90);
      blip({ type: 'sine', from: 120, to: 30, seconds: 0.8, volume: 0.8, delay: 0.1 });
    },
    // The dasher's lunge: a short band of noise sweeping upward.
    dash() {
      noise(0.18, 0.4, 500, 3200);
    },
    // The sniper takes aim: a thin rising tone that tightens as the bolt charges.
    sniperCharge() {
      blip({ type: 'sine', from: 520, to: 1420, seconds: 0.45, volume: 0.3 });
      blip({ type: 'sine', from: 780, to: 1900, seconds: 0.4, volume: 0.18, delay: 0.08 });
    },
    // The sniper's bolt: a sharp crack over a fast falling tone.
    sniperFire() {
      noise(0.1, 0.5, 5200, 900);
      blip({ type: 'square', from: 1500, to: 280, seconds: 0.09, volume: 0.4 });
    },
    // Overdrive: a quick rising run of five notes under a swell of noise.
    overdrive() {
      [392, 523, 659, 784, 1047].forEach((freq, i) => {
        blip({ type: 'triangle', from: freq, to: freq * 1.02, seconds: 0.1, volume: 0.5, delay: i * 0.05 });
      });
      noise(0.35, 0.3, 1200, 3600);
    },
    // Two low thumps, like a heartbeat, for the last life.
    heartbeat() {
      blip({ type: 'sine', from: 90, to: 45, seconds: 0.16, volume: 0.9 });
      blip({ type: 'sine', from: 80, to: 40, seconds: 0.14, volume: 0.7, delay: 0.18 });
    },
    waveClear() {
      [523, 659, 784, 1047].forEach((freq, i) => {
        blip({ type: 'triangle', from: freq, to: freq, seconds: 0.16, volume: 0.5, delay: i * 0.09 });
      });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((freq, i) => {
        blip({ type: 'triangle', from: freq, to: freq * 0.94, seconds: 0.22, volume: 0.55, delay: i * 0.16 });
      });
    },
    victory() {
      [523, 659, 784, 1047, 1319, 1568].forEach((freq, i) => {
        blip({ type: 'triangle', from: freq, to: freq, seconds: 0.2, volume: 0.5, delay: i * 0.1 });
      });
    },
  };
}
