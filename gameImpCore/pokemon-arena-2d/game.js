// Pokémon Arena 2D - Main Engine (Grass Stadium, Field Change Cutscene, Water Arena & Battle Royale)

const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");

let W = (canvas.width = window.innerWidth);
let H = (canvas.height = window.innerHeight);

window.addEventListener("resize", () => {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  buildArenaGeometry();
});

// Preload sprite images from pokesprite (with hidden DOM keepalive so animated GIFs advance frames)
const IMG_CACHE = {};
let gifKeepaliveBox = null;
function getSprite(src) {
  if (!src) return null;
  if (!IMG_CACHE[src]) {
    const img = new Image();
    img.src = src;
    if (src.endsWith(".gif") && typeof document !== "undefined" && document.body) {
      if (!gifKeepaliveBox) {
        gifKeepaliveBox = document.createElement("div");
        gifKeepaliveBox.style.cssText =
          "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;overflow:hidden;z-index:-1;";
        document.body.appendChild(gifKeepaliveBox);
      }
      if (gifKeepaliveBox.childElementCount < 60) {
        img.style.cssText = "width:1px;height:1px;";
        gifKeepaliveBox.appendChild(img);
      }
    }
    IMG_CACHE[src] = img;
  }
  return IMG_CACHE[src];
}

// Preload featured roster sprites (the 1,010 ../sprites/ Pokémon load on demand)
Object.values(POKEMON_DATA).forEach(p => {
  if (p.isFeatured) {
    getSprite(p.sprite);
    if (p.backSprite) getSprite(p.backSprite);
  }
});
if (POKEMON_DATA.nidorina) getSprite(POKEMON_DATA.nidorina.sprite);
getSprite(BALL_ICON_SRC);

// Game State
const state = {
  time: 0,
  fieldType: "water", // "grass" or "water"
  fieldTransition: {
    active: false,
    phase: 0, // 0: split grass, 1: fill water
    progress: 0,
    targetField: "water"
  },
  battleRoyale: false,
  cameraShake: 0,
  tickerOffset: 0,
  subtitleTimer: 0,
  koTimer: 0,
  clash: { active: false, x: 0, y: 0, timer: 0, f1: null, f2: null },
  platforms: [],
  iceFloes: [],
  ripples: [],
  particles: [],
  projectiles: [],
  beams: [],
  waves: [],
  whirlpools: [],
  recallLasers: [],
  crowd: [],
  fighters: [],
  p1Team: ["charizard", "pikachu", "lapras"],
  p2Team: ["seaking", "gengar", "gyarados"],
  p1Index: 0,
  p2Index: 0
};

// Input state
const keys = {};
const mouse = { x: W * 0.65, y: H * 0.5 };

