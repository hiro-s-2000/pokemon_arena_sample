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

// Draw jagged lightning bolt between two points
function drawLightningBolt(ctx, x1, y1, x2, y2, color = "#fff04d", width = 4, jaggedness = 22) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(5, Math.floor(dist / 22));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const bx = x1 + (x2 - x1) * t + (Math.random() - 0.5) * jaggedness;
    const by = y1 + (y2 - y1) * t + (Math.random() - 0.5) * jaggedness;
    ctx.lineTo(bx, by);
  }
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// Draw towering water whirlpool tornado (like Gyarados in sample1.mp4 00:56-01:01)
function drawWhirlpoolTornado(ctx, x, y, radius, height, time, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // Base swirling water rings on the pool surface
  for (let i = 0; i < 5; i++) {
    const r = radius * (0.55 + i * 0.25 + Math.sin(time * 8 + i) * 0.05);
    ctx.strokeStyle = i % 2 === 0 ? "#dcf4ff" : "#39a9ff";
    ctx.lineWidth = 4 - i * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.52, time * 3 + i, 0, Math.PI * 1.65);
    ctx.stroke();
  }

  // Towering cyclone column stacked from bottom to top
  const slices = 22;
  for (let s = 0; s <= slices; s++) {
    const frac = s / slices;
    const sy = y - frac * height;
    const funnelR = radius * (0.34 + Math.pow(frac, 1.35) * 0.78);
    const wobble = Math.sin(time * 12 + frac * 7) * 6;
    const cx = x + wobble;

    // Outer water wall
    ctx.fillStyle = s % 2 === 0 ? "rgba(56, 178, 255, 0.78)" : "rgba(186, 234, 255, 0.85)";
    ctx.beginPath();
    ctx.ellipse(cx, sy, funnelR, funnelR * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp spiral foam band
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const startAng = (time * 9 + s * 0.7) % (Math.PI * 2);
    ctx.ellipse(cx, sy, funnelR * 1.03, funnelR * 0.38, 0, startAng, startAng + Math.PI * 1.15);
    ctx.stroke();
  }

  // Top vortex eye (like sample1.mp4 00:59)
  const topY = y - height;
  const topWobble = Math.sin(time * 12 + 7) * 6;
  const topR = radius * 1.12;
  ctx.fillStyle = "#1d74c6";
  ctx.beginPath();
  ctx.ellipse(x + topWobble, topY, topR, topR * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#e0f7ff";
  ctx.lineWidth = 3.5;
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    ctx.ellipse(
      x + topWobble,
      topY,
      topR * (k / 3.2),
      topR * 0.42 * (k / 3.2),
      time * 6,
      0,
      Math.PI * 1.5
    );
    ctx.stroke();
  }

  ctx.restore();
}

// Draw Surf Giant Wave (like Lapras in sample1.mp4 00:50)
function drawSurfWave(ctx, x, y, dirX, dirY, radius, time, alpha = 1) {
  const angle = Math.atan2(dirY, dirX);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Deep wave body crescent
  ctx.fillStyle = "rgba(25, 128, 232, 0.85)";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.65, radius * 1.35, 0, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.fill();

  // Mid cyan crest
  ctx.fillStyle = "rgba(92, 198, 255, 0.92)";
  ctx.beginPath();
  ctx.ellipse(10, 0, radius * 0.52, radius * 1.25, 0, -Math.PI * 0.52, Math.PI * 0.52);
  ctx.fill();

  // Foamy white leading edge
  ctx.fillStyle = "#ffffff";
  for (let i = -8; i <= 8; i++) {
    const t = i / 8;
    const fy = t * radius * 1.15;
    const fx = Math.cos(t * Math.PI * 0.5) * radius * 0.52 + Math.sin(time * 18 + i) * 4;
    const r = 10 + (1 - Math.abs(t)) * 10;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
