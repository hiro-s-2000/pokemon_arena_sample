// Pokémon Arena 2D - Main Engine (Grass Stadium, Field Change Cutscene, Water Arena & Battle Royale)

const canvas = document.getElementById("arenaCanvas");
const ctx = canvas.getContext("2d");
const fxCanvas = document.getElementById("fxCanvas");
const fxCtx = fxCanvas ? fxCanvas.getContext("2d") : ctx;
const gameWrapper = document.getElementById("game-wrapper");

let RENDER_DPR = 1;
let W = window.innerWidth;
let H = window.innerHeight;

function sizeRenderCanvas(targetCanvas, targetCtx, width, height, dpr) {
  if (!targetCanvas || !targetCtx) return;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  targetCanvas.style.width = `${width}px`;
  targetCanvas.style.height = `${height}px`;
  if (targetCanvas.width !== pixelWidth || targetCanvas.height !== pixelHeight) {
    targetCanvas.width = pixelWidth;
    targetCanvas.height = pixelHeight;
  }
  targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resizeRenderSurfaces() {
  W = window.innerWidth;
  H = window.innerHeight;
  RENDER_DPR = 1;
  sizeRenderCanvas(canvas, ctx, W, H, RENDER_DPR);
  if (fxCanvas && fxCtx !== ctx) sizeRenderCanvas(fxCanvas, fxCtx, W, H, RENDER_DPR);
}

resizeRenderSurfaces();

let resizeFrame = 0;
window.addEventListener("resize", () => {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    resizeRenderSurfaces();
    buildArenaGeometry();
  });
});

