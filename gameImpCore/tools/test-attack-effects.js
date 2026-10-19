#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const gameRoot = path.resolve(__dirname, "..", "pokemon-arena-2d");
const manifestJsonPath = path.join(gameRoot, "assets", "attack-effects", "manifest.json");
const manifestScriptPath = path.join(gameRoot, "assets", "attack-effects", "manifest.js");
const effectScriptPath = path.join(gameRoot, "attack_effects.js");
const indexPath = path.join(gameRoot, "index.html");
const gameScriptPath = path.join(gameRoot, "game.js");
const canvasEffectsPath = path.join(gameRoot, "effects.js");
const terrainScriptPath = path.join(gameRoot, "terrain.js");
const spriteAnimatorPath = path.join(gameRoot, "sprite_animator.js");

const manifestJson = JSON.parse(fs.readFileSync(manifestJsonPath, "utf8"));
const attackEffectSource = fs.readFileSync(effectScriptPath, "utf8");
const canvasEffectsSource = fs.readFileSync(canvasEffectsPath, "utf8");
const terrainSource = fs.readFileSync(terrainScriptPath, "utf8");
const spriteAnimatorSource = fs.readFileSync(spriteAnimatorPath, "utf8");
let fakeNow = 1000;
const sandbox = {
  console,
  Map,
  Set,
  WeakMap,
  Math,
  Date,
  performance: { now: () => fakeNow }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(manifestScriptPath, "utf8"), sandbox, { filename: manifestScriptPath });
vm.runInContext(attackEffectSource, sandbox, { filename: effectScriptPath });
vm.runInContext(canvasEffectsSource, sandbox, { filename: canvasEffectsPath });

const system = sandbox.AttackEffectSystem;
assert.ok(system, "AttackEffectSystem must be registered");
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.ATTACK_EFFECT_MANIFEST)),
  manifestJson,
  "JSON and browser manifests must remain identical"
);
assert.deepEqual(
  Object.keys(sandbox.ATTACK_EFFECT_MANIFEST.assets).sort(),
  Object.keys(manifestJson.assets).sort(),
  "JSON and browser manifests must expose the same assets"
);
assert.deepEqual(
  Object.keys(sandbox.ATTACK_EFFECT_MANIFEST.visualTypes).sort(),
  Object.keys(manifestJson.visualTypes).sort(),
  "JSON and browser manifests must expose the same visual move types"
);

const gameSource = fs.readFileSync(gameScriptPath, "utf8");
const metaBlock = gameSource.match(/const EFFECT_TYPE_META = \{([\s\S]*?)\n\};/);
assert.ok(metaBlock, "EFFECT_TYPE_META could not be read from game.js");
const engineVisualTypes = [...metaBlock[1].matchAll(/^\s{2}([a-z0-9_]+):/gm)].map(match => match[1]).sort();
assert.deepEqual(
  engineVisualTypes,
  Object.keys(manifestJson.visualTypes).sort(),
  "every engine visual move type must have an attack-effect manifest entry"
);

for (const [assetId, asset] of Object.entries(manifestJson.assets)) {
  const filePath = path.join(gameRoot, asset.src);
  assert.ok(fs.existsSync(filePath), `${assetId} GIF is missing: ${filePath}`);
  const signature = fs.readFileSync(filePath).subarray(0, 6).toString("ascii");
  assert.ok(signature === "GIF87a" || signature === "GIF89a", `${assetId} is not a GIF`);
}

function fighter(id, shapeSlug, extra = {}) {
  return {
    id,
    data: { id },
    shapeSlug,
    types: extra.types || ["normal"],
    x: 100,
    y: 180,
    z: 0,
    targetPx: extra.targetPx || 96,
    scale: 1.4,
    facing: 1,
    megaMode: extra.megaMode || 0,
    gmaxMode: extra.gmaxMode || 0,
    ...extra
  };
}

function profile(user, move) {
  return system.resolveAttackEffectProfile(user, {
    category: "special",
    elementType: "normal",
    basePower: 80,
    ...move
  });
}

assert.equal(
  profile(fighter("sandslash", "upright"), {
    type: "slash", category: "physical", sourceMoveSlug: "scratch"
  }).asset,
  "claw"
);
assert.equal(
  profile(fighter("persian", "quadruped"), {
    type: "visegrip", category: "physical", sourceMoveSlug: "bite"
  }).asset,
  "fang"
);
assert.equal(
  profile(fighter("espeon", "quadruped", { types: ["psychic"] }), {
    type: "visegrip", category: "physical", elementType: "psychic", sourceMoveSlug: "psychic-fangs"
  }).asset,
  "fang",
  "plural Fang move names must retain the bite silhouette"
);
assert.equal(
  profile(fighter("persian", "quadruped"), {
    type: "slash", category: "physical", sourceMoveSlug: "fury-swipes"
  }).asset,
  "claw",
  "Swipe move names must retain the claw silhouette"
);
assert.equal(
  profile(fighter("kingler", "armor"), {
    type: "slash", category: "physical", sourceMoveSlug: "vice-grip"
  }).asset,
  "fang",
  "official vice-grip slug must override the generic slash visual type"
);
const tackleProfile = profile(fighter("tauros", "quadruped"), {
  type: "slash",
  category: "physical",
  sourceMoveSlug: "tackle",
  sourceMoveName: "Tackle",
  name: "Slash"
});
assert.equal(tackleProfile.action, "impact", "a mapped slash visual must not turn Tackle into a claw attack");
assert.equal(tackleProfile.asset, "impact", "Tackle must use the restrained body-impact treatment");
assert.equal(
  profile(fighter("charizard", "wings", { types: ["fire", "flying"] }), {
    type: "flamethrower", elementType: "fire", sourceMoveSlug: "flamethrower"
  }).emitter,
  "mouth"
);
assert.equal(
  profile(fighter("lucario", "humanoid", { types: ["fighting", "steel"] }), {
    type: "shadowball", elementType: "fighting", sourceMoveSlug: "aura-sphere"
  }).emitter,
  "hand"
);
assert.equal(
  profile(fighter("blastoise", "upright", { types: ["water"] }), {
    type: "hydropump", elementType: "water", sourceMoveSlug: "hydro-pump"
  }).emitter,
  "cannon"
);
assert.equal(
  profile(fighter("genesect", "humanoid", { types: ["bug", "steel"] }), {
    type: "hyperbeam", elementType: "steel", sourceMoveSlug: "flash-cannon"
  }).emitter,
  "cannon"
);
assert.equal(
  profile(fighter("genesect", "humanoid", { types: ["bug", "steel"] }), {
    type: "hyperbeam", elementType: "steel", sourceMoveSlug: "flash-cannon"
  }).asset,
  "element_steel"
);
assert.equal(
  profile(fighter("venusaur", "quadruped", { types: ["grass", "poison"] }), {
    type: "hyperbeam", elementType: "grass", sourceMoveSlug: "solar-beam"
  }).emitter,
  "body"
);
assert.equal(
  profile(fighter("pikachu", "quadruped", { types: ["electric"] }), {
    type: "flamethrower", elementType: "fire", sourceMoveSlug: "flamethrower"
  }).emitter,
  "mouth",
  "an explicit breath move must beat a species/shape fallback"
);
assert.notEqual(
  profile(fighter("slowbro", "upright", { types: ["water", "psychic"] }), {
    type: "shadowball", elementType: "psychic", sourceMoveSlug: "psychic"
  }).emitter,
  "cannon",
  "regular Slowbro has no arm cannon"
);
assert.equal(
  profile(fighter("slowbro", "upright", {
    types: ["poison", "psychic"],
    pokeData: { slug: "slowbro" },
    regionalForm: { formSlug: "slowbro-galar" }
  }), {
    type: "shadowball", elementType: "poison", sourceMoveSlug: "shell-side-arm"
  }).emitter,
  "cannon",
  "Galarian Slowbro should emit from its arm shell"
);
assert.equal(
  profile(fighter("gengar", "upright"), {
    type: "shadowball_mini", elementType: "ghost", sourceMoveSlug: "shadow-punch"
  }).visualType,
  "shadowball_mini"
);

const simpleElements = [
  "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying",
  "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"
];
const directionalElements = new Set(["water", "electric", "grass", "flying", "dragon"]);
const rendererSignatures = new Set();
const accentColors = new Set();

