#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gameRoot = path.resolve(__dirname, "..", "pokemon-arena-2d");
const arenaPath = path.join(gameRoot, "arena_rendering.js");
const terrainPath = path.join(gameRoot, "terrain.js");
const gamePath = path.join(gameRoot, "game.js");
const animatorPath = path.join(gameRoot, "sprite_animator.js");
const indexPath = path.join(gameRoot, "index.html");
const ArenaRenderer = require(arenaPath);
const TerrainRenderer = require(terrainPath);

function recordingContext() {
  const operations = [];
  let saveDepth = 0;
  const context = { operations, get saveDepth() { return saveDepth; } };
  const methods = [
    "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
    "rect", "clip", "fill", "stroke", "fillRect", "strokeRect", "arc", "ellipse",
    "translate", "rotate", "scale"
  ];
  for (const method of methods) {
    context[method] = (...args) => operations.push([method, ...args]);
  }
  context.save = () => { saveDepth += 1; operations.push(["save"]); };
  context.restore = () => { saveDepth -= 1; operations.push(["restore"]); };
  function gradient(kind, args) {
    const value = { kind, args, stops: [] };
    value.addColorStop = (offset, color) => {
      value.stops.push([offset, color]);
      operations.push([`${kind}.addColorStop`, offset, color]);
    };
    operations.push([kind, ...args]);
    return value;
  }
  context.createLinearGradient = (...args) => gradient("linearGradient", args);
  context.createRadialGradient = (...args) => gradient("radialGradient", args);
  for (const property of [
    "fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "globalCompositeOperation",
    "lineCap", "lineJoin", "shadowColor", "shadowBlur"
  ]) {
    let value;
    Object.defineProperty(context, property, {
      set(next) {
        value = next;
        operations.push([property, next && next.kind ? { kind: next.kind, stops: next.stops } : next]);
      },
      get() { return value; }
    });
  }
  return context;
}

function signature(draw) {
  const context = recordingContext();
  draw(context);
  assert.equal(context.saveDepth, 0, "renderer must balance save/restore");
  assert.ok(context.operations.length > 12, "renderer must emit a meaningful layered drawing");
  for (const operation of context.operations) {
    for (const value of operation.slice(1)) {
      if (typeof value === "number") assert.ok(Number.isFinite(value), "renderer emitted NaN or Infinity");
    }
  }
  return JSON.stringify(context.operations);
}

const sector = { sx: 0, sy: 0, cx: 250, cy: 210 };
const fieldOptions = {
  viewLeft: 0,
  viewTop: 0,
  viewW: 520,
  viewH: 420,
  sectors: [sector],
  sectorW: 620,
  sectorH: 460,
  time: 1.75
};
const platforms = [
  { x: 150, y: 210, r: 68, kind: "pokeball", tiltX: 0, tiltY: 0 },
  { x: 355, y: 215, r: 72, kind: "wood", height: 22, tiltX: 0, tiltY: 0 }
];
const iceFloes = [{ x: 255, y: 315, r: 48, seed: 2.4 }];
const immutableInput = JSON.stringify({ fieldOptions, platforms, iceFloes });

const signatures = {
  grass: signature(ctx => ArenaRenderer.drawGrassField(ctx, fieldOptions)),
  water: signature(ctx => ArenaRenderer.drawWaterSurface(ctx, fieldOptions)),
  mechanical: signature(ctx => ArenaRenderer.drawMechanicalBasin(ctx, fieldOptions)),
  platforms: signature(ctx => ArenaRenderer.drawPlatformsAndIce(ctx, { platforms, iceFloes, time: 1.75 })),
  contactBack: signature(ctx => ArenaRenderer.drawWaterContactBase(ctx, {
    x: 120, y: 190, width: 90, speed: 3.2, vx: 2.8, vy: 1.1, time: 1.75, alpha: 1
  })),
  contactFront: signature(ctx => ArenaRenderer.drawWaterContactFront(ctx, {
    x: 120, y: 190, width: 90, speed: 3.2, time: 1.75, alpha: 1
  }))
};

const terracedSector = TerrainRenderer.createTerracedSector(0, 0, 250, 210);
signatures.terrain = signature(ctx => TerrainRenderer.drawTerracedBattlefield(
  ctx,
  [terracedSector],
  -300,
  -250,
  1100,
  900,
  1.75
));