// Preload sprite images from pokeSprite (including _reverse.gif counterpart so 4-directional turning has zero delay)
const IMG_CACHE = {};
function getSprite(src) {
  if (!src) return null;
  if (!IMG_CACHE[src]) {
    const img = new Image();
    img.src = src;
    IMG_CACHE[src] = img;
    const isReverseSprite = /(?:_reverse|-reverse)\.gif(?:[?#]|$)/.test(src);
    if (typeof getReverseGifPath === "function" && !isReverseSprite) {
      const revSrc = getReverseGifPath(src);
      if (revSrc && !IMG_CACHE[revSrc]) {
        const revImg = new Image();
        revImg.src = revSrc;
        IMG_CACHE[revSrc] = revImg;
      }
    }
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

// Infinite World & Sector Configuration
const WORLD_ORIGIN_X = Math.floor(window.innerWidth * 0.5);
const WORLD_ORIGIN_Y = Math.floor(window.innerHeight * 0.5);
const SECTOR_W = 1600;
const SECTOR_H = 1120;

// Game State
const state = {
  time: 0,
  camX: WORLD_ORIGIN_X,
  camY: WORLD_ORIGIN_Y,
  camInitialized: false,
  fieldType: "terrain", // "terrain", "grass", or "water"
  fieldTransition: {
    active: false,
    phase: 0, // 0: split grass, 1: fill water
    progress: 0,
    targetField: "water"
  },
  battleRoyale: false,
  enemyAttackEnabled: false, // Default FALSE so enemy Pokémon do NOT attack while practicing controls!
  autoBattleChoreography: false, // Optional spectator mode where P1 also auto-battles
  lastPlayerInputTime: -999,
  hitStopTimer: 0,
  cameraShake: 0,
  screenFlash: { life: 0, maxLife: 0, alpha: 0, color: "#ffffff" },
  tickerOffset: 0,
  subtitleTimer: 0,
  koTimer: 0,
  clash: { active: false, x: 0, y: 0, timer: 0, f1: null, f2: null },
  sectorMap: new Map(),
  activeSectors: [],
  platforms: [],
  terraces: [],
  iceFloes: [],
  ripples: [],
  particles: [],
  projectiles: [],
  slashes: [],
  damagePopups: [],
  beams: [],
  waves: [],
  waterSurges: [],
  whirlpools: [],
  groundBreaks: [],
  fireBlasts: [],
  recallLasers: [],
  crowd: [],
  fighters: [],
  p1Team: ["charizard", "blastoise", "pikachu", "sandslash", "gengar"],
  p2Team: ["sandslash", "gengar", "lapras"],
  p1Index: 0,
  p2Index: 0
};

// Input state (Keyboard + Mouse + Multi-Touch Virtual Joystick + Touch-to-Move)
const keys = {};
const mouse = { x: W * 0.65, y: H * 0.5 };
const vjoy = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  dx: 0,
  dy: 0,
  mag: 0,
  maxRadius: 44
};
const touchMove = {
  active: false,
  pointerId: null,
  worldX: 0,
  worldY: 0,
  indicatorAlpha: 0
};
let rosterSelectTargetTeam = 1; // 1 = P1, 2 = P2 (for touch devices without right-click)
let combatEffectSerial = 1;

function nextCombatEffectSeed() {
  combatEffectSerial = (combatEffectSerial * 1664525 + 1013904223) >>> 0;
  return combatEffectSerial;
}

function getWorldMouse() {
  return {
    x: mouse.x + state.camX - W * 0.5,
    y: mouse.y + state.camY - H * 0.5
  };
}

function screenToWorld(clientX, clientY) {
  return {
    x: clientX + state.camX - W * 0.5,
    y: clientY + state.camY - H * 0.5
  };
}

window.addEventListener("keydown", e => {
  if (e.target && e.target.tagName === "INPUT") return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "z", "x", "q", "e", "1", "2", "3", "4"].includes(k)) {
    state.lastPlayerInputTime = state.time;
    touchMove.active = false;
  }
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
  } else if (k === "p") {
    toggleEnemyAttackSetting();
  }
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

window.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// Dismiss Menu 1 (#bottom-right-panel), Menu 2 (#top-menu-panel), or #pokedata-modal when clicking/tapping outside their frame
function tryDismissOpenMenusOnOutsideInteraction(target) {
  let dismissedAny = false;

  // 1. PokéData Modal: close if clicking on the dark backdrop outside #pokedata-modal-card
  const modal = document.getElementById("pokedata-modal");
  if (modal && modal.style.display === "flex") {
    if (!target || !target.closest("#pokedata-modal-card, #btn-pokedata")) {
      modal.style.display = "none";
      dismissedAny = true;
    }
  }

  // 2. Menu 1 (#bottom-right-panel): close if clicking/tapping outside #bottom-right-panel and its toggle buttons
  const bottomRightPanel = document.getElementById("bottom-right-panel");
  if (bottomRightPanel && !bottomRightPanel.classList.contains("roster-hidden")) {
    if (
      !target ||
      !target.closest("#bottom-right-panel, #btn-toggle-roster, #btn-open-roster-quick")
    ) {
      bottomRightPanel.classList.add("roster-hidden");
      dismissedAny = true;
    }
  }

  // 3. Menu 2 (#top-menu-panel): close if clicking/tapping outside #top-menu-panel and its toggle button
  const topMenuPanel = document.getElementById("top-menu-panel");
  if (topMenuPanel && !topMenuPanel.classList.contains("menu-hidden")) {
    if (!target || !target.closest("#top-menu-panel, #btn-open-top-menu")) {
      topMenuPanel.classList.add("menu-hidden");
      dismissedAny = true;
    }
  }

  return dismissedAny;
}

window.addEventListener("mousedown", e => {
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
  if (tryDismissOpenMenusOnOutsideInteraction(e.target)) {
    return;
  }
  if (
    e.target &&
    e.target.closest("#top-hud, #center-top-controls, #skill-hud, #bottom-right-panel, #pokedata-modal, #mobile-controls-layer, #ui-layer")
  ) {
    return;
  }
  state.lastPlayerInputTime = state.time;
  if (e.button === 0) triggerPlayerSkill(0);
  if (e.button === 2) triggerPlayerSkill(1);
});

window.addEventListener("contextmenu", e => e.preventDefault());

// Full-screen viewport bounds (spectators & outer stands removed; map scrolls infinitely)
let bounds = { left: 0, right: W, top: 0, bottom: H };

function createSectorPlatforms(sx, sy) {
  const scx = WORLD_ORIGIN_X + sx * SECTOR_W;
  const scy = WORLD_ORIGIN_Y + sy * SECTOR_H;
  const jx = sx === 0 && sy === 0 ? 0 : Math.sin(sx * 12.9898 + sy * 78.233) * 40;
  const jy = sx === 0 && sy === 0 ? 0 : Math.cos(sx * 43.123 + sy * 19.753) * 32;

  // Map objects scaled up (~1.9x diameter / ~3.6x area) so platforms are bold, spacious landmarks!
  return [
    // 0: Left Giant Pokéball platform (r=118, diameter 236px!)
    { x: scx - 470 + jx, y: scy + 32 + jy, r: 118, kind: "pokeball", tiltX: 0, tiltY: 0, sx, sy },
    // 1: Right Giant Pokéball platform (r=118, diameter 236px!)
    { x: scx + 470 - jx, y: scy + 32 - jy, r: 118, kind: "pokeball", tiltX: 0, tiltY: 0, sx, sy },
    // 2: Center Giant Wooden Stage (r=132, diameter 264px!)
    { x: scx + jx * 0.35, y: scy + 16 + jy * 0.35, r: 132, kind: "center_stage", height: 34, tiltX: 0, tiltY: 0, sx, sy },
    // 3: Upper-left Large Wooden platform (r=96, diameter 192px!)
    { x: scx - 320 - jx * 0.4, y: scy - 275 + jy * 0.4, r: 96, kind: "wood", height: 22, tiltX: 0, tiltY: 0, sx, sy },
    // 4: Lower-right Large Wooden platform (r=92, diameter 184px!)
    { x: scx + 275 + jx * 0.4, y: scy + 310 - jy * 0.4, r: 92, kind: "wood", height: 22, tiltX: 0, tiltY: 0, sx, sy },
    // 5: Upper-right Large Wooden platform (r=88, diameter 176px!)
    { x: scx + 350 - jx * 0.35, y: scy - 245 - jy * 0.35, r: 88, kind: "wood", height: 22, tiltX: 0, tiltY: 0, sx, sy },
    // 6: Lower-left Large Wooden platform (r=88, diameter 176px!)
    { x: scx - 365 + jx * 0.35, y: scy + 325 + jy * 0.35, r: 88, kind: "wood", height: 22, tiltX: 0, tiltY: 0, sx, sy },
    // 7: North Bridge Giant Pokéball platform (r=106, diameter 212px!)
    { x: scx + 25 + jx * 0.5, y: scy - 440, r: 106, kind: "pokeball", tiltX: 0, tiltY: 0, sx, sy },
    // 8: South Bridge Large Wooden platform (r=92, diameter 184px!)
    { x: scx - 25 - jx * 0.5, y: scy + 455, r: 92, kind: "wood", height: 22, tiltX: 0, tiltY: 0, sx, sy }
  ];
}

function ensureVisibleSectors(camX = state.camX, camY = state.camY) {
  const centerSx = Math.round((camX - WORLD_ORIGIN_X) / SECTOR_W);
  const centerSy = Math.round((camY - WORLD_ORIGIN_Y) / SECTOR_H);

  const orderedSectors = [];
  const allPlatforms = [];
  const allTerraces = [];

  // Put the camera's current sector first so state.platforms[0..6] always refer to the local sector's main platforms
  const offsets = [
    [0, 0],
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1]
  ];

  for (const [dx, dy] of offsets) {
    const sx = centerSx + dx;
    const sy = centerSy + dy;
    const key = `${sx},${sy}`;
    let sec = state.sectorMap.get(key);
    if (!sec) {
      sec = {
        sx,
        sy,
        cx: WORLD_ORIGIN_X + sx * SECTOR_W,
        cy: WORLD_ORIGIN_Y + sy * SECTOR_H,
        platforms: createSectorPlatforms(sx, sy),
        terrain: typeof createTerracedSector === "function"
          ? createTerracedSector(sx, sy, WORLD_ORIGIN_X + sx * SECTOR_W, WORLD_ORIGIN_Y + sy * SECTOR_H)
          : null
      };
      state.sectorMap.set(key, sec);
    }
    orderedSectors.push(sec);
    allPlatforms.push(...sec.platforms);
    if (sec.terrain) allTerraces.push(sec.terrain);
  }

  state.activeSectors = orderedSectors;
  state.platforms = allPlatforms;
  state.terraces = allTerraces;
}

function getTerrainHeightAt(x, y) {
  if (state.fieldType !== "terrain" || typeof getTerracedHeightAt !== "function") return 0;
  return getTerracedHeightAt(state.terraces, x, y);
}

function getVisualGroundY(x, y, entity = null) {
  const lift = entity && Number.isFinite(entity.groundZ)
    ? entity.groundZ
    : getTerrainHeightAt(x, y);
  return y - lift;
}

function getFighterEffectTargetY(fighter) {
  if (!fighter) return 0;
  const spriteHeight = Math.max(34, Number(fighter.targetPx) || 78);
  const bodyLift = Math.max(20, Math.min(82, spriteHeight * 0.44));
  return getVisualGroundY(fighter.x, fighter.y, fighter) - (fighter.z || 0) - bodyLift;
}

function getVisualDistance(ax, ay, bx, by, aGroundZ = null, bGroundZ = null, verticalPerspective = 1) {
  const aLift = Number.isFinite(aGroundZ) ? aGroundZ : getTerrainHeightAt(ax, ay);
  const bLift = Number.isFinite(bGroundZ) ? bGroundZ : getTerrainHeightAt(bx, by);
  const perspective = Math.max(0.01, Number(verticalPerspective) || 1);
  return Math.hypot(bx - ax, ((by - bLift) - (ay - aLift)) / perspective);
}

function buildArenaGeometry() {
  bounds = { left: 0, right: W, top: 0, bottom: H };
  state.crowd = [];
  ensureVisibleSectors(state.camX, state.camY);
}

// Water field Pokéball platform has radius 118px -> horizontal width (diameter) = 236px
const POKEBALL_PLATFORM_RADIUS = 118;
const POKEBALL_PLATFORM_WIDTH = POKEBALL_PLATFORM_RADIUS * 2; // 236px

// 7-tier piecewise-continuous pixel size & scale function driven by pokeData height.meters (0.1m .. 75m),
// ensuring unmistakable visual size separation between:
// 1. 超小型〜小型 (<=0.4m): 28px .. 42px
// 2. 御三家たね (0.5m..0.8m): 50px .. 60px
// 3. 中間進化 (0.9m..1.3m): 66px .. 80px
// 4. 最終進化・中〜大型 (1.4m..2.5m): 88px .. 128px (core body target; winged/wide sprites expand naturally beyond!)
// 5. メガシンカ (isMega): 138px .. 160px (or 178px .. 192px for Mega Legendaries)
// 6. 超大型・伝説 (>2.5m): 156px .. 188px
// 7. キョダイマックス (isGmax, 14m..75m): 204px .. 234px (up to the 236px water-battle Pokéball width!)
function computeTargetPxFromHeight(heightM, isGmax = false, isMega = false, weightKg = 35, shapeSlug = "", types = []) {
  let h = Math.max(0.1, Number(heightM) || 1.0);
  // Light serpentine pre-evolutions (e.g. Dratini 1.8m/3.3kg, Dragonair 4.0m/16.5kg, Ekans 2.0m/6.9kg)
  // record body length rather than standing height; normalize so they sit in Starter / Mid-Evo tiers
  if (!isGmax && !isMega && shapeSlug === "squiggle" && weightKg < 60 && h > 1.2) {
    h = Number((h * (weightKg < 10 ? 0.35 : 0.32)).toFixed(2));
  }

  let px;
  if (isGmax) {
    // 7. キョダイマックス (14m .. 75m) -> 204px .. 234px (86% .. 99% of 236px Pokéball platform width)
    const gh = Math.max(12, h);
    px = 204 + Math.pow(Math.min(1, (gh - 12) / 63), 0.65) * 30;
  } else if (isMega) {
    // 5. メガシンカ -> Distinctly larger than standard final evolutions (138px .. 160px; Mega Legendaries 178px .. 192px)
    if (h <= 3.5) {
      px = 136 + ((Math.max(0.6, h) - 0.6) / 2.9) * 24;
    } else {
      px = 178 + Math.min(1, (h - 3.5) / 7.5) * 14;
    }
  } else if (h <= 0.4) {
    // 1. 超小型〜小型 (0.1m .. 0.4m) -> 28px .. 42px
    px = 28 + ((h - 0.1) / 0.3) * 14;
  } else if (h <= 0.7) {
    // 2a. 小型・御三家たね (0.45m .. 0.7m) -> 50px .. 58px
    px = 49 + ((h - 0.4) / 0.3) * 9;
  } else if (h <= 0.8) {
    // 2b. 準中型たね (0.75m .. 0.8m) -> 59px .. 60px
    px = 58 + ((h - 0.7) / 0.1) * 2;
  } else if (h <= 1.3) {
    // 3. 中間進化 (0.85m .. 1.3m) -> 66px .. 80px
    px = 63 + ((h - 0.8) / 0.5) * 17;
  } else if (h <= 2.5) {
    // 4. 最終進化・中〜大型 (1.35m .. 2.5m) -> 84px .. 126px core body target
    // Fine height steps: 1.5m (Gengar)=89px, 1.6m (Blastoise)=93px, 1.7m (Charizard)=96px (+wing torso compensation -> 104px), 2.0m (Venusaur/Mewtwo)=107px, 2.1m (Snorlax)=110px, 2.2m (Dragonite)=114px, 2.5m (Lapras)=124px
    px = 82 + ((h - 1.3) / 1.2) * 42;
  } else {
    // 6. 超大型・伝説 (2.5m .. 20.0m) -> 156px .. 188px
    const t = Math.min(1, (h - 2.5) / 17.5);
    px = 154 + Math.pow(t, 0.55) * 34;
  }

  // Winged medium/large Pokémon (e.g. Charizard 1.7m, Dragonite 2.2m, Salamence, Aerodactyl, Moltres)
  // have their torso drawn ~14% smaller inside the 96x96 DS frame to fit their upward wing-flap arc;
  // boost their core body target so their torso+head stands taller than smaller wingless Pokémon (e.g. Blastoise 1.6m)!
  const hasWings = Array.isArray(types) && (types.includes("flying") || shapeSlug === "wings" || shapeSlug === "bug-wings");
  if (!isGmax && !isMega && h >= 1.4 && h <= 2.5 && hasWings) {
    px += 8;
  }

  return Math.round(Math.max(28, Math.min(POKEBALL_PLATFORM_WIDTH - 2, px)));
}

function computeHeightBasedScale(heightM, isGmax = false, isMega = false, weightKg = 35, shapeSlug = "", types = []) {
  const targetPx = computeTargetPxFromHeight(heightM, isGmax, isMega, weightKg, shapeSlug, types);
  return Number((targetPx / 70).toFixed(3));
}

// Enrich POKEMON_DATA at boot with ../pokeData/pokeData.js (Ability, Height, Weight, Shape, Base Stats, BST, Type Matchups, Training, Breeding, Evolution, Moves)
if (typeof window.getPokeData === "function") {
  Object.values(POKEMON_DATA).forEach(p => {
    const pd = window.getPokeData(p.dex) || window.getPokeData(p.id);
    if (pd) {
      p.pokeData = pd;
      const bs = pd.baseStats || {};
      const hM = (pd.height && pd.height.meters) || 1.2;
      const wKg = (pd.weight && pd.weight.kilograms) || 35.0;
      const shapeSlug = (pd.shape && pd.shape.slug) || "";
      const types = (pd.typeMatchups && pd.typeMatchups.types) || [];
      p.hp = Math.round(65 + (bs.hp || 70) * 1.65);
      p.speed = Number((1.55 + Math.pow(Math.max(10, bs.speed || 70), 0.85) * 0.115).toFixed(2));
      p.targetPx = computeTargetPxFromHeight(hM, false, false, wKg, shapeSlug, types);
      p.scale = computeHeightBasedScale(hM, false, false, wKg, shapeSlug, types);
      const hasLevitate = (pd.abilities || []).some(a => a.slug === "levitate");
      p.types = types;
      p.flier = Boolean(p.flier || types.includes("flying") || hasLevitate || shapeSlug === "wings" || shapeSlug === "bug-wings");
      p.swimmer = Boolean(p.swimmer || types.includes("water") || types.includes("ice") || shapeSlug === "fish" || shapeSlug === "tentacles" || shapeSlug === "squiggle");
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
  if (f.regionalPokeData) return f.regionalPokeData;
  if (f.megaMode > 0 && f.data.megas && f.data.megas[f.megaMode - 1]) {
    const m = f.data.megas[f.megaMode - 1];
    return m.pokeData || window.getPokeData(m.formSlug) || f.data.pokeData;
  }
  if (f.gmaxMode > 0 && f.data.gmaxs && f.data.gmaxs[f.gmaxMode - 1]) {
    const g = f.data.gmaxs[f.gmaxMode - 1];
    return g.pokeData || window.getPokeData(g.formSlug) || f.data.pokeData;
  }
  return f.data.pokeData || window.getPokeData(f.data.dex) || window.getPokeData(f.id);
}

// Default mapping from arena visual move effect type to elemental type & category
const EFFECT_TYPE_META = {
  ember: { elementType: "fire", category: "special", basePower: 55 },
  flamethrower: { elementType: "fire", category: "special", basePower: 90 },
  fireblast: { elementType: "fire", category: "special", basePower: 115 },
  firespin: { elementType: "fire", category: "special", basePower: 85 },
  watergun: { elementType: "water", category: "special", basePower: 55 },
  muddywater: { elementType: "water", category: "special", basePower: 90 },
  surf: { elementType: "water", category: "special", basePower: 95 },
  whirlpool: { elementType: "water", category: "special", basePower: 100 },
  icebeam: { elementType: "ice", category: "special", basePower: 90 },
  hyperbeam: { elementType: "normal", category: "special", basePower: 130 },
  hydropump: { elementType: "water", category: "special", basePower: 115 },
  electricshock: { elementType: "electric", category: "special", basePower: 40 },
  thunderbolt: { elementType: "electric", category: "special", basePower: 90 },
  thunder: { elementType: "electric", category: "special", basePower: 115 },
  spark: { elementType: "electric", category: "physical", basePower: 65 },
  electroball: { elementType: "electric", category: "special", basePower: 85 },
  hypnosis: { elementType: "psychic", category: "special", basePower: 60 },
  shadowball: { elementType: "ghost", category: "special", basePower: 85 },
  shadowball_mini: { elementType: "ghost", category: "special", basePower: 60 },
  dreameater: { elementType: "psychic", category: "special", basePower: 100 },
  swift: { elementType: "normal", category: "special", basePower: 60 },
  razorleaf: { elementType: "grass", category: "physical", basePower: 65 },
  petalstorm: { elementType: "grass", category: "special", basePower: 95 },
  rest: { elementType: "psychic", category: "status", basePower: 0 },
  dodge: { elementType: "normal", category: "status", basePower: 0 },
  dash_fly: { elementType: "flying", category: "physical", basePower: 60 },
  dive_jump: { elementType: "water", category: "physical", basePower: 60 },
  hornattack: { elementType: "normal", category: "physical", basePower: 65 },
  megahorn: { elementType: "bug", category: "physical", basePower: 120 },
  visegrip: { elementType: "normal", category: "physical", basePower: 60 },
  crabhammer: { elementType: "water", category: "physical", basePower: 100 },
  bodyslam: { elementType: "normal", category: "physical", basePower: 85 },
  leafblade: { elementType: "grass", category: "physical", basePower: 90 },
  slash: { elementType: "normal", category: "physical", basePower: 70 },
  waterfall: { elementType: "water", category: "physical", basePower: 80 },
  stomp: { elementType: "normal", category: "physical", basePower: 75 },
  rapidspin: { elementType: "normal", category: "physical", basePower: 55 },
  doubleteam: { elementType: "normal", category: "status", basePower: 0 },
  groundsmash: { elementType: "ground", category: "physical", basePower: 100 },
  earthpower: { elementType: "ground", category: "special", basePower: 90 }
};

function mapPokeMoveToVisualEffect(m, slotIdx) {
  if (!m) return slotIdx === 0 ? "slash" : slotIdx === 1 ? "bodyslam" : slotIdx === 3 ? "shadowball" : "hyperbeam";
  const slug = (m.slug || "").toLowerCase();
  const t = (m.type || "normal").toLowerCase();
  const cat = (m.category || "physical").toLowerCase();
  const pwr = m.power || 60;

  // High-information signature moves need their own staged renderer instead
  // of falling through to a generic element icon.
  if (slug.includes("double-team")) return "doubleteam";
  if (/(?:earthquake|bulldoze|magnitude|stomping-tantrum)/.test(slug)) return "groundsmash";
  if (/(?:earth-power|precipice-blades|lands-wrath|fissure)/.test(slug)) return "earthpower";
  if (/(?:thunder-shock|shock-wave)/.test(slug)) return "electricshock";
  if (slug === "spark") return "spark";

  // Only Water moves may borrow the arena's wave visuals. A generic "wave"
  // match previously turned Heat Wave and Sludge Wave into giant blue Surf
  // effects, while Hurricane became a water tornado.
  if (slug.includes("surf") || (t === "water" && cat !== "physical" && slug.includes("wave"))) return "surf";
  if (slug.includes("whirlpool")) return "whirlpool";
  if (slug.includes("hurricane") || slug.includes("tornado")) return "swift";
  if (slug.includes("hydro-pump") || slug.includes("origin-pulse") || slug.includes("water-spout")) return "hydropump";
  if (slug.includes("ice-beam") || slug.includes("blizzard") || slug.includes("freeze")) return "icebeam";
  if (slug.includes("flamethrower") || slug.includes("heat-wave") || slug.includes("mystical-fire")) return "flamethrower";
  if (slug.includes("sacred-fire") || slug.includes("pyro-ball")) return "ember";
  if (
    cat !== "physical" &&
    (slug.includes("fire-blast") || slug.includes("overheat") || slug.includes("eruption"))
  ) return "fireblast";
  if (slug.includes("fire-spin") || slug.includes("magma-storm")) return "firespin";
  if (slug === "thunder" || (slug.includes("thunder") && pwr >= 105)) return "thunder";
  if (
    cat !== "physical" &&
    (slug.includes("thunderbolt") || slug.includes("discharge") || slug.includes("volt"))
  ) return "thunderbolt";
  if (slug.includes("leaf-blade") || slug.includes("solar-blade")) return "leafblade";
  if (slug.includes("petal") || slug.includes("leaf-storm") || slug.includes("energy-ball") || slug.includes("seed-flare")) return "petalstorm";
  if (slug.includes("razor-leaf") || slug.includes("magical-leaf") || slug.includes("bullet-seed")) return "razorleaf";
  if (slug.includes("hypnosis") || slug.includes("spore") || slug.includes("dark-void") || slug.includes("sing") || slug.includes("yawn")) return "hypnosis";

  if (cat === "physical") {
    if (t === "water") return pwr >= 90 ? "crabhammer" : "waterfall";
    if (t === "grass") return "leafblade";
    if (t === "bug") return pwr >= 90 ? "megahorn" : "slash";
    // Elemental charge attacks need the regular contact path, not the heavy
    // Body Slam path (which adds jump and weight-based damage/range scaling).
    if (t === "electric" || t === "fire") return "hornattack";
    if (t === "ground" || t === "rock" || t === "steel" || t === "fighting") return pwr >= 85 ? "stomp" : "bodyslam";
    return slotIdx === 0 ? "slash" : "hornattack";
  }
  // Special moves
  if (t === "fire") return slotIdx === 0 ? "ember" : pwr >= 105 ? "fireblast" : "flamethrower";
  if (t === "water") return slotIdx === 0 ? "watergun" : pwr >= 105 ? "hydropump" : slotIdx === 4 ? "surf" : "muddywater";
  if (t === "electric") return pwr >= 105 ? "thunder" : "thunderbolt";
  if (t === "ice") return "icebeam";
  if (t === "grass") return pwr >= 105 ? "hyperbeam" : "petalstorm";
  if (t === "ghost" || t === "dark" || t === "psychic" || t === "poison" || t === "fairy" || t === "dragon") {
    return slotIdx === 0 ? "shadowball_mini" : slotIdx === 4 && pwr >= 110 ? "hyperbeam" : "shadowball";
  }
  return slotIdx === 4 ? "hyperbeam" : "swift";
}

// Build a fighter's complete combat profile from its pokeData (Stats, Height, Weight, Shape, Types, Abilities, Moves)
function applyPokeDataProfile(f, pdOverride = null) {
  if (!f) return;
  const pd = pdOverride || getActiveFighterPokeData(f);
  f.pokeData = pd || null;

  const bs = (pd && pd.baseStats) || {
    hp: 75,
    attack: 80,
    defense: 75,
    specialAttack: 80,
    specialDefense: 75,
    speed: 75,
    total: 460
  };

  f.stats = {
    hp: bs.hp || 75,
    attack: bs.attack || 80,
    defense: bs.defense || 75,
    specialAttack: bs.specialAttack || 80,
    specialDefense: bs.specialDefense || 75,
    speed: bs.speed || 75,
    total: (pd && pd.baseStatTotal) || bs.total || 460
  };

  // 1. Physique: Height (m) & Weight (kg) & Shape -> Scale (strictly proportional to height.meters and scaled to the 236px Pokéball platform width), Build Width, Hitbox
  const baseHeightM = (pd && pd.height && pd.height.meters) || 1.2;
  const baseWeightKg = (pd && pd.weight && pd.weight.kilograms) || 35.0;
  f.heightM = f.gmaxMode > 0 && baseHeightM < 12 ? Number(Math.max(14, baseHeightM * 12).toFixed(1)) : baseHeightM;
  f.weightKg = f.gmaxMode > 0 ? Math.max(1000, baseWeightKg) : baseWeightKg;
  f.shapeSlug = (pd && pd.shape && pd.shape.slug) || "upright";
  f.types = (pd && pd.typeMatchups && pd.typeMatchups.types) || f.data.types || ["normal"];

  // Continuous 7-tier height-based scale: changes smoothly with f.heightM (0.1m .. 75m), with distinct visual bands for each evolution/size tier and G-Max scaled to the 236px Pokéball platform width
  f.targetPx = computeTargetPxFromHeight(f.heightM, f.gmaxMode > 0, f.megaMode > 0, f.weightKg, f.shapeSlug, f.types);
  f.scale = computeHeightBasedScale(f.heightM, f.gmaxMode > 0, f.megaMode > 0, f.weightKg, f.shapeSlug, f.types);

  // BMI / stockiness factor from weight vs height so stocky Pokémon (Snorlax, Venusaur, Blastoise, Golem) have a broader physique
  const bmiRatio = baseWeightKg / Math.max(0.25, baseHeightM * baseHeightM);
  f.physiqueWidthMult = Math.max(0.96, Math.min(1.06, 0.96 + Math.log10(Math.max(1, bmiRatio)) * 0.035));
  f.hitRadius = Math.min(104, 10 + f.scale * 23);

  // Heavy Pokémon resist knockback and slam harder; light Pokémon jump higher and get knocked further
  f.knockbackMult = Math.max(0.30, Math.min(1.60, 1.52 - Math.log10(Math.max(1, f.weightKg)) * 0.40));
  f.jumpForceMult = Math.max(0.68, Math.min(1.36, 1.28 - Math.log10(Math.max(1, f.weightKg)) * 0.17));
  f.weightPowerMult = Math.max(0.78, Math.min(1.58, 0.78 + Math.log10(Math.max(1, f.weightKg)) * 0.20));

  // 2. Types, Abilities & Terrain Mobility (Flier / Swimmer / Serpentine)
  f.abilities = (pd && pd.abilities) || [];
  const hasLevitate = f.abilities.some(a => a.slug === "levitate");
  f.flier = Boolean(
    f.data.flier ||
      f.types.includes("flying") ||
      hasLevitate ||
      f.shapeSlug === "wings" ||
      f.shapeSlug === "bug-wings"
  );
  f.swimmer = Boolean(
    f.data.swimmer ||
      f.types.includes("water") ||
      f.types.includes("ice") ||
      f.shapeSlug === "fish" ||
      f.shapeSlug === "tentacles" ||
      f.shapeSlug === "squiggle"
  );
  f.isSerpentine = Boolean(f.shapeSlug === "squiggle" || f.id === "gyarados");

  // 3. Action & Movement Speed from Base Stat Speed (+ Ability & Weight agility modifiers)
  let effectiveSpeedStat = f.stats.speed;
  if (
    f.abilities.some(
      a =>
        a.slug === "speed-boost" ||
        a.slug === "unburden" ||
        a.slug === "swift-swim" ||
        a.slug === "chlorophyll" ||
        a.slug === "quick-feet" ||
        a.slug === "surge-surfer"
    )
  ) {
    effectiveSpeedStat *= 1.18;
  }
  const weightAgilityMod = Math.max(-0.42, Math.min(0.32, (1.5 - Math.log10(Math.max(1, f.weightKg))) * 0.22));
  f.moveSpeed = Math.max(1.75, Math.min(7.2, 1.55 + Math.pow(Math.max(10, effectiveSpeedStat), 0.85) * 0.115 + weightAgilityMod));
  f.actionSpeedMult = Math.max(0.58, Math.min(1.85, 0.52 + (effectiveSpeedStat / 100) * 0.62));
  f.cdMult = Math.max(0.52, Math.min(1.42, 1.35 - (effectiveSpeedStat / 100) * 0.38));
  f.animTempo = Math.max(0.55, Math.min(1.90, 0.54 + (effectiveSpeedStat / 100) * 0.62));
  f.energyRegen = 5.8 + (effectiveSpeedStat / 100) * 5.8;

  // 4. Attack Range & AoE Reach from Height, Weight, Shape, and Offensive Stats
  const reachShapeBonus =
    f.shapeSlug === "squiggle" || f.shapeSlug === "tentacles" || f.shapeSlug === "wings" ? 0.12 : 0;
  const maxOffStat = Math.max(f.stats.attack || 75, f.stats.specialAttack || 75);
  f.meleeReachMult = Math.max(
    0.72,
    Math.min(1.65, 0.68 + Math.pow(Math.max(0.2, f.heightM), 0.38) * 0.34 + reachShapeBonus)
  );
  f.rangeMult = Math.max(
    0.70,
    Math.min(
      1.75,
      0.62 +
        Math.pow(maxOffStat / 85, 0.48) * 0.38 +
        Math.pow(Math.max(0.2, f.heightM), 0.32) * 0.22 +
        reachShapeBonus
    )
  ) * (f.gmaxMode > 0 ? 1.22 : f.megaMode > 0 ? 1.12 : 1.0);

  // 5. Max HP from Base Stat HP (+ Mega / Gigantamax HP bonus)
  const prevMaxHp = f.maxHp || 100;
  const hpRatio = f.hp !== undefined && prevMaxHp > 0 ? f.hp / prevMaxHp : 1.0;
  const megaHpBonus = f.megaMode > 0 ? 45 : 0;
  const gmaxHpBonus = f.gmaxMode > 0 ? 110 : 0;
  f.maxHp = Math.round(65 + f.stats.hp * 1.65) + megaHpBonus + gmaxHpBonus;
  f.hp = Math.max(1, Math.min(f.maxHp, Math.round(f.maxHp * hpRatio)));

  // 6. Enrich 5-slot Moves from pokeData.moves & scale Base Damage, Attack Range, and Cooldowns by Stats
  const allPokeMoves = [];
  if (pd && pd.moves) {
    ["levelUp", "machine", "tutor", "egg"].forEach(catKey => {
      if (Array.isArray(pd.moves[catKey])) {
        pd.moves[catKey].forEach(pm => {
          if (pm && pm.name && !allPokeMoves.some(x => x.slug === pm.slug)) {
            allPokeMoves.push(pm);
          }
        });
      }
    });
  }

  // Pick signature damaging moves from pokeData for non-featured Pokémon (or match featured move names)
  const damagingMoves = allPokeMoves
    .filter(m => m.power && m.power >= 40)
    .sort((a, b) => {
      const aStab = f.types.includes(a.type) ? 1.25 : 1.0;
      const bStab = f.types.includes(b.type) ? 1.25 : 1.0;
      const aStat = a.category === "physical" ? f.stats.attack : f.stats.specialAttack;
      const bStat = b.category === "physical" ? f.stats.attack : f.stats.specialAttack;
      return b.power * bStab * bStat - a.power * aStab * aStat;
    });

  const bstFactor = Math.max(0.75, Math.min(1.42, Math.pow((f.stats.total || 460) / 480, 0.58)));
  const baseMoves = f.data.moves || [];
  const learnedDoubleTeam = allPokeMoves.find(move => move.slug === "double-team") || null;
  f.moves = baseMoves.map((bm, idx) => {
    const fallbackMeta = EFFECT_TYPE_META[bm.type] || { elementType: f.types[0] || "normal", category: "physical", basePower: 65 };
    if (idx === 2 || bm.type === "dodge" || bm.type === "dash_fly" || bm.type === "dive_jump") {
      const canUseDoubleTeam = idx === 2 && bm.type !== "dash_fly" && bm.type !== "dive_jump" && learnedDoubleTeam;
      return {
        ...bm,
        name: canUseDoubleTeam ? "DOUBLE TEAM" : bm.name,
        jpName: canUseDoubleTeam ? learnedDoubleTeam.jpName || "かげぶんしん" : "",
        type: canUseDoubleTeam ? "doubleteam" : bm.type,
        elementType: f.types[0] || "normal",
        category: "status",
        basePower: 0,
        sourceMoveSlug: canUseDoubleTeam ? "double-team" : "",
        sourceMoveName: canUseDoubleTeam ? "Double Team" : bm.name || "",
        rangeMult: Number(f.meleeReachMult.toFixed(2)),
        cd: Number(Math.max(0.50, bm.cd * f.cdMult).toFixed(2))
      };
    }

    // Try matching existing move name in pokeData.moves
    const normBmName = (bm.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    let matchedPm = allPokeMoves.find(
      pm => (pm.name || "").toLowerCase().replace(/[^a-z0-9]/g, "") === normBmName
    );

    // If not featured and we have real damaging moves in pokeData, assign authentic moves from this Pokémon's learnset!
    if (!f.data.isFeatured && damagingMoves.length >= 4 && !matchedPm) {
      if (idx === 0) matchedPm = damagingMoves[Math.min(3, damagingMoves.length - 1)]; // Quick attack slot
      else if (idx === 1) matchedPm = damagingMoves[Math.min(2, damagingMoves.length - 1)]; // Mid skill slot
      else if (idx === 3) matchedPm = damagingMoves[Math.min(1, damagingMoves.length - 1)]; // Strong skill slot
      else if (idx === 4) matchedPm = damagingMoves[0]; // Ultimate move slot
    }

    const elementType = (matchedPm && matchedPm.type) || fallbackMeta.elementType;
    const category =
      matchedPm && (matchedPm.category === "physical" || matchedPm.category === "special")
        ? matchedPm.category
        : fallbackMeta.category;
    const basePower = (matchedPm && matchedPm.power) || fallbackMeta.basePower || 65;
    const mappedVisualType = matchedPm ? mapPokeMoveToVisualEffect(matchedPm, idx) : bm.type;
    const usesDedicatedSignatureRenderer = [
      "electricshock", "doubleteam", "groundsmash", "earthpower", "fireblast"
    ].includes(mappedVisualType);
    const visualType = matchedPm && (!f.data.isFeatured || usesDedicatedSignatureRenderer)
      ? mappedVisualType
      : bm.type;
    const displayName =
      !f.data.isFeatured && matchedPm
        ? matchedPm.name.toUpperCase()
        : bm.name;
    const jpName = matchedPm ? matchedPm.jpName : "";

    // Scale base arena damage & attack range by move's basePower + Pokémon's Attack/Sp.Atk & BST
    const slotStdPower = idx === 0 ? 55 : idx === 1 ? 75 : idx === 3 ? 90 : 115;
    const powerFactor = Math.max(0.65, Math.min(1.68, Math.pow(basePower / slotStdPower, 0.74))) * bstFactor;
    const atkStat = category === "physical" ? f.stats.attack : f.stats.specialAttack;
    const statPreviewFactor = Math.pow(Math.max(25, atkStat) / 80, 0.78);
    const stabPreview = f.types.includes(elementType) ? 1.22 : 1.0;
    const moveRangeMult = Number(
      (f.rangeMult * Math.max(0.82, Math.min(1.32, Math.pow(basePower / 75, 0.28)))).toFixed(2)
    );

    return {
      ...bm,
      name: displayName,
      jpName,
      type: visualType,
      elementType,
      category,
      basePower,
      sourceMoveSlug: (matchedPm && matchedPm.slug) || "",
      sourceMoveName: (matchedPm && matchedPm.name) || bm.name || "",
      rangeMult: moveRangeMult,
      cd: Number(Math.max(0.20, bm.cd * f.cdMult).toFixed(2)),
      dmg: Number((bm.dmg * powerFactor).toFixed(1)),
      previewPower: Math.round(bm.dmg * powerFactor * statPreviewFactor * stabPreview)
    };
  });
}

function createFighter(pokeId, team, x, y, isPlayer = false) {
  const base = POKEMON_DATA[pokeId] || POKEMON_DATA.charizard;
  getSprite(base.sprite);
  if (base.backSprite) getSprite(base.backSprite);
  const f = {
    id: base.id,
    data: base,
    name: base.name,
    sprite: base.sprite,
    backSprite: base.backSprite,
    team,
    isPlayer,
    x,
    y,
    groundZ: getTerrainHeightAt(x, y),
    z: 0,
    vz: 0,
    vx: 0,
    vy: 0,
    facing: team === 1 ? 1 : -1,
    hp: base.hp || 140,
    maxHp: base.hp || 140,
    energy: 65,
    maxEnergy: 100,
    cooldowns: [0, 0, 0, 0, 0],
    sleepTimer: 0,
    frozenTimer: 0,
    invulnTimer: 0,
    trappedInWhirlpool: null,
    activeMoveTimer: 0,
    activeMoveDuration: 0.52,
    doubleTeamTimer: 0,
    doubleTeamDuration: 0,
    activeMoveIsMelee: false,
    activeMoveName: "",
    landSquashTimer: 0,
    dashTimer: 0,
    dashVx: 0,
    dashVy: 0,
    megaMode: 0,
    gmaxMode: 0,
    ko: false,
    aiTimer: 0.4,
    aiAttackCooldown: 0.35 + Math.random() * 0.4
  };
  applyPokeDataProfile(f);
  f.hp = f.maxHp;
  return f;
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

// Build Skill Bar HUD for P1 (reflects pokeData moves, power, attack range, and speed-adjusted cooldowns)
function renderSkillBar(fighter) {
  const container = document.getElementById("skill-slots-container");
  if (!fighter) return;
  container.innerHTML = "";
  const moveList = fighter.moves || fighter.data.moves;
  moveList.forEach((m, idx) => {
    const slot = document.createElement("div");
    slot.className = "skill-slot ready";
    slot.id = `skill-slot-${idx}`;
    slot.onclick = () => triggerPlayerSkill(idx);

    const energyStr = m.energy > 0 ? `+${m.energy}` : m.energy < 0 ? `${Math.abs(m.energy)}` : "";
    const energyClass = m.energy > 0 ? "gain" : "cost";
    const catIcon = m.category === "physical" ? "💥" : m.category === "special" ? "✨" : "💨";
    const subLabel = m.jpName ? `${m.jpName} (${m.name})` : m.name;
    slot.title = `${subLabel} [${(m.elementType || "normal").toUpperCase()} / ${m.category || "status"}] 威力:${m.previewPower || 0} / 範囲:${m.rangeMult || 1.0}x / CD:${m.cd}s`;

    slot.innerHTML = `
      <div class="skill-top-row">
        <span class="key-badge">${m.key}</span>
        <span class="energy-tag ${energyClass}" id="skill-cd-${idx}">${energyStr}</span>
      </div>
      <div class="skill-name">${catIcon} ${m.name}</div>
    `;
    container.appendChild(slot);

    // Sync mobile virtual pad button labels
    const vNameEl = document.getElementById(`vbtn-name-${idx}`);
    const vCostEl = document.getElementById(`vbtn-cost-${idx}`);
    if (vNameEl) {
      vNameEl.textContent = m.jpName || m.name;
    }
    if (vCostEl) {
      vCostEl.textContent = energyStr ? `EN ${energyStr}` : "READY";
    }
  });
}

function formatFighterStatStrip(f) {
  if (!f || !f.stats) return "";
  const s = f.stats;
  const abil = f.abilities && f.abilities[0] ? `特性:${f.abilities[0].jpName || f.abilities[0].name}` : "";
  return `BST ${s.total} ｜ 攻${s.attack} 防${s.defense} 特攻${s.specialAttack} 特防${s.specialDefense} 素早${s.speed}\n${f.heightM}m ${f.weightKg}kg 範囲${(f.rangeMult || 1).toFixed(2)}x ${abil}`;
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
    const p1PortraitEl = document.getElementById("p1-portrait");
    if (p1PortraitEl && p1PortraitEl.dataset.lastSrc !== p1.sprite) {
      p1PortraitEl.src = p1.sprite;
      p1PortraitEl.dataset.lastSrc = p1.sprite;
    }
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

    const p1StatStrip = document.getElementById("p1-stat-strip");
    if (p1StatStrip) p1StatStrip.textContent = formatFighterStatStrip(p1);

    const p1Wrap = document.getElementById("p1-portrait-wrap");
    const p1HasMultiMega = Boolean(p1.data.megas && p1.data.megas.length >= 2);
    p1Wrap.classList.toggle("ko", p1.ko);
    p1Wrap.classList.toggle("mega-x", p1.megaMode === 1 && p1HasMultiMega);
    p1Wrap.classList.toggle("mega-y", p1.megaMode >= 2 && p1HasMultiMega);
    p1Wrap.classList.toggle("mega-single", p1.megaMode === 1 && !p1HasMultiMega);
    p1Wrap.classList.toggle("gmax-active", p1.gmaxMode > 0);

    const p1Moves = p1.moves || p1.data.moves;
    p1Moves.forEach((m, idx) => {
      const slot = document.getElementById(`skill-slot-${idx}`);
      const cdEl = document.getElementById(`skill-cd-${idx}`);
      const cd = p1.cooldowns[idx];
      const needEn = m.energy < 0 ? Math.abs(m.energy) : 0;
      const energyStr = m.energy > 0 ? `+${m.energy}` : m.energy < 0 ? `${Math.abs(m.energy)}` : "";

      if (slot && cdEl) {
        slot.classList.toggle("on-cd", cd > 0);
        slot.classList.toggle("no-energy", p1.energy < needEn);
        if (cd > 0.05) {
          cdEl.textContent = cd.toFixed(1);
        } else {
          cdEl.textContent = energyStr;
        }
      }

      const vBtn = document.getElementById(`vbtn-slot-${idx}`);
      const vCostEl = document.getElementById(`vbtn-cost-${idx}`);
      if (vBtn) {
        vBtn.classList.toggle("on-cd", cd > 0);
        vBtn.classList.toggle("no-energy", p1.energy < needEn);
      }
      if (vCostEl) {
        if (cd > 0.05) {
          vCostEl.textContent = `${cd.toFixed(1)}s`;
        } else {
          vCostEl.textContent = energyStr ? `EN ${energyStr}` : "READY";
        }
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
    const p2PortraitEl = document.getElementById("p2-portrait");
    if (p2PortraitEl && p2PortraitEl.dataset.lastSrc !== p2.sprite) {
      p2PortraitEl.src = p2.sprite;
      p2PortraitEl.dataset.lastSrc = p2.sprite;
    }
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

    const p2StatStrip = document.getElementById("p2-stat-strip");
    if (p2StatStrip) p2StatStrip.textContent = formatFighterStatStrip(p2);

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

function getWaterPlatformPose(platform, time = state.time) {
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.getPlatformPose === "function") {
    return globalThis.ArenaRenderer.getPlatformPose(platform, time);
  }
  const bob = platform
    ? Math.sin(time * 2.6 + platform.x * 0.015 + platform.y * 0.01) * (platform.kind ? 2.8 : 1.1)
    : 0;
  return {
    x: platform ? platform.x : 0,
    y: platform ? platform.y + bob : 0,
    bob,
    tiltX: 0,
    tiltY: 0
  };
}

// Check if a point (x, y) is on a platform or ice floe. The same elliptical
// footprint and animated pose are shared by rendering and sprite anchoring.
function getPlatformUnder(x, y, time = state.time) {
  if (state.fieldType !== "water") return null;
  for (const p of state.platforms) {
    const pose = getWaterPlatformPose(p, time);
    const dx = x - pose.x;
    const dy = (y - pose.y) / 0.72;
    if (Math.hypot(dx, dy) <= p.r * 0.95) return p;
  }
  for (const floe of state.iceFloes) {
    const pose = getWaterPlatformPose(floe, time);
    const dx = x - pose.x;
    const dy = (y - pose.y) / 0.72;
    if (Math.hypot(dx, dy) <= floe.r * 0.92) return floe;
  }
  return null;
}

function getWaterContactState(fighter, time = state.time) {
  const platform = fighter ? getPlatformUnder(fighter.x, fighter.y, time) : null;
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.resolveWaterContact === "function") {
    return globalThis.ArenaRenderer.resolveWaterContact(fighter, {
      fieldType: state.fieldType,
      platform,
      time
    });
  }
  const active = Boolean(
    fighter &&
      state.fieldType === "water" &&
      !platform &&
      !fighter.flier &&
      (Number(fighter.z) || 0) <= 2
  );
  return {
    active,
    mode: active ? (fighter.swimmer ? "swim" : "surface") : platform ? "platform" : "none",
    contactAlpha: active ? 1 : 0,
    immersionRatio: active ? (fighter.swimmer ? 0.12 : 0.035) : 0,
    platform,
    platformBob: platform ? getWaterPlatformPose(platform, time).bob : 0,
    bob: 0
  };
}

function getMoveEmitterAnchors(user, profile, dirX, dirY) {
  const emitter = profile?.emitter || "body";
  const species = String(user?.data?.id || user?.id || "").toLowerCase();
  const dualCannon = emitter === "cannon" && ["blastoise", "magmortar", "celesteela"].includes(species);
  const offsets = dualCannon ? [-0.17, 0.17] : [0];
  const resolver = window.AttackEffectSystem?.resolveEmitterAnchor;

  if (typeof resolver === "function") {
    return offsets.map(offset => resolver(user, emitter, dirX, dirY, offset));
  }

  const size = user?.targetPx || 68 * (user?.scale || 1.35);
  const angle = Math.atan2(dirY, dirX);
  return offsets.map(offset => ({
    x: user.x + dirX * size * 0.34 - dirY * size * offset,
    y: getVisualGroundY(user.x, user.y, user) - user.z - size * 0.48 + dirY * size * 0.34 + dirX * size * offset,
    angle,
    dirX,
    dirY,
    size
  }));
}

function findTrackedMoveTarget(user, targetX, targetY) {
  let best = null;
  let bestDistance = Infinity;
  for (const fighter of state.fighters) {
    if (!fighter || fighter === user || fighter.ko || fighter.team === user.team) continue;
    const visualY = getFighterEffectTargetY(fighter);
    const distance = Math.hypot(fighter.x - targetX, visualY - getVisualGroundY(targetX, targetY));
    if (distance < bestDistance) {
      best = fighter;
      bestDistance = distance;
    }
  }
  return bestDistance <= 190 ? best : null;
}

function triggerFieldFlash(color = "#ffffff", alpha = 0.24, duration = 0.09) {
  const maxLife = Math.max(0.016, Number(duration) || 0.09);
  const intensity = Math.max(0, Math.min(0.5, Number(alpha) || 0));
  if (state.screenFlash.life > 0 && state.screenFlash.alpha > intensity) return;
  state.screenFlash = {
    life: maxLife,
    maxLife,
    alpha: intensity,
    color
  };
}

function updateTrackedBeamEndpoints(beam) {
  if (!beam?.owner || beam.owner.ko) return;
  if (!["flame_stream", "hydro", "ice", "hyper", "electric_shock", "thunderbolt", "thunder"].includes(beam.kind)) return;

  // Keep the original body locked through the last effect frame. Dropping a
  // target as soon as it is KO'd made long streams snap to their old range
  // endpoint while the opponent was still visibly falling.
  const target = beam.targetFighter || null;
  const targetX = target ? target.x : beam.targetLogicalX;
  const targetY = target ? target.y : beam.targetLogicalY;
  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

  const dx = targetX - beam.owner.x;
  const dy = targetY - beam.owner.y;
  const distance = Math.hypot(dx, dy) || 1;
  const dirX = dx / distance;
  const dirY = dy / distance;
  const targetVisualY = target
    ? getFighterEffectTargetY(target)
    : getVisualGroundY(targetX, targetY);

  beam.x2 = targetX;
  beam.y2 = targetVisualY;
  if (beam.kind === "thunder") {
    beam.x1 = targetX;
    beam.y1 = state.camY - H * 0.5 - 96;
    return;
  }

  const origins = getMoveEmitterAnchors(
    beam.owner,
    {
      emitter: beam.emitter || (
        beam.kind === "hydro"
          ? "cannon"
          : (beam.kind === "flame_stream" || beam.kind === "ice")
            ? "mouth"
            : "body"
      )
    },
    dirX,
    dirY
  );
  beam.streamOrigins = origins.map(origin => ({ x: origin.x, y: origin.y }));
  beam.x1 = origins.reduce((sum, origin) => sum + origin.x / origins.length, 0);
  beam.y1 = origins.reduce((sum, origin) => sum + origin.y / origins.length, 0);
}

function spawnFireBlastKanjiExplosion(projectile, hitFighter = null) {
  if (!projectile) return;
  const centerX = hitFighter ? hitFighter.x : projectile.x;
  const centerY = hitFighter
    ? getFighterEffectTargetY(hitFighter)
    : projectile.y - getTerrainHeightAt(projectile.x, projectile.y);
  triggerFieldFlash("#ffae00", 0.30, 0.14);
  state.hitStopTimer = Math.max(state.hitStopTimer, 0.052);
  state.cameraShake = Math.max(state.cameraShake, 7.6);
  state.fireBlasts.push({
    owner: projectile.owner,
    targetFighter: hitFighter || null,
    x: centerX,
    y: centerY,
    logicalX: hitFighter ? hitFighter.x : projectile.x,
    logicalY: hitFighter ? hitFighter.y : projectile.y,
    radius: projectile.kanjiRadius || 122,
    dmg: projectile.dmg,
    category: projectile.category || "special",
    elementType: projectile.elementType || "fire",
    basePower: projectile.basePower || 115,
    life: 1.18,
    maxLife: 1.18,
    age: 0,
    seed: projectile.seed || nextCombatEffectSeed(),
    hitSet: new Set(hitFighter ? [hitFighter] : [])
  });
}

// Execute Move and Spawn Custom Visual Effects (scaled by pokeData Attack/Sp.Atk, Range, Speed, and Weight!)
function executeMove(user, moveIdx, targetX, targetY) {
  if (user.ko || user.sleepTimer > 0 || user.frozenTimer > 0) return;
  if (!user.isPlayer && !state.enemyAttackEnabled && moveIdx !== 2) return;
  const moveList = user.moves || user.data.moves;
  const move = moveList[moveIdx];
  if (!move) return;
  if (user.cooldowns[moveIdx] > 0) return;
  const cost = move.energy < 0 ? Math.abs(move.energy) : 0;
  if (user.energy < cost) return;

  const actSpd = user.actionSpeedMult || 1.0;
  user.cooldowns[moveIdx] = move.cd;
  user.energy = Math.max(0, Math.min(user.maxEnergy, user.energy + move.energy));
  user.activeMoveName = move.jpName ? `${move.jpName} (${move.name})` : move.name;
  user.activeMoveDuration = Math.max(0.28, Math.min(0.76, 0.50 / actSpd));
  user.activeMoveTimer = user.activeMoveDuration;
  if (user.isPlayer || state.enemyAttackEnabled) {
    showMoveCallout(user.team, move.name);
  }

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
  const referencePresentationDuration = {
    surf: 2.15,
    flamethrower: 1.55,
    fireblast: 1.55,
    hydropump: 2.15,
    icebeam: 1.15,
    hyperbeam: 1.15,
    electricshock: 0.48,
    thunderbolt: 1.05,
    thunder: 0.86,
    doubleteam: 0.94,
    groundsmash: 1.15,
    earthpower: 1.15
  }[t];
  if (referencePresentationDuration) {
    user.activeMoveDuration = referencePresentationDuration / Math.max(0.86, Math.min(1.18, actSpd));
    user.activeMoveTimer = user.activeMoveDuration;
  }
  const meleeTypes = new Set([
    "hornattack", "megahorn", "visegrip", "crabhammer",
    "bodyslam", "leafblade", "slash", "waterfall",
    "stomp", "rapidspin", "dash_fly", "dive_jump"
  ]);
  const isMelee = meleeTypes.has(t);
  user.activeMoveIsMelee = isMelee;
  user.activeMoveKind = isMelee ? "attack" : "special";

  const moveCat = move.category || (isMelee ? "physical" : "special");
  const moveElem = move.elementType || (user.types && user.types[0]) || "normal";
  const moveBasePower = move.basePower || 70;

  // Power & Attack Range scale from Attack/Sp.Atk, move base power, and body reach (f.rangeMult / f.meleeReachMult)
  const offStat = moveCat === "physical" ? (user.stats?.attack || 80) : (user.stats?.specialAttack || 80);
  const powerScale =
    Math.max(0.65, Math.min(1.85, Math.pow(offStat / 85, 0.72) * Math.pow(moveBasePower / 75, 0.35))) *
    (user.gmaxMode > 0 ? 1.25 : user.megaMode > 0 ? 1.15 : 1.0);
  const rangeScale = move.rangeMult || user.rangeMult || 1.0;
  const reachScale = user.meleeReachMult || 1.0;
  const projSpeedScale = Math.max(0.72, Math.min(1.68, 0.58 + actSpd * 0.42));
  const distLifeMult = Math.max(0.78, Math.min(1.45, 0.72 + rangeScale * 0.28));
  const attackEffectProfile = typeof spawnAttackSequence === "function"
    ? spawnAttackSequence(user, move, dirX, dirY, powerScale, rangeScale)
    : null;
  const sourceMoveSlug = String(move.sourceMoveSlug || move.sourceMoveName || move.name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const trackedTarget = findTrackedMoveTarget(user, targetX, targetY);

  if (t === "flamethrower") {
    SOUND.sfx("fire");
    state.cameraShake = Math.max(state.cameraShake, 3.2 * powerScale);
    const origins = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY);
    const origin = origins[0];
    const beamLen = Math.min(520 * distLifeMult, Math.max(180, dist));
    const endX = user.x + dirX * beamLen;
    const endLogicalY = user.y + dirY * beamLen;
    state.beams.push({
      kind: "flame_stream",
      owner: user,
      x1: origin.x,
      y1: origin.y,
      x2: endX,
      y2: getVisualGroundY(endX, endLogicalY),
      width: 38 * rangeScale,
      collisionRadius: 34 * rangeScale * 0.58,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 1.55,
      maxLife: 1.55,
      age: 0,
      hitDelay: 1.55 * 0.20,
      targetFighter: trackedTarget,
      targetLogicalX: endX,
      targetLogicalY: endLogicalY,
      emitter: attackEffectProfile?.emitter || "mouth",
      seed: nextCombatEffectSeed()
    });
  } else if (t === "fireblast") {
    // だいもんじ (Fire Blast): launches a roaring flame cluster from the mouth
    // that erupts into the kanji 「大」 (Dai) upon hitting the opponent!
    SOUND.sfx("fire");
    triggerFieldFlash("#dc2626", 0.22, 0.26);
    state.cameraShake = Math.max(state.cameraShake, 3.8 * powerScale);
    const origin = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY)[0];
    const aimTargetX = trackedTarget ? trackedTarget.x : targetX;
    const aimTargetY = trackedTarget ? trackedTarget.y : targetY;
    const aimDx = aimTargetX - origin.x;
    const aimDy = aimTargetY - user.y;
    const aimDist = Math.hypot(aimDx, aimDy) || 1;
    const launchDirX = aimDx / aimDist;
    const launchDirY = aimDy / aimDist;
    const spd = 9.4 * projSpeedScale;
    const lifeDur = 0.72 * distLifeMult;
    state.projectiles.push({
      kind: "fireblast_orb",
      owner: user,
      x: origin.x,
      y: user.y + launchDirY * 18 - user.z,
      vx: launchDirX * spd,
      vy: launchDirY * spd,
      r: 30 * rangeScale,
      kanjiRadius: 122 * rangeScale,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      targetFighter: trackedTarget,
      life: lifeDur,
      maxLife: lifeDur,
      seed: nextCombatEffectSeed()
    });
  } else if (t === "ember") {
    SOUND.sfx("fire");
    const count = 6;
    const spread = 0.22 * Math.sqrt(rangeScale);
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const spd = (7.8 + Math.random() * 3.5) * projSpeedScale;
      const lifeDur = (0.68 + Math.random() * 0.25) * distLifeMult;
      state.projectiles.push({
        kind: "fire",
        owner: user,
        x: user.x + dirX * 22 * reachScale,
        y: user.y + dirY * 16 - user.z,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 14 * rangeScale,
        dmg: move.dmg / (count * 0.42),
        category: moveCat,
        elementType: moveElem,
        basePower: moveBasePower,
        life: lifeDur,
        maxLife: lifeDur
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
        radius: (18 + (i % 3) * 18) * rangeScale,
        x: targetX + Math.cos(ang) * 30 * rangeScale,
        y: targetY + Math.sin(ang) * 20 * rangeScale,
        r: 15 * rangeScale,
        dmg: move.dmg * 0.22,
        category: moveCat,
        elementType: moveElem,
        basePower: moveBasePower,
        life: 1.5 * distLifeMult,
        maxLife: 1.5 * distLifeMult
      });
    }
  } else if (t === "watergun" || t === "muddywater") {
    SOUND.sfx("water");
    const count = t === "muddywater" ? 14 : 7;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * (t === "muddywater" ? 0.55 : 0.16) * Math.sqrt(rangeScale);
      const spd = (8.5 + Math.random() * 2.5) * projSpeedScale;
      const lifeDur = 0.65 * distLifeMult;
      state.projectiles.push({
        kind: t === "muddywater" ? "muddy" : "water",
        owner: user,
        x: user.x + dirX * 20 * reachScale,
        y: user.y + dirY * 15,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: (t === "muddywater" ? 15 : 11) * rangeScale,
        dmg: move.dmg / (count * 0.5),
        category: moveCat,
        elementType: moveElem,
        basePower: moveBasePower,
        life: lifeDur,
        maxLife: lifeDur
      });
    }
  } else if (t === "surf") {
    SOUND.sfx("surf");
    if (user.id === "lapras" || user.id === "blastoise") {
      showSubtitle("Surf's up dude!", 2.2);
    }
    state.waterSurges.push({
      owner: user,
      x: user.x,
      y: user.y,
      startRadius: 22 * rangeScale,
      radius: 22 * rangeScale,
      maxRadius: Math.min(360, Math.max(210, Math.min(350, Math.min(W, H) * 0.43)) * rangeScale),
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 2.15,
      maxLife: 2.15,
      age: 0,
      seed: nextCombatEffectSeed(),
      hitSet: new Set()
    });
  } else if (t === "whirlpool") {
    SOUND.sfx("surf");
    showSubtitle(`${user.name} unleashes Whirlpool!`, 2.0);
    state.whirlpools.push({
      owner: user,
      x: targetX,
      y: targetY,
      radius: 82 * rangeScale,
      height: 220 * rangeScale,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 3.4,
      maxLife: 3.4,
      impactShown: new Set()
    });
  } else if (t === "icebeam") {
    SOUND.sfx("ice");
    state.cameraShake = Math.max(state.cameraShake, 2.8 * powerScale);
    const beamLen = Math.min(480 * distLifeMult, Math.max(190, dist));
    const origin = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY)[0];
    const endX = user.x + dirX * beamLen;
    const endLogicalY = user.y + dirY * beamLen;
    state.beams.push({
      kind: "ice",
      owner: user,
      x1: origin.x,
      y1: origin.y,
      x2: endX,
      y2: getVisualGroundY(endX, endLogicalY),
      width: 34 * rangeScale,
      collisionRadius: 30 * rangeScale * 0.55,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 1.15,
      maxLife: 1.15,
      age: 0,
      hitDelay: 1.15 * 0.14,
      targetFighter: trackedTarget,
      targetLogicalX: endX,
      targetLogicalY: endLogicalY,
      emitter: attackEffectProfile?.emitter || "mouth",
      seed: nextCombatEffectSeed()
    });
    if (state.fieldType === "water") {
      for (let step = 85; step <= beamLen * 0.88; step += 78) {
        const ix = user.x + dirX * step + (Math.random() - 0.5) * 32;
        const iy = user.y + dirY * step + (Math.random() - 0.5) * 32;
        state.iceFloes.push({
          x: ix,
          y: iy,
          r: (54 + Math.random() * 28) * rangeScale,
          life: 14.0,
          seed: Math.random() * 100
        });
      }
    }
  } else if (t === "hydropump") {
    SOUND.sfx("beam");
    state.cameraShake = Math.max(state.cameraShake, 4.5 * powerScale);
    const origins = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY);
    const origin = origins.reduce(
      (sum, anchor) => ({ x: sum.x + anchor.x / origins.length, y: sum.y + anchor.y / origins.length }),
      { x: 0, y: 0 }
    );
    const beamLen = Math.min(620 * distLifeMult, Math.max(220, dist));
    const endX = user.x + dirX * beamLen;
    const endLogicalY = user.y + dirY * beamLen;
    state.beams.push({
      kind: "hydro",
      owner: user,
      x1: origin.x,
      y1: origin.y,
      x2: endX,
      y2: getVisualGroundY(endX, endLogicalY),
      streamOrigins: origins.map(anchor => ({ x: anchor.x, y: anchor.y })),
      width: 46 * rangeScale,
      collisionRadius: 42 * rangeScale * 0.58,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 2.15,
      maxLife: 2.15,
      age: 0,
      // Match damage to the first impact-spray frame in drawHydroPumpStream.
      hitDelay: 2.15 * 0.18,
      targetFighter: trackedTarget,
      targetLogicalX: endX,
      targetLogicalY: endLogicalY,
      emitter: attackEffectProfile?.emitter || "cannon",
      seed: nextCombatEffectSeed()
    });
  } else if (t === "hyperbeam") {
    SOUND.sfx("beam");
    state.cameraShake = 10 * powerScale;
    const origin = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY)[0];
    const beamLen = Math.min(600 * distLifeMult, Math.max(220, dist));
    const endX = user.x + dirX * beamLen;
    const endLogicalY = user.y + dirY * beamLen;
    state.beams.push({
      kind: "hyper",
      owner: user,
      x1: origin.x,
      y1: origin.y,
      x2: endX,
      y2: getVisualGroundY(endX, endLogicalY),
      width: 48 * rangeScale,
      collisionRadius: 44 * rangeScale * 0.55,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: 1.15,
      maxLife: 1.15,
      age: 0,
      hitDelay: 0.12,
      targetFighter: trackedTarget,
      targetLogicalX: endX,
      targetLogicalY: endLogicalY,
      emitter: attackEffectProfile?.emitter || "body",
      seed: nextCombatEffectSeed()
    });
  } else if (t === "electricshock" || t === "thunderbolt" || t === "thunder" || t === "spark" || t === "electroball") {
    SOUND.sfx("thunder");
    const electricKind = t === "thunder"
      ? "thunder"
      : t === "electricshock" || t === "spark" || sourceMoveSlug.includes("thunder-shock")
        ? "electric_shock"
        : "thunderbolt";
    state.cameraShake = Math.max(
      state.cameraShake,
      (electricKind === "thunder" ? 5 : electricKind === "thunderbolt" ? 3 : 1.5) * powerScale
    );
    const tx = t === "spark" ? user.x + dirX * 140 * rangeScale : targetX;
    const tyLogical = t === "spark" ? user.y + dirY * 140 * rangeScale : targetY;
    const ty = getVisualGroundY(tx, tyLogical);
    const origin = getMoveEmitterAnchors(user, attackEffectProfile, dirX, dirY)[0];
    const duration = electricKind === "thunder" ? 0.86 : electricKind === "thunderbolt" ? 1.05 : 0.48;
    state.beams.push({
      kind: electricKind,
      owner: user,
      x1: electricKind === "thunder" ? tx : origin.x,
      y1: electricKind === "thunder" ? state.camY - H * 0.5 - 80 : origin.y,
      x2: tx,
      y2: ty,
      width: (electricKind === "thunder" ? 13 : electricKind === "thunderbolt" ? 9 : 5) * rangeScale,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      life: duration,
      maxLife: duration,
      age: 0,
      collisionRadius: (electricKind === "thunder" ? 13 : electricKind === "thunderbolt" ? 9 : 5) * rangeScale * 0.6,
      hitDelay: duration * (electricKind === "electric_shock" ? 0.42 : 0.26),
      targetFighter: trackedTarget,
      targetLogicalX: tx,
      targetLogicalY: tyLogical,
      emitter: attackEffectProfile?.emitter || "body",
      seed: nextCombatEffectSeed()
    });
    state.ripples.push({ x: tx, y: tyLogical, r: 10, maxR: (electricKind === "thunder" ? 74 : 48) * rangeScale, color: "#ffe76a", width: 2, alpha: 0.58 });
  } else if (t === "groundsmash" || t === "earthpower") {
    SOUND.sfx("hit");
    const centeredOnUser = t === "groundsmash";
    const effectX = centeredOnUser ? user.x : targetX;
    const effectY = centeredOnUser ? user.y : targetY;
    const radius = Math.min(132, (centeredOnUser ? 92 : 78) * rangeScale);
    state.cameraShake = Math.max(state.cameraShake, (centeredOnUser ? 4.8 : 3.6) * powerScale);
    state.groundBreaks.push({
      kind: centeredOnUser ? "ground_smash" : "earth_power",
      owner: user,
      x: effectX,
      y: effectY,
      radius,
      dmg: move.dmg,
      category: moveCat,
      elementType: moveElem || "ground",
      basePower: moveBasePower,
      life: 4.2,
      maxLife: 4.2,
      age: 0,
      // The reference lands damage on the white impact frame, then leaves the
      // crater and cracks behind for several seconds.
      hitDelay: 0.22,
      hitApplied: false,
      seed: nextCombatEffectSeed()
    });
  } else if (t === "hypnosis" || t === "shadowball" || t === "shadowball_mini" || t === "dreameater") {
    SOUND.sfx("hypnosis");
    if (t === "hypnosis") {
      if (user.id === "gengar") showSubtitle("And there it is, the hypnosis power of Gengar!", 2.5);
      for (let i = 0; i < 6; i++) {
        state.projectiles.push({
          kind: "hypnosis_ring",
          owner: user,
          x: user.x + dirX * (20 + i * 16),
          y: user.y + dirY * (20 + i * 16),
          vx: dirX * 6.2 * projSpeedScale,
          vy: dirY * 6.2 * projSpeedScale,
          r: (14 + i * 4) * rangeScale,
          dmg: move.dmg / 4,
          category: moveCat,
          elementType: moveElem,
          basePower: moveBasePower,
          sleep: true,
          life: 0.95 * distLifeMult,
          maxLife: 0.95 * distLifeMult
        });
      }
    } else {
      const lifeDur = 0.9 * distLifeMult;
      state.projectiles.push({
        kind: "shadowball",
        owner: user,
        x: user.x + dirX * 22 * reachScale,
        y: user.y + dirY * 16,
        vx: dirX * 7.8 * projSpeedScale,
        vy: dirY * 7.8 * projSpeedScale,
        r: (t === "shadowball" ? 22 : 13) * rangeScale,
        dmg: move.dmg,
        category: moveCat,
        elementType: moveElem,
        basePower: moveBasePower,
        life: lifeDur,
        maxLife: lifeDur
      });
    }
  } else if (t === "swift" || t === "razorleaf" || t === "petalstorm") {
    SOUND.sfx("hit");
    const count = t === "petalstorm" ? 16 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * (t === "petalstorm" ? 1.2 : 0.35) * Math.sqrt(rangeScale);
      const spd = (8.2 + Math.random() * 2.5) * projSpeedScale;
      const lifeDur = 0.75 * distLifeMult;
      state.projectiles.push({
        kind: t === "swift" ? "star" : "leaf",
        owner: user,
        x: user.x + dirX * 20 * reachScale,
        y: user.y + dirY * 16,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 12 * rangeScale,
        dmg: move.dmg / (count * 0.45),
        category: moveCat,
        elementType: moveElem,
        basePower: moveBasePower,
        life: lifeDur,
        maxLife: lifeDur
      });
    }
  } else if (t === "doubleteam") {
    SOUND.sfx("hypnosis");
    user.doubleTeamDuration = 0.94;
    user.doubleTeamTimer = user.doubleTeamDuration;
    user.invulnTimer = Math.max(user.invulnTimer, 0.72);
    const dashSpd = 8.4 * (0.72 + actSpd * 0.30);
    user.dashTimer = 0.32 / Math.sqrt(actSpd);
    user.dashVx = dirX * dashSpd;
    user.dashVy = dirY * dashSpd;
    state.ripples.push({ x: user.x, y: user.y, r: 10, maxR: 72, color: "#d8f3ff", width: 2, alpha: 0.72 });
  } else if (t === "rest") {
    SOUND.sfx("hypnosis");
    user.hp = Math.min(user.maxHp, user.hp + Math.round(user.maxHp * 0.32));
    user.sleepTimer = 1.6;
    spawnBurst(user.x, user.y, "#4ade80", 18);
  } else if (moveIdx === 2 || t === "dodge" || t === "dash_fly" || t === "dive_jump") {
    SOUND.sfx("water");
    const dashSpd = 10.5 * (0.72 + actSpd * 0.30);
    user.dashTimer = 0.34 / Math.sqrt(actSpd);
    user.dashVx = dirX * dashSpd;
    user.dashVy = dirY * dashSpd;
    user.invulnTimer = 0.42;
    const jmpMult = user.jumpForceMult || 1.0;
    if (t === "dash_fly" || t === "dive_jump") {
      user.vz = 8.5 * jmpMult;
    } else {
      user.vz = 4.4 * jmpMult;
    }
    spawnBurst(user.x, user.y, "#ffffff", 12);
  } else {
    // Melee Dash Attacks: hornattack, megahorn, visegrip, crabhammer, bodyslam, leafblade, slash, waterfall, stomp, rapidspin
    SOUND.sfx("hit");
    if (user.id === "nidorino" && t === "hornattack") {
      showSubtitle("Nidorino charges in with a Horn Attack!", 2.2);
    }
    const dashSpd = 11.4 * (0.72 + actSpd * 0.28);
    user.dashTimer = (0.32 / Math.sqrt(actSpd)) * Math.max(0.85, Math.min(1.25, reachScale));
    user.dashVx = dirX * dashSpd;
    user.dashVy = dirY * dashSpd;
    if (t === "stomp" || t === "bodyslam" || t === "crabhammer") {
      user.vz = 5.6 * (user.jumpForceMult || 1.0);
    }
    const isHeavySlam = t === "stomp" || t === "bodyslam";
    const meleeAreaScale = rangeScale * reachScale * (isHeavySlam ? (user.weightPowerMult || 1.0) : 1.0);
    const slashColor =
      moveElem === "grass" || t === "leafblade" ? "#4ade80" :
      moveElem === "water" || t === "crabhammer" || t === "waterfall" ? "#38bdf8" :
      moveElem === "fire" ? "#fb923c" :
      moveElem === "electric" || t === "megahorn" ? "#facc15" :
      moveElem === "dragon" || moveElem === "ghost" ? "#c084fc" :
      moveElem === "fairy" || moveElem === "psychic" ? "#f472b6" : "#ffffff";

    if (!attackEffectProfile?.asset) {
      state.slashes.push({
        owner: user,
        x: user.x + dirX * 30 * reachScale,
        y: user.y + dirY * 22 * reachScale - user.z,
        angle: Math.atan2(dirY, dirX),
        radius: (isHeavySlam ? 54 : 42) * meleeAreaScale,
        color: slashColor,
        life: 0.28,
        maxLife: 0.28
      });
    }
    if (isHeavySlam && !attackEffectProfile?.asset) {
      state.ripples.push({
        x: user.x + dirX * 24 * reachScale,
        y: user.y + dirY * 18 * reachScale,
        r: 10,
        maxR: 72 * meleeAreaScale,
        color: "rgba(255, 255, 255, 0.75)",
        width: 3,
        alpha: 0.9
      });
    }
    state.projectiles.push({
      kind: "melee_hitbox",
      subKind: t,
      owner: user,
      x: user.x + dirX * 26 * reachScale,
      y: user.y + dirY * 20 * reachScale,
      vx: dirX * 9.5 * projSpeedScale,
      vy: dirY * 9.5 * projSpeedScale,
      r: (isHeavySlam ? 46 : 33) * meleeAreaScale,
      dmg: move.dmg * (isHeavySlam ? (user.weightPowerMult || 1.0) : 1.0),
      category: moveCat,
      elementType: moveElem,
      basePower: moveBasePower,
      attackEffectAsset: attackEffectProfile?.asset || null,
      life: 0.32 * Math.max(0.88, Math.min(1.25, reachScale)),
      maxLife: 0.32 * Math.max(0.88, Math.min(1.25, reachScale))
    });
  }

  updateHUD();
}

function spawnBurst(x, y, color, count = 14, speed = 4.5, shortDuration = null, radiusScale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.4 + Math.random() * 0.9) * speed;
    const maxLife = Number.isFinite(shortDuration) ? shortDuration : 0.75;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 1.2,
      r: (3 + Math.random() * 5) * radiusScale,
      color,
      life: Number.isFinite(shortDuration)
        ? maxLife * (0.72 + Math.random() * 0.28)
        : 0.45 + Math.random() * 0.35,
      maxLife
    });
  }
}

