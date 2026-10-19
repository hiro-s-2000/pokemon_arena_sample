#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gameRoot = path.resolve(__dirname, "..", "pokemon-arena-2d");
const rendererPath = path.join(gameRoot, "hd2d_rendering.js");
const gamePath = path.join(gameRoot, "game.js");
const indexPath = path.join(gameRoot, "index.html");
const stylePath = path.join(gameRoot, "style.css");

// Requiring the renderer in Node must not depend on DOM globals such as Image.
const HD2DRenderer = require(rendererPath);
const rendererSource = fs.readFileSync(rendererPath, "utf8");
const gameSource = fs.readFileSync(gamePath, "utf8");
const indexSource = fs.readFileSync(indexPath, "utf8");
const styleSource = fs.readFileSync(stylePath, "utf8");

const REQUIRED_DRAW_FUNCTIONS = [
  "drawMaterialPass",
  "drawEnvironmentArchitecture",
  "drawForegroundFrame",
  "drawFighterCastShadow",
  "drawDynamicEntityLights",
  "drawScreenGrade"
];

for (const name of REQUIRED_DRAW_FUNCTIONS) {
  assert.equal(typeof HD2DRenderer[name], "function", `${name} must be exported`);
}
assert.equal(typeof HD2DRenderer.getMaterialStatus, "function", "material status API must be exported");

function serializable(value) {
  if (value && value.__recordingGradient) {
    return { kind: value.kind, args: value.args, stops: value.stops };
  }
  if (value && value.__recordingPattern) return { kind: "pattern", repetition: value.repetition };
  if (value && typeof value === "object") {
    if (typeof value.src === "string") return { image: value.src };
    return `[${value.constructor && value.constructor.name || "Object"}]`;
  }
  return value;
}

function recordingContext() {
  const operations = [];
  let saveDepth = 0;
  const context = {
    operations,
    canvas: { width: 960, height: 640 },
    get saveDepth() { return saveDepth; }
  };

  const methods = [
    "beginPath", "closePath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo",
    "arcTo", "rect", "roundRect", "clip", "fill", "stroke", "fillRect", "strokeRect",
    "clearRect", "arc", "ellipse", "translate", "rotate", "scale", "transform",
    "setTransform", "resetTransform", "drawImage", "fillText", "strokeText"
  ];
  for (const method of methods) {
    context[method] = (...args) => operations.push([method, ...args.map(serializable)]);
  }
  context.save = () => {
    saveDepth += 1;
    operations.push(["save"]);
  };
  context.restore = () => {
    saveDepth -= 1;
    assert.ok(saveDepth >= 0, "renderer restored more states than it saved");
    operations.push(["restore"]);
  };
  context.setLineDash = value => operations.push(["setLineDash", ...value]);
  context.getLineDash = () => [];
  context.measureText = text => ({ width: String(text).length * 8 });
  context.isPointInPath = () => false;

  function gradient(kind, args) {
    const value = { __recordingGradient: true, kind, args, stops: [] };
    value.addColorStop = (offset, color) => {
      value.stops.push([offset, color]);
      operations.push([`${kind}.addColorStop`, offset, color]);
    };
    operations.push([kind, ...args]);
    return value;
  }
  context.createLinearGradient = (...args) => gradient("linearGradient", args);
  context.createRadialGradient = (...args) => gradient("radialGradient", args);
  context.createConicGradient = (...args) => gradient("conicGradient", args);
  context.createPattern = (_image, repetition) => {
    const pattern = {
      __recordingPattern: true,
      repetition,
      setTransform: matrix => operations.push(["pattern.setTransform", serializable(matrix)])
    };
    operations.push(["createPattern", repetition]);
    return pattern;
  };

  const properties = [
    "fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "globalCompositeOperation",
    "lineCap", "lineJoin", "miterLimit", "shadowColor", "shadowBlur", "shadowOffsetX",
    "shadowOffsetY", "filter", "font", "textAlign", "textBaseline", "direction",
    "imageSmoothingEnabled", "imageSmoothingQuality"
  ];
  for (const property of properties) {
    let value;
    Object.defineProperty(context, property, {
      enumerable: true,
      configurable: true,
      set(next) {
        value = next;
        operations.push([property, serializable(next)]);
      },
      get() { return value; }
    });
  }
  return context;
}