window.addEventListener("keydown", e => {
  if (e.target && e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (e.code === "Space") {
    e.preventDefault();
    triggerPlayerSkill(2);
  } else if (k === "z" || k === "1") {
    triggerPlayerSkill(0);
  } else if (k === "x" || k === "2") {
    triggerPlayerSkill(1);
  } else if (k === "q" || k === "3") {
    triggerPlayerSkill(3);
  } else if (k === "e" || k === "4") {
    triggerPlayerSkill(4);
  } else if (k === "r") {
    recallAndSwapPlayer();
  } else if (k === "f") {
    startFieldChange();
  } else if (k === "m") {
    toggleMegaEvolution(e.shiftKey ? 2 : 1);
  } else if (k === "g") {
    toggleGigantamax(e.shiftKey ? 2 : 1);
  } else if (k === "b") {
    startBattleRoyaleScene();
  }
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

canvas.addEventListener("mousedown", e => {
  if (e.button === 0) triggerPlayerSkill(0);
  if (e.button === 2) triggerPlayerSkill(1);
});

canvas.addEventListener("contextmenu", e => e.preventDefault());

// Stadium bounds & floating platforms
let bounds = { left: 110, right: W - 110, top: 88, bottom: H - 72 };

function buildArenaGeometry() {
  bounds = {
    left: Math.max(96, Math.floor(W * 0.085)),
    right: Math.min(W - 96, Math.floor(W * 0.915)),
    top: 86,
    bottom: H - 74
  };
  const cx = (bounds.left + bounds.right) * 0.5;
  const cy = (bounds.top + bounds.bottom) * 0.5;
  const fw = bounds.right - bounds.left;
  const fh = bounds.bottom - bounds.top;

  // Water Field Platforms (matches sample1.mp4 & sample2.mp4 layout!)
  state.platforms = [
    // Left Pokéball platform
    { x: bounds.left + fw * 0.14, y: cy + fh * 0.04, r: 62, kind: "pokeball", tiltX: 0, tiltY: 0 },
    // Right Pokéball platform
    { x: bounds.right - fw * 0.14, y: cy + fh * 0.04, r: 62, kind: "pokeball", tiltX: 0, tiltY: 0 },
    // Center tall wooden stage ("BIG KID NATION / POKEMON ARENA")
    { x: cx, y: cy + fh * 0.02, r: 68, kind: "center_stage", height: 22, tiltX: 0, tiltY: 0 },
    // Upper-left wooden platform
    { x: cx - fw * 0.19, y: cy - fh * 0.18, r: 50, kind: "wood", height: 12, tiltX: 0, tiltY: 0 },
    // Lower-right wooden platform
    { x: cx + fw * 0.13, y: cy + fh * 0.22, r: 46, kind: "wood", height: 12, tiltX: 0, tiltY: 0 },
    // Upper-right wooden platform
    { x: cx + fw * 0.22, y: cy - fh * 0.14, r: 44, kind: "wood", height: 12, tiltX: 0, tiltY: 0 },
    // Lower-left wooden platform
    { x: cx - fw * 0.24, y: cy + fh * 0.24, r: 44, kind: "wood", height: 12, tiltX: 0, tiltY: 0 }
  ];

  // Generate stadium crowd in the stands
  state.crowd = [];
  const cols = Math.floor(W / 24);
  for (let i = 0; i < cols; i++) {
    state.crowd.push({
      x: i * 24 + 12,
      y: 26 + (i % 2) * 14,
      color: `hsl(${(i * 47) % 360}, 75%, 60%)`,
      sprite: i % 5 === 0 ? CROWD_SPRITES[i % CROWD_SPRITES.length] : null,
      phase: i * 0.6
    });
    state.crowd.push({
      x: i * 24 + 12,
      y: H - 26 - (i % 2) * 14,
      color: `hsl(${(i * 73 + 120) % 360}, 75%, 60%)`,
      sprite: i % 6 === 0 ? CROWD_SPRITES[(i + 3) % CROWD_SPRITES.length] : null,
      phase: i * 0.8
    });
  }
}

function createFighter(pokeId, team, x, y, isPlayer = false) {
  const base = POKEMON_DATA[pokeId] || POKEMON_DATA.charizard;
  getSprite(base.sprite);
  if (base.backSprite) getSprite(base.backSprite);
  return {
    id: base.id,
    data: base,
    name: base.name,
    sprite: base.sprite,
    backSprite: base.backSprite,
    team,
    isPlayer,
    x,
    y,
    z: 0,
    vz: 0,
    vx: 0,
    vy: 0,
    facing: team === 1 ? 1 : -1,
    hp: base.hp,
    maxHp: base.hp,
    energy: 50,
    maxEnergy: 100,
    cooldowns: [0, 0, 0, 0, 0],
    sleepTimer: 0,
    frozenTimer: 0,
    invulnTimer: 0,
    trappedInWhirlpool: null,
    activeMoveTimer: 0,
    activeMoveName: "",
    dashTimer: 0,
    dashVx: 0,
    dashVy: 0,
    megaMode: 0,
    gmaxMode: 0,
    ko: false,
    aiTimer: 0.4
  };
}

function showSubtitle(text, duration = 2.8) {
  const el = document.getElementById("subtitle-banner");
  el.textContent = text;
  el.classList.add("visible");
  state.subtitleTimer = duration;
}

function showKO(text) {
  const koEl = document.getElementById("ko-overlay");
  koEl.classList.add("show");
  state.koTimer = 2.1;
  SOUND.sfx("ko");
  if (text) showSubtitle(text, 2.8);
}

function showMoveCallout(team, moveName) {
  const id = team === 1 ? "p1-move-callout" : "p2-move-callout";
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = moveName + "!";
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 1150);
}

// Build Skill Bar HUD for P1
function renderSkillBar(fighter) {
  const container = document.getElementById("skill-slots-container");
  if (!fighter) return;
  container.innerHTML = "";
  fighter.data.moves.forEach((m, idx) => {
    const slot = document.createElement("div");
    slot.className = "skill-slot ready";
    slot.id = `skill-slot-${idx}`;
    slot.onclick = () => triggerPlayerSkill(idx);

    const energyStr = m.energy > 0 ? `+${m.energy}` : m.energy < 0 ? `${Math.abs(m.energy)}` : "";
    const energyClass = m.energy > 0 ? "gain" : "cost";

    slot.innerHTML = `
      <div class="skill-top-row">
        <span class="key-badge">${m.key}</span>
        <span class="energy-tag ${energyClass}" id="skill-cd-${idx}">${energyStr}</span>
      </div>
      <div class="skill-name">${m.name}</div>
    `;
    container.appendChild(slot);
  });
}

function updateHUD() {
  const p1 = state.fighters.find(f => f.team === 1);
  const p2 = state.fighters.find(f => f.team === 2);

  if (p1) {
    const p1NameEl = document.getElementById("p1-name");
    p1NameEl.textContent = p1.name;
    p1NameEl.classList.toggle("mega-name-x", p1.megaMode === 1);
    p1NameEl.classList.toggle("mega-name-y", p1.megaMode >= 2);
    p1NameEl.classList.toggle("gmax-name", p1.gmaxMode > 0);

    document.getElementById("p1-hp-text").textContent = Math.max(0, Math.ceil(p1.hp));
    document.getElementById("p1-portrait").src = p1.sprite;
    const hpPct = Math.max(0, (p1.hp / p1.maxHp) * 100);
    const bar = document.getElementById("p1-hp-bar");
    bar.style.width = hpPct + "%";
    bar.style.background =
      hpPct > 50
        ? "linear-gradient(180deg, #5ef26e 0%, #2dc940 60%, #1e962d 100%)"
        : hpPct > 22
        ? "linear-gradient(180deg, #fde047 0%, #eab308 100%)"
        : "linear-gradient(180deg, #f87171 0%, #dc2626 100%)";
    document.getElementById("p1-en-bar").style.width = Math.min(100, p1.energy) + "%";
    document.getElementById("skill-stamina-fill").style.width = Math.min(100, p1.energy) + "%";

    const p1Wrap = document.getElementById("p1-portrait-wrap");
    const p1HasMultiMega = Boolean(p1.data.megas && p1.data.megas.length >= 2);
    p1Wrap.classList.toggle("ko", p1.ko);
    p1Wrap.classList.toggle("mega-x", p1.megaMode === 1 && p1HasMultiMega);
    p1Wrap.classList.toggle("mega-y", p1.megaMode >= 2 && p1HasMultiMega);
    p1Wrap.classList.toggle("mega-single", p1.megaMode === 1 && !p1HasMultiMega);
    p1Wrap.classList.toggle("gmax-active", p1.gmaxMode > 0);

    p1.data.moves.forEach((m, idx) => {
      const slot = document.getElementById(`skill-slot-${idx}`);
      const cdEl = document.getElementById(`skill-cd-${idx}`);
      if (!slot || !cdEl) return;
      const cd = p1.cooldowns[idx];
      const needEn = m.energy < 0 ? Math.abs(m.energy) : 0;
      slot.classList.toggle("on-cd", cd > 0);
      slot.classList.toggle("no-energy", p1.energy < needEn);
      if (cd > 0.05) {
        cdEl.textContent = cd.toFixed(1);
      } else {
        cdEl.textContent = m.energy > 0 ? `+${m.energy}` : m.energy < 0 ? `${Math.abs(m.energy)}` : "";
      }
    });
  }

  if (p2) {
    const p2NameEl = document.getElementById("p2-name");
    p2NameEl.textContent = p2.name;
    p2NameEl.classList.toggle("mega-name-x", p2.megaMode === 1);
    p2NameEl.classList.toggle("mega-name-y", p2.megaMode >= 2);
    p2NameEl.classList.toggle("gmax-name", p2.gmaxMode > 0);

    document.getElementById("p2-hp-text").textContent = Math.max(0, Math.ceil(p2.hp));
    document.getElementById("p2-portrait").src = p2.sprite;
    const hpPct = Math.max(0, (p2.hp / p2.maxHp) * 100);
    const bar = document.getElementById("p2-hp-bar");
    bar.style.width = hpPct + "%";
    bar.style.background =
      hpPct > 50
        ? "linear-gradient(180deg, #5ef26e 0%, #2dc940 60%, #1e962d 100%)"
        : hpPct > 22
        ? "linear-gradient(180deg, #fde047 0%, #eab308 100%)"
        : "linear-gradient(180deg, #f87171 0%, #dc2626 100%)";
    document.getElementById("p2-en-bar").style.width = Math.min(100, p2.energy) + "%";

    const p2Wrap = document.getElementById("p2-portrait-wrap");
    const p2HasMultiMega = Boolean(p2.data.megas && p2.data.megas.length >= 2);
    p2Wrap.classList.toggle("ko", p2.ko);
    p2Wrap.classList.toggle("mega-x", p2.megaMode === 1 && p2HasMultiMega);
    p2Wrap.classList.toggle("mega-y", p2.megaMode >= 2 && p2HasMultiMega);
    p2Wrap.classList.toggle("mega-single", p2.megaMode === 1 && !p2HasMultiMega);
    p2Wrap.classList.toggle("gmax-active", p2.gmaxMode > 0);
  }
}

function renderPartyBalls() {
  const b1 = document.getElementById("p1-balls");
  const b2 = document.getElementById("p2-balls");
  b1.innerHTML = "";
  b2.innerHTML = "";
  state.p1Team.forEach((id, idx) => {
    const img = document.createElement("img");
    img.src = BALL_ICON_SRC;
    img.className = "party-ball" + (idx < state.p1Index ? " fainted" : "");
    b1.appendChild(img);
  });
  state.p2Team.forEach((id, idx) => {
    const img = document.createElement("img");
    img.src = BALL_ICON_SRC;
    img.className = "party-ball" + (idx < state.p2Index ? " fainted" : "");
    b2.appendChild(img);
  });
}

// Check if a point (x, y) is on a platform or ice floe
function getPlatformUnder(x, y) {
  if (state.fieldType !== "water") return null;
  for (const p of state.platforms) {
    const dx = x - p.x;
    const dy = (y - p.y) / 0.72;
    if (Math.hypot(dx, dy) <= p.r * 0.95) return p;
  }
  for (const floe of state.iceFloes) {
    if (Math.hypot(x - floe.x, y - floe.y) <= floe.r) return floe;
  }
  return null;
}

// Execute Move and Spawn Custom Visual Effects
function executeMove(user, moveIdx, targetX, targetY) {
  if (user.ko || user.sleepTimer > 0 || user.frozenTimer > 0) return;
  const move = user.data.moves[moveIdx];
  if (!move) return;
  if (user.cooldowns[moveIdx] > 0) return;
  const cost = move.energy < 0 ? Math.abs(move.energy) : 0;
  if (user.energy < cost) return;

  user.cooldowns[moveIdx] = move.cd;
  user.energy = Math.max(0, Math.min(user.maxEnergy, user.energy + move.energy));
  user.activeMoveName = move.name;
  user.activeMoveTimer = 0.85;
  showMoveCallout(user.team, move.name);

  const dx = targetX - user.x;
  const dy = targetY - user.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;
  user.facing = dirX >= 0 ? 1 : -1;
  if (typeof angleTo8Dir === "function") {
    user.dir8 = angleTo8Dir(Math.atan2(dy, dx));
  }

  const t = move.type;
  const meleeTypes = new Set([
    "hornattack", "megahorn", "visegrip", "crabhammer",
    "bodyslam", "leafblade", "slash", "waterfall",
    "stomp", "rapidspin", "dash_fly", "dive_jump"
  ]);
  user.activeMoveKind = meleeTypes.has(t) ? "attack" : "special";

  if (t === "ember" || t === "flamethrower" || t === "fireblast") {
    SOUND.sfx("fire");
    const count = t === "ember" ? 5 : t === "flamethrower" ? 18 : 28;
    const spread = t === "fireblast" ? 0.36 : 0.22;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const spd = (t === "ember" ? 7.5 : 8.5) + Math.random() * 3.5;
      state.projectiles.push({
        kind: "fire",
        owner: user,
        x: user.x + dirX * 26,
        y: user.y + dirY * 18 - user.z,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: t === "fireblast" ? 22 : t === "flamethrower" ? 16 : 11,
        dmg: move.dmg / (count * 0.42),
        life: 0.65 + Math.random() * 0.25,
        maxLife: 0.85
      });
    }
  } else if (t === "firespin") {
    SOUND.sfx("fire");
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      state.projectiles.push({
        kind: "firespin",
        owner: user,
        cx: targetX,
        cy: targetY,
        angle: ang,
        radius: 18 + (i % 3) * 18,
        x: targetX + Math.cos(ang) * 30,
        y: targetY + Math.sin(ang) * 20,
        r: 15,
        dmg: move.dmg * 0.22,
        life: 1.5,
        maxLife: 1.5
      });
    }
  } else if (t === "watergun" || t === "muddywater") {
    SOUND.sfx("water");
    const count = t === "muddywater" ? 14 : 7;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * (t === "muddywater" ? 0.55 : 0.16);
      const spd = 8.5 + Math.random() * 2.5;
      state.projectiles.push({
        kind: t === "muddywater" ? "muddy" : "water",
        owner: user,
        x: user.x + dirX * 22,
        y: user.y + dirY * 16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: t === "muddywater" ? 15 : 11,
        dmg: move.dmg / (count * 0.5),
        life: 0.65,
        maxLife: 0.65
      });
    }
  } else if (t === "surf") {
    SOUND.sfx("surf");
    if (user.id === "lapras" || user.id === "blastoise") {
      showSubtitle("Surf's up dude!", 2.2);
    }
    state.waves.push({
      owner: user,
      x: user.x + dirX * 30,
      y: user.y + dirY * 20,
      dirX,
      dirY,
      speed: 6.4,
      radius: 95,
      dmg: move.dmg,
      life: 1.35,
      hitSet: new Set()
    });
  } else if (t === "whirlpool") {
    SOUND.sfx("surf");
    showSubtitle(`${user.name} unleashes a massive Whirlpool Tornado!`, 2.5);
    state.whirlpools.push({
      owner: user,
      x: targetX,
      y: targetY,
      radius: 82,
      height: 220,
      dmg: move.dmg,
      life: 3.4,
      maxLife: 3.4
    });
  } else if (t === "icebeam") {
    SOUND.sfx("ice");
    state.beams.push({
      kind: "ice",
      owner: user,
      x1: user.x + dirX * 24,
      y1: user.y - 10,
      x2: user.x + dirX * 460,
      y2: user.y + dirY * 460,
      width: 22,
      dmg: move.dmg,
      life: 0.75,
      maxLife: 0.75
    });
    // Create persistent floating ice floes along the beam path on water!
    if (state.fieldType === "water") {
      for (let step = 75; step <= 390; step += 52) {
        const ix = user.x + dirX * step + (Math.random() - 0.5) * 26;
        const iy = user.y + dirY * step + (Math.random() - 0.5) * 26;
        if (ix > bounds.left + 40 && ix < bounds.right - 40 && iy > bounds.top + 40 && iy < bounds.bottom - 40) {
          state.iceFloes.push({
            x: ix,
            y: iy,
            r: 28 + Math.random() * 18,
            life: 14.0,
            seed: Math.random() * 100
          });
        }
      }
    }
  } else if (t === "hyperbeam" || t === "hydropump") {
    SOUND.sfx("beam");
    state.cameraShake = 14;
    state.beams.push({
      kind: t === "hydropump" ? "hydro" : "hyper",
      owner: user,
      x1: user.x + dirX * 28,
      y1: user.y - 12,
      x2: user.x + dirX * 620,
      y2: user.y + dirY * 620,
      width: t === "hyperbeam" ? 36 : 30,
      dmg: move.dmg,
      life: 0.9,
      maxLife: 0.9
    });
  } else if (t === "thunderbolt" || t === "thunder" || t === "spark" || t === "electroball") {
    SOUND.sfx("thunder");
    state.cameraShake = t === "thunder" ? 11 : 6;
    const tx = t === "spark" ? user.x + dirX * 140 : targetX;
    const ty = t === "spark" ? user.y + dirY * 140 : targetY;
    state.beams.push({
      kind: "lightning",
      owner: user,
      x1: t === "thunder" ? tx : user.x,
      y1: t === "thunder" ? bounds.top - 60 : user.y - 12,
      x2: tx,
      y2: ty,
      width: t === "thunder" ? 10 : 6,
      dmg: move.dmg,
      life: 0.45,
      maxLife: 0.45
    });
    // Electric ripple on water
    state.ripples.push({ x: tx, y: ty, r: 12, maxR: 135, color: "#ffe629", width: 3.5, alpha: 1 });
  } else if (t === "hypnosis" || t === "shadowball" || t === "shadowball_mini" || t === "dreameater") {
    SOUND.sfx("hypnosis");
    if (t === "hypnosis") {
      showSubtitle("And there it is, the hypnosis power of Gengar!", 2.5);
      for (let i = 0; i < 6; i++) {
        state.projectiles.push({
          kind: "hypnosis_ring",
          owner: user,
          x: user.x + dirX * (20 + i * 16),
          y: user.y + dirY * (20 + i * 16),
          vx: dirX * 6.2,
          vy: dirY * 6.2,
          r: 14 + i * 4,
          dmg: move.dmg / 4,
          sleep: true,
          life: 0.95,
          maxLife: 0.95
        });
      }
    } else {
      state.projectiles.push({
        kind: "shadowball",
        owner: user,
        x: user.x + dirX * 24,
        y: user.y + dirY * 18,
        vx: dirX * 7.8,
        vy: dirY * 7.8,
        r: t === "shadowball" ? 22 : 13,
        dmg: move.dmg,
        life: 0.9,
        maxLife: 0.9
      });
    }
  } else if (t === "swift" || t === "razorleaf" || t === "petalstorm") {
    SOUND.sfx("hit");
    const count = t === "petalstorm" ? 16 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * (t === "petalstorm" ? 1.2 : 0.35);
      const spd = 8.2 + Math.random() * 2.5;
      state.projectiles.push({
        kind: t === "swift" ? "star" : "leaf",
        owner: user,
        x: user.x + dirX * 20,
        y: user.y + dirY * 16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 12,
        dmg: move.dmg / (count * 0.45),
        life: 0.75,
        maxLife: 0.75
      });
    }
  } else if (t === "rest") {
    SOUND.sfx("hypnosis");
    user.hp = Math.min(user.maxHp, user.hp + 45);
    user.sleepTimer = 1.6;
    spawnBurst(user.x, user.y, "#4ade80", 18);
  } else if (t === "dodge" || t === "dash_fly" || t === "dive_jump") {
    SOUND.sfx("water");
    user.dashTimer = 0.36;
    user.dashVx = dirX * 10.5;
    user.dashVy = dirY * 10.5;
    user.invulnTimer = 0.42;
    if (t === "dash_fly" || t === "dive_jump") {
      user.vz = 8.5;
    }
    spawnBurst(user.x, user.y, "#ffffff", 12);
  } else {
    // Melee Dash Attacks: hornattack, megahorn, visegrip, crabhammer, bodyslam, leafblade, slash, waterfall, stomp, rapidspin
    SOUND.sfx("hit");
    if (user.id === "nidorino" && t === "hornattack") {
      showSubtitle("Nidorino charges in with a Horn Attack!", 2.2);
    }
    user.dashTimer = 0.34;
    user.dashVx = dirX * 11.2;
    user.dashVy = dirY * 11.2;
    state.projectiles.push({
      kind: "melee_hitbox",
      subKind: t,
      owner: user,
      x: user.x + dirX * 30,
      y: user.y + dirY * 24,
      vx: dirX * 9.5,
      vy: dirY * 9.5,
      r: t === "stomp" || t === "bodyslam" ? 48 : 34,
      dmg: move.dmg,
      life: 0.32,
      maxLife: 0.32
    });
  }

  updateHUD();
}