function applyDamage(attacker, target, dmg, knockX = 0, knockY = 0, extra = {}) {
  if (!target || target.ko || target.invulnTimer > 0) return false;
  if (attacker && !attacker.isPlayer && !state.enemyAttackEnabled) return false;

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
    return false;
  }

  // 1. Physical (Attack vs Defense) or Special (Sp. Atk vs Sp. Def) Stat Ratio from pokeData
  const isPhys = extra.category ? extra.category === "physical" : Boolean(extra.melee);
  let atkStat = isPhys ? (attacker?.stats?.attack || 80) : (attacker?.stats?.specialAttack || 80);
  let defStat = isPhys ? (target?.stats?.defense || 75) : (target?.stats?.specialDefense || 75);
  const moveType = extra.elementType || (attacker?.types && attacker.types[0]) || "normal";

  // 2. Attacker & Defender Ability Modifiers from pokeData.abilities
  const atkAbils = (attacker && attacker.abilities) || [];
  const defAbils = (target && target.abilities) || [];

  if (isPhys && atkAbils.some(a => a.slug === "huge-power" || a.slug === "pure-power")) {
    atkStat *= 1.5;
  }
  if (isPhys && atkAbils.some(a => a.slug === "hustle" || a.slug === "guts" || a.slug === "gorilla-tactics" || a.slug === "tough-claws")) {
    atkStat *= 1.25;
  }
  if (attacker && attacker.hp <= attacker.maxHp * 0.35) {
    if (
      (moveType === "fire" && atkAbils.some(a => a.slug === "blaze")) ||
      (moveType === "water" && atkAbils.some(a => a.slug === "torrent")) ||
      (moveType === "grass" && atkAbils.some(a => a.slug === "overgrow")) ||
      (moveType === "bug" && atkAbils.some(a => a.slug === "swarm"))
    ) {
      atkStat *= 1.45;
    }
  }
  if ((extra.basePower || 60) <= 60 && atkAbils.some(a => a.slug === "technician")) {
    atkStat *= 1.25;
  }

  if ((moveType === "fire" || moveType === "ice") && defAbils.some(a => a.slug === "thick-fat")) {
    defStat *= 1.6;
  }
  if (target.hp >= target.maxHp * 0.98 && defAbils.some(a => a.slug === "multiscale" || a.slug === "shadow-shield")) {
    defStat *= 1.6;
  }
  if (isPhys && defAbils.some(a => a.slug === "fur-coat" || a.slug === "marvel-scale")) {
    defStat *= 1.45;
  }

  const statRatioMult = Math.max(0.38, Math.min(2.75, Math.pow(Math.max(20, atkStat) / Math.max(20, defStat), 0.82)));

  // 3. STAB (Same-Type Attack Bonus)
  const hasStab = Boolean(attacker && attacker.types && attacker.types.includes(moveType));
  const hasAdaptability = atkAbils.some(a => a.slug === "adaptability");
  const stabMult = hasStab ? (hasAdaptability ? 1.35 : 1.20) : 1.0;

  // 4. Type Effectiveness from target.pokeData.typeMatchups.defenseMultipliers
  let rawTypeMult = 1.0;
  const defMultMap = target.pokeData && target.pokeData.typeMatchups && target.pokeData.typeMatchups.defenseMultipliers;
  if (defMultMap && defMultMap[moveType] !== undefined) {
    rawTypeMult = defMultMap[moveType];
  } else if (typeof window.getTypeMultiplier === "function") {
    rawTypeMult = window.getTypeMultiplier(moveType, target.types || ["normal"]);
  }
  if (moveType === "ground" && target.flier) {
    rawTypeMult = 0;
  }

  const combatTypeMult =
    rawTypeMult >= 4 ? 1.75 :
    rawTypeMult >= 2 ? 1.38 :
    rawTypeMult === 0 ? 0.22 :
    rawTypeMult <= 0.25 ? 0.48 :
    rawTypeMult <= 0.5 ? 0.68 : 1.0;

  const finalDmg = Math.max(1, dmg * statRatioMult * stabMult * combatTypeMult);

  target.hp = Math.max(0, target.hp - finalDmg);
  target.hurtTimer = 0.34;

  // 5. Weight-adjusted Knockback (heavy Pokémon resist knockback; heavy attackers deal extra knockback in melee)
  const kbMult = (target.knockbackMult || 1.0) * (extra.melee ? (attacker?.weightPowerMult || 1.0) : 1.0);
  target.vx += knockX * kbMult;
  target.vy += knockY * kbMult;

  target.sleepTimer = 0; // wake up on hit
  if (extra.sleep) {
    target.sleepTimer = 2.8;
  }
  if (extra.freeze) {
    target.frozenTimer = 2.0;
  }

  // Brief impact hit-stop on strong hits for anime fighting-game punchiness
  if (finalDmg >= 14) {
    state.hitStopTimer = 0.032;
    state.cameraShake = Math.max(state.cameraShake, Math.min(12, finalDmg * 0.32));
  }

  // Floating damage popup (accumulates rapid multi-hit ticks cleanly)
  const existingPopup = state.damagePopups.find(dp => dp.target === target && dp.life > 0.48);
  if (existingPopup) {
    existingPopup.val += finalDmg;
    existingPopup.rawTypeMult = rawTypeMult;
    existingPopup.life = 0.72;
  } else {
    state.damagePopups.push({
      target,
      x: target.x + (Math.random() - 0.5) * 24,
      y: target.y - 44 * (target.scale / 1.4) - target.z,
      val: finalDmg,
      mult: combatTypeMult,
      rawTypeMult,
      life: 0.75,
      maxLife: 0.75
    });
  }

  SOUND.sfx("hit");
  let showImpactFeedback = !extra.suppressImpactFeedback;
  if (showImpactFeedback && typeof spawnImpactSequence === "function") {
    showImpactFeedback = spawnImpactSequence(target, moveType, finalDmg, {
      physical: isPhys,
      contact: Boolean(extra.melee),
      primaryAsset: extra.attackEffectAsset,
      effectiveness: rawTypeMult,
      angle: Math.atan2(extra.impactVy ?? knockY, extra.impactVx ?? knockX)
    }) !== false;
  }
  if (showImpactFeedback) {
    spawnBurst(
      target.x,
      target.y - 10,
      rawTypeMult >= 2 ? "#facc15" : "#ffffff",
      extra.melee ? 2 : 3,
      extra.melee ? 2.4 : 2.8,
      0.24,
      0.5
    );
  }

  // Tilt platform if standing on one
  const plat = getPlatformUnder(target.x, target.y);
  if (plat && plat.tiltX !== undefined) {
    plat.tiltX = Math.max(-10, Math.min(10, knockX * kbMult * 1.4));
    plat.tiltY = Math.max(-10, Math.min(10, knockY * kbMult * 1.4));
  }

  if (target.hp <= 0 && !target.ko) {
    target.ko = true;
    target.vz = 7.5 * (target.jumpForceMult || 1.0);
    state.cameraShake = 16;
    showKO(`${target.name} goes down!`);

    // Giant water splash fountain if on water field
    if (state.fieldType === "water") {
      spawnBurst(target.x, target.y, "#e0f7ff", 38, 7.5);
      state.ripples.push({ x: target.x, y: target.y, r: 10, maxR: 110 * (target.scale / 1.4), color: "#ffffff", width: 4, alpha: 1 });
    }

    // Schedule Pokéball recall red laser beam (like sample1.mp4 00:40!)
    setTimeout(() => {
      triggerRecallBeam(target);
    }, 950);
  }

  updateHUD();
  return showImpactFeedback;
}

