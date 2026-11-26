// The flight model: pure state + step, no DOM, no drawing. The same inputs
// always give the same flight, so the logic tests can run it in Node.
import { FLIGHT_SECONDS, FUEL, LEG, LIVES, PLANE, STEP, WIND } from './config.js';
import { freshRings } from './world.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_OVER = 8;
export const EVENT_FUEL_LOW = 16;

export const PHASE_TITLE = 'title';
export const PHASE_PLAY = 'play';
export const PHASE_LANDED = 'landed';
export const PHASE_OVER = 'over';

/** Fresh flight state for a seed's world. */
export function createFlight(world) {
  const dep = world.legs[0].departure;
  return {
    world,
    phase: PHASE_TITLE,
    score: 0,
    best: 0,
    lives: LIVES,
    level: 1,
    legIndex: 0,
    distanceNm: dep.atNm,
    altitudeFt: dep.altFt,
    vspeedFpm: 0,
    speedKt: 0,
    throttle: 0.55,
    pitchDeg: 0,
    bankDeg: 0,
    headingDeg: 90,
    fuel: FUEL.start,
    timeLeft: FLIGHT_SECONDS,
    rings: freshRings(world.legs[0]),
    ringsPassed: 0,
    ringsTotal: world.legs[0].rings.length,
    streak: 0,
    gearDown: true,
    flaps: 0,
    airborne: false,
    windKt: 0,
    windTimer: 0,
    message: '',
    messageTimer: 0,
    landing: null,      // last landing verdict {quality, vspeed, speed, points}
    elapsed: 0,
    crashed: false,
    fuelWarned: false,
  };
}

/** Start (or restart) a flight from the first runway. */
export function resetFlight(state) {
  const fresh = createFlight(state.world);
  fresh.best = state.best;
  Object.assign(state, fresh);
  state.phase = PHASE_PLAY;
}

/** Move to the next leg after a landing: refuel, new rings, bonus time. */
function nextLeg(state) {
  state.legIndex += 1;
  state.level = Math.min(state.legIndex + 1, LEG.maxLeg);
  const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
  state.rings = freshRings(leg);
  state.ringsPassed = 0;
  state.ringsTotal = leg.rings.length;
  state.fuel = FUEL.start;
  state.timeLeft += 45;
  state.score += PLANE.legBonus;
  state.gearDown = true;
  state.flaps = 0;
  state.airborne = false;
  state.altitudeFt = leg.departure.altFt;
  state.speedKt = 0;
  state.vspeedFpm = 0;
  state.distanceNm = leg.departure.atNm;
  state.message = `Leg ${state.legIndex + 1} — tujuan ${leg.island.name}!`;
  state.messageTimer = 3;
}

function loseLife(state, reason) {
  state.lives -= 1;
  state.streak = 0;
  state.crashed = true;
  state.message = reason;
  state.messageTimer = 3;
  if (state.lives <= 0) {
    state.phase = PHASE_OVER;
    return EVENT_CRASH | EVENT_OVER;
  }
  // Respawning: back on the current leg's departure runway, ready to take off again.
  const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
  state.distanceNm = leg.departure.atNm;
  state.altitudeFt = leg.departure.altFt;
  state.speedKt = 0;
  state.vspeedFpm = 0;
  state.fuel = Math.max(state.fuel, 45);
  state.gearDown = true;
  state.flaps = 0;
  state.airborne = false;
  return EVENT_CRASH;
}

/**
 * One fixed step. `input` is {pitch:-1..1 (up positive), bank:-1..1,
 * throttle:-1..1, gear, flaps} with one-shot flags already applied by the
 * caller. Returns an event bitmask. `attract` runs the title-screen demo.
 */