function spawnBurst(x, y, color, count = 14, speed = 4.5) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random() * 0.9) * speed;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.2,
      r: 3 + Math.random() * 5,
      color,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.75
    });
  }
}

function applyDamage(attacker, target, dmg, knockX = 0, knockY = 0, extra = {}) {
  if (!target || target.ko || target.invulnTimer > 0) return;

  // Check if both fighters are dashing in melee -> trigger "They've locked up!" clash!
  if (extra.melee && target.dashTimer > 0.08 && !state.clash.active) {
    state.clash = {
      active: true,
      x: (attacker.x + target.x) * 0.5,
      y: (attacker.y + target.y) * 0.5,
      timer: 1.1,
      f1: attacker,
      f2: target
    };
    showSubtitle("They've locked up!", 1.8);
    SOUND.sfx("hit");
    spawnBurst(state.clash.x, state.clash.y, "#ffe629", 22, 6);
    return;
  }

  target.hp = Math.max(0, target.hp - dmg);
  target.hurtTimer = 0.34;
  target.vx += knockX;
  target.vy += knockY;
  target.sleepTimer = 0; // wake up on hit
  if (extra.sleep) {
    target.sleepTimer = 2.8;
  }
  if (extra.freeze) {
    target.frozenTimer = 2.0;
  }

  SOUND.sfx("hit");
  spawnBurst(target.x, target.y - 10, "#ffffff", 8, 4.2);

  // Tilt platform if standing on one
  const plat = getPlatformUnder(target.x, target.y);
  if (plat && plat.tiltX !== undefined) {
    plat.tiltX = Math.max(-10, Math.min(10, knockX * 1.4));
    plat.tiltY = Math.max(-10, Math.min(10, knockY * 1.4));
  }

  if (target.hp <= 0 && !target.ko) {
    target.ko = true;
    target.vz = 7.5;
    state.cameraShake = 16;
    showKO(`${target.name} goes down!`);

    // Giant water splash fountain if on water field
    if (state.fieldType === "water") {
      spawnBurst(target.x, target.y, "#e0f7ff", 38, 7.5);
      state.ripples.push({ x: target.x, y: target.y, r: 10, maxR: 110, color: "#ffffff", width: 4, alpha: 1 });
    }

    // Schedule Pokéball recall red laser beam (like sample1.mp4 00:40!)
    setTimeout(() => {
      triggerRecallBeam(target);
    }, 950);
  }

  updateHUD();
}

function triggerRecallBeam(fighter) {
  if (!fighter) return;
  SOUND.sfx("recall");
  const originX = fighter.team === 1 ? bounds.left - 36 : bounds.right + 36;
  const originY = (bounds.top + bounds.bottom) * 0.5;
  state.recallLasers.push({
    x1: originX,
    y1: originY,
    x2: fighter.x,
    y2: fighter.y,
    life: 0.65,
    maxLife: 0.65
  });
  spawnBurst(fighter.x, fighter.y, "#ff3b5c", 22, 5.5);

  if (!state.battleRoyale) {
    setTimeout(() => {
      if (fighter.team === 1) {
        state.p1Index = (state.p1Index + 1) % state.p1Team.length;
        spawnTeamFighter(1, state.p1Team[state.p1Index]);
      } else {
        state.p2Index = (state.p2Index + 1) % state.p2Team.length;
        spawnTeamFighter(2, state.p2Team[state.p2Index]);
      }
      renderPartyBalls();
    }, 650);
  } else {
    // Respawn in Battle Royale after short delay
    setTimeout(() => {
      fighter.ko = false;
      fighter.hp = fighter.maxHp;
    }, 2200);
  }
}

function spawnTeamFighter(team, pokeId) {
  SOUND.sfx("sendout");
  const plat = team === 1 ? state.platforms[0] : state.platforms[1];
  const sx = plat ? plat.x : team === 1 ? bounds.left + 160 : bounds.right - 160;
  const sy = plat ? plat.y : (bounds.top + bounds.bottom) * 0.5;

  state.fighters = state.fighters.filter(f => f.team !== team);
  const nf = createFighter(pokeId, team, sx, sy, team === 1);
  nf.z = 28;
  nf.vz = 4;
  state.fighters.push(nf);

  spawnBurst(sx, sy, "#ff4d6d", 20, 5);
  showSubtitle(`${nf.name} enters the battlefield!`, 2.2);
  if (team === 1) renderSkillBar(nf);
  updateHUD();
}

function triggerPlayerSkill(slotIdx) {
  const p1 = state.fighters.find(f => f.isPlayer);
  if (!p1) return;
  const enemy = state.fighters.find(f => f.team !== 1 && !f.ko) || { x: mouse.x, y: mouse.y };
  const tx = slotIdx === 2 ? mouse.x : enemy.x;
  const ty = slotIdx === 2 ? mouse.y : enemy.y;
  executeMove(p1, slotIdx, tx, ty);
}

function recallAndSwapPlayer() {
  const p1 = state.fighters.find(f => f.isPlayer);
  if (!p1) return;
  showSubtitle(`Wait! The trainer recalls ${p1.name}!`, 2.2);
  triggerRecallBeam(p1);
}

function toggleMegaEvolution(targetTeam = 1, forceMode = null) {
  const f = state.fighters.find(o => o.team === targetTeam);
  if (!f) return;

  const megas = f.data.megas || [];
  if (megas.length > 0) {
    f.gmaxMode = 0;
    f.megaMode = forceMode !== null ? forceMode : (f.megaMode + 1) % (megas.length + 1);
    if (f.megaMode > 0) {
      const mInfo = megas[f.megaMode - 1] || megas[0];
      f.sprite = mInfo.front;
      f.backSprite = mInfo.back || mInfo.front;
      getSprite(f.sprite);
      getSprite(f.backSprite);
      const suf = mInfo.suffix ? " " + mInfo.suffix : "";
      const prefix = mInfo.suffix === "PRIMAL" ? "✦ PRIMAL " : "✦ MEGA ";
      f.name = mInfo.suffix === "PRIMAL" ? `✦ PRIMAL ${f.data.name}` : `${prefix}${f.data.name}${suf}`;
      f.maxHp = f.data.hp + 45;
      f.hp = Math.min(f.maxHp, f.hp + 45);
      f.energy = f.maxEnergy;
      const col1 = f.megaMode === 2 ? "#fde047" : "#00e5ff";
      const col2 = f.megaMode === 2 ? "#f97316" : "#3b82f6";
      spawnBurst(f.x, f.y, col1, 32, 7.2);
      spawnBurst(f.x, f.y, col2, 20, 5.5);
      showSubtitle(`${f.data.name} Mega Evolved into ${f.name.replace("✦ ", "")}!`, 2.5);
    } else {
      f.sprite = f.data.sprite;
      f.backSprite = f.data.backSprite;
      f.name = f.data.name;
      f.maxHp = f.data.hp;
      f.hp = Math.min(f.maxHp, f.hp);
      spawnBurst(f.x, f.y, "#ffd43b", 20, 5.5);
    }
    SOUND.sfx("beam");
    updateHUD();
  } else if (f.data.gmaxs && f.data.gmaxs.length > 0) {
    toggleGigantamax(targetTeam);
  } else {
    showSubtitle(`${f.name} gets an Energy Surge!`, 1.8);
    f.energy = f.maxEnergy;
    spawnBurst(f.x, f.y, "#38bdf8", 22, 5.5);
    updateHUD();
  }
}

function toggleGigantamax(targetTeam = 1, forceMode = null) {
  const f = state.fighters.find(o => o.team === targetTeam);
  if (!f) return;

  const gmaxs = f.data.gmaxs || [];
  if (gmaxs.length > 0) {
    f.megaMode = 0;
    f.gmaxMode = forceMode !== null ? forceMode : (f.gmaxMode + 1) % (gmaxs.length + 1);
    if (f.gmaxMode > 0) {
      const gInfo = gmaxs[f.gmaxMode - 1] || gmaxs[0];
      f.sprite = gInfo.front;
      f.backSprite = gInfo.back || gInfo.front;
      getSprite(f.sprite);
      getSprite(f.backSprite);
      const suf = gInfo.suffix ? " " + gInfo.suffix : "";
      f.name = `🌋 G-MAX ${f.data.name}${suf}`;
      f.maxHp = f.data.hp + 75;
      f.hp = Math.min(f.maxHp, f.hp + 75);
      f.energy = f.maxEnergy;
      state.cameraShake = 12;
      spawnBurst(f.x, f.y, "#f43f5e", 36, 7.8);
      spawnBurst(f.x, f.y, "#fda4af", 24, 5.8);
      showSubtitle(`${f.data.name} Gigantamaxed into G-Max ${f.data.name}!`, 2.6);
    } else {
      f.sprite = f.data.sprite;
      f.backSprite = f.data.backSprite;
      f.name = f.data.name;
      f.maxHp = f.data.hp;
      f.hp = Math.min(f.maxHp, f.hp);
      spawnBurst(f.x, f.y, "#ffd43b", 20, 5.5);
    }
    SOUND.sfx("beam");
    updateHUD();
  } else {
    showSubtitle(`${f.data.name} Dynamax Energy Surge!`, 1.8);
    f.energy = f.maxEnergy;
    spawnBurst(f.x, f.y, "#f43f5e", 24, 5.8);
    updateHUD();
  }
}

