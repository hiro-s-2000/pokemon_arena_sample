// Pokémon Arena 2D - Custom Visual Effects & Web Audio Synthesizer

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.step = 0;
  }

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playTone(freq, type, dur, vol = 0.12, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    }
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }

  playNoise(dur, vol = 0.14, filterFreq = 1200) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
  }

  sfx(kind) {
    if (!this.enabled) return;
    switch (kind) {
      case "fire":
        this.playNoise(0.35, 0.18, 650);
        this.playTone(220, "sawtooth", 0.25, 0.08, 90);
        break;
      case "water":
        this.playNoise(0.3, 0.15, 1400);
        this.playTone(420, "sine", 0.22, 0.09, 240);
        break;
      case "surf":
        this.playNoise(0.75, 0.22, 850);
        this.playTone(180, "triangle", 0.65, 0.12, 340);
        break;
      case "thunder":
        this.playNoise(0.4, 0.22, 2400);
        this.playTone(880, "sawtooth", 0.18, 0.14, 140);
        setTimeout(() => this.playTone(660, "square", 0.22, 0.12, 110), 70);
        break;
      case "ice":
        this.playTone(1200, "sine", 0.18, 0.12, 1800);
        setTimeout(() => this.playTone(1560, "triangle", 0.25, 0.11, 900), 60);
        break;
      case "hypnosis":
        this.playTone(520, "sine", 0.35, 0.11, 310);
        setTimeout(() => this.playTone(460, "sine", 0.35, 0.11, 260), 120);
        break;
      case "beam":
        this.playTone(300, "sawtooth", 0.65, 0.16, 820);
        this.playNoise(0.65, 0.2, 1100);
        break;
      case "hit":
        this.playTone(160, "square", 0.14, 0.16, 55);
        this.playNoise(0.12, 0.16, 900);
        break;
      case "recall":
        this.playTone(780, "sine", 0.35, 0.13, 220);
        break;
      case "sendout":
        this.playTone(320, "triangle", 0.28, 0.14, 860);
        break;
      case "ko":
        this.playNoise(0.6, 0.25, 600);
        this.playTone(260, "sawtooth", 0.55, 0.2, 65);
        break;
      case "fieldchange":
        this.playNoise(1.1, 0.22, 420);
        this.playTone(110, "sawtooth", 0.9, 0.14, 55);
        break;
    }
  }
}

const SOUND = new SoundEngine();

// Helper for drawing pixel-style circles and rings
function drawEllipseRing(ctx, x, y, rx, ry, color, lineWidth = 2, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Draw a stable jagged lightning bolt between two points. Existing callers do
// not need to provide a seed; the endpoints are enough to derive one. Keeping
// the path deterministic prevents the bolt from turning into visual noise when
// the canvas is redrawn at 60 fps.
function drawLightningBolt(ctx, x1, y1, x2, y2, color = "#fff04d", width = 4, jaggedness = 22, seed = null) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(5, Math.floor(dist / 22));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const invDist = 1 / Math.max(1, dist);
  const perpX = -dy * invDist;
  const perpY = dx * invDist;
  const pathSeed = normalizeEffectSeed(
    seed ?? `${Math.round(x1)},${Math.round(y1)},${Math.round(x2)},${Math.round(y2)},${color},${width}`
  );
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const envelope = Math.sin(t * Math.PI);
    const offset = effectSignedUnit(pathSeed, i) * jaggedness * envelope;
    const bx = x1 + dx * t + perpX * offset;
    const by = y1 + dy * t + perpY * offset;
    ctx.lineTo(bx, by);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Draw a restrained water vortex: a few thin bands instead of a filled tower.
function drawWhirlpoolTornado(ctx, x, y, radius, height, time, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.68;
  ctx.lineCap = "round";
  const visualRadius = Math.max(18, Math.min(68, radius * 0.68));
  const visualHeight = Math.max(38, Math.min(118, height * 0.52));

  for (let i = 0; i < 2; i++) {
    const r = visualRadius * (0.58 + i * 0.24 + Math.sin(time * 6 + i) * 0.025);
    ctx.strokeStyle = i === 0 ? "#dff7ff" : "#49b8f2";
    ctx.lineWidth = i === 0 ? 2.4 : 1.7;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.38, time * 2 + i, 0, Math.PI * 1.55);
    ctx.stroke();
  }

  const slices = 5;
  for (let s = 0; s <= slices; s++) {
    const frac = s / slices;
    const sy = y - frac * visualHeight;
    const funnelR = visualRadius * (0.28 + frac * 0.58);
    const wobble = Math.sin(time * 8 + frac * 6) * 2.5;
    const cx = x + wobble;
    ctx.strokeStyle = s % 2 === 0 ? "#dff7ff" : "#49b8f2";
    ctx.lineWidth = s % 2 === 0 ? 2.2 : 1.6;
    ctx.beginPath();
    const startAng = (time * 6 + s * 0.8) % (Math.PI * 2);
    ctx.ellipse(cx, sy, funnelR, funnelR * 0.34, 0, startAng, startAng + Math.PI * 1.05);
    ctx.stroke();
  }

  ctx.restore();
}

// Draw Surf as a compact set of moving crests without an opaque wave wall.
function drawSurfWave(ctx, x, y, dirX, dirY, radius, time, alpha = 1) {
  const angle = Math.atan2(dirY, dirX);
  ctx.save();
  ctx.globalAlpha = alpha * 0.72;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  const visualRadius = Math.max(18, Math.min(68, radius * 0.68));
  const colors = ["#dff7ff", "#57c7f5", "#238ad2"];
  for (let band = 0; band < 3; band++) {
    const wobble = Math.sin(time * 10 + band) * 2;
    ctx.strokeStyle = colors[band];
    ctx.lineWidth = 3.4 - band * 0.8;
    ctx.beginPath();
    ctx.ellipse(
      wobble + band * 5,
      0,
      visualRadius * (0.52 - band * 0.06),
      visualRadius * (0.96 - band * 0.08),
      0,
      -Math.PI * 0.52,
      Math.PI * 0.52
    );
    ctx.stroke();
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Signature move renderers
//
// Every renderer below consumes one long-lived effect object. Geometry is
// rebuilt deterministically from `effect.seed`, so callers do not need to
// create clouds of per-frame particles and the same frame always looks the
// same. Supported timing shapes are:
//   { life, maxLife } or { age, duration } or { progress }.
// An optional `time` argument is only used when the object has no timing data.
// ---------------------------------------------------------------------------

function effectClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function effectClamp01(value) {
  return effectClamp(Number(value) || 0, 0, 1);
}

function effectSmoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = effectClamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function effectEaseOutCubic(value) {
  const t = effectClamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function normalizeEffectSeed(seed) {
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  const source = String(seed ?? "pokemon-arena-effect");
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function effectUnit(seed, index = 0) {
  let value = (normalizeEffectSeed(seed) + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function effectSignedUnit(seed, index = 0) {
  return effectUnit(seed, index) * 2 - 1;
}

function getEffectTiming(effect, fallbackTime = 0) {
  const duration = Math.max(
    0.001,
    Number(effect?.maxLife) || Number(effect?.duration) || Number(effect?.durationSeconds) || 1
  );
  let age;
  if (Number.isFinite(effect?.age)) {
    age = Number(effect.age);
  } else if (Number.isFinite(effect?.life)) {
    age = duration - Number(effect.life);
  } else if (Number.isFinite(effect?.startedAt)) {
    age = Number(fallbackTime) - Number(effect.startedAt);
  } else {
    age = Number(fallbackTime) || 0;
  }
  const progress = Number.isFinite(effect?.progress)
    ? effectClamp01(effect.progress)
    : effectClamp01(age / duration);
  return { age: Math.max(0, age), duration, progress };
}

function getEffectEndpoints(effect) {
  return {
    x1: Number(effect?.x1 ?? effect?.x ?? 0) || 0,
    y1: Number(effect?.y1 ?? effect?.y ?? 0) || 0,
    x2: Number(effect?.x2 ?? effect?.targetX ?? effect?.x ?? 0) || 0,
    y2: Number(effect?.y2 ?? effect?.targetY ?? effect?.y ?? 0) || 0
  };
}

function trimEffectPath(points, reveal = 1) {
  if (!points.length) return [];
  const amount = effectClamp01(reveal);
  if (amount <= 0) return [points[0]];
  if (amount >= 1) return points.slice();
  const scaled = amount * (points.length - 1);
  const whole = Math.floor(scaled);
  const frac = scaled - whole;
  const visible = points.slice(0, whole + 1);
  const from = points[whole];
  const to = points[Math.min(points.length - 1, whole + 1)];
  visible.push({
    x: from.x + (to.x - from.x) * frac,
    y: from.y + (to.y - from.y) * frac
  });
  return visible;
}

function pointOnEffectPath(points, amount) {
  if (!points.length) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const scaled = effectClamp01(amount) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * frac,
    y: points[index].y + (points[index + 1].y - points[index].y) * frac
  };
}

function offsetEffectPath(points, offset) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.x - (dy / length) * offset,
      y: point.y + (dx / length) * offset
    };
  });
}

function buildEffectStreamPath(effect, time, options = {}) {
  const { x1, y1, x2, y2 } = getEffectEndpoints(effect);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy) || 1;
  const perpX = -dy / distance;
  const perpY = dx / distance;
  const segments = effectClamp(
    Math.round(options.segments || distance / 22),
    options.minSegments || 8,
    options.maxSegments || 28
  );
  const amplitude = Number(options.amplitude) || 0;
  const cycles = Number(options.cycles) || 1.5;
  const speed = Number(options.speed) || 0;
  const seed = normalizeEffectSeed(effect?.seed ?? `${effect?.kind || "stream"}:${x1},${y1}:${x2},${y2}`);
  const phase = effectUnit(seed, options.salt || 0) * Math.PI * 2;
  const curve = Number(effect?.curve) || Number(options.curve) || 0;
  const points = [];

  for (let i = 0; i <= segments; i++) {
    const along = i / segments;
    const envelope = Math.sin(along * Math.PI);
    const wave = Math.sin(along * Math.PI * 2 * cycles + phase + time * speed);
    const fixedVariation = effectSignedUnit(seed, i + (options.salt || 0) * 31) * amplitude * 0.22;
    const bend = curve * Math.sin(along * Math.PI);
    const offset = (wave * amplitude + fixedVariation) * envelope + bend;
    points.push({
      x: x1 + dx * along + perpX * offset,
      y: y1 + dy * along + perpY * offset
    });
  }
  return points;
}

