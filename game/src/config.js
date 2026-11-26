// Langit Nusantara — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size.
export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** One flight lasts this long (seconds); landing a leg adds bonus time. */
export const FLIGHT_SECONDS = 420;

export const LIVES = 3;

/** The plane "Elang" (callsign PK-LNG), a small Indonesian prop plane. */
export const PLANE = {
  // Flight model (feet, knots, feet-per-minute).
  minSpeed: 55,          // below this the wing stalls and the nose drops
  cruiseSpeed: 130,
  maxSpeed: 185,
  climbRate: 1400,       // fpm at full pitch up + full throttle
  sinkRate: 1100,        // fpm at full pitch down
  accel: 22,             // knots per second toward throttle target
  maxAlt: 9000,
  // Landing window: gentle touchdown scores, a hard one costs a life.
  landMaxSpeed: 115,
  landMaxSink: 520,      // fpm; softer than this is a smooth landing
  hardSink: 900,         // fpm; harder than this is a crash
  gearSpeed: 140,        // gear must be down below this speed to land
  // Scoring.
  ringPoints: 150,
  ringTimeBonus: 8,
  smoothLanding: 400,
  okLanding: 200,
  legBonus: 250,
};

/** Fuel: a full tank lasts about 7–8 minutes at cruise — enough for one
 * 14 nm leg with margin; landing refuels. */
export const FUEL = {
  start: 100,
  burnPerSecond: 0.14,   // at cruise throttle
  burnThrottle: 0.12,    // extra burn scaled by throttle
  reserveWarning: 25,
};

/** A leg = fly the rings, then land on the island runway. */
export const LEG = {
  lengthNm: 14,          // nautical miles of route per leg
  ringsBase: 4,          // rings on leg 1
  ringsPerLevel: 1,
  ringToleranceFt: 260,  // how close in altitude the pass must be
  runwayLengthNm: 0.9,
  maxLeg: 6,
};

/** Wind gusts grow with the level. */
export const WIND = { base: 4, perLevel: 3, gustSeconds: 2.2 };

export const PALETTE = {
  skyDayTop: '#2f7fc9', skyDayMid: '#7ec3e8', skyDayLow: '#cfeef7',
  skySunsetTop: '#3a2a63', skySunsetMid: '#e2703a', skySunsetLow: '#f7b733',
  seaDeep: '#0a6d8f', seaShallow: '#19b8c4', seaSand: '#e8d8a0',
  islandGreen: '#2f8f4e', islandDark: '#1f6b38', terrace: '#7fb069',
  volcanoRock: '#5b4a42', volcanoSnow: '#f4f1ea', townRoof: '#c65b3c',
  townWall: '#f2e6c9', runway: '#3c3f45', runwayMark: '#f5f2e4',
  ring: '#ffd23f', ringCore: '#fff3b0', planeRed: '#d42b2b', planeWhite: '#f7f5ef',
  panel: '#141a22', panelEdge: '#2c3644', text: '#f2f5f7', muted: '#9fb0bd',
  good: '#57d977', warn: '#ffb020', bad: '#ff5252',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'langit-nusantara.best';
