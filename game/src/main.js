// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, landed, over.
//
// ?seed=N fixes the islands, rings and runways. ?shot=cover|rings|landing|
// sunset (with &seed=N) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import {
  ACTION_CONFIRM, ACTION_FLAPS, ACTION_GEAR, ACTION_MUTE, ACTION_PAUSE,
  ACTION_RESTART, createInput,
} from './input.js';
import {
  EVENT_CRASH, EVENT_LANDED, EVENT_OVER, EVENT_RING, PHASE_LANDED,
  PHASE_OVER, PHASE_PLAY, PHASE_TITLE, continueFlight, createFlight,
  resetFlight, stepFlight,
} from './physics.js';
import {
  SCREEN_LANDED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  createRenderer,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed), seed);
const flight = createFlight(world);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// Exposed for headless play-tests: read-only snapshots of the flight state.
window.__game = {
  state: flight,
  seed,
  shot: shot ?? null,
  get screen() { return screen; },
  get best() { return best; },
};

let screen = SCREEN_TITLE;
let best = readBest();

function runShot(name) {
  const scene = stageShot(name, flight);
  renderer.setTimeOfDay(scene.timeOfDay);
  let painted = 0;
  function paint() {
    renderer.draw(flight, scene.screen, scene.best, 1.5, { timeOfDay: scene.timeOfDay });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();
  let muted = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.startMusic();
    resetFlight(flight);
    flight.best = best;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Terbang! Lewati ring, lalu mendarat di runway.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (flight.score > best) {
      best = flight.score;
      saveBest(best);
    }
    audio.stopMusic();
    announce(`Penerbangan selesai. Skor ${flight.score}. Terbaik ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Suara mati.' : 'Suara hidup.');
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      audio.click();
      startGame();
      return;
    }
    if (actions & ACTION_GEAR && screen === SCREEN_PLAY) {
      flight.gearDown = !flight.gearDown;
      audio.click();
      announce(flight.gearDown ? 'Roda turun.' : 'Roda naik.');
    }
    if (actions & ACTION_FLAPS && screen === SCREEN_PLAY) {
      flight.flaps = flight.flaps === 0 ? 1 : 0;
      audio.click();
      announce(flight.flaps ? 'Flap turun.' : 'Flap naik.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER) startGame();
      else if (screen === SCREEN_LANDED) {
        audio.click();
        continueFlight(flight);
        if (flight.phase === PHASE_PLAY) screen = SCREEN_PLAY;
        else endGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Lanjut terbang.');
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Jeda.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Lanjut terbang.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      stepFlight(flight, { pitch: 0, bank: 0, throttle: 0 }, STEP, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const steering = input.steering(canvas.clientWidth, canvas.clientHeight);
    const events = stepFlight(flight, steering, STEP, false);
    audio.update(flight.throttle, flight.speedKt, screen === SCREEN_PLAY);
    if (events & EVENT_RING) audio.ring();
    if (events & EVENT_LANDED) {
      audio.thud();
      screen = SCREEN_LANDED;
      announce(flight.message);
    } else if (events & EVENT_CRASH) {
      audio.crash();
      if (events & EVENT_OVER) endGame();
      else announce(flight.message);
    } else if (events & EVENT_OVER) {
      endGame();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(flight, screen, best, now / 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Langit Nusantara. Tekan Spasi atau klik untuk terbang.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