function triggerRecallBeam(fighter) {
  if (!fighter) return;
  SOUND.sfx("recall");
  const originX = state.camX + (fighter.team === 1 ? -W * 0.5 - 36 : W * 0.5 + 36);
  const originY = state.camY;
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
  ensureVisibleSectors(state.camX, state.camY);
  const existingTeamFighter = state.fighters.find(f => f.team === team);
  const plat = state.fieldType === "water"
    ? (team === 1 ? state.platforms[0] : state.platforms[1])
    : null;
  const sx = existingTeamFighter
    ? existingTeamFighter.x
    : plat
    ? plat.x
    : state.camX + (team === 1 ? -190 : 190);
  const sy = existingTeamFighter
    ? existingTeamFighter.y
    : plat
    ? plat.y
    : state.camY + 34;

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
  state.lastPlayerInputTime = state.time;

  const wm = getWorldMouse();
  const enemy = state.fighters
    .filter(f => f !== p1 && !f.ko && (state.battleRoyale || f.team !== 1))
    .sort((a, b) => Math.hypot(a.x - p1.x, a.y - p1.y) - Math.hypot(b.x - p1.x, b.y - p1.y))[0];

  let tx;
  let ty;
  if (slotIdx === 2) {
    // Dodge / Fly / Dash: use virtual joystick direction if active, or manual move angle, otherwise mouse
    if (vjoy.active && vjoy.mag > 0.12) {
      tx = p1.x + vjoy.dx * 180;
      ty = p1.y + vjoy.dy * 180;
    } else if (touchMove.active) {
      tx = touchMove.worldX;
      ty = touchMove.worldY;
    } else if (p1.manualMoveTimer > 0 && p1.manualMoveAngle !== undefined) {
      tx = p1.x + Math.cos(p1.manualMoveAngle) * 180;
      ty = p1.y + Math.sin(p1.manualMoveAngle) * 180;
    } else {
      tx = wm.x;
      ty = wm.y;
    }
  } else if (enemy) {
    tx = enemy.x;
    ty = enemy.y;
  } else if (vjoy.active && vjoy.mag > 0.12) {
    tx = p1.x + vjoy.dx * 220;
    ty = p1.y + vjoy.dy * 220;
  } else {
    tx = wm.x;
    ty = wm.y;
  }
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
      applyPokeDataProfile(f);
      f.hp = Math.min(f.maxHp, f.hp + 45);
      f.energy = f.maxEnergy;
      const col1 = f.megaMode === 2 ? "#fde047" : "#00e5ff";
      const col2 = f.megaMode === 2 ? "#f97316" : "#3b82f6";
      spawnBurst(f.x, f.y, col1, 32, 7.2);
      spawnBurst(f.x, f.y, col2, 20, 5.5);
      showSubtitle(
        `${f.data.name} Mega Evolved into ${f.name.replace("✦ ", "")}! (BST ${f.stats.total} / Size ×${f.scale.toFixed(2)})`,
        2.6
      );
    } else {
      f.sprite = f.data.sprite;
      f.backSprite = f.data.backSprite;
      f.name = f.data.name;
      applyPokeDataProfile(f);
      spawnBurst(f.x, f.y, "#ffd43b", 20, 5.5);
    }
    if (f.team === 1) renderSkillBar(f);
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
  f.megaMode = 0;
  if (gmaxs.length > 0) {
    f.gmaxMode = forceMode !== null ? forceMode : (f.gmaxMode + 1) % (gmaxs.length + 1);
    if (f.gmaxMode > 0) {
      const gInfo = gmaxs[f.gmaxMode - 1] || gmaxs[0];
      f.sprite = gInfo.front;
      f.backSprite = gInfo.back || gInfo.front;
      getSprite(f.sprite);
      getSprite(f.backSprite);
      const suf = gInfo.suffix ? " " + gInfo.suffix : "";
      f.name = `🌋 G-MAX ${f.data.name}${suf}`;
      applyPokeDataProfile(f);
      f.hp = Math.min(f.maxHp, f.hp + 85);
      f.energy = f.maxEnergy;
      state.cameraShake = 14;
      spawnBurst(f.x, f.y, "#f43f5e", 42, 8.5);
      spawnBurst(f.x, f.y, "#fda4af", 28, 6.2);
      showSubtitle(
        `${f.data.name} Gigantamaxed into G-Max ${f.data.name}! (${f.heightM}m / Size ×${f.scale.toFixed(2)})`,
        2.6
      );
    } else {
      f.sprite = f.data.sprite;
      f.backSprite = f.data.backSprite;
      f.name = f.data.name;
      applyPokeDataProfile(f);
      spawnBurst(f.x, f.y, "#ffd43b", 20, 5.5);
    }
  } else {
    f.gmaxMode = forceMode !== null ? forceMode : f.gmaxMode > 0 ? 0 : 1;
    if (f.gmaxMode > 0) {
      f.name = `🌋 DYNAMAX ${f.data.name}`;
      applyPokeDataProfile(f);
      f.hp = Math.min(f.maxHp, f.hp + 85);
      f.energy = f.maxEnergy;
      state.cameraShake = 14;
      spawnBurst(f.x, f.y, "#f43f5e", 42, 8.5);
      spawnBurst(f.x, f.y, "#fda4af", 28, 6.2);
      showSubtitle(
        `${f.data.name} Dynamaxed! (${f.heightM}m / Size ×${f.scale.toFixed(2)})`,
        2.6
      );
    } else {
      f.name = f.data.name;
      applyPokeDataProfile(f);
      spawnBurst(f.x, f.y, "#ffd43b", 20, 5.5);
    }
  }
  if (f.team === 1) renderSkillBar(f);
  SOUND.sfx("beam");
  updateHUD();
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
function startTerrainScene() {
  state.battleRoyale = false;
  state.fieldType = "terrain";
  state.fieldTransition.active = false;
  state.iceFloes = [];
  state.whirlpools = [];
  state.waves = [];
  state.waterSurges = [];
  state.groundBreaks = [];
  state.fireBlasts = [];
  state.beams = [];
  state.projectiles = [];
  state.screenFlash.life = 0;
  // The default roster exposes every newly staged move without requiring the
  // Pokédex selector: fire, water, electric, ground, then Double Team.
  state.p1Team = ["charizard", "blastoise", "pikachu", "sandslash", "gengar"];
  state.p2Team = ["sandslash", "gengar", "lapras"];
  state.p1Index = 0;
  state.p2Index = 0;

  state.camX = WORLD_ORIGIN_X;
  state.camY = WORLD_ORIGIN_Y;
  state.camInitialized = true;
  ensureVisibleSectors(state.camX, state.camY);

  const cx = WORLD_ORIGIN_X;
  const cy = WORLD_ORIGIN_Y;
  state.fighters = [
    createFighter("charizard", 1, cx - 190, cy + 44, true),
    createFighter("sandslash", 2, cx + 190, cy + 44, false)
  ];
  renderSkillBar(state.fighters[0]);
  renderPartyBalls();
  updateHUD();
  showSubtitle("Terraced Arena — take the high ground!", 2.5);
}