function makeRecordingCanvas() {
  const operations = [];
  const context = { operations };
  for (const method of [
    "save", "restore", "translate", "rotate", "beginPath", "moveTo", "lineTo",
    "closePath", "bezierCurveTo", "quadraticCurveTo", "arc", "ellipse", "fill", "stroke",
    "scale", "rect", "clip", "fillRect", "strokeRect"
  ]) {
    context[method] = (...args) => operations.push([method, ...args]);
  }
  for (const property of [
    "lineCap", "lineJoin", "shadowColor", "shadowBlur", "fillStyle", "strokeStyle", "lineWidth",
    "globalAlpha", "globalCompositeOperation"
  ]) {
    Object.defineProperty(context, property, {
      set(value) { operations.push([property, value]); },
      get() { return undefined; }
    });
  }
  function makeGradient(kind, args) {
    const gradient = { kind, args: Array.from(args), stops: [] };
    gradient.addColorStop = (offset, color) => {
      gradient.stops.push([offset, color]);
      operations.push([`${kind}.addColorStop`, offset, color]);
    };
    operations.push([kind, ...args]);
    return gradient;
  }
  context.createRadialGradient = (...args) => makeGradient("createRadialGradient", args);
  context.createLinearGradient = (...args) => makeGradient("createLinearGradient", args);
  return context;
}

function snapshotCanvasOperations(context) {
  return JSON.parse(JSON.stringify(context.operations));
}

const videoLevelRendererCases = [
  {
    name: "radial Water surge",
    draw: sandbox.drawWaterSurgeEffect,
    effect: { x: 120, y: 90, radius: 240, seed: 101, age: 0.74, life: 1.41, maxLife: 2.15 }
  },
  {
    name: "persistent ground break",
    draw: sandbox.drawGroundBreakEffect,
    effect: { x: 180, y: 140, radius: 116, seed: 202, age: 0.56, life: 3.64, maxLife: 4.2 }
  },
  {
    name: "Flamethrower stream",
    draw: sandbox.drawFlameStream,
    effect: { x1: 20, y1: 45, x2: 290, y2: 95, width: 30, seed: 303, age: 0.5, life: 1.05, maxLife: 1.55 }
  },
  {
    name: "two-lane Hydro Pump",
    draw: sandbox.drawHydroPumpStream,
    effect: {
      x1: 20,
      y1: 45,
      x2: 330,
      y2: 78,
      width: 34,
      lanes: 2,
      streamOrigins: [{ x: 14, y: 36 }, { x: 26, y: 54 }],
      seed: 404,
      age: 0.72,
      life: 1.43,
      maxLife: 2.15
    }
  },
  {
    name: "Ice Beam stream",
    draw: sandbox.drawIceBeamStream,
    effect: {
      x1: 24,
      y1: 48,
      x2: 310,
      y2: 88,
      width: 34,
      seed: 454,
      age: 0.42,
      life: 0.73,
      maxLife: 1.15
    }
  },
  {
    name: "Fire Blast Dai kanji explosion",
    draw: sandbox.drawFireBlastKanjiEffect,
    effect: {
      x: 220,
      y: 130,
      radius: 122,
      seed: 477,
      age: 0.36,
      life: 0.82,
      maxLife: 1.18
    }
  },
  ...[
    ["Thunder Shock", "thundershock", 0.48, 0.24],
    ["Thunderbolt", "thunderbolt", 1.05, 0.52],
    ["Thunder", "thunder", 0.86, 0.43]
  ].map(([name, variant, maxLife, age], index) => ({
    name,
    draw: sandbox.drawElectricMove,
    effect: {
      variant,
      x1: variant === "thunder" ? 250 : 30,
      y1: variant === "thunder" ? -80 : 35,
      x2: 250,
      y2: 170,
      width: variant === "thunder" ? 13 : variant === "thunderbolt" ? 9 : 5,
      seed: 505 + index,
      age,
      life: maxLife - age,
      maxLife
    }
  }))
];

for (const rendererCase of videoLevelRendererCases) {
  assert.equal(typeof rendererCase.draw, "function", `${rendererCase.name} draw helper must exist`);
  const effectBefore = JSON.stringify(rendererCase.effect);
  const firstFrame = makeRecordingCanvas();
  const secondFrame = makeRecordingCanvas();
  assert.equal(rendererCase.draw(firstFrame, rendererCase.effect, 7.25), true, `${rendererCase.name} must draw while active`);
  assert.equal(rendererCase.draw(secondFrame, rendererCase.effect, 7.25), true, `${rendererCase.name} must redraw while active`);
  assert.deepEqual(
    snapshotCanvasOperations(firstFrame),
    snapshotCanvasOperations(secondFrame),
    `${rendererCase.name} geometry must be deterministic for the same seed and frame`
  );
  const laterEffect = {
    ...rendererCase.effect,
    age: Math.min(rendererCase.effect.maxLife - 0.001, rendererCase.effect.age + 0.12),
    life: Math.max(0.001, rendererCase.effect.life - 0.12)
  };
  const laterFrame = makeRecordingCanvas();
  assert.equal(rendererCase.draw(laterFrame, laterEffect, 7.37), true, `${rendererCase.name} must draw its next animation cel`);
  assert.notDeepEqual(
    snapshotCanvasOperations(firstFrame),
    snapshotCanvasOperations(laterFrame),
    `${rendererCase.name} must animate instead of remaining a static drawing`
  );
  assert.ok(firstFrame.operations.length >= 12, `${rendererCase.name} must contain a staged, readable Canvas treatment`);
  assert.equal(JSON.stringify(rendererCase.effect), effectBefore, `${rendererCase.name} must not mutate gameplay state`);

  const expiredFrame = makeRecordingCanvas();
  const expiredEffect = {
    ...rendererCase.effect,
    age: rendererCase.effect.maxLife,
    life: 0
  };
  assert.equal(rendererCase.draw(expiredFrame, expiredEffect, 7.25), false, `${rendererCase.name} must stop drawing after its lifetime`);
  assert.equal(expiredFrame.operations.length, 0, `${rendererCase.name} must leave no residual Canvas work after cleanup`);
}

const waterRendererOps = makeRecordingCanvas();
sandbox.drawWaterSurgeEffect(
  waterRendererOps,
  { x: 0, y: 0, radius: 240, seed: 611, age: 0.74, life: 1.41, maxLife: 2.15 },
  0
);
assert.ok(
  waterRendererOps.operations.filter(operation => operation[0] === "bezierCurveTo").length >= 12,
  "the self-centred Water renderer must retain four triple-layered curved radial arms"
);
const waterBackOps = makeRecordingCanvas();
const waterFrontOps = makeRecordingCanvas();
sandbox.drawWaterSurgeEffect(
  waterBackOps,
  { x: 0, y: 0, radius: 240, seed: 611, age: 0.74, life: 1.41, maxLife: 2.15, layer: "back" },
  0
);
sandbox.drawWaterSurgeEffect(
  waterFrontOps,
  { x: 0, y: 0, radius: 240, seed: 611, age: 0.74, life: 1.41, maxLife: 2.15, layer: "front" },
  0
);
assert.ok(waterBackOps.operations.length > 0 && waterFrontOps.operations.length > 0, "both Water depth layers must draw");
assert.notDeepEqual(
  snapshotCanvasOperations(waterBackOps),
  snapshotCanvasOperations(waterFrontOps),
  "Water back and front layers must contain distinct content"
);
assert.equal(
  typeof sandbox.getWaterSurgeExpansionProgress,
  "function",
  "Water rendering and collision must share one expansion curve"
);
assert.match(
  gameSource,
  /const eased = typeof getWaterSurgeExpansionProgress === "function"[\s\S]*?getWaterSurgeExpansionProgress\(progress\)[\s\S]*?surge\.radius = surge\.startRadius \+ \(surge\.maxRadius - surge\.startRadius\) \* eased/,
  "Water collision must use the same expansion curve as the staged renderer"
);

const hydroRendererOps = makeRecordingCanvas();
sandbox.drawHydroPumpStream(
  hydroRendererOps,
  {
    x1: 0,
    y1: 0,
    x2: 300,
    y2: 20,
    width: 34,
    lanes: 2,
    streamOrigins: [{ x: -8, y: -10 }, { x: 8, y: 10 }],
    seed: 712,
    age: 0.72,
    life: 1.43,
    maxLife: 2.15
  },
  0
);
assert.ok(
  hydroRendererOps.operations.filter(operation => operation[0] === "stroke").length >= 6,
  "Hydro Pump must render both water lanes with layered strokes"
);
for (const [originX, originY] of [[-8, -10], [8, 10]]) {
  assert.ok(
    hydroRendererOps.operations.some(operation =>
      operation[0] === "moveTo" &&
      Math.abs(operation[1] - originX) < 0.001 &&
      Math.abs(operation[2] - originY) < 0.001
    ),
    `Hydro Pump must start a stream at cannon origin ${originX},${originY}`
  );
}

const flameRendererOps = makeRecordingCanvas();
sandbox.drawFlameStream(
  flameRendererOps,
  { x1: 0, y1: 0, x2: 300, y2: 25, width: 30, seed: 803, age: 0.5, life: 1.05, maxLife: 1.55 },
  0
);
assert.ok(
  flameRendererOps.operations.filter(operation => operation[0] === "fill").length >= 80,
  "Flamethrower must keep a dense chain of irregular multi-layer fire beads"
);

