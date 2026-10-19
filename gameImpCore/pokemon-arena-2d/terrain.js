// Deterministic terraced battlefield helpers.
//
// The module is intentionally independent from game.js so it can be required by
// Node-based checks as well as loaded directly by a browser <script> tag.
(function initTerracedBattlefield(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.createTerracedSector = api.createTerracedSector;
    root.getTerracedHeightAt = api.getTerracedHeightAt;
    root.drawTerracedBattlefield = api.drawTerracedBattlefield;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createTerracedBattlefieldApi() {
  "use strict";

  const TERRACE_HEIGHTS = Object.freeze([0, 18, 36, 52]);
  const TWO_PI = Math.PI * 2;
  const DEFAULT_VIEW_MARGIN = 120;

  const TOP_PALETTES = Object.freeze([
    Object.freeze({ top: "#806342", light: "#ad8959", shade: "#614a34", edge: "#241913", rim: "#c29a64", detail: "#967550" }),
    Object.freeze({ top: "#896a46", light: "#b99460", shade: "#674d35", edge: "#291c15", rim: "#cba56b", detail: "#9f7d54" }),
    Object.freeze({ top: "#92714a", light: "#c29c66", shade: "#6f5337", edge: "#2d1e15", rim: "#d4ae72", detail: "#aa865a" })
  ]);
  const SIDE_PALETTES = Object.freeze([
    Object.freeze(["#4a3324", "#38261d", "#563b28", "#2f211a"]),
    Object.freeze(["#523724", "#3e2a1d", "#5d402a", "#34231a"]),
    Object.freeze(["#5b3c26", "#452d1e", "#65452c", "#39251a"])
  ]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function smoothstep(amount) {
    const t = clamp(amount, 0, 1);
    return t * t * (3 - 2 * t);
  }

  // Fast, stable 32-bit coordinate hash. It is used instead of Math.random so
  // the same sector is visually identical on every frame and every reload.
  function hashUnit(x, y, salt) {
    let h = Math.imul((x | 0) ^ 0x51f15e5d, 0x45d9f3b);
    h ^= Math.imul((y | 0) ^ 0x119de1f3, 0x27d4eb2d);
    h ^= Math.imul((salt | 0) ^ 0x3449f5d1, 0x165667b1);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function seededRange(sx, sy, salt, min, max) {
    return lerp(min, max, hashUnit(sx, sy, salt));
  }

  function terraceBoundaryFactor(terrace, localAngle) {
    return (
      1 +
      Math.sin(localAngle * 3 + terrace.phaseA) * terrace.roughness +
      Math.sin(localAngle * 7 + terrace.phaseB) * terrace.roughness * 0.52 +
      Math.cos(localAngle * 11 + terrace.phaseC) * terrace.roughness * 0.24
    );
  }

  function pointOnTerraceBoundary(terrace, localAngle) {
    const factor = terraceBoundaryFactor(terrace, localAngle);
    const localX = Math.cos(localAngle) * terrace.rx * factor;
    const localY = Math.sin(localAngle) * terrace.ry * factor;
    const cos = Math.cos(terrace.rotation);
    const sin = Math.sin(terrace.rotation);
    return {
      x: terrace.x + localX * cos - localY * sin,
      y: terrace.y + localX * sin + localY * cos
    };
  }

  function buildTerraceVertices(terrace, count) {
    const points = [];
    for (let index = 0; index < count; index += 1) {
      points.push(pointOnTerraceBoundary(terrace, (index / count) * TWO_PI));
    }
    return points;
  }

  function makeTerrace(options) {
    const terrace = {
      id: options.id,
      level: options.level,
      x: options.x,
      y: options.y,
      rx: options.rx,
      ry: options.ry,
      rotation: options.rotation,
      lowerHeight: options.lowerHeight,
      height: options.height,
      roughness: options.roughness,
      phaseA: options.phaseA,
      phaseB: options.phaseB,
      phaseC: options.phaseC,
      ramps: []
    };
    terrace.vertices = buildTerraceVertices(terrace, 48);
    return terrace;
  }

  function ellipseRadiusAtWorldAngle(terrace, worldAngle) {
    const localAngle = worldAngle - terrace.rotation;
    const cos = Math.cos(localAngle);
    const sin = Math.sin(localAngle);
    const ellipseRadius = 1 / Math.sqrt(
      (cos * cos) / (terrace.rx * terrace.rx) +
      (sin * sin) / (terrace.ry * terrace.ry)
    );
    return ellipseRadius * terraceBoundaryFactor(terrace, localAngle);
  }

  function makeRamp(id, terrace, worldAngle, width, depth, kind, steps) {
    const boundaryRadius = ellipseRadiusAtWorldAngle(terrace, worldAngle);
    const cos = Math.cos(worldAngle);
    const sin = Math.sin(worldAngle);
    return {
      id,
      level: terrace.level,
      kind,
      steps,
      width,
      fromHeight: terrace.lowerHeight,
      toHeight: terrace.height,
      x1: terrace.x + cos * (boundaryRadius + depth * 0.5),
      y1: terrace.y + sin * (boundaryRadius + depth * 0.5),
      x2: terrace.x + cos * (boundaryRadius - depth * 0.5),
      y2: terrace.y + sin * (boundaryRadius - depth * 0.5)
    };
  }

  function pointInTerrace(terrace, x, y) {
    const dx = x - terrace.x;
    const dy = y - terrace.y;
    const cos = Math.cos(-terrace.rotation);
    const sin = Math.sin(-terrace.rotation);
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;
    const localAngle = Math.atan2(localY / terrace.ry, localX / terrace.rx);
    const normalizedRadius = Math.hypot(localX / terrace.rx, localY / terrace.ry);
    return normalizedRadius <= terraceBoundaryFactor(terrace, localAngle);
  }

  function rampPositionAt(ramp, x, y) {
    const dx = ramp.x2 - ramp.x1;
    const dy = ramp.y2 - ramp.y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0.0001) return null;

    const amount = ((x - ramp.x1) * dx + (y - ramp.y1) * dy) / lengthSq;
    if (amount < 0 || amount > 1) return null;

    const nearestX = ramp.x1 + dx * amount;
    const nearestY = ramp.y1 + dy * amount;
    if (Math.hypot(x - nearestX, y - nearestY) > ramp.width * 0.5) return null;
    return amount;
  }

  function collectTerrainParts(input) {
    const terraces = [];
    const ramps = [];
    const seenTerraces = new Set();
    const seenRamps = new Set();

    function addRamp(ramp) {
      if (!ramp || seenRamps.has(ramp)) return;
      seenRamps.add(ramp);
      ramps.push(ramp);
    }

    function addTerrace(terrace) {
      if (!terrace || seenTerraces.has(terrace)) return;
      seenTerraces.add(terrace);
      terraces.push(terrace);
      if (Array.isArray(terrace.ramps)) terrace.ramps.forEach(addRamp);
    }

    function visit(item) {
      if (!item) return;
      if (Array.isArray(item)) {
        item.forEach(visit);
      } else if (Array.isArray(item.terraces)) {
        item.terraces.forEach(addTerrace);
        if (Array.isArray(item.ramps)) item.ramps.forEach(addRamp);
      } else if (Number.isFinite(item.height) && Number.isFinite(item.rx)) {
        addTerrace(item);
      }
    }

    visit(input);
    return { terraces, ramps };
  }

  /**
   * Build one deterministic 1,600 x 1,120-compatible terrain sector.
   * The returned object is plain data and safe to cache inside a sector map.
   */
  function createTerracedSector(sx, sy, cx, cy) {
    const sectorX = Number.isFinite(Number(sx)) ? Math.trunc(Number(sx)) : 0;
    const sectorY = Number.isFinite(Number(sy)) ? Math.trunc(Number(sy)) : 0;
    const centerX = Number.isFinite(Number(cx)) ? Number(cx) : sectorX * 1600;
    const centerY = Number.isFinite(Number(cy)) ? Number(cy) : sectorY * 1120;
    const driftX = seededRange(sectorX, sectorY, 1, -28, 28);
    const driftY = seededRange(sectorX, sectorY, 2, -20, 20);
    const rotation = seededRange(sectorX, sectorY, 3, -0.055, 0.055);

    const outer = makeTerrace({
      id: `${sectorX},${sectorY}:terrace-1`,
      level: 1,
      x: centerX + driftX,
      y: centerY + driftY,
      rx: seededRange(sectorX, sectorY, 4, 584, 618),
      ry: seededRange(sectorX, sectorY, 5, 372, 398),
      rotation,
      lowerHeight: TERRACE_HEIGHTS[0],
      height: TERRACE_HEIGHTS[1],
      roughness: seededRange(sectorX, sectorY, 6, 0.026, 0.042),
      phaseA: seededRange(sectorX, sectorY, 7, 0, TWO_PI),
      phaseB: seededRange(sectorX, sectorY, 8, 0, TWO_PI),
      phaseC: seededRange(sectorX, sectorY, 9, 0, TWO_PI)
    });

    const middle = makeTerrace({
      id: `${sectorX},${sectorY}:terrace-2`,
      level: 2,
      x: outer.x + seededRange(sectorX, sectorY, 10, -24, 24),
      y: outer.y + seededRange(sectorX, sectorY, 11, -18, 18),
      rx: seededRange(sectorX, sectorY, 12, 398, 432),
      ry: seededRange(sectorX, sectorY, 13, 248, 276),
      rotation: rotation + seededRange(sectorX, sectorY, 14, -0.045, 0.045),
      lowerHeight: TERRACE_HEIGHTS[1],
      height: TERRACE_HEIGHTS[2],
      roughness: seededRange(sectorX, sectorY, 15, 0.024, 0.038),
      phaseA: seededRange(sectorX, sectorY, 16, 0, TWO_PI),
      phaseB: seededRange(sectorX, sectorY, 17, 0, TWO_PI),
      phaseC: seededRange(sectorX, sectorY, 18, 0, TWO_PI)
    });

    const crown = makeTerrace({
      id: `${sectorX},${sectorY}:terrace-3`,
      level: 3,
      x: middle.x + seededRange(sectorX, sectorY, 19, -18, 18),
      y: middle.y + seededRange(sectorX, sectorY, 20, -13, 13),
      rx: seededRange(sectorX, sectorY, 21, 224, 252),
      ry: seededRange(sectorX, sectorY, 22, 142, 164),
      rotation: middle.rotation + seededRange(sectorX, sectorY, 23, -0.05, 0.05),
      lowerHeight: TERRACE_HEIGHTS[2],
      height: TERRACE_HEIGHTS[3],
      roughness: seededRange(sectorX, sectorY, 24, 0.021, 0.034),
      phaseA: seededRange(sectorX, sectorY, 25, 0, TWO_PI),
      phaseB: seededRange(sectorX, sectorY, 26, 0, TWO_PI),
      phaseC: seededRange(sectorX, sectorY, 27, 0, TWO_PI)
    });

    const angleOffset = seededRange(sectorX, sectorY, 28, -0.11, 0.11);
    const ramps = [
      makeRamp(`${sectorX},${sectorY}:approach`, outer, Math.PI * 0.23 + angleOffset, 132, 184, "stairs", 6),
      makeRamp(`${sectorX},${sectorY}:middle-slope`, middle, Math.PI * 1.14 - angleOffset, 112, 152, "slope", 5),
      makeRamp(`${sectorX},${sectorY}:crown-steps`, crown, Math.PI * 0.67 + angleOffset * 0.6, 92, 126, "stairs", 5)
    ];

    const terraces = [outer, middle, crown];
    terraces.forEach((terrace, index) => terrace.ramps.push(ramps[index]));

    const sector = {
      sx: sectorX,
      sy: sectorY,
      cx: centerX,
      cy: centerY,
      seed: Math.floor(hashUnit(sectorX, sectorY, 90) * 0xffffffff) >>> 0,
      heights: TERRACE_HEIGHTS.slice(),
      terraces,
      ramps,
      bounds: {
        left: centerX - 760,
        right: centerX + 760,
        top: centerY - 535,
        bottom: centerY + 535
      },
      details: []
    };

    // Store a sparse set of deterministic arena scars and stones once during
    // sector creation. Rejection keeps them on a terrace top and clear of the
    // three walkable approaches.
    for (let index = 0; index < 36; index += 1) {
      const target = terraces[index % terraces.length];
      const detailSalt = 100 + index * 6;
      const angle = seededRange(sectorX, sectorY, detailSalt, 0, TWO_PI);
      const radius = Math.sqrt(seededRange(sectorX, sectorY, detailSalt + 1, 0.06, 0.82));
      const localX = Math.cos(angle) * target.rx * radius;
      const localY = Math.sin(angle) * target.ry * radius;
      const cos = Math.cos(target.rotation);
      const sin = Math.sin(target.rotation);
      const x = target.x + localX * cos - localY * sin;
      const y = target.y + localX * sin + localY * cos;
      const blockedByRamp = ramps.some(ramp => rampPositionAt(ramp, x, y) !== null);
      if (!blockedByRamp) {
        const kindRoll = hashUnit(sectorX, sectorY, detailSalt + 2);
        sector.details.push({
          x,
          y,
          height: target.height,
          kind: kindRoll > 0.88
            ? "boulder"
            : kindRoll > 0.75
              ? "crater"
              : kindRoll > 0.42
                ? "stone"
                : "scrape",
          scale: seededRange(sectorX, sectorY, detailSalt + 3, 0.72, 1.24),
          rotation: seededRange(sectorX, sectorY, detailSalt + 4, -Math.PI, Math.PI),
          variant: Math.floor(seededRange(sectorX, sectorY, detailSalt + 5, 0, 4))
        });
      }
    }

    return sector;
  }

  /**
   * Resolve absolute terrain elevation at a world-space point.
   * `terraces` may be one sector, an array of sectors, or an array of terrace
   * objects. Passing whole sectors preserves their ramp data.
   */
  function getTerracedHeightAt(terraces, x, y) {
    const worldX = Number(x);
    const worldY = Number(y);
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return 0;

    const parts = collectTerrainParts(terraces);
    let height = TERRACE_HEIGHTS[0];
    for (const terrace of parts.terraces) {
      if (terrace.height > height && pointInTerrace(terrace, worldX, worldY)) {
        height = terrace.height;
      }
    }

    let selectedRamp = null;
    let selectedAmount = 0;
    for (const ramp of parts.ramps) {
      const amount = rampPositionAt(ramp, worldX, worldY);
      if (amount === null) continue;
      if (!selectedRamp || ramp.toHeight > selectedRamp.toHeight) {
        selectedRamp = ramp;
        selectedAmount = amount;
      }
    }

    if (selectedRamp) {
      const amount = selectedRamp.kind === "stairs"
        ? Math.round(smoothstep(selectedAmount) * selectedRamp.steps) / selectedRamp.steps
        : smoothstep(selectedAmount);
      return lerp(selectedRamp.fromHeight, selectedRamp.toHeight, amount);
    }

    return height;
  }

  function tracePolygon(ctx, points, elevation) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y - elevation);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y - elevation);
    }
    ctx.closePath();
  }

  function drawBaseTexture(ctx, viewLeft, viewTop, viewW, viewH) {
    const cell = 128;
    const startX = Math.floor(viewLeft / cell) * cell;
    const startY = Math.floor(viewTop / cell) * cell;
    const endX = viewLeft + viewW + cell;
    const endY = viewTop + viewH + cell;

    for (let y = startY; y < endY; y += cell) {
      for (let x = startX; x < endX; x += cell) {
        const gridX = Math.floor(x / cell);
        const gridY = Math.floor(y / cell);
        const offsetX = hashUnit(gridX, gridY, 701) * 42 + 11;
        const offsetY = hashUnit(gridX, gridY, 702) * 40 + 12;
        const patchRoll = hashUnit(gridX, gridY, 703);

        // Broad, blocky stains keep the surface from reading as a flat fill.
        if (patchRoll > 0.48) {
          const patchWidth = 16 + Math.floor(hashUnit(gridX, gridY, 704) * 26);
          const patchHeight = 8 + Math.floor(hashUnit(gridX, gridY, 705) * 15);
          ctx.fillStyle = patchRoll > 0.78
            ? "rgba(70,45,29,0.16)"
            : "rgba(177,137,84,0.10)";
          ctx.beginPath();
          ctx.moveTo(x + offsetX - patchWidth * 0.5, y + offsetY);
          ctx.lineTo(x + offsetX - patchWidth * 0.2, y + offsetY - patchHeight * 0.55);
          ctx.lineTo(x + offsetX + patchWidth * 0.42, y + offsetY - patchHeight * 0.34);
          ctx.lineTo(x + offsetX + patchWidth * 0.5, y + offsetY + patchHeight * 0.34);
          ctx.lineTo(x + offsetX - patchWidth * 0.28, y + offsetY + patchHeight * 0.48);
          ctx.closePath();
          ctx.fill();
        }

        // Square grit and short straw marks echo the hard-edged pixel texture
        // of the reference arena without introducing frame noise.
        const gritSize = hashUnit(gridX, gridY, 706) > 0.74 ? 3 : 2;
        ctx.fillStyle = hashUnit(gridX, gridY, 707) > 0.52
          ? "rgba(211,169,103,0.34)"
          : "rgba(58,39,28,0.34)";
        ctx.fillRect(Math.round(x + offsetX), Math.round(y + offsetY), gritSize + 2, gritSize);

        if (hashUnit(gridX, gridY, 708) > 0.79) {
          ctx.strokeStyle = "rgba(53,34,25,0.48)";
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(Math.round(x + offsetX - 7), Math.round(y + offsetY + 9));
          ctx.lineTo(Math.round(x + offsetX - 1), Math.round(y + offsetY + 5));
          ctx.lineTo(Math.round(x + offsetX + 4), Math.round(y + offsetY + 7));
          ctx.lineTo(Math.round(x + offsetX + 9), Math.round(y + offsetY + 2));
          ctx.stroke();
        }
      }
    }
  }

  function drawTerraceShadow(ctx, terrace) {
    // Two crisp shadow passes ground the platforms without a soft browser
    // filter, keeping the result stable in the test recording context.
    tracePolygon(ctx, terrace.vertices, terrace.lowerHeight - 11);
    ctx.fillStyle = "rgba(28,18,14,0.27)";
    ctx.fill();
    tracePolygon(ctx, terrace.vertices, terrace.lowerHeight - 5);
    ctx.fillStyle = "rgba(35,22,16,0.22)";
    ctx.fill();
  }

  function drawBrokenLine(ctx, x1, y1, x2, y2, pieces, seed, color, width) {
    for (let index = 0; index < pieces; index += 1) {
      if (hashUnit(seed, index, 840) < 0.25) continue;
      const from = index / pieces + seededRange(seed, index, 841, 0.01, 0.045) / pieces;
      const to = (index + seededRange(seed, index, 842, 0.58, 0.9)) / pieces;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * seededRange(seed, index, 843, 0.68, 1.04);
      ctx.beginPath();
      ctx.moveTo(lerp(x1, x2, from), lerp(y1, y2, from));
      ctx.lineTo(lerp(x1, x2, to), lerp(y1, y2, to));
      ctx.stroke();
    }
  }

  function drawBrokenEllipse(ctx, rx, ry, segments, seed, color, width) {
    for (let index = 0; index < segments; index += 1) {
      if (hashUnit(seed, index, 851) < 0.23) continue;
      const start = (index / segments) * TWO_PI;
      const end = ((index + seededRange(seed, index, 852, 0.56, 0.91)) / segments) * TWO_PI;
      const middle = (start + end) * 0.5;
      const radiusWear = seededRange(seed, index, 853, 0.985, 1.015);
      ctx.strokeStyle = color;
      ctx.lineWidth = width * seededRange(seed, index, 854, 0.66, 1.08);
      ctx.beginPath();
      ctx.moveTo(Math.cos(start) * rx, Math.sin(start) * ry);
      ctx.quadraticCurveTo(
        Math.cos(middle) * rx * radiusWear,
        Math.sin(middle) * ry * radiusWear,
        Math.cos(end) * rx,
        Math.sin(end) * ry
      );
      ctx.stroke();
    }
  }

  function drawWornArenaMarkings(ctx, terrace) {
    const seed = Math.round(terrace.x * 0.17 + terrace.y * 0.11) + terrace.level * 97;
    const shadowColor = "rgba(67,45,30,0.34)";
    const chalkColor = "rgba(239,220,174,0.53)";

    ctx.save();
    ctx.translate(terrace.x, terrace.y - terrace.height);
    ctx.rotate(terrace.rotation);
    ctx.lineCap = "butt";

    if (terrace.level === 1) {
      const halfW = terrace.rx * 0.63;
      const halfH = terrace.ry * 0.48;
      const lines = [
        [-halfW, -halfH, halfW, -halfH],
        [halfW, -halfH, halfW, halfH],
        [halfW, halfH, -halfW, halfH],
        [-halfW, halfH, -halfW, -halfH]
      ];
      lines.forEach((line, index) => {
        drawBrokenLine(ctx, line[0] + 1, line[1] + 2, line[2] + 1, line[3] + 2, 11, seed + index, shadowColor, 5);
        drawBrokenLine(ctx, line[0], line[1], line[2], line[3], 11, seed + index, chalkColor, 2.4);
      });
    } else if (terrace.level === 2) {
      drawBrokenEllipse(ctx, terrace.rx * 0.67, terrace.ry * 0.58, 30, seed, shadowColor, 5);
      drawBrokenEllipse(ctx, terrace.rx * 0.67, terrace.ry * 0.58, 30, seed, chalkColor, 2.25);
      drawBrokenLine(ctx, -terrace.rx * 0.42, 1.5, terrace.rx * 0.42, 1.5, 10, seed + 1, shadowColor, 4.5);
      drawBrokenLine(ctx, -terrace.rx * 0.42, 0, terrace.rx * 0.42, 0, 10, seed + 1, chalkColor, 2);
    } else {
      const ringRadius = Math.min(terrace.rx, terrace.ry) * 0.45;
      drawBrokenEllipse(ctx, ringRadius, ringRadius * 0.74, 20, seed, shadowColor, 4.5);
      drawBrokenEllipse(ctx, ringRadius, ringRadius * 0.74, 20, seed, chalkColor, 2.2);
      drawBrokenLine(ctx, -ringRadius * 0.7, 1.5, ringRadius * 0.7, 1.5, 7, seed + 2, shadowColor, 4.2);
      drawBrokenLine(ctx, -ringRadius * 0.7, 0, ringRadius * 0.7, 0, 7, seed + 2, chalkColor, 1.9);
    }

    ctx.restore();
  }

  function drawTerraceSurfaceTexture(ctx, terrace) {
    const seedX = Math.round(terrace.x / 24);
    const seedY = Math.round(terrace.y / 24);

    ctx.save();
    tracePolygon(ctx, terrace.vertices, terrace.height);
    ctx.clip();

    // Irregular compacted-earth patches, clipped to the walkable top.
    for (let index = 0; index < 22; index += 1) {
      const angle = seededRange(seedX, seedY, 900 + index * 5, 0, TWO_PI);
      const radius = Math.sqrt(seededRange(seedX, seedY, 901 + index * 5, 0.04, 0.8));
      const localX = Math.cos(angle) * terrace.rx * radius;
      const localY = Math.sin(angle) * terrace.ry * radius;
      const cos = Math.cos(terrace.rotation);
      const sin = Math.sin(terrace.rotation);
      const x = terrace.x + localX * cos - localY * sin;
      const y = terrace.y - terrace.height + localX * sin + localY * cos;
      const patchW = seededRange(seedX, seedY, 902 + index * 5, 8, 35);
      const patchH = seededRange(seedX, seedY, 903 + index * 5, 4, 17);
      const dark = hashUnit(seedX, seedY, 904 + index * 5) > 0.47;

      ctx.fillStyle = dark ? "rgba(70,43,27,0.15)" : "rgba(204,157,94,0.10)";
      ctx.beginPath();
      ctx.moveTo(Math.round(x - patchW * 0.55), Math.round(y));
      ctx.lineTo(Math.round(x - patchW * 0.22), Math.round(y - patchH * 0.55));
      ctx.lineTo(Math.round(x + patchW * 0.42), Math.round(y - patchH * 0.36));
      ctx.lineTo(Math.round(x + patchW * 0.53), Math.round(y + patchH * 0.28));
      ctx.lineTo(Math.round(x - patchW * 0.3), Math.round(y + patchH * 0.48));
      ctx.closePath();
      ctx.fill();

      if (index % 3 === 0) {
        ctx.fillStyle = dark ? "rgba(47,31,23,0.38)" : "rgba(220,175,108,0.35)";
        ctx.fillRect(Math.round(x + patchW * 0.22), Math.round(y - 1), 3 + (index % 4), 2);
      }
    }

    // Handful of readable, branched cracks. Each is seeded from the platform
    // coordinates and therefore remains identical on every render.
    for (let crack = 0; crack < 4; crack += 1) {
      const angle = seededRange(seedX, seedY, 1100 + crack * 8, 0, TWO_PI);
      const radius = seededRange(seedX, seedY, 1101 + crack * 8, 0.24, 0.68);
      const localX = Math.cos(angle) * terrace.rx * radius;
      const localY = Math.sin(angle) * terrace.ry * radius;
      const cos = Math.cos(terrace.rotation);
      const sin = Math.sin(terrace.rotation);
      let x = terrace.x + localX * cos - localY * sin;
      let y = terrace.y - terrace.height + localX * sin + localY * cos;
      const direction = seededRange(seedX, seedY, 1102 + crack * 8, -Math.PI, Math.PI);

      ctx.strokeStyle = "rgba(49,30,22,0.68)";
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.moveTo(Math.round(x), Math.round(y));
      for (let part = 0; part < 5; part += 1) {
        const partAngle = direction + seededRange(seedX + crack, seedY + part, 1103, -0.5, 0.5);
        const length = seededRange(seedX + crack, seedY + part, 1104, 7, 14);
        x += Math.cos(partAngle) * length;
        y += Math.sin(partAngle) * length * 0.58;
        ctx.lineTo(Math.round(x), Math.round(y));
      }
      ctx.stroke();

      if (crack % 2 === 0) {
        ctx.strokeStyle = "rgba(60,38,26,0.48)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x - 8), Math.round(y - 3));
        ctx.lineTo(Math.round(x - 2), Math.round(y));
        ctx.lineTo(Math.round(x + 2), Math.round(y + 8));
        ctx.stroke();
      }
    }

    // Warm directional sunlight patch across the center of the terrace (matches images.jpeg window light on floor)
    if (typeof ctx.createRadialGradient === "function") {
      const sunGrad = ctx.createRadialGradient(
        terrace.x - terrace.rx * 0.12,
        terrace.y - terrace.height - terrace.ry * 0.08,
        terrace.rx * 0.05,
        terrace.x + terrace.rx * 0.05,
        terrace.y - terrace.height + terrace.ry * 0.06,
        terrace.rx * 0.68
      );
      sunGrad.addColorStop(0, "rgba(255, 236, 196, 0.28)");
      sunGrad.addColorStop(0.55, "rgba(245, 215, 162, 0.12)");
      sunGrad.addColorStop(1, "rgba(42, 27, 18, 0.18)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(
        terrace.x - terrace.rx * 1.2,
        terrace.y - terrace.height - terrace.ry * 1.2,
        terrace.rx * 2.4,
        terrace.ry * 2.4
      );
    }

    drawWornArenaMarkings(ctx, terrace);
    ctx.restore();
  }

  function drawTerraceLayer(ctx, terrace) {
    const palette = TOP_PALETTES[terrace.level - 1] || TOP_PALETTES[0];
    const sidePalette = SIDE_PALETTES[terrace.level - 1] || SIDE_PALETTES[0];
    const points = terrace.vertices;

    // Long directional HD-2D cliff cast shadow to the bottom-right (matches images.jpeg)
    ctx.save();
    ctx.translate(12, 14);
    tracePolygon(ctx, points, terrace.lowerHeight - 6);
    ctx.fillStyle = "rgba(18, 11, 8, 0.38)";
    ctx.fill();
    ctx.restore();

    drawTerraceShadow(ctx, terrace);

    // Visible front-facing 3D blocky rock wall (matches images.jpeg chiseled cliff blocks)
    for (let index = 0; index < points.length; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      if ((a.y + b.y) * 0.5 < terrace.y - terrace.ry * 0.06) continue;
      const wallH = terrace.height - terrace.lowerHeight;
      const midH = terrace.lowerHeight + wallH * 0.52;

      // Upper rock block tier
      ctx.fillStyle = sidePalette[index % sidePalette.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - terrace.height);
      ctx.lineTo(b.x, b.y - terrace.height);
      ctx.lineTo(b.x, b.y - midH);
      ctx.lineTo(a.x, a.y - midH);
      ctx.closePath();
      ctx.fill();

      // Lower darker rock block tier
      ctx.fillStyle = sidePalette[(index + 1) % sidePalette.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - midH);
      ctx.lineTo(b.x, b.y - midH);
      ctx.lineTo(b.x, b.y - terrace.lowerHeight);
      ctx.lineTo(a.x, a.y - terrace.lowerHeight);
      ctx.closePath();
      ctx.fill();

      // Chiseled block seam & highlight
      ctx.strokeStyle = "rgba(18, 11, 8, 0.68)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - terrace.height);
      ctx.lineTo(a.x, a.y - terrace.lowerHeight);
      ctx.moveTo(a.x, a.y - midH);
      ctx.lineTo(b.x, b.y - midH);
      ctx.stroke();

      if (index % 2 === 0) {
        ctx.fillStyle = "rgba(218, 178, 126, 0.22)";
        ctx.beginPath();
        ctx.moveTo(lerp(a.x, b.x, 0.08), lerp(a.y, b.y, 0.08) - terrace.height + 2);
        ctx.lineTo(lerp(a.x, b.x, 0.82), lerp(a.y, b.y, 0.82) - terrace.height + 2);
        ctx.lineTo(lerp(a.x, b.x, 0.68), lerp(a.y, b.y, 0.68) - midH + 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    tracePolygon(ctx, points, terrace.height);
    if (typeof ctx.createLinearGradient === "function") {
      const surfaceLight = ctx.createLinearGradient(
        terrace.x - terrace.rx * 0.72,
        terrace.y - terrace.ry * 0.78 - terrace.height,
        terrace.x + terrace.rx * 0.68,
        terrace.y + terrace.ry * 0.76 - terrace.height
      );
      surfaceLight.addColorStop(0, palette.light);
      surfaceLight.addColorStop(0.44, palette.top);
      surfaceLight.addColorStop(1, palette.shade);
      ctx.fillStyle = surfaceLight;
    } else {
      ctx.fillStyle = palette.top;
    }
    ctx.fill();
    drawTerraceSurfaceTexture(ctx, terrace);

    // Deep ambient occlusion plus a crisp sunlit upper-left rim
    tracePolygon(ctx, points, terrace.height);
    ctx.strokeStyle = palette.edge;
    ctx.lineWidth = 5.5;
    ctx.stroke();
    tracePolygon(ctx, points, terrace.height);
    ctx.strokeStyle = "#dfc096";
    ctx.globalAlpha = 0.88;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function rampScreenPoint(ramp, amount, lateral) {
    const dx = ramp.x2 - ramp.x1;
    const dy = ramp.y2 - ramp.y1;
    const length = Math.hypot(dx, dy) || 1;
    const sideX = -dy / length;
    const sideY = dx / length;
    const eased = ramp.kind === "stairs"
      ? Math.round(smoothstep(amount) * ramp.steps) / ramp.steps
      : smoothstep(amount);
    const elevation = lerp(ramp.fromHeight, ramp.toHeight, eased);
    return {
      x: lerp(ramp.x1, ramp.x2, amount) + sideX * lateral,
      y: lerp(ramp.y1, ramp.y2, amount) + sideY * lateral - elevation
    };
  }

  function drawRamp(ctx, ramp) {
    const halfWidth = ramp.width * 0.5;
    const railW = Math.max(7, ramp.width * 0.085);
    const startLeft = rampScreenPoint(ramp, 0, -halfWidth);
    const startRight = rampScreenPoint(ramp, 0, halfWidth);
    const endRight = rampScreenPoint(ramp, 1, halfWidth);
    const endLeft = rampScreenPoint(ramp, 1, -halfWidth);

    // Directional drop shadow under stairs
    ctx.beginPath();
    ctx.moveTo(startLeft.x + 8, startLeft.y + 10);
    ctx.lineTo(startRight.x + 8, startRight.y + 10);
    ctx.lineTo(endRight.x + 8, endRight.y + 10);
    ctx.lineTo(endLeft.x + 8, endLeft.y + 10);
    ctx.closePath();
    ctx.fillStyle = "rgba(18, 12, 9, 0.44)";
    ctx.fill();

    // Grey stone stair body (matches images.jpeg Pewter Gym stone steps)
    ctx.beginPath();
    ctx.moveTo(startLeft.x, startLeft.y);
    ctx.lineTo(startRight.x, startRight.y);
    ctx.lineTo(endRight.x, endRight.y);
    ctx.lineTo(endLeft.x, endLeft.y);
    ctx.closePath();
    if (typeof ctx.createLinearGradient === "function") {
      const rampGradient = ctx.createLinearGradient(ramp.x1, ramp.y1, ramp.x2, ramp.y2);
      rampGradient.addColorStop(0, "#7f8a94");
      rampGradient.addColorStop(0.5, "#98a3ad");
      rampGradient.addColorStop(1, "#b4bec7");
      ctx.fillStyle = rampGradient;
    } else {
      ctx.fillStyle = "#95a0aa";
    }
    ctx.fill();
    ctx.strokeStyle = "#2b3138";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Crisp stone step risers & treads
    const lineCount = Math.max(5, ramp.steps || 6);
    for (let index = 1; index < lineCount; index += 1) {
      const amount = index / lineCount;
      const left = rampScreenPoint(ramp, amount, -halfWidth + railW * 0.6);
      const right = rampScreenPoint(ramp, amount, halfWidth - railW * 0.6);
      ctx.strokeStyle = "#485159";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.stroke();

      ctx.strokeStyle = "#d9e1e8";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(left.x, left.y - 2);
      ctx.lineTo(right.x, right.y - 2);
      ctx.stroke();
    }

    // Iconic Red/Terracotta Side Rails along both sides of the stone stairs (matches images.jpeg!)
    for (const side of [-1, 1]) {
      const innerLat = side * (halfWidth - railW);
      const outerLat = side * (halfWidth + 2);
      const sIn = rampScreenPoint(ramp, 0, innerLat);
      const sOut = rampScreenPoint(ramp, 0, outerLat);
      const eOut = rampScreenPoint(ramp, 1, outerLat);
      const eIn = rampScreenPoint(ramp, 1, innerLat);

      ctx.fillStyle = "#b03a2e";
      ctx.strokeStyle = "#4a1410";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sIn.x, sIn.y - 4);
      ctx.lineTo(sOut.x, sOut.y - 4);
      ctx.lineTo(eOut.x, eOut.y - 4);
      ctx.lineTo(eIn.x, eIn.y - 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "#e6675a";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(sIn.x, sIn.y - 4.5);
      ctx.lineTo(eIn.x, eIn.y - 4.5);
      ctx.stroke();
    }
  }

  function drawSectorDetails(ctx, sector) {
    for (const detail of sector.details || []) {
      const screenY = detail.y - detail.height;
      if (detail.kind === "stone") {
        // Long directional shadow
        ctx.fillStyle = "rgba(20, 13, 9, 0.52)";
        ctx.beginPath();
        ctx.ellipse(detail.x + 5 * detail.scale, screenY + 3.5 * detail.scale, 7.5 * detail.scale, 3.4 * detail.scale, 0.22, 0, TWO_PI);
        ctx.fill();
        // Faceted grey-brown rock (matches images.jpeg)
        ctx.fillStyle = "#7a736b";
        ctx.strokeStyle = "#292420";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(detail.x - 5 * detail.scale, screenY + 1.5 * detail.scale);
        ctx.lineTo(detail.x - 2.5 * detail.scale, screenY - 4.2 * detail.scale);
        ctx.lineTo(detail.x + 3.8 * detail.scale, screenY - 3.2 * detail.scale);
        ctx.lineTo(detail.x + 5.2 * detail.scale, screenY + 1.8 * detail.scale);
        ctx.lineTo(detail.x - 1 * detail.scale, screenY + 3 * detail.scale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#b5aba0";
        ctx.beginPath();
        ctx.moveTo(detail.x - 2.5 * detail.scale, screenY - 4.2 * detail.scale);
        ctx.lineTo(detail.x + 3.5 * detail.scale, screenY - 3.2 * detail.scale);
        ctx.lineTo(detail.x + 1 * detail.scale, screenY - 0.5 * detail.scale);
        ctx.lineTo(detail.x - 3.5 * detail.scale, screenY - 1 * detail.scale);
        ctx.closePath();
        ctx.fill();
      } else if (detail.kind === "boulder") {
        const s = detail.scale * 1.35;
        // Long HD-2D directional cast shadow
        ctx.fillStyle = "rgba(16, 10, 7, 0.56)";
        ctx.beginPath();
        ctx.ellipse(detail.x + 10 * s, screenY + 6 * s, 14 * s, 6.2 * s, 0.22, 0, TWO_PI);
        ctx.fill();

        // Main 3D faceted boulder (matches images.jpeg chunky grey/brown rock clusters)
        ctx.fillStyle = "#5e5750";
        ctx.strokeStyle = "#241f1c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(detail.x - 11 * s, screenY + 2 * s);
        ctx.lineTo(detail.x - 8 * s, screenY - 9 * s);
        ctx.lineTo(detail.x - 1 * s, screenY - 13 * s);
        ctx.lineTo(detail.x + 8 * s, screenY - 10 * s);
        ctx.lineTo(detail.x + 12 * s, screenY - 1 * s);
        ctx.lineTo(detail.x + 8 * s, screenY + 6 * s);
        ctx.lineTo(detail.x - 5 * s, screenY + 6 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Sunlit top-left facet
        ctx.fillStyle = "#9c9388";
        ctx.beginPath();
        ctx.moveTo(detail.x - 7.5 * s, screenY - 8.5 * s);
        ctx.lineTo(detail.x - 1 * s, screenY - 12.5 * s);
        ctx.lineTo(detail.x + 6.5 * s, screenY - 9.5 * s);
        ctx.lineTo(detail.x + 2 * s, screenY - 3 * s);
        ctx.lineTo(detail.x - 6 * s, screenY - 2 * s);
        ctx.closePath();
        ctx.fill();

        // Dark right shadow facet
        ctx.fillStyle = "#3d3732";
        ctx.beginPath();
        ctx.moveTo(detail.x + 2 * s, screenY - 3 * s);
        ctx.lineTo(detail.x + 6.5 * s, screenY - 9.5 * s);
        ctx.lineTo(detail.x + 11.5 * s, screenY - 1 * s);
        ctx.lineTo(detail.x + 7.5 * s, screenY + 5.5 * s);
        ctx.lineTo(detail.x + 0.5 * s, screenY + 5.5 * s);
        ctx.closePath();
        ctx.fill();
      } else if (detail.kind === "crater") {
        ctx.fillStyle = "rgba(42, 26, 18, 0.54)";
        ctx.beginPath();
        ctx.ellipse(detail.x, screenY + 1, 10 * detail.scale, 5.5 * detail.scale, detail.rotation * 0.2, 0, TWO_PI);
        ctx.fill();
        ctx.strokeStyle = "rgba(210, 165, 108, 0.42)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(detail.x - 1, screenY - 0.5, 9 * detail.scale, 4.7 * detail.scale, detail.rotation * 0.2, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.fillStyle = "rgba(28, 18, 13, 0.48)";
        ctx.beginPath();
        ctx.ellipse(detail.x + 1.5, screenY + 1.5, 5.8 * detail.scale, 2.7 * detail.scale, detail.rotation * 0.2, 0, TWO_PI);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(224, 182, 118, 0.45)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(detail.x - 5 * detail.scale, screenY + 2);
        ctx.lineTo(detail.x - 1 * detail.scale, screenY - 1 * detail.scale);
        ctx.lineTo(detail.x + 4 * detail.scale, screenY);
        ctx.moveTo(detail.x - 2 * detail.scale, screenY + 4);
        ctx.lineTo(detail.x + 3 * detail.scale, screenY + 2);
        ctx.lineTo(detail.x + 6 * detail.scale, screenY + 3);
        ctx.stroke();
      }
    }
  }

  function intersectsView(sector, viewLeft, viewTop, viewW, viewH) {
    const bounds = sector.bounds;
    if (!bounds) return true;
    const margin = DEFAULT_VIEW_MARGIN;
    return !(
      bounds.right < viewLeft - margin ||
      bounds.left > viewLeft + viewW + margin ||
      bounds.bottom < viewTop - margin ||
      bounds.top > viewTop + viewH + margin
    );
  }

  /**
   * Draw the warm, battle-scarred rock arena in world coordinates.
   * `time` is accepted for the game render signature, but the terrain itself is
   * deliberately static: no frame-to-frame randomness or distracting shimmer.
   */
  function drawTerracedBattlefield(ctx, sectors, viewLeft, viewTop, viewW, viewH, time) {
    if (!ctx || typeof ctx.save !== "function") {
      throw new TypeError("drawTerracedBattlefield requires a CanvasRenderingContext2D-like object");
    }

    const left = Number(viewLeft) || 0;
    const top = Number(viewTop) || 0;
    const width = Math.max(0, Number(viewW) || 0);
    const height = Math.max(0, Number(viewH) || 0);
    const sectorList = (Array.isArray(sectors) ? sectors : sectors ? [sectors] : [])
      .filter(sector => sector && Array.isArray(sector.terraces))
      .filter(sector => intersectsView(sector, left, top, width, height))
      .slice()
      .sort((a, b) => a.cy - b.cy || a.cx - b.cx);

    // Keep the public signature stable for callers even though the calm field
    // currently has no animated terrain layer.
    void time;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();

    if (typeof ctx.createLinearGradient === "function") {
      const groundGradient = ctx.createLinearGradient(0, top, 0, top + Math.max(1, height));
      groundGradient.addColorStop(0, "#806746");
      groundGradient.addColorStop(0.48, "#765c3e");
      groundGradient.addColorStop(1, "#684e36");
      ctx.fillStyle = groundGradient;
    } else {
      ctx.fillStyle = "#755a3d";
    }
    ctx.fillRect(left, top, width, height);
    drawBaseTexture(ctx, left, top, width, height);

    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    const canUseDomCache =
      typeof document !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      ctx.canvas instanceof HTMLCanvasElement &&
      typeof ctx.drawImage === "function";

    for (const sector of sectorList) {
      if (canUseDomCache && sector.bounds) {
        if (!sector._cachedCanvas) {
          const pad = 64;
          const bLeft = sector.bounds.left - pad;
          const bTop = sector.bounds.top - pad;
          const bW = Math.ceil(sector.bounds.right - sector.bounds.left + pad * 2);
          const bH = Math.ceil(sector.bounds.bottom - sector.bounds.top + pad * 2);
          const offCanvas = document.createElement("canvas");
          offCanvas.width = bW;
          offCanvas.height = bH;
          const offCtx = offCanvas.getContext("2d");
          if (offCtx) {
            offCtx.save();
            offCtx.translate(-bLeft, -bTop);
            offCtx.lineJoin = "miter";
            offCtx.lineCap = "butt";
            const orderedTerraces = sector.terraces.slice().sort((a, b) => a.height - b.height);
            orderedTerraces.forEach(terrace => drawTerraceLayer(offCtx, terrace));
            sector.ramps.forEach(ramp => drawRamp(offCtx, ramp));
            drawSectorDetails(offCtx, sector);
            offCtx.restore();
            sector._cachedCanvas = offCanvas;
            sector._cacheLeft = bLeft;
            sector._cacheTop = bTop;
          }
        }
        if (sector._cachedCanvas) {
          ctx.drawImage(sector._cachedCanvas, sector._cacheLeft, sector._cacheTop);
          continue;
        }
      }
      const orderedTerraces = sector.terraces.slice().sort((a, b) => a.height - b.height);
      orderedTerraces.forEach(terrace => drawTerraceLayer(ctx, terrace));
      sector.ramps.forEach(ramp => drawRamp(ctx, ramp));
      drawSectorDetails(ctx, sector);
    }

    ctx.restore();
  }

  return Object.freeze({
    createTerracedSector,
    getTerracedHeightAt,
    drawTerracedBattlefield
  });
});