function startGrassScene() {
  state.battleRoyale = false;
  state.fieldType = "grass";
  state.fieldTransition.active = false;
  state.iceFloes = [];
  state.whirlpools = [];
  state.waves = [];
  state.waterSurges = [];
  state.groundBreaks = [];
  state.fireBlasts = [];
  state.screenFlash.life = 0;
  state.p1Team = ["nidorino", "goldeen" in POKEMON_DATA ? "goldeen" : "seaking", "charizard"];
  state.p2Team = ["gengar", "snorlax", "gyarados"];
  state.p1Index = 0;
  state.p2Index = 0;

  state.camX = WORLD_ORIGIN_X;
  state.camY = WORLD_ORIGIN_Y;
  state.camInitialized = true;
  ensureVisibleSectors(state.camX, state.camY);

  const cx = WORLD_ORIGIN_X;
  const cy = WORLD_ORIGIN_Y;
  state.fighters = [
    createFighter("nidorino", 1, cx - 140, cy, true),
    createFighter("gengar", 2, cx + 140, cy, false)
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
  state.waterSurges = [];
  state.groundBreaks = [];
  state.fireBlasts = [];
  state.screenFlash.life = 0;
  state.p1Team = ["charizard", "lapras", "pikachu"];
  state.p2Team = ["seaking", "starmie", "gyarados"];
  state.p1Index = 0;
  state.p2Index = 0;

  state.camX = WORLD_ORIGIN_X;
  state.camY = WORLD_ORIGIN_Y;
  state.camInitialized = true;
  ensureVisibleSectors(state.camX, state.camY);

  const centerStage = state.platforms[2];
  const leftBall = state.platforms[0];
  state.fighters = [
    createFighter("charizard", 1, centerStage.x, centerStage.y - 6, true),
    createFighter("seaking", 2, leftBall.x + 170, centerStage.y + 45, false)
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
  state.waterSurges = [];
  state.groundBreaks = [];
  state.fireBlasts = [];
  state.screenFlash.life = 0;
  state.camX = WORLD_ORIGIN_X;
  state.camY = WORLD_ORIGIN_Y;
  state.camInitialized = true;
  ensureVisibleSectors(state.camX, state.camY);

  const cx = WORLD_ORIGIN_X;
  const cy = WORLD_ORIGIN_Y;

  state.fighters = [
    createFighter("gyarados", 1, cx - 40, cy + 25, true),
    createFighter("charizard", 2, cx, cy - 30, false),
    createFighter("snorlax", 2, state.platforms[2].x, state.platforms[2].y, false),
    createFighter("lapras", 2, cx - 220, cy + 20, false),
    createFighter("pikachu", 2, state.platforms[5].x, state.platforms[5].y, false),
    createFighter("starmie", 2, state.platforms[3].x, state.platforms[3].y, false),
    createFighter("sceptile", 2, state.platforms[4].x, state.platforms[4].y, false),
    createFighter("blastoise", 2, cx + 240, cy + 55, false)
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

// Auto-close Pokémon selector menu (Menu 1) and expanded Top Menu (Menu 2) when a Pokémon is selected
function closeMenusAfterPokemonSelect() {
  const bottomRightPanel = document.getElementById("bottom-right-panel");
  if (bottomRightPanel) {
    bottomRightPanel.classList.add("roster-hidden");
  }
  const topMenuPanel = document.getElementById("top-menu-panel");
  if (topMenuPanel) {
    topMenuPanel.classList.add("menu-hidden");
  }
}

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
        btn.title = `#${dexStr} ${jpLabel} (${label}) - タップ/左クリック:選択対象 / 右クリック:相手`;
        btn.innerHTML = `<img src="${mInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag mega-tag">${tag}</span>`;
        btn.onclick = () => {
          const tTeam = rosterSelectTargetTeam || 1;
          if (tTeam === 1) state.p1Team[state.p1Index] = p.id;
          else state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(tTeam, p.id);
          toggleMegaEvolution(tTeam, idx + 1);
          closeMenusAfterPokemonSelect();
        };
        btn.oncontextmenu = e => {
          e.preventDefault();
          state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(2, p.id);
          toggleMegaEvolution(2, idx + 1);
          closeMenusAfterPokemonSelect();
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
        btn.title = `#${dexStr} ${jpLabel} (${label}) - タップ/左クリック:選択対象 / 右クリック:相手`;
        btn.innerHTML = `<img src="${gInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag gmax-tag">${tag}</span>`;
        btn.onclick = () => {
          const tTeam = rosterSelectTargetTeam || 1;
          if (tTeam === 1) state.p1Team[state.p1Index] = p.id;
          else state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(tTeam, p.id);
          toggleGigantamax(tTeam, idx + 1);
          closeMenusAfterPokemonSelect();
        };
        btn.oncontextmenu = e => {
          e.preventDefault();
          state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(2, p.id);
          toggleGigantamax(2, idx + 1);
          closeMenusAfterPokemonSelect();
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
        btn.title = `#${dexStr} ${jpLabel} (${label}) - タップ/左クリック:選択対象 / 右クリック:相手`;
        btn.innerHTML = `<img src="${rInfo.front}" loading="lazy" alt="${label}" /><span class="dex-tag">${dexStr}R</span>`;
        btn.onclick = () => {
          const tTeam = rosterSelectTargetTeam || 1;
          if (tTeam === 1) state.p1Team[state.p1Index] = p.id;
          else state.p2Team[state.p2Index] = p.id;
          spawnTeamFighter(tTeam, p.id);
          const f = state.fighters.find(o => o.team === tTeam);
          if (f) {
            f.sprite = rInfo.front;
            f.backSprite = rInfo.back;
            f.name = label;
            f.regionalForm = rInfo;
            applyPokeDataProfile(f, rInfo.pokeData);
            getSprite(f.sprite);
            getSprite(f.backSprite);
            if (tTeam === 1) renderSkillBar(f);
            updateHUD();
          }
          closeMenusAfterPokemonSelect();
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
            f.regionalForm = rInfo;
            applyPokeDataProfile(f, rInfo.pokeData);
            getSprite(f.sprite);
            getSprite(f.backSprite);
            updateHUD();
          }
          closeMenusAfterPokemonSelect();
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
    btn.title = `#${dexStr} ${p.jpName} (${p.name}) [Gen ${p.gen || 1}]${megaNote}${gmaxNote} - タップ/左クリック:選択対象 / 右クリック:相手`;
    btn.innerHTML = `<img src="${p.sprite}" loading="lazy" alt="${p.name}" /><span class="dex-tag">${dexStr}${hasMega ? "✦" : hasGmax ? "G" : ""}</span>`;
    btn.onclick = () => {
      const tTeam = rosterSelectTargetTeam || 1;
      if (tTeam === 1) state.p1Team[state.p1Index] = p.id;
      else state.p2Team[state.p2Index] = p.id;
      spawnTeamFighter(tTeam, p.id);
      closeMenusAfterPokemonSelect();
    };
    btn.oncontextmenu = e => {
      e.preventDefault();
      state.p2Team[state.p2Index] = p.id;
      spawnTeamFighter(2, p.id);
      closeMenusAfterPokemonSelect();
    };
    frag.appendChild(btn);
  });
  strip.appendChild(frag);
}

function initRosterStrip() {
  renderRosterList();

  const bottomRightPanel = document.getElementById("bottom-right-panel");
  const topMenuPanel = document.getElementById("top-menu-panel");

  // Hide all menus by default on all screen sizes (desktop, tablet, mobile)
  if (bottomRightPanel) {
    bottomRightPanel.classList.add("roster-hidden");
  }
  if (topMenuPanel) {
    topMenuPanel.classList.add("menu-hidden");
  }
  document.body.classList.remove("show-vpad");

  const toggleRosterPanel = () => {
    if (!bottomRightPanel) return;
    bottomRightPanel.classList.toggle("roster-hidden");
  };

  const btnToggleRoster = document.getElementById("btn-toggle-roster");
  if (btnToggleRoster) {
    btnToggleRoster.onclick = toggleRosterPanel;
  }
  const btnOpenRosterQuick = document.getElementById("btn-open-roster-quick");
  if (btnOpenRosterQuick) {
    btnOpenRosterQuick.onclick = toggleRosterPanel;
  }
  const btnCloseRoster = document.getElementById("btn-close-roster");
  if (btnCloseRoster && bottomRightPanel) {
    btnCloseRoster.onclick = () => {
      bottomRightPanel.classList.add("roster-hidden");
    };
  }

  const btnOpenTopMenu = document.getElementById("btn-open-top-menu");
  if (btnOpenTopMenu && topMenuPanel) {
    btnOpenTopMenu.onclick = () => {
      topMenuPanel.classList.toggle("menu-hidden");
    };
  }

  const btnRosterTarget = document.getElementById("btn-roster-target");
  if (btnRosterTarget) {
    btnRosterTarget.onclick = () => {
      rosterSelectTargetTeam = rosterSelectTargetTeam === 1 ? 2 : 1;
      btnRosterTarget.textContent = rosterSelectTargetTeam === 1 ? "🎯 対象: 自分(P1)" : "🎯 対象: 相手(P2)";
      btnRosterTarget.classList.toggle("p1-target", rosterSelectTargetTeam === 1);
      btnRosterTarget.classList.toggle("p2-target", rosterSelectTargetTeam === 2);
    };
  }

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
        closeMenusAfterPokemonSelect();
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
        closeMenusAfterPokemonSelect();
      }
    };
  }
}

// Wire top UI buttons
document.getElementById("btn-field-change").onclick = () => startFieldChange();
document.getElementById("btn-scene-terrain").onclick = () => startTerrainScene();
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
const btnTogglePad = document.getElementById("btn-toggle-pad");
if (btnTogglePad) {
  btnTogglePad.onclick = () => {
    document.body.classList.toggle("show-vpad");
  };
}

// Initialize Virtual Joystick, Action Pad Buttons, and Direct Field Touch-to-Move / Tap-to-Attack
function initMobileAndTouchControls() {
  // Global pointerdown capture to dismiss Menu 1 / Menu 2 / PokéData Modal when tapping outside their frame
  window.addEventListener(
    "pointerdown",
    e => {
      if (e.pointerType === "mouse") return; // Handled by mousedown
      tryDismissOpenMenusOnOutsideInteraction(e.target);
    },
    { passive: true }
  );

  const vjoyZone = document.getElementById("vjoy-zone");
  const vjoyBase = document.getElementById("vjoy-base");
  const vjoyStick = document.getElementById("vjoy-stick");

  function updateVJoyFromPoint(clientX, clientY) {
    if (!vjoyBase || !vjoyStick) return;
    const rect = vjoyBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const rawDx = clientX - cx;
    const rawDy = clientY - cy;
    const dist = Math.hypot(rawDx, rawDy);
    const maxR = vjoy.maxRadius;
    const clampedDist = Math.min(maxR, dist);
    const angle = Math.atan2(rawDy, rawDx);
    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    vjoyStick.style.transform = `translate(${stickX.toFixed(1)}px, ${stickY.toFixed(1)}px)`;
    vjoy.mag = clampedDist / maxR;
    if (vjoy.mag > 0.08) {
      vjoy.dx = Math.cos(angle);
      vjoy.dy = Math.sin(angle);
      touchMove.active = false;
      state.lastPlayerInputTime = state.time;
    } else {
      vjoy.dx = 0;
      vjoy.dy = 0;
    }
  }

  function resetVJoy() {
    vjoy.active = false;
    vjoy.pointerId = null;
    vjoy.dx = 0;
    vjoy.dy = 0;
    vjoy.mag = 0;
    if (vjoyStick) vjoyStick.style.transform = "translate(0px, 0px)";
    if (vjoyBase) vjoyBase.classList.remove("active");
  }

  if (vjoyZone) {
    vjoyZone.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      vjoy.active = true;
      vjoy.pointerId = e.pointerId;
      if (vjoyBase) vjoyBase.classList.add("active");
      try {
        vjoyZone.setPointerCapture(e.pointerId);
      } catch (_) {}
      updateVJoyFromPoint(e.clientX, e.clientY);
    });

    vjoyZone.addEventListener("pointermove", e => {
      if (!vjoy.active || e.pointerId !== vjoy.pointerId) return;
      e.preventDefault();
      updateVJoyFromPoint(e.clientX, e.clientY);
    });

    const endJoy = e => {
      if (e.pointerId !== vjoy.pointerId) return;
      resetVJoy();
    };
    vjoyZone.addEventListener("pointerup", endJoy);
    vjoyZone.addEventListener("pointercancel", endJoy);
  }

  // Right-side Virtual Skill Buttons (Slots 0..4)
  document.querySelectorAll(".vpad-skill-btn").forEach(btn => {
    const slotIdx = Number(btn.getAttribute("data-slot") || 0);
    btn.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add("pressed");
      triggerPlayerSkill(slotIdx);
    });
    const clearPress = () => btn.classList.remove("pressed");
    btn.addEventListener("pointerup", clearPress);
    btn.addEventListener("pointercancel", clearPress);
    btn.addEventListener("pointerleave", clearPress);
  });

  // Quick Mini Buttons (Mega, G-Max, Swap)
  const vbtnMega = document.getElementById("vbtn-mega");
  if (vbtnMega) {
    vbtnMega.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      toggleMegaEvolution(1);
    });
  }
  const vbtnGmax = document.getElementById("vbtn-gmax");
  if (vbtnGmax) {
    vbtnGmax.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      toggleGigantamax(1);
    });
  }
  const vbtnSwap = document.getElementById("vbtn-swap");
  if (vbtnSwap) {
    vbtnSwap.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      recallAndSwapPlayer();
    });
  }

  // Direct Battlefield Touch-to-Move & Tap-Enemy-to-Attack on Canvas
  canvas.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Only use touch-to-move for touch/pen pointers (desktop mouse click still fires primary attack)
    if (e.pointerType === "mouse") return;

    e.preventDefault();
    // If Menu 1 or Menu 2 was open, tapping the canvas outside closes it first without accidental move/attack
    if (tryDismissOpenMenusOnOutsideInteraction(e.target)) {
      return;
    }

    state.lastPlayerInputTime = state.time;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    const wp = screenToWorld(e.clientX, e.clientY);

    // Check if user tapped directly on an enemy Pokémon -> attack that enemy!
    const p1 = state.fighters.find(f => f.isPlayer);
    const tappedEnemy = state.fighters.find(
      f => f !== p1 && !f.ko && (state.battleRoyale || f.team !== 1) && Math.hypot(f.x - wp.x, f.y - wp.y) <= (f.hitRadius || 32) + 46
    );
    if (tappedEnemy && p1) {
      executeMove(p1, 0, tappedEnemy.x, tappedEnemy.y);
      return;
    }

    // Otherwise set touch-to-move destination on the battlefield!
    touchMove.active = true;
    touchMove.pointerId = e.pointerId;
    touchMove.worldX = wp.x;
    touchMove.worldY = wp.y;
    touchMove.indicatorAlpha = 1.0;
  });

  canvas.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") return;
    if (touchMove.active && e.pointerId === touchMove.pointerId) {
      e.preventDefault();
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      const wp = screenToWorld(e.clientX, e.clientY);
      touchMove.worldX = wp.x;
      touchMove.worldY = wp.y;
      touchMove.indicatorAlpha = 1.0;
      state.lastPlayerInputTime = state.time;
    }
  });

  const endCanvasTouch = e => {
    if (e.pointerId === touchMove.pointerId) {
      touchMove.pointerId = null;
    }
  };
  canvas.addEventListener("pointerup", endCanvasTouch);
  canvas.addEventListener("pointercancel", endCanvasTouch);
}
const btnAutoBattle = document.getElementById("btn-autobattle");
function updateEnemyAttackButtonUI() {
  if (!btnAutoBattle) return;
  if (state.autoBattleChoreography) {
    btnAutoBattle.textContent = "🎬 自動観戦: ON";
    btnAutoBattle.style.borderColor = "#38bdf8";
    btnAutoBattle.style.background = "rgba(3, 105, 161, 0.85)";
  } else if (state.enemyAttackEnabled) {
    btnAutoBattle.textContent = "⚔️ 敵の攻撃: ON (対戦 / P)";
    btnAutoBattle.style.borderColor = "#facc15";
    btnAutoBattle.style.background = "rgba(180, 83, 9, 0.85)";
  } else {
    btnAutoBattle.textContent = "🛡️ 敵の攻撃: OFF (練習 / P)";
    btnAutoBattle.style.borderColor = "#4ade80";
    btnAutoBattle.style.background = "rgba(21, 128, 61, 0.75)";
  }
}

function toggleEnemyAttackSetting() {
  state.autoBattleChoreography = false;
  state.enemyAttackEnabled = !state.enemyAttackEnabled;
  updateEnemyAttackButtonUI();
  showSubtitle(
    state.enemyAttackEnabled
      ? "⚔️ 敵の攻撃: ON（CPUが攻撃してきます）"
      : "🛡️ 敵の攻撃: OFF（練習モード：敵は攻撃してきません）",
    2.2
  );
}

if (btnAutoBattle) {
  btnAutoBattle.onclick = () => {
    toggleEnemyAttackSetting();
  };
  btnAutoBattle.oncontextmenu = e => {
    e.preventDefault();
    state.autoBattleChoreography = !state.autoBattleChoreography;
    if (state.autoBattleChoreography) state.enemyAttackEnabled = true;
    updateEnemyAttackButtonUI();
    showSubtitle(
      state.autoBattleChoreography
        ? "🎬 自動バトル観戦モード: ON（両ポケモン自動戦闘）"
        : state.enemyAttackEnabled
        ? "⚔️ 敵の攻撃: ON（手動操作＋CPU対戦）"
        : "🛡️ 敵の攻撃: OFF（練習モード：敵は攻撃してきません）",
      2.2
    );
  };
}
document.getElementById("btn-sound").onclick = e => {
  const on = SOUND.toggle();
  e.target.textContent = on ? "🔊 音: ON" : "🔇 音: OFF";
};