for (const element of simpleElements) {
  const asset = manifestJson.assets[`element_${element}`];
  assert.ok(asset, `${element} must have a dedicated manifest asset`);
  assert.ok(asset.displaySize <= 150, `${element} GIF display size must stay at or below 150px`);
  assert.ok(asset.durationMs <= 240, `${element} GIF duration must stay at or below 240ms`);
  assert.equal(asset.loop, false, `${element} GIF must be a one-shot animation`);

  const resolved = profile(fighter("testmon", "humanoid", { types: [element] }), {
    type: "shadowball",
    category: "special",
    elementType: element,
    sourceMoveSlug: `${element}-pulse`
  });
  assert.equal(resolved.asset, `element_${element}`, `${element} must use its dedicated GIF`);
  assert.equal(resolved.simpleElemental, true, `${element} must use the simplified presentation`);

  assert.equal(system.isSimpleElementType(element), true, `${element} must expose a dedicated visual style`);
  const colors = Array.from(system.getElementColors(element));
  assert.equal(colors.length, 2, `${element} needs a two-color palette`);
  assert.ok(colors.every(color => /^#[0-9a-f]{6}$/i.test(color)), `${element} palette must use full hex colors`);
  accentColors.add(colors[1]);

  const projectile = { elementType: element, x: 34, y: 55, vx: 3, vy: -1, r: 14, life: 0.4, maxLife: 0.8, dmg: 9 };
  const snapshot = JSON.stringify(projectile);
  const recording = makeRecordingCanvas();
  assert.equal(system.drawElementProjectile(recording, projectile, 0.2), true, `${element} projectile must be drawn`);
  assert.equal(JSON.stringify(projectile), snapshot, `${element} renderer must not mutate gameplay data`);
  assert.ok(
    recording.operations.some(operation => operation.includes(colors[0]) || operation.includes(colors[1])),
    `${element} projectile must use its own palette`
  );
  rendererSignatures.add(recording.operations.map(operation => operation[0]).join(","));

  const earlierFrame = makeRecordingCanvas();
  system.drawElementProjectile(earlierFrame, projectile, 0);
  assert.notDeepEqual(recording.operations, earlierFrame.operations, `${element} projectile must animate over time`);
}
assert.equal(accentColors.size, simpleElements.length, "all sixteen element palettes must remain distinct");
assert.ok(rendererSignatures.size >= 10, "element projectiles should use visibly distinct primitive motifs");
const verticalProjectileRecording = makeRecordingCanvas();
system.drawElementProjectile(
  verticalProjectileRecording,
  { elementType: "water", x: 34, y: 55, vx: 0, vy: -3, r: 14 },
  0.2
);
const verticalRotation = verticalProjectileRecording.operations.find(operation => operation[0] === "rotate");
assert.ok(verticalRotation, "directional element projectiles must rotate into their travel direction");
assert.ok(
  Math.abs(verticalRotation[1] + Math.PI / 2) < 1e-9,
  "a projectile travelling straight upward must retain vx=0 instead of being tilted right"
);
for (const assetId of ["claw", "fang", "impact"]) {
  const asset = manifestJson.assets[assetId];
  assert.ok(asset.displaySize <= 160, `${assetId} GIF display size must stay at or below 160px`);
  assert.ok(asset.durationMs <= 240, `${assetId} GIF duration must stay at or below 240ms`);
  assert.equal(asset.loop, false, `${assetId} GIF must be a one-shot animation`);
}
for (const assetId of ["hand", "mouth", "cannon", "body"]) {
  const asset = manifestJson.assets[assetId];
  assert.ok(asset, `${assetId} must have a generic emitter GIF`);
  assert.ok(asset.durationMs <= 200, `${assetId} GIF duration must stay at or below 200ms`);
  assert.equal(asset.loop, false, `${assetId} GIF must be a one-shot animation`);
}
assert.equal(system.isSimpleElementType("fire"), false, "Fire should retain its existing visual path");
const normalRecording = makeRecordingCanvas();
assert.equal(
  system.drawElementProjectile(normalRecording, { elementType: "normal", x: 0, y: 0, r: 12 }, 0),
  false,
  "Normal should fall back to its existing projectile renderer"
);
assert.equal(normalRecording.operations.length, 0, "fallback rendering must not touch the Canvas context");
assert.equal(
  profile(fighter("hitmonchan", "humanoid", { types: ["fighting"] }), {
    type: "stomp", category: "physical", elementType: "fighting", sourceMoveSlug: "mega-punch"
  }).asset,
  "element_fighting",
  "generic elemental contact attacks should use their type GIF"
);
assert.equal(
  profile(fighter("sandslash", "upright", { types: ["ground"] }), {
    type: "slash", category: "physical", elementType: "ground", sourceMoveSlug: "scratch"
  }).asset,
  "claw",
  "explicit claw attacks must retain the claw silhouette"
);
assert.equal(
  profile(fighter("umbreon", "quadruped", { types: ["dark"] }), {
    type: "visegrip", category: "physical", elementType: "dark", sourceMoveSlug: "bite"
  }).asset,
  "fang",
  "Dark biting attacks must retain the fang silhouette"
);
assert.equal(
  profile(fighter("leafeon", "quadruped", { types: ["grass"] }), {
    type: "slash", category: "physical", elementType: "grass", sourceMoveSlug: "leaf-blade"
  }).asset,
  "claw",
  "Grass blade attacks must retain the slash silhouette"
);
assert.equal(
  profile(fighter("mew", "upright", { types: ["psychic"] }), {
    type: "rest", category: "status", elementType: "psychic", sourceMoveSlug: "rest"
  }).asset,
  null,
  "status moves must not create an elemental attack GIF"
);

const nativeOnlyVisualTypes = [
  "surf", "flamethrower", "hydropump", "electricshock", "spark",
  "thunderbolt", "thunder", "doubleteam", "groundsmash", "earthpower"
];
assert.deepEqual(
  Object.entries(manifestJson.visualTypes)
    .filter(([, value]) => value.nativeOnly)
    .map(([key]) => key)
    .sort(),
  nativeOnlyVisualTypes.slice().sort(),
  "the dedicated staged moves must be the complete native-only manifest set"
);

for (const [visualType, visualProfile] of Object.entries(manifestJson.visualTypes)) {
  const category = visualProfile.family === "contact" ? "physical" : visualProfile.family === "status" || visualProfile.family === "movement" ? "status" : "special";
  const resolved = profile(fighter("testmon", "upright"), {
    type: visualType,
    category,
    sourceMoveSlug: visualType
  });
  assert.equal(resolved.visualType, visualType, `${visualType} must preserve its manifest key`);
  if (visualProfile.nativeOnly) {
    assert.equal(resolved.nativeOnly, true, `${visualType} must remain on its dedicated Canvas/native path`);
    assert.equal(resolved.asset, null, `${visualType} must not add a generic GIF over its native renderer`);
  } else if (category === "status") {
    assert.equal(resolved.asset, null, `${visualType} should not spawn an attack GIF`);
  } else {
    assert.ok(manifestJson.assets[resolved.asset], `${visualType} resolved to unknown asset ${resolved.asset}`);
  }
}

for (const emitter of ["mouth", "hand", "cannon", "body", "contact"]) {
  const anchor = system.resolveEmitterAnchor(fighter("testmon", "upright"), emitter, 0.8, -0.6);
  assert.ok(Number.isFinite(anchor.x) && Number.isFinite(anchor.y), `${emitter} anchor must be finite`);
  assert.ok(anchor.size >= 34 && anchor.size <= 236, `${emitter} anchor size must be clamped`);
}
const blastoiseAnchorUser = fighter("blastoise", "upright", { targetPx: 96, groundZ: 0 });
const blastoiseLeftCannon = system.resolveEmitterAnchor(blastoiseAnchorUser, "cannon", 0, 1, -0.17);
const blastoiseRightCannon = system.resolveEmitterAnchor(blastoiseAnchorUser, "cannon", 0, 1, 0.17);
assert.ok(
  blastoiseLeftCannon.y < blastoiseAnchorUser.y + 14 - blastoiseAnchorUser.targetPx * 0.45,
  "Blastoise's cannon origins must stay above its body centre even when firing downward"
);
assert.notEqual(
  blastoiseLeftCannon.x,
  blastoiseRightCannon.x,
  "Blastoise's two shoulder cannons must retain distinct launch points"
);
for (const [aimLabel, dirX, dirY, dir8] of [
  ["front-right horizontal", 1, 0, "E"],
  ["front-left horizontal", -1, 0, "W"],
  ["back-right diagonal", 0.7, -0.7, "NE"],
  ["back-left diagonal", -0.7, -0.7, "NW"]
]) {
  const directionalBlastoise = fighter("blastoise", "upright", {
    targetPx: 96,
    groundZ: 0,
    facing: dirX >= 0 ? 1 : -1,
    dir8
  });
  const leftBarrel = system.resolveEmitterAnchor(directionalBlastoise, "left_cannon", dirX, dirY);
  const rightBarrel = system.resolveEmitterAnchor(directionalBlastoise, "right_cannon", dirX, dirY);
  assert.ok(
    Math.abs(leftBarrel.x - rightBarrel.x) >= 34,
    `Blastoise's left and right shoulder cannons must remain horizontally separated during ${aimLabel}`
  );
  assert.ok(
    leftBarrel.y < directionalBlastoise.y + 14 - directionalBlastoise.targetPx * 0.65 &&
    rightBarrel.y < directionalBlastoise.y + 14 - directionalBlastoise.targetPx * 0.65,
    `Blastoise's shoulder cannons must stay near the top of its shell during ${aimLabel}`
  );
}

const fakeLayer = {
  children: [],
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
  },
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentNode = null;
  }
};
sandbox.document = {
  getElementById(id) {
    return id === "attack-gif-layer" ? fakeLayer : null;
  },
  createElement(tagName) {
    return {
      tagName,
      style: {
        setProperty(name, value) {
          this[name] = value;
        }
      },
      parentNode: null
    };
  }
};