function strokeEffectPath(ctx, points, color, width, alpha = 1, widthShape = "even") {
  if (!ctx || points.length < 2 || alpha <= 0 || width <= 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = effectClamp01(alpha);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < points.length; i++) {
    const along = i / (points.length - 1);
    let scale = 1;
    if (widthShape === "flame") {
      scale = 0.72 + Math.pow(along, 0.68) * 0.78 + Math.sin(along * Math.PI) * 0.22;
    } else if (widthShape === "cone") {
      scale = 0.65 + Math.pow(along, 0.72) * 0.92;
    } else if (widthShape === "jet") {
      scale = 0.92 + Math.sin(along * Math.PI) * 0.24 + along * 0.18;
    } else if (widthShape === "taper") {
      scale = 1 - along * 0.48;
    }
    ctx.lineWidth = Math.max(0.6, width * scale);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function buildDeterministicLightningPath(effect, jaggedness, salt = 0) {
  const endpoints = getEffectEndpoints(effect);
  const dx = endpoints.x2 - endpoints.x1;
  const dy = endpoints.y2 - endpoints.y1;
  const distance = Math.hypot(dx, dy) || 1;
  const perpX = -dy / distance;
  const perpY = dx / distance;
  const steps = effectClamp(Math.round(distance / 24), 5, 24);
  const seed = normalizeEffectSeed(effect?.seed ?? `${effect?.kind || "electric"}:${endpoints.x1},${endpoints.y1}:${endpoints.x2},${endpoints.y2}`);
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const along = i / steps;
    const envelope = Math.sin(along * Math.PI);
    const offset = i === 0 || i === steps
      ? 0
      : effectSignedUnit(seed, i + salt * 37) * jaggedness * envelope;
    points.push({
      x: endpoints.x1 + dx * along + perpX * offset,
      y: endpoints.y1 + dy * along + perpY * offset
    });
  }
  return points;
}

// The reference footage is rendered at a deliberately chunky pixel scale.
// These helpers keep the authored silhouettes crisp without depending on
// filters, shadows or other APIs that are not available in the recording
// canvas used by the regression tests.
function quantizeEffectTime(age, framesPerSecond = 20) {
  const fps = Math.max(1, Number(framesPerSecond) || 20);
  return Math.floor(Math.max(0, Number(age) || 0) * fps) / fps;
}

function drawEffectStar(ctx, x, y, outerRadius, innerRadius, rays, color, alpha = 1, rotation = 0) {
  const pointCount = Math.max(4, Math.round(rays) * 2);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(rotation);
  ctx.globalAlpha = effectClamp01(alpha);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < pointCount; i++) {
    const angle = -Math.PI * 0.5 + (i / pointCount) * Math.PI * 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const px = Math.cos(angle) * radius;
    const py = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPixelBubble(ctx, x, y, size, color, alpha = 1, square = false) {
  const px = Math.round(x);
  const py = Math.round(y);
  const radius = Math.max(1, Math.round(size));
  ctx.save();
  ctx.globalAlpha = effectClamp01(alpha);
  ctx.fillStyle = color;
  if (square || radius <= 2) {
    ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  } else {
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Four curved streams expand in every direction from the user. Recommended
 * lifetime: 1.3-1.8 seconds.
 *
 * effect: { x, y, radius, seed, life, maxLife, alpha? }
 */
function getWaterSurgeExpansionProgress(progress) {
  return effectEaseOutCubic(effectSmoothstep(0.04, 0.72, effectClamp01(progress)));
}

function getGroundEffectPerspective(effect) {
  // The source clip uses an almost top-down arena. 0.88 retains just enough
  // ground perspective to sit on our 2.5D field while preserving its circular
  // Water and crater silhouettes. Collision uses this same helper.
  return effectClamp(Number(effect?.perspective) || 0.88, 0.72, 1);
}

function drawWaterSurgeEffect(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;

  const seed = normalizeEffectSeed(effect.seed ?? `${effect.x},${effect.y},water-surge`);
  const requestedRadius = Number(effect.radius) || Number(effect.maxRadius) || 120;
  const radius = effectClamp(requestedRadius, 28, 360);
  const startRadius = effectClamp(Number(effect.startRadius) || 4, 4, radius);
  const expandedRadius = startRadius + (radius - startRadius) * getWaterSurgeExpansionProgress(progress);
  const fadeIn = effectSmoothstep(0, 0.07, progress);
  const fadeOut = 1 - effectSmoothstep(0.8, 1, progress);
  const alpha = effectClamp01((effect.alpha ?? 1) * fadeIn * fadeOut);
  const frameAge = quantizeEffectTime(timing.age, 18);
  const initialRotation = effectUnit(seed, 1) * Math.PI * 2;
  const rotation = initialRotation + frameAge * 0.58;
  const perspective = getGroundEffectPerspective(effect);
  const requestedLayer = String(effect.layer || "all").toLowerCase();
  const drawBack = requestedLayer === "all" || requestedLayer === "back";
  const drawFront = requestedLayer === "all" || requestedLayer === "front";
  if (!drawBack && !drawFront) return false;

  ctx.save();
  ctx.translate(Number(effect.x) || 0, Number(effect.y) || 0);
  ctx.scale(1, perspective);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (drawBack) {
    // The pale circular guide and two blue rings sit below the battlers, just
    // like the floor-level wake in the supplied footage.
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, expandedRadius);
    pool.addColorStop(0, "rgba(83, 204, 246, 0.05)");
    pool.addColorStop(0.7, "rgba(33, 161, 220, 0.11)");
    pool.addColorStop(1, "rgba(8, 93, 158, 0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, expandedRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.7;
    ctx.strokeStyle = "#0878bc";
    ctx.lineWidth = 4.8;
    ctx.beginPath();
    ctx.arc(0, 0, expandedRadius * 0.96, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.96;
    ctx.strokeStyle = "#bff5ff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, expandedRadius * 0.985, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Four broad S-shaped blades reproduce the windmill silhouette in the clip.
  // Back and front calls split them around the battler without changing their
  // seeded geometry.
  const drawArmPath = arm => {
    const baseAngle = rotation + arm * Math.PI * 0.5;
    const startAngle = baseAngle - 1.42;
    const cp1Angle = baseAngle - 1.2;
    const cp2Angle = baseAngle - 0.38;
    ctx.beginPath();
    ctx.moveTo(
      Math.cos(startAngle) * expandedRadius * 0.1,
      Math.sin(startAngle) * expandedRadius * 0.1
    );
    ctx.bezierCurveTo(
      Math.cos(cp1Angle) * expandedRadius * 0.34,
      Math.sin(cp1Angle) * expandedRadius * 0.34,
      Math.cos(cp2Angle) * expandedRadius * 0.74,
      Math.sin(cp2Angle) * expandedRadius * 0.74,
      Math.cos(baseAngle) * expandedRadius * 0.99,
      Math.sin(baseAngle) * expandedRadius * 0.99
    );
  };
  for (let arm = 0; arm < 4; arm++) {
    const baseAngle = rotation + arm * Math.PI * 0.5;
    // Keep each whole arm on one stable layer. Reclassifying it from the
    // animated angle caused a visible back/front pop every half rotation.
    const layerAngle = initialRotation + arm * Math.PI * 0.5;
    const isBackArm = Math.sin(layerAngle) < 0;
    if ((isBackArm && !drawBack) || (!isBackArm && !drawFront)) continue;
    const armWidth = effectClamp(expandedRadius * 0.105, 5.5, 19);
    ctx.globalAlpha = alpha * 0.92;
    ctx.strokeStyle = "#075f9f";
    ctx.lineWidth = armWidth * 1.32;
    drawArmPath(arm);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = arm % 2 === 0 ? "#24b8ed" : "#39c8f3";
    ctx.lineWidth = armWidth * 0.88;
    drawArmPath(arm);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.98;
    ctx.strokeStyle = "#e9fdff";
    ctx.lineWidth = armWidth * 0.28;
    drawArmPath(arm);
    ctx.stroke();

    // A square cap keeps the broad blade from reading as a soft vector line.
    const tipX = Math.cos(baseAngle) * expandedRadius * 0.99;
    const tipY = Math.sin(baseAngle) * expandedRadius * 0.99;
    drawPixelBubble(ctx, tipX, tipY, armWidth * 0.24, "#dffaff", alpha, true);
  }

  if (drawFront) {
    // The footage has a dense halo of square spray rather than translucent
    // particle fog. Keep each fleck deterministic and pixel-sized.
    const dropletAlpha = alpha * effectSmoothstep(0.13, 0.28, progress) * (1 - effectSmoothstep(0.78, 0.98, progress));
    for (let i = 0; i < 24; i++) {
      const angle = rotation + effectUnit(seed, 20 + i) * Math.PI * 2;
      const distance = expandedRadius * (0.73 + effectUnit(seed, 50 + i) * 0.39);
      const liftPhase = effectClamp01((progress - 0.12) / 0.58);
      const lift = Math.sin(liftPhase * Math.PI) * (4 + effectUnit(seed, 80 + i) * 12);
      const size = 1 + effectUnit(seed, 110 + i) * 2.3;
      const color = i % 4 === 0 ? "#ffffff" : i % 2 === 0 ? "#a9efff" : "#2cb9ec";
      drawPixelBubble(
        ctx,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance - lift / perspective,
        size,
        color,
        dropletAlpha * (0.58 + effectUnit(seed, 140 + i) * 0.42),
        i % 3 !== 0
      );
    }

    const foam = effectSmoothstep(0.04, 0.16, progress) * (1 - effectSmoothstep(0.58, 0.86, progress));
    drawEffectStar(ctx, 0, 0, expandedRadius * 0.16, expandedRadius * 0.055, 8, "#f4feff", alpha * foam, rotation);
  }
  ctx.restore();
  return true;
}

/**
 * A ground-layer impact with seeded, persistent cracks and a few debris chips.
 * Recommended lifetime: 1.5-3 seconds.
 *
 * effect: { x, y, radius, seed, life, maxLife, alpha?, color?, accent? }
 */
function drawGroundBreakEffect(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;

  const seed = normalizeEffectSeed(effect.seed ?? `${effect.x},${effect.y},ground-break`);
  const radius = effectClamp(Number(effect.radius) || 116, 34, 180);
  // Keep the impact/dust timing fixed while allowing the residual crater to
  // live for several seconds. Otherwise extending maxLife would make the
  // initial strike feel slow and floaty.
  const stageProgress = effectClamp01(timing.age / Math.min(1.25, timing.duration));
  const reveal = effectEaseOutCubic(effectSmoothstep(0.02, 0.34, stageProgress));
  const persist = 1 - effectSmoothstep(0.78, 1, progress);
  const alpha = effectClamp01((effect.alpha ?? 1) * persist);
  const perspective = getGroundEffectPerspective(effect);
  const dark = effect.color || "#352219";
  const mid = effect.midColor || "#765037";
  const light = effect.accent || "#c79562";
  const frameAge = quantizeEffectTime(timing.age, 18);
  const requestedLayer = String(effect.layer || "all").toLowerCase();
  const drawGround = requestedLayer === "all" || requestedLayer === "ground" || requestedLayer === "back";
  const drawFront = requestedLayer === "all" || requestedLayer === "front";
  if (!drawGround && !drawFront) return false;

  ctx.save();
  ctx.translate(Number(effect.x) || 0, Number(effect.y) || 0);
  ctx.scale(1, perspective);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Phase 1: a hard white contact point and short spokes. It is intentionally
  // tiny and brief, matching the single bright impact frame in the clip.
  const impact = effectSmoothstep(0.005, 0.035, stageProgress) * (1 - effectSmoothstep(0.1, 0.18, stageProgress));
  if (drawFront && impact > 0) {
    drawEffectStar(ctx, 0, 0, radius * 0.22, radius * 0.035, 10, "#ffffff", impact * (effect.alpha ?? 1), frameAge * 3);
    ctx.globalAlpha = impact * 0.86 * (effect.alpha ?? 1);
    ctx.strokeStyle = "#fff2c8";
    ctx.lineWidth = 2;
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = (spoke / 8) * Math.PI * 2 + effectSignedUnit(seed, 8 + spoke) * 0.12;
      const inner = radius * 0.07;
      const outer = radius * (0.25 + effectUnit(seed, 20 + spoke) * 0.14) * impact;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
      ctx.stroke();
    }
  }

  // Phase 2: the earth caves in as a seeded, irregular polygon. The rim stays
  // behind after the dust clears instead of becoming a perfect vector ellipse.
  if (drawGround) {
  const craterVertices = 14;
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = dark;
  ctx.beginPath();
  for (let i = 0; i < craterVertices; i++) {
    const angle = (i / craterVertices) * Math.PI * 2;
    const irregular = 0.72 + effectUnit(seed, 60 + i) * 0.34;
    const craterRadius = radius * 0.34 * reveal * irregular;
    const x = Math.round(Math.cos(angle) * craterRadius);
    const y = Math.round(Math.sin(angle) * craterRadius);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.9;
  ctx.strokeStyle = "#211510";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.72;
  ctx.strokeStyle = light;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.4 * reveal, radius * 0.35 * reveal, 0.08, 0.15, Math.PI * 1.72);
  ctx.stroke();

  // Phase 3: six to ten primary fractures, each with a restrained fork. Their
  // geometry is stable so the residual damage decal does not shimmer.
  const crackCount = effectClamp(Math.round(Number(effect.crackCount) || 8), 6, 10);
  for (let crack = 0; crack < crackCount; crack++) {
    const baseAngle = (crack / crackCount) * Math.PI * 2 + effectSignedUnit(seed, 120 + crack) * 0.28;
    const startDistance = radius * 0.2 * reveal;
    const points = [{ x: Math.cos(baseAngle) * startDistance, y: Math.sin(baseAngle) * startDistance }];
    let angle = baseAngle;
    for (let segment = 1; segment <= 5; segment++) {
      angle += effectSignedUnit(seed, 160 + crack * 17 + segment) * 0.2;
      const segmentRadius = radius * reveal * (0.15 + segment * 0.17) * (0.84 + effectUnit(seed, 240 + crack) * 0.2);
      points.push({
        x: Math.round(Math.cos(angle) * segmentRadius),
        y: Math.round(Math.sin(angle) * segmentRadius)
      });
    }
    strokeEffectPath(ctx, points, "#241610", 4.4, alpha * 0.94, "taper");
    strokeEffectPath(ctx, points, mid, 1.45, alpha * 0.68, "taper");

    if ((crack + seed) % 2 === 0 && reveal > 0.34) {
      const forkOrigin = points[3];
      const forkAngle = angle + (effectUnit(seed, 340 + crack) > 0.5 ? 1 : -1) * (0.46 + effectUnit(seed, 360 + crack) * 0.44);
      const forkLength = radius * reveal * (0.2 + effectUnit(seed, 380 + crack) * 0.16);
      const forkPoints = [
        forkOrigin,
        {
          x: forkOrigin.x + Math.cos(forkAngle) * forkLength * 0.48,
          y: forkOrigin.y + Math.sin(forkAngle) * forkLength * 0.48
        },
        {
          x: forkOrigin.x + Math.cos(forkAngle + effectSignedUnit(seed, 400 + crack) * 0.14) * forkLength,
          y: forkOrigin.y + Math.sin(forkAngle + effectSignedUnit(seed, 400 + crack) * 0.14) * forkLength
        }
      ];
      strokeEffectPath(ctx, forkPoints, "#241610", 2.7, alpha * 0.82, "taper");
    }
  }
  }

  // Phase 4: a rolling ring of discrete dust puffs. Their light centres and
  // dark undersides match the opaque sprite clouds used by the reference.
  const dustPhase = effectSmoothstep(0.025, 0.09, stageProgress) * (1 - effectSmoothstep(0.28, 0.48, stageProgress));
  if (drawFront && dustPhase > 0) {
    const dustRadius = radius * (0.12 + effectEaseOutCubic(stageProgress / 0.48) * 0.48);
    for (let i = 0; i < 13; i++) {
      const angle = (i / 13) * Math.PI * 2 + effectSignedUnit(seed, 460 + i) * 0.16;
      const puffSize = radius * (0.055 + effectUnit(seed, 480 + i) * 0.045);
      const x = Math.cos(angle) * dustRadius;
      const y = Math.sin(angle) * dustRadius - Math.sin(effectClamp01(stageProgress / 0.34) * Math.PI) * puffSize * 0.6 / perspective;
      drawPixelBubble(ctx, x, y + puffSize * 0.2, puffSize * 1.08, "#76543b", dustPhase * 0.54, false);
      drawPixelBubble(ctx, x - puffSize * 0.15, y - puffSize * 0.15, puffSize * 0.78, i % 3 === 0 ? "#f0d5a9" : "#c89f70", dustPhase * 0.82, false);
    }
  }

  // Four heavy chunks and six chips arc out, settle, and remain near the rim.
  const debrisTravel = effectClamp01(stageProgress / 0.42);
  const debrisLift = Math.sin(debrisTravel * Math.PI);
  if (drawFront) for (let i = 0; i < 10; i++) {
    const angle = effectUnit(seed, 520 + i) * Math.PI * 2;
    const distance = radius * reveal * (0.28 + effectUnit(seed, 550 + i) * 0.58) * effectEaseOutCubic(debrisTravel);
    const size = (i < 4 ? 5.5 : 2.3) + effectUnit(seed, 580 + i) * (i < 4 ? 5.5 : 3.2);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - debrisLift * (10 + effectUnit(seed, 610 + i) * 24) / perspective;
    ctx.save();
    ctx.translate(x, y);
    // Stop each chunk's spin when its outward arc settles; the persistent
    // crater should read as debris on the floor, not stones rotating in place.
    ctx.rotate(angle + debrisTravel * (i % 2 === 0 ? 1.1 : -0.95) + effectSignedUnit(seed, 640 + i) * 0.5);
    ctx.globalAlpha = alpha * (0.68 + effectUnit(seed, 670 + i) * 0.28);
    ctx.fillStyle = i % 3 === 0 ? light : i % 2 === 0 ? dark : mid;
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.45);
    ctx.lineTo(-size * 0.2, -size * 0.72);
    ctx.lineTo(size, -size * 0.12);
    ctx.lineTo(size * 0.34, size * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
  return true;
}

/**
 * Continuous roaring flamethrower cone with billowing smoke puffs, expanding
 * multi-layered fireballs, muzzle blaze, and engulfing impact explosion
 * (matching sample1.mp4 00:34 & sample3.mp4 00:24-00:25, 00:32-00:35).
 *
 * effect: { x1, y1, x2, y2, width, seed, life, maxLife, alpha?, curve? }
 */
function drawFlameStream(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;
  const seed = normalizeEffectSeed(effect.seed ?? "flame-stream");
  const width = effectClamp(Number(effect.width) || 38, 24, 72);
  const reveal = effectSmoothstep(0.02, 0.14, progress);
  const bodyFade = effectSmoothstep(0.015, 0.065, progress) * (1 - effectSmoothstep(0.84, 1, progress));
  const alpha = effectClamp01((effect.alpha ?? 1) * bodyFade);
  const frameAge = quantizeEffectTime(timing.age, 22);
  const path = buildEffectStreamPath(effect, frameAge, {
    amplitude: effectClamp(width * 0.22, 3, 11),
    cycles: 1.45,
    speed: 6.2,
    salt: 11,
    minSegments: 20,
    maxSegments: 32
  });
  const start = path[0];
  const flameCount = effectClamp(Math.round(Number(effect.flameCount) || 24), 18, 28);
  const visibleFlames = Math.max(1, Math.ceil(flameCount * reveal));

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // Intense muzzle flash & roaring mouth fireball throughout firing
  const muzzleIntensity = Math.max(
    effectSmoothstep(0, 0.05, progress) * (1 - effectSmoothstep(0.16, 0.28, progress)),
    alpha * 0.88
  );
  if (muzzleIntensity > 0) {
    drawPixelBubble(ctx, start.x, start.y, width * 0.56, "#7c190c", muzzleIntensity * 0.85, false);
    drawPixelBubble(ctx, start.x, start.y, width * 0.42, "#ff5412", muzzleIntensity * 0.95, false);
    drawPixelBubble(ctx, start.x, start.y, width * 0.26, "#ffe875", muzzleIntensity, false);
    drawEffectStar(
      ctx,
      start.x,
      start.y,
      width * (0.58 + Math.sin(frameAge * 18) * 0.08),
      width * 0.18,
      8,
      "#fff7c2",
      muzzleIntensity * 0.96,
      frameAge * 4.5
    );
  }

  if (alpha > 0) {
    const visiblePath = trimEffectPath(path, reveal);
    const beforeEnd = pointOnEffectPath(path, Math.max(0, reveal - 0.04));
    const head = pointOnEffectPath(path, Math.min(1, reveal));
    const streamAngle = Math.atan2(head.y - start.y, head.x - start.x);
    const perpX = -Math.sin(streamAngle);
    const perpY = Math.cos(streamAngle);

    // 1. Billowing white/grey smoke clouds along the flanks of the flame cone (sample1.mp4 00:34 & sample3.mp4 00:33)
    const smokeCount = 14;
    const visibleSmoke = Math.max(1, Math.ceil(smokeCount * reveal));
    for (let s = 0; s < visibleSmoke; s++) {
      const sAlong = smokeCount <= 1 ? 0 : (s / (smokeCount - 1)) * reveal;
      const sPoint = pointOnEffectPath(path, sAlong);
      const side = s % 2 === 0 ? 1 : -1;
      const drift = (0.38 + sAlong * 0.72) * width * (0.52 + effectUnit(seed, 310 + s) * 0.34);
      const wobble = Math.sin(frameAge * 7 + s * 1.3) * width * 0.12;
      const sx = sPoint.x + perpX * (side * drift + wobble) - Math.cos(streamAngle) * width * 0.12;
      const sy = sPoint.y + perpY * (side * drift + wobble) - Math.sin(streamAngle) * width * 0.12;
      const puffR = width * (0.24 + sAlong * 0.28) * (0.8 + effectUnit(seed, 340 + s) * 0.35);
      drawPixelBubble(ctx, sx, sy + puffR * 0.18, puffR * 1.05, "#64748b", alpha * 0.46, false);
      drawPixelBubble(ctx, sx - puffR * 0.14, sy - puffR * 0.14, puffR * 0.82, s % 3 === 0 ? "#f8fafc" : "#cbd5e1", alpha * 0.64, false);
    }

    // 2. Continuous expanding flame spine so the stream never looks disconnected or thin
    strokeEffectPath(ctx, visiblePath, "#69140b", width * 1.08, alpha * 0.94, "cone");
    strokeEffectPath(ctx, visiblePath, effect.outerColor || "#ef4416", width * 0.82, alpha * 0.98, "cone");
    strokeEffectPath(ctx, visiblePath, effect.innerColor || "#ff9e1b", width * 0.54, alpha, "cone");
    strokeEffectPath(ctx, visiblePath, effect.coreColor || "#fff3a8", width * 0.26, alpha * 0.96, "cone");

    // 3. Overlapping boiling fireballs that expand into a wide inferno cone toward the target (sample3.mp4 00:24-00:25)
    for (let index = visibleFlames - 1; index >= 0; index--) {
      const rawAlong = flameCount <= 1 ? 0 : index / (flameCount - 1);
      // Animated forward flow along the stream
      const flowShift = ((frameAge * 3.2 + index / flameCount) % 1) * 0.035;
      const along = effectClamp01(rawAlong * reveal + flowShift * reveal);
      const point = pointOnEffectPath(path, along);
      const sizeWave = 0.88 + effectUnit(seed, 40 + index) * 0.34;
      // Expand from mouth (0.76x) to a massive inferno cone at the target (1.42x)
      const coneExpand = 0.76 + Math.pow(rawAlong, 0.72) * 0.68;
      const radius = width * 0.56 * sizeWave * coneExpand;
      const wobbleAngle = effectUnit(seed, 70 + index) * Math.PI * 2 + frameAge * (index % 2 ? -6.5 : 5.5);
      const lobeX = Math.cos(wobbleAngle) * radius * 0.32;
      const lobeY = Math.sin(wobbleAngle) * radius * 0.32;
      const px = Math.round(point.x);
      const py = Math.round(point.y);

      const before = pointOnEffectPath(path, Math.max(0, along - 0.035));
      const after = pointOnEffectPath(path, Math.min(1, along + 0.035));
      const tangentAngle = Math.atan2(after.y - before.y, after.x - before.x);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(tangentAngle);
      ctx.globalAlpha = alpha * 0.96;
      ctx.fillStyle = "#5c1309";
      ctx.beginPath();
      ctx.moveTo(-radius * (1.24 + effectUnit(seed, 92 + index) * 0.30), radius * 0.04);
      ctx.lineTo(-radius * 0.42, -radius * (0.78 + effectUnit(seed, 112 + index) * 0.24));
      ctx.lineTo(radius * 0.82, -radius * 0.58);
      ctx.lineTo(radius * 1.14, 0);
      ctx.lineTo(radius * 0.72, radius * 0.64);
      ctx.lineTo(-radius * 0.48, radius * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.outerColor || "#f04312";
      ctx.beginPath();
      ctx.moveTo(-radius * 0.98, 0);
      ctx.lineTo(-radius * 0.14, -radius * 0.64);
      ctx.lineTo(radius * 0.84, -radius * 0.40);
      ctx.lineTo(radius * 0.98, 0);
      ctx.lineTo(radius * 0.58, radius * 0.48);
      ctx.lineTo(-radius * 0.22, radius * 0.56);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      drawPixelBubble(ctx, px + lobeX, py + lobeY, radius * 0.66, "#9e230e", alpha, false);
      drawPixelBubble(ctx, px - lobeX * 0.4, py + lobeY * 0.4, radius * 0.62, "#d93814", alpha, false);
      drawPixelBubble(ctx, px, py, radius * 0.76, effect.outerColor || "#ff5412", alpha, false);
      drawPixelBubble(ctx, px - lobeX * 0.35, py - lobeY * 0.35, radius * 0.50, effect.innerColor || "#ffaa1d", alpha, false);
      drawPixelBubble(ctx, px - radius * 0.12, py - radius * 0.12, radius * 0.24, effect.coreColor || "#fff6b8", alpha * 0.98, true);
    }

    // 4. Engulfing fire explosion & billowing smoke at impact head
    const impactArrival = effectSmoothstep(0.45, 0.95, reveal);
    if (impactArrival > 0) {
      const blastR = width * (0.78 + impactArrival * 0.52);
      for (let b = 0; b < 6; b++) {
        const bAng = (b / 6) * Math.PI * 2 + frameAge * 4.2;
        const bDist = blastR * (0.32 + (b % 2) * 0.22);
        const bx = head.x + Math.cos(bAng) * bDist;
        const by = head.y + Math.sin(bAng) * bDist;
        drawPixelBubble(ctx, bx, by, blastR * 0.48, b % 2 === 0 ? "#c92a10" : "#ff5412", alpha * impactArrival * 0.9, false);
        drawPixelBubble(ctx, bx, by, blastR * 0.28, "#ffaa1d", alpha * impactArrival * 0.95, false);
      }
      drawEffectStar(
        ctx,
        head.x,
        head.y,
        blastR * 1.08,
        blastR * 0.28,
        10,
        "#fff7c2",
        alpha * impactArrival * 0.95,
        -frameAge * 3.6
      );
      ctx.globalAlpha = alpha * impactArrival * 0.85;
      ctx.strokeStyle = "#ff9e1b";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(head.x, head.y, blastR * (0.72 + ((frameAge * 3) % 0.45)), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 5. High-velocity fiery ember sparks & ash flecks
    const sparkPhase = effectSmoothstep(0.1, 0.26, progress) * (1 - effectSmoothstep(0.84, 1, progress));
    for (let i = 0; i < 20; i++) {
      const angle = effectUnit(seed, 150 + i) * Math.PI * 2;
      const travel = width * (0.48 + effectUnit(seed, 180 + i) * 1.45) * sparkPhase;
      const sourceMix = i < 5 ? 0 : 1;
      const ox = sourceMix ? head.x : start.x;
      const oy = sourceMix ? head.y : start.y;
      const size = 1.4 + effectUnit(seed, 210 + i) * 3.0;
      drawPixelBubble(
        ctx,
        ox + Math.cos(angle) * travel,
        oy + Math.sin(angle) * travel,
        size,
        i % 4 === 0 ? "#ffffff" : i % 3 === 0 ? "#fff4bd" : i % 2 === 0 ? "#ffaa1d" : "#ff4d12",
        alpha * sparkPhase * (0.68 + effectUnit(seed, 240 + i) * 0.32),
        true
      );
    }
    void beforeEnd;
  }

  ctx.restore();
  return true;
}

/**
 * Helper to draw a boiling, multi-lobed DS/anime-style flame cluster puff
 * with crimson-red outer tongues, vivid orange body, golden-yellow inner flame,
 * and hot pale-yellow core (matching だいもんじの攻撃.mov 00:05-00:06).
 */
function drawFireBlastFlamePuff(ctx, x, y, radius, seed, frame, alpha = 1) {
  if (radius <= 0.5 || alpha <= 0.01) return;
  const puffSeed = normalizeEffectSeed(`${seed}:puff:${frame}`);
  const lobeCount = 4;

  ctx.save();
  // 1. Deep crimson-red outer boiling lobes + upward flame tongue
  for (let i = 0; i < lobeCount; i++) {
    const ang = (i / lobeCount) * Math.PI * 2 + effectSignedUnit(puffSeed, 10 + i) * 0.45;
    const dist = radius * (0.24 + effectUnit(puffSeed, 20 + i) * 0.18);
    const lx = x + Math.cos(ang) * dist;
    const ly = y + Math.sin(ang) * dist - radius * 0.08;
    const lr = radius * (0.68 + effectUnit(puffSeed, 30 + i) * 0.22);
    drawPixelBubble(ctx, lx, ly, lr, i % 2 === 0 ? "#b81400" : "#d92600", alpha * 0.95, false);
  }
  // Upward-licking flame tip
  const tipOffsetX = effectSignedUnit(puffSeed, 41) * radius * 0.28;
  const tipOffsetY = -radius * (0.48 + effectUnit(puffSeed, 42) * 0.26);
  drawPixelBubble(ctx, x + tipOffsetX, y + tipOffsetY, radius * 0.52, "#d92600", alpha * 0.92, false);

  // 2. Vivid orange middle flame lobes
  for (let i = 0; i < lobeCount; i++) {
    const ang = (i / lobeCount) * Math.PI * 2 + 0.35 + effectSignedUnit(puffSeed, 50 + i) * 0.35;
    const dist = radius * (0.18 + effectUnit(puffSeed, 60 + i) * 0.14);
    const lx = x + Math.cos(ang) * dist;
    const ly = y + Math.sin(ang) * dist - radius * 0.06;
    const lr = radius * (0.52 + effectUnit(puffSeed, 70 + i) * 0.16);
    drawPixelBubble(ctx, lx, ly, lr, i % 2 === 0 ? "#ff5400" : "#ff7700", alpha * 0.98, false);
  }

  // 3. Bright golden-yellow inner flame
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + effectSignedUnit(puffSeed, 80 + i) * 0.3;
    const dist = radius * 0.14;
    const lx = x + Math.cos(ang) * dist;
    const ly = y + Math.sin(ang) * dist - radius * 0.04;
    drawPixelBubble(ctx, lx, ly, radius * 0.38, "#ffd000", alpha, false);
  }

  // 4. White-hot / pale-yellow center core
  drawPixelBubble(ctx, x, y - radius * 0.04, radius * 0.22, "#fff9c4", alpha, false);
  ctx.restore();
}

/**
 * In-flight clustered fireball renderer for Fire Blast (だいもんじ), matching
 * だいもんじの攻撃.mov 00:05 where a tight cluster of boiling flame tongues
 * shoots from the user's mouth toward the opponent.
 */
function drawFireBlastProjectile(ctx, projectile, time = 0) {
  if (!ctx || !projectile) return false;
  const x = Number(projectile.x) || 0;
  const y = Number(projectile.y) || 0;
  const r = effectClamp(Number(projectile.r) || 28, 16, 64);
  const vx = Number(projectile.vx) || 0;
  const vy = Number(projectile.vy) || 0;
  const angle = Math.atan2(vy, vx || 1);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const perpX = -dirY;
  const perpY = dirX;
  const seed = normalizeEffectSeed(projectile.seed ?? 901);
  const frame = Math.max(0, Math.floor((Number(time) || 0) * 18));
  const lifeRatio = projectile.maxLife > 0 ? effectClamp01(projectile.life / projectile.maxLife) : 1;
  const alpha = Math.min(1, lifeRatio * 1.45);

  ctx.save();
  // Trailing crimson-orange embers behind the flying cluster
  for (let t = 0; t < 5; t++) {
    const trailDist = r * (0.55 + t * 0.36);
    const spread = effectSignedUnit(seed + frame, 10 + t) * r * 0.38;
    const tx = x - dirX * trailDist + perpX * spread;
    const ty = y - dirY * trailDist + perpY * spread;
    const tr = r * (0.34 - t * 0.045);
    drawPixelBubble(ctx, tx, ty, tr, t % 2 === 0 ? "#d92600" : "#ff6d00", alpha * (0.78 - t * 0.11), false);
    drawPixelBubble(ctx, tx, ty, tr * 0.52, "#ffd000", alpha * (0.78 - t * 0.11), false);
  }

  // Tightly grouped 5-flame cluster (matching frame 00:05 of だいもんじの攻撃.mov)
  const clusterOffsets = [
    [-0.28, -0.34, 0.56],
    [-0.28, 0.34, 0.56],
    [-0.02, -0.22, 0.62],
    [-0.02, 0.22, 0.62],
    [0.24, 0.0, 0.68]
  ];
  for (let i = 0; i < clusterOffsets.length; i++) {
    const [alongMul, sideMul, radMul] = clusterOffsets[i];
    const jitterAlong = effectSignedUnit(seed + frame, 30 + i) * r * 0.08;
    const jitterSide = effectSignedUnit(seed + frame, 40 + i) * r * 0.08;
    const fx = x + dirX * (alongMul * r + jitterAlong) + perpX * (sideMul * r + jitterSide);
    const fy = y + dirY * (alongMul * r + jitterAlong) + perpY * (sideMul * r + jitterSide);
    drawFireBlastFlamePuff(ctx, fx, fy, r * radMul, seed + i * 17, frame, alpha);
  }
  ctx.restore();
  return true;
}

/**
 * Dedicated staged renderer for Fire Blast (だいもんじ) upon hitting an enemy,
 * reproducing だいもんじの攻撃.mov (00:06 - 00:07):
 *  - Stage 1 (0.00 - 0.82): Golden-orange radial speed-line starburst backdrop +
 *    flames rapidly spreading outward from the enemy in the 5 strokes of the
 *    kanji 「大」 (top vertical head, left & right horizontal arms, bottom-left &
 *    bottom-right sweeping legs) with bulbous flaring tips and boiling flame lobes.
 *  - Stage 2 (0.62 - 1.00): Searing char contrast pulse & rising fiery embers.
 *
 * effect: { x, y, radius, seed, age, life, maxLife, alpha? }
 */
function drawFireBlastKanjiEffect(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;

  const x = Number(effect.x) || 0;
  const y = Number(effect.y) || 0;
  const radius = effectClamp(Number(effect.radius) || 124, 68, 240);
  const seed = normalizeEffectSeed(effect.seed ?? "fireblast-kanji");
  const frame = Math.max(0, Math.floor(timing.age * 18));
  const frameSeed = normalizeEffectSeed(`${seed}:frame:${frame}`);

  const expand = effectSmoothstep(0.0, 0.30, progress);
  const holdFade = 1 - effectSmoothstep(0.76, 1.0, progress);
  const alpha = effectClamp01((effect.alpha ?? 1) * holdFade);
  if (alpha <= 0.001) return false;

  // The 5 strokes of 「大」 (Dai) centered on the enemy body (matching 00:06):
  // 0: Top vertical stroke (上)
  // 1: Left horizontal arm (左横)
  // 2: Right horizontal arm (右横)
  // 3: Bottom-left sweeping leg (左払い)
  // 4: Bottom-right sweeping leg (右払い)
  const centerOffsetY = -radius * 0.06;
  const originX = x;
  const originY = y + centerOffsetY;
  const strokes = [
    {
      // Top vertical head of 「大」
      points: [
        { x: originX, y: originY + radius * 0.04 },
        { x: originX, y: originY - radius * 0.44 },
        { x: originX, y: originY - radius * 0.88 }
      ],
      tipScale: 1.48,
      nodeCount: 5
    },
    {
      // Left horizontal arm of 「大」 (slightly angled upward at tip like 00:06)
      points: [
        { x: originX - radius * 0.04, y: originY - radius * 0.08 },
        { x: originX - radius * 0.50, y: originY - radius * 0.13 },
        { x: originX - radius * 0.96, y: originY - radius * 0.18 }
      ],
      tipScale: 1.44,
      nodeCount: 6
    },
    {
      // Right horizontal arm of 「大」 (slightly angled upward at tip like 00:06)
      points: [
        { x: originX + radius * 0.04, y: originY - radius * 0.08 },
        { x: originX + radius * 0.50, y: originY - radius * 0.13 },
        { x: originX + radius * 0.96, y: originY - radius * 0.18 }
      ],
      tipScale: 1.44,
      nodeCount: 6
    },
    {
      // Bottom-left sweeping leg of 「大」 (ノ)
      points: [
        { x: originX - radius * 0.03, y: originY - radius * 0.02 },
        { x: originX - radius * 0.34, y: originY + radius * 0.44 },
        { x: originX - radius * 0.72, y: originY + radius * 0.90 }
      ],
      tipScale: 1.38,
      nodeCount: 6
    },
    {
      // Bottom-right sweeping leg of 「大」 (乀)
      points: [
        { x: originX + radius * 0.03, y: originY - radius * 0.02 },
        { x: originX + radius * 0.34, y: originY + radius * 0.44 },
        { x: originX + radius * 0.72, y: originY + radius * 0.90 }
      ],
      tipScale: 1.38,
      nodeCount: 6
    }
  ];

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 1. Golden-orange radial starburst speed-lines backdrop (00:06 background burst)
  const burstPhase = effectSmoothstep(0.04, 0.24, progress) * (1 - effectSmoothstep(0.68, 0.92, progress));
  if (burstPhase > 0.01) {
    const rayCount = 32;
    const innerR = radius * 0.18;
    const outerR = radius * (1.18 + expand * 0.34);

    // Warm golden-orange aura backdrop disc
    ctx.globalAlpha = alpha * burstPhase * 0.46;
    ctx.fillStyle = "#ff7b00";
    ctx.beginPath();
    ctx.arc(originX, originY, outerR * 0.88, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = alpha * burstPhase * 0.58;
    ctx.fillStyle = "#ffd000";
    ctx.beginPath();
    ctx.arc(originX, originY, outerR * 0.62, 0, Math.PI * 2);
    ctx.fill();

    // Radial anime speed-line spikes
    for (let rIdx = 0; rIdx < rayCount; rIdx++) {
      const baseAng = (rIdx / rayCount) * Math.PI * 2;
      const jitter = effectSignedUnit(frameSeed, 100 + rIdx) * 0.035;
      const ang = baseAng + jitter;
      const rayLen = outerR * (rIdx % 2 === 0 ? 1.12 : 0.84) * (0.88 + effectUnit(frameSeed, 140 + rIdx) * 0.22);
      const halfSpread = (Math.PI / rayCount) * (rIdx % 2 === 0 ? 0.58 : 0.38);

      ctx.globalAlpha = alpha * burstPhase * (rIdx % 2 === 0 ? 0.88 : 0.72);
      ctx.fillStyle = rIdx % 3 === 0 ? "#fff380" : rIdx % 2 === 0 ? "#ffd000" : "#ff8800";
      ctx.beginPath();
      ctx.moveTo(originX + Math.cos(ang) * innerR, originY + Math.sin(ang) * innerR);
      ctx.lineTo(originX + Math.cos(ang - halfSpread) * rayLen, originY + Math.sin(ang - halfSpread) * rayLen);
      ctx.lineTo(originX + Math.cos(ang + halfSpread) * rayLen, originY + Math.sin(ang + halfSpread) * rayLen);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 2. Brief char/scorched contrast aura in late phase (matching 00:07)
  const charPhase = effectSmoothstep(0.62, 0.76, progress) * (1 - effectSmoothstep(0.88, 1.0, progress));
  if (charPhase > 0.01) {
    ctx.globalAlpha = alpha * charPhase * 0.52;
    ctx.fillStyle = "#1a0500";
    ctx.beginPath();
    ctx.arc(originX, originY, radius * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Continuous multi-layered flame spine along all 5 strokes of 「大」
  const baseStrokeW = radius * 0.23;
  for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
    const stroke = strokes[sIdx];
    const visiblePts = trimEffectPath(stroke.points, expand);
    strokeEffectPath(ctx, visiblePts, "#9e1300", baseStrokeW * 1.32, alpha * 0.95, "cone");
    strokeEffectPath(ctx, visiblePts, "#e02800", baseStrokeW * 1.04, alpha * 0.98, "cone");
    strokeEffectPath(ctx, visiblePts, "#ff6d00", baseStrokeW * 0.76, alpha, "cone");
    strokeEffectPath(ctx, visiblePts, "#ffd000", baseStrokeW * 0.48, alpha, "cone");
    strokeEffectPath(ctx, visiblePts, "#fff9c4", baseStrokeW * 0.22, alpha, "cone");
  }

  // 4. Central crossroads flame core of 「大」
  drawFireBlastFlamePuff(ctx, originX, originY - radius * 0.04, baseStrokeW * 0.85, seed + 11, frame, alpha);

  // 5. Boiling cel-shaded flame clusters along each of the 5 limbs of 「大」 + bulbous flaring tips
  for (let sIdx = 0; sIdx < strokes.length; sIdx++) {
    const stroke = strokes[sIdx];
    const count = stroke.nodeCount;
    const activeNodes = Math.max(1, Math.ceil(count * expand));
    for (let n = 1; n <= activeNodes; n++) {
      const t = Math.min(expand, n / count);
      const pt = pointOnEffectPath(stroke.points, t);
      const isTip = n === count && expand > 0.82;
      // Limbs taper slightly in the middle and flare out wide at the 5 outer tips (matching 00:06!)
      const profileScale = isTip
        ? stroke.tipScale
        : 0.76 + Math.pow(t, 1.35) * 0.48;
      const puffR = baseStrokeW * 0.62 * profileScale;
      const jitterX = effectSignedUnit(frameSeed, 200 + sIdx * 20 + n) * baseStrokeW * 0.12;
      const jitterY = effectSignedUnit(frameSeed, 300 + sIdx * 20 + n) * baseStrokeW * 0.12;
      drawFireBlastFlamePuff(
        ctx,
        pt.x + jitterX,
        pt.y + jitterY,
        puffR,
        seed + sIdx * 101 + n * 13,
        frame,
        alpha
      );
    }
  }

  // 6. High-heat flying sparks & rising embers around the 「大」 brand
  const emberCount = 22;
  for (let i = 0; i < emberCount; i++) {
    const eAng = effectUnit(seed, 500 + i) * Math.PI * 2;
    const eDist = radius * (0.25 + effectUnit(seed, 540 + i) * 0.92) * expand;
    const rise = progress * radius * (0.18 + effectUnit(seed, 580 + i) * 0.25);
    const ex = originX + Math.cos(eAng) * eDist;
    const ey = originY + Math.sin(eAng) * eDist - rise;
    const er = 1.8 + effectUnit(seed, 620 + i) * 3.4;
    drawPixelBubble(
      ctx,
      ex,
      ey,
      er,
      i % 3 === 0 ? "#fff9c4" : i % 2 === 0 ? "#ffd000" : "#ff5400",
      alpha * (0.72 + effectUnit(frameSeed, 660 + i) * 0.28),
      true
    );
  }

  ctx.restore();
  return true;
}

/**
 * Twin high-pressure cannon jets (for Blastoise/dual-cannon users) or a massive
 * surging hydro torrent, with boiling cannon muzzle bursts, thick layered cyan/white
 * pressurized water columns, rushing foam rings, and an explosive target splash
 * (matching sample3.mp4 00:08-00:11 & 00:32-00:35).
 *
 * effect: { x1, y1, x2, y2, width, seed, life, maxLife, lanes?, streamOrigins?, alpha? }
 */
function drawHydroPumpStream(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;
  const seed = normalizeEffectSeed(effect.seed ?? "hydro-pump-stream");
  const width = effectClamp(Number(effect.width) || 44, 24, 74);
  const reveal = effectSmoothstep(0.015, 0.11, progress);
  const bodyFade = effectSmoothstep(0.015, 0.06, progress) * (1 - effectSmoothstep(0.85, 1, progress));
  const alpha = effectClamp01((effect.alpha ?? 1) * bodyFade);
  const frameAge = quantizeEffectTime(timing.age, 24);
  const endpoints = getEffectEndpoints(effect);
  const dx = endpoints.x2 - endpoints.x1;
  const dy = endpoints.y2 - endpoints.y1;
  const length = Math.hypot(dx, dy) || 1;
  const dirX = dx / length;
  const dirY = dy / length;
  const perpX = -dirY;
  const perpY = dirX;
  const suppliedOrigins = Array.isArray(effect.streamOrigins)
    ? effect.streamOrigins.filter(origin => Number.isFinite(Number(origin?.x)) && Number.isFinite(Number(origin?.y)))
    : [];
  const fallbackLaneCount = effectClamp(Math.round(Number(effect.lanes) || 2), 1, 2);
  const laneOrigins = suppliedOrigins.length
    ? suppliedOrigins.map(origin => ({ x: Number(origin.x), y: Number(origin.y) }))
    : Array.from({ length: fallbackLaneCount }, (_, lane) => {
        const offset = fallbackLaneCount === 1 ? 0 : (lane === 0 ? -1 : 1) * width * 0.28;
        return { x: endpoints.x1 + perpX * offset, y: endpoints.y1 + perpY * offset };
      });

  const avgOriginX = laneOrigins.reduce((s, o) => s + o.x, 0) / Math.max(1, laneOrigins.length);
  const avgOriginY = laneOrigins.reduce((s, o) => s + o.y, 0) / Math.max(1, laneOrigins.length);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  const anticipation = effectSmoothstep(0, 0.05, progress) * (1 - effectSmoothstep(0.14, 0.24, progress));
  const lanePaths = [];
  const isDual = laneOrigins.length > 1;
  const laneBaseWidth = isDual ? width * 0.78 : width * 1.05;

  for (let lane = 0; lane < laneOrigins.length; lane++) {
    const origin = laneOrigins[lane];
    // Preserve ~42% of the dual-cannon separation at the target end so Blastoise's
    // twin shoulder streams stay visibly distinct parallel/converging jets all the
    // way into the impact zone, just like sample3.mp4 (00:09-00:11 & 00:33-00:35).
    const relOx = origin.x - avgOriginX;
    const relOy = origin.y - avgOriginY;
    const laneSign = lane === 0 ? -1 : lane === 1 ? 1 : 0;
    const targetEndX = isDual
      ? endpoints.x2 + relOx * 0.36 + perpX * laneSign * width * 0.12
      : endpoints.x2;
    const targetEndY = isDual
      ? endpoints.y2 + relOy * 0.36 + perpY * laneSign * width * 0.12
      : endpoints.y2;

    const laneEffect = {
      ...effect,
      x1: origin.x,
      y1: origin.y,
      x2: targetEndX,
      y2: targetEndY,
      seed: normalizeEffectSeed(`${seed}:hydro-lane:${lane}`),
      curve: effectSignedUnit(seed, 30 + lane) * width * (isDual ? 0.22 : 0.16)
    };
    const lanePath = buildEffectStreamPath(laneEffect, frameAge, {
      amplitude: effectClamp(width * 0.09, 1.5, 5.5),
      cycles: 1.25 + lane * 0.17,
      speed: lane % 2 === 0 ? 5.8 : -5.4,
      salt: 17 + lane * 11,
      minSegments: 16,
      maxSegments: 32
    });
    lanePaths.push(lanePath);

    // Continuous pressurized cannon muzzle foam & starburst at each barrel mouth!
    const muzzlePower = Math.max(anticipation, alpha * 0.92);
    if (muzzlePower > 0) {
      drawPixelBubble(ctx, origin.x, origin.y, laneBaseWidth * 0.48, "#075799", muzzlePower * 0.88, false);
      drawPixelBubble(ctx, origin.x, origin.y, laneBaseWidth * 0.36, "#29b6f6", muzzlePower * 0.95, false);
      drawPixelBubble(ctx, origin.x, origin.y, laneBaseWidth * 0.24, "#ffffff", muzzlePower, false);
      ctx.globalAlpha = muzzlePower * 0.9;
      ctx.strokeStyle = "#d8f8ff";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, laneBaseWidth * (0.34 + ((frameAge * 4 + lane * 0.5) % 0.22)), 0, Math.PI * 2);
      ctx.stroke();
      drawEffectStar(
        ctx,
        origin.x,
        origin.y,
        laneBaseWidth * 0.52,
        laneBaseWidth * 0.14,
        6,
        "#ffffff",
        muzzlePower * 0.94,
        frameAge * 4.2 + lane
      );
    }

    const visibleLane = trimEffectPath(lanePath, reveal);
    // 5-layer high-pressure water column: deep navy border -> royal blue jacket ->
    // electric cyan body -> bright sky-aqua inner -> wide blazing white core!
    strokeEffectPath(ctx, visibleLane, "#053e7a", laneBaseWidth * 1.04, alpha * 0.96, "jet");
    strokeEffectPath(ctx, visibleLane, "#0962b5", laneBaseWidth * 0.84, alpha * 0.98, "jet");
    strokeEffectPath(ctx, visibleLane, effect.outerColor || "#1db4f5", laneBaseWidth * 0.64, alpha, "jet");
    strokeEffectPath(ctx, visibleLane, "#88edff", laneBaseWidth * 0.42, alpha, "jet");
    strokeEffectPath(ctx, visibleLane, effect.coreColor || "#ffffff", laneBaseWidth * 0.24, alpha, "jet");

    // Rushing high-pressure foam rings & water bolts surging along each cannon stream
    const surgeCount = 9;
    for (let dash = 0; dash < surgeCount; dash++) {
      const flowAlong = ((dash / surgeCount) + frameAge * 2.6) % 1;
      if (flowAlong > reveal) continue;
      const point = pointOnEffectPath(lanePath, flowAlong);
      const before = pointOnEffectPath(lanePath, Math.max(0, flowAlong - 0.03));
      const after = pointOnEffectPath(lanePath, Math.min(1, flowAlong + 0.03));
      const tangAngle = Math.atan2(after.y - before.y, after.x - before.x);
      const ringRadius = laneBaseWidth * (0.34 + (dash % 2) * 0.08);

      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(tangAngle);
      ctx.globalAlpha = alpha * 0.88;
      ctx.strokeStyle = dash % 2 === 0 ? "#ffffff" : "#b8f4ff";
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringRadius * 0.42, ringRadius, 0, -Math.PI * 0.65, Math.PI * 0.65);
      ctx.stroke();
      ctx.restore();

      const size = 2.2 + effectUnit(seed, 80 + lane * 9 + dash) * 2.4;
      drawPixelBubble(ctx, point.x, point.y, size, dash % 2 ? "#ffffff" : "#baf5ff", alpha * 0.92, true);
    }
  }

  // Boiling foam bubbles & spray droplets clustering around each physical cannon nozzle
  const launchPhase = effectSmoothstep(0.02, 0.12, progress) * (1 - effectSmoothstep(0.82, 0.98, progress));
  for (let lane = 0; lane < laneOrigins.length; lane++) {
    const origin = laneOrigins[lane];
    for (let i = 0; i < 8; i++) {
      const angle = effectUnit(seed, 140 + lane * 13 + i) * Math.PI * 2 + frameAge * (i % 2 ? 3 : -3);
      const distance = laneBaseWidth * (0.24 + effectUnit(seed, 170 + lane * 13 + i) * 0.56) * launchPhase;
      drawPixelBubble(
        ctx,
        origin.x + Math.cos(angle) * distance,
        origin.y + Math.sin(angle) * distance,
        1.8 + effectUnit(seed, 200 + lane * 13 + i) * 2.8,
        i % 3 === 0 ? "#ffffff" : i % 2 === 0 ? "#aef4ff" : "#38bdf8",
        alpha * launchPhase * 0.9,
        i % 2 === 0
      );
    }
  }

  // Massive high-pressure water explosion & spray at the stream head / target
  const sprayPhase = effectSmoothstep(0.12, 0.26, progress) * (1 - effectSmoothstep(0.82, 0.98, progress));
  if (lanePaths.length && reveal > 0.05) {
    const head = pointOnEffectPath(lanePaths[0], reveal);
    const angle = Math.atan2(endpoints.y2 - endpoints.y1, endpoints.x2 - endpoints.x1);
    const hasArrived = effectSmoothstep(0.65, 0.98, reveal);

    // Impact foam cloud around each lane head
    for (let lane = 0; lane < lanePaths.length; lane++) {
      const laneHead = pointOnEffectPath(lanePaths[lane], reveal);
      drawPixelBubble(ctx, laneHead.x, laneHead.y, laneBaseWidth * 0.52, "#0962b5", alpha * 0.85, false);
      drawPixelBubble(ctx, laneHead.x, laneHead.y, laneBaseWidth * 0.38, "#38bdf8", alpha * 0.92, false);
      drawPixelBubble(ctx, laneHead.x, laneHead.y, laneBaseWidth * 0.24, "#ffffff", alpha * 0.98, false);
    }

    for (let i = 0; i < 24; i++) {
      const side = effectSignedUnit(seed, 150 + i);
      const forward = effectSignedUnit(seed, 260 + i) * width * 0.82;
      const lateral = side * width * (0.38 + effectUnit(seed, 290 + i) * 1.28);
      const x = head.x + Math.cos(angle) * forward - Math.sin(angle) * lateral;
      const y = head.y + Math.sin(angle) * forward + Math.cos(angle) * lateral;
      const dropSize = 1.8 + effectUnit(seed, 320 + i) * 3.8;
      drawPixelBubble(
        ctx,
        x,
        y,
        dropSize,
        i % 4 === 0 ? "#ffffff" : i % 2 === 0 ? "#a5efff" : "#29b4e8",
        alpha * sprayPhase * (0.58 + effectUnit(seed, 350 + i) * 0.42),
        i % 3 !== 0
      );
    }
    if (hasArrived > 0) {
      const splashR = width * (0.88 + sprayPhase * 0.45);
      for (let p = 0; p < 7; p++) {
        const pAng = (p / 7) * Math.PI * 2 - frameAge * 3.5;
        const px = endpoints.x2 + Math.cos(pAng) * splashR * 0.42;
        const py = endpoints.y2 + Math.sin(pAng) * splashR * 0.42;
        drawPixelBubble(ctx, px, py, splashR * 0.36, p % 2 === 0 ? "#29b6f6" : "#a5f3fc", alpha * hasArrived * sprayPhase * 0.88, false);
      }
      drawEffectStar(ctx, endpoints.x2, endpoints.y2, width * 1.32, width * 0.30, 10, "#ffffff", alpha * hasArrived * sprayPhase * 0.96, frameAge * 3.0);
      drawEffectStar(ctx, endpoints.x2, endpoints.y2, width * 0.86, width * 0.24, 8, "#7ce8ff", alpha * hasArrived * sprayPhase * 0.9, -frameAge * 2.4);
      ctx.globalAlpha = alpha * hasArrived * sprayPhase * 0.9;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.arc(endpoints.x2, endpoints.y2, width * (0.62 + sprayPhase * 0.56), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * hasArrived * sprayPhase * 0.78;
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(endpoints.x2, endpoints.y2, width * (0.92 + sprayPhase * 0.68), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
  return true;
}

/**
 * Multi-layered crystalline Ice Beam renderer with spinning cryo muzzle star,
 * wide glacial beam core, twin interlocking frost lightning threads, faceted
 * ice crystal shards along the beam, and a shattering glacier impact burst
 * (matching sample1.mp4 00:42-00:43 & 01:05).
 *
 * effect: { x1, y1, x2, y2, width, seed, life, maxLife, alpha? }
 */
function drawIceBeamStream(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;
  const seed = normalizeEffectSeed(effect.seed ?? "ice-beam-stream");
  const width = effectClamp(Number(effect.width) || 34, 20, 64);
  const reveal = effectSmoothstep(0.015, 0.14, progress);
  const bodyFade = effectSmoothstep(0.01, 0.06, progress) * (1 - effectSmoothstep(0.82, 1, progress));
  const alpha = effectClamp01((effect.alpha ?? 1) * bodyFade);
  const frameAge = quantizeEffectTime(timing.age, 22);
  const endpoints = getEffectEndpoints(effect);
  const dx = endpoints.x2 - endpoints.x1;
  const dy = endpoints.y2 - endpoints.y1;
  const distance = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);
  const perpX = -dy / distance;
  const perpY = dx / distance;

  const mainPath = buildEffectStreamPath(effect, frameAge, {
    amplitude: effectClamp(width * 0.08, 1.5, 4.5),
    cycles: 1.6,
    speed: 5.2,
    salt: 23,
    minSegments: 16,
    maxSegments: 30
  });
  const visiblePath = trimEffectPath(mainPath, reveal);
  const head = pointOnEffectPath(mainPath, reveal);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // 1. Crystalline emitter frost halo & 8-pointed cryo star at origin
  drawPixelBubble(ctx, endpoints.x1, endpoints.y1, width * 0.44, "#0284c7", alpha * 0.82, false);
  drawPixelBubble(ctx, endpoints.x1, endpoints.y1, width * 0.30, "#7dd3fc", alpha * 0.94, false);
  drawEffectStar(ctx, endpoints.x1, endpoints.y1, width * 0.68, width * 0.18, 8, "#ffffff", alpha * 0.96, frameAge * 3.4);

  // 2. Multi-layered cryo beam shaft
  strokeEffectPath(ctx, visiblePath, "#0369a1", width * 1.05, alpha * 0.92, "jet");
  strokeEffectPath(ctx, visiblePath, "#0ea5e9", width * 0.80, alpha * 0.96, "jet");
  strokeEffectPath(ctx, visiblePath, "#67e8f9", width * 0.56, alpha, "jet");
  strokeEffectPath(ctx, visiblePath, "#e0f2fe", width * 0.36, alpha, "jet");
  strokeEffectPath(ctx, visiblePath, "#ffffff", width * 0.18, alpha, "jet");

  // 3. Twin interlocking jagged crystalline frost arcs along the beam
  const celSeed = normalizeEffectSeed(`${seed}:ice-cel:${Math.floor(frameAge * 18)}`);
  for (let strand = 0; strand < 2; strand++) {
    const strandPath = buildDeterministicLightningPath(
      {
        ...effect,
        x2: head.x,
        y2: head.y,
        seed: celSeed + strand * 19
      },
      width * (strand === 0 ? 0.38 : 0.26),
      31 + strand * 13
    );
    strokeEffectPath(ctx, strandPath, strand === 0 ? "#38bdf8" : "#bae6fd", width * 0.24, alpha * 0.92, "even");
    strokeEffectPath(ctx, strandPath, "#ffffff", width * 0.11, alpha * 0.98, "even");
  }

  // 4. Chunky faceted ice crystal shards & glacier spikes formed along the beam path (sample1.mp4 00:42-00:43 & 01:05)
  const crystalCount = 14;
  const visibleCrystals = Math.max(1, Math.ceil(crystalCount * reveal));
  for (let i = 0; i < visibleCrystals; i++) {
    const along = crystalCount <= 1 ? 0 : (i / (crystalCount - 1)) * reveal;
    const pt = pointOnEffectPath(mainPath, along);
    const side = i % 2 === 0 ? 1 : -1;
    const offset = side * width * (0.14 + effectUnit(seed, 60 + i) * 0.28);
    const cx = pt.x + perpX * offset;
    const cy = pt.y + perpY * offset;
    const shardLen = width * (0.36 + effectUnit(seed, 90 + i) * 0.32);
    const shardW = shardLen * 0.44;
    const shardAng = angle + side * (0.28 + effectUnit(seed, 120 + i) * 0.38);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(shardAng);
    ctx.globalAlpha = alpha * 0.94;
    ctx.fillStyle = "#0284c7";
    ctx.beginPath();
    ctx.moveTo(-shardLen * 0.45, 0);
    ctx.lineTo(0, -shardW);
    ctx.lineTo(shardLen * 0.65, 0);
    ctx.lineTo(0, shardW);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = i % 2 === 0 ? "#bae6fd" : "#67e8f9";
    ctx.beginPath();
    ctx.moveTo(-shardLen * 0.32, 0);
    ctx.lineTo(0, -shardW * 0.68);
    ctx.lineTo(shardLen * 0.52, 0);
    ctx.lineTo(0, shardW * 0.68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(-shardLen * 0.16, 0);
    ctx.lineTo(shardLen * 0.36, -shardW * 0.24);
    ctx.lineTo(shardLen * 0.42, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 5. Shattering glacier burst & radiating ice spikes at impact head
  const impactArrival = effectSmoothstep(0.45, 0.95, reveal);
  if (impactArrival > 0) {
    const spikeCount = 8;
    const burstR = width * (0.85 + impactArrival * 0.48);
    for (let s = 0; s < spikeCount; s++) {
      const sAng = (s / spikeCount) * Math.PI * 2 + effectSignedUnit(seed, 200 + s) * 0.15;
      const len = burstR * (0.68 + (s % 2) * 0.32);
      const w = width * 0.22;
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(sAng);
      ctx.globalAlpha = alpha * impactArrival * 0.92;
      ctx.fillStyle = "#0ea5e9";
      ctx.beginPath();
      ctx.moveTo(0, -w);
      ctx.lineTo(len, 0);
      ctx.lineTo(0, w);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.55);
      ctx.lineTo(len * 0.82, 0);
      ctx.lineTo(0, w * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    drawEffectStar(ctx, head.x, head.y, burstR * 1.05, burstR * 0.24, 8, "#ffffff", alpha * impactArrival * 0.98, frameAge * 2.8);
    ctx.globalAlpha = alpha * impactArrival * 0.86;
    ctx.strokeStyle = "#a5f3fc";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, burstR * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
  return true;
}

/**
 * Colossal multi-layered Hyper Beam / Solar Beam renderer with giant glowing
 * muzzle energy orb, thick outer/inner beam column, shockwave rings, and
 * massive target impact explosion (matching sample1.mp4 01:03 & 01:06).
 */
function drawHyperBeamStream(ctx, effect, time = 0, outerCol = "#f97316", innerCol = "#fef08a") {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;
  const width = effectClamp(Number(effect.width) || 44, 28, 82);
  const reveal = effectSmoothstep(0.01, 0.12, progress);
  const bodyFade = effectSmoothstep(0.01, 0.05, progress) * (1 - effectSmoothstep(0.84, 1, progress));
  const alpha = effectClamp01((effect.alpha ?? 1) * bodyFade);
  const frameAge = quantizeEffectTime(timing.age, 24);
  const endpoints = getEffectEndpoints(effect);
  const headX = endpoints.x1 + (endpoints.x2 - endpoints.x1) * reveal;
  const headY = endpoints.y1 + (endpoints.y2 - endpoints.y1) * reveal;
  const isGrass = String(effect.elementType || "").toLowerCase() === "grass";
  const borderCol = isGrass ? "#15803d" : "#c2410c";
  const mainCol = isGrass ? "#4ade80" : outerCol;
  const midCol = isGrass ? "#bef264" : innerCol;

  ctx.save();
  ctx.lineCap = "round";

  // 1. Colossal 4-layer beam column
  ctx.globalAlpha = alpha * 0.92;
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = width * 1.28;
  ctx.beginPath();
  ctx.moveTo(endpoints.x1, endpoints.y1);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.98;
  ctx.strokeStyle = mainCol;
  ctx.lineWidth = width * 0.96;
  ctx.beginPath();
  ctx.moveTo(endpoints.x1, endpoints.y1);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = midCol;
  ctx.lineWidth = width * 0.62;
  ctx.beginPath();
  ctx.moveTo(endpoints.x1, endpoints.y1);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = width * 0.30;
  ctx.beginPath();
  ctx.moveTo(endpoints.x1, endpoints.y1);
  ctx.lineTo(headX, headY);
  ctx.stroke();

  // 2. Giant glowing muzzle orb & impact explosion orb (sample1.mp4 01:03 & 01:06)
  drawPixelBubble(ctx, endpoints.x1, endpoints.y1, width * 0.64, mainCol, alpha * 0.92, false);
  drawPixelBubble(ctx, endpoints.x1, endpoints.y1, width * 0.46, midCol, alpha * 0.98, false);
  drawPixelBubble(ctx, endpoints.x1, endpoints.y1, width * 0.28, "#ffffff", alpha, false);
  drawEffectStar(ctx, endpoints.x1, endpoints.y1, width * 0.86, width * 0.22, 10, "#ffffff", alpha * 0.94, frameAge * 4.0);

  drawPixelBubble(ctx, headX, headY, width * 0.78, borderCol, alpha * 0.88, false);
  drawPixelBubble(ctx, headX, headY, width * 0.62, mainCol, alpha * 0.96, false);
  drawPixelBubble(ctx, headX, headY, width * 0.44, midCol, alpha, false);
  drawPixelBubble(ctx, headX, headY, width * 0.26, "#ffffff", alpha, false);
  drawEffectStar(ctx, headX, headY, width * 1.18, width * 0.28, 12, "#ffffff", alpha * 0.98, -frameAge * 3.8);

  ctx.restore();
  return true;
}

/**
 * Shared deterministic renderer for Thunder Shock, Thunderbolt and Thunder.
 * Recommended lifetimes: shock 0.25-0.4s, bolt 0.5-0.8s, thunder 0.7-0.9s.
 *
 * effect: { kind|variant, x1, y1, x2, y2, width, seed, life, maxLife, alpha? }
 */
function drawElectricMove(ctx, effect, time = 0) {
  if (!ctx || !effect) return false;
  const timing = getEffectTiming(effect, time);
  const progress = timing.progress;
  if (progress >= 1) return false;
  const identity = String(effect.variant || effect.moveKind || effect.kind || "thunderbolt").toLowerCase();
  const variant = identity.includes("shock")
    ? "shock"
    : identity.includes("bolt")
      ? "bolt"
      : "thunder";
  const seed = normalizeEffectSeed(effect.seed ?? `${variant}-electric`);
  const defaults = variant === "shock"
    ? { width: 5, jaggedness: 7, branches: 2, fps: 24 }
    : variant === "bolt"
      ? { width: 8, jaggedness: 13, branches: 5, fps: 18 }
      : { width: 11, jaggedness: 19, branches: 7, fps: 14 };
  const width = effectClamp(Number(effect.width) || defaults.width, 3, 18);
  const reveal = effectSmoothstep(0.07, variant === "shock" ? 0.32 : 0.28, progress);
  const bodyFade = effectSmoothstep(0.045, 0.13, progress) * (1 - effectSmoothstep(variant === "shock" ? 0.62 : 0.78, 1, progress));
  // Electricity redraws in stepped animation cels. The frame number enters the
  // seed, so the bolt visibly snaps to a new silhouette yet remains perfectly
  // deterministic whenever the same age is rendered again.
  const frame = Math.max(0, Math.floor(timing.age * defaults.fps));
  const frameSeed = normalizeEffectSeed(`${seed}:electric-frame:${frame}`);
  const pulse = frame % 3 === 0 ? 1 : frame % 3 === 1 ? 0.86 : 0.94;
  const alpha = effectClamp01((effect.alpha ?? 1) * bodyFade * pulse);
  const endpoints = getEffectEndpoints(effect);
  const animatedEffect = { ...effect, seed: frameSeed };
  const mainPath = buildDeterministicLightningPath(animatedEffect, defaults.jaggedness, 7);
  let primaryPath = mainPath;
  if (variant === "bolt") {
    // The reference cuts from a source charge to electricity erupting around
    // the victim; it does not hold a laser-like cable across the whole arena.
    const dx = endpoints.x2 - endpoints.x1;
    const dy = endpoints.y2 - endpoints.y1;
    const distance = Math.hypot(dx, dy) || 1;
    const localLength = Math.min(distance * 0.24, width * 8.5);
    const localEffect = {
      ...animatedEffect,
      x1: endpoints.x2 - (dx / distance) * localLength,
      y1: endpoints.y2 - (dy / distance) * localLength,
      x2: endpoints.x2,
      y2: endpoints.y2,
      seed: normalizeEffectSeed(`${frameSeed}:target-burst`)
    };
    primaryPath = buildDeterministicLightningPath(localEffect, defaults.jaggedness * 1.15, 47);
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // Thunder warns at the landing point; the two directed variants gather at
  // the user. These local omens replace a distracting full-screen flash.
  const anticipation = effectSmoothstep(0, 0.05, progress) * (1 - effectSmoothstep(0.13, 0.22, progress));
  if (anticipation > 0) {
    const omenX = variant === "thunder" ? endpoints.x2 : endpoints.x1;
    const omenY = variant === "thunder" ? endpoints.y2 : endpoints.y1;
    ctx.globalAlpha = anticipation * 0.88 * (effect.alpha ?? 1);
    ctx.strokeStyle = variant === "shock" ? "#94ecff" : "#ffe85a";
    ctx.lineWidth = variant === "thunder" ? 3 : 2;
    ctx.beginPath();
    ctx.arc(omenX, omenY, width * (0.9 + anticipation * (variant === "thunder" ? 1.4 : 0.55)), 0, Math.PI * 2);
    ctx.stroke();
  }

  if (variant === "bolt") {
    const chargePhase = effectSmoothstep(0.03, 0.11, progress) * (1 - effectSmoothstep(0.22, 0.34, progress));
    if (chargePhase > 0) {
      drawEffectStar(ctx, endpoints.x1, endpoints.y1, width * 2.25, width * 0.34, 10, "#fffdf0", chargePhase, frame * 0.37);
      drawEffectStar(ctx, endpoints.x1, endpoints.y1, width * 1.45, width * 0.42, 7, "#ffe329", chargePhase * 0.86, -frame * 0.29);
    }
  }

  const drawLayeredBolt = (path, scale = 1, localAlpha = alpha) => {
    const visible = trimEffectPath(path, reveal);
    if (variant === "shock") {
      strokeEffectPath(ctx, visible, "#1479b8", width * 1.05 * scale, localAlpha * 0.9, "taper");
      strokeEffectPath(ctx, visible, "#58d8ff", width * 0.64 * scale, localAlpha, "taper");
      strokeEffectPath(ctx, visible, "#efffff", Math.max(1.1, width * 0.23 * scale), localAlpha, "taper");
    } else {
      strokeEffectPath(ctx, visible, "#9e7600", width * 1.16 * scale, localAlpha * 0.88, "taper");
      strokeEffectPath(ctx, visible, "#f2cf16", width * 0.76 * scale, localAlpha, "taper");
      strokeEffectPath(ctx, visible, "#fff36a", width * 0.48 * scale, localAlpha, "taper");
      strokeEffectPath(ctx, visible, "#fffef1", Math.max(1.3, width * 0.2 * scale), localAlpha, "taper");
    }
  };

  if (variant === "thunder") {
    // Three overhead trunks converge on the target, forming the large forked
    // crown visible in the reference Thunder animation.
    const topSpan = width * 4.2;
    for (let trunk = -1; trunk <= 1; trunk++) {
      const trunkEffect = {
        ...animatedEffect,
        x1: endpoints.x1 + trunk * topSpan,
        y1: endpoints.y1 - Math.abs(trunk) * width * 1.8,
        x2: endpoints.x2,
        y2: endpoints.y2,
        seed: normalizeEffectSeed(`${frameSeed}:thunder-trunk:${trunk}`)
      };
      const trunkPath = buildDeterministicLightningPath(trunkEffect, defaults.jaggedness * (trunk === 0 ? 1 : 0.72), 80 + trunk);
      drawLayeredBolt(trunkPath, trunk === 0 ? 1.12 : 0.56, alpha * (trunk === 0 ? 1 : 0.82));
    }
  } else {
    drawLayeredBolt(primaryPath, variant === "bolt" ? 1.06 : 0.86);
  }

  // Branch density is the clearest gameplay distinction: two tiny cyan forks
  // for Shock, five yellow forks for Thunderbolt and a seven-fork crown for
  // Thunder. Each branch also changes on the quantized animation frame.
  for (let branch = 0; branch < defaults.branches; branch++) {
    const attachAmount = 0.24 + branch * (0.58 / Math.max(1, defaults.branches - 1));
    if (reveal <= attachAmount) continue;
    const branchBasePath = variant === "bolt" ? primaryPath : mainPath;
    const origin = pointOnEffectPath(branchBasePath, attachAmount);
    const before = pointOnEffectPath(branchBasePath, Math.max(0, attachAmount - 0.045));
    const after = pointOnEffectPath(branchBasePath, Math.min(1, attachAmount + 0.045));
    const tangentX = after.x - before.x;
    const tangentY = after.y - before.y;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const side = effectUnit(frameSeed, 310 + branch) > 0.5 ? 1 : -1;
    const branchLength = width * (
      variant === "shock"
        ? 2.2 + effectUnit(frameSeed, 330 + branch) * 1.2
        : variant === "bolt"
          ? 3.5 + effectUnit(frameSeed, 330 + branch) * 2.8
          : 4.8 + effectUnit(frameSeed, 330 + branch) * 4.2
    );
    const forwardX = tangentX / tangentLength;
    const forwardY = tangentY / tangentLength;
    const sideX = -forwardY * side;
    const sideY = forwardX * side;
    const branchEnd = {
      x: origin.x + forwardX * branchLength * 0.22 + sideX * branchLength,
      y: origin.y + forwardY * branchLength * 0.22 + sideY * branchLength
    };
    const branchMid = {
      x: origin.x + (branchEnd.x - origin.x) * 0.52 + sideX * effectSignedUnit(frameSeed, 360 + branch) * width,
      y: origin.y + (branchEnd.y - origin.y) * 0.52 + sideY * effectSignedUnit(frameSeed, 360 + branch) * width
    };
    const branchReveal = effectClamp01((reveal - attachAmount) / Math.max(0.01, 1 - attachAmount));
    const branchPath = trimEffectPath([origin, branchMid, branchEnd], branchReveal);
    const branchOuter = variant === "shock" ? "#39c7f4" : "#e1b900";
    const branchCore = variant === "shock" ? "#efffff" : "#fffde3";
    strokeEffectPath(ctx, branchPath, branchOuter, width * (variant === "thunder" ? 0.46 : 0.34), alpha * 0.9, "taper");
    strokeEffectPath(ctx, branchPath, branchCore, Math.max(0.8, width * 0.12), alpha, "taper");
  }

  const impactPhase = effectSmoothstep(0.25, 0.36, progress) * (1 - effectSmoothstep(0.72, 0.98, progress));
  if (impactPhase > 0) {
    const starRadius = width * (variant === "shock" ? 1.55 : variant === "bolt" ? 2.6 : 4.1);
    if (variant !== "shock") {
      ctx.save();
      ctx.translate(endpoints.x2, endpoints.y2);
      ctx.scale(1, 0.62);
      const groundCount = variant === "thunder" ? 8 : 5;
      for (let crack = 0; crack < groundCount; crack++) {
        const angle = (crack / groundCount) * Math.PI * 2 + effectSignedUnit(frameSeed, 430 + crack) * 0.22;
        const branchLength = width * (variant === "thunder" ? 5.5 : 3.8) * (0.7 + effectUnit(frameSeed, 460 + crack) * 0.48);
        const kink = effectSignedUnit(frameSeed, 490 + crack) * width * 0.8;
        const points = [
          { x: 0, y: 0 },
          {
            x: Math.cos(angle) * branchLength * 0.48 - Math.sin(angle) * kink,
            y: Math.sin(angle) * branchLength * 0.48 + Math.cos(angle) * kink
          },
          { x: Math.cos(angle) * branchLength, y: Math.sin(angle) * branchLength }
        ];
        strokeEffectPath(ctx, points, "#c99500", Math.max(1.2, width * 0.3), alpha * impactPhase * 0.72, "taper");
        strokeEffectPath(ctx, points, "#fff36a", Math.max(0.8, width * 0.13), alpha * impactPhase, "taper");
      }
      ctx.restore();
    }

    const starColor = variant === "shock" ? "#efffff" : "#ffffff";
    drawEffectStar(ctx, endpoints.x2, endpoints.y2, starRadius, starRadius * 0.13, variant === "shock" ? 7 : 12, starColor, alpha * impactPhase, frame * 0.41);
    drawEffectStar(
      ctx,
      endpoints.x2,
      endpoints.y2,
      starRadius * 0.58,
      starRadius * 0.2,
      variant === "shock" ? 5 : 8,
      variant === "shock" ? "#63ddff" : "#ffe33d",
      alpha * impactPhase * 0.88,
      -frame * 0.29
    );

    const sparkCount = variant === "shock" ? 4 : variant === "bolt" ? 8 : 12;
    for (let i = 0; i < sparkCount; i++) {
      const angle = effectUnit(frameSeed, 540 + i) * Math.PI * 2;
      const distance = starRadius * (0.75 + effectUnit(frameSeed, 570 + i) * 1.1) * impactPhase;
      drawPixelBubble(
        ctx,
        endpoints.x2 + Math.cos(angle) * distance,
        endpoints.y2 + Math.sin(angle) * distance,
        1 + effectUnit(frameSeed, 600 + i) * (variant === "thunder" ? 2.8 : 1.8),
        variant === "shock" ? (i % 2 ? "#ffffff" : "#3bcaf5") : (i % 2 ? "#fffbd0" : "#ffd51f"),
        alpha * impactPhase,
        true
      );
    }
  }

  ctx.restore();
  return true;
}