function assertFiniteNumbers(value, label) {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${label} emitted NaN or Infinity`);
  } else if (Array.isArray(value)) {
    value.forEach(item => assertFiniteNumbers(item, label));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(item => assertFiniteNumbers(item, label));
  }
}

function captureOperations(label, draw, minimumOperations = 1) {
  const context = recordingContext();
  assert.doesNotThrow(() => draw(context), `${label} must render with a Canvas2D-compatible context`);
  assert.equal(context.saveDepth, 0, `${label} must balance save/restore`);
  assert.ok(
    context.operations.length >= minimumOperations,
    `${label} must emit at least ${minimumOperations} drawing operation(s)`
  );
  assertFiniteNumbers(context.operations, label);
  return context.operations;
}

function capture(label, draw, minimumOperations = 1) {
  return JSON.stringify(captureOperations(label, draw, minimumOperations));
}

function multiplyMatrix(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function transformPoint(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  };
}

function paintedGeometryBounds(operations) {
  const painted = [];
  const stateStack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  let pathBounds = null;

  function includePoint(bounds, x, y) {
    const point = transformPoint(matrix, x, y);
    if (!bounds) return { left: point.x, right: point.x, top: point.y, bottom: point.y };
    bounds.left = Math.min(bounds.left, point.x);
    bounds.right = Math.max(bounds.right, point.x);
    bounds.top = Math.min(bounds.top, point.y);
    bounds.bottom = Math.max(bounds.bottom, point.y);
    return bounds;
  }

  function includeRect(bounds, x, y, width, height) {
    let next = bounds;
    next = includePoint(next, x, y);
    next = includePoint(next, x + width, y);
    next = includePoint(next, x, y + height);
    next = includePoint(next, x + width, y + height);
    return next;
  }

  for (const operation of operations) {
    const [name, ...args] = operation;
    if (name === "save") {
      stateStack.push(matrix.slice());
    } else if (name === "restore") {
      matrix = stateStack.pop() || [1, 0, 0, 1, 0, 0];
    } else if (name === "translate") {
      matrix = multiplyMatrix(matrix, [1, 0, 0, 1, args[0], args[1]]);
    } else if (name === "scale") {
      matrix = multiplyMatrix(matrix, [args[0], 0, 0, args[1], 0, 0]);
    } else if (name === "rotate") {
      const cosine = Math.cos(args[0]);
      const sine = Math.sin(args[0]);
      matrix = multiplyMatrix(matrix, [cosine, sine, -sine, cosine, 0, 0]);
    } else if (name === "transform") {
      matrix = multiplyMatrix(matrix, args.slice(0, 6));
    } else if (name === "setTransform") {
      matrix = args.slice(0, 6);
    } else if (name === "resetTransform") {
      matrix = [1, 0, 0, 1, 0, 0];
    } else if (name === "beginPath") {
      pathBounds = null;
    } else if (name === "moveTo" || name === "lineTo") {
      pathBounds = includePoint(pathBounds, args[0], args[1]);
    } else if (name === "quadraticCurveTo") {
      pathBounds = includePoint(pathBounds, args[0], args[1]);
      pathBounds = includePoint(pathBounds, args[2], args[3]);
    } else if (name === "bezierCurveTo") {
      pathBounds = includePoint(pathBounds, args[0], args[1]);
      pathBounds = includePoint(pathBounds, args[2], args[3]);
      pathBounds = includePoint(pathBounds, args[4], args[5]);
    } else if (name === "rect" || name === "roundRect") {
      pathBounds = includeRect(pathBounds, args[0], args[1], args[2], args[3]);
    } else if (name === "arc") {
      pathBounds = includeRect(pathBounds, args[0] - args[2], args[1] - args[2], args[2] * 2, args[2] * 2);
    } else if (name === "ellipse") {
      // A transformed local bounding rectangle is a conservative bound for a
      // rotated ellipse and is sufficient for detecting oversized scenery.
      pathBounds = includeRect(pathBounds, args[0] - args[2], args[1] - args[3], args[2] * 2, args[3] * 2);
    } else if (name === "clip") {
      // The viewport clip itself is not painted architecture.
      pathBounds = null;
    } else if ((name === "fill" || name === "stroke") && pathBounds) {
      painted.push({ ...pathBounds });
    } else if (name === "fillRect" || name === "strokeRect") {
      painted.push(includeRect(null, args[0], args[1], args[2], args[3]));
    }
  }
  return painted;
}

const fields = ["terrain", "grass", "water", "mechanical"];
const baseScene = {
  width: 960,
  height: 640,
  W: 960,
  H: 640,
  viewLeft: -120,
  viewTop: -80,
  viewW: 960,
  viewH: 640,
  cameraX: 480,
  cameraY: 320,
  camX: 480,
  camY: 320,
  sectorW: 1600,
  sectorH: 1120,
  sectors: [{ sx: 0, sy: 0, cx: 480, cy: 320 }],
  time: 2.375,
  dpr: 2,
  fighters: [
    { x: 330, y: 336, z: 0, r: 34, radius: 34, team: 1, alpha: 1, types: ["fire"] },
    { x: 625, y: 294, z: 8, r: 38, radius: 38, team: 2, alpha: 0.9, types: ["electric"] }
  ]
};

function sceneOptions(field) {
  return {
    ...baseScene,
    field,
    fieldType: field,
    arenaType: field,
    fighter: baseScene.fighters[0],
    x: baseScene.fighters[0].x,
    y: baseScene.fighters[0].y,
    z: baseScene.fighters[0].z,
    radius: baseScene.fighters[0].radius,
    width: baseScene.width,
    height: baseScene.height
  };
}

function renderScene(field) {
  const options = sceneOptions(field);
  return capture(`${field} HD-2D scene`, context => {
    HD2DRenderer.drawMaterialPass(context, options);
    HD2DRenderer.drawEnvironmentArchitecture(context, options);
    HD2DRenderer.drawFighterCastShadow(context, options);
    HD2DRenderer.drawDynamicEntityLights(context, options);
    HD2DRenderer.drawForegroundFrame(context, options);
    HD2DRenderer.drawScreenGrade(context, options);
  }, 18);
}

// Exercise every exported draw function independently so one function cannot hide
// an unbalanced state stack in another function.
for (const name of REQUIRED_DRAW_FUNCTIONS) {
  // The material atlas is intentionally unavailable in a bare Node process, so
  // that pass may be a safe no-op until an Image has loaded in the browser.
  const minimumOperations = name === "drawMaterialPass" ? 0 : 1;
  capture(name, context => HD2DRenderer[name](context, sceneOptions("terrain")), minimumOperations);
}

const sceneSignatures = Object.fromEntries(fields.map(field => [field, renderScene(field)]));
assert.equal(
  new Set(Object.values(sceneSignatures)).size,
  fields.length,
  "terrain, grass, water, and mechanical HD-2D scenes must have distinct render signatures"
);
for (const field of fields) {
  assert.equal(
    renderScene(field),
    sceneSignatures[field],
    `${field} HD-2D rendering must be deterministic for identical inputs`
  );
}

// Regression coverage for the ultra-wide layouts from the user report. HD-2D
// architecture is background scenery, so it must stay in the upper 28% of the
// visible frame instead of becoming a full-width band through the battle area.
const panoramaViewports = [
  { width: 3238, height: 496 },
  { width: 3246, height: 592 }
];
for (const viewport of panoramaViewports) {
  for (const field of fields) {
    const options = {
      ...sceneOptions(field),
      width: viewport.width,
      height: viewport.height,
      W: viewport.width,
      H: viewport.height,
      viewLeft: 0,
      viewTop: 0,
      viewW: viewport.width,
      viewH: viewport.height,
      viewportW: viewport.width,
      viewportH: viewport.height,
      cameraX: viewport.width * 0.5,
      cameraY: viewport.height * 0.5,
      camX: viewport.width * 0.5,
      camY: viewport.height * 0.5,
      centerX: viewport.width * 0.5,
      centerY: viewport.height * 0.5,
      sectors: [{ sx: 0, sy: 0, cx: viewport.width * 0.5, cy: viewport.height * 0.5 }]
    };
    const operations = captureOperations(
      `${field} ${viewport.width}x${viewport.height} panorama architecture`,
      context => HD2DRenderer.drawEnvironmentArchitecture(context, options),
      1
    );
    const geometry = paintedGeometryBounds(operations);
    assert.ok(geometry.length > 0, `${field} panorama architecture must paint visible geometry`);
    const lowestPaintedY = Math.max(...geometry.map(bounds => bounds.bottom));
    assert.ok(
      lowestPaintedY <= viewport.height * 0.28 + 1,
      `${field} ${viewport.width}x${viewport.height} architecture extends to y=${lowestPaintedY.toFixed(1)}; ` +
        `background scenery must remain above y=${(viewport.height * 0.28).toFixed(1)}`
    );
  }
}

assert.doesNotMatch(rendererSource, /Math\.random\s*\(/, "HD-2D detail must not shimmer randomly between frames");
assert.match(
  rendererSource,
  /Math\.floor\(bounds\.left\s*\/\s*tileSize\)/,
  "material tiles must be anchored to world-space bounds instead of the viewport"
);
assert.doesNotMatch(
  rendererSource,
  /cameraX\s*%\s*320/,
  "parallax must not jump at a modulo seam"
);
assert.doesNotMatch(
  rendererSource,
  /\bctx\.filter\s*=\s*(?:`[^`]*\bblur\s*\(|"[^"]*\bblur\s*\(|'[^']*\bblur\s*\()/,
  "HD-2D Canvas passes must not use per-frame filter blur"
);

const materialStatus = HD2DRenderer.getMaterialStatus();
assert.ok(materialStatus && typeof materialStatus === "object" && !Array.isArray(materialStatus), "material status must be an object");
assert.equal(typeof materialStatus.then, "undefined", "material status must be synchronously inspectable");
for (const key of ["supported", "loaded", "ready", "failed", "loading"]) {
  if (Object.hasOwn(materialStatus, key)) {
    assert.equal(typeof materialStatus[key], "boolean", `material status ${key} must be boolean`);
  }
}
for (const key of ["src", "source", "url"]) {
  if (Object.hasOwn(materialStatus, key) && materialStatus[key] != null) {
    assert.equal(typeof materialStatus[key], "string", `material status ${key} must be a string`);
  }
}
assert.doesNotThrow(() => HD2DRenderer.getMaterialStatus(), "material status must be safe without a browser Image global");

// Browser wiring contracts: helper precedes the engine, smooth environment
// canvases stay below pixel sprites/effects, and the renderer works in logical
// pixels on a capped high-DPI backing store.
assert.match(
  indexSource,
  /arena_rendering\.js[^]*hd2d_rendering\.js[^]*sprite_animator\.js[^]*game\.js/,
  "HD-2D helper must load after arena helpers and before sprite/game code"
);
assert.match(indexSource, /hd2d-material-atlas-v1\.png/, "HD-2D material atlas should be preloaded or referenced by the page");
const preloadAtlasUrl = indexSource.match(/src="([^"]*hd2d-material-atlas-v1\.png[^\"]*)"/)?.[1];
const rendererAtlasUrl = rendererSource.match(/MATERIAL_ATLAS_SRC\s*=\s*"([^"]+)"/)?.[1];
assert.equal(rendererAtlasUrl, preloadAtlasUrl, "preload and renderer must share one cacheable atlas URL");

function cssRule(selectorPattern) {
  const match = styleSource.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`, "s"));
  assert.ok(match, `missing CSS rule for ${selectorPattern}`);
  return match[1];
}