// Intelligent Combat AI helper for CPU (smooth strafing + reactive dodge; only attacks when canAttack is true!)
function runFluidBattleAI(f, dt, canAttack = false) {
  const opp = state.fighters
    .filter(o => o !== f && !o.ko && (state.battleRoyale || o.team !== f.team))
    .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  if (!opp) return;

  const dx = opp.x - f.x;
  const dy = opp.y - f.y;
  const dist = Math.hypot(dx, dy) || 1;
  const dirX = dx / dist;
  const dirY = dy / dist;

  // 1. Dynamic circular strafing + spacing (approaches & weaves smoothly on the battlefield)
  f.aiTimer = (f.aiTimer || 0) - dt;
  if (f.aiTimer <= 0 || f.targetWanderAngle === undefined) {
    f.aiTimer = (0.75 + Math.random() * 0.85) / (f.actionSpeedMult || 1.0);
    const strafeSign = Math.random() < 0.5 ? 1 : -1;
    const desiredOrbitAngle = Math.atan2(dy, dx) + strafeSign * (0.55 + Math.random() * 0.55);
    f.targetWanderAngle = desiredOrbitAngle;
    if (f.wanderAngle === undefined) f.wanderAngle = f.targetWanderAngle;
  }
  const angleDiff = Math.atan2(
    Math.sin(f.targetWanderAngle - f.wanderAngle),
    Math.cos(f.targetWanderAngle - f.wanderAngle)
  );
  f.wanderAngle += angleDiff * Math.min(1, dt * 5.2 * (f.actionSpeedMult || 1.0));

  let moveX = Math.cos(f.wanderAngle);
  let moveY = Math.sin(f.wanderAngle);

  // Ideal combat spacing oscillates dynamically so fighters weave around smoothly
  const rhythmWave = Math.sin(state.time * 2.4 + f.team * 1.7) * 55;
  const idealDist = (canAttack ? 175 : 220) + rhythmWave;
  const pullFactor = Math.max(-0.75, Math.min(0.95, (dist - idealDist) / 115));
  moveX = moveX * (1 - Math.abs(pullFactor) * 0.55) + dirX * pullFactor * 0.78;
  moveY = moveY * (1 - Math.abs(pullFactor) * 0.55) + dirY * pullFactor * 0.78;

  const onPlat = getPlatformUnder(f.x, f.y);
  const waterPenalty = state.fieldType === "water" && !f.swimmer && !f.flier && !onPlat ? 0.72 : 1.0;
  // If player scrolls far away across the infinite map, CPU speeds up to follow them!
  const chaseBoost = dist > 520 ? Math.min(2.2, dist / 380) : 1.0;

  f.vx += moveX * f.moveSpeed * 0.28 * waterPenalty * chaseBoost;
  f.vy += moveY * f.moveSpeed * 0.28 * waterPenalty * chaseBoost;

  // 2. Reactive Evasive Dodge (slot 2 = SPACE) when an incoming projectile or wave is about to hit!
  // Faster Pokémon (higher Speed stat) have sharper dodge reflexes!
  if (f.cooldowns[2] <= 0 && f.energy >= 15) {
    const dangerProj = state.projectiles.find(
      p => p.owner !== f && (state.battleRoyale || p.owner.team !== f.team) && Math.hypot(p.x - f.x, p.y - f.y) < 95 + (f.hitRadius || 24)
    );
    const dangerWave = state.waves.find(
      w => w.owner !== f && !w.hitSet.has(f) && Math.hypot(w.x - f.x, w.y - f.y) < 115 + (f.hitRadius || 24)
    );
    const reflexChance = (canAttack ? 0.24 : 0.14) * (f.actionSpeedMult || 1.0);
    if ((dangerProj || dangerWave) && Math.random() < reflexChance) {
      const perpAngle = Math.atan2(dy, dx) + (Math.random() < 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5);
      executeMove(f, 2, f.x + Math.cos(perpAngle) * 140, f.y + Math.sin(perpAngle) * 140);
      return;
    }
  }

  // If enemy attacks are disabled (default Practice Mode), stop here without attacking!
  if (!canAttack) return;

  // 3. Active Attack & Skill Choreography (only when canAttack === true)
  f.aiAttackCooldown = (f.aiAttackCooldown || 0) - dt;
  if (f.aiAttackCooldown <= 0 && f.activeMoveTimer <= 0.08) {
    const aimX = opp.x + (opp.vx || 0) * 6;
    const aimY = opp.y + (opp.vy || 0) * 6;

    const candidates = [];
    if (f.cooldowns[0] <= 0) candidates.push({ slot: 0, weight: dist < 220 ? 3.5 : 2.0 });
    if (f.cooldowns[1] <= 0 && f.energy >= Math.abs(f.moves[1]?.energy || 0)) {
      candidates.push({ slot: 1, weight: dist < 240 ? 3.2 : 2.2 });
    }
    if (f.cooldowns[3] <= 0 && f.energy >= Math.abs(f.moves[3]?.energy || 0)) {
      candidates.push({ slot: 3, weight: dist > 130 ? 3.8 : 2.4 });
    }
    if (f.cooldowns[4] <= 0 && f.energy >= Math.abs(f.moves[4]?.energy || 0)) {
      candidates.push({ slot: 4, weight: 4.5 });
    }

    if (candidates.length > 0) {
      const totalW = candidates.reduce((acc, c) => acc + c.weight, 0);
      let r = Math.random() * totalW;
      let chosenSlot = candidates[0].slot;
      for (const c of candidates) {
        r -= c.weight;
        if (r <= 0) {
          chosenSlot = c.slot;
          break;
        }
      }
      executeMove(f, chosenSlot, aimX, aimY);
      f.aiAttackCooldown = (0.68 + Math.random() * 0.72) / (f.actionSpeedMult || 1.0);
    } else {
      f.aiAttackCooldown = 0.25;
    }
  }
}