// Dramatic Field Change Cutscene (matches sample1.mp4 00:18-00:31!)
function startFieldChange(forceTarget = null) {
  if (state.fieldTransition.active) return;
  const nextField = forceTarget || (state.fieldType === "grass" ? "water" : "grass");
  state.fieldTransition = {
    active: true,
    phase: 0,
    progress: 0,
    targetField: nextField
  };
  SOUND.sfx("fieldchange");
  showSubtitle("It's time for a field change!", 2.6);
}

// Preset Scenes
function startGrassScene() {
  state.battleRoyale = false;
  state.fieldType = "grass";
  state.fieldTransition.active = false;
  state.iceFloes = [];
  state.whirlpools = [];
  state.waves = [];
  state.p1Team = ["nidorino", "goldeen" in POKEMON_DATA ? "goldeen" : "seaking", "charizard"];
  state.p2Team = ["gengar", "snorlax", "gyarados"];
  state.p1Index = 0;
  state.p2Index = 0;

  const cx = (bounds.left + bounds.right) * 0.5;
  const cy = (bounds.top + bounds.bottom) * 0.5;
  state.fighters = [
    createFighter("nidorino", 1, cx - 95, cy, true),
    createFighter("gengar", 2, cx + 95, cy, false)
  ];
  renderSkillBar(state.fighters[0]);
  renderPartyBalls();
  updateHUD();
  showSubtitle("Nidorino begins the battle with a horn attack!", 2.8);
}

function startWaterScene() {
  state.battleRoyale = false;
  state.fieldType = "water";
  state.fieldTransition.active = false;
  state.iceFloes = [];
  state.whirlpools = [];
  state.waves = [];
  state.p1Team = ["charizard", "lapras", "pikachu"];
  state.p2Team = ["seaking", "starmie", "gyarados"];
  state.p1Index = 0;
  state.p2Index = 0;

  const centerStage = state.platforms[2];
  const leftBall = state.platforms[0];
  state.fighters = [
    createFighter("charizard", 1, centerStage.x, centerStage.y - 6, true),
    createFighter("seaking", 2, leftBall.x + 120, centerStage.y + 45, false)
  ];
  renderSkillBar(state.fighters[0]);
  renderPartyBalls();
  updateHUD();
  showSubtitle("Seaking enters the battlefield!", 2.6);
}

function startBattleRoyaleScene() {
  state.battleRoyale = true;
  state.fieldType = "water";
  state.fieldTransition.active = false;
  const cx = (bounds.left + bounds.right) * 0.5;
  const cy = (bounds.top + bounds.bottom) * 0.5;

  state.fighters = [
    createFighter("gyarados", 1, cx - 40, cy + 25, true),
    createFighter("charizard", 2, cx, cy - 30, false),
    createFighter("snorlax", 2, state.platforms[2].x, state.platforms[2].y, false),
    createFighter("lapras", 2, cx - 170, cy + 20, false),
    createFighter("pikachu", 2, state.platforms[5].x, state.platforms[5].y, false),
    createFighter("starmie", 2, state.platforms[3].x, state.platforms[3].y, false),
    createFighter("sceptile", 2, state.platforms[4].x, state.platforms[4].y, false),
    createFighter("blastoise", 2, cx + 190, cy + 55, false)
  ];
  renderSkillBar(state.fighters[0]);
  updateHUD();
  // Trigger giant Whirlpool right in the center like sample1.mp4 00:56!
  executeMove(state.fighters[0], 3, cx, cy - 25);
  showSubtitle("Gyarados unleashes Whirlpool Tornado in Battle Royale!", 3.0);
}

// Populate Bottom-Right Full 1,025 Pokédex Switcher (sorted by Generation index 0001..1025)
let currentGenFilter = "all";
let currentSearchQuery = "";

function renderRosterList() {
  const strip = document.getElementById("roster-strip");
  if (!strip) return;
  strip.innerHTML = "";

  const q = currentSearchQuery.trim().toLowerCase();
  const sortedList = Object.values(POKEMON_DATA).sort((a, b) => (a.dex || 9999) - (b.dex || 9999));
  const frag = document.createDocumentFragment();

  if (currentGenFilter === "mega") {
    sortedList.forEach(p => {
      if (!p.megas || p.megas.length === 0) return;
      p.megas.forEach((mInfo, idx) => {
        const dexStr = String(p.dex || 0).padStart(4, "0");
        const suf = mInfo.suffix ? " " + mInfo.suffix : "";
        const label = mInfo.suffix === "PRIMAL" ? `PRIMAL ${p.name}` : `MEGA ${p.name}${suf}`;
        const jpLabel = mInfo.suffix === "PRIMAL" ? `ゲンシ${p.jpName}` : `メガ${p.jpName}${mInfo.suffix || ""}`;
        const tag = `${dexStr}${mInfo.suffix ? mInfo.suffix[0] : "M"}`;
        if (q) {
          const match = dexStr.includes(q) || label.toLowerCase().includes(q) || jpLabel.toLowerCase().includes(q) || mInfo.formSlug.includes(q);
          if (!match) return;
        }
        const btn = document.createElement("button");
        btn.className = "roster-btn mega-roster-btn";
        btn.title = `#${dexStr} ${jpLabel} (${label}) - 左クリック:自分(メガシンカ) / 右クリック:相手(メガシンカ)`;
        btn.innerHTML = `<img src="${mInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag mega-tag">${tag}</span>`;
        btn.onclick = () => {
          state.p1Team[state.p1Index] = p.id;
          spawnTeamFighter(1, p.id);
          toggleMegaEvolution(1, idx + 1);
        };
        btn.oncontextmenu = e => {
          e.preventDefault();
          state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(2, p.id);
          toggleMegaEvolution(2, idx + 1);
        };
        frag.appendChild(btn);
      });
    });
    strip.appendChild(frag);
    return;
  }

  if (currentGenFilter === "gmax") {
    sortedList.forEach(p => {
      if (!p.gmaxs || p.gmaxs.length === 0) return;
      p.gmaxs.forEach((gInfo, idx) => {
        const dexStr = String(p.dex || 0).padStart(4, "0");
        const suf = gInfo.suffix ? " " + gInfo.suffix : "";
        const label = `G-MAX ${p.name}${suf}`;
        const jpLabel = `キョダイマックス${p.jpName}${suf}`;
        const tag = `${dexStr}G`;
        if (q) {
          const match = dexStr.includes(q) || label.toLowerCase().includes(q) || jpLabel.toLowerCase().includes(q) || gInfo.formSlug.includes(q);
          if (!match) return;
        }
        const btn = document.createElement("button");
        btn.className = "roster-btn gmax-roster-btn";
        btn.title = `#${dexStr} ${jpLabel} (${label}) - 左クリック:自分(キョダイマックス) / 右クリック:相手(キョダイマックス)`;
        btn.innerHTML = `<img src="${gInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag gmax-tag">${tag}</span>`;
        btn.onclick = () => {
          state.p1Team[state.p1Index] = p.id;
          spawnTeamFighter(1, p.id);
          toggleGigantamax(1, idx + 1);
        };
        btn.oncontextmenu = e => {
          e.preventDefault();
          state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(2, p.id);
          toggleGigantamax(2, idx + 1);
        };
        frag.appendChild(btn);
      });
    });
    strip.appendChild(frag);
    return;
  }

  if (currentGenFilter === "regional") {
    sortedList.forEach(p => {
      if (!p.regionals || p.regionals.length === 0) return;
      p.regionals.forEach(rInfo => {
        const dexStr = String(p.dex || 0).padStart(4, "0");
        const label = `${rInfo.regionLabel} ${p.name}`;
        const jpLabel = `${p.jpName}(${rInfo.jpRegion})`;
        if (q) {
          const match = dexStr.includes(q) || label.toLowerCase().includes(q) || jpLabel.toLowerCase().includes(q) || rInfo.formSlug.includes(q);
          if (!match) return;
        }
        const btn = document.createElement("button");
        btn.className = "roster-btn";
        btn.title = `#${dexStr} ${jpLabel} (${label}) - 左クリック:自分 / 右クリック:相手`;
        btn.innerHTML = `<img src="${rInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag">${dexStr}R</span>`;
        btn.onclick = () => {
          state.p1Team[state.p1Index] = p.id;
          spawnTeamFighter(1, p.id);
          const f = state.fighters.find(o => o.team === 1);
          if (f) {
            f.sprite = rInfo.front;
            f.backSprite = rInfo.back;
            f.name = label;
            getSprite(f.sprite);
            getSprite(f.backSprite);
            updateHUD();
          }
        };
        btn.oncontextmenu = e => {
          e.preventDefault();
          state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(2, p.id);
          const f = state.fighters.find(o => o.team === 2);
          if (f) {
            f.sprite = rInfo.front;
            f.backSprite = rInfo.back;
            f.name = label;
            getSprite(f.sprite);
            getSprite(f.backSprite);
            updateHUD();
          }
        };
        frag.appendChild(btn);
      });
    });
    strip.appendChild(frag);
    return;
  }

  const filtered = sortedList.filter(p => {
    if (currentGenFilter === "featured") {
      if (!p.isFeatured) return false;
    } else if (currentGenFilter !== "all") {
      if (String(p.gen) !== String(currentGenFilter)) return false;
    }
    if (q) {
      const dexStr = String(p.dex || "").padStart(4, "0");
      const matchDex = dexStr.includes(q) || String(p.dex || "") === q;
      const matchName =
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.jpName && p.jpName.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q));
      if (!matchDex && !matchName) return false;
    }
    return true;
  });

  filtered.forEach(p => {
    const btn = document.createElement("button");
    const hasMega = Boolean(p.megas && p.megas.length > 0);
    const hasGmax = Boolean(p.gmaxs && p.gmaxs.length > 0);
    btn.className = "roster-btn" + (hasMega ? " has-mega" : "");
    const dexStr = String(p.dex || 0).padStart(4, "0");
    const megaNote = hasMega ? " [✦Mキーでメガシンカ]" : "";
    const gmaxNote = hasGmax ? " [🌋Gキーでキョダイマックス]" : "";
    btn.title = `#${dexStr} ${p.jpName} (${p.name}) [Gen ${p.gen || 1}]${megaNote}${gmaxNote} - 左クリック:自分 / 右クリック:相手`;
    btn.innerHTML = `<img src="${p.sprite}" loading="lazy" alt="${p.name}" /><span class="dex-tag">${dexStr}${hasMega ? "✦" : hasGmax ? "G" : ""}</span>`;
    btn.onclick = () => {
      state.p1Team[state.p1Index] = p.id;
      spawnTeamFighter(1, p.id);
    };
    btn.oncontextmenu = e => {
      e.preventDefault();
      state.p2Team[state.p2Index] = p.id;
      spawnTeamFighter(2, p.id);
    };
    frag.appendChild(btn);
  });
  strip.appendChild(frag);
}