const arenaRule = cssRule("canvas#arenaCanvas");
const fxRule = cssRule("canvas#fxCanvas");
const spriteRule = cssRule("\\.bf-fighter-gif,\\s*\\.bf-ghost-gif,\\s*\\.bf-water-reflection-gif");
assert.match(arenaRule, /image-rendering\s*:\s*auto/, "environment canvas should use smooth high-DPI rendering");
assert.match(fxRule, /image-rendering\s*:\s*auto/, "effect/grade canvas should use smooth high-DPI rendering");
assert.match(spriteRule, /image-rendering\s*:\s*(?:pixelated|crisp-edges)/, "sprite GIFs must remain crisp pixel art");

const arenaZ = Number(arenaRule.match(/z-index\s*:\s*(-?\d+)/)?.[1]);
const spriteZ = Number(cssRule("#battlefield-sprites-layer").match(/z-index\s*:\s*(-?\d+)/)?.[1]);
const attackZ = Number(cssRule("#attack-gif-layer").match(/z-index\s*:\s*(-?\d+)/)?.[1]);
const fxZ = Number(fxRule.match(/z-index\s*:\s*(-?\d+)/)?.[1]);
const hudZ = Number(cssRule("#top-hud").match(/z-index\s*:\s*(-?\d+)/)?.[1]);
assert.ok(
  [arenaZ, spriteZ, attackZ, fxZ, hudZ].every(Number.isFinite),
  "core HD-2D layers must declare numeric z-index values"
);
assert.ok(arenaZ < spriteZ && spriteZ < attackZ && attackZ < fxZ && fxZ < hudZ, "environment, sprites, attacks, FX, and HUD must retain their depth order");

