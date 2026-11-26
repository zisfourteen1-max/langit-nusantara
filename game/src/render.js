// The chase view: sky, sea and islands scrolling past below the plane,
// glowing rings and the runway ahead, and a full instrument panel.
// Everything is drawn from the flight state, so a staged state paints the
// same frame every time.
import { FIELD, PALETTE, FONT } from './config.js';
import { PHASE_LANDED, PHASE_OVER, PHASE_TITLE } from './physics.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LANDED = 'landed';
export const SCREEN_OVER = 'over';

const PLANE_X = 430;
const PLANE_Y = 300;
const PX_PER_NM = 58;
const VIEW_AHEAD_NM = 17;

/** Clouds placed once from the world seed: they never jump between frames. */
function makeClouds(seed) {
  let a = seed | 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clouds = [];
  for (let i = 0; i < 26; i += 1) {
    clouds.push({ nm: next() * 90, y: 60 + next() * 260, s: 0.6 + next() * 1.4, a: 0.5 + next() * 0.4 });
  }
  return clouds;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let clouds = makeClouds(20261126);
  let timeOfDay = 'day';

  function skyGradient(horizonY) {
    const g = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    if (timeOfDay === 'sunset') {
      g.addColorStop(0, PALETTE.skySunsetTop);
      g.addColorStop(0.45, PALETTE.skySunsetMid);
      g.addColorStop(0.62, PALETTE.skySunsetLow);
      g.addColorStop(0.63, PALETTE.seaDeep);
      g.addColorStop(1, '#123a4d');
    } else {
      g.addColorStop(0, PALETTE.skyDayTop);
      g.addColorStop(0.45, PALETTE.skyDayMid);
      g.addColorStop(0.58, PALETTE.skyDayLow);
      g.addColorStop(0.59, PALETTE.seaShallow);
      g.addColorStop(1, PALETTE.seaDeep);
    }
    return g;
  }

  function drawSun(horizonY) {
    const x = 1060;
    const y = timeOfDay === 'sunset' ? horizonY - 46 : 110;
    const r = timeOfDay === 'sunset' ? 52 : 38;
    const glow = ctx.createRadialGradient(x, y, 4, x, y, r * 2.6);
    glow.addColorStop(0, timeOfDay === 'sunset' ? 'rgba(255,196,80,0.95)' : 'rgba(255,244,200,0.95)');
    glow.addColorStop(1, 'rgba(255,196,80,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = timeOfDay === 'sunset' ? '#ffcf5e' : '#fff6cf';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function drawClouds(horizonY, distNm) {
    ctx.save();
    for (const c of clouds) {
      let rel = ((c.nm - distNm) % 90 + 90) % 90; // wrap the route
      const x = PLANE_X + rel * 40 - 200;
      if (x < -160 || x > FIELD.width + 160) continue;
      const y = c.y * (horizonY / 380);
      ctx.globalAlpha = c.a * 0.8;
      ctx.fillStyle = timeOfDay === 'sunset' ? '#ffd9b0' : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, y, 62 * c.s, 16 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34 * c.s, y + 5, 44 * c.s, 13 * c.s, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 36 * c.s, y + 6, 40 * c.s, 12 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSea(horizonY) {
    const g = ctx.createLinearGradient(0, horizonY, 0, FIELD.height);
    g.addColorStop(0, PALETTE.seaShallow);
    g.addColorStop(0.35, '#0f8aa8');
    g.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizonY, FIELD.width, FIELD.height - horizonY);
    // Sun glitter / wave sparkles, fixed by distance so they scroll smoothly.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 40; i += 1) {
      const x = ((i * 173 + Math.floor(horizonY)) % FIELD.width);
      const y = horizonY + 12 + ((i * 61) % Math.max(1, FIELD.height - horizonY - 20));
      ctx.fillRect(x, y, 26, 2);
    }
  }

  function islandScreenX(island, distNm) {
    return PLANE_X + (island.atNm - distNm) * PX_PER_NM;
  }

  function drawIsland(island, distNm, horizonY, groundY) {
    const cx = islandScreenX(island, distNm);
    const halfW = ((island.endNm - island.startNm) / 2) * PX_PER_NM;
    if (cx + halfW < -80 || cx - halfW > FIELD.width + 80) return;
    const peakH = 60 + (island.peakFt / 7000) * 190;
    const baseY = groundY + 26;
    // Sand rim.
    ctx.fillStyle = PALETTE.seaSand;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, halfW + 16, 26, 0, Math.PI, 0);
    ctx.fill();
    // Green body.
    ctx.fillStyle = island.kind === 'volcano' ? PALETTE.islandDark : PALETTE.islandGreen;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, baseY);
    ctx.quadraticCurveTo(cx - halfW * 0.5, baseY - peakH * 0.9, cx, baseY - peakH);
    ctx.quadraticCurveTo(cx + halfW * 0.5, baseY - peakH * 0.9, cx + halfW, baseY);
    ctx.closePath();
    ctx.fill();
    if (island.kind === 'volcano') {
      // Cone + snow cap + smoke.
      ctx.fillStyle = PALETTE.volcanoRock;
      ctx.beginPath();
      ctx.moveTo(cx - halfW * 0.62, baseY);
      ctx.lineTo(cx, baseY - peakH - 26);
      ctx.lineTo(cx + halfW * 0.62, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = PALETTE.volcanoSnow;
      ctx.beginPath();
      ctx.moveTo(cx - 26, baseY - peakH + 8);
      ctx.lineTo(cx, baseY - peakH - 26);
      ctx.lineTo(cx + 26, baseY - peakH + 8);
      ctx.lineTo(cx + 12, baseY - peakH + 22);
      ctx.lineTo(cx, baseY - peakH + 12);
      ctx.lineTo(cx - 12, baseY - peakH + 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx + 14, baseY - peakH - 52, 16, 7, 0.3, 0, Math.PI * 2);
      ctx.ellipse(cx + 30, baseY - peakH - 66, 12, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (island.kind === 'terraces') {
      // Rice terraces: stepped arcs down the slope.
      ctx.strokeStyle = PALETTE.terrace;
      ctx.lineWidth = 7;
      for (let s = 1; s <= 4; s += 1) {
        const y = baseY - (peakH * s) / 5;
        const w = halfW * (1 - s / 6);
        ctx.beginPath();
        ctx.ellipse(cx, y + 8, w, 12, 0, Math.PI, 0);
        ctx.stroke();
      }
      ctx.fillStyle = '#8fce6e';
      ctx.beginPath(); ctx.ellipse(cx, baseY - peakH * 0.55, halfW * 0.5, 14, 0, 0, Math.PI * 2); ctx.fill();
    } else if (island.kind === 'town') {
      // Small coastal town: white walls, red roofs, a mosque dome.
      for (let i = 0; i < 7; i += 1) {
        const hx = cx - halfW * 0.7 + i * (halfW * 1.4) / 6;
        const hw = 16 + (i % 3) * 5;
        const hh = 18 + ((i * 7) % 14);
        ctx.fillStyle = PALETTE.townWall;
        ctx.fillRect(hx - hw / 2, baseY - hh - 6, hw, hh);
        ctx.fillStyle = PALETTE.townRoof;
        ctx.beginPath();
        ctx.moveTo(hx - hw / 2 - 2, baseY - hh - 6);
        ctx.lineTo(hx, baseY - hh - 16);
        ctx.lineTo(hx + hw / 2 + 2, baseY - hh - 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath(); ctx.arc(cx + halfW * 0.45, baseY - 34, 12, Math.PI, 0); ctx.fill();
      ctx.fillRect(cx + halfW * 0.45 - 1.5, baseY - 62, 3, 30);
    } else {
      // Forest: clusters of palms.
      ctx.strokeStyle = '#14532d';
      ctx.lineWidth = 3;
      for (let i = 0; i < 9; i += 1) {
        const px = cx - halfW * 0.8 + i * (halfW * 1.6) / 8;
        const py = baseY - 8 - ((i * 37) % 46);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 16); ctx.stroke();
        ctx.fillStyle = '#1f7a3d';
        ctx.beginPath(); ctx.ellipse(px, py - 18, 12, 5, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px, py - 18, 12, 5, 0.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Island name.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(island.name, cx, baseY + 46);
  }

  function drawRunway(runway, distNm, groundY) {
    const x0 = PLANE_X + (runway.startNm - distNm) * PX_PER_NM;
    const x1 = PLANE_X + (runway.endNm - distNm) * PX_PER_NM;
    if (x1 < -40 || x0 > FIELD.width + 40) return;
    const y = groundY + 8;
    ctx.fillStyle = PALETTE.runway;
    ctx.fillRect(x0, y, x1 - x0, 16);
    ctx.fillStyle = PALETTE.runwayMark;
    const dashes = Math.max(2, Math.floor((x1 - x0) / 26));
    for (let i = 0; i < dashes; i += 1) {
      ctx.fillRect(x0 + 8 + i * ((x1 - x0 - 16) / dashes), y + 7, 12, 2.5);
    }
    // Threshold bars + windsock.
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(x0 + 2, y - 2, 4, 20);
    ctx.fillRect(x1 - 6, y - 2, 4, 20);
    ctx.strokeStyle = '#e8e2d0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1 + 14, y); ctx.lineTo(x1 + 14, y - 26); ctx.stroke();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath(); ctx.moveTo(x1 + 14, y - 26); ctx.lineTo(x1 + 34, y - 21); ctx.lineTo(x1 + 14, y - 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '600 13px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('RUNWAY', (x0 + x1) / 2, y + 32);
  }

  function drawRing(ring, distNm, altFt, groundY) {
    const rel = ring.atNm - distNm;
    if (rel < -0.4 || rel > VIEW_AHEAD_NM) return;
    const x = PLANE_X + rel * PX_PER_NM;
    // Altitude maps to screen height: higher ring = higher on screen.
    const altSpan = 7000;
    const y = groundY - 60 - ((ring.altFt - altFt) / altSpan) * 420 - 120;
    const scale = Math.max(0.25, Math.min(1.6, 3.2 / (rel + 0.9)));
    const r = 46 * scale;
    if (y < -80 || y > FIELD.height + 80) return;
    ctx.save();
    ctx.shadowColor = PALETTE.ring;
    ctx.shadowBlur = 22 * scale;
    ctx.strokeStyle = PALETTE.ring;
    ctx.lineWidth = 7 * scale;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = PALETTE.ringCore;
    ctx.lineWidth = 2.5 * scale;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `700 ${Math.max(11, 15 * scale)}px ` + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('RING', x, y - r - 8);
    ctx.restore();
  }

  function drawPlane(state, time) {
    const x = PLANE_X;
    const y = PLANE_Y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((state.bankDeg * Math.PI) / 180 * 0.5);
    ctx.rotate((-state.pitchDeg * Math.PI) / 180 * 0.6);
    // Shadow on the sea far below.
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#06283a';
    ctx.beginPath();
    ctx.ellipse(x + 30, 640, 90, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((state.bankDeg * Math.PI) / 180 * 0.5);
    ctx.rotate((-state.pitchDeg * Math.PI) / 180 * 0.6);
    // Tail.
    ctx.fillStyle = PALETTE.planeRed;
    ctx.beginPath(); ctx.moveTo(-58, -4); ctx.lineTo(-78, -26); ctx.lineTo(-66, -2); ctx.closePath(); ctx.fill();
    // Fuselage.
    ctx.fillStyle = PALETTE.planeWhite;
    ctx.beginPath();
    ctx.moveTo(-64, -6);
    ctx.quadraticCurveTo(-20, -16, 34, -10);
    ctx.quadraticCurveTo(66, -6, 72, 2);
    ctx.quadraticCurveTo(66, 10, 30, 12);
    ctx.quadraticCurveTo(-30, 12, -64, 6);
    ctx.closePath();
    ctx.fill();
    // Red cheatline + flag.
    ctx.fillStyle = PALETTE.planeRed;
    ctx.fillRect(-60, 0, 118, 4);
    ctx.fillStyle = '#d42b2b'; ctx.fillRect(-52, -14, 22, 6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-52, -8, 22, 6);
    // Windows.
    ctx.fillStyle = '#16324a';
    ctx.beginPath(); ctx.ellipse(38, -8, 12, 6, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fd8ef';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath(); ctx.arc(8 - i * 13, -6, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    // Wing.
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(18, 4); ctx.lineTo(30, 26); ctx.lineTo(-2, 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b9b2a2'; ctx.lineWidth = 1.5;
    ctx.stroke();
    // Gear.
    if (state.gearDown) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-18, 10); ctx.lineTo(-18, 26); ctx.moveTo(28, 10); ctx.lineTo(28, 26); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-18, 28, 5, 0, Math.PI * 2); ctx.arc(28, 28, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Propeller (spins with throttle).
    const spin = time * (6 + state.throttle * 30);
    ctx.save();
    ctx.translate(74, 0);
    ctx.rotate(spin);
    ctx.fillStyle = 'rgba(40,40,40,0.75)';
    ctx.beginPath(); ctx.ellipse(0, -16, 3.5, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 16, 3.5, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#d42b2b';
    ctx.beginPath(); ctx.arc(74, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Callsign.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('PK-LNG  •  ELANG', x - 64, y + 52);
  }

  function panel(x, y, w, h, title) {
    ctx.fillStyle = 'rgba(20,26,34,0.88)';
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill(); ctx.stroke();
    if (title) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '600 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(title, x + w / 2, y + 15);
    }
  }

  function drawArtificialHorizon(state, x, y, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y);
    ctx.rotate((state.bankDeg * Math.PI) / 180);
    const pitchPx = state.pitchDeg * 2.2;
    ctx.fillStyle = timeOfDay === 'sunset' ? '#e2703a' : '#4f9fd8';
    ctx.fillRect(-r - 2, -r - 2 - pitchPx, r * 2 + 4, r + 2 + pitchPx);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (let p = -20; p <= 20; p += 10) {
      const yy = pitchPx - p * 2.2;
      ctx.beginPath(); ctx.moveTo(-18, yy); ctx.lineTo(18, yy); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r + 4, y); ctx.lineTo(x - 10, y);
    ctx.moveTo(x + 10, y); ctx.lineTo(x + r - 4, y);
    ctx.stroke();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawTape(x, y, w, h, value, unit, label, format) {
    panel(x, y, w, h, label);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(format(value), x + w / 2, y + 44);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.fillText(unit, x + w / 2, y + 60);
  }

  function drawCompass(state, x, y, w) {
    panel(x, y, w, 44, null);
    const headings = [0, 45, 90, 135, 180, 225, 270, 315];
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 4, y + 4, w - 8, 36); ctx.clip();
    for (const hdg of headings) {
      let d = ((hdg - state.headingDeg + 540) % 360) - 180;
      const px = x + w / 2 + d * 2.4;
      if (px < x - 20 || px > x + w + 20) continue;
      ctx.fillStyle = hdg === 90 ? '#ffd23f' : PALETTE.text;
      ctx.font = '700 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(names[hdg], px, y + 26);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '11px ' + FONT;
      ctx.fillText(String(hdg).padStart(3, '0'), px, y + 39);
    }
    ctx.restore();
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.moveTo(x + w / 2 - 6, y + 2); ctx.lineTo(x + w / 2 + 6, y + 2); ctx.lineTo(x + w / 2, y + 10); ctx.closePath(); ctx.fill();
  }

  function drawHud(state, screen, best) {
    // Top bar.
    ctx.fillStyle = 'rgba(10,16,24,0.72)';
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 20px ' + FONT;
    ctx.fillText(`SKOR ${state.score}`, 16, 30);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 13px ' + FONT;
    ctx.fillText(`TERBAIK ${Math.max(best, state.score)}`, 170, 29);
    // Timer.
    const t = Math.max(0, Math.ceil(state.timeLeft));
    const mm = String(Math.floor(t / 60)).padStart(1, '0');
    const ss = String(t % 60).padStart(2, '0');
    ctx.fillStyle = t <= 30 ? PALETTE.bad : PALETTE.text;
    ctx.font = '700 20px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`${mm}:${ss}`, FIELD.width / 2, 30);
    // Fuel.
    const fw = 150;
    const fx = FIELD.width - fw - 170;
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('FUEL', fx - 42, 29);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.roundRect(fx, 16, fw, 14, 7); ctx.fill();
    ctx.fillStyle = state.fuel < 25 ? PALETTE.bad : state.fuel < 50 ? PALETTE.warn : PALETTE.good;
    ctx.beginPath(); ctx.roundRect(fx, 16, fw * Math.max(0, state.fuel) / 100, 14, 7); ctx.fill();
    // Lives.
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 16px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText('✈'.repeat(Math.max(0, state.lives)) + '  ', FIELD.width - 8, 30);
    // Leg + rings.
    const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 14px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(`LEG ${state.legIndex + 1} → ${leg.island.name}`, 16, 70);
    ctx.fillStyle = PALETTE.ring;
    ctx.fillText(`◉  RING ${state.ringsPassed}/${state.ringsTotal}   STREAK ${state.streak}`, 16, 92);
    // Wind.
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 13px ' + FONT;
    ctx.fillText(`ANGIN ${Math.abs(Math.round(state.windKt))} kt ${state.windKt >= 0 ? '→' : '←'}`, 16, 114);
    // Gear / flaps.
    ctx.fillStyle = state.gearDown ? PALETTE.good : PALETTE.muted;
    ctx.fillText(`RODA ${state.gearDown ? 'TURUN [G]' : 'NAIK [G]'}   FLAP ${state.flaps} [F]`, 16, 136);

    // Bottom instruments.
    drawArtificialHorizon(state, 92, 636, 46);
    drawTape(160, 592, 150, 76, state.altitudeFt, 'ft  •  VS ' + (state.vspeedFpm >= 0 ? '+' : '') + Math.round(state.vspeedFpm) + ' fpm', 'ALTITUDE', (v) => String(Math.round(v)));
    drawTape(322, 592, 150, 76, state.speedKt, 'knots  •  THR ' + Math.round(state.throttle * 100) + '%', 'AIRSPEED', (v) => String(Math.round(v)));
    drawCompass(state, 500, 604, 300);
    panel(820, 592, 180, 76, 'HEADING');
    ctx.fillStyle = PALETTE.text;
    ctx.font = '700 22px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(`${String(Math.round(state.headingDeg)).padStart(3, '0')}°`, 910, 636);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 11px ' + FONT;
    ctx.fillText('HDG', 910, 652);
    panel(1016, 592, 248, 76, 'KONTROL');
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '600 12px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('↑↓ pitch   ←→ belok   Shift gas', 1028, 620);
    ctx.fillText('G roda   F flap   P jeda   R ulang', 1028, 640);
    ctx.fillText('Mouse: arahkan untuk mengemudi', 1028, 660);

    // Message banner.
    if (state.message && state.messageTimer > 0 && screen === SCREEN_PLAY) {
      ctx.fillStyle = 'rgba(10,16,24,0.78)';
      const mw = ctx.measureText(state.message).width + 44;
      ctx.beginPath(); ctx.roundRect(FIELD.width / 2 - mw / 2, 160, mw, 40, 10); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.font = '700 18px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, FIELD.width / 2, 186);
    }
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(6,12,20,0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = '800 54px ' + FONT;
    ctx.fillText(title, FIELD.width / 2, 210);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '400 19px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 268 + i * 32));
  }

  function draw(state, screen, best, time, opts = {}) {
    if (opts.timeOfDay) timeOfDay = opts.timeOfDay;
    clouds = opts.clouds ?? clouds;
    const horizonY = 330 - state.pitchDeg * 3 - (state.altitudeFt / 9000) * 70;
    const groundY = Math.min(560, horizonY + 150);
    // Sky + sun + clouds + sea.
    ctx.fillStyle = skyGradient(horizonY);
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawSun(horizonY);
    drawClouds(horizonY, state.distanceNm);
    drawSea(horizonY);
    // World: islands, runway, rings.
    const leg = state.world.legs[Math.min(state.legIndex, state.world.legs.length - 1)];
    for (const island of state.world.islands) drawIsland(island, state.distanceNm, horizonY, groundY);
    drawRunway(leg.runway, state.distanceNm, groundY);
    for (const ring of state.rings) drawRing(ring, state.distanceNm, state.altitudeFt, groundY);
    drawPlane(state, time);
    drawHud(state, screen, best);

    if (screen === SCREEN_TITLE) {
      overlay('LANGIT NUSANTARA', [
        'Terbang melintasi kepulauan Indonesia — lewati ring, mendarat mulus, isi bahan bakar.',
        '↑ ↓ pitch  •  ← → belok  •  Shift gas  •  G roda  •  F flap  •  P jeda  •  M suara',
        'Satu penerbangan 3 menit, 3 nyawa. Ring +150 poin, pendaratan mulus +400.',
        '',
        'Tekan SPASI atau klik untuk terbang!',
      ], '#ffd23f');
    } else if (screen === SCREEN_PAUSED) {
      overlay('JEDA', ['Tekan P atau Spasi untuk lanjut.', 'R untuk mulai dari awal.']);
    } else if (screen === SCREEN_LANDED && state.landing) {
      overlay(`PENDARATAN ${state.landing.quality}`, [
        `Mendarat di ${state.landing.island} — kecepatan ${state.landing.speed} kt, turun ${state.landing.vspeed} fpm.`,
        `+${state.landing.points} poin. Bahan bakar diisi penuh.`,
        '',
        'Tekan SPASI untuk terbang ke pulau berikutnya!',
      ], PALETTE.good);
    } else if (screen === SCREEN_OVER) {
      overlay('PENERBANGAN SELESAI', [
        `Skor akhir: ${state.score}   •   Ring: ${state.ringsPassed}   •   Leg: ${state.legIndex + 1}`,
        `Skor terbaik: ${Math.max(best, state.score)}`,
        '',
        'Tekan SPASI atau R untuk terbang lagi!',
      ]);
    }
  }

  return {
    draw,
    setTimeOfDay(value) { timeOfDay = value; },
    setClouds(value) { clouds = value; },
  };
}