assert.equal(JSON.stringify({ fieldOptions, platforms, iceFloes }), immutableInput, "rendering must not mutate arena data");
assert.equal(new Set(Object.values(signatures)).size, Object.keys(signatures).length, "arena layers must be visually distinct");
assert.equal(
  signatures.water,
  signature(ctx => ArenaRenderer.drawWaterSurface(ctx, fieldOptions)),
  "water rendering must be deterministic at the same time"
);
assert.notEqual(
  signatures.water,
  signature(ctx => ArenaRenderer.drawWaterSurface(ctx, { ...fieldOptions, time: 2.75 })),
  "water surface should animate when time advances"
);

const baseFighter = {
  id: "pikachu",
  team: 1,
  z: 0,
  flier: false,
  swimmer: false,
  shapeSlug: "quadruped",
  types: ["electric"]
};
assert.equal(ArenaRenderer.resolveWaterContact(baseFighter, { fieldType: "grass", platform: null, time: 1 }).active, false);
assert.equal(ArenaRenderer.resolveWaterContact({ ...baseFighter, flier: true }, { fieldType: "water", platform: null, time: 1 }).mode, "hover");
assert.equal(ArenaRenderer.resolveWaterContact({ ...baseFighter, z: 20 }, { fieldType: "water", platform: null, time: 1 }).mode, "air");

const surfaceContact = ArenaRenderer.resolveWaterContact(baseFighter, { fieldType: "water", platform: null, time: 1 });
const fishContact = ArenaRenderer.resolveWaterContact(
  { ...baseFighter, id: "seaking", swimmer: true, shapeSlug: "fish", types: ["water"] },
  { fieldType: "water", platform: null, time: 1 }
);
const floatContact = ArenaRenderer.resolveWaterContact(
  { ...baseFighter, id: "blastoise", swimmer: true, shapeSlug: "upright", types: ["water"] },
  { fieldType: "water", platform: null, time: 1 }
);
assert.equal(surfaceContact.mode, "surface");
assert.ok(surfaceContact.immersionRatio <= 0.04, "land Pokémon should only break the surface at their feet");
assert.equal(fishContact.mode, "swim");
assert.ok(fishContact.immersionRatio >= 0.22, "fish-shaped Pokémon need visible body immersion");
assert.equal(floatContact.mode, "float");
assert.ok(floatContact.immersionRatio > surfaceContact.immersionRatio);

const platformContact = ArenaRenderer.resolveWaterContact(baseFighter, {
  fieldType: "water",
  platform: platforms[0],
  time: 1.75
});
assert.equal(platformContact.active, false);
assert.equal(platformContact.mode, "platform");
assert.equal(platformContact.platformBob, ArenaRenderer.getPlatformPose(platforms[0], 1.75).bob);
assert.ok(Math.abs(platformContact.platformBob) <= 2.36, "platform bob should remain restrained");
assert.equal(ArenaRenderer.pointOnPlatform(255, 315 + iceFloes[0].r * 0.60, iceFloes[0]), true);
assert.equal(ArenaRenderer.pointOnPlatform(255, 315 + iceFloes[0].r * 0.80, iceFloes[0]), false);

const arenaSource = fs.readFileSync(arenaPath, "utf8");
const gameSource = fs.readFileSync(gamePath, "utf8");
const animatorSource = fs.readFileSync(animatorPath, "utf8");
const indexSource = fs.readFileSync(indexPath, "utf8");
assert.doesNotMatch(arenaSource, /Math\.random\s*\(/, "arena textures must not shimmer randomly between frames");
assert.match(indexSource, /arena_rendering\.js[^]*sprite_animator\.js[^]*game\.js/, "arena helpers must load before the animator and engine");
assert.match(
  gameSource,
  /drawFieldMaterial\(state\.fieldTransition\.targetField,[\s\S]*?ctx\.restore\(\)/,
  "field reveal must render the requested target instead of always revealing water"
);
assert.match(gameSource, /Distance-driven wake emission[\s\S]*?waterWakeTracker\.distance/, "water wakes must be distance-driven");
assert.match(gameSource, /overOpenWater[\s\S]*?drawWaterContactBase/, "open water must use a refracted contact shadow");
assert.match(animatorSource, /imgEl\.style\.clipPath = waterClipPath/, "main GIF must use the computed water mask");
assert.match(animatorSource, /gObj\.el\.style\.clipPath = waterClipPath/, "afterimages must share the water mask");
assert.match(animatorSource, /bf-water-reflection-gif[\s\S]*?reflectionEl\.style\.transform/, "open water must render a live reflected silhouette");

console.log("arena rendering: terrain, grass, water, mechanical deck, platforms, and water contact OK");