function advanceAttackEffects(seconds) {
  let elapsed = 0;
  while (elapsed < seconds - 1e-9) {
    const step = Math.min(0.08, seconds - elapsed);
    system.updateAttackEffects(step);
    elapsed += step;
  }
}

function assertEffectSystemClean(label) {
  assert.equal(system.activeGifCount, 0, `${label} GIFs must expire within 0.40 seconds`);
  assert.equal(fakeLayer.children.length, 0, `${label} GIF nodes must be removed from the DOM`);
  assert.equal(system.richEffectCount, 0, `${label} Canvas feedback must expire within 0.40 seconds`);
}

fakeNow = 100;
const earlyImpactTarget = fighter("early-impact-target", "upright", { targetPx: 96 });
assert.equal(
  system.spawnImpactSequence(earlyImpactTarget, "water", 18, {
    physical: false, contact: false, primaryAsset: "element_water", effectiveness: 1
  }),
  true,
  "the first hit must render even within 240ms of page startup"
);
assert.equal(system.richEffectCount, 1, "the first early hit must create one Canvas ring");
assert.equal(
  system.spawnImpactSequence(earlyImpactTarget, "water", 18, {
    physical: false, contact: false, primaryAsset: "element_water", effectiveness: 1
  }),
  false,
  "a repeated hit on the same target inside 240ms must be visually debounced"
);
assert.equal(system.richEffectCount, 1, "a debounced hit must not add another Canvas ring");
fakeNow = 340;
assert.equal(
  system.spawnImpactSequence(earlyImpactTarget, "water", 18, {
    physical: false, contact: false, primaryAsset: "element_water", effectiveness: 1
  }),
  true,
  "the same target must be allowed to show hit feedback again after 240ms"
);
assert.equal(system.richEffectCount, 2, "the hit at the debounce boundary must add one new Canvas ring");
advanceAttackEffects(0.4);
assertEffectSystemClean("early impact debounce");
fakeNow = 1000;

for (const element of simpleElements) {
  const caster = fighter(`runtime-${element}`, "humanoid", { types: [element], targetPx: 96 });
  system.spawnAttackSequence(caster, {
    type: "shadowball",
    category: "special",
    elementType: element,
    sourceMoveSlug: `${element}-pulse`
  }, 0.8, 0.6, 1, 1);

  assert.equal(system.activeGifCount, 1, `${element} cast must create exactly one GIF`);
  assert.equal(fakeLayer.children.length, 1, `${element} cast must attach exactly one GIF node`);
  assert.equal(system.richEffectCount, 0, `${element} cast must not add a Canvas overlay`);
  system.syncAttackGifEffects(0, 0);

  const castNode = fakeLayer.children[0];
  assert.match(castNode.src, new RegExp(`element-${element}\\.gif#fx=\\d+$`), `${element} cast must use its dedicated GIF`);
  assert.ok(parseFloat(castNode.style.width) <= 105, `${element} cast GIF must stay within 105px for a 96px caster`);
  const rotationMatch = castNode.style.transform.match(/^rotate\((-?[0-9.e+-]+)rad\)$/);
  assert.ok(rotationMatch, `${element} cast GIF must expose its rotation`);
  const expectedRotation = directionalElements.has(element) ? Math.atan2(0.6, 0.8) : 0;
  assert.ok(
    Math.abs(Number(rotationMatch[1]) - expectedRotation) < 1e-9,
    `${element} cast GIF must ${directionalElements.has(element) ? "follow its travel direction" : "remain upright"}`
  );

  const gifCountBeforeHit = system.activeGifCount;
  const domCountBeforeHit = fakeLayer.children.length;
  system.spawnImpactSequence(
    fighter(`target-${element}`, "upright", { targetPx: 96 }),
    element,
    18,
    { physical: false, contact: false, primaryAsset: `element_${element}`, effectiveness: 1 }
  );
  assert.equal(system.activeGifCount, gifCountBeforeHit, `${element} hit must not add a second GIF`);
  assert.equal(fakeLayer.children.length, domCountBeforeHit, `${element} hit must not add a second GIF node`);
  assert.equal(system.richEffectCount, 1, `${element} hit must add only one Canvas ring`);

  advanceAttackEffects(0.4);
  assertEffectSystemClean(element);
}

const genericEmitterCases = [
  {
    assetId: "mouth",
    caster: fighter("charizard", "wings", { types: ["fire"], targetPx: 96 }),
    move: { type: "ember", category: "special", elementType: "fire", sourceMoveSlug: "ember" }
  },
  {
    assetId: "hand",
    caster: fighter("alakazam", "humanoid", { types: ["normal"], targetPx: 96 }),
    move: { type: "shadowball", category: "special", elementType: "normal", sourceMoveSlug: "tri-attack" }
  },
  {
    assetId: "cannon",
    caster: fighter("genesect", "humanoid", { types: ["normal"], targetPx: 96 }),
    move: { type: "hyperbeam", category: "special", elementType: "normal", sourceMoveSlug: "flash-cannon" }
  },
  {
    assetId: "body",
    caster: fighter("voltorb", "ball", { types: ["normal"], targetPx: 96 }),
    move: { type: "razorleaf", category: "special", elementType: "normal", sourceMoveSlug: "razor-leaf" }
  }
];

for (const { assetId, caster, move } of genericEmitterCases) {
  system.spawnAttackSequence(caster, move, 1, 0, 1, 1);
  assert.equal(system.activeGifCount, 1, `${assetId} emitter must create exactly one charge/release GIF`);
  assert.equal(fakeLayer.children.length, 1, `${assetId} emitter must attach exactly one GIF node`);
  assert.equal(system.richEffectCount, 0, `${assetId} emitter must not stack a Canvas charge effect`);
  system.syncAttackGifEffects(0, 0);

  const firstNode = fakeLayer.children[0];
  assert.match(firstNode.src, new RegExp(`${assetId}-cast\\.gif#fx=\\d+$`), `${assetId} must use its dedicated GIF`);
  assert.match(firstNode.className, /attack-gif-phase-charge/, `${assetId} GIF must provide the compact charge phase`);

  advanceAttackEffects(0.08);
  assert.equal(system.activeGifCount, 1, `${assetId} GIF must remain visible briefly instead of disappearing immediately`);
  assert.equal(fakeLayer.children.length, 1, `${assetId} DOM node must remain during its short visible phase`);

  system.spawnAttackSequence(caster, move, 1, 0, 1, 1);
  assert.equal(system.activeGifCount, 1, `repeating the same ${assetId} emitter must replace rather than stack the GIF`);
  assert.equal(fakeLayer.children.length, 1, `repeating the same ${assetId} emitter must keep one DOM node`);
  assert.equal(firstNode.parentNode, null, `repeating the same ${assetId} emitter must detach the previous node`);
  assert.notEqual(fakeLayer.children[0], firstNode, `repeating the same ${assetId} emitter must restart with a fresh node`);

  advanceAttackEffects(0.4);
  assertEffectSystemClean(`${assetId} emitter`);
}

const nativeOnlyRuntimeCases = [
  ["surf", "water", "surf", "special", fighter("lapras", "fish", { types: ["water"] })],
  ["flamethrower", "fire", "flamethrower", "special", fighter("charizard", "wings", { types: ["fire"] })],
  ["hydropump", "water", "hydro-pump", "special", fighter("blastoise", "upright", { types: ["water"] })],
  ["electricshock", "electric", "thunder-shock", "special", fighter("pikachu", "quadruped", { types: ["electric"] })],
  ["spark", "electric", "spark", "physical", fighter("pikachu", "quadruped", { types: ["electric"] })],
  ["thunderbolt", "electric", "thunderbolt", "special", fighter("pikachu", "quadruped", { types: ["electric"] })],
  ["thunder", "electric", "thunder", "special", fighter("pikachu", "quadruped", { types: ["electric"] })],
  ["doubleteam", "normal", "double-team", "status", fighter("pikachu", "quadruped")],
  ["groundsmash", "ground", "earthquake", "physical", fighter("sandslash", "upright", { types: ["ground"] })],
  ["earthpower", "ground", "earth-power", "special", fighter("sandslash", "upright", { types: ["ground"] })]
];

