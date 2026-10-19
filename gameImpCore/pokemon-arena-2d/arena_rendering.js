// High-quality deterministic arena materials and water-contact helpers.
// Kept independent from game.js so rendering and contact rules can be tested in Node.
(function initArenaRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ArenaRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createArenaRenderer() {
  "use strict";

  const TAU = Math.PI * 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    if (edge0 === edge1) return value < edge0 ? 0 : 1;
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function hashUnit(x, y, salt) {
    let h = Math.imul((x | 0) ^ 0x68bc21eb, 0x45d9f3b);
    h ^= Math.imul((y | 0) ^ 0x02e5be93, 0x27d4eb2d);
    h ^= Math.imul((salt | 0) ^ 0x967a889b, 0x165667b1);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d);
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function roundedRectPath(ctx, x, y, width, height, radius) {
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

  function fillGradient(ctx, x0, y0, x1, y1, stops, fallback) {
    if (typeof ctx.createLinearGradient !== "function") {
      ctx.fillStyle = fallback;
      return;
    }
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(stop => gradient.addColorStop(stop[0], stop[1]));
    ctx.fillStyle = gradient;
  }

  function drawHD2DPineTree(ctx, x, y, scale) {
    const s = scale || 1;
    // Long diagonal HD-2D shadow cast to the right (matches images4.jpeg forest shadows)
    ctx.fillStyle = "rgba(12, 26, 14, 0.46)";
    ctx.beginPath();
    ctx.ellipse(x + 34 * s, y + 10 * s, 42 * s, 18 * s, 0.18, 0, TAU);
    ctx.fill();

    // Tree trunk base
    ctx.fillStyle = "#4a2e1b";
    ctx.fillRect(x - 7 * s, y - 6 * s, 14 * s, 16 * s);

    // 3-tiered pixel-art conifer foliage canopy (dark base -> mid green -> sunlit yellow-green crown)
    const tiers = [
      { dy: -14 * s, rx: 34 * s, ry: 22 * s, dark: "#1d3d1a", mid: "#2e5c27", light: "#568c3b" },
      { dy: -32 * s, rx: 27 * s, ry: 19 * s, dark: "#23471e", mid: "#3b6e2e", light: "#74ab49" },
      { dy: -48 * s, rx: 19 * s, ry: 15 * s, dark: "#2d5724", mid: "#4e8537", light: "#9ad162" }
    ];
    for (let t = 0; t < tiers.length; t += 1) {
      const tier = tiers[t];
      // Dark underside scalloped foliage
      ctx.fillStyle = tier.dark;
      ctx.beginPath();
      ctx.ellipse(x, y + tier.dy + 5 * s, tier.rx, tier.ry, 0, 0, TAU);
      ctx.fill();

      // Mid foliage body
      ctx.fillStyle = tier.mid;
      ctx.beginPath();
      ctx.ellipse(x - 1 * s, y + tier.dy, tier.rx * 0.94, tier.ry * 0.9, 0, 0, TAU);
      ctx.fill();

      // Sunlit upper-left foliage crown (matches images4.jpeg sunlit tree tops)
      ctx.fillStyle = tier.light;
      ctx.beginPath();
      ctx.ellipse(x - tier.rx * 0.16, y + tier.dy - 3 * s, tier.rx * 0.72, tier.ry * 0.68, -0.15, 0, TAU);
      ctx.fill();

      // Crisp pixel-art leaf dither clusters
      ctx.fillStyle = t === 2 ? "#c5eb86" : "#8ec455";
      for (let d = -2; d <= 2; d += 1) {
        const dx = x + d * tier.rx * 0.26 - 3 * s;
        const dy = y + tier.dy - 2 * s + Math.abs(d) * 2.2 * s;
        ctx.fillRect(Math.round(dx), Math.round(dy), Math.round(4 * s), Math.round(4 * s));
      }
    }
  }

  function drawHD2DFenceAndFlowers(ctx, x, y, postCount) {
    const count = postCount || 6;
    const spacing = 26;
    const totalW = (count - 1) * spacing;
    // Fence shadow
    ctx.fillStyle = "rgba(14, 28, 15, 0.38)";
    ctx.fillRect(x + 6, y + 4, totalW + 14, 9);

    // Horizontal rails
    ctx.fillStyle = "#7c4d28";
    ctx.fillRect(x, y - 14, totalW + 10, 5);
    ctx.fillRect(x, y - 6, totalW + 10, 5);

    // Wooden fence posts (matches images4.jpeg)
    for (let i = 0; i < count; i += 1) {
      const px = x + i * spacing;
      ctx.fillStyle = "#3b2210";
      ctx.fillRect(px - 1, y - 22, 12, 26);
      ctx.fillStyle = "#9c6438";
      ctx.fillRect(px, y - 21, 10, 24);
      ctx.fillStyle = "#cfa072";
      ctx.fillRect(px + 1, y - 20, 8, 5);
    }

    // Red pixel-art flower beds in front of the fence (matches images4.jpeg bottom flower patch)
    for (let row = 0; row < 2; row += 1) {
      for (let i = 0; i < count - 1; i += 1) {
        const fx = x + 12 + i * spacing + (row % 2) * 4;
        const fy = y + 14 + row * 16;
        // Dark green leaf bed
        ctx.fillStyle = "#265221";
        ctx.beginPath();
        ctx.ellipse(fx, fy + 2, 9, 6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#488536";
        ctx.beginPath();
        ctx.ellipse(fx - 1, fy, 7.5, 4.8, 0, 0, TAU);
        ctx.fill();
        // Red blossoms & yellow centers
        ctx.fillStyle = "#d93829";
        ctx.fillRect(fx - 5, fy - 4, 5, 5);
        ctx.fillRect(fx + 1, fy - 2, 5, 5);
        ctx.fillRect(fx - 2, fy + 1, 5, 4);
        ctx.fillStyle = "#fadc56";
        ctx.fillRect(fx - 3, fy - 2, 2, 2);
        ctx.fillRect(fx + 3, fy, 2, 2);
      }
    }
  }

  function drawGrassSectorDiorama(ctx, cx, cy, sectorW, sectorH) {
    const pitchW = sectorW * 0.72;
    const pitchH = sectorH * 0.68;
    const pitchX = cx - pitchW * 0.5;
    const pitchY = cy - pitchH * 0.5;
    const stepH = 22;

    // 1. Pallet Town HD-2D Flower Beds & Wooden Fences on the outer lawn margins (matches images4.jpeg)
    drawHD2DFenceAndFlowers(ctx, cx - sectorW * 0.45, pitchY - 56, 7);
    drawHD2DFenceAndFlowers(ctx, cx + sectorW * 0.20, pitchY - 56, 7);
    drawHD2DFenceAndFlowers(ctx, cx - sectorW * 0.45, pitchY + pitchH + 46, 7);
    drawHD2DFenceAndFlowers(ctx, cx + sectorW * 0.20, pitchY + pitchH + 46, 7);

    // 2. Raised 3D Stadium Platform Drop Shadow & 3-Stepped Base (matches images1.jpeg Indigo Stadium!)
    ctx.fillStyle = "rgba(10, 22, 14, 0.48)";
    roundedRectPath(ctx, pitchX - 10, pitchY + 12, pitchW + 34, pitchH + stepH + 22, 22);
    ctx.fill();

    // 3-stepped dark architectural stadium riser along the bottom & sides
    const steps = [
      { inset: -10, drop: stepH + 10, fill: "#0f1722", stroke: "#334763" },
      { inset: -5, drop: stepH * 0.66 + 6, fill: "#182436", stroke: "#435c7d" },
      { inset: 0, drop: stepH * 0.33 + 2, fill: "#23334a", stroke: "#58769c" }
    ];
    for (const st of steps) {
      roundedRectPath(ctx, pitchX + st.inset, pitchY - st.inset * 0.4, pitchW - st.inset * 2, pitchH + st.drop, 16);
      ctx.fillStyle = st.fill;
      ctx.fill();
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 3. Outer Teal-Blue Stadium Court Deck (matches images1.jpeg blue court surround)
    roundedRectPath(ctx, pitchX, pitchY, pitchW, pitchH, 14);
    fillGradient(ctx, pitchX, pitchY, pitchX + pitchW, pitchY + pitchH, [
      [0, "#4689a6"],
      [0.5, "#35718c"],
      [1, "#26576e"]
    ], "#35718c");
    ctx.fill();
    ctx.strokeStyle = "#e2edf2";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner Sandstone / Champagne Battle Court Floor (matches images1.jpeg tan court!)
    const innerPadX = 48;
    const innerPadY = 38;
    const innerX = pitchX + innerPadX;
    const innerY = pitchY + innerPadY;
    const innerW = pitchW - innerPadX * 2;
    const innerH = pitchH - innerPadY * 2;

    fillGradient(ctx, innerX, innerY, innerX + innerW * 0.8, innerY + innerH, [
      [0, "#cfc59d"],
      [0.42, "#b5ab84"],
      [1, "#948a66"]
    ], "#b5ab84");
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Specular floor sheen across the court (matches images1.jpeg glossy stadium floor reflection)
    fillGradient(ctx, innerX, innerY, innerX + innerW * 0.65, innerY + innerH * 0.75, [
      [0, "rgba(255, 250, 224, 0.24)"],
      [0.45, "rgba(255, 250, 224, 0.06)"],
      [1, "rgba(0, 0, 0, 0.08)"]
    ], "rgba(255, 250, 224, 0.10)");
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Crisp White Stadium Boundary & Center Line
    ctx.strokeStyle = "rgba(244, 247, 240, 0.92)";
    ctx.lineWidth = 5;
    ctx.strokeRect(innerX, innerY, innerW, innerH);

    ctx.beginPath();
    ctx.moveTo(cx, innerY);
    ctx.lineTo(cx, innerY + innerH);
    ctx.stroke();

    // Center Poké Ball Court Inlay (matches images1.jpeg red/white center emblem)
    const emblemR = 148;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.72);
    ctx.fillStyle = "rgba(168, 62, 56, 0.78)";
    ctx.beginPath();
    ctx.arc(0, 0, emblemR, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(241, 245, 242, 0.36)";
    ctx.beginPath();
    ctx.arc(0, 0, emblemR, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = "rgba(246, 248, 242, 0.92)";
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.arc(0, 0, emblemR, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-emblemR, 0);
    ctx.lineTo(emblemR, 0);
    ctx.stroke();
    ctx.fillStyle = "#b5ab84";
    ctx.beginPath();
    ctx.arc(0, 0, 42, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(246, 248, 242, 0.85)";
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Left & Right Terracotta-Red Trainer Battle Boxes (matches images1.jpeg Red & Blue boxes!)
    const boxW = 190;
    const boxH = 146;
    for (const side of [-1, 1]) {
      const bx = side < 0 ? innerX + 34 : innerX + innerW - 34 - boxW;
      const by = cy - boxH * 0.5;
      ctx.fillStyle = "rgba(158, 76, 68, 0.84)";
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.strokeStyle = "rgba(246, 248, 242, 0.92)";
      ctx.lineWidth = 4.5;
      ctx.strokeRect(bx, by, boxW, boxH);
    }

    // 4. Perimeter 3D Conifer/Pine Trees with Long Shadows (matches images4.jpeg)
    const treePositions = [
      [cx - sectorW * 0.44, cy - sectorH * 0.34, 1.05],
      [cx - sectorW * 0.45, cy - sectorH * 0.14, 1.12],
      [cx - sectorW * 0.44, cy + sectorH * 0.08, 1.08],
      [cx - sectorW * 0.45, cy + sectorH * 0.28, 1.14],
      [cx + sectorW * 0.44, cy - sectorH * 0.34, 1.05],
      [cx + sectorW * 0.45, cy - sectorH * 0.14, 1.12],
      [cx + sectorW * 0.44, cy + sectorH * 0.08, 1.08],
      [cx + sectorW * 0.45, cy + sectorH * 0.28, 1.14]
    ];
    for (const tp of treePositions) {
      drawHD2DPineTree(ctx, tp[0], tp[1], tp[2]);
    }
  }

  function drawGrassField(ctx, options) {
    const left = Number(options.viewLeft) || 0;
    const top = Number(options.viewTop) || 0;
    const width = Math.max(0, Number(options.viewW) || 0);
    const height = Math.max(0, Number(options.viewH) || 0);
    const sectors = Array.isArray(options.sectors) ? options.sectors : [];
    const sectorW = Number(options.sectorW) || 1600;
    const sectorH = Number(options.sectorH) || 1120;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();

    // Rich HD-2D sunlit meadow grass gradient (matches images4.jpeg)
    fillGradient(ctx, left, top, left + width * 0.35, top + height, [
      [0, "#689943"],
      [0.48, "#4c7a34"],
      [1, "#355926"]
    ], "#4c7a34");
    ctx.fillRect(left, top, width, height);

    // Fine alternating mowing bands
    const mowBand = 112;
    const startBand = Math.floor((left - height * 0.22) / mowBand) * mowBand;
    ctx.globalAlpha = 0.14;
    for (let band = startBand; band < left + width + height * 0.25; band += mowBand) {
      const index = Math.floor(band / mowBand);
      ctx.fillStyle = Math.abs(index % 2) === 0 ? "#a3cf63" : "#1f451e";
      ctx.beginPath();
      ctx.moveTo(band, top);
      ctx.lineTo(band + mowBand * 0.84, top);
      ctx.lineTo(band + height * 0.22 + mowBand * 0.84, top + height);
      ctx.lineTo(band + height * 0.22, top + height);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pixel-art dithered grass tufts (matches images4.jpeg lawn texture)
    const cell = 112;
    const startX = Math.floor(left / cell) * cell;
    const startY = Math.floor(top / cell) * cell;
    for (let y = startY; y < top + height + cell; y += cell) {
      for (let x = startX; x < left + width + cell; x += cell) {
        const gx = Math.floor(x / cell);
        const gy = Math.floor(y / cell);
        const px = Math.round(x + 10 + hashUnit(gx, gy, 11) * 84);
        const py = Math.round(y + 10 + hashUnit(gx, gy, 12) * 84);
        const roll = hashUnit(gx, gy, 13);
        if (roll > 0.22) {
          ctx.fillStyle = roll > 0.65 ? "rgba(182, 224, 112, 0.42)" : "rgba(28, 64, 26, 0.38)";
          ctx.fillRect(px, py, 4, 4);
          ctx.fillRect(px + 5, py - 3, 4, 4);
          ctx.fillRect(px + 10, py + 1, 4, 4);
        }
      }
    }

    const canUseDomCache =
      typeof document !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      ctx.canvas instanceof HTMLCanvasElement &&
      typeof ctx.drawImage === "function";

    for (const sec of sectors) {
      const cx = Number(sec.cx) || 0;
      const cy = Number(sec.cy) || 0;
      if (canUseDomCache) {
        if (!sec._grassCachedCanvas) {
          const pad = 40;
          const bLeft = cx - sectorW * 0.5 - pad;
          const bTop = cy - sectorH * 0.5 - pad;
          const bW = Math.ceil(sectorW + pad * 2);
          const bH = Math.ceil(sectorH + pad * 2);
          const offCanvas = document.createElement("canvas");
          offCanvas.width = bW;
          offCanvas.height = bH;
          const offCtx = offCanvas.getContext("2d");
          if (offCtx) {
            offCtx.save();
            offCtx.translate(-bLeft, -bTop);
            drawGrassSectorDiorama(offCtx, cx, cy, sectorW, sectorH);
            offCtx.restore();
            sec._grassCachedCanvas = offCanvas;
            sec._grassCacheLeft = bLeft;
            sec._grassCacheTop = bTop;
          }
        }
        if (sec._grassCachedCanvas) {
          ctx.drawImage(sec._grassCachedCanvas, sec._grassCacheLeft, sec._grassCacheTop);
          continue;
        }
      }
      drawGrassSectorDiorama(ctx, cx, cy, sectorW, sectorH);
    }

    ctx.restore();
  }

  function drawMechanicalBasin(ctx, options) {
    const left = Number(options.viewLeft) || 0;
    const top = Number(options.viewTop) || 0;
    const width = Math.max(0, Number(options.viewW) || 0);
    const height = Math.max(0, Number(options.viewH) || 0);
    fillGradient(ctx, left, top, left, top + height, [
      [0, "#202b39"],
      [0.5, "#111923"],
      [1, "#090f17"]
    ], "#111923");
    ctx.fillRect(left, top, width, height);

    const cell = 112;
    const startX = Math.floor(left / cell) * cell;
    const startY = Math.floor(top / cell) * cell;
    for (let y = startY; y < top + height + cell; y += cell) {
      for (let x = startX; x < left + width + cell; x += cell) {
        const gx = Math.floor(x / cell);
        const gy = Math.floor(y / cell);
        const lit = hashUnit(gx, gy, 61) > 0.55;
        ctx.fillStyle = lit ? "rgba(76,96,117,0.12)" : "rgba(2,7,13,0.13)";
        ctx.fillRect(x + 4, y + 4, cell - 8, cell - 8);
        ctx.strokeStyle = "rgba(104,132,158,0.19)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
        ctx.fillStyle = "rgba(151,177,198,0.40)";
        ctx.beginPath();
        ctx.arc(x + 13, y + 13, 2.2, 0, TAU);
        ctx.arc(x + cell - 13, y + cell - 13, 2.2, 0, TAU);
        ctx.fill();
      }
    }

    // Inset service rails and restrained warning lights make the transition deck believable.
    ctx.strokeStyle = "rgba(3,8,14,0.74)";
    ctx.lineWidth = 15;
    for (let y = startY; y < top + height + cell; y += cell * 2) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.strokeStyle = "rgba(88,116,140,0.38)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(left, y - 5);
      ctx.lineTo(left + width, y - 5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(3,8,14,0.74)";
      ctx.lineWidth = 15;
    }
  }

  function drawWaterSurface(ctx, options) {
    const left = Number(options.viewLeft) || 0;
    const top = Number(options.viewTop) || 0;
    const width = Math.max(0, Number(options.viewW) || 0);
    const height = Math.max(0, Number(options.viewH) || 0);
    const time = Number(options.time) || 0;

    // Crystal-clear Cerulean Gym pool gradient (matches images2.jpeg vibrant cyan-blue water!)
    fillGradient(ctx, left, top, left, top + height, [
      [0, "#238fd1"],
      [0.36, "#1875b5"],
      [0.72, "#105a91"],
      [1, "#0b416b"]
    ], "#1875b5");
    ctx.fillRect(left, top, width, height);

    // Submerged 3D blue pool tile grid visible beneath the water (matches images2.jpeg pool floor!)
    const tileStep = 88;
    const startTileX = Math.floor(left / tileStep) * tileStep;
    const startTileY = Math.floor(top / tileStep) * tileStep;
    ctx.strokeStyle = "rgba(8, 42, 74, 0.36)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = startTileX; x <= left + width + tileStep; x += tileStep) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + height);
    }
    for (let y = startTileY; y <= top + height + tileStep; y += tileStep) {
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
    }
    ctx.stroke();

    // Bright pixel-art Voronoi/lattice water caustics (matches images2.jpeg glowing cyan caustic web!)
    const cell = 116;
    const startX = Math.floor(left / cell) * cell;
    const startY = Math.floor(top / cell) * cell;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let y = startY; y < top + height + cell; y += cell) {
      for (let x = startX; x < left + width + cell; x += cell) {
        const gx = Math.floor(x / cell);
        const gy = Math.floor(y / cell);
        const phase = time * (0.85 + hashUnit(gx, gy, 93) * 0.35) + hashUnit(gx, gy, 94) * TAU;
        const cx = x + cell * 0.5 + Math.sin(phase) * 14;
        const cy = y + cell * 0.5 + Math.cos(phase * 0.8) * 9;
        const rx = 28 + hashUnit(gx, gy, 95) * 18;
        const ry = 18 + hashUnit(gx, gy, 96) * 12;

        ctx.strokeStyle = "rgba(130, 236, 255, 0.34)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy);
        ctx.quadraticCurveTo(cx - rx * 0.3, cy - ry, cx, cy - ry * 0.85);
        ctx.quadraticCurveTo(cx + rx * 0.4, cy - ry * 0.9, cx + rx, cy);
        ctx.quadraticCurveTo(cx + rx * 0.35, cy + ry, cx, cy + ry * 0.85);
        ctx.quadraticCurveTo(cx - rx * 0.4, cy + ry * 0.9, cx - rx, cy);
        ctx.stroke();

        // Crisp bright pixel caustic node at the intersection
        if (hashUnit(gx, gy, 97) > 0.32) {
          ctx.fillStyle = "rgba(218, 252, 255, 0.52)";
          ctx.fillRect(Math.round(cx + rx * 0.65), Math.round(cy - 3), 8, 4);
          ctx.fillRect(Math.round(cx - rx * 0.72), Math.round(cy + 2), 6, 3);
        }
      }
    }

    // Sparse bright specular surface wavelets
    const waveX = 156;
    const waveY = 92;
    for (let y = Math.floor(top / waveY) * waveY; y < top + height + waveY; y += waveY) {
      for (let x = Math.floor(left / waveX) * waveX; x < left + width + waveX; x += waveX) {
        const gx = Math.floor(x / waveX);
        const gy = Math.floor(y / waveY);
        if (hashUnit(gx, gy, 121) < 0.38) continue;
        const phase = time * 1.18 + gx * 0.91 + gy * 1.43;
        const px = x + 18 + hashUnit(gx, gy, 122) * 78 + Math.sin(phase) * 10;
        const py = y + 12 + hashUnit(gx, gy, 123) * 38;
        ctx.strokeStyle = "rgba(224, 252, 255, 0.45)";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(px - 13, py + 1);
        ctx.quadraticCurveTo(px - 3, py - 3, px + 7, py);
        ctx.quadraticCurveTo(px + 13, py + 2, px + 20, py - 1);
        ctx.stroke();
      }
    }
  }

  function getPlatformPose(platform, time) {
    if (!platform) return { x: 0, y: 0, bob: 0, tiltX: 0, tiltY: 0 };
    const t = Number(time) || 0;
    const isIce = !platform.kind;
    const amplitude = isIce ? 1.15 : 2.15;
    const speed = isIce ? 1.85 : 2.15;
    const bob = Math.sin(t * speed + Number(platform.x) * 0.015 + Number(platform.y) * 0.01) * amplitude;
    const tiltX = (Number(platform.tiltX) || 0) * 0.35;
    const tiltY = (Number(platform.tiltY) || 0) * 0.35;
    return {
      x: Number(platform.x) + tiltX,
      y: Number(platform.y) + bob + tiltY,
      bob: bob + tiltY,
      tiltX,
      tiltY
    };
  }

  function traceIce(ctx, floe) {
    const sides = 8;
    ctx.beginPath();
    for (let index = 0; index < sides; index += 1) {
      const angle = (index / sides) * TAU;
      const radius = floe.r * (0.80 + 0.16 * Math.sin((Number(floe.seed) || 1) + index * 2.3));
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.72;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawPlatformsAndIce(ctx, options) {
    const platforms = Array.isArray(options.platforms) ? options.platforms : [];
    const floes = Array.isArray(options.iceFloes) ? options.iceFloes : [];
    const time = Number(options.time) || 0;

    for (const floe of floes) {
      const pose = getPlatformPose(floe, time);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.fillStyle = "rgba(2, 35, 62, 0.36)";
      ctx.beginPath();
      ctx.ellipse(8, 13, floe.r * 0.96, floe.r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.translate(0, -5);
      traceIce(ctx, floe);
      fillGradient(ctx, -floe.r, -floe.r * 0.7, floe.r, floe.r * 0.5, [
        [0, "rgba(238,253,255,0.96)"],
        [0.52, "rgba(174,229,241,0.94)"],
        [1, "rgba(79,164,192,0.93)"]
      ], "rgba(174,229,241,0.94)");
      ctx.fill();
      ctx.strokeStyle = "rgba(245,254,255,0.96)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(54,137,169,0.54)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-floe.r * 0.56, -floe.r * 0.08);
      ctx.lineTo(-floe.r * 0.16, floe.r * 0.04);
      ctx.lineTo(floe.r * 0.12, -floe.r * 0.28);
      ctx.moveTo(floe.r * 0.08, -floe.r * 0.02);
      ctx.lineTo(floe.r * 0.54, floe.r * 0.14);
      ctx.stroke();
      ctx.restore();
    }

    for (const platform of platforms) {
      const pose = getPlatformPose(platform, time);
      const radius = Number(platform.r) || 80;
      const ry = radius * 0.68;
      const sideH = Number(platform.height) || (platform.kind === "pokeball" ? 20 : 26);
      const submergedH = sideH + 14;
      ctx.save();
      ctx.translate(pose.x, pose.y);

      // Deep underwater directional shadow (matches images2.jpeg submerged platform shadows)
      ctx.fillStyle = "rgba(3, 24, 48, 0.44)";
      ctx.beginPath();
      ctx.ellipse(14, submergedH + 10, radius * 1.04, ry * 0.88, 0, 0, TAU);
      ctx.fill();

      // Refracted underwater blue-brick foundation wall (matches images2.jpeg underwater tiled wall!)
      fillGradient(ctx, 0, 0, 0, submergedH + ry, [
        [0, "rgba(36, 128, 189, 0.88)"],
        [0.55, "rgba(21, 90, 145, 0.84)"],
        [1, "rgba(10, 52, 92, 0.78)"]
      ], "rgba(21, 90, 145, 0.84)");
      ctx.beginPath();
      ctx.ellipse(0, submergedH, radius * 0.99, ry * 0.96, 0, 0, Math.PI);
      ctx.lineTo(-radius * 0.99, sideH * 0.4);
      ctx.lineTo(radius * 0.99, sideH * 0.4);
      ctx.closePath();
      ctx.fill();

      // Bright cyan water-contact foam ring at the waterline (matches images2.jpeg)
      ctx.strokeStyle = "rgba(195, 248, 255, 0.72)";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.ellipse(0, sideH + 2, radius * 1.05, ry * 0.99, 0, 0, TAU);
      ctx.stroke();

      if (platform.kind === "pokeball") {
        // 3D Blue-slate tiled cylinder wall above waterline
        fillGradient(ctx, 0, 0, 0, sideH + ry, [
          [0, "#5c7d9e"],
          [0.54, "#3b5978"],
          [1, "#223852"]
        ], "#3b5978");
        ctx.beginPath();
        ctx.ellipse(0, sideH, radius, ry, 0, 0, Math.PI);
        ctx.lineTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#d93848";
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, ry, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = "#f2f5f7";
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, ry, 0, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = "#1a2838";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, ry, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.stroke();
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.25, ry * 0.25, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "#1a2838";
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.52)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.18, -ry * 0.24, radius * 0.58, ry * 0.32, -0.04, Math.PI * 1.1, Math.PI * 1.82);
        ctx.stroke();
      } else {
        // Cerulean Gym 3D Blue-Tiled Coping Base + Sunlit Wooden Plank Deck (matches images2.jpeg!)
        fillGradient(ctx, 0, 0, 0, sideH + ry, [
          [0, "#3b658c"],
          [0.55, "#284969"],
          [1, "#182f47"]
        ], "#284969");
        ctx.beginPath();
        ctx.ellipse(0, sideH, radius, ry, 0, 0, Math.PI);
        ctx.lineTo(-radius, 0);
        ctx.lineTo(radius, 0);
        ctx.closePath();
        ctx.fill();

        // Brick joints on the platform wall
        ctx.strokeStyle = "rgba(12, 26, 42, 0.58)";
        ctx.lineWidth = 1.6;
        for (let lane = -0.75; lane <= 0.76; lane += 0.3) {
          const lx = lane * radius;
          const by = Math.sqrt(Math.max(0, 1 - lane * lane)) * ry;
          ctx.beginPath();
          ctx.moveTo(lx, by);
          ctx.lineTo(lx, by + sideH);
          ctx.stroke();
        }

        // Warm sunlit wooden plank deck (matches Misty's stage in images2.jpeg!)
        fillGradient(ctx, -radius, -ry, radius, ry, [
          [0, "#e3cca0"],
          [0.48, "#cbb07d"],
          [1, "#a68956"]
        ], "#cbb07d");
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, ry, 0, 0, TAU);
        ctx.fill();

        // Painted Court Inlay on the Wooden Deck (matches images2.jpeg red/blue/white court on wood!)
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.92, ry * 0.92, 0, 0, TAU);
        ctx.clip();

        ctx.fillStyle = "rgba(194, 82, 72, 0.42)";
        ctx.fillRect(-radius * 0.62, -ry * 0.52, radius * 0.58, ry * 1.04);
        ctx.fillStyle = "rgba(72, 138, 184, 0.42)";
        ctx.fillRect(radius * 0.04, -ry * 0.52, radius * 0.58, ry * 1.04);
        ctx.strokeStyle = "rgba(248, 250, 245, 0.78)";
        ctx.lineWidth = 2.8;
        ctx.strokeRect(-radius * 0.62, -ry * 0.52, radius * 1.24, ry * 1.04);
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.24, 0, TAU);
        ctx.stroke();

        // Horizontal wooden plank lines across the stage
        ctx.strokeStyle = "rgba(92, 64, 34, 0.42)";
        ctx.lineWidth = 1.6;
        for (let py = -ry * 0.8; py <= ry * 0.8; py += ry * 0.22) {
          ctx.beginPath();
          ctx.moveTo(-radius, py);
          ctx.lineTo(radius, py);
          ctx.stroke();
        }
        ctx.restore();

        // Outer blue-tile & wood coping rim
        ctx.strokeStyle = "#243f5e";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, ry, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "#f2dfb6";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, -1, radius * 0.96, ry * 0.96, 0, Math.PI * 1.05, Math.PI * 1.95);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function pointOnPlatform(x, y, platform) {
    if (!platform) return false;
    const radius = Math.max(1, Number(platform.r) || 1);
    const dx = Number(x) - Number(platform.x);
    const dy = (Number(y) - Number(platform.y)) / 0.72;
    return Math.hypot(dx, dy) <= radius * (platform.kind ? 0.95 : 0.92);
  }

  function resolveWaterContact(fighter, options) {
    const fieldType = options && options.fieldType;
    const platform = options && options.platform;
    const time = Number(options && options.time) || 0;
    const none = {
      active: false,
      mode: "none",
      contactAlpha: 0,
      immersionRatio: 0,
      platform: null,
      platformBob: 0,
      bob: 0
    };
    if (!fighter || fieldType !== "water") return none;
    if (platform) {
      const pose = getPlatformPose(platform, time);
      return { ...none, mode: "platform", platform, platformBob: pose.bob };
    }
    const isFlier = Boolean(fighter.flier || fighter.data && fighter.data.flier);
    if (isFlier) return { ...none, mode: "hover" };

    const jumpZ = Math.max(0, Number(fighter.z) || 0);
    const contactAlpha = 1 - smoothstep(0.5, 14, jumpZ);
    if (contactAlpha <= 0.005) return { ...none, mode: "air" };

    const shape = String(fighter.shapeSlug || "").toLowerCase();
    const types = Array.isArray(fighter.types) ? fighter.types : [];
    const swimmer = Boolean(fighter.swimmer);
    let mode = "surface";
    let immersionRatio = 0.035;
    if (shape === "fish") {
      mode = "swim";
      immersionRatio = 0.29;
    } else if (shape === "squiggle") {
      mode = "swim";
      immersionRatio = 0.22;
    } else if (shape === "tentacles") {
      mode = "swim";
      immersionRatio = 0.18;
    } else if (swimmer || types.includes("water") || types.includes("ice")) {
      mode = "float";
      immersionRatio = 0.105;
    }
    const seed = (String(fighter.id || "pokemon").charCodeAt(0) || 1) + (Number(fighter.team) || 0) * 11;
    const bobAmplitude = mode === "swim" ? 1.35 : mode === "float" ? 0.85 : 0.42;
    return {
      active: true,
      mode,
      contactAlpha,
      immersionRatio: immersionRatio * contactAlpha,
      platform: null,
      platformBob: 0,
      bob: Math.sin(time * (mode === "swim" ? 2.8 : 2.1) + seed) * bobAmplitude * contactAlpha
    };
  }

  function drawWaterContactBase(ctx, options) {
    const x = Number(options.x) || 0;
    const y = Number(options.y) || 0;
    const width = Math.max(24, Number(options.width) || 64);
    const speed = Math.max(0, Number(options.speed) || 0);
    const vx = Number(options.vx) || 0;
    const vy = Number(options.vy) || 0;
    const time = Number(options.time) || 0;
    const alpha = clamp(Number(options.alpha) || 0, 0, 1);
    if (alpha <= 0) return;

    ctx.save();
    // A soft blue subsurface shadow replaces the dry black floor ellipse.
    ctx.fillStyle = `rgba(1,28,55,${(0.20 * alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 4, width * 0.43, width * 0.15, 0, 0, TAU);
    ctx.fill();

    const pulse = Math.sin(time * 2.1 + x * 0.013 + y * 0.017);
    ctx.strokeStyle = `rgba(155,229,234,${(0.22 * alpha).toFixed(3)})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, width * (0.40 + pulse * 0.018), width * 0.13, 0, Math.PI, TAU);
    ctx.stroke();

    // Directional V wake lives behind the Pokémon and scales with motion.
    if (speed > 0.55) {
      const inv = 1 / Math.max(0.001, Math.hypot(vx, vy));
      const dx = vx * inv;
      const dy = vy * inv;
      const sideX = -dy;
      const sideY = dx;
      const wakeLength = clamp(18 + speed * 5, 22, 58);
      const wakeWidth = clamp(8 + speed * 1.5, 10, 24);
      const tailX = x - dx * wakeLength;
      const tailY = y - dy * wakeLength * 0.55;
      ctx.strokeStyle = `rgba(205,246,244,${(0.36 * alpha).toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - dx * 4, y - dy * 2);
      ctx.quadraticCurveTo(
        x - dx * wakeLength * 0.48 + sideX * wakeWidth,
        y - dy * wakeLength * 0.28 + sideY * wakeWidth * 0.44,
        tailX + sideX * wakeWidth,
        tailY + sideY * wakeWidth * 0.44
      );
      ctx.moveTo(x - dx * 4, y - dy * 2);
      ctx.quadraticCurveTo(
        x - dx * wakeLength * 0.48 - sideX * wakeWidth,
        y - dy * wakeLength * 0.28 - sideY * wakeWidth * 0.44,
        tailX - sideX * wakeWidth,
        tailY - sideY * wakeWidth * 0.44
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWaterContactFront(ctx, options) {
    const x = Number(options.x) || 0;
    const y = Number(options.y) || 0;
    const width = Math.max(24, Number(options.width) || 64);
    const speed = Math.max(0, Number(options.speed) || 0);
    const time = Number(options.time) || 0;
    const alpha = clamp(Number(options.alpha) || 0, 0, 1);
    if (alpha <= 0) return;
    const half = width * 0.42;

    ctx.save();
    // Translucent meniscus sits in front of the sprite, making the body break the surface.
    fillGradient(ctx, x, y - 5, x, y + 9, [
      [0, `rgba(176,235,238,${(0.04 * alpha).toFixed(3)})`],
      [1, `rgba(19,115,147,${(0.28 * alpha).toFixed(3)})`]
    ], `rgba(19,115,147,${(0.20 * alpha).toFixed(3)})`);
    ctx.beginPath();
    ctx.ellipse(x, y + 4, half, Math.max(5, width * 0.105), 0, 0, Math.PI);
    ctx.fill();
    ctx.strokeStyle = `rgba(226,250,247,${(0.78 * alpha).toFixed(3)})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - half, y + 1);
    ctx.quadraticCurveTo(x - half * 0.48, y + 6 + Math.sin(time * 4.5) * 1.2, x, y + 3);
    ctx.quadraticCurveTo(x + half * 0.48, y - 1 + Math.cos(time * 4.1) * 1.1, x + half, y + 1);
    ctx.stroke();

    const flecks = speed > 1.1 ? 5 : 3;
    ctx.fillStyle = `rgba(235,253,250,${(0.72 * alpha).toFixed(3)})`;
    for (let index = 0; index < flecks; index += 1) {
      const phase = time * 2.4 + index * 2.17;
      const fx = x + Math.cos(phase) * half * (0.54 + index * 0.06);
      const fy = y + 1 + Math.sin(phase * 1.3) * 3;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 1.4 + index * 0.22, 0.8 + index * 0.12, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatformForegrounds(ctx, options) {
    const platforms = Array.isArray(options.platforms) ? options.platforms : [];
    const floes = Array.isArray(options.iceFloes) ? options.iceFloes : [];
    const fighters = Array.isArray(options.fighters) ? options.fighters : [];
    const time = Number(options.time) || 0;
    function occupied(item) {
      return fighters.some(fighter => pointOnPlatform(fighter.x, fighter.y, item));
    }

    for (const platform of platforms) {
      if (!occupied(platform)) continue;
      const pose = getPlatformPose(platform, time);
      const radius = Number(platform.r) || 80;
      const ry = radius * 0.68;
      const sideH = Number(platform.height) || (platform.kind === "pokeball" ? 18 : 22);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.strokeStyle = platform.kind === "pokeball" ? "rgba(29,43,55,0.92)" : "rgba(42,23,13,0.92)";
      ctx.lineWidth = platform.kind === "pokeball" ? 7 : 5;
      ctx.beginPath();
      ctx.ellipse(0, sideH * 0.54, radius, ry + sideH * 0.32, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = "rgba(218,248,244,0.58)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, sideH + 7, radius * 1.07, ry, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
    }

    for (const floe of floes) {
      if (!occupied(floe)) continue;
      const pose = getPlatformPose(floe, time);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.strokeStyle = "rgba(234,253,255,0.78)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 3, floe.r * 0.96, floe.r * 0.68, 0, 0, Math.PI);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawArenaAtmosphere(ctx, options) {
    void ctx;
    void options;
  }

  return Object.freeze({
    drawGrassField,
    drawMechanicalBasin,
    drawWaterSurface,
    drawPlatformsAndIce,
    drawPlatformForegrounds,
    drawWaterContactBase,
    drawWaterContactFront,
    drawArenaAtmosphere,
    getPlatformPose,
    pointOnPlatform,
    resolveWaterContact
  });
});