export function stepFlight(state, input, dt = STEP, attract = false) {
  let events = EVENT_NONE;
  state.elapsed += dt;

  // Wind gusts: a slow sine + level-scaled gusts that push the plane around.
  state.windTimer += dt;
  const gust = WIND.base + (state.level - 1) * WIND.perLevel;
  state.windKt = Math.sin(state.windTimer / WIND.gustSeconds) * gust
    + Math.sin(state.windTimer * 0.37) * gust * 0.5;

  if (state.phase === PHASE_TITLE) {
    // Demo flight circling the first island for the title screen.
    state.distanceNm += (PLANE.cruiseSpeed * dt) / 3600;
    if (state.distanceNm > LEG.lengthNm * 0.6) state.distanceNm = 0;
    state.altitudeFt = 2400 + Math.sin(state.elapsed * 0.25) * 500;
    state.speedKt = PLANE.cruiseSpeed;
    state.headingDeg = 90 + Math.sin(state.elapsed * 0.2) * 25;
    state.bankDeg = Math.sin(state.elapsed * 0.2) * 18;
    return EVENT_NONE;
  }
  if (state.phase !== PHASE_PLAY) return EVENT_NONE;

  // --- Throttle and speed ---
  state.throttle = clamp(state.throttle + input.throttle * dt * 0.5, 0, 1);
  const targetSpeed = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed)
    - state.flaps * 18;
  state.speedKt += clamp(targetSpeed - state.speedKt, -PLANE.accel * dt, PLANE.accel * dt);
  if (state.fuel <= 0) state.speedKt = Math.max(state.speedKt - 30 * dt, PLANE.minSpeed * 0.6);

  // --- Pitch, bank, heading ---
  // The stick commands a target attitude; the plane eases toward it, so a
  // held key holds a steady climb or turn instead of winding ever steeper.
  const targetPitch = input.pitch * 16;
  state.pitchDeg += clamp(targetPitch - state.pitchDeg, -22 * dt, 22 * dt);
  const targetBank = input.bank * 45;
  state.bankDeg += clamp(targetBank - state.bankDeg, -70 * dt, 70 * dt);
  state.headingDeg = (state.headingDeg + state.bankDeg * dt * 0.55 + state.windKt * dt * 0.12 + 360) % 360;

  // --- Vertical speed and altitude ---
  const stall = state.airborne && state.speedKt < PLANE.minSpeed + 8;
  let vspeed = state.pitchDeg * 82 + (state.throttle - 0.45) * 260 - state.flaps * 60;
  if (stall) vspeed -= 700; // stalled wing drops the nose
  vspeed += state.windKt * 6; // gusts buffet the plane
  state.vspeedFpm = vspeed;
  const groundHere = groundAt(state, state.distanceNm).height;
  if (!state.airborne) {
    // Takeoff roll: stay on the strip until fast enough and pulling up.
    // Rolling off the strip into the bush ends the flight.
    if (groundAt(state, state.distanceNm).runway === null) {
      return events | loseLife(state, 'Keluar runway saat lepas landas!');
    }
    if (state.speedKt > 75 && state.pitchDeg > 2) {
      state.airborne = true;
      state.altitudeFt += (vspeed * dt) / 60;
    } else {
      state.altitudeFt = groundHere;
      state.vspeedFpm = 0;
    }
  } else {
    state.altitudeFt += (vspeed * dt) / 60;
  }
  if (state.altitudeFt > 9000) { state.altitudeFt = 9000; state.vspeedFpm = Math.min(state.vspeedFpm, 0); }

  // --- Forward motion ---
  state.distanceNm += (state.speedKt * dt) / 3600;

  // --- Fuel ---
  state.fuel -= (FUEL.burnPerSecond + FUEL.burnThrottle * state.throttle) * dt;
  if (state.fuel <= 0) {
    state.fuel = 0;
    if (!state.fuelWarned) { state.fuelWarned = true; events |= EVENT_FUEL_LOW; state.message = 'BAHAN BAKAR HABIS!'; state.messageTimer = 3; }
  } else if (state.fuel < FUEL.reserveWarning && !state.fuelWarned) {
    state.fuelWarned = true;
    events |= EVENT_FUEL_LOW;
    state.message = 'Bahan bakar menipis — mendarat untuk isi ulang!';
    state.messageTimer = 3;
  }

  // --- Timer ---
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.phase = PHASE_OVER;
    state.message = 'Waktu habis!';
    return events | EVENT_OVER;
  }
  if (state.messageTimer > 0) state.messageTimer -= dt;

  // --- Rings ---
  const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
  for (const ring of state.rings) {
    if (ring.passed) continue;
    if (state.distanceNm >= ring.atNm) {
      ring.passed = true;
      if (Math.abs(state.altitudeFt - ring.altFt) <= LEG.ringToleranceFt) {
        state.ringsPassed += 1;
        state.streak += 1;
        const points = PLANE.ringPoints + Math.min(state.streak - 1, 5) * 25;
        state.score += points;
        state.timeLeft += PLANE.ringTimeBonus;
        state.message = `RING! +${points}  (streak ${state.streak})`;
        state.messageTimer = 2;
        events |= EVENT_RING;
      } else {
        state.streak = 0;
        state.message = 'Ring terlewat — tetap terbang!';
        state.messageTimer = 2;
      }
    }
  }

  // --- Terrain / runway ---
  // Only an airborne plane can touch down: a plane still rolling on its
  // departure strip is handled by the takeoff-roll branch above.
  if (!state.airborne) return events;
  const terrain = state.world.terrainHeightAt(state.distanceNm);
  const ground = groundAt(state, state.distanceNm);
  const onRunway = ground.runway === leg.runway;
  const groundFt = ground.height;

  if (state.altitudeFt <= groundFt + 2) {
    // Climbing away from the strip after liftoff: not a touchdown, just
    // ride just above the ground until the climb carries the plane clear.
    if (state.vspeedFpm > 0) {
      state.altitudeFt = groundFt + 2;
      return events;
    }
    state.altitudeFt = groundFt;
    if (onRunway) {
      const sink = -state.vspeedFpm;
      const tooFast = state.speedKt > PLANE.landMaxSpeed;
      if (!state.gearDown) {
        return events | loseLife(state, 'Mendarat tanpa roda! Perut pesawat menghantam runway.');
      }
      if (sink > PLANE.hardSink || tooFast) {
        return events | loseLife(state, tooFast ? 'Terlalu cepat mendarat!' : 'Mendarat terlalu keras!');
      }
      // Landed!
      const smooth = sink <= PLANE.landMaxSink && state.speedKt <= 95;
      const points = smooth ? PLANE.smoothLanding : PLANE.okLanding;
      state.score += points;
      state.landing = {
        quality: smooth ? 'MULUS!' : 'Mendarat',
        vspeed: Math.round(sink), speed: Math.round(state.speedKt), points,
        island: leg.island.name,
      };
      state.phase = PHASE_LANDED;
      state.message = smooth ? `Pendaratan MULUS di ${leg.island.name}! +${points}` : `Mendarat di ${leg.island.name}. +${points}`;
      state.messageTimer = 4;
      return events | EVENT_LANDED;
    }
    // Terrain or sea.
    const where = terrain > 50 ? 'menabrak daratan' : 'jatuh ke laut';
    return events | loseLife(state, `Kecelakaan! Pesawat ${where}.`);
  }

  return events;
}

/** After a landing card, take off for the next leg. */
export function continueFlight(state) {
  if (state.phase !== PHASE_LANDED) return;
  if (state.legIndex + 1 >= state.world.legs.length) {
    state.phase = PHASE_OVER;
    state.message = 'Semua pulau dijelajahi — luar biasa!';
    return;
  }
  nextLeg(state);
  state.phase = PHASE_PLAY;
}

/** Ground height under a distance: a runway strip when over one, else terrain. */
function groundAt(state, distanceNm) {
  const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
  for (const strip of [leg.departure, leg.runway]) {
    if (distanceNm >= strip.startNm && distanceNm <= strip.endNm) return { height: strip.altFt, runway: strip };
  }
  return { height: state.world.terrainHeightAt(distanceNm), runway: null };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