function initRosterStrip() {
  renderRosterList();

  const tabsContainer = document.getElementById("gen-tabs");
  if (tabsContainer) {
    tabsContainer.querySelectorAll(".gen-tab").forEach(tab => {
      tab.onclick = () => {
        tabsContainer.querySelectorAll(".gen-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentGenFilter = tab.getAttribute("data-gen") || "all";
        renderRosterList();
      };
    });
  }

  const searchInput = document.getElementById("roster-search");
  if (searchInput) {
    searchInput.addEventListener("input", e => {
      currentSearchQuery = e.target.value || "";
      renderRosterList();
    });
  }

  const randPool = Object.values(POKEMON_DATA).filter(p => p.fromSpritesFolder);
  const btnRandP1 = document.getElementById("btn-rand-p1");
  if (btnRandP1) {
    btnRandP1.onclick = () => {
      const pick = randPool[Math.floor(Math.random() * randPool.length)];
      if (pick) {
        state.p1Team[state.p1Index] = pick.id;
        spawnTeamFighter(1, pick.id);
      }
    };
  }
  const btnRandP2 = document.getElementById("btn-rand-p2");
  if (btnRandP2) {
    btnRandP2.onclick = () => {
      const pick = randPool[Math.floor(Math.random() * randPool.length)];
      if (pick) {
        state.p2Team[state.p2Index] = pick.id;
        spawnTeamFighter(2, pick.id);
      }
    };
  }
}

// Wire top UI buttons
document.getElementById("btn-field-change").onclick = () => startFieldChange();
document.getElementById("btn-scene-grass").onclick = () => startGrassScene();
document.getElementById("btn-scene-water").onclick = () => startWaterScene();
document.getElementById("btn-scene-royale").onclick = () => startBattleRoyaleScene();
document.getElementById("btn-swap-poke").onclick = () => recallAndSwapPlayer();
document.getElementById("btn-mega").onclick = () => toggleMegaEvolution(1);
document.getElementById("btn-mega").oncontextmenu = e => {
  e.preventDefault();
  toggleMegaEvolution(2);
};
const btnGmax = document.getElementById("btn-gmax");
if (btnGmax) {
  btnGmax.onclick = () => toggleGigantamax(1);
  btnGmax.oncontextmenu = e => {
    e.preventDefault();
    toggleGigantamax(2);
  };
}
document.getElementById("btn-sound").onclick = e => {
  const on = SOUND.toggle();
  e.target.textContent = on ? "🔊 音: ON" : "🔇 音: OFF";
};

// Update loop
function update(dt) {
  state.time += dt;
  state.tickerOffset = (state.tickerOffset + dt * 55) % 900;

  if (state.cameraShake > 0) {
    state.cameraShake = Math.max(0, state.cameraShake - dt * 28);
  }
  if (state.subtitleTimer > 0) {
    state.subtitleTimer -= dt;
    if (state.subtitleTimer <= 0) {
      document.getElementById("subtitle-banner").classList.remove("visible");
    }
  }
  if (state.koTimer > 0) {
    state.koTimer -= dt;
    if (state.koTimer <= 0) {
      document.getElementById("ko-overlay").classList.remove("show");
    }
  }

  // Handle Field Change Cutscene
  if (state.fieldTransition.active) {
    state.fieldTransition.progress += dt * 0.45;
    if (state.fieldTransition.phase === 0 && state.fieldTransition.progress >= 1) {
      state.fieldTransition.phase = 1;
      state.fieldTransition.progress = 0;
      state.fieldType = state.fieldTransition.targetField;
      if (state.fieldType === "water") {
        showSubtitle("Are you ready for a water battle?", 2.5);
        SOUND.sfx("surf");
      }
    } else if (state.fieldTransition.phase === 1 && state.fieldTransition.progress >= 1) {
      state.fieldTransition.active = false;
      // Snap fighters onto safe platforms if switching to water
      if (state.fieldType === "water") {
        const p1 = state.fighters.find(f => f.team === 1);
        const p2 = state.fighters.find(f => f.team === 2);
        if (p1 && !p1.data.swimmer) {
          p1.x = state.platforms[2].x;
          p1.y = state.platforms[2].y;
        }
        if (p2 && !p2.data.swimmer) {
          p2.x = state.platforms[1].x;
          p2.y = state.platforms[1].y;
        }
      }
    }
    return;
  }

  // Handle Melee Clash ("They've locked up!")
  if (state.clash.active) {
    state.clash.timer -= dt;
    if (Math.random() < 0.45) {
      spawnBurst(state.clash.x, state.clash.y, "#ffffff", 2, 3.5);
    }
    if (state.clash.timer <= 0) {
      state.clash.active = false;
      if (state.clash.f1 && state.clash.f2) {
        const dx = state.clash.f2.x - state.clash.f1.x || 1;
        const dir = Math.sign(dx);
        state.clash.f1.vx = -dir * 7;
        state.clash.f2.vx = dir * 7;
      }
    }
  }

  // Relax platform tilts
  for (const p of state.platforms) {
    p.tiltX *= 0.9;
    p.tiltY *= 0.9;
  }

  // Update Ice Floes
  for (let i = state.iceFloes.length - 1; i >= 0; i--) {
    state.iceFloes[i].life -= dt;
    if (state.iceFloes[i].life <= 0) state.iceFloes.splice(i, 1);
  }

  // Update fighters
  for (const f of state.fighters) {
    for (let i = 0; i < 5; i++) {
      if (f.cooldowns[i] > 0) f.cooldowns[i] = Math.max(0, f.cooldowns[i] - dt);
    }
    if (f.sleepTimer > 0) f.sleepTimer = Math.max(0, f.sleepTimer - dt);
    if (f.frozenTimer > 0) f.frozenTimer = Math.max(0, f.frozenTimer - dt);
    if (f.invulnTimer > 0) f.invulnTimer = Math.max(0, f.invulnTimer - dt);
    if (f.activeMoveTimer > 0) f.activeMoveTimer = Math.max(0, f.activeMoveTimer - dt);
    if (f.hurtTimer > 0) f.hurtTimer = Math.max(0, f.hurtTimer - dt);

    // Passive energy regen
    if (!f.ko) {
      f.energy = Math.min(f.maxEnergy, f.energy + dt * 6.5);
    }

    if (f.ko) {
      f.x += f.vx;
      f.y += f.vy;
      f.vx *= 0.9;
      f.vy *= 0.9;
      if (f.z > 0 || f.vz !== 0) {
        f.z = Math.max(0, f.z + f.vz);
        f.vz -= 0.55;
      }
      continue;
    }

    if (state.clash.active && (f === state.clash.f1 || f === state.clash.f2)) {
      continue;
    }

    // Player movement vs AI movement
    if (f.isPlayer && f.sleepTimer <= 0 && f.frozenTimer <= 0) {
      let mx = 0;
      let my = 0;
      if (keys["w"] || keys["arrowup"]) my -= 1;
      if (keys["s"] || keys["arrowdown"]) my += 1;
      if (keys["a"] || keys["arrowleft"]) mx -= 1;
      if (keys["d"] || keys["arrowright"]) mx += 1;
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len;
        my /= len;
        const onPlat = getPlatformUnder(f.x, f.y);
        const waterPenalty = state.fieldType === "water" && !f.data.swimmer && !f.data.flier && !onPlat ? 0.62 : 1.0;
        f.vx += mx * f.data.speed * 0.35 * waterPenalty;
        f.vy += my * f.data.speed * 0.35 * waterPenalty;
      }
    } else if (!f.isPlayer && f.sleepTimer <= 0 && f.frozenTimer <= 0) {
      // CPU AI (Movement only - does NOT attack so player can freely practice!)
      const target =
        state.fighters.find(o => o.isPlayer && !o.ko) ||
        state.fighters[0];
      if (target) {
        const dx = target.x - f.x;
        const dy = target.y - f.y;
        const dist = Math.hypot(dx, dy) || 1;

        // Smoothly steer around the arena in continuous arcs without abrupt angle jumps
        f.aiTimer -= dt;
        if (f.aiTimer <= 0 || f.targetWanderAngle === undefined) {
          f.aiTimer = 1.6 + Math.random() * 1.6;
          f.targetWanderAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.9;
          if (f.wanderAngle === undefined) f.wanderAngle = f.targetWanderAngle;
        }
        const angleDiff = Math.atan2(
          Math.sin(f.targetWanderAngle - f.wanderAngle),
          Math.cos(f.targetWanderAngle - f.wanderAngle)
        );
        f.wanderAngle += angleDiff * Math.min(1, dt * 3.2);

        let moveX = Math.cos(f.wanderAngle);
        let moveY = Math.sin(f.wanderAngle);

        // Smooth distance pull/push instead of step-function threshold jumps
        const pullFactor = Math.max(-0.65, Math.min(0.7, (dist - 185) / 140));
        moveX = moveX * (1 - Math.abs(pullFactor) * 0.55) + (dx / dist) * pullFactor * 0.65;
        moveY = moveY * (1 - Math.abs(pullFactor) * 0.55) + (dy / dist) * pullFactor * 0.65;

        f.vx += moveX * f.data.speed * 0.16;
        f.vy += moveY * f.data.speed * 0.16;
      }
    }

    // Always face toward the opponent Pokémon in 8 directions (with smooth angle lerp + hysteresis)!
    const opp = state.fighters
      .filter(o => o !== f && !o.ko && (state.battleRoyale || o.team !== f.team))
      .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
    if (opp) {
      const fdx = opp.x - f.x;
      const fdy = opp.y - f.y;
      f.faceAngle = Math.atan2(fdy, fdx);
      if (f.smoothFaceAngle === undefined) {
        f.smoothFaceAngle = f.faceAngle;
      } else {
        const dAng = Math.atan2(Math.sin(f.faceAngle - f.smoothFaceAngle), Math.cos(f.faceAngle - f.smoothFaceAngle));
        f.smoothFaceAngle += dAng * Math.min(1, dt * 12);
      }
      f.facing = fdx >= 0 ? 1 : -1;
      if (typeof angleTo8Dir === "function") {
        f.dir8 = angleTo8Dir(f.smoothFaceAngle, f.dir8);
      }
    } else if (Math.hypot(f.vx, f.vy) > 0.2 && typeof angleTo8Dir === "function") {
      f.faceAngle = Math.atan2(f.vy, f.vx);
      f.dir8 = angleTo8Dir(f.faceAngle, f.dir8);
    }

    // Dash velocity override
    if (f.dashTimer > 0) {
      f.dashTimer -= dt;
      f.x += f.dashVx;
      f.y += f.dashVy;
      if (Math.random() < 0.6) {
        state.particles.push({
          x: f.x,
          y: f.y + 12,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          r: 7 + Math.random() * 5,
          color: state.fieldType === "water" ? "rgba(220,245,255,0.8)" : "rgba(210,190,145,0.8)",
          life: 0.35,
          maxLife: 0.35
        });
      }
    } else {
      f.x += f.vx;
      f.y += f.vy;
      f.vx *= 0.82;
      f.vy *= 0.82;
    }

    // Vertical hop / fly physics
    if (f.z > 0 || f.vz !== 0) {
      f.z = Math.max(0, f.z + f.vz);
      f.vz -= 0.52;
    }

    // Keep inside arena bounds
    f.x = Math.max(bounds.left + 28, Math.min(bounds.right - 28, f.x));
    f.y = Math.max(bounds.top + 28, Math.min(bounds.bottom - 28, f.y));

    // Spawn water wake ripples if moving in water
    if (state.fieldType === "water" && Math.hypot(f.vx, f.vy) > 0.8 && !getPlatformUnder(f.x, f.y) && Math.random() < 0.25) {
      state.ripples.push({ x: f.x, y: f.y + 10, r: 6, maxR: 34, color: "rgba(220,245,255,0.75)", width: 2, alpha: 0.8 });
    }
  }

  // Update Projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.life -= dt;
    if (p.kind === "firespin") {
      p.angle += dt * 7.5;
      p.x = p.cx + Math.cos(p.angle) * p.radius;
      p.y = p.cy + Math.sin(p.angle) * (p.radius * 0.65);
    } else {
      p.x += p.vx;
      p.y += p.vy;
    }

    // Hit detection
    for (const f of state.fighters) {
      if (f === p.owner || f.ko || (!state.battleRoyale && f.team === p.owner.team)) continue;
      if (Math.hypot(f.x - p.x, f.y - p.y) < p.r + 24) {
        applyDamage(p.owner, f, p.dmg, (p.vx || 0) * 0.35, (p.vy || 0) * 0.35, {
          sleep: p.sleep,
          melee: p.kind === "melee_hitbox"
        });
        p.life = 0;
        break;
      }
    }

    if (p.life <= 0) state.projectiles.splice(i, 1);
  }

  // Update Surf Waves
  for (let i = state.waves.length - 1; i >= 0; i--) {
    const w = state.waves[i];
    w.life -= dt;
    w.x += w.dirX * w.speed;
    w.y += w.dirY * w.speed;

    // Tilt platforms under the Surf wave (like Lapras vs Venusaur in sample1.mp4 00:50!)
    for (const plat of state.platforms) {
      if (Math.hypot(plat.x - w.x, plat.y - w.y) < w.radius + plat.r) {
        plat.tiltX = w.dirX * 12;
        plat.tiltY = w.dirY * 12;
      }
    }

    for (const f of state.fighters) {
      if (f === w.owner || f.ko || w.hitSet.has(f)) continue;
      if (Math.hypot(f.x - w.x, f.y - w.y) < w.radius * 0.85) {
        w.hitSet.add(f);
        applyDamage(w.owner, f, w.dmg, w.dirX * 9, w.dirY * 9);
      }
    }
    if (w.life <= 0) state.waves.splice(i, 1);
  }

  // Update Whirlpool Tornados (like Gyarados in sample1.mp4 00:56-01:01!)
  for (let i = state.whirlpools.length - 1; i >= 0; i--) {
    const wp = state.whirlpools[i];
    wp.life -= dt;
    for (const f of state.fighters) {
      if (f === wp.owner || f.ko) continue;
      const dist = Math.hypot(f.x - wp.x, f.y - wp.y);
      if (dist < wp.radius * 1.45) {
        // Pull fighter into the vortex & lift them up the water cyclone column!
        f.x += (wp.x - f.x) * 0.08;
        f.y += (wp.y - f.y) * 0.08;
        const targetZ = Math.min(wp.height - 18, (1 - wp.life / wp.maxLife) * wp.height * 1.2);
        f.z += (targetZ - f.z) * 0.15;
        if (Math.random() < 0.18) {
          applyDamage(wp.owner, f, wp.dmg * 0.08, 0, 0);
        }
      }
    }
    if (wp.life <= 0) {
      // Freeze/shatter splash when tornado ends!
      spawnBurst(wp.x, wp.y, "#bfeaff", 35, 7);
      state.whirlpools.splice(i, 1);
    }
  }

  // Update Beams (Ice Beam, Hyper Beam, Hydro Pump, Lightning)
  for (let i = state.beams.length - 1; i >= 0; i--) {
    const b = state.beams[i];
    if (!b.hitApplied) {
      b.hitApplied = true;
      for (const f of state.fighters) {
        if (f === b.owner || f.ko) continue;
        // Distance from point to line segment
        const l2 = Math.pow(b.x2 - b.x1, 2) + Math.pow(b.y2 - b.y1, 2) || 1;
        let t = ((f.x - b.x1) * (b.x2 - b.x1) + (f.y - b.y1) * (b.y2 - b.y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const px = b.x1 + t * (b.x2 - b.x1);
        const py = b.y1 + t * (b.y2 - b.y1);
        if (Math.hypot(f.x - px, f.y - py) < b.width + 26) {
          applyDamage(b.owner, f, b.dmg, (b.x2 - b.x1) * 0.015, (b.y2 - b.y1) * 0.015, {
            freeze: b.kind === "ice"
          });
        }
      }
    }
    b.life -= dt;
    if (b.life <= 0) state.beams.splice(i, 1);
  }

  // Update Ripples, Particles & Recall Lasers
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const r = state.ripples[i];
    r.r += dt * 95;
    r.alpha -= dt * 0.9;
    if (r.alpha <= 0 || r.r >= r.maxR) state.ripples.splice(i, 1);
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }

  for (let i = state.recallLasers.length - 1; i >= 0; i--) {
    state.recallLasers[i].life -= dt;
    if (state.recallLasers[i].life <= 0) state.recallLasers.splice(i, 1);
  }

  updateHUD();
}

