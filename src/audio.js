// audio.js - Procedural WebAudio Synthesizer for 16-bit industrial soundscape

let audioCtx = null;
let masterGain = null;
let railHumOsc = null;
let railHumGain = null;
let isMuted = false;

// Check localStorage for mute preference
try {
  isMuted = localStorage.getItem('tcart_operator_muted') === 'true';
} catch (e) {
  isMuted = false;
}

let iosUnlocked = false;

// Safely initialize or resume AudioContext on user interaction
export function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.65, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);

    setupRailHum();
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  // iOS Safari unlock: play a 1-sample silent buffer once on user gesture
  if (!iosUnlocked && audioCtx) {
    try {
      const buffer = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start(0);
      iosUnlocked = true;
    } catch (e) {}
  }
}

// Immediately silence rail hum (e.g. on visibility loss or shift end)
export function stopRailHum() {
  if (railHumGain && audioCtx) {
    try {
      const t = audioCtx.currentTime;
      railHumGain.gain.cancelScheduledValues(t);
      railHumGain.gain.setValueAtTime(0, t);
    } catch (e) {}
  }
}

// Continuous rail hum setup
function setupRailHum() {
  if (!audioCtx || railHumOsc) return;

  try {
    railHumOsc = audioCtx.createOscillator();
    railHumOsc.type = 'triangle';
    railHumOsc.frequency.setValueAtTime(80, audioCtx.currentTime);

    railHumGain = audioCtx.createGain();
    railHumGain.gain.setValueAtTime(0, audioCtx.currentTime);

    railHumOsc.connect(railHumGain);
    railHumGain.connect(masterGain);
    railHumOsc.start();
  } catch (err) {
    console.warn('Rail hum init error:', err);
  }
}

// Update rail hum pitch & volume based on cart speed
export function updateRailHum(speedFraction) {
  if (!railHumGain || !audioCtx || isMuted) return;

  const targetVol = speedFraction > 0.05 ? Math.min(speedFraction * 0.15, 0.15) : 0;
  const targetFreq = 75 + speedFraction * 45;

  try {
    const t = audioCtx.currentTime;
    railHumGain.gain.cancelScheduledValues(t);
    railHumGain.gain.linearRampToValueAtTime(targetVol, t + 0.05);

    if (railHumOsc) {
      railHumOsc.frequency.cancelScheduledValues(t);
      railHumOsc.frequency.linearRampToValueAtTime(targetFreq, t + 0.05);
    }
  } catch (e) {}
}

// Toggle mute state
export function toggleMute() {
  isMuted = !isMuted;
  try {
    localStorage.setItem('tcart_operator_muted', isMuted ? 'true' : 'false');
  } catch (e) {}

  if (masterGain && audioCtx) {
    masterGain.gain.setValueAtTime(isMuted ? 0 : 0.65, audioCtx.currentTime);
  }
  return isMuted;
}

export function getMuteState() {
  return isMuted;
}

// Helper: generate procedural white noise buffer
function createNoiseBuffer(duration = 0.5) {
  if (!audioCtx) return null;
  const bufferSize = Math.floor(audioCtx.sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// 1. Roller transfer clunk (conveyor / cart load-unload)
export function playRollerTransfer() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  // Low mechanical thump
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

  gain.gain.setValueAtTime(0.35, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.15);

  // Roller rattle noise burst
  const noise = createNoiseBuffer(0.12);
  if (noise) {
    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = noise;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.Q.setValueAtTime(2, t);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.18, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start(t);
  }
}

// 2. Hydraulic hiss (docking / lift deck)
export function playHydraulicHiss() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;
  const noise = createNoiseBuffer(0.22);
  if (!noise) return;

  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = noise;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(600, t + 0.22);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

  noiseSource.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noiseSource.start(t);
}

// 3. Jam buzzer (harsh alarm)
export function playJamBuzzer() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(160, t);

  // Vibrato modulation
  const lfo = audioCtx.createOscillator();
  lfo.frequency.setValueAtTime(18, t);
  const lfoGain = audioCtx.createGain();
  lfoGain.gain.setValueAtTime(40, t);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

  osc.connect(gain);
  gain.connect(masterGain);

  lfo.start(t);
  osc.start(t);
  lfo.stop(t + 0.35);
  osc.stop(t + 0.35);
}

// 4. Baler crush (heavy hydraulic crunch)
export function playBalerCrush() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  // Sub bass impact
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.exponentialRampToValueAtTime(25, t + 0.45);

  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.46);

  // Cardboard crunch noise
  const noise = createNoiseBuffer(0.5);
  if (noise) {
    const src = audioCtx.createBufferSource();
    src.buffer = noise;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.45);

    const ngain = audioCtx.createGain();
    ngain.gain.setValueAtTime(0.3, t);
    ngain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    src.connect(filter);
    filter.connect(ngain);
    ngain.connect(masterGain);
    src.start(t);
  }
}

// 5. Cash register chime (box bundle sold / job bonus)
export function playCashChime() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  [1046.5, 1318.5].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t + idx * 0.06);

    gain.gain.setValueAtTime(0.2, t + idx * 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.06 + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t + idx * 0.06);
    osc.stop(t + idx * 0.06 + 0.32);
  });
}

// 6. Shift horn (whistle at shift end / start)
export function playShiftHorn() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  [146.8, 220.0].forEach(freq => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.1);
    gain.gain.setValueAtTime(0.3, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t);
    osc.stop(t + 1.45);
  });
}

// 7. Upgrade purchase chime
export function playUpgradePurchase() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

  notes.forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t + idx * 0.07);

    gain.gain.setValueAtTime(0.25, t + idx * 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.07 + 0.22);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t + idx * 0.07);
    osc.stop(t + idx * 0.07 + 0.24);
  });
}

// 8. Wrong grade rejected buzz
export function playWrongGrade() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(110, t);
  osc.frequency.setValueAtTime(80, t + 0.09);

  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.24);
}

// 9. Low hopper warning beep
export function playLowHopperBeep() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t);

  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.09);
}

// 10. Wrench repair ratchet tick
export function playWrenchTick() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.04);

  gain.gain.setValueAtTime(0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t);
  osc.stop(t + 0.05);
}

// 11. Event alert chime
export function playEventAlert() {
  if (!audioCtx || isMuted) return;
  initAudio();
  const t = audioCtx.currentTime;

  [660, 880].forEach((freq, idx) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t + idx * 0.12);

    gain.gain.setValueAtTime(0.18, t + idx * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.12 + 0.2);

    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(t + idx * 0.12);
    osc.stop(t + idx * 0.12 + 0.22);
  });
}
