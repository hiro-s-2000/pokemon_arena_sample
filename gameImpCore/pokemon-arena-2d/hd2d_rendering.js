// Deterministic HD-2D environment accents for Pokemon Arena 2D.
// This module intentionally has no DOM dependency at load time so it can be tested in Node.
(function initHD2DRenderer(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HD2DRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createHD2DRenderer(root) {
  "use strict";

  const TAU = Math.PI * 2;
  const MATERIAL_ATLAS_SRC = "assets/hd2d/hd2d-material-atlas-v1.png?v=20261019_9";
  const FIELD_NAMES = new Set(["terrain", "grass", "water", "mechanical"]);
  const ATLAS_QUADRANTS = Object.freeze({
    terrain: [0, 0],
    grass: [1, 0],
    water: [0, 1],
    mechanical: [1, 1]
  });
  const FIELD_PALETTES = Object.freeze({
    terrain: { material: "rgba(134, 101, 70, 0.13)", dark: "#211b18", mid: "#59493b", light: "#c7ae86" },
    grass: { material: "rgba(91, 143, 70, 0.11)", dark: "#101e19", mid: "#345d43", light: "#c5d59c" },
    water: { material: "rgba(59, 148, 177, 0.12)", dark: "#0c2531", mid: "#245b6d", light: "#a7e6e6" },
    mechanical: { material: "rgba(109, 139, 155, 0.12)", dark: "#111920", mid: "#374b56", light: "#b8ccd2" }
  });

  let materialImage = null;
  let materialState = "idle";
  let materialError = "";

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeField(value) {
    return FIELD_NAMES.has(value) ? value : "terrain";
  }

  function hashUnit(x, y, salt) {
    let h = Math.imul((x | 0) ^ 0x68bc21eb, 0x45d9f3b);
    h ^= Math.imul((y | 0) ^ 0x02e5be93, 0x27d4eb2d);
    h ^= Math.imul((salt | 0) ^ 0x967a889b, 0x165667b1);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967295;
  }

  function validContext(ctx) {
    return !!ctx && typeof ctx.save === "function" && typeof ctx.restore === "function";
  }

  function addGradientStop(gradient, offset, color) {
    if (gradient && typeof gradient.addColorStop === "function") gradient.addColorStop(offset, color);
  }

  function linearFill(ctx, x0, y0, x1, y1, stops, fallback) {
    if (typeof ctx.createLinearGradient !== "function") {
      ctx.fillStyle = fallback;
      return;
    }
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const stop of stops) addGradientStop(gradient, stop[0], stop[1]);
    ctx.fillStyle = gradient;
  }

  function radialFill(ctx, x0, y0, r0, x1, y1, r1, stops, fallback) {
    if (typeof ctx.createRadialGradient !== "function") {
      ctx.fillStyle = fallback;
      return;
    }
    const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, Math.max(0.01, r1));
    for (const stop of stops) addGradientStop(gradient, stop[0], stop[1]);
    ctx.fillStyle = gradient;
  }

  function pathPolygon(ctx, points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index][0], points[index][1]);
    }
    ctx.closePath();
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(Math.abs(width) * 0.5, Math.abs(height) * 0.5, Math.max(0, radius));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function clipView(ctx, bounds) {
    ctx.beginPath();
    ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.clip();
  }

  function getBounds(options) {
    const width = Math.max(1, number(options && (options.viewW ?? options.width), 1280));
    const height = Math.max(1, number(options && (options.viewH ?? options.height), 720));
    return {
      left: number(options && options.viewLeft, 0),
      top: number(options && options.viewTop, 0),
      width,
      height
    };
  }

  function getSectors(options, bounds) {
    const sectors = options && Array.isArray(options.sectors) ? options.sectors : [];
    if (sectors.length) return sectors;
    return [{
      sx: 0,
      sy: 0,
      cx: bounds.left + bounds.width * 0.5,
      cy: bounds.top + bounds.height * 0.53
    }];
  }

  function getSectorCenter(sector, bounds) {
    return {
      x: number(sector && (sector.cx ?? sector.x), bounds.left + bounds.width * 0.5),
      y: number(sector && (sector.cy ?? sector.y), bounds.top + bounds.height * 0.53),
      sx: number(sector && sector.sx, 0),
      sy: number(sector && sector.sy, 0)
    };
  }

  function isSectorVisible(center, sectorW, sectorH, bounds) {
    return center.x + sectorW * 0.58 >= bounds.left &&
      center.x - sectorW * 0.58 <= bounds.left + bounds.width &&
      center.y + sectorH * 0.58 >= bounds.top &&
      center.y - sectorH * 0.58 <= bounds.top + bounds.height;
  }

  function ensureMaterialImage() {
    if (materialState === "ready") return materialImage;
    if (materialState === "loading" || materialState === "error" || materialState === "unsupported") return null;
    const ImageCtor = root && root.Image;
    if (typeof ImageCtor !== "function") {
      materialState = "unsupported";
      return null;
    }
    materialState = "loading";
    try {
      const image = new ImageCtor();
      if ("decoding" in image) image.decoding = "async";
      image.onload = function onMaterialLoad() {
        materialImage = image;
        materialError = "";
        materialState = "ready";
      };
      image.onerror = function onMaterialError() {
        materialImage = null;
        materialError = "load-failed";
        materialState = "error";
      };
      image.src = MATERIAL_ATLAS_SRC;
      if (image.complete && number(image.naturalWidth, 0) > 0) {
        materialImage = image;
        materialState = "ready";
      }
    } catch (error) {
      materialImage = null;
      materialError = error && error.message ? String(error.message) : "load-failed";
      materialState = "error";
    }
    return materialState === "ready" ? materialImage : null;
  }

  function drawFallbackMaterial(ctx, field, bounds) {
    const palette = FIELD_PALETTES[field];
    ctx.fillStyle = palette.material;
    ctx.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);

    const spacing = Math.max(74, Math.min(138, bounds.width / 10));
    ctx.lineWidth = field === "water" ? 1.35 : 1;
    ctx.strokeStyle = field === "terrain"
      ? "rgba(229, 202, 159, 0.13)"
      : field === "grass"
        ? "rgba(201, 226, 167, 0.11)"
        : field === "water"
          ? "rgba(185, 242, 245, 0.15)"
          : "rgba(186, 217, 224, 0.12)";
    const diagonal = field === "mechanical" || field === "terrain";
    for (let index = -2; index < 12; index += 1) {
      const offset = index * spacing;
      ctx.beginPath();
      if (diagonal) {
        ctx.moveTo(bounds.left + offset, bounds.top);
        ctx.lineTo(bounds.left + offset + bounds.height * 0.23, bounds.top + bounds.height);
      } else {
        const y = bounds.top + ((index + 2) / 14) * bounds.height;
        const wave = field === "water" ? Math.sin(index * 1.73) * 11 : 0;
        ctx.moveTo(bounds.left, y + wave);
        ctx.lineTo(bounds.left + bounds.width, y - wave);
      }
      ctx.stroke();
    }
  }

  function drawMaterialPass(ctx, options) {
    if (!validContext(ctx)) return;
    const opts = options || {};
    const field = normalizeField(opts.fieldType || opts.field || opts.type);
    const bounds = getBounds(opts);
    const alpha = clamp(number(opts.alpha, 0.12), 0, 0.28);
    if (alpha <= 0.005) return;

    ctx.save();
    clipView(ctx, bounds);
    ctx.globalAlpha = alpha * 0.45;
    const palette = FIELD_PALETTES[field];
    ctx.fillStyle = palette.material;
    ctx.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
    ctx.restore();
  }

  function drawRock(ctx, x, y, radius, shade) {
    const ry = radius * 0.64;
    radialFill(ctx, x - radius * 0.22, y - ry * 0.35, radius * 0.08, x, y, radius, [
      [0, shade > 0.5 ? "#9f8970" : "#7b6958"],
      [0.56, shade > 0.5 ? "#66564a" : "#55483f"],
      [1, "#28231f"]
    ], "#55483f");
    ctx.beginPath();
    ctx.ellipse(x, y, radius, ry, -0.15 + shade * 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(210, 187, 151, 0.18)";
    ctx.lineWidth = Math.max(1, radius * 0.045);
    ctx.stroke();
  }

  function drawTerrainArchitecture(ctx, center, sectorW, sectorH, time) {
    const left = center.x - sectorW * 0.52;
    const right = center.x + sectorW * 0.52;
    const ridgeY = center.y - sectorH * 0.49;
    const floorY = center.y - sectorH * 0.31;

    linearFill(ctx, left, ridgeY, left, floorY + 70, [
      [0, "#181514"],
      [0.35, "#362e29"],
      [0.78, "#635448"],
      [1, "rgba(84, 69, 58, 0.24)"]
    ], "#362e29");
    pathPolygon(ctx, [
      [left, floorY + 74],
      [left, ridgeY + 28],
      [left + sectorW * 0.11, ridgeY + 4],
      [left + sectorW * 0.23, ridgeY + 37],
      [left + sectorW * 0.39, ridgeY + 14],
      [left + sectorW * 0.54, ridgeY + 47],
      [left + sectorW * 0.72, ridgeY + 8],
      [right, ridgeY + 31],
      [right, floorY + 74]
    ]);
    ctx.fill();

    ctx.strokeStyle = "rgba(205, 181, 144, 0.18)";
    ctx.lineWidth = 3;
    for (let layer = 0; layer < 4; layer += 1) {
      const y = ridgeY + 42 + layer * sectorH * 0.052;
      ctx.beginPath();
      ctx.moveTo(left + 28, y + Math.sin(layer * 1.8) * 8);
      ctx.bezierCurveTo(
        center.x - sectorW * 0.21, y - 12,
        center.x + sectorW * 0.18, y + 14,
        right - 24, y - 3
      );
      ctx.stroke();
    }

    // A bright opening and two broken shafts suggest a much larger cavern beyond the arena.
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    linearFill(ctx, center.x - 180, ridgeY, center.x + 90, floorY + 210, [
      [0, "rgba(255, 241, 192, 0.20)"],
      [1, "rgba(255, 226, 164, 0)"]
    ], "rgba(255, 235, 186, 0.10)");
    pathPolygon(ctx, [
      [center.x - sectorW * 0.27, ridgeY - 8],
      [center.x - sectorW * 0.13, ridgeY - 8],
      [center.x + sectorW * 0.02, floorY + sectorH * 0.27],
      [center.x - sectorW * 0.15, floorY + sectorH * 0.27]
    ]);
    ctx.fill();
    ctx.globalAlpha = 0.45 + Math.sin(time * 0.45) * 0.03;
    pathPolygon(ctx, [
      [center.x + sectorW * 0.05, ridgeY + 4],
      [center.x + sectorW * 0.13, ridgeY + 4],
      [center.x + sectorW * 0.22, floorY + sectorH * 0.20],
      [center.x + sectorW * 0.13, floorY + sectorH * 0.20]
    ]);
    ctx.fill();
    ctx.restore();

    for (let index = 0; index < 8; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const local = Math.floor(index / 2);
      const shade = hashUnit(center.sx + local, center.sy, 51 + index);
      drawRock(
        ctx,
        center.x + side * (sectorW * (0.34 + local * 0.047)),
        floorY + 45 + local * 24,
        30 + shade * 30,
        shade
      );
    }
  }

  function drawTreeCanopy(ctx, x, y, radius, seed) {
    radialFill(ctx, x - radius * 0.25, y - radius * 0.35, 2, x, y, radius, [
      [0, "rgba(143, 187, 93, 0.86)"],
      [0.48, "rgba(58, 111, 61, 0.94)"],
      [1, "rgba(18, 49, 39, 0.98)"]
    ], "#315e42");
    for (let index = 0; index < 3; index += 1) {
      const angle = seed * 3 + index * 2.1;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(angle) * radius * 0.28,
        y + Math.sin(angle) * radius * 0.19,
        radius * (0.55 - index * 0.05),
        0,
        TAU
      );
      ctx.fill();
    }
  }

  function drawGrassArchitecture(ctx, center, sectorW, sectorH) {
    const left = center.x - sectorW * 0.48;
    const width = sectorW * 0.96;
    const backY = center.y - sectorH * 0.50;
    const standH = sectorH * 0.20;

    // Trees and canopy read as the outdoor world beyond the competition terrace.
    for (let index = 0; index < 7; index += 1) {
      const x = left + (index / 6) * width;
      const radius = 54 + hashUnit(center.sx + index, center.sy, 71) * 40;
      drawTreeCanopy(ctx, x, backY + 20, radius, index + center.sx * 0.3);
    }

    linearFill(ctx, left, backY + 35, left, backY + standH, [
      [0, "#17251f"],
      [0.5, "#33453c"],
      [1, "#111b18"]
    ], "#263a31");
    pathPolygon(ctx, [
      [left, backY + standH],
      [left + sectorW * 0.05, backY + 48],
      [left + width - sectorW * 0.05, backY + 48],
      [left + width, backY + standH]
    ]);
    ctx.fill();

    for (let tier = 0; tier < 3; tier += 1) {
      ctx.fillStyle = tier % 2 === 0 ? "rgba(108, 127, 112, 0.33)" : "rgba(17, 29, 24, 0.62)";
      ctx.fillRect(left + 36 + tier * 20, backY + 72 + tier * 31, width - 72 - tier * 40, 17);
    }
    for (let index = 0; index < 18; index += 1) {
      const row = index % 3;
      const px = left + width * (0.08 + (index / 18) * 0.84);
      const py = backY + 67 + row * 29;
      const hue = ["#d5a85f", "#678ba1", "#9f6969", "#789766"][index % 4];
      ctx.fillStyle = hue;
      ctx.beginPath();
      ctx.arc(px, py, 5.5 + (index % 2), 0, TAU);
      ctx.fill();
    }

    // Pale structural columns give the background real scale without competing with fighters.
    for (const side of [-1, 1]) {
      const x = center.x + side * sectorW * 0.41;
      linearFill(ctx, x - 20, backY + 20, x + 20, backY + 20, [
        [0, "#655f54"],
        [0.5, "#b7ae99"],
        [1, "#514d46"]
      ], "#8f8879");
      ctx.fillRect(x - 17, backY + 20, 34, standH + 22);
      ctx.fillRect(x - 28, backY + 18, 56, 15);
      ctx.fillRect(x - 25, backY + standH + 34, 50, 12);
    }

    // Visible platform thickness turns the flat pitch into a raised diorama stage.
    const rimY = center.y + sectorH * 0.43;
    linearFill(ctx, left + 38, rimY, left + 38, rimY + 38, [
      [0, "rgba(209, 220, 186, 0.78)"],
      [0.22, "rgba(72, 91, 75, 0.90)"],
      [1, "rgba(18, 30, 25, 0.95)"]
    ], "#30443a");
    pathPolygon(ctx, [
      [left + 42, rimY],
      [left + width - 42, rimY],
      [left + width - 70, rimY + 38],
      [left + 70, rimY + 38]
    ]);
    ctx.fill();
  }

  function drawWaterArchitecture(ctx, center, sectorW, sectorH, time) {
    const left = center.x - sectorW * 0.50;
    const width = sectorW;
    const wallY = center.y - sectorH * 0.53;
    const wallH = sectorH * 0.23;

    linearFill(ctx, left, wallY, left, wallY + wallH, [
      [0, "#142c3a"],
      [0.52, "#355c69"],
      [1, "#172e39"]
    ], "#244854");
    ctx.fillRect(left, wallY, width, wallH);

    const windowW = width * 0.18;
    for (let index = 0; index < 4; index += 1) {
      const x = left + width * 0.08 + index * width * 0.235;
      radialFill(ctx, x + windowW * 0.5, wallY + 38, 3, x + windowW * 0.5, wallY + 38, windowW * 0.75, [
        [0, "rgba(197, 245, 244, 0.88)"],
        [0.46, "rgba(77, 180, 198, 0.48)"],
        [1, "rgba(15, 65, 85, 0.12)"]
      ], "rgba(90, 191, 204, 0.42)");
      roundedRect(ctx, x, wallY + 26, windowW, wallH * 0.44, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(189, 224, 222, 0.45)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = "rgba(15, 48, 61, 0.65)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + windowW * 0.5, wallY + 29);
      ctx.lineTo(x + windowW * 0.5, wallY + 26 + wallH * 0.44);
      ctx.stroke();
    }

    // Raised tiled service deck and its submerged face.
    const deckY = center.y - sectorH * 0.30;
    ctx.fillStyle = "rgba(151, 185, 187, 0.85)";
    ctx.fillRect(left + 22, deckY, width - 44, 32);
    linearFill(ctx, left, deckY + 31, left, deckY + 68, [
      [0, "rgba(54, 101, 111, 0.90)"],
      [1, "rgba(14, 50, 64, 0.88)"]
    ], "rgba(27, 68, 79, 0.88)");
    ctx.fillRect(left + 22, deckY + 31, width - 44, 37);
    ctx.strokeStyle = "rgba(215, 236, 229, 0.26)";
    ctx.lineWidth = 2;
    for (let x = left + 70; x < left + width - 30; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, deckY + 2);
      ctx.lineTo(x, deckY + 31);
      ctx.stroke();
    }

    // Planters add the small lived-in details characteristic of a water-gym interior.
    for (const side of [-1, 1]) {
      const x = center.x + side * sectorW * 0.39;
      ctx.fillStyle = "#795c45";
      pathPolygon(ctx, [[x - 22, deckY - 5], [x + 22, deckY - 5], [x + 17, deckY + 25], [x - 17, deckY + 25]]);
      ctx.fill();
      ctx.strokeStyle = "rgba(65, 125, 81, 0.92)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      for (let leaf = -2; leaf <= 2; leaf += 1) {
        ctx.beginPath();
        ctx.moveTo(x, deckY - 4);
        ctx.quadraticCurveTo(x + leaf * 9, deckY - 30 - Math.abs(leaf) * 5, x + leaf * 13, deckY - 45);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.13 + Math.sin(time * 0.8) * 0.015;
    linearFill(ctx, center.x, wallY, center.x, deckY + 240, [
      [0, "rgba(181, 244, 245, 0.80)"],
      [1, "rgba(103, 216, 226, 0)"]
    ], "rgba(150, 231, 235, 0.10)");
    pathPolygon(ctx, [
      [center.x - sectorW * 0.22, wallY + 4],
      [center.x - sectorW * 0.06, wallY + 4],
      [center.x + sectorW * 0.08, deckY + sectorH * 0.34],
      [center.x - sectorW * 0.17, deckY + sectorH * 0.34]
    ]);
    ctx.fill();
    ctx.restore();
  }

  function drawMechanicalArchitecture(ctx, center, sectorW, sectorH, time) {
    const left = center.x - sectorW * 0.51;
    const width = sectorW * 1.02;
    const top = center.y - sectorH * 0.53;
    const wallH = sectorH * 0.25;

    linearFill(ctx, left, top, left, top + wallH, [
      [0, "#111820"],
      [0.48, "#33434d"],
      [1, "#151f26"]
    ], "#26343d");
    ctx.fillRect(left, top, width, wallH);

    for (let index = 0; index < 5; index += 1) {
      const x = left + width * (0.04 + index * 0.205);
      const panelW = width * 0.16;
      roundedRect(ctx, x, top + 34, panelW, wallH * 0.48, 5);
      ctx.fillStyle = index % 2 ? "rgba(23, 38, 47, 0.93)" : "rgba(52, 70, 79, 0.90)";
      ctx.fill();
      ctx.strokeStyle = "rgba(140, 169, 178, 0.36)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = index === 2 ? "rgba(255, 187, 79, 0.75)" : "rgba(91, 210, 194, 0.48)";
      ctx.fillRect(x + 13, top + 49, panelW * 0.42, 5);
      ctx.fillRect(x + 13, top + 62, panelW * 0.28, 4);
    }

    // Heavy gantry, braces, and conduits provide industrial depth behind the arena.
    ctx.strokeStyle = "rgba(13, 20, 25, 0.92)";
    ctx.lineWidth = 22;
    ctx.lineCap = "square";
    ctx.beginPath();
    ctx.moveTo(left + 12, top + 12);
    ctx.lineTo(left + width - 12, top + 12);
    ctx.moveTo(left + 55, top + 12);
    ctx.lineTo(left + 155, top + wallH + 42);
    ctx.moveTo(left + width - 55, top + 12);
    ctx.lineTo(left + width - 155, top + wallH + 42);
    ctx.stroke();
    ctx.strokeStyle = "rgba(112, 141, 151, 0.55)";
    ctx.lineWidth = 5;
    ctx.stroke();

    for (const side of [-1, 1]) {
      const x = center.x + side * sectorW * 0.40;
      ctx.strokeStyle = "rgba(95, 125, 136, 0.72)";
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(x, top + wallH * 0.18);
      ctx.lineTo(x, top + wallH + 76);
      ctx.quadraticCurveTo(x, top + wallH + 97, x - side * 24, top + wallH + 97);
      ctx.stroke();
      ctx.fillStyle = side < 0 ? "rgba(255, 126, 78, 0.76)" : "rgba(92, 224, 205, 0.70)";
      ctx.globalAlpha = 0.70 + Math.sin(time * 2.2 + side) * 0.12;
      ctx.beginPath();
      ctx.arc(x, top + wallH + 96, 8, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawEnvironmentArchitecture(ctx, options) {
    // Disabled: infinite-scrolling battlefields must not render fixed walls,
    // spectator bleachers, or indoor pool windows across the middle of the arena.
    void ctx;
    void options;
  }

  function drawForegroundFrame(ctx, options) {
    // Disabled: removes bottom edge clutter and avoids a full-viewport blur filter pass.
    void ctx;
    void options;
  }

  function drawFighterCastShadow(ctx, options) {
    if (!validContext(ctx)) return;
    const opts = options || {};
    const field = normalizeField(opts.fieldType || opts.field || opts.type);
    const overOpenWater = !!(opts.overOpenWater || opts.onOpenWater || opts.waterContact);
    const airborne = !!opts.airborne || number(opts.z, 0) > number(opts.maxShadowHeight, 120);
    if (opts.hidden || opts.skip || airborne || (field === "water" && overOpenWater && !opts.onPlatform)) return;

    const x = number(opts.x ?? opts.drawX ?? opts.screenX, 0);
    const y = number(opts.groundY ?? opts.y ?? opts.drawY ?? opts.screenY, 0);
    const width = Math.max(14, number(opts.width ?? opts.spriteWidth, 78));
    const height = Math.max(16, number(opts.height ?? opts.spriteHeight, width));
    const altitude = clamp(number(opts.z, 0), 0, 120);
    const alpha = clamp(number(opts.alpha, 0.42) * (1 - altitude / 165), 0, 0.52);
    const stretch = clamp(number(opts.stretch, 1), 0.65, 1.5);

    // Long diagonal HD-2D cast shadow away from the upper-left sun (matches images.jpeg, images1.jpeg, images2.jpeg)
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + width * 0.28, y + height * 0.045);
    ctx.rotate(0.21);
    const rx = width * 0.58 * stretch;
    const ry = Math.max(5, width * 0.155);
    linearFill(ctx, -rx, 0, rx, 0, [
      [0, field === "terrain" ? "rgba(18, 12, 8, 0.82)" : "rgba(6, 12, 18, 0.78)"],
      [0.55, field === "terrain" ? "rgba(22, 15, 10, 0.48)" : "rgba(8, 16, 24, 0.45)"],
      [1, "rgba(10, 14, 18, 0.06)"]
    ], "rgba(14, 12, 10, 0.48)");
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  const TYPE_LIGHTS = Object.freeze({
    fire: [255, 132, 56],
    electric: [255, 228, 84],
    ice: [152, 236, 255],
    water: [78, 188, 255],
    psychic: [248, 114, 226],
    ghost: [168, 120, 236],
    fairy: [255, 174, 228],
    dragon: [122, 134, 255]
  });

  function resolveEntityTypes(entity) {
    if (!entity) return [];
    if (Array.isArray(entity.types)) return entity.types;
    if (Array.isArray(entity.type)) return entity.type;
    if (typeof entity.type === "string") return [entity.type];
    if (entity.pokemon && Array.isArray(entity.pokemon.types)) return entity.pokemon.types;
    return [];
  }

  function drawDynamicEntityLights(ctx, options) {
    if (!validContext(ctx)) return;
    const opts = options || {};
    const entities = Array.isArray(opts.fighters)
      ? opts.fighters
      : Array.isArray(opts.entities)
        ? opts.entities
        : [];
    const intensity = clamp(number(opts.intensity, 1), 0, 1.5);
    if (!entities.length || intensity <= 0) return;

    ctx.save();
    const limit = Math.min(6, entities.length);
    for (let index = 0; index < limit; index += 1) {
      const entity = entities[index];
      if (!entity || entity.hidden || entity.dead || number(entity.alpha, 1) <= 0) continue;
      const type = resolveEntityTypes(entity).find(value => TYPE_LIGHTS[String(value).toLowerCase()]);
      if (!type) continue;
      const rgb = TYPE_LIGHTS[String(type).toLowerCase()];
      const x = number(entity.lightX ?? entity.drawX ?? entity.screenX ?? entity.x, 0);
      const y = number(entity.lightY ?? entity.drawY ?? entity.screenY ?? entity.y, 0) - number(entity.z, 0) - number(entity.height, 72) * 0.22;
      const radius = clamp(number(entity.lightRadius, number(entity.width, 72) * 0.92), 38, 118);
      const alpha = clamp(number(entity.lightAlpha, 0.14) * intensity * number(entity.alpha, 1), 0, 0.22);
      radialFill(ctx, x, y, 2, x, y, radius, [
        [0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`],
        [0.5, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.38})`],
        [1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`]
      ], `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha * 0.2})`);
      ctx.beginPath();
      ctx.ellipse(x, y, radius, radius * 0.68, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScreenGrade(ctx, options) {
    if (!validContext(ctx)) return;
    const opts = options || {};
    const field = normalizeField(opts.fieldType || opts.field || opts.type);
    const width = Math.max(1, number(opts.width ?? opts.viewW, 1280));
    const height = Math.max(1, number(opts.height ?? opts.viewH, 720));
    const time = number(opts.time, 0);
    const intensity = clamp(number(opts.intensity, 1), 0, 1.5);
    if (intensity <= 0) return;

    ctx.save();
    ctx.globalAlpha = intensity;

    // 1. Soft Upper-Left HD-2D Sunlight Bloom (matches images.jpeg, images2.jpeg, images4.jpeg)
    const sunRadius = Math.max(width, height) * 0.56;
    const sunColor = field === "water"
      ? ["rgba(210, 250, 255, 0.16)", "rgba(145, 230, 250, 0.06)"]
      : field === "grass"
        ? ["rgba(255, 248, 200, 0.18)", "rgba(255, 238, 168, 0.06)"]
        : ["rgba(255, 236, 188, 0.20)", "rgba(245, 205, 140, 0.07)"];
    radialFill(ctx, width * 0.08, height * 0.06, 8, width * 0.12, height * 0.10, sunRadius, [
      [0, sunColor[0]],
      [0.48, sunColor[1]],
      [1, "rgba(255, 240, 200, 0)"]
    ], "rgba(255, 240, 200, 0.05)");
    ctx.fillRect(0, 0, width * 0.72, height * 0.72);

    // 2. Floating HD-2D Sunlit Dust Motes / Water Sparkles
    const moteCount = field === "mechanical" ? 6 : 14;
    for (let index = 0; index < moteCount; index += 1) {
      const seedX = hashUnit(index, field.length, 301);
      const seedY = hashUnit(index, field.length, 302);
      const x = (seedX * width + Math.sin(time * 0.28 + index * 1.7) * 18 + width) % width;
      const y = (seedY * height + (time * (field === "water" ? -6.5 : -4.2)) + height * 16) % height;
      const pulse = 0.55 + 0.45 * Math.sin(time * 2.1 + index * 1.9);
      const r = (1.1 + hashUnit(index, 3, 303) * 1.8) * pulse;

      ctx.fillStyle = field === "water"
        ? `rgba(195, 250, 255, ${(0.28 * pulse).toFixed(3)})`
        : `rgba(255, 242, 196, ${(0.26 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.1, 0, TAU);
      ctx.fill();

      ctx.fillStyle = field === "water" ? "rgba(240, 255, 255, 0.78)" : "rgba(255, 252, 232, 0.78)";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.85, 0, TAU);
      ctx.fill();
    }

    // 3. Cinematic HD-2D Diorama Vignette (frames the arena like Octopath / images.jpeg & images4.jpeg)
    radialFill(
      ctx,
      width * 0.5,
      height * 0.48,
      Math.min(width, height) * 0.28,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.74,
      [
        [0, "rgba(0, 0, 0, 0)"],
        [0.64, "rgba(0, 0, 0, 0)"],
        [0.85, "rgba(6, 10, 16, 0.18)"],
        [1, "rgba(3, 6, 11, 0.46)"]
      ],
      "rgba(4, 7, 12, 0.12)"
    );
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function getMaterialStatus() {
    return {
      state: materialState,
      src: MATERIAL_ATLAS_SRC,
      supported: !!(root && typeof root.Image === "function"),
      ready: materialState === "ready",
      width: materialImage ? number(materialImage.naturalWidth || materialImage.width, 0) : 0,
      height: materialImage ? number(materialImage.naturalHeight || materialImage.height, 0) : 0,
      error: materialError
    };
  }

  return Object.freeze({
    drawMaterialPass,
    drawEnvironmentArchitecture,
    drawForegroundFrame,
    drawFighterCastShadow,
    drawDynamicEntityLights,
    drawScreenGrade,
    getMaterialStatus
  });
});