// Render Stadium, Field, Platforms, Pokémon & Custom Move Effects
function render() {
  ctx.save();
  if (state.cameraShake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * state.cameraShake,
      (Math.random() - 0.5) * state.cameraShake
    );
  }

  // 1. Stadium Outer Stands & Cheering Audience
  ctx.fillStyle = "#2b2d3c";
  ctx.fillRect(0, 0, W, H);

  for (const spectator of state.crowd) {
    const bob = Math.sin(state.time * 6 + spectator.phase) * 2.5;
    if (spectator.sprite) {
      const img = getSprite(spectator.sprite);
      if (img && img.complete && img.naturalWidth) {
        const maxDim = Math.max(img.naturalWidth, img.naturalHeight, 1);
        const sw = (img.naturalWidth / maxDim) * 32;
        const sh = (img.naturalHeight / maxDim) * 32;
        ctx.drawImage(img, spectator.x - sw * 0.5, spectator.y - sh + 10 + bob, sw, sh);
        continue;
      }
    }
    ctx.fillStyle = spectator.color;
    ctx.fillRect(spectator.x - 5, spectator.y - 5 + bob, 10, 10);
    ctx.fillStyle = "#fcd34d";
    ctx.fillRect(spectator.x - 4, spectator.y - 11 + bob, 8, 6);
  }

  // Stadium LED Ticker Banner (matches sample1.mp4)
  ctx.fillStyle = "#18181b";
  ctx.fillRect(bounds.left - 18, bounds.top - 26, bounds.right - bounds.left + 36, 20);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.left - 14, bounds.top - 26, bounds.right - bounds.left + 28, 20);
  ctx.clip();
  ctx.fillStyle = "#facc15";
  ctx.font = "bold 12px monospace";
  const bannerText =
    "POKÉMON LEAGUE • STADIUM & WATER ARENA 2D • PRESS [F] FOR FIELD CHANGE • PRESS [B] FOR BATTLE ROYALE • ";
  for (let x = -state.tickerOffset; x < W + 400; x += 680) {
    ctx.fillText(bannerText, x, bounds.top - 12);
  }
  ctx.restore();

  // Stadium Stone Coping Border
  ctx.fillStyle = "#6b7280";
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(
    bounds.left - 14,
    bounds.top - 6,
    bounds.right - bounds.left + 28,
    bounds.bottom - bounds.top + 20,
    28
  );
  ctx.fill();
  ctx.stroke();

  // Clip inside inner arena field
  const fw = bounds.right - bounds.left;
  const fh = bounds.bottom - bounds.top;
  const cx = (bounds.left + bounds.right) * 0.5;
  const cy = (bounds.top + bounds.bottom) * 0.5;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(bounds.left, bounds.top, fw, fh, 22);
  ctx.clip();

  // 2. Draw Arena Floor (Grass vs Water vs Field Change Transition)
  if (state.fieldTransition.active && state.fieldTransition.phase === 0) {
    // Dark mechanical under-basin exposed in the middle while grass splits apart!
    drawMechanicalBasin(cx, cy, fw, fh);
    const splitOffset = state.fieldTransition.progress * (fw * 0.52);
    ctx.save();
    ctx.translate(-splitOffset, 0);
    drawGrassField(bounds.left, bounds.top, fw * 0.5, fh, cx, cy);
    ctx.restore();
    ctx.save();
    ctx.translate(splitOffset, 0);
    drawGrassField(cx, bounds.top, fw * 0.5, fh, cx, cy);
    ctx.restore();

    // Steam clouds along the splitting seam
    for (let y = bounds.top; y <= bounds.bottom; y += 28) {
      ctx.fillStyle = "rgba(235, 242, 250, 0.72)";
      const sx = cx + Math.sin(state.time * 12 + y) * 10;
      ctx.beginPath();
      ctx.arc(sx - splitOffset, y, 16 + Math.sin(y) * 5, 0, Math.PI * 2);
      ctx.arc(sx + splitOffset, y, 16 + Math.cos(y) * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (state.fieldTransition.active && state.fieldTransition.phase === 1) {
    drawMechanicalBasin(cx, cy, fw, fh);
    const fillW = fw * 0.55 * state.fieldTransition.progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, fillW, fh);
    ctx.rect(bounds.right - fillW, bounds.top, fillW, fh);
    ctx.clip();
    drawWaterSurface();
    ctx.restore();
    drawPlatformsAndIce();
  } else if (state.fieldType === "grass") {
    drawGrassField(bounds.left, bounds.top, fw, fh, cx, cy);
  } else {
    drawWaterSurface();
    drawPlatformsAndIce();
  }

  // 3. Draw Water Ripples
  for (const r of state.ripples) {
    drawEllipseRing(ctx, r.x, r.y, r.r, r.r * 0.55, r.color, r.width, Math.max(0, r.alpha));
  }

  // 4. Draw Surf Giant Waves
  for (const w of state.waves) {
    drawSurfWave(ctx, w.x, w.y, w.dirX, w.dirY, w.radius, state.time, Math.min(1, w.life * 2));
  }

  // 5. Draw Fighters (sorted by Y for proper 2.5D depth)
  const sortedFighters = [...state.fighters].sort((a, b) => a.y - b.y);
  for (const f of sortedFighters) {
    drawFighter(f);
  }

  // 6. Draw Whirlpool Tornados (like Gyarados in sample1.mp4 00:56-01:01)
  for (const wp of state.whirlpools) {
    drawWhirlpoolTornado(ctx, wp.x, wp.y, wp.radius, wp.height, state.time, Math.min(1, wp.life * 1.5));
  }

  // 7. Draw Projectiles
  for (const p of state.projectiles) {
    drawProjectile(p);
  }

  // 8. Draw Beams (Ice Beam, Hyper Beam, Hydro Pump, Lightning)
  for (const b of state.beams) {
    drawBeam(b);
  }

  // 9. Draw Pokéball Recall Red Lasers
  for (const rl of state.recallLasers) {
    ctx.save();
    ctx.strokeStyle = "#ff2a55";
    ctx.lineWidth = 6 * (rl.life / rl.maxLife);
    ctx.shadowColor = "#ff2a55";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(rl.x1, rl.y1);
    ctx.lineTo(rl.x2, rl.y2);
    ctx.stroke();
    ctx.restore();
  }

  // 10. Draw Particles
  for (const pt of state.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore(); // End inner arena clip
  ctx.restore(); // End camera shake
}

function drawGrassField(x, y, w, h, cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const stripeW = 48;
  for (let sx = bounds.left; sx < bounds.right; sx += stripeW) {
    const idx = Math.floor((sx - bounds.left) / stripeW);
    ctx.fillStyle = idx % 2 === 0 ? "#2d6a31" : "#347839";
    ctx.fillRect(sx, bounds.top, stripeW + 1, bounds.bottom - bounds.top);
  }

  // Center line & circle
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, bounds.top);
  ctx.lineTo(cx, bounds.bottom);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 128, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawMechanicalBasin(cx, cy, fw, fh) {
  ctx.fillStyle = "#141923";
  ctx.fillRect(bounds.left, bounds.top, fw, fh);
  ctx.strokeStyle = "#222b3a";
  ctx.lineWidth = 2;
  for (let x = bounds.left; x < bounds.right; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, bounds.top);
    ctx.lineTo(x, bounds.bottom);
    ctx.stroke();
  }
  for (let y = bounds.top; y < bounds.bottom; y += 64) {
    ctx.beginPath();
    ctx.moveTo(bounds.left, y);
    ctx.lineTo(bounds.right, y);
    ctx.stroke();
  }
}

function drawWaterSurface() {
  const fw = bounds.right - bounds.left;
  const fh = bounds.bottom - bounds.top;
  const grad = ctx.createLinearGradient(0, bounds.top, 0, bounds.bottom);
  grad.addColorStop(0, "#155293");
  grad.addColorStop(0.5, "#11457d");
  grad.addColorStop(1, "#0d3562");
  ctx.fillStyle = grad;
  ctx.fillRect(bounds.left, bounds.top, fw, fh);

  // Shallow pool border tile ledge
  ctx.strokeStyle = "#4895ef";
  ctx.lineWidth = 10;
  ctx.strokeRect(bounds.left + 4, bounds.top + 4, fw - 8, fh - 8);

  // Animated pixel water wave highlights
  ctx.fillStyle = "rgba(173, 224, 255, 0.35)";
  for (let y = bounds.top + 24; y < bounds.bottom - 16; y += 34) {
    for (let x = bounds.left + 28; x < bounds.right - 28; x += 68) {
      const wx = x + Math.sin(state.time * 2.2 + y * 0.1) * 14;
      const wy = y + Math.cos(state.time * 1.8 + x * 0.08) * 3;
      ctx.fillRect(wx, wy, 18, 3);
      ctx.fillRect(wx + 6, wy + 4, 10, 2);
    }
  }
}

function drawPlatformsAndIce() {
  // Draw Ice Floes created by Ice Beam
  for (const floe of state.iceFloes) {
    ctx.save();
    ctx.translate(floe.x, floe.y);
    ctx.fillStyle = "rgba(186, 238, 255, 0.9)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const sides = 7;
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const rad = floe.r * (0.78 + 0.22 * Math.sin(floe.seed + i * 2.3));
      const px = Math.cos(ang) * rad;
      const py = Math.sin(ang) * rad * 0.72;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Draw Floating Wooden & Pokéball Platforms
  for (const p of state.platforms) {
    ctx.save();
    const bob = Math.sin(state.time * 2.6 + p.x * 0.02) * 2;
    ctx.translate(p.x + p.tiltX * 0.4, p.y + bob + p.tiltY * 0.4);
    const ry = p.r * 0.68;

    // Water ring around base
    ctx.strokeStyle = "rgba(215, 243, 255, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 10, p.r * 1.08, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (p.kind === "pokeball") {
      // 3D Base cylinder
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.ellipse(0, 10, p.r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Top Half Red
      ctx.fillStyle = "#ef233c";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, ry, 0, Math.PI, Math.PI * 2);
      ctx.fill();

      // Bottom Half White
      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, ry, 0, 0, Math.PI);
      ctx.fill();

      // Center Black Band & Button
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-p.r, 0);
      ctx.lineTo(p.r, 0);
      ctx.stroke();

      ctx.fillStyle = "#f8fafc";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r * 0.28, ry * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Wooden Barrel / Floating Disk Platform
      const sideH = p.height || 14;
      ctx.fillStyle = "#5c3a21";
      ctx.beginPath();
      ctx.ellipse(0, sideH, p.r, ry, 0, 0, Math.PI);
      ctx.lineTo(-p.r, 0);
      ctx.lineTo(p.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#2b180a";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Top Wood Planks
      ctx.fillStyle = "#8d5b34";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Plank lines
      ctx.strokeStyle = "rgba(43, 24, 10, 0.45)";
      ctx.lineWidth = 1.5;
      for (let lx = -p.r * 0.7; lx <= p.r * 0.7; lx += p.r * 0.35) {
        const halfH = Math.sqrt(Math.max(0, 1 - Math.pow(lx / p.r, 2))) * ry;
        ctx.beginPath();
        ctx.moveTo(lx, -halfH);
        ctx.lineTo(lx, halfH);
        ctx.stroke();
      }

      if (p.kind === "center_stage") {
        ctx.fillStyle = "#7c4d2b";
        ctx.fillRect(-26, sideH * 0.25, 52, 14);
        ctx.strokeStyle = "#2b180a";
        ctx.strokeRect(-26, sideH * 0.25, 52, 14);
        ctx.fillStyle = "#d6a87c";
        ctx.font = "bold 7px monospace";
        ctx.textAlign = "center";
        ctx.fillText("POKÉMON", 0, sideH * 0.25 + 6);
        ctx.fillText("ARENA 2D", 0, sideH * 0.25 + 12);
      }
    }

    ctx.restore();
  }
}