for (const [visualType, elementType, sourceMoveSlug, category, caster] of nativeOnlyRuntimeCases) {
  const resolved = system.spawnAttackSequence(caster, {
    type: visualType,
    category,
    elementType,
    sourceMoveSlug
  }, 1, 0, 1, 1);
  assert.equal(resolved.nativeOnly, true, `${visualType} must resolve to its native presentation`);
  assert.equal(resolved.asset, null, `${visualType} must not select a generic cast GIF`);
  assert.equal(system.activeGifCount, 0, `${visualType} must not create a generic GIF`);
  assert.equal(fakeLayer.children.length, 0, `${visualType} must not attach a generic GIF node`);
  assert.equal(system.richEffectCount, 0, `${visualType} must leave presentation to its dedicated renderer`);
}

const rapidMouthCaster = fighter("rapid-mouth", "wings", { types: ["fire", "water"], targetPx: 96 });
system.spawnAttackSequence(rapidMouthCaster, {
  type: "ember",
  category: "special",
  elementType: "fire",
  sourceMoveSlug: "ember"
}, 1, 0, 1, 1);
const previousMouthNode = fakeLayer.children[0];
system.spawnAttackSequence(rapidMouthCaster, {
  type: "watergun",
  category: "special",
  elementType: "water",
  sourceMoveSlug: "water-gun"
}, 1, 0, 1, 1);
assert.equal(system.activeGifCount, 1, "the same emitter must replace its old GIF even when the next move uses another asset");
assert.equal(fakeLayer.children.length, 1, "a rapid cross-element cast from one emitter must retain one DOM node");
assert.equal(previousMouthNode.parentNode, null, "a rapid cross-element cast must detach the previous emitter GIF");
assert.match(fakeLayer.children[0].src, /element-water\.gif#fx=\d+$/, "the replacement emitter GIF must show the newest move");
advanceAttackEffects(0.4);
assertEffectSystemClean("cross-element emitter replacement");

for (const rangedImpactCase of [
  {
    element: "fire",
    caster: fighter("fire-impact-caster", "wings", { types: ["fire"], targetPx: 96 }),
    move: { type: "ember", category: "special", elementType: "fire", sourceMoveSlug: "ember" }
  },
  {
    element: "normal",
    caster: fighter("normal-impact-caster", "humanoid", { types: ["normal"], targetPx: 96 }),
    move: { type: "swift", category: "special", elementType: "normal", sourceMoveSlug: "swift" }
  }
]) {
  system.spawnAttackSequence(rangedImpactCase.caster, rangedImpactCase.move, 1, 0, 1, 1);
  const castGifCount = system.activeGifCount;
  system.spawnImpactSequence(
    fighter(`${rangedImpactCase.element}-impact-target`, "upright", { targetPx: 96 }),
    rangedImpactCase.element,
    18,
    { physical: false, contact: false, effectiveness: 1 }
  );
  assert.equal(system.activeGifCount, castGifCount, `${rangedImpactCase.element} ranged hit must not add an impact GIF`);
  assert.equal(system.richEffectCount, 1, `${rangedImpactCase.element} ranged hit must add one thin Canvas ring`);
  advanceAttackEffects(0.4);
  assertEffectSystemClean(`${rangedImpactCase.element} ranged impact`);
}

const runtimeBlastoise = fighter("blastoise", "upright", { types: ["water"], targetPx: 93 });
const runtimeHydroProfile = system.spawnAttackSequence(runtimeBlastoise, {
  type: "hydropump",
  category: "special",
  elementType: "water",
  sourceMoveSlug: "hydro-pump"
}, -1, 0, 1.2, 1.1);
assert.equal(runtimeHydroProfile.nativeOnly, true, "Hydro Pump must use its native continuous stream renderer");
assert.equal(runtimeHydroProfile.emitter, "cannon", "Blastoise's native Hydro Pump must retain its cannon anatomy");
assert.equal(runtimeHydroProfile.asset, null, "Hydro Pump must not stack the old Water GIF over its streams");
assert.equal(system.activeGifCount, 0, "Blastoise Hydro Pump must not create cannon GIF overlays");
assert.equal(fakeLayer.children.length, 0, "Blastoise Hydro Pump must leave its two streams unobscured");
assert.equal(system.richEffectCount, 0, "Blastoise Hydro Pump cast must not add an unrelated Canvas overlay");

const runtimeElementalContact = fighter("hitmonchan", "humanoid", { types: ["fighting"], targetPx: 96 });
system.spawnAttackSequence(runtimeElementalContact, {
  type: "stomp",
  category: "physical",
  elementType: "fighting",
  sourceMoveSlug: "mega-punch"
}, 1, 0, 1, 1);
assert.equal(system.activeGifCount, 0, "elemental contact attacks must wait until impact before creating a GIF");
assert.equal(fakeLayer.children.length, 0, "elemental contact casts must not attach an early GIF node");
assert.equal(system.richEffectCount, 0, "elemental contact casts must not add Canvas overlays");
system.spawnImpactSequence(
  fighter("fighting-contact-target", "upright", { targetPx: 96 }),
  "fighting",
  18,
  { physical: true, contact: true, primaryAsset: "element_fighting", effectiveness: 1, angle: 0.7 }
);
assert.equal(system.activeGifCount, 1, "elemental contact hit must create exactly one type GIF");
assert.equal(fakeLayer.children.length, 1, "elemental contact hit must attach exactly one GIF node");
assert.equal(system.richEffectCount, 0, "elemental contact hit must not stack a Canvas ring");
system.syncAttackGifEffects(0, 0);
assert.match(fakeLayer.children[0].src, /element-fighting\.gif#fx=\d+$/, "Fighting contact must use its type GIF at impact");
assert.ok(parseFloat(fakeLayer.children[0].style.width) <= 90, "elemental physical GIF must stay within 90px");
advanceAttackEffects(0.4);
assertEffectSystemClean("elemental contact attack");

const runtimeClaw = fighter("sandslash", "upright", { types: ["normal"], targetPx: 96 });
system.spawnAttackSequence(runtimeClaw, {
  type: "slash",
  category: "physical",
  elementType: "normal",
  sourceMoveSlug: "scratch"
}, 1, 0, 1, 1);
assert.equal(system.activeGifCount, 0, "claw attacks must wait until impact before creating a GIF");
assert.equal(fakeLayer.children.length, 0, "claw casts must not attach an early GIF node");
assert.equal(system.richEffectCount, 0, "claw casts must not add Canvas sparks or glows");
const clawImpactAngle = Math.atan2(-0.6, 0.8);
system.spawnImpactSequence(
  fighter("claw-target", "upright", { targetPx: 96 }),
  "normal",
  18,
  { physical: true, contact: true, primaryAsset: "claw", effectiveness: 1, angle: clawImpactAngle }
);
assert.equal(system.activeGifCount, 1, "claw hit must create exactly one GIF");
assert.equal(fakeLayer.children.length, 1, "claw hit must attach exactly one GIF node");
assert.equal(system.richEffectCount, 0, "claw hit must not stack a Canvas ring");
system.syncAttackGifEffects(0, 0);
assert.match(fakeLayer.children[0].src, /claw-strike\.gif#fx=\d+$/, "Scratch must use the claw GIF at impact");
assert.ok(parseFloat(fakeLayer.children[0].style.width) <= 90, "claw GIF must stay within 90px for a 96px target");
assert.equal(fakeLayer.children[0].style.transform, `rotate(${clawImpactAngle}rad)`, "claw GIF must follow the impact angle");
advanceAttackEffects(0.4);
assertEffectSystemClean("claw attack");

const runtimeFang = fighter("persian", "quadruped", { types: ["normal"], targetPx: 96 });
system.spawnAttackSequence(runtimeFang, {
  type: "visegrip",
  category: "physical",
  elementType: "normal",
  sourceMoveSlug: "bite"
}, 1, 0, 1, 1);
assert.equal(system.activeGifCount, 0, "bite attacks must wait until impact before creating a GIF");
assert.equal(fakeLayer.children.length, 0, "bite casts must not attach an early GIF node");
assert.equal(system.richEffectCount, 0, "bite casts must not add Canvas sparks or glows");
system.spawnImpactSequence(
  fighter("fang-target", "upright", { targetPx: 96 }),
  "normal",
  18,
  { physical: true, contact: true, primaryAsset: "fang", effectiveness: 1, angle: 1.1 }
);
assert.equal(system.activeGifCount, 1, "bite hit must create exactly one fang GIF");
assert.equal(fakeLayer.children.length, 1, "bite hit must attach exactly one GIF node");
assert.equal(system.richEffectCount, 0, "bite hit must not stack a Canvas ring");
system.syncAttackGifEffects(0, 0);
assert.match(fakeLayer.children[0].src, /fang-strike\.gif#fx=\d+$/, "Bite must use the fang GIF at impact");
assert.ok(parseFloat(fakeLayer.children[0].style.width) <= 90, "fang GIF must stay within 90px for a 96px target");
assert.equal(fakeLayer.children[0].style.transform, "rotate(0rad)", "fang GIF must remain upright at impact");
advanceAttackEffects(0.4);
assertEffectSystemClean("bite attack");

const runtimeTackle = fighter("tauros", "quadruped", { types: ["normal"], targetPx: 96 });
system.spawnAttackSequence(runtimeTackle, {
  type: "slash",
  category: "physical",
  elementType: "normal",
  sourceMoveSlug: "tackle",
  sourceMoveName: "Tackle",
  name: "Slash"
}, 1, 0, 1, 1);
assert.equal(system.activeGifCount, 0, "Tackle should wait until contact instead of showing an early impact GIF");
assert.equal(fakeLayer.children.length, 0, "Tackle must not duplicate its hit GIF at cast time");
assert.equal(system.richEffectCount, 0, "Tackle wind-up must not add Canvas sparks or glows");
system.spawnImpactSequence(
  fighter("tackle-target", "upright", { targetPx: 96 }),
  "normal",
  18,
  { physical: true, contact: true, primaryAsset: "impact", effectiveness: 1 }
);
assert.equal(system.activeGifCount, 1, "Tackle hit must create exactly one impact GIF");
assert.equal(fakeLayer.children.length, 1, "Tackle hit must attach exactly one impact GIF node");
assert.match(fakeLayer.children[0].src, /hit-impact\.gif#fx=\d+$/, "Tackle hit must use the impact GIF");
system.syncAttackGifEffects(0, 0);
assert.ok(parseFloat(fakeLayer.children[0].style.width) <= 90, "Tackle impact GIF must stay within 90px for a 96px target");
assert.equal(fakeLayer.children[0].style.transform, "rotate(0rad)", "Tackle impact GIF must remain upright");
assert.equal(system.richEffectCount, 0, "Tackle hit must not stack a Canvas ring");
advanceAttackEffects(0.4);
assertEffectSystemClean("Tackle hit");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const terrainPos = indexHtml.indexOf("terrain.js");
const manifestPos = indexHtml.indexOf("assets/attack-effects/manifest.js");
const effectsPos = indexHtml.indexOf("attack_effects.js");
const gamePos = indexHtml.indexOf('src="game.js');
assert.ok(terrainPos >= 0 && terrainPos < gamePos, "terrain.js must load before game.js");
assert.ok(manifestPos >= 0 && effectsPos > manifestPos && gamePos > effectsPos, "attack scripts must load in manifest -> effects -> game order");
assert.match(indexHtml, /id="attack-gif-layer"/, "attack GIF DOM layer is missing");

const terrain = require(terrainScriptPath);
assert.equal(typeof terrain.createTerracedSector, "function", "terrain sector builder must be exported for verification");
assert.equal(typeof terrain.getTerracedHeightAt, "function", "terrain elevation resolver must be exported for verification");
assert.equal(typeof terrain.drawTerracedBattlefield, "function", "terrain renderer must be exported for verification");
const terrainSector = terrain.createTerracedSector(0, 0, 800, 560);
const repeatedTerrainSector = terrain.createTerracedSector(0, 0, 800, 560);
assert.deepEqual(terrainSector, repeatedTerrainSector, "the same terrain sector seed must produce identical geometry");
assert.deepEqual(terrainSector.heights, [0, 18, 36, 52], "terrain must expose the four requested elevation levels");
assert.deepEqual(
  terrainSector.terraces.map(terrace => terrace.height),
  [18, 36, 52],
  "the three raised terraces must use 18px, 36px, and 52px elevations"
);
assert.equal(terrainSector.ramps.length, 3, "each elevation transition must have one walkable ramp or stairway");
assert.deepEqual(
  terrainSector.ramps.map(ramp => [ramp.fromHeight, ramp.toHeight]),
  [[0, 18], [18, 36], [36, 52]],
  "ramps must connect every adjacent terrain level"
);
assert.equal(
  terrain.getTerracedHeightAt(terrainSector, terrainSector.cx + 900, terrainSector.cy + 700),
  0,
  "points outside the terraces must remain at base elevation"
);
const crown = terrainSector.terraces[2];
assert.equal(
  terrain.getTerracedHeightAt(terrainSector, crown.x, crown.y),
  52,
  "the crown of the battlefield must resolve to the highest elevation"
);
for (const ramp of terrainSector.ramps) {
  assert.equal(
    terrain.getTerracedHeightAt(terrainSector, ramp.x1, ramp.y1),
    ramp.fromHeight,
    `${ramp.id} must begin at its lower elevation`
  );
  assert.equal(
    terrain.getTerracedHeightAt(terrainSector, ramp.x2, ramp.y2),
    ramp.toHeight,
    `${ramp.id} must end at its upper elevation`
  );
  const midHeight = terrain.getTerracedHeightAt(
    terrainSector,
    (ramp.x1 + ramp.x2) * 0.5,
    (ramp.y1 + ramp.y2) * 0.5
  );
  assert.ok(
    midHeight > ramp.fromHeight && midHeight < ramp.toHeight,
    `${ramp.id} must interpolate between levels instead of creating an impassable wall`
  );
}
const firstTerrainFrame = makeRecordingCanvas();
const secondTerrainFrame = makeRecordingCanvas();
terrain.drawTerracedBattlefield(firstTerrainFrame, [terrainSector], 0, 0, 1600, 1120, 1.25);
terrain.drawTerracedBattlefield(secondTerrainFrame, [terrainSector], 0, 0, 1600, 1120, 9.75);
assert.deepEqual(
  snapshotCanvasOperations(firstTerrainFrame),
  snapshotCanvasOperations(secondTerrainFrame),
  "the default battlefield must render deterministically without frame-to-frame terrain noise"
);
assert.equal(
  firstTerrainFrame.operations.filter(operation => operation[0] === "save").length,
  firstTerrainFrame.operations.filter(operation => operation[0] === "restore").length,
  "terrain rendering must leave the Canvas save/restore stack balanced"
);
assert.doesNotMatch(terrainSource, /Math\.random\s*\(/, "terrain generation and rendering must not use Math.random");
assert.match(gameSource, /fieldType:\s*"terrain"/, "the terraced battlefield must be the initial field type");
assert.match(
  gameSource,
  /buildArenaGeometry\(\);[\s\S]*?startTerrainScene\(\);[\s\S]*?requestAnimationFrame\(loop\);/,
  "the game must boot directly into the terraced battlefield scene"
);
assert.match(indexHtml, /id="btn-scene-terrain"/, "the terraced battlefield must remain selectable from the scene controls");

const mapperSource = gameSource.match(/function mapPokeMoveToVisualEffect\(m, slotIdx\) \{[\s\S]*?\n\}/);
assert.ok(mapperSource, "move-to-visual mapper could not be read from game.js");
const mapMoveToVisual = vm.runInNewContext(`(${mapperSource[0]})`);
for (const [slug, type, category, power, expected] of [
  ["surf", "water", "special", 90, "surf"],
  ["flamethrower", "fire", "special", 90, "flamethrower"],
  ["hydro-pump", "water", "special", 110, "hydropump"],
  ["thunder-shock", "electric", "special", 40, "electricshock"],
  ["spark", "electric", "physical", 65, "spark"],
  ["thunderbolt", "electric", "special", 90, "thunderbolt"],
  ["thunder", "electric", "special", 110, "thunder"],
  ["double-team", "normal", "status", 0, "doubleteam"],
  ["earthquake", "ground", "physical", 100, "groundsmash"],
  ["earth-power", "ground", "special", 90, "earthpower"]
]) {
  assert.equal(
    mapMoveToVisual({ slug, type, category, power }, 1),
    expected,
    `${slug} must map exactly to the ${expected} dedicated presentation`
  );
}
assert.equal(
  mapMoveToVisual({ slug: "heat-wave", type: "fire", category: "special", power: 95 }, 1),
  "flamethrower",
  "Heat Wave must not be misclassified as Surf"
);
assert.equal(
  mapMoveToVisual({ slug: "sludge-wave", type: "poison", category: "special", power: 95 }, 1),
  "shadowball",
  "Sludge Wave must retain a Poison-compatible projectile visual"
);
assert.equal(
  mapMoveToVisual({ slug: "hurricane", type: "flying", category: "special", power: 110 }, 1),
  "swift",
  "Hurricane must not be misclassified as a water Whirlpool"
);
assert.equal(
  mapMoveToVisual({ slug: "surf", type: "water", category: "special", power: 90 }, 1),
  "surf",
  "Surf must retain its compact Water wave visual"
);
assert.equal(
  mapMoveToVisual({ slug: "wave-crash", type: "water", category: "physical", power: 120 }, 1),
  "crabhammer",
  "physical Water moves containing 'wave' must stay contact attacks"
);
for (const move of [
  { slug: "flare-blitz", type: "fire", category: "physical", power: 120 },
  { slug: "wild-charge", type: "electric", category: "physical", power: 90 },
  { slug: "volt-tackle", type: "electric", category: "physical", power: 120 },
  { slug: "thunder-fang", type: "electric", category: "physical", power: 65 }
]) {
  assert.equal(
    mapMoveToVisual(move, 1),
    "hornattack",
    `${move.slug} must use the contact path instead of a ranged beam or projectile`
  );
}
for (const move of [
  { slug: "sacred-fire", type: "fire", category: "physical", power: 100 },
  { slug: "pyro-ball", type: "fire", category: "physical", power: 120 }
]) {
  assert.equal(
    mapMoveToVisual(move, 1),
    "ember",
    `${move.slug} must remain a non-contact Fire projectile despite its physical category`
  );
}
const thunderFangVisual = mapMoveToVisual(
  { slug: "thunder-fang", type: "electric", category: "physical", power: 65 },
  1
);
assert.equal(
  profile(fighter("jolteon", "quadruped", { types: ["electric"] }), {
    type: thunderFangVisual,
    category: "physical",
    elementType: "electric",
    sourceMoveSlug: "thunder-fang"
  }).asset,
  "fang",
  "Thunder Fang must reach the contact classifier and use the bite GIF"
);
assert.match(gameSource, /drawElementProjectile\(targetCtx, p, state\.time\)/, "projectiles must use the element-aware renderer");
assert.match(
  gameSource,
  /state\.waterSurges\.push\(\{[\s\S]*?x:\s*user\.x,[\s\S]*?y:\s*user\.y,[\s\S]*?hitSet:\s*new Set\(\)/,
  "Surf must create one self-centred radial Water effect with one-hit tracking"
);
assert.match(
  gameSource,
  /for \(let i = state\.waterSurges\.length - 1; i >= 0; i--\)[\s\S]*?surge\.radius = surge\.startRadius \+ \(surge\.maxRadius - surge\.startRadius\) \* eased;[\s\S]*?if \(surge\.life <= 0\) state\.waterSurges\.splice\(i, 1\)/,
  "radial Water attacks must expand, resolve hits, and clean themselves up"
);
assert.match(
  gameSource,
  /drawWaterSurgeEffect\(ctx, \{[\s\S]*?radius:\s*surge\.maxRadius,[\s\S]*?layer:\s*"back"[\s\S]*?drawWaterSurgeEffect\(fxCtx, \{[\s\S]*?layer:\s*"front"/,
  "the render loop must split the all-direction Water attack behind and in front of the fighter"
);
assert.match(
  gameSource,
  /kind:\s*"hydro"[\s\S]*?streamOrigins:\s*origins\.map\(anchor => \(\{ x: anchor\.x, y: anchor\.y \}\)\)/,
  "Hydro Pump must retain every resolved cannon origin"
);
assert.match(
  gameSource,
  /drawHydroPumpStream\(targetCtx, \{ \.\.\.b, lanes: b\.streamOrigins\?\.length > 1 \? 2 : 1 \}, state\.time\)/,
  "dual-cannon Hydro Pump must select the native two-lane renderer"
);
assert.match(
  gameSource,
  /t === "electricshock" \|\| t === "thunderbolt" \|\| t === "thunder" \|\| t === "spark"[\s\S]*?const electricKind = t === "thunder"[\s\S]*?\? "electric_shock"[\s\S]*?: "thunderbolt"/,
  "Thunder Shock, Thunderbolt, and Thunder must select three distinct native beam kinds"
);
assert.match(
  gameSource,
  /\["electric_shock", "thunderbolt", "thunder"\]\.includes\(b\.kind\)[\s\S]*?drawElectricMove\(targetCtx/,
  "all three Electric variants must reach the staged Electric renderer"
);
assert.match(
  gameSource,
  /state\.groundBreaks\.push\(\{[\s\S]*?kind:\s*centeredOnUser \? "ground_smash" : "earth_power"[\s\S]*?hitApplied:\s*false/,
  "ground attacks must create one seeded crack effect with a single-hit gate"
);
assert.match(
  gameSource,
  /state\.groundBreaks\.push\(\{[\s\S]*?life:\s*4\.2,[\s\S]*?maxLife:\s*4\.2,[\s\S]*?hitDelay:\s*0\.22/,
  "ground damage must land on the impact frame while the crater remains visible"
);
assert.match(
  gameSource,
  /for \(let i = state\.groundBreaks\.length - 1; i >= 0; i--\)[\s\S]*?if \(!groundFx\.hitApplied[\s\S]*?if \(groundFx\.life <= 0\) state\.groundBreaks\.splice\(i, 1\)/,
  "ground cracks must apply damage once and clean themselves up after the residual decal"
);
assert.match(
  gameSource,
  /drawGroundBreakEffect\(ctx, \{[\s\S]*?\.\.\.groundFx,[\s\S]*?getTerrainHeightAt\(groundFx\.x, groundFx\.y\)/,
  "ground cracks must render on the current terrain elevation"
);
assert.match(
  gameSource,
  /drawGroundBreakEffect\(ctx, \{[\s\S]*?layer:\s*"ground"[\s\S]*?drawGroundBreakEffect\(fxCtx, \{[\s\S]*?layer:\s*"front"/,
  "ground attacks must keep the crater below fighters while dust and debris pass in front"
);
assert.equal(
  typeof sandbox.getGroundEffectPerspective,
  "function",
  "ground-layer renderers must expose one shared perspective helper"
);
assert.equal(
  sandbox.getGroundEffectPerspective({}),
  0.88,
  "Water and Ground effects must default to the reference's near-circular 0.88 perspective"
);
assert.match(
  canvasEffectsSource,
  /function drawWaterSurgeEffect[\s\S]*?const perspective = getGroundEffectPerspective\(effect\)[\s\S]*?function drawGroundBreakEffect[\s\S]*?const perspective = getGroundEffectPerspective\(effect\)/,
  "Water and Ground renderers must both use the shared ground perspective"
);
assert.match(
  gameSource,
  /function getVisualDistance\([\s\S]*?\(\(by - bLift\) - \(ay - aLift\)\) \/ perspective/,
  "ground-layer collision distance must undo the renderer's vertical perspective"
);
assert.match(
  gameSource,
  /for \(let i = state\.waterSurges\.length - 1; i >= 0; i--\)[\s\S]*?getGroundEffectPerspective\(surge\)[\s\S]*?for \(let i = state\.groundBreaks\.length - 1; i >= 0; i--\)[\s\S]*?getGroundEffectPerspective\(groundFx\)/,
  "Water and Ground collision checks must use the same perspective as their renderers"
);
assert.match(
  gameSource,
  /user\.doubleTeamDuration = 0\.94;[\s\S]*?user\.doubleTeamTimer = user\.doubleTeamDuration;[\s\S]*?user\.invulnTimer = Math\.max\(user\.invulnTimer, 0\.72\)/,
  "Double Team must have a bounded clone phase and evasion window"
);
assert.match(
  spriteAnimatorSource,
  /const BF_GHOST_POOL_SIZE = 7;[\s\S]*?function computeDoubleTeamGhostMotion[\s\S]*?const doubleTeamActive =[\s\S]*?computeDoubleTeamGhostMotion\(/,
  "Double Team must render a seven-position appear, exchange, and converge sequence"
);
assert.match(
  spriteAnimatorSource,
  /computeDoubleTeamGhostMotion\(\s*doubleTeamProgress,\s*gi,\s*domEntry\.ghosts\.length,\s*renderW,\s*renderH\s*\)/,
  "Double Team must pass sprite width and height once each to its ghost motion solver"
);
assert.match(canvasEffectsSource, /const slices = 5;/, "Whirlpool must use only a few thin visual bands");
assert.match(
  canvasEffectsSource,
  /if \(variant === "bolt"\)[\s\S]*?const localLength =[\s\S]*?target-burst[\s\S]*?primaryPath = buildDeterministicLightningPath/,
  "Thunderbolt must cut from its source charge to a target-local electrical burst"
);
assert.match(
  canvasEffectsSource,
  /const visualRadius = Math\.max\(18, Math\.min\(68, radius \* 0\.68\)\)/,
  "Surf and Whirlpool visuals must remain compact even when their gameplay radius is large"
);
assert.doesNotMatch(canvasEffectsSource, /const slices = 22;/, "the old filled 22-slice Whirlpool tower must not return");
assert.match(
  gameSource,
  /sourceMoveSlug:\s*\(matchedPm && matchedPm\.slug\) \|\| "",\s*sourceMoveName:\s*\(matchedPm && matchedPm\.name\) \|\| bm\.name \|\| ""/,
  "runtime moves must preserve their canonical source slug and name for contact classification"
);
assert.match(
  gameSource,
  /const attackEffectProfile = typeof spawnAttackSequence === "function"\s*\? spawnAttackSequence\(user, move, dirX, dirY, powerScale, rangeScale\)\s*:\s*null/,
  "every executed move must start one semantic attack-effect sequence"
);
assert.match(
  attackEffectSource,
  /lockUpright:\s*simpleElemental\s*\?\s*!DIRECTIONAL_ELEMENT_TYPES\.has\(profile\.element\)\s*:\s*false/,
  "directional element GIFs must rotate with the attack while other recognizable GIFs remain upright"
);
assert.match(
  gameSource,
  /if \(b\.kind === "hyper"\) \{\s*const steps = 4;[\s\S]*?for \(let i = 1; i <= steps; i\+\+\)[\s\S]*?drawEllipseRing\(/,
  "only Hyper Beam should retain four decorative beam rings"
);
assert.match(
  gameSource,
  /const projectileVisualY = p\.y - getTerrainHeightAt\(p\.x, p\.y\);[\s\S]*?const fighterVisualY = getVisualGroundY\(f\.x, f\.y, f\) - f\.z;[\s\S]*?Math\.hypot\(f\.x - p\.x, fighterVisualY - projectileVisualY\) < p\.r \+ \(f\.hitRadius \|\| 24\)/,
  "projectile collision must compare positions on the rendered terrain plane"
);
assert.match(
  gameSource,
  /const fighterVisualY = getFighterEffectTargetY\(f\);[\s\S]*?const beamRadius = Number\.isFinite\(b\.collisionRadius\) \? b\.collisionRadius : b\.width \* 0\.5;[\s\S]*?Math\.hypot\(f\.x - px, fighterVisualY - py\) < beamRadius \+ \(f\.hitRadius \|\| 26\)/,
  "beam collision must compare against the same body-height target used by the rendered stream"
);
assert.match(
  gameSource,
  /function updateTrackedBeamEndpoints\(beam\)[\s\S]*?const target = beam\.targetFighter \|\| null;[\s\S]*?getFighterEffectTargetY\(target\)[\s\S]*?beam\.streamOrigins = origins\.map/,
  "tracked streams must follow the opponent's body and refresh physical emitter origins, even through the KO frame"
);
assert.match(
  gameSource,
  /b\.age = \(Number\(b\.age\) \|\| 0\) \+ dt;\s*updateTrackedBeamEndpoints\(b\);\s*if \(!b\.hitApplied/,
  "tracked beam endpoints must update before hit detection"
);
assert.match(
  gameSource,
  /function triggerFieldFlash\([\s\S]*?state\.screenFlash = \{[\s\S]*?state\.screenFlash\.life = Math\.max\(0, state\.screenFlash\.life - dt\)[\s\S]*?fxCtx\.fillStyle = state\.screenFlash\.color/,
  "impact flashes must have creation, decay, and render paths"
);
assert.match(
  gameSource,
  /kind: "flame_stream"[\s\S]*?hitDelay: 1\.55 \* 0\.20[\s\S]*?kind: "hydro"[\s\S]*?hitDelay: 2\.15 \* 0\.18[\s\S]*?hitDelay: duration \* \(electricKind === "electric_shock" \? 0\.42 : 0\.26\)/,
  "staged Flame, Hydro, and Electric hits must wait until their visible stream reaches the target"
);
assert.match(
  gameSource,
  /Math\.hypot\(f\.x - w\.x, f\.y - w\.y\) < w\.radius \* 0\.85 \+ \(f\.hitRadius \|\| 24\) \* 0\.4/,
  "wave collision formula must remain intact"
);
assert.match(gameSource, /if \(dist < wp\.radius \* 1\.45\)/, "vortex collision formula must remain intact");
assert.match(
  gameSource,
  /b\.life -= dt;\s*if \(b\.life <= 0\) state\.beams\.splice\(i, 1\)/,
  "native flame, Hydro, and Electric beams must be removed when their staged lifetime ends"
);
assert.match(gameSource, /melee: p\.kind === "melee_hitbox"/, "melee collision objects must remain tied to the projectile hit test");
assert.match(gameSource, /r: \(isHeavySlam \? 46 : 33\) \* meleeAreaScale/, "melee hitbox radius must remain intact");
assert.match(gameSource, /dmg: move\.dmg \* \(isHeavySlam \? \(user\.weightPowerMult \|\| 1\.0\) : 1\.0\)/, "melee damage calculation must remain intact");
assert.match(
  gameSource,
  /life: 0\.32 \* Math\.max\(0\.88, Math\.min\(1\.25, reachScale\)\),\s*maxLife: 0\.32 \* Math\.max\(0\.88, Math\.min\(1\.25, reachScale\)\)/,
  "melee hitbox life and maxLife must remain intact"
);
assert.match(
  gameSource,
  /if \(!attackEffectProfile\?\.asset\) \{\s*state\.slashes\.push\(/,
  "the legacy slash arc must be suppressed when a semantic contact GIF is available"
);
assert.match(
  gameSource,
  /if \(isHeavySlam && !attackEffectProfile\?\.asset\) \{\s*state\.ripples\.push\(/,
  "the legacy heavy-slam ripple must be suppressed when a semantic contact GIF is available"
);
assert.match(
  gameSource,
  /attackEffectAsset: attackEffectProfile\?\.asset \|\| null/,
  "melee hitboxes must retain the contact asset selected at move execution"
);
assert.match(
  gameSource,
  /attackEffectAsset: p\.attackEffectAsset,\s*impactVx: p\.vx \|\| 0,\s*impactVy: p\.vy \|\| 0/,
  "projectile collision must forward the selected contact asset and impact direction"
);
assert.match(gameSource, /contact: Boolean\(extra\.melee\)/, "only contact hits should use the restrained melee impact treatment");
assert.match(gameSource, /primaryAsset: extra\.attackEffectAsset/, "contact hits must identify the cast GIF so it is not duplicated");
assert.match(gameSource, /impactShown: new Set\(\)/, "persistent Whirlpool damage must remember whether its visual hit already played");
assert.match(
  gameSource,
  /suppressImpactFeedback: !showImpactFeedback/,
  "persistent Whirlpool ticks after the first must suppress repeated rings and particles"
);
assert.match(
  gameSource,
  /const impactFeedbackShown = applyDamage\([\s\S]*?if \(showImpactFeedback && impactFeedbackShown\) wp\.impactShown\?\.add\(f\)/,
  "Whirlpool must remember a hit only after its feedback was actually accepted"
);
assert.match(
  gameSource,
  /angle: Math\.atan2\(extra\.impactVy \?\? knockY, extra\.impactVx \?\? knockX\)/,
  "contact hit feedback must receive the collision angle so claw slashes follow the strike"
);
assert.match(
  gameSource,
  /showImpactFeedback = spawnImpactSequence\([\s\S]*?\) !== false;\s*}\s*if \(showImpactFeedback\) \{\s*spawnBurst\(\s*target\.x,\s*target\.y - 10,\s*rawTypeMult >= 2 \? "#facc15" : "#ffffff",\s*extra\.melee \? 2 : 3,\s*extra\.melee \? 2\.4 : 2\.8,\s*0\.24,\s*0\.5\s*\)/,
  "hit particles must share the debounce gate and use the short, compact burst settings"
);
assert.equal(typeof sandbox.drawFireBlastProjectile, "function", "Fire Blast projectile cluster renderer must exist");
const fireBlastProjCanvas = makeRecordingCanvas();
assert.equal(
  sandbox.drawFireBlastProjectile(
    fireBlastProjCanvas,
    { x: 90, y: 110, vx: 8.5, vy: -1.2, r: 30, life: 0.5, maxLife: 0.72, seed: 808 },
    3.5
  ),
  true,
  "Fire Blast projectile cluster must draw while in flight"
);
assert.ok(fireBlastProjCanvas.operations.length >= 20, "Fire Blast projectile must draw a multi-flame cluster");
assert.match(
  gameSource,
  /else if \(t === "fireblast"\)[\s\S]*?kind:\s*"fireblast_orb"[\s\S]*?if \(p\.kind === "fireblast_orb"\) \{\s*spawnFireBlastKanjiExplosion\(p, f\);[\s\S]*?drawFireBlastKanjiEffect\(fxCtx, fb, state\.time\)/,
  "Fire Blast must launch a fireblast_orb projectile and expand into the Dai kanji flame effect upon hitting an enemy"
);

console.log(
  `attack effects: ${Object.keys(manifestJson.visualTypes).length} visual types, ` +
  `${Object.keys(manifestJson.assets).length} GIF assets, ${nativeOnlyVisualTypes.length} native-only moves, ` +
  "deterministic renderers and terraced terrain OK"
);