const hd2dDofRuleBodies = Array.from(
  styleSource.matchAll(/(?:\.hd2d-dof-(?:far|near)[^{]*)\{([^}]*)\}/gs),
  match => match[1]
);
assert.ok(hd2dDofRuleBodies.length >= 2, "far and near HD-2D edge-band rules must exist");
for (const body of hd2dDofRuleBodies) {
  assert.doesNotMatch(body, /(?:-webkit-)?backdrop-filter\s*:/, "HD-2D edge bands must not use costly backdrop-filter blur");
}

assert.match(
  gameSource,
  /\b(?:MAX|RENDER|CANVAS)[A-Z0-9_]*PIXEL[A-Z0-9_]*(?:BUDGET|LIMIT|CAP)?\b\s*=/,
  "renderer must define a backing-store pixel budget"
);
assert.match(
  gameSource,
  /Math\.sqrt\s*\(\s*[A-Z0-9_]*PIXEL[A-Z0-9_]*\s*\/\s*Math\.max\s*\(\s*1\s*,\s*(?:width\s*\*\s*height|W\s*\*\s*H)\s*\)\s*\)/,
  "adaptive DPR must derive a safe scale from the pixel budget and viewport area"
);
assert.match(
  gameSource,
  /RENDER_DPR\s*=\s*(?:(?:compute|resolve|calculate|get|choose)[A-Za-z0-9_$]*(?:Dpr|DPR)[A-Za-z0-9_$]*|(?:compute|resolve|calculate|get|choose)(?:Dpr|DPR)[A-Za-z0-9_$]*)\s*\(/,
  "initialization and resize must assign RENDER_DPR through the adaptive DPR resolver"
);
assert.match(gameSource, /setTransform\([^)]*(?:RENDER_DPR|renderDpr|renderDPR)/, "canvas transforms must render in logical pixels at the selected DPR");
assert.match(
  gameSource,
  /viewTop:\s*state\.camY\s*-\s*H\s*\*\s*0\.5/,
  "foreground framing must use the visible viewport rather than padded culling bounds"
);
assert.match(
  gameSource,
  /drawHD2DEnvironmentLayer\("mechanical",\s*1\s*-\s*blend\)[^]*drawHD2DEnvironmentLayer\(state\.fieldTransition\.targetField,\s*blend\)/,
  "field transitions must crossfade the HD-2D environment"
);
for (const name of REQUIRED_DRAW_FUNCTIONS.filter(name => name !== "drawMaterialPass" && name !== "drawScreenGrade")) {
  assert.match(gameSource, new RegExp(`HD2DRenderer\\.${name}\\s*\\(`), `game loop must call ${name}`);
}
const renderStart = gameSource.indexOf("function render()");
const renderEnd = gameSource.indexOf("\nfunction drawGrassField", renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, "game render function must be statically inspectable");
const renderSource = gameSource.slice(renderStart, renderEnd);
assert.doesNotMatch(
  renderSource,
  /HD2DRenderer\.drawMaterialPass\s*\(/,
  "the material atlas must not be redrawn directly on every animation frame"
);
const richFxIndex = gameSource.indexOf("drawRichAttackEffects(fxCtx)");
const foregroundIndex = gameSource.lastIndexOf("HD2DRenderer.drawForegroundFrame(fxCtx");
const damagePopupIndex = gameSource.indexOf("drawDamagePopup(fxCtx");
assert.ok(
  richFxIndex >= 0 && foregroundIndex > richFxIndex && damagePopupIndex > foregroundIndex,
  "near foreground must occlude combat FX while damage labels remain readable"
);

console.log("HD-2D rendering: four deterministic scenes, material safety, DPR, and layer wiring OK");
