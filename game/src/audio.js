// Synthesised WebAudio: no audio files. Engine hum follows throttle, wind
// noise follows speed, plus a ring chime, a touchdown thud and a tiny
// pentatonic music loop. Everything is created lazily on first user gesture.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let musicTimer = null;
  let muted = false;
  let musicStep = 0;

  // A gentle pentatonic line (C major pentatonic, in Hz).
  const MELODY = [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33,
    523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 523.25];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter).connect(engineGain).connect(ctx.destination);
      engineOsc.start();
      // Wind: looped filtered noise.
      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buffer;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter).connect(windGain).connect(ctx.destination);
      windSrc.start();
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, seconds, type = 'sine', volume = 0.18, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  return {
    /** Call from any user gesture; safe to call repeatedly. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (ctx) ctx.resume().catch(() => {});
      return muted;
    },
    /** Continuous engine + wind, called every frame with flight state. */
    update(throttle, speedKt, flying) {
      if (!ctx || muted) return;
      const target = flying ? 0.05 + throttle * 0.07 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + throttle * 90 + speedKt * 0.15, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.12, speedKt / 1600) : 0, ctx.currentTime, 0.2);
    },
    ring() {
      tone(1046.5, 0.35, 'sine', 0.2);
      tone(1568, 0.5, 'sine', 0.14, 0.08);
    },
    thud() {
      tone(70, 0.3, 'triangle', 0.35);
      tone(140, 0.18, 'sine', 0.2, 0.02);
    },
    crash() {
      tone(90, 0.7, 'sawtooth', 0.25);
      tone(55, 0.9, 'triangle', 0.3, 0.1);
    },
    click() { tone(660, 0.08, 'square', 0.08); },
    startMusic() {
      if (!ensure() || musicTimer !== null) return;
      musicTimer = window.setInterval(() => {
        if (muted || !ctx) return;
        const freq = MELODY[musicStep % MELODY.length];
        tone(freq, 0.5, 'triangle', 0.05);
        musicStep += 1;
      }, 420);
    },
    stopMusic() {
      if (musicTimer !== null) { window.clearInterval(musicTimer); musicTimer = null; }
    },
  };
}