function drawFighter(f) {
  ctx.save();
  const img = getSprite(f.sprite);
  const size = 68 * (f.data.scale || 1.35);
  const bob = Math.sin(state.time * 7 + f.x * 0.05) * 2.5;

  // Shadow on floor/platform
  ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + 16, size * 0.28, size * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Player indicator ring
  if (f.isPlayer) {
    drawEllipseRing(ctx, f.x, f.y + 16, size * 0.34, size * 0.16, "#4ade80", 2.5, 0.85);
  }

  // Draw High-Res 8-Direction Articulated Pokémon sprite (breathing, shoulders, head, stride/swim)
  ctx.save();
  ctx.translate(f.x, f.y + 14 - f.z);
  if (f.ko) {
    ctx.translate(0, -size * 0.25);
    ctx.rotate(Math.PI * 0.45);
    ctx.filter = "grayscale(0.8) brightness(0.75)";
  }
  if (typeof drawArticulatedPokemon === "function") {
    drawArticulatedPokemon(ctx, f, img, size * 0.96, state.time);
  } else if (img && img.complete) {
    if (f.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -size * 0.5, -size * 0.85, size, size);
  }
  ctx.restore();

  // Frozen Ice Block Effect
  if (f.frozenTimer > 0) {
    ctx.fillStyle = "rgba(125, 226, 255, 0.52)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(f.x - 28, f.y + 14);
    ctx.lineTo(f.x - 22, f.y - 36);
    ctx.lineTo(f.x + 4, f.y - 48);
    ctx.lineTo(f.x + 26, f.y - 30);
    ctx.lineTo(f.x + 28, f.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Hypnosis Sleep Dream Bubble (matches sample1.mp4 00:09!)
  if (f.sleepTimer > 0) {
    const bx = f.x + 26;
    const by = f.y - 54;
    ctx.fillStyle = "rgba(224, 242, 254, 0.94)";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(bx, by, 26, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const dreamImg = POKEMON_DATA.nidorina ? getSprite(POKEMON_DATA.nidorina.sprite) : null;
    if (dreamImg && dreamImg.complete) {
      ctx.drawImage(dreamImg, bx - 20, by - 20, 40, 40);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px monospace";
    ctx.fillText("Zzz", f.x + 4, f.y - 28 - (state.time * 12) % 10);
  }

  ctx.restore();
}

function drawProjectile(p) {
  ctx.save();
  if (p.kind === "fire" || p.kind === "firespin") {
    const ratio = p.life / p.maxLife;
    // Outer smoke puff
    ctx.fillStyle = "rgba(235, 240, 245, 0.55)";
    ctx.beginPath();
    ctx.arc(p.x - (p.vx || 0) * 1.4, p.y - (p.vy || 0) * 1.4, p.r * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // Inner red-orange flame ball
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#fff3b0");
    grad.addColorStop(0.45, "#ff7b00");
    grad.addColorStop(1, "rgba(217, 4, 41, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1.2 - ratio * 0.2), 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "water" || p.kind === "muddy") {
    ctx.fillStyle = p.kind === "muddy" ? "#8d6e63" : "#38bdf8";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.kind === "hypnosis_ring") {
    drawEllipseRing(ctx, p.x, p.y, p.r, p.r * 0.85, "#f43f5e", 3, p.life / p.maxLife);
  } else if (p.kind === "shadowball") {
    const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#f3e8ff");
    grad.addColorStop(0.5, "#9333ea");
    grad.addColorStop(1, "#3b0764");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "star") {
    ctx.fillStyle = "#fde047";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.kind === "leaf") {
    ctx.fillStyle = "#4ade80";
    ctx.strokeStyle = "#166534";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r, p.r * 0.45, state.time * 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (p.kind === "melee_hitbox") {
    drawEllipseRing(ctx, p.x, p.y, p.r, p.r * 0.65, "#ffffff", 3, p.life / p.maxLife);
  }
  ctx.restore();
}

function drawBeam(b) {
  ctx.save();
  const alpha = Math.min(1, (b.life / b.maxLife) * 1.4);
  ctx.globalAlpha = alpha;

  if (b.kind === "lightning") {
    drawLightningBolt(ctx, b.x1, b.y1, b.x2, b.y2, "#fef08a", b.width + 4, 28);
    drawLightningBolt(ctx, b.x1, b.y1, b.x2, b.y2, "#ffffff", Math.max(2, b.width - 2), 16);
  } else if (b.kind === "ice") {
    drawLightningBolt(ctx, b.x1, b.y1, b.x2, b.y2, "#38bdf8", b.width, 14);
    drawLightningBolt(ctx, b.x1, b.y1, b.x2, b.y2, "#e0f2fe", b.width * 0.45, 8);
  } else {
    // Hyper Beam (Golden-Orange) or Hydro Pump (Azure-White)
    const outerCol = b.kind === "hydro" ? "#38bdf8" : "#f97316";
    const innerCol = b.kind === "hydro" ? "#e0f2fe" : "#fef08a";

    ctx.strokeStyle = outerCol;
    ctx.lineWidth = b.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();

    ctx.strokeStyle = innerCol;
    ctx.lineWidth = b.width * 0.52;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();

    // Spiral rings along the Hyper Beam (matches sample1.mp4 01:03 & 01:06!)
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const rx = b.x1 + (b.x2 - b.x1) * t;
      const ry = b.y1 + (b.y2 - b.y1) * t;
      drawEllipseRing(ctx, rx, ry, b.width * 0.45, b.width * 0.72, "#ffffff", 3, alpha);
    }
  }
  ctx.restore();
}

// Enrich POKEMON_DATA with ../pokeData/pokeData.js (Ability, Height, Weight, Shape, Base Stats, BST, Type Matchups, Training, Breeding, Evolution, Moves)
if (typeof window.getPokeData === "function") {
  Object.values(POKEMON_DATA).forEach(p => {
    const pd = window.getPokeData(p.dex) || window.getPokeData(p.id);
    if (pd) {
      p.pokeData = pd;
    }
    if (p.megas) {
      p.megas.forEach(m => {
        m.pokeData = window.getPokeData(m.formSlug) || p.pokeData;
      });
    }
    if (p.gmaxs) {
      p.gmaxs.forEach(g => {
        g.pokeData = window.getPokeData(g.formSlug) || p.pokeData;
      });
    }
    if (p.regionals) {
      p.regionals.forEach(r => {
        r.pokeData = window.getPokeData(r.formSlug) || p.pokeData;
      });
    }
  });
}

function getActiveFighterPokeData(f) {
  if (!f || !window.getPokeData) return null;
  if (f.megaMode > 0 && f.data.megas && f.data.megas[f.megaMode - 1]) {
    const m = f.data.megas[f.megaMode - 1];
    return window.getPokeData(m.formSlug) || f.data.pokeData;
  }
  if (f.gmaxMode > 0 && f.data.gmaxs && f.data.gmaxs[f.gmaxMode - 1]) {
    const g = f.data.gmaxs[f.gmaxMode - 1];
    return window.getPokeData(g.formSlug) || f.data.pokeData;
  }
  return f.data.pokeData || window.getPokeData(f.data.dex) || window.getPokeData(f.id);
}

function togglePokeDataModal(forceTargetTeam = 1) {
  const modal = document.getElementById("pokedata-modal");
  const body = document.getElementById("pokedata-modal-body");
  if (!modal || !body) return;
  if (modal.style.display === "flex") {
    modal.style.display = "none";
    return;
  }
  const f = state.fighters.find(o => o.team === forceTargetTeam) || state.fighters[0];
  const pd = getActiveFighterPokeData(f);
  if (!pd) return;

  const bs = pd.baseStats;
  const statRow = (label, val, r) => {
    const pct = Math.min(100, Math.round((val / 255) * 100));
    const col = val >= 120 ? "#22c55e" : val >= 90 ? "#38bdf8" : val >= 60 ? "#facc15" : "#f97316";
    return `<div style="display:grid;grid-template-columns:110px 42px 1fr 150px;align-items:center;gap:8px;margin:4px 0;font-size:12px;">
      <span style="color:#94a3b8;font-weight:700;">${label}</span>
      <span style="font-weight:800;text-align:right;">${val}</span>
      <div style="background:#1e293b;height:10px;border-radius:5px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:${col};"></div></div>
      <span style="color:#64748b;font-size:11px;">Lv50:${r.lv50.min}-${r.lv50.max} / Lv100:${r.lv100.min}-${r.lv100.max}</span>
    </div>`;
  };

  const abilHtml = (pd.abilities || [])
    .map(
      a =>
        `<div style="background:#1e293b;padding:6px 10px;border-radius:8px;margin-bottom:5px;font-size:12px;">
          <b>${a.jpName} (${a.name})</b> ${a.isHidden ? '<span style="color:#f43f5e;font-size:10px;">[夢特性/Hidden]</span>' : ""}
          <div style="color:#cbd5e1;font-size:11px;margin-top:2px;">${a.jpDescription || a.description}</div>
        </div>`
    )
    .join("");

  const tm = pd.typeMatchups || {};
  const badgeList = (arr, mult, bg) =>
    (arr || []).map(t => `<span style="background:${bg};padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700;margin:2px;display:inline-block;">${t.toUpperCase()} ×${mult}</span>`).join("");

  const lvMovesHtml = ((pd.moves && pd.moves.levelUp) || [])
    .slice(0, 14)
    .map(
      m =>
        `<tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:3px 6px;color:#38bdf8;">Lv.${m.level || 1}</td>
          <td style="padding:3px 6px;font-weight:700;">${m.jpName} <span style="color:#64748b;font-weight:400;">(${m.name})</span></td>
          <td style="padding:3px 6px;text-transform:uppercase;font-size:11px;">${m.type}</td>
          <td style="padding:3px 6px;font-size:11px;">${m.category}</td>
          <td style="padding:3px 6px;text-align:right;">${m.power || "—"}</td>
          <td style="padding:3px 6px;text-align:right;">${m.accuracy ? m.accuracy + "%" : "—"}</td>
          <td style="padding:3px 6px;text-align:right;">${m.pp}</td>
        </tr>`
    )
    .join("");

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:14px;">
        <img src="${pd.sprite}" style="width:56px;height:56px;image-rendering:pixelated;object-fit:contain;" />
        <img src="${pd.backSprite}" style="width:56px;height:56px;image-rendering:pixelated;object-fit:contain;" />
        <div>
          <div style="font-size:20px;font-weight:900;">#${String(pd.dex).padStart(4, "0")} ${pd.jpName} <span style="color:#94a3b8;font-size:15px;">(${pd.name})</span></div>
          <div style="font-size:12px;color:#38bdf8;">${pd.jpGenus || ""} / ${pd.genus || ""} ｜ Types: ${(tm.types || []).map(t => t.toUpperCase()).join(" / ")}</div>
        </div>
      </div>
      <button onclick="document.getElementById('pokedata-modal').style.display='none'" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-weight:800;cursor:pointer;">✕ 閉じる (I)</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div>
        <div style="font-weight:800;color:#38bdf8;margin-bottom:6px;font-size:13px;">■ Base Stats & Total (BST: ${pd.baseStatTotal})</div>
        ${statRow("HP", bs.hp, bs.ranges.hp)}
        ${statRow("Attack", bs.attack, bs.ranges.attack)}
        ${statRow("Defense", bs.defense, bs.ranges.defense)}
        ${statRow("Sp. Atk", bs.specialAttack, bs.ranges.specialAttack)}
        ${statRow("Sp. Def", bs.specialDefense, bs.ranges.specialDefense)}
        ${statRow("Speed", bs.speed, bs.ranges.speed)}

        <div style="font-weight:800;color:#38bdf8;margin:12px 0 6px;font-size:13px;">■ Abilities (特性)</div>
        ${abilHtml}

        <div style="font-weight:800;color:#38bdf8;margin:12px 0 6px;font-size:13px;">■ Height / Weight / Shape</div>
        <div style="background:#1e293b;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.6;">
          <b>Height (高さ):</b> ${pd.height.display} ｜ <b>Weight (重さ):</b> ${pd.weight.display}<br/>
          <b>Shape (体型):</b> ${pd.shape.jpName} (${pd.shape.name} / ${pd.shape.awesomeName})
        </div>
      </div>

      <div>
        <div style="font-weight:800;color:#38bdf8;margin-bottom:6px;font-size:13px;">■ Type Matchups (防御タイプ相性)</div>
        <div style="background:#1e293b;padding:8px 10px;border-radius:8px;font-size:12px;margin-bottom:10px;">
          ${ badgeList(tm.weaknesses4x, "4", "#b91c1c") }
          ${ badgeList(tm.weaknesses2x, "2", "#ea580c") }
          ${ badgeList(tm.resistances0_5x, "0.5", "#0284c7") }
          ${ badgeList(tm.resistances0_25x, "0.25", "#15803d") }
          ${ badgeList(tm.immunities0x, "0", "#475569") }
        </div>

        <div style="font-weight:800;color:#38bdf8;margin-bottom:6px;font-size:13px;">■ Training & Breeding (育成・タマゴ)</div>
        <div style="background:#1e293b;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.65;margin-bottom:10px;">
          <b>EV Yield:</b> ${pd.training.evYieldTextJa} (${pd.training.evYieldText}) ｜ <b>Catch Rate:</b> ${pd.training.catchRateDisplay}<br/>
          <b>Base Friendship:</b> ${pd.training.baseFriendship} ｜ <b>Base Exp:</b> ${pd.training.baseExperience} ｜ <b>Growth:</b> ${pd.training.growthRate.name}<br/>
          <b>Egg Groups:</b> ${(pd.breeding.eggGroups || []).map(e => `${e.jpName}(${e.name})`).join(", ")}<br/>
          <b>Gender:</b> ${pd.breeding.genderRatio.displayJa} ｜ <b>Egg Cycles:</b> ${pd.breeding.eggCycles.display}
        </div>

        <div style="font-weight:800;color:#38bdf8;margin-bottom:6px;font-size:13px;">■ Evolution (進化系統)</div>
        <div style="background:#1e293b;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.5;">
          <div>${pd.evolution.summaryTextJa || pd.evolution.summaryText}</div>
          <div style="color:#94a3b8;font-size:11px;margin-top:2px;">${pd.evolution.summaryText}</div>
        </div>
      </div>
    </div>

    <div style="font-weight:800;color:#38bdf8;margin:12px 0 6px;font-size:13px;">■ Moves (習得わざ一覧 - 全${pd.moves.totalUniqueMoves}種中 主要レベル技)</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;background:#1e293b;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#334155;text-align:left;">
          <th style="padding:4px 6px;">Lv</th><th style="padding:4px 6px;">Move (技名)</th><th style="padding:4px 6px;">Type</th><th style="padding:4px 6px;">Cat</th><th style="padding:4px 6px;text-align:right;">Pow</th><th style="padding:4px 6px;text-align:right;">Acc</th><th style="padding:4px 6px;text-align:right;">PP</th>
        </tr>
      </thead>
      <tbody>${lvMovesHtml}</tbody>
    </table>
  `;
  modal.style.display = "flex";
}

const btnPokeData = document.getElementById("btn-pokedata");
if (btnPokeData) {
  btnPokeData.onclick = () => togglePokeDataModal(1);
  btnPokeData.oncontextmenu = e => {
    e.preventDefault();
    togglePokeDataModal(2);
  };
}
window.addEventListener("keydown", e => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.key.toLowerCase() === "i") {
    togglePokeDataModal(e.shiftKey ? 2 : 1);
  }
});

// Main Loop
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

// Boot Game
buildArenaGeometry();
initRosterStrip();
startWaterScene();
requestAnimationFrame(loop);
