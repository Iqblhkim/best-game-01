// Synthesised sound effects with the Web Audio API: no audio files, nothing
// to download. The context is created on the first player gesture (browsers
// block sound before one), and every call is guarded so a game without audio
// still plays.

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

  // A short oscillator blip that slides from one frequency to another.
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

  // Filtered noise for explosions: a burst that falls away fast.
  function noise(seconds = 0.3, volume = 0.8) {
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
      filter.frequency.setValueAtTime(2400, start);
      filter.frequency.exponentialRampToValueAtTime(180, start + seconds);
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
