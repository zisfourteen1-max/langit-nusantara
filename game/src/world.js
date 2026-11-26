// The archipelago: seeded islands, rings and runways along the route.
// Pure data — no DOM, no drawing — so the same seed always builds the same
// world and the logic tests can run it in Node.
import { LEG } from './config.js';
import { pick } from './random.js';

const ISLAND_NAMES = [
  'Pulau Merapi', 'Bali', 'Lombok', 'Flores', 'Sumba', 'Banda',
  'Raja Ampat', 'Komodo', 'Sumbawa', 'Ternate', 'Belitung', 'Karimata',
];
const ISLAND_KINDS = ['volcano', 'terraces', 'town', 'forest', 'volcano', 'town'];

/** Smooth bump: 0 outside [start,end], 1 at the centre. */
function bump(x, start, end) {
  if (x < start || x > end) return 0;
  const t = (x - start) / (end - start);
  return Math.sin(t * Math.PI) ** 2;
}

/**
 * Build the world for a seed. Legs run back to back along one long route:
 * leg n flies from runway n to runway n+1, `LEG.lengthNm` apart.
 */
export function createWorld(random, seed) {
  const islands = [];
  const totalLegs = LEG.maxLeg + 1;
  let namePool = [...ISLAND_NAMES];
  for (let leg = 0; leg <= totalLegs; leg += 1) {
    const atNm = leg * LEG.lengthNm;
    const kind = pick(random, ISLAND_KINDS);
    const widthNm = 2.2 + random() * 1.6;
    const peakFt = kind === 'volcano' ? 5200 + random() * 1800
      : kind === 'terraces' ? 2200 + random() * 900
      : 500 + random() * 900;
    let name = namePool.length ? namePool.splice(Math.floor(random() * namePool.length), 1)[0]
      : `Pulau ${leg + 1}`;
    islands.push({ atNm, startNm: atNm - widthNm / 2, endNm: atNm + widthNm / 2, peakFt, kind, name });
  }

  // Rings for each leg: spread along the leg, altitude above the terrain.
  const legs = [];
  for (let leg = 0; leg < totalLegs; leg += 1) {
    const count = Math.min(LEG.ringsBase + leg * LEG.ringsPerLevel, 9);
    const rings = [];
    for (let i = 0; i < count; i += 1) {
      const atNm = leg * LEG.lengthNm + 2.2 + (i + 0.5) * ((LEG.lengthNm - 4.4) / count);
      const terrain = terrainHeightAt(islands, atNm);
      const altFt = Math.min(Math.round(terrain + 900 + random() * 2200), 8200);
      rings.push({ atNm, altFt, passed: false, index: i });
    }
    // Runway sits on the destination island, flat strip near its centre.
    // Every leg also has a departure runway on its starting island.
    const dest = islands[leg + 1];
    const start = islands[leg];
    const strip = (island) => ({
      atNm: island.atNm, startNm: island.atNm - LEG.runwayLengthNm / 2,
      endNm: island.atNm + LEG.runwayLengthNm / 2,
      altFt: Math.round(terrainHeightAt(islands, island.atNm)),
      heading: 90 + Math.round(random() * 20 - 10),
    });
    legs.push({
      index: leg,
      rings,
      departure: strip(start),
      runway: strip(dest),
      island: dest,
    });
  }

  return {
    seed,
    islands,
    legs,
    terrainHeightAt(nm) { return terrainHeightAt(islands, nm); },
    legAt(distanceNm) {
      const index = Math.min(Math.floor(distanceNm / LEG.lengthNm), legs.length - 1);
      return legs[index];
    },
  };
}

function terrainHeightAt(islands, nm) {
  let height = 0;
  for (const island of islands) {
    const b = bump(nm, island.startNm, island.endNm);
    if (b > 0) {
      // Flat coastal airfield around the island centre (the runway): the
      // ground stays low near the strip and rises to full height beyond it.
      const d = Math.abs(nm - island.atNm);
      const flat = Math.min(1, Math.max(0, (d - 0.45) / 0.5));
      height = Math.max(height, island.peakFt * b * (0.06 + 0.94 * flat));
    }
  }
  return height;
}

/** Fresh ring state for a leg (rings reset each time a leg restarts). */
export function freshRings(leg) {
  return leg.rings.map((ring) => ({ ...ring, passed: false }));
}