// Update loop
function update(dt) {
  if (state.screenFlash.life > 0) {
    state.screenFlash.life = Math.max(0, state.screenFlash.life - dt);
  }
  if (state.hitStopTimer > 0) {
    state.hitStopTimer = Math.max(0, state.hitStopTimer - dt);
    return;
  }

  state.time += dt;
  if (typeof updateAttackEffects === "function") updateAttackEffects(dt);
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
      // Snap fighters onto safe platforms in current sector if switching to water
      if (state.fieldType === "water") {
        ensureVisibleSectors(state.camX, state.camY);
        const p1 = state.fighters.find(f => f.team === 1);
        const p2 = state.fighters.find(f => f.team === 2);
        if (p1 && !p1.swimmer && !p1.flier && state.platforms[2]) {
          p1.x = state.platforms[2].x;
          p1.y = state.platforms[2].y;
        }
        if (p2 && !p2.swimmer && !p2.flier && state.platforms[1]) {
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
        state.clash.f1.vx = -dir * 7 * (state.clash.f1.knockbackMult || 1.0);
        state.clash.f2.vx = dir * 7 * (state.clash.f2.knockbackMult || 1.0);
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
    if (f.landSquashTimer > 0) f.landSquashTimer = Math.max(0, f.landSquashTimer - dt);
    if (f.doubleTeamTimer > 0) f.doubleTeamTimer = Math.max(0, f.doubleTeamTimer - dt);

    // Passive energy regen (scaled by pokeData Speed stat!)
    if (!f.ko) {
      f.energy = Math.min(f.maxEnergy, f.energy + dt * (f.energyRegen || 9.5));
    }

    if (f.ko) {
      f.x += f.vx;
      f.y += f.vy;
      const koTargetGroundZ = getTerrainHeightAt(f.x, f.y);
      f.groundZ = (Number(f.groundZ) || 0) + (koTargetGroundZ - (Number(f.groundZ) || 0)) * Math.min(1, dt * 15);
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

    // Player manual movement (Keyboard + Virtual Joystick + Direct Touch-to-Move) vs Fluid Battle Choreography AI
    if (f.sleepTimer <= 0 && f.frozenTimer <= 0) {
      let mx = 0;
      let my = 0;
      let inputScale = 1.0;
      if (f.isPlayer) {
        if (keys["w"] || keys["arrowup"]) my -= 1;
        if (keys["s"] || keys["arrowdown"]) my += 1;
        if (keys["a"] || keys["arrowleft"]) mx -= 1;
        if (keys["d"] || keys["arrowright"]) mx += 1;

        if (mx === 0 && my === 0 && vjoy.active && vjoy.mag > 0.08) {
          mx = vjoy.dx;
          my = vjoy.dy;
          inputScale = Math.min(1.0, Math.max(0.35, vjoy.mag));
        } else if (mx === 0 && my === 0 && touchMove.active) {
          const tdx = touchMove.worldX - f.x;
          const tdy = touchMove.worldY - f.y;
          const tdist = Math.hypot(tdx, tdy);
          if (tdist > 18) {
            mx = tdx / tdist;
            my = tdy / tdist;
            inputScale = Math.min(1.0, tdist / 45);
          } else if (touchMove.pointerId === null) {
            touchMove.active = false;
          }
        }
      }

      if (f.isPlayer && (mx !== 0 || my !== 0)) {
        const len = Math.hypot(mx, my) || 1;
        mx /= len;
        my /= len;
        const onPlat = getPlatformUnder(f.x, f.y);
        const waterPenalty = state.fieldType === "water" && !f.swimmer && !f.flier && !onPlat ? 0.68 : 1.0;
        f.vx += mx * f.moveSpeed * 0.36 * waterPenalty * inputScale;
        f.vy += my * f.moveSpeed * 0.36 * waterPenalty * inputScale;
        f.manualMoveAngle = Math.atan2(my, mx);
        f.manualMoveTimer = 0.25;
      } else if (!f.isPlayer) {
        // CPU always moves & weaves smoothly; only attacks if state.enemyAttackEnabled is ON!
        runFluidBattleAI(f, dt, state.enemyAttackEnabled);
      } else if (f.isPlayer && state.autoBattleChoreography && state.time - state.lastPlayerInputTime > 1.8) {
        // Optional spectator mode (Right-click on button) where P1 also auto-battles when hands-free
        runFluidBattleAI(f, dt, true);
      }
    }

    if (touchMove.indicatorAlpha > 0) {
      touchMove.indicatorAlpha = Math.max(0, touchMove.indicatorAlpha - dt * (touchMove.active ? 0.25 : 1.8));
    }

    if (f.manualMoveTimer > 0) {
      f.manualMoveTimer = Math.max(0, f.manualMoveTimer - dt);
    }

    // Automatically face the opponent Pokémon's position (front-left, front-right, back-left, back-right)
    const opp = state.fighters
      .filter(o => o !== f && !o.ko && (state.battleRoyale || o.team !== f.team))
      .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
    if (opp) {
      const fdx = opp.x - f.x;
      const fdy = opp.y - f.y;
      f.faceAngle = Math.atan2(fdy, fdx);
      f.smoothFaceAngle = f.faceAngle;
      if (typeof angleTo8Dir === "function") {
        f.dir8 = angleTo8Dir(f.faceAngle, f.dir8, f.facing);
      }
      f.facing = f.dir8.includes("right") ? 1 : -1;
    } else if (Math.hypot(f.vx, f.vy) > 0.2 && typeof angleTo8Dir === "function") {
      f.faceAngle = Math.atan2(f.vy, f.vx);
      f.dir8 = angleTo8Dir(f.faceAngle, f.dir8, f.facing);
      f.facing = f.dir8.includes("right") ? 1 : -1;
    }

    // Dash velocity override
    if (f.dashTimer > 0) {
      f.dashTimer -= dt;
      f.x += f.dashVx;
      f.y += f.dashVy;
      if (Math.random() < 0.65) {
        state.particles.push({
          x: f.x,
          y: f.y + 12,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          r: (7 + Math.random() * 5) * (f.scale / 1.4),
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

    // Terrain elevation is independent from jump height (`z`). Broad ramps
    // and a short interpolation keep movement smooth while attacks and sprites
    // remain attached to the same stepped ground plane.
    const targetGroundZ = getTerrainHeightAt(f.x, f.y);
    const groundFollow = Math.min(1, dt * 15);
    f.groundZ = (Number(f.groundZ) || 0) + (targetGroundZ - (Number(f.groundZ) || 0)) * groundFollow;

    // Vertical hop / fly physics + landing squash trigger (heavier Pokémon shake the ground on landing!)
    const prevZ = f.z;
    if (f.z > 0 || f.vz !== 0) {
      f.z = Math.max(0, f.z + f.vz);
      f.vz -= 0.52;
      if (prevZ > 0 && f.z === 0) {
        f.vz = 0;
        f.landSquashTimer = 0.22;
        if ((f.weightKg || 30) >= 120) {
          state.cameraShake = Math.max(state.cameraShake, Math.min(7, Math.log10(f.weightKg) * 2.2));
        }
        if (state.fieldType === "water" && !getPlatformUnder(f.x, f.y)) {
          state.ripples.push({
            x: f.x,
            y: f.y + 12,
            r: 8,
            maxR: 48 * (f.scale / 1.4),
            color: "rgba(220,245,255,0.9)",
            width: 2.5,
            alpha: 0.9
          });
        }
      }
    }

    // No arena boundary clamping — fighters can move infinitely far in any direction!

    // Distance-driven wake emission keeps ripple density identical at 30/60fps.
    const waterContact = getWaterContactState(f, state.time);
    if (!f.waterWakeTracker) {
      f.waterWakeTracker = { x: f.x, y: f.y, distance: 0 };
    }
    const movedDistance = Math.hypot(f.x - f.waterWakeTracker.x, f.y - f.waterWakeTracker.y);
    f.waterWakeTracker.x = f.x;
    f.waterWakeTracker.y = f.y;
    if (waterContact.active && Math.hypot(f.vx, f.vy) > 0.8) {
      f.waterWakeTracker.distance += movedDistance;
      const wakeSpacing = Math.max(15, 24 * (f.scale / 1.4));
      let emitted = 0;
      while (f.waterWakeTracker.distance >= wakeSpacing && emitted < 2) {
        f.waterWakeTracker.distance -= wakeSpacing;
        const velocity = Math.max(0.001, Math.hypot(f.vx, f.vy));
        const backX = f.x - (f.vx / velocity) * Math.min(18, wakeSpacing * 0.58);
        const backY = f.y - (f.vy / velocity) * Math.min(11, wakeSpacing * 0.34);
        state.ripples.push({
          x: backX,
          y: backY + 10,
          r: 5,
          maxR: 30 * (f.scale / 1.4),
          color: "rgba(207,246,244,0.68)",
          width: 1.8,
          alpha: 0.72
        });
        emitted += 1;
      }
    } else {
      f.waterWakeTracker.distance = 0;
    }
  }

  // Update Camera to follow Player Pokémon for seamless infinite scrolling
  const camTarget =
    state.fighters.find(f => f.isPlayer && !f.ko) ||
    state.fighters.find(f => f.team === 1) ||
    state.fighters[0];
  if (camTarget) {
    if (!state.camInitialized) {
      state.camX = camTarget.x;
      state.camY = camTarget.y;
      state.camInitialized = true;
    } else {
      const follow = Math.min(1, dt * 18);
      state.camX += (camTarget.x - state.camX) * follow;
      state.camY += (camTarget.y - state.camY) * follow;
    }
  }
  ensureVisibleSectors(state.camX, state.camY);

  // Update Melee Crescent Slashes
  for (let i = state.slashes.length - 1; i >= 0; i--) {
    const s = state.slashes[i];
    s.life -= dt;
    if (s.owner) {
      s.x = s.owner.x + Math.cos(s.angle) * 38 * (s.owner.scale / 1.4);
      s.y = s.owner.y + Math.sin(s.angle) * 26 * (s.owner.scale / 1.4) - s.owner.z;
    }
    if (s.life <= 0) state.slashes.splice(i, 1);
  }

  // Update Floating Damage Popups
  for (let i = state.damagePopups.length - 1; i >= 0; i--) {
    const dp = state.damagePopups[i];
    dp.life -= dt;
    dp.y -= dt * 36;
    if (dp.life <= 0) state.damagePopups.splice(i, 1);
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
      if (p.kind === "fireblast_orb" && p.targetFighter && !p.targetFighter.ko) {
        const curSpd = Math.hypot(p.vx, p.vy) || 9.4;
        const tdx = p.targetFighter.x - p.x;
        const tdy = p.targetFighter.y - p.y;
        const tdist = Math.hypot(tdx, tdy) || 1;
        p.vx = p.vx * 0.84 + (tdx / tdist) * curSpd * 0.16;
        p.vy = p.vy * 0.84 + (tdy / tdist) * curSpd * 0.16;
      }
      p.x += p.vx;
      p.y += p.vy;
    }

    // Hit detection (uses target f.hitRadius scaled by pokeData height & weight)
    for (const f of state.fighters) {
      if (f === p.owner || f.ko || (!state.battleRoyale && f.team === p.owner.team)) continue;
      const projectileVisualY = p.y - getTerrainHeightAt(p.x, p.y);
      const fighterVisualY = getVisualGroundY(f.x, f.y, f) - f.z;
      if (Math.hypot(f.x - p.x, fighterVisualY - projectileVisualY) < p.r + (f.hitRadius || 24)) {
        applyDamage(p.owner, f, p.dmg, (p.vx || 0) * 0.35, (p.vy || 0) * 0.35, {
          sleep: p.sleep,
          melee: p.kind === "melee_hitbox",
          category: p.category || (p.kind === "melee_hitbox" ? "physical" : "special"),
          elementType: p.elementType,
          basePower: p.basePower,
          attackEffectAsset: p.attackEffectAsset,
          impactVx: p.vx || 0,
          impactVy: p.vy || 0
        });
        if (p.kind === "fireblast_orb") {
          spawnFireBlastKanjiExplosion(p, f);
          p.kanjiTriggered = true;
        }
        p.life = 0;
        break;
      }
    }

    if (p.life <= 0) {
      if (p.kind === "fireblast_orb" && !p.kanjiTriggered) {
        spawnFireBlastKanjiExplosion(p, null);
      }
      state.projectiles.splice(i, 1);
    }
  }

  // Update Fire Blast 「大」 (Dai) kanji explosions
  for (let i = state.fireBlasts.length - 1; i >= 0; i--) {
    const fb = state.fireBlasts[i];
    fb.age = (Number(fb.age) || 0) + dt;
    fb.life = Math.max(0, fb.maxLife - fb.age);
    if (fb.targetFighter) {
      fb.x = fb.targetFighter.x;
      fb.y = getFighterEffectTargetY(fb.targetFighter);
      fb.logicalX = fb.targetFighter.x;
      fb.logicalY = fb.targetFighter.y;
    }
    const expandProgress = Math.min(1, fb.age / Math.max(0.01, fb.maxLife * 0.32));
    const currentReach = fb.radius * (0.35 + expandProgress * 0.65);
    for (const f of state.fighters) {
      if (f === fb.owner || f.ko || fb.hitSet.has(f) || (!state.battleRoyale && f.team === fb.owner?.team)) continue;
      const fighterVisualY = getFighterEffectTargetY(f);
      if (Math.hypot(f.x - fb.x, fighterVisualY - fb.y) <= currentReach + (f.hitRadius || 24) * 0.45) {
        fb.hitSet.add(f);
        const dx = f.x - fb.x;
        const dy = f.y - (fb.logicalY ?? fb.y);
        const len = Math.hypot(dx, dy) || 1;
        applyDamage(fb.owner, f, fb.dmg, (dx / len) * 7.5, (dy / len) * 7.5, {
          category: fb.category || "special",
          elementType: fb.elementType || "fire",
          basePower: fb.basePower || 115
        });
      }
    }
    if (fb.life <= 0) state.fireBlasts.splice(i, 1);
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
      if (Math.hypot(f.x - w.x, f.y - w.y) < w.radius * 0.85 + (f.hitRadius || 24) * 0.4) {
        w.hitSet.add(f);
        applyDamage(w.owner, f, w.dmg, w.dirX * 9, w.dirY * 9, {
          category: w.category || "special",
          elementType: w.elementType || "water",
          basePower: w.basePower
        });
      }
    }
    if (w.life <= 0) state.waves.splice(i, 1);
  }

  // Update self-centred expanding Water attacks. The collision front follows
  // the same eased radius used by the four-arm renderer and hits each target once.
  for (let i = state.waterSurges.length - 1; i >= 0; i--) {
    const surge = state.waterSurges[i];
    surge.age += dt;
    surge.life = Math.max(0, surge.maxLife - surge.age);
    const progress = Math.max(0, Math.min(1, surge.age / surge.maxLife));
    const surgePhase = Math.min(1, Math.max(0, (progress - 0.04) / 0.68));
    const smoothSurgePhase = surgePhase * surgePhase * (3 - 2 * surgePhase);
    const eased = typeof getWaterSurgeExpansionProgress === "function"
      ? getWaterSurgeExpansionProgress(progress)
      : 1 - Math.pow(1 - smoothSurgePhase, 3);
    surge.radius = surge.startRadius + (surge.maxRadius - surge.startRadius) * eased;

    for (const f of state.fighters) {
      if (f === surge.owner || f.ko || surge.hitSet.has(f)) continue;
      const distance = getVisualDistance(
        surge.x,
        surge.y,
        f.x,
        f.y,
        getTerrainHeightAt(surge.x, surge.y),
        f.groundZ,
        typeof getGroundEffectPerspective === "function" ? getGroundEffectPerspective(surge) : 0.88
      );
      if (distance <= surge.radius + (f.hitRadius || 24) * 0.45) {
        surge.hitSet.add(f);
        const dx = f.x - surge.x;
        const dy = f.y - surge.y;
        const length = Math.hypot(dx, dy) || 1;
        applyDamage(surge.owner, f, surge.dmg, (dx / length) * 8.5, (dy / length) * 8.5, {
          category: surge.category || "special",
          elementType: surge.elementType || "water",
          basePower: surge.basePower
        });
      }
    }

    if (surge.life <= 0) state.waterSurges.splice(i, 1);
  }

  // Ground attacks deal one area hit, while their cracks remain as a quiet
  // decal for the rest of the staged 4.2 second presentation.
  for (let i = state.groundBreaks.length - 1; i >= 0; i--) {
    const groundFx = state.groundBreaks[i];
    groundFx.age += dt;
    groundFx.life = Math.max(0, groundFx.maxLife - groundFx.age);
    if (!groundFx.hitApplied && groundFx.age >= groundFx.hitDelay) {
      groundFx.hitApplied = true;
      triggerFieldFlash("#fff7df", groundFx.kind === "ground_smash" ? 0.24 : 0.18, 0.085);
      state.hitStopTimer = Math.max(state.hitStopTimer, 0.048);
      state.cameraShake = Math.max(state.cameraShake, groundFx.kind === "ground_smash" ? 8 : 5.5);
      for (const f of state.fighters) {
        if (f === groundFx.owner || f.ko) continue;
        const distance = getVisualDistance(
          groundFx.x,
          groundFx.y,
          f.x,
          f.y,
          getTerrainHeightAt(groundFx.x, groundFx.y),
          f.groundZ,
          typeof getGroundEffectPerspective === "function" ? getGroundEffectPerspective(groundFx) : 0.88
        );
        if (distance > groundFx.radius + (f.hitRadius || 24) * 0.35) continue;
        const dx = f.x - groundFx.x;
        const dy = f.y - groundFx.y;
        const length = Math.hypot(dx, dy) || 1;
        applyDamage(groundFx.owner, f, groundFx.dmg, (dx / length) * 6.5, (dy / length) * 6.5, {
          category: groundFx.category,
          elementType: groundFx.elementType || "ground",
          basePower: groundFx.basePower
        });
      }
    }
    if (groundFx.life <= 0) state.groundBreaks.splice(i, 1);
  }

  // Update the compact Whirlpool channel effect.
  for (let i = state.whirlpools.length - 1; i >= 0; i--) {
    const wp = state.whirlpools[i];
    wp.life -= dt;
    for (const f of state.fighters) {
      if (f === wp.owner || f.ko) continue;
      const dist = Math.hypot(f.x - wp.x, f.y - wp.y);
      if (dist < wp.radius * 1.45) {
        // Pull fighter into the vortex & lift them up the water cyclone column! (Heavy Pokémon resist pull slightly)
        const pullMult = 0.08 * (f.knockbackMult || 1.0);
        f.x += (wp.x - f.x) * pullMult;
        f.y += (wp.y - f.y) * pullMult;
        const targetZ = Math.min(wp.height - 18, (1 - wp.life / wp.maxLife) * wp.height * 1.2);
        f.z += (targetZ - f.z) * 0.15 * (f.jumpForceMult || 1.0);
        if (Math.random() < 0.18) {
          const showImpactFeedback = !wp.impactShown?.has(f);
          const impactFeedbackShown = applyDamage(wp.owner, f, wp.dmg * 0.08, 0, 0, {
            category: wp.category || "special",
            elementType: wp.elementType || "water",
            basePower: (wp.basePower || 90) * 0.1,
            suppressImpactFeedback: !showImpactFeedback
          });
          if (showImpactFeedback && impactFeedbackShown) wp.impactShown?.add(f);
        }
      }
    }
    if (wp.life <= 0) {
      // A few droplets mark the end without a second full-screen burst.
      spawnBurst(wp.x, wp.y, "#bfeaff", 4, 3, 0.3, 0.55);
      state.whirlpools.splice(i, 1);
    }
  }

  // Update Beams (Ice Beam, Hyper Beam, Hydro Pump, Lightning)
  for (let i = state.beams.length - 1; i >= 0; i--) {
    const b = state.beams[i];
    b.age = (Number(b.age) || 0) + dt;
    updateTrackedBeamEndpoints(b);
    if (!b.hitApplied && b.age >= (b.hitDelay || 0)) {
      b.hitApplied = true;
      if (b.kind === "thunder") {
        triggerFieldFlash("#fffde2", 0.3, 0.075);
        state.hitStopTimer = Math.max(state.hitStopTimer, 0.04);
      } else if (b.kind === "thunderbolt") {
        triggerFieldFlash("#fff9bd", 0.15, 0.055);
      }
      for (const f of state.fighters) {
        if (f === b.owner || f.ko) continue;
        // Distance from point to line segment
        const l2 = Math.pow(b.x2 - b.x1, 2) + Math.pow(b.y2 - b.y1, 2) || 1;
        const fighterVisualY = getFighterEffectTargetY(f);
        let t = ((f.x - b.x1) * (b.x2 - b.x1) + (fighterVisualY - b.y1) * (b.y2 - b.y1)) / l2;
        t = Math.max(0, Math.min(1, t));
        const px = b.x1 + t * (b.x2 - b.x1);
        const py = b.y1 + t * (b.y2 - b.y1);
        const beamRadius = Number.isFinite(b.collisionRadius) ? b.collisionRadius : b.width * 0.5;
        if (Math.hypot(f.x - px, fighterVisualY - py) < beamRadius + (f.hitRadius || 26)) {
          applyDamage(b.owner, f, b.dmg, (b.x2 - b.x1) * 0.015, (b.y2 - b.y1) * 0.015, {
            freeze: b.kind === "ice",
            category: b.category || "special",
            elementType: b.elementType,
            basePower: b.basePower
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

function drawFieldMaterial(fieldType, viewLeft, viewTop, viewW, viewH) {
  if (fieldType === "terrain") {
    if (typeof drawTerracedBattlefield === "function") {
      drawTerracedBattlefield(ctx, state.terraces, viewLeft, viewTop, viewW, viewH, state.time);
    } else {
      drawGrassField(viewLeft, viewTop, viewW, viewH);
    }
  } else if (fieldType === "grass") {
    drawGrassField(viewLeft, viewTop, viewW, viewH);
  } else {
    drawWaterSurface(viewLeft, viewTop, viewW, viewH);
    drawPlatformsAndIce();
  }
}

// Render Infinite Scrolling Field, Enlarged Map Objects, Pokémon (live multi-frame GIF layer) & Custom Move Effects
function render() {
  if (fxCanvas && fxCtx !== ctx) {
    fxCtx.clearRect(0, 0, W, H);
  }

  let shakeX = 0;
  let shakeY = 0;
  if (state.cameraShake > 0) {
    shakeX = (Math.random() - 0.5) * state.cameraShake;
    shakeY = (Math.random() - 0.5) * state.cameraShake;
  }

  const camOffsetX = W * 0.5 - state.camX + shakeX;
  const camOffsetY = H * 0.5 - state.camY + shakeY;
  const viewLeft = state.camX - W * 0.5 - 120;
  const viewTop = state.camY - H * 0.5 - 120;
  const viewW = W + 240;
  const viewH = H + 240;
  const hd2dFieldType = state.fieldTransition.active ? "mechanical" : state.fieldType;
  if (gameWrapper && gameWrapper.dataset.field !== hd2dFieldType) {
    gameWrapper.dataset.field = hd2dFieldType;
  }

  ctx.save();
  if (fxCtx !== ctx) fxCtx.save();

  ctx.translate(camOffsetX, camOffsetY);
  if (fxCtx !== ctx) fxCtx.translate(camOffsetX, camOffsetY);

  // 1. Draw Infinite Scrolling Arena Floor (Grass vs Water vs Field Change Transition)
  if (state.fieldTransition.active && state.fieldTransition.phase === 0) {
    drawMechanicalBasin(viewLeft, viewTop, viewW, viewH);
    const splitOffset = state.fieldTransition.progress * (W * 0.55);
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewLeft, viewTop, viewW * 0.5 - splitOffset, viewH);
    ctx.clip();
    drawFieldMaterial(state.fieldType, viewLeft, viewTop, viewW, viewH);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(state.camX + splitOffset, viewTop, viewW * 0.5, viewH);
    ctx.clip();
    drawFieldMaterial(state.fieldType, viewLeft, viewTop, viewW, viewH);
    ctx.restore();

    // Steam clouds along the splitting seam
    for (let y = viewTop; y <= viewTop + viewH; y += 36) {
      ctx.fillStyle = "rgba(235, 242, 250, 0.72)";
      const sx = state.camX + Math.sin(state.time * 12 + y) * 12;
      ctx.beginPath();
      ctx.arc(sx - splitOffset, y, 22 + Math.sin(y) * 6, 0, Math.PI * 2);
      ctx.arc(sx + splitOffset, y, 22 + Math.cos(y) * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (state.fieldTransition.active && state.fieldTransition.phase === 1) {
    drawMechanicalBasin(viewLeft, viewTop, viewW, viewH);
    const fillW = W * 0.6 * state.fieldTransition.progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(state.camX - W * 0.5 - 60, viewTop, fillW + 60, viewH);
    ctx.rect(state.camX + W * 0.5 - fillW, viewTop, fillW + 60, viewH);
    ctx.clip();
    drawFieldMaterial(state.fieldTransition.targetField, viewLeft, viewTop, viewW, viewH);
    ctx.restore();
  } else {
    drawFieldMaterial(state.fieldType, viewLeft, viewTop, viewW, viewH);
  }

  // HD-2D environment pass: a restrained material glaze plus field-specific
  // architecture. It stays below the live pixel sprites and combat effects.
  if (globalThis.HD2DRenderer) {
    const drawHD2DEnvironmentLayer = (fieldType, opacity = 1) => {
      if (opacity <= 0.001) return;
      const hd2dOptions = {
        fieldType,
        viewLeft,
        viewTop,
        viewW,
        viewH,
        centerX: state.camX,
        centerY: state.camY,
        viewportW: W,
        viewportH: H,
        sectors: state.activeSectors,
        sectorW: SECTOR_W,
        sectorH: SECTOR_H,
        time: state.time,
        opacity,
        alpha: 0.18 * opacity
      };
      if (typeof globalThis.HD2DRenderer.drawMaterialPass === "function") {
        globalThis.HD2DRenderer.drawMaterialPass(ctx, hd2dOptions);
      }
      if (typeof globalThis.HD2DRenderer.drawEnvironmentArchitecture === "function") {
        globalThis.HD2DRenderer.drawEnvironmentArchitecture(ctx, hd2dOptions);
      }
    };
    if (state.fieldTransition.active && state.fieldTransition.phase === 1) {
      const blend = Math.max(0, Math.min(1, state.fieldTransition.progress));
      drawHD2DEnvironmentLayer("mechanical", 1 - blend);
      drawHD2DEnvironmentLayer(state.fieldTransition.targetField, blend);
    } else {
      drawHD2DEnvironmentLayer(hd2dFieldType, 1);
    }
  }

  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.drawArenaAtmosphere === "function") {
    globalThis.ArenaRenderer.drawArenaAtmosphere(ctx, {
      fieldType: state.fieldType,
      viewLeft,
      viewTop,
      viewW,
      viewH,
      centerX: state.camX,
      centerY: state.camY,
      time: state.time
    });
  }

  // 2. Draw Water Ripples & Touch-to-Move Target Indicator (ground layer)
  for (const r of state.ripples) {
    drawEllipseRing(ctx, r.x, r.y - getTerrainHeightAt(r.x, r.y), r.r, r.r * 0.55, r.color, r.width, Math.max(0, r.alpha));
  }
  if (touchMove.indicatorAlpha > 0.02) {
    const pulseR = 18 + Math.sin(state.time * 9) * 4;
    const markerY = touchMove.worldY - getTerrainHeightAt(touchMove.worldX, touchMove.worldY);
    drawEllipseRing(ctx, touchMove.worldX, markerY, pulseR, pulseR * 0.6, "#38bdf8", 3, touchMove.indicatorAlpha * 0.9);
    drawEllipseRing(ctx, touchMove.worldX, markerY, pulseR * 0.45, pulseR * 0.28, "#fef08a", 2.5, touchMove.indicatorAlpha);
  }

  for (const groundFx of state.groundBreaks) {
    if (typeof drawGroundBreakEffect === "function") {
      drawGroundBreakEffect(ctx, {
        ...groundFx,
        y: groundFx.y - getTerrainHeightAt(groundFx.x, groundFx.y),
        layer: "ground"
      }, state.time);
    }
  }

  // 3. Draw the ground/behind half of radial Water attacks. The matching
  // foreground half is drawn after the live sprite layer, like the reference.
  for (const w of state.waves) {
    drawSurfWave(fxCtx, w.x, w.y, w.dirX, w.dirY, w.radius, state.time, Math.min(1, w.life * 2));
  }
  for (const surge of state.waterSurges) {
    if (typeof drawWaterSurgeEffect === "function") {
      drawWaterSurgeEffect(ctx, {
        ...surge,
        y: surge.y - getTerrainHeightAt(surge.x, surge.y),
        radius: surge.maxRadius,
        layer: "back"
      }, state.time);
    }
  }

  // 4. Draw Fighters (sorted by Y for proper 2.5D depth)
  const sortedFighters = [...state.fighters].sort(
    (a, b) => getVisualGroundY(a.x, a.y, a) - getVisualGroundY(b.x, b.y, b)
  );
  for (const f of sortedFighters) {
    drawFighter(f);
  }

  // Only the occupied front lip crosses in front of a fighter. This small
  // occlusion is what makes the sprite feel planted on a floating platform.
  if (
    state.fieldType === "water" &&
    globalThis.ArenaRenderer &&
    typeof globalThis.ArenaRenderer.drawPlatformForegrounds === "function"
  ) {
    globalThis.ArenaRenderer.drawPlatformForegrounds(fxCtx, {
      platforms: state.platforms,
      iceFloes: state.iceFloes,
      fighters: state.fighters,
      time: state.time
    });
  }

  // Subtle local illumination and soft near-camera framing create the
  // miniature-diorama read without softening the pixel-art fighters.
  let hd2dForegroundOptions = null;
  if (globalThis.HD2DRenderer) {
    hd2dForegroundOptions = {
      fieldType: hd2dFieldType,
      viewLeft: state.camX - W * 0.5,
      viewTop: state.camY - H * 0.5,
      viewW: W,
      viewH: H,
      centerX: state.camX,
      centerY: state.camY,
      viewportW: W,
      viewportH: H,
      time: state.time,
      fighters: state.fighters.map(fighter => {
        const fighterSize = Math.max(34, Number(fighter.targetPx) || 68 * (fighter.scale || fighter.data?.scale || 1.35));
        return {
          x: fighter.x,
          y: fighter.y,
          z: fighter.z || 0,
          width: fighterSize,
          height: fighterSize,
          lightY: getVisualGroundY(fighter.x, fighter.y, fighter) + 14,
          types: fighter.types,
          alpha: fighter.ko ? 0 : 1,
          hidden: fighter.ko
        };
      })
    };
    if (typeof globalThis.HD2DRenderer.drawDynamicEntityLights === "function") {
      globalThis.HD2DRenderer.drawDynamicEntityLights(fxCtx, hd2dForegroundOptions);
    }
  }

  // Sync & translate DOM fighter layer by exact world-to-screen camera offset
  if (typeof cleanupUnusedFighterDomNodes === "function") {
    cleanupUnusedFighterDomNodes(state.fighters, camOffsetX, camOffsetY);
  }

  for (const surge of state.waterSurges) {
    if (typeof drawWaterSurgeEffect === "function") {
      drawWaterSurgeEffect(fxCtx, {
        ...surge,
        y: surge.y - getTerrainHeightAt(surge.x, surge.y),
        radius: surge.maxRadius,
        layer: "front"
      }, state.time);
    }
  }

  // Dust, impact flash, and airborne chunks belong in front of the live
  // sprites; the matching crater and cracks remain on the ground canvas.
  for (const groundFx of state.groundBreaks) {
    if (typeof drawGroundBreakEffect === "function") {
      drawGroundBreakEffect(fxCtx, {
        ...groundFx,
        y: groundFx.y - getTerrainHeightAt(groundFx.x, groundFx.y),
        layer: "front"
      }, state.time);
    }
  }

  // 5. Draw compact Whirlpool bands (foreground FX layer)
  for (const wp of state.whirlpools) {
    drawWhirlpoolTornado(fxCtx, wp.x, wp.y, wp.radius, wp.height, state.time, Math.min(1, wp.life * 1.5));
  }

  // 6. Draw Melee Crescent Slash Arcs (foreground FX layer)
  for (const s of state.slashes) {
    drawSlashArc(fxCtx, s);
  }

  // 7. Draw Projectiles (foreground FX layer)
  for (const p of state.projectiles) {
    drawProjectile(fxCtx, p);
  }

  // 8. Draw Beams (Ice Beam, Hyper Beam, Hydro Pump, Lightning) & Fire Blast 「大」 kanji (foreground FX layer)
  for (const b of state.beams) {
    drawBeam(fxCtx, b);
  }
  for (const fb of state.fireBlasts) {
    if (typeof drawFireBlastKanjiEffect === "function") {
      drawFireBlastKanjiEffect(fxCtx, fb, state.time);
    }
  }

  // 9. Draw Pokéball Recall Red Lasers (foreground FX layer)
  for (const rl of state.recallLasers) {
    fxCtx.save();
    fxCtx.strokeStyle = "#ff2a55";
    fxCtx.lineWidth = 6 * (rl.life / rl.maxLife);
    fxCtx.shadowColor = "#ff2a55";
    fxCtx.shadowBlur = 14;
    fxCtx.beginPath();
    fxCtx.moveTo(rl.x1, rl.y1);
    fxCtx.lineTo(rl.x2, rl.y2);
    fxCtx.stroke();
    fxCtx.restore();
  }

  // 10. Draw Particles (foreground FX layer)
  for (const pt of state.particles) {
    fxCtx.save();
    fxCtx.translate(0, -getTerrainHeightAt(pt.x, pt.y));
    fxCtx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    fxCtx.fillStyle = pt.color;
    fxCtx.beginPath();
    fxCtx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
    fxCtx.fill();
    fxCtx.restore();
  }

  // 11. Draw the single lightweight hit ring used by ranged attacks.
  if (typeof drawRichAttackEffects === "function") drawRichAttackEffects(fxCtx);

  // Near-camera rails, grass silhouettes and rocks occlude the lower edge of
  // attacks as real foreground geometry would. Damage labels stay readable.
  if (
    hd2dForegroundOptions &&
    typeof globalThis.HD2DRenderer.drawForegroundFrame === "function"
  ) {
    const drawHD2DForeground = (fieldType, opacity = 1) => {
      if (opacity <= 0.001) return;
      globalThis.HD2DRenderer.drawForegroundFrame(fxCtx, {
        ...hd2dForegroundOptions,
        fieldType,
        opacity
      });
    };
    if (state.fieldTransition.active && state.fieldTransition.phase === 1) {
      const blend = Math.max(0, Math.min(1, state.fieldTransition.progress));
      drawHD2DForeground("mechanical", 1 - blend);
      drawHD2DForeground(state.fieldTransition.targetField, blend);
    } else {
      drawHD2DForeground(hd2dFieldType, 1);
    }
  }

  // 12. Draw Floating Damage & Type Effectiveness Popups (foreground FX layer)
  for (const dp of state.damagePopups) {
    drawDamagePopup(fxCtx, dp);
  }

  if (fxCtx !== ctx) {
    fxCtx.restore();
  }
  ctx.restore();

  if (globalThis.HD2DRenderer && typeof globalThis.HD2DRenderer.drawScreenGrade === "function") {
    const drawHD2DGrade = (fieldType, intensity = 1) => {
      if (intensity <= 0.001) return;
      globalThis.HD2DRenderer.drawScreenGrade(fxCtx, {
        fieldType,
        width: W,
        height: H,
        time: state.time,
        dpr: RENDER_DPR,
        intensity
      });
    };
    if (state.fieldTransition.active && state.fieldTransition.phase === 1) {
      const blend = Math.max(0, Math.min(1, state.fieldTransition.progress));
      drawHD2DGrade("mechanical", 1 - blend);
      drawHD2DGrade(state.fieldTransition.targetField, blend);
    } else {
      drawHD2DGrade(hd2dFieldType, 1);
    }
  }

  if (state.screenFlash.life > 0 && state.screenFlash.maxLife > 0) {
    const flashRatio = state.screenFlash.life / state.screenFlash.maxLife;
    fxCtx.save();
    fxCtx.setTransform(RENDER_DPR, 0, 0, RENDER_DPR, 0, 0);
    fxCtx.globalCompositeOperation = "screen";
    fxCtx.globalAlpha = state.screenFlash.alpha * flashRatio * flashRatio;
    fxCtx.fillStyle = state.screenFlash.color;
    fxCtx.fillRect(0, 0, W, H);
    fxCtx.restore();
  }
  if (typeof syncAttackGifEffects === "function") {
    syncAttackGifEffects(camOffsetX, camOffsetY);
  }
}

function drawGrassField(viewLeft, viewTop, viewW, viewH) {
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.drawGrassField === "function") {
    globalThis.ArenaRenderer.drawGrassField(ctx, {
      viewLeft,
      viewTop,
      viewW,
      viewH,
      sectors: state.activeSectors,
      sectorW: SECTOR_W,
      sectorH: SECTOR_H,
      time: state.time
    });
    return;
  }
  ctx.save();

  // Infinite world-space lawn mowing stripes (96px wide)
  const stripeW = 96;
  const startStripeX = Math.floor(viewLeft / stripeW) * stripeW;
  const endStripeX = viewLeft + viewW + stripeW;
  for (let sx = startStripeX; sx < endStripeX; sx += stripeW) {
    const idx = Math.floor(sx / stripeW);
    ctx.fillStyle = ((idx % 2) + 2) % 2 === 0 ? "#2d6a31" : "#347839";
    ctx.fillRect(sx, viewTop, stripeW + 1, viewH);
  }

  // Subtle horizontal turf mowing grid lines so vertical movement is also visually unmistakable
  const rowH = 140;
  const startRowY = Math.floor(viewTop / rowH) * rowH;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  for (let sy = startRowY; sy < viewTop + viewH; sy += rowH) {
    ctx.beginPath();
    ctx.moveTo(viewLeft, sy);
    ctx.lineTo(viewLeft + viewW, sy);
    ctx.stroke();
  }

  // Draw Enlarged Stadium Turf Markings & Giant Pokéball Monuments in every visible sector
  for (const sec of state.activeSectors) {
    const scx = sec.cx;
    const scy = sec.cy;

    // Outer stadium pitch boundary per sector
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(scx - SECTOR_W * 0.44, scy - SECTOR_H * 0.43, SECTOR_W * 0.88, SECTOR_H * 0.86, 36);
    ctx.stroke();

    // Center dividing line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.82)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(scx, scy - SECTOR_H * 0.43);
    ctx.lineTo(scx, scy + SECTOR_H * 0.43);
    ctx.stroke();

    // Giant Center Pokéball Stadium Emblem (r=230, diameter 460px!)
    ctx.fillStyle = "rgba(239, 35, 60, 0.22)";
    ctx.beginPath();
    ctx.arc(scx, scy, 230, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.beginPath();
    ctx.arc(scx, scy, 230, 0, Math.PI);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(scx, scy, 230, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#2d6a31";
    ctx.beginPath();
    ctx.arc(scx, scy, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Left & Right Giant Trainer Battle Circles (r=118, diameter 236px!)
    for (const dir of [-1, 1]) {
      const bx = scx + dir * 470;
      const by = scy + 32;
      ctx.fillStyle = dir < 0 ? "rgba(239, 35, 60, 0.25)" : "rgba(56, 189, 248, 0.25)";
      ctx.beginPath();
      ctx.ellipse(bx, by, 118, 82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx, by, 36, 25, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMechanicalBasin(viewLeft, viewTop, viewW, viewH) {
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.drawMechanicalBasin === "function") {
    globalThis.ArenaRenderer.drawMechanicalBasin(ctx, { viewLeft, viewTop, viewW, viewH, time: state.time });
    return;
  }
  ctx.fillStyle = "#141923";
  ctx.fillRect(viewLeft, viewTop, viewW, viewH);
  ctx.strokeStyle = "#222b3a";
  ctx.lineWidth = 2.5;
  const gridStep = 96;
  const startX = Math.floor(viewLeft / gridStep) * gridStep;
  const startY = Math.floor(viewTop / gridStep) * gridStep;
  for (let x = startX; x < viewLeft + viewW; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, viewTop);
    ctx.lineTo(x, viewTop + viewH);
    ctx.stroke();
  }
  for (let y = startY; y < viewTop + viewH; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(viewLeft, y);
    ctx.lineTo(viewLeft + viewW, y);
    ctx.stroke();
  }
}

function drawWaterSurface(viewLeft, viewTop, viewW, viewH) {
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.drawWaterSurface === "function") {
    globalThis.ArenaRenderer.drawWaterSurface(ctx, { viewLeft, viewTop, viewW, viewH, time: state.time });
    return;
  }
  const grad = ctx.createLinearGradient(0, state.camY - H * 0.5, 0, state.camY + H * 0.5);
  grad.addColorStop(0, "#155293");
  grad.addColorStop(0.5, "#11457d");
  grad.addColorStop(1, "#0d3562");
  ctx.fillStyle = grad;
  ctx.fillRect(viewLeft, viewTop, viewW, viewH);

  // Infinite world-space underwater pool tile grid (160px tiles so scrolling is always clearly visible)
  const tileStep = 160;
  const startTileX = Math.floor(viewLeft / tileStep) * tileStep;
  const startTileY = Math.floor(viewTop / tileStep) * tileStep;
  ctx.strokeStyle = "rgba(72, 149, 239, 0.16)";
  ctx.lineWidth = 2;
  for (let x = startTileX; x < viewLeft + viewW; x += tileStep) {
    ctx.beginPath();
    ctx.moveTo(x, viewTop);
    ctx.lineTo(x, viewTop + viewH);
    ctx.stroke();
  }
  for (let y = startTileY; y < viewTop + viewH; y += tileStep) {
    ctx.beginPath();
    ctx.moveTo(viewLeft, y);
    ctx.lineTo(viewLeft + viewW, y);
    ctx.stroke();
  }

  // Animated world-space pixel water wave highlights
  ctx.fillStyle = "rgba(173, 224, 255, 0.36)";
  const waveStepX = 96;
  const waveStepY = 52;
  const startWX = Math.floor(viewLeft / waveStepX) * waveStepX;
  const startWY = Math.floor(viewTop / waveStepY) * waveStepY;
  for (let y = startWY; y < viewTop + viewH; y += waveStepY) {
    for (let x = startWX; x < viewLeft + viewW; x += waveStepX) {
      const wx = x + Math.sin(state.time * 2.2 + y * 0.08) * 16;
      const wy = y + Math.cos(state.time * 1.8 + x * 0.06) * 4;
      ctx.fillRect(wx, wy, 24, 3.5);
      ctx.fillRect(wx + 8, wy + 5, 14, 2.5);
    }
  }
}

function drawPlatformsAndIce() {
  if (globalThis.ArenaRenderer && typeof globalThis.ArenaRenderer.drawPlatformsAndIce === "function") {
    globalThis.ArenaRenderer.drawPlatformsAndIce(ctx, {
      platforms: state.platforms,
      iceFloes: state.iceFloes,
      time: state.time
    });
    return;
  }
  // Draw Enlarged Ice Floes created by Ice Beam
  for (const floe of state.iceFloes) {
    ctx.save();
    ctx.translate(floe.x, floe.y);
    ctx.fillStyle = "rgba(186, 238, 255, 0.9)";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.5;
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

  // Draw Enlarged Floating Wooden & Giant Pokéball Platforms across active world sectors
  for (const p of state.platforms) {
    ctx.save();
    const bob = Math.sin(state.time * 2.6 + p.x * 0.015 + p.y * 0.01) * 2.8;
    ctx.translate(p.x + p.tiltX * 0.4, p.y + bob + p.tiltY * 0.4);
    const ry = p.r * 0.68;

    // Water ring around base
    ctx.strokeStyle = "rgba(215, 243, 255, 0.58)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 14, p.r * 1.08, ry * 1.08, 0, 0, Math.PI * 2);
    ctx.stroke();

    if (p.kind === "pokeball") {
      // 3D Base cylinder (scaled up for r=118 giant Pokéball platform)
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.ellipse(0, 16, p.r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 4.5;
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
      ctx.lineWidth = 8;
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
      // Large Wooden Barrel / Floating Stage Platform
      const sideH = p.height || 22;
      ctx.fillStyle = "#5c3a21";
      ctx.beginPath();
      ctx.ellipse(0, sideH, p.r, ry, 0, 0, Math.PI);
      ctx.lineTo(-p.r, 0);
      ctx.lineTo(p.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#2b180a";
      ctx.lineWidth = 4;
      ctx.stroke();

      // Top Wood Planks
      ctx.fillStyle = "#8d5b34";
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Plank lines
      ctx.strokeStyle = "rgba(43, 24, 10, 0.45)";
      ctx.lineWidth = 2.2;
      for (let lx = -p.r * 0.7; lx <= p.r * 0.7; lx += p.r * 0.35) {
        const halfH = Math.sqrt(Math.max(0, 1 - Math.pow(lx / p.r, 2))) * ry;
        ctx.beginPath();
        ctx.moveTo(lx, -halfH);
        ctx.lineTo(lx, halfH);
        ctx.stroke();
      }

      if (p.kind === "center_stage") {
        ctx.fillStyle = "#7c4d2b";
        ctx.fillRect(-52, sideH * 0.22, 104, 24);
        ctx.strokeStyle = "#2b180a";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-52, sideH * 0.22, 104, 24);
        ctx.fillStyle = "#d6a87c";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("POKÉMON", 0, sideH * 0.22 + 10);
        ctx.fillText("ARENA 2D", 0, sideH * 0.22 + 21);
      }
    }

    ctx.restore();
  }
}

function drawFighter(f) {
  ctx.save();
  const img = getSprite(f.sprite);
  const fScale = f.scale || f.data?.scale || 1.35;
  const size = 68 * fScale;
  const renderY = getVisualGroundY(f.x, f.y, f);
  const waterContact = getWaterContactState(f, state.time);
  f._waterContact = waterContact;
  const platformBob = Number(waterContact.platformBob) || 0;
  const overOpenWater = state.fieldType === "water" && !waterContact.platform;

  // Dry ground/platforms use a contact shadow. Open water instead gets a
  // refracted blue subsurface shadow and a rear wake—never a black floor oval.
  const heightScale = Math.max(0.5, 1 - f.z * 0.008);
  if (
    overOpenWater &&
    globalThis.ArenaRenderer &&
    typeof globalThis.ArenaRenderer.drawWaterContactBase === "function"
  ) {
    globalThis.ArenaRenderer.drawWaterContactBase(ctx, {
      x: f.x,
      y: renderY + 14,
      width: size * 0.88 * heightScale,
      speed: Math.hypot(f.vx || 0, f.vy || 0),
      vx: f.vx || 0,
      vy: f.vy || 0,
      time: state.time,
      alpha: waterContact.active ? waterContact.contactAlpha : 0.34
    });
  } else {
    const hasHD2DShadow = Boolean(
      globalThis.HD2DRenderer &&
      typeof globalThis.HD2DRenderer.drawFighterCastShadow === "function"
    );
    if (hasHD2DShadow) {
      globalThis.HD2DRenderer.drawFighterCastShadow(ctx, {
        x: f.x,
        y: renderY + platformBob + 16,
        width: size,
        height: size,
        z: f.z || 0,
        fieldType: state.fieldType,
        facing: f.facing || 1,
        time: state.time
      });
    }
    ctx.fillStyle = hasHD2DShadow ? "rgba(0, 0, 0, 0.24)" : "rgba(0, 0, 0, 0.38)";
    ctx.beginPath();
    ctx.ellipse(
      f.x,
      renderY + platformBob + 16,
      size * 0.28 * heightScale,
      size * 0.13 * heightScale,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Player indicator ring
  if (f.isPlayer) {
    drawEllipseRing(
      ctx,
      f.x,
      renderY + (overOpenWater ? 14 : platformBob + 16),
      size * 0.34,
      size * 0.16,
      overOpenWater ? "#a7f3d0" : "#4ade80",
      2.5,
      0.85
    );
  }

  // Draw High-Res 8-Direction Live Animated GIF Pokémon Sprite + 60fps Battle Choreography
  ctx.save();
  ctx.translate(f.x, renderY + 14 - f.z);
  if (typeof drawArticulatedPokemon === "function") {
    drawArticulatedPokemon(ctx, f, img, size * 0.96, state.time, fxCtx);
  } else if (img && img.complete) {
    if (f.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -size * 0.5, -size * 0.85, size, size);
  }
  ctx.restore();
  ctx.restore();

  // Foreground status overlays drawn onto fxCtx (above the DOM GIF sprite layer, scaled by fScale)
  const overlayScale = fScale / 1.38;
  const overlayGroundY = renderY + platformBob;
  if (f.frozenTimer > 0) {
    fxCtx.save();
    fxCtx.fillStyle = "rgba(125, 226, 255, 0.52)";
    fxCtx.strokeStyle = "#ffffff";
    fxCtx.lineWidth = 2.5;
    fxCtx.beginPath();
    fxCtx.moveTo(f.x - 28 * overlayScale, overlayGroundY + 14);
    fxCtx.lineTo(f.x - 22 * overlayScale, overlayGroundY - 36 * overlayScale);
    fxCtx.lineTo(f.x + 4 * overlayScale, overlayGroundY - 48 * overlayScale);
    fxCtx.lineTo(f.x + 26 * overlayScale, overlayGroundY - 30 * overlayScale);
    fxCtx.lineTo(f.x + 28 * overlayScale, overlayGroundY + 14);
    fxCtx.closePath();
    fxCtx.fill();
    fxCtx.stroke();
    fxCtx.restore();
  }

  // Hypnosis Sleep Dream Bubble (matches sample1.mp4 00:09!)
  if (f.sleepTimer > 0) {
    fxCtx.save();
    const bx = f.x + 26 * overlayScale;
    const by = overlayGroundY - 54 * overlayScale;
    fxCtx.fillStyle = "rgba(224, 242, 254, 0.94)";
    fxCtx.strokeStyle = "#1e293b";
    fxCtx.lineWidth = 2.5;
    fxCtx.beginPath();
    fxCtx.ellipse(bx, by, 26, 20, 0, 0, Math.PI * 2);
    fxCtx.fill();
    fxCtx.stroke();

    const dreamImg = POKEMON_DATA.nidorina ? getSprite(POKEMON_DATA.nidorina.sprite) : null;
    if (dreamImg && dreamImg.complete) {
      fxCtx.drawImage(dreamImg, bx - 20, by - 20, 40, 40);
    }
    fxCtx.fillStyle = "#ffffff";
    fxCtx.font = "bold 13px monospace";
    fxCtx.fillText("Zzz", f.x + 4, overlayGroundY - 28 * overlayScale - (state.time * 12) % 10);
    fxCtx.restore();
  }
}

function drawSlashArc(targetCtx, s) {
  const ratio = Math.max(0, s.life / s.maxLife);
  targetCtx.save();
  targetCtx.translate(s.x, s.y - getTerrainHeightAt(s.x, s.y));
  targetCtx.rotate(s.angle);
  targetCtx.globalAlpha = Math.min(1, ratio * 1.35);

  // Outer glowing crescent arc
  targetCtx.strokeStyle = s.color || "#ffffff";
  targetCtx.lineWidth = 10 * ratio;
  targetCtx.lineCap = "round";
  targetCtx.shadowColor = s.color || "#ffffff";
  targetCtx.shadowBlur = 14;
  targetCtx.beginPath();
  targetCtx.arc(0, 0, s.radius * (1.15 - ratio * 0.2), -Math.PI * 0.42, Math.PI * 0.42);
  targetCtx.stroke();

  // Inner white core arc
  targetCtx.strokeStyle = "#ffffff";
  targetCtx.lineWidth = 4 * ratio;
  targetCtx.beginPath();
  targetCtx.arc(4, 0, s.radius * (1.12 - ratio * 0.2), -Math.PI * 0.32, Math.PI * 0.32);
  targetCtx.stroke();
  targetCtx.restore();
}

function drawDamagePopup(targetCtx, dp) {
  const ratio = Math.max(0, dp.life / dp.maxLife);
  targetCtx.save();
  targetCtx.translate(0, -(Number(dp.target?.groundZ) || 0));
  targetCtx.globalAlpha = Math.min(1, ratio * 1.5);
  const rawM = dp.rawTypeMult !== undefined ? dp.rawTypeMult : dp.mult;
  const isImmune = rawM === 0;
  const isSuper = rawM > 1.1;
  const isNotVery = rawM > 0 && rawM < 0.9;
  const valStr = isImmune ? "0" : `-${Math.round(dp.val)}`;

  targetCtx.font = isSuper ? "900 18px 'Montserrat', sans-serif" : "800 15px 'Montserrat', sans-serif";
  targetCtx.textAlign = "center";
  targetCtx.strokeStyle = "#0f172a";
  targetCtx.lineWidth = 4;
  targetCtx.strokeText(valStr, dp.x, dp.y);
  targetCtx.fillStyle = isImmune ? "#94a3b8" : isSuper ? "#facc15" : isNotVery ? "#93c5fd" : "#ffffff";
  targetCtx.fillText(valStr, dp.x, dp.y);

  if (isImmune) {
    targetCtx.font = "800 10px 'Montserrat', sans-serif";
    targetCtx.strokeText("こうかなし (×0)", dp.x, dp.y - 15);
    targetCtx.fillStyle = "#cbd5e1";
    targetCtx.fillText("こうかなし (×0)", dp.x, dp.y - 15);
  } else if (isSuper) {
    const label = rawM >= 4 ? "こうかばつぐん! ×4" : "こうかばつぐん!";
    targetCtx.font = "800 10px 'Montserrat', sans-serif";
    targetCtx.strokeText(label, dp.x, dp.y - 15);
    targetCtx.fillStyle = rawM >= 4 ? "#fb923c" : "#fde047";
    targetCtx.fillText(label, dp.x, dp.y - 15);
  } else if (isNotVery) {
    targetCtx.font = "800 10px 'Montserrat', sans-serif";
    targetCtx.strokeText("いまひとつ...", dp.x, dp.y - 15);
    targetCtx.fillStyle = "#93c5fd";
    targetCtx.fillText("いまひとつ...", dp.x, dp.y - 15);
  }
  targetCtx.restore();
}

function drawProjectile(targetCtx, p) {
  targetCtx.save();
  targetCtx.translate(0, -getTerrainHeightAt(p.x, p.y));
  if (p.kind === "fireblast_orb" && typeof drawFireBlastProjectile === "function") {
    drawFireBlastProjectile(targetCtx, p, state.time);
    targetCtx.restore();
    return;
  }
  if (
    p.kind !== "melee_hitbox" &&
    p.kind !== "hypnosis_ring" &&
    typeof drawElementProjectile === "function" &&
    drawElementProjectile(targetCtx, p, state.time)
  ) {
    targetCtx.restore();
    return;
  }
  if (p.kind === "fire" || p.kind === "firespin") {
    const ratio = p.life / p.maxLife;
    // Outer smoke puff
    targetCtx.fillStyle = "rgba(235, 240, 245, 0.55)";
    targetCtx.beginPath();
    targetCtx.arc(p.x - (p.vx || 0) * 1.4, p.y - (p.vy || 0) * 1.4, p.r * 1.15, 0, Math.PI * 2);
    targetCtx.fill();

    // Inner red-orange flame ball
    const grad = targetCtx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#fff3b0");
    grad.addColorStop(0.45, "#ff7b00");
    grad.addColorStop(1, "rgba(217, 4, 41, 0)");
    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, p.r * (1.2 - ratio * 0.2), 0, Math.PI * 2);
    targetCtx.fill();
  } else if (p.kind === "water" || p.kind === "muddy") {
    targetCtx.fillStyle = p.kind === "muddy" ? "#8d6e63" : "#38bdf8";
    targetCtx.strokeStyle = "#ffffff";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();
  } else if (p.kind === "hypnosis_ring") {
    drawEllipseRing(targetCtx, p.x, p.y, p.r, p.r * 0.85, "#f43f5e", 3, p.life / p.maxLife);
  } else if (p.kind === "shadowball") {
    const grad = targetCtx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    grad.addColorStop(0, "#f3e8ff");
    grad.addColorStop(0.5, "#9333ea");
    grad.addColorStop(1, "#3b0764");
    targetCtx.fillStyle = grad;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    targetCtx.fill();
  } else if (p.kind === "star") {
    targetCtx.fillStyle = "#fde047";
    targetCtx.strokeStyle = "#ca8a04";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();
  } else if (p.kind === "leaf") {
    targetCtx.fillStyle = "#4ade80";
    targetCtx.strokeStyle = "#166534";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.ellipse(p.x, p.y, p.r, p.r * 0.45, state.time * 12, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.stroke();
  }
  targetCtx.restore();
}

function drawBeam(targetCtx, b) {
  targetCtx.save();
  const alpha = Math.min(1, (b.life / b.maxLife) * 1.4);
  const elementPalette = typeof getAttackElementColors === "function" &&
    typeof isSimpleAttackElement === "function" &&
    isSimpleAttackElement(b.elementType)
    ? getAttackElementColors(b.elementType)
    : null;
  targetCtx.globalAlpha = alpha;

  if (b.kind === "flame_stream" && typeof drawFlameStream === "function") {
    drawFlameStream(targetCtx, b, state.time);
  } else if (b.kind === "hydro" && typeof drawHydroPumpStream === "function") {
    drawHydroPumpStream(targetCtx, { ...b, lanes: b.streamOrigins?.length > 1 ? 2 : 1 }, state.time);
  } else if (["electric_shock", "thunderbolt", "thunder"].includes(b.kind) && typeof drawElectricMove === "function") {
    drawElectricMove(targetCtx, {
      ...b,
      variant: b.kind === "electric_shock" ? "thundershock" : b.kind
    }, state.time);
  } else if (b.kind === "lightning") {
    drawLightningBolt(targetCtx, b.x1, b.y1, b.x2, b.y2, elementPalette?.[1] || "#fef08a", b.width + 4, 18, b.seed);
    drawLightningBolt(targetCtx, b.x1, b.y1, b.x2, b.y2, elementPalette?.[0] || "#ffffff", Math.max(2, b.width - 2), 10, (b.seed || 0) + 1);
  } else if (b.kind === "ice") {
    if (typeof drawIceBeamStream === "function") {
      drawIceBeamStream(targetCtx, b, state.time);
    } else {
      drawLightningBolt(targetCtx, b.x1, b.y1, b.x2, b.y2, elementPalette?.[1] || "#38bdf8", b.width, 10, b.seed);
      drawLightningBolt(targetCtx, b.x1, b.y1, b.x2, b.y2, elementPalette?.[0] || "#e0f2fe", b.width * 0.45, 6, (b.seed || 0) + 1);
    }
  } else {
    // Hyper Beam (Golden-Orange) or Hydro Pump (Azure-White)
    const outerCol = elementPalette?.[1] || (b.kind === "hydro" ? "#38bdf8" : "#f97316");
    const innerCol = elementPalette?.[0] || (b.kind === "hydro" ? "#e0f2fe" : "#fef08a");

    if (b.kind === "hyper" && typeof drawHyperBeamStream === "function") {
      drawHyperBeamStream(targetCtx, b, state.time, outerCol, innerCol);
    } else {
      targetCtx.strokeStyle = outerCol;
      targetCtx.lineWidth = b.width;
      targetCtx.lineCap = "round";
      targetCtx.beginPath();
      targetCtx.moveTo(b.x1, b.y1);
      targetCtx.lineTo(b.x2, b.y2);
      targetCtx.stroke();

      targetCtx.strokeStyle = innerCol;
      targetCtx.lineWidth = b.width * 0.52;
      targetCtx.beginPath();
      targetCtx.moveTo(b.x1, b.y1);
      targetCtx.lineTo(b.x2, b.y2);
      targetCtx.stroke();
    }

    // Keep decorative rings exclusive to Hyper Beam. Hydro Pump stays as the
    // two thin water streams seen in the reference instead of gaining halos.
    if (b.kind === "hyper") {
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const rx = b.x1 + (b.x2 - b.x1) * t;
        const ry = b.y1 + (b.y2 - b.y1) * t;
        drawEllipseRing(targetCtx, rx, ry, b.width * 0.45, b.width * 0.72, "#ffffff", 2, alpha * 0.75);
      }
    }
  }
  targetCtx.restore();
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

        <div style="font-weight:800;color:#38bdf8;margin:12px 0 6px;font-size:13px;">■ Height / Weight / Shape & 実戦パラメータ反映値</div>
        <div style="background:#1e293b;padding:8px 10px;border-radius:8px;font-size:12px;line-height:1.6;">
          <b>Height (高さ):</b> ${pd.height.display} ｜ <b>Weight (重さ):</b> ${pd.weight.display}<br/>
          <b>Shape (体型):</b> ${pd.shape.jpName} (${pd.shape.name} / ${pd.shape.awesomeName})<br/>
          <span style="color:#fde047;"><b>バトル体格倍率:</b> ×${(f.scale || 1.38).toFixed(2)} (当たり判定 ${f.hitRadius || 24}px / ノックバック倍率 ×${(f.knockbackMult || 1.0).toFixed(2)})</span><br/>
          <span style="color:#4ade80;"><b>移動速度:</b> ${(f.moveSpeed || 3.8).toFixed(2)} ｜ <b>動作スピード:</b> ×${(f.actionSpeedMult || 1.0).toFixed(2)} ｜ <b>技クールダウン倍率:</b> ×${(f.cdMult || 1.0).toFixed(2)}</span>
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
initMobileAndTouchControls();
updateEnemyAttackButtonUI();
startTerrainScene();
requestAnimationFrame(loop);
