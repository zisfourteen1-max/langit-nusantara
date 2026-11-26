// The screenshot scenes behind ?shot=cover|rings|landing|sunset.
// Each one stages a real flight state (same world, same rules, same
// renderer as play) and paints it twice, then sets window.__shotReady.
import { LEG, STEP } from './config.js';
import { PHASE_LANDED, PHASE_PLAY, stepFlight } from './physics.js';
import { SCREEN_LANDED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/**
 * Steer the plane toward the next unpassed ring: climb/descend toward its
 * altitude and keep the throttle up. A tiny autopilot for staged scenes.
 */
function autopilot(state) {
  const ring = state.rings.find((r) => !r.passed && r.atNm >= state.distanceNm);
  let pitch = 0;
  if (ring) {
    const diff = ring.altFt - state.altitudeFt;
    pitch = Math.max(-1, Math.min(1, diff / 500));
  }
  return { pitch, bank: 0, throttle: 0.4 };
}

/**
 * Fly forward from a fresh flight for `seconds`, steered by the autopilot,
 * or until the given stop condition. Returns the event mask of the last step.
 */
function flyFor(state, seconds, stop) {
  let events = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    events = stepFlight(state, autopilot(state), STEP, false);
    if (stop && stop(state, events)) break;
    if (state.phase !== PHASE_PLAY) break;
  }
  return events;
}

/** Stage `name` on a fresh flight and return {screen, best, timeOfDay}. */
export function stageShot(name, state) {
  const world = state.world;
  const leg = world.legs[0];
  if (name === 'rings') {
    // Mid-flight: already through one ring, closing on the next over terraces.
    state.phase = PHASE_PLAY;
    state.airborne = true;
    state.gearDown = false;
    state.distanceNm = leg.rings[0].atNm - 0.35;
    state.altitudeFt = leg.rings[1].altFt - 120;
    state.speedKt = 135;
    state.throttle = 0.72;
    state.fuel = 82;
    state.rings[0].passed = true;
    state.ringsPassed = 1;
    state.score = 150;
    state.streak = 1;
    state.timeLeft = 152;
    state.message = 'RING! +150  (streak 1)';
    state.messageTimer = 99;
    return { screen: SCREEN_PLAY, best: 0, timeOfDay: 'day' };
  }
  if (name === 'landing') {
    // Final approach: gear down, flaps, lined up on the runway.
    state.phase = PHASE_PLAY;
    state.airborne = true;
    state.distanceNm = leg.runway.startNm - 1.1;
    state.altitudeFt = 620;
    state.vspeedFpm = -320;
    state.speedKt = 96;
    state.throttle = 0.32;
    state.gearDown = true;
    state.flaps = 1;
    state.fuel = 38;
    state.rings.forEach((r) => { r.passed = true; });
    state.ringsPassed = state.ringsTotal;
    state.score = 900;
    state.timeLeft = 96;
    state.message = 'Runway di depan — roda turun, pelan-pelan...';
    state.messageTimer = 99;
    return { screen: SCREEN_PLAY, best: 0, timeOfDay: 'day' };
  }
  if (name === 'sunset') {
    // Golden-hour leg: two rings banked, sun low, score card up.
    state.phase = PHASE_LANDED;
    state.distanceNm = leg.runway.atNm;
    state.altitudeFt = leg.runway.altFt;
    state.speedKt = 0;
    state.throttle = 0;
    state.fuel = 100;
    state.rings.forEach((r) => { r.passed = true; });
    state.ringsPassed = state.ringsTotal;
    state.score = 1250;
    state.timeLeft = 118;
    state.landing = { quality: 'MULUS!', vspeed: 210, speed: 88, points: 400, island: leg.island.name };
    state.message = 'Pendaratan MULUS!';
    return { screen: SCREEN_LANDED, best: 1250, timeOfDay: 'sunset' };
  }
  // cover: chase view mid-leg, volcano ahead, ring in sight.
  state.phase = PHASE_PLAY;
  state.airborne = true;
  state.gearDown = false;
  state.distanceNm = 6;
  state.altitudeFt = 2100;
  state.speedKt = 138;
  state.throttle = 0.75;
  state.fuel = 94;
  state.timeLeft = 168;
  flyFor(state, 0.5);
  // The staging flight "missed" the rings already behind the plane; restore
  // them so the cover shows a clean mid-leg (0/4) with no stray message,
  // and level the nose for a calm horizon.
  for (const ring of state.rings) if (ring.atNm < state.distanceNm) ring.passed = false;
  state.message = '';
  state.messageTimer = 0;
  state.pitchDeg = -2;
  state.vspeedFpm = -150;
  return { screen: SCREEN_PLAY, best: 0, timeOfDay: 'day' };
}
