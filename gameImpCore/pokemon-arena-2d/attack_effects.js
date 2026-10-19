// Compact attack presentation: semantic move classification, body-part
// emitters, one-shot GIF overlays, and a short hit ring.
(function initAttackEffectSystem(root) {
  "use strict";

  const manifest = root.ATTACK_EFFECT_MANIFEST || { assets: {}, visualTypes: {} };
  const activeGifEffects = [];
  const richEffects = [];
  const recentImpacts = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  const preloaded = new Map();
  let sequenceId = 0;

  const ELEMENT_COLORS = Object.freeze({
    normal: ["#ffffff", "#94a3b8"], fire: ["#fff7a8", "#ff3d00"],
    water: ["#e0fbff", "#009dff"], electric: ["#ffffff", "#ffe100"],
    grass: ["#efffd8", "#35e66a"], ice: ["#ffffff", "#4de7ff"],
    fighting: ["#fff2da", "#ff5a36"], poison: ["#ffd5ff", "#be3dff"],
    ground: ["#fff0ad", "#d9822b"], flying: ["#f6fbff", "#70c8ff"],
    psychic: ["#fff0ff", "#ff45ce"], bug: ["#f4ffb8", "#9bd900"],
    rock: ["#fff1bf", "#c88732"], ghost: ["#f0ddff", "#713cff"],
    dragon: ["#f2e7ff", "#6f5cff"], dark: ["#dce0ff", "#42245f"],
    steel: ["#ffffff", "#80a8c4"], fairy: ["#ffffff", "#ff73ce"]
  });

  const ELEMENT_HUES = Object.freeze({
    normal: 0, fire: 165, water: 0, electric: 150, grass: 82, ice: -18,
    fighting: 170, poison: 98, ground: 142, flying: -22, psychic: 105,
    bug: 78, rock: 135, ghost: 58, dragon: 70, dark: 42, steel: -10, fairy: 118
  });

  // Fire and Normal keep their existing presentation. The sixteen requested
  // types use purpose-drawn, color-accurate GIFs instead of hue-rotating one
  // generic energy image.
  const SIMPLE_ELEMENT_TYPES = new Set([
    "water", "electric", "grass", "ice", "fighting", "poison", "ground", "flying",
    "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"
  ]);
  const DIRECTIONAL_ELEMENT_TYPES = new Set(["water", "electric", "grass", "flying", "dragon"]);

  const MOUTH_SHAPES = new Set(["quadruped", "fish", "squiggle", "heads", "wings", "bug-wings", "tentacles"]);
  const HAND_SHAPES = new Set(["humanoid", "arms", "upright"]);
  const BODY_SHAPES = new Set(["ball", "blob", "armor", "legs"]);
  const CANNON_SPECIES = new Set([
    "blastoise", "clawitzer", "magmortar", "genesect", "armarouge",
    "celesteela", "iron-bundle", "inteleon"
  ]);
  const DUAL_CANNON_SPECIES = new Set(["blastoise", "magmortar", "celesteela"]);
  const BODY_EMITTER_SPECIES = new Set([
    "venusaur", "ivysaur", "bulbasaur", "pikachu", "raichu", "magnemite",
    "magneton", "magnezone", "voltorb", "electrode", "ampharos"
  ]);

  const BITE_RE = /(?:^|[-_\s])(bite|crunch|fangs?|jaw|chomp|(?:vice|vise)-?grip)(?:$|[-_\s])/i;
  const CLAW_RE = /(?:claw|scratch|slash|swipes?|cut|fury-cutter|night-slash|x-scissor|leaf-blade|cross-poison)/i;
  const HAND_RE = /(?:punch|fist|karate|chop|hammer|brick-break|close-combat|force-palm|jab)/i;
  const MOUTH_RE = /(?:breath|flamethrower|ember|water-gun|hydro-pump|spout|roar|voice|snarl|acid|spit|belch|blizzard)/i;
  const CANNON_MOVE_RE = /(?:cannon|blast|beam|pump|pulse|shot|gun|snipe|techno)/i;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeToken(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getSpeciesSlug(user) {
    return normalizeToken(user?.data?.id || user?.id || "");
  }

  function getFormSlug(user) {
    const mega = user?.megaMode > 0 ? user?.data?.megas?.[user.megaMode - 1]?.formSlug : "";
    const gmax = user?.gmaxMode > 0 ? user?.data?.gmaxs?.[user.gmaxMode - 1]?.formSlug : "";
    return normalizeToken(
      gmax || mega || user?.regionalForm?.formSlug || user?.pokeData?.slug || user?.data?.id || user?.id || ""
    );
  }

  function getMoveTokens(move) {
    return [move?.sourceMoveSlug, move?.sourceMoveName, move?.name, move?.jpName, move?.type]
      .map(normalizeToken)
      .filter(Boolean)
      .join(" ");
  }

  function getMoveIdentityTokens(move) {
    // Prefer the canonical source identity. Lower-priority labels can describe
    // the arena visual (for example "Slash") rather than the actual move and
    // must not reclassify a canonical Tackle as a claw attack.
    return normalizeToken(
      move?.sourceMoveSlug || move?.sourceMoveName || move?.name || move?.jpName || move?.type
    );
  }

  function getElementAssetKey(element) {
    const normalized = normalizeToken(element);
    const key = `element_${normalized}`;
    return SIMPLE_ELEMENT_TYPES.has(normalized) && manifest.assets[key] ? key : null;
  }

  function getElementColors(element) {
    return ELEMENT_COLORS[normalizeToken(element)] || ELEMENT_COLORS.normal;
  }

  function isSimpleElementType(element) {
    return SIMPLE_ELEMENT_TYPES.has(normalizeToken(element));
  }

  function drawStarPath(ctx, points, outerRadius, innerRadius) {
    ctx.beginPath();
    for (let index = 0; index < points * 2; index++) {
      const radius = index % 2 === 0 ? outerRadius : innerRadius;
      const angle = -Math.PI * 0.5 + (index * Math.PI) / points;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Draws a small, readable in-flight glyph without changing projectile data.
  // It is intentionally made only from Canvas primitives so it stays crisp,
  // lightweight, and aligned with the dedicated cast GIF for each type.
  function drawElementProjectile(ctx, projectile, time = 0) {
    if (!ctx || !projectile) return false;
    const element = normalizeToken(projectile.elementType);
    if (!SIMPLE_ELEMENT_TYPES.has(element)) return false;

    const [core, accent] = getElementColors(element);
    const x = Number(projectile.x) || 0;
    const y = Number(projectile.y) || 0;
    const radius = clamp(Number(projectile.r) || 12, 6, 42);
    let vx = Number(projectile.vx);
    let vy = Number(projectile.vy);
    if (!Number.isFinite(vx)) vx = 1;
    if (!Number.isFinite(vy)) vy = 0;
    if (Math.hypot(vx, vy) < 0.001) vx = 1;
    const pulse = 0.94 + Math.sin((Number(time) || 0) * 13 + x * 0.025) * 0.08;
    const r = radius * pulse;
    const travelAngle = Math.atan2(vy, vx);
    const directional = DIRECTIONAL_ELEMENT_TYPES.has(element);

    ctx.save();
    ctx.translate(x, y);
    if (directional) ctx.rotate(travelAngle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = accent;
    ctx.shadowBlur = Math.min(4, Math.max(1.5, r * 0.16));
    ctx.fillStyle = accent;
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(1.5, r * 0.16);

    if (element === "water") {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.bezierCurveTo(r * 0.2, -r * 0.8, -r * 0.8, -r * 0.55, -r * 0.72, 0);
      ctx.bezierCurveTo(-r * 0.8, r * 0.55, r * 0.2, r * 0.8, r, 0);
      ctx.fill();
      ctx.stroke();
    } else if (element === "electric") {
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.35);
      ctx.lineTo(-r * 0.12, -r * 0.08);
      ctx.lineTo(-r * 0.36, r * 0.55);
      ctx.lineTo(r, r * 0.2);
      ctx.lineTo(r * 0.1, -r * 0.04);
      ctx.lineTo(r * 0.34, -r * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (element === "grass") {
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, 0);
      ctx.lineTo(r * 0.72, 0);
      ctx.stroke();
    } else if (element === "ice") {
      for (let arm = 0; arm < 3; arm++) {
        const angle = arm * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * -r, Math.sin(angle) * -r);
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        ctx.stroke();
      }
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (element === "fighting") {
      ctx.beginPath();
      ctx.moveTo(-r * 0.82, r * 0.62);
      ctx.lineTo(-r * 0.92, -r * 0.16);
      ctx.lineTo(-r * 0.58, -r * 0.68);
      ctx.lineTo(-r * 0.2, -r * 0.52);
      ctx.lineTo(r * 0.06, -r * 0.88);
      ctx.lineTo(r * 0.4, -r * 0.62);
      ctx.lineTo(r * 0.72, -r * 0.36);
      ctx.lineTo(r * 0.82, r * 0.42);
      ctx.lineTo(r * 0.34, r * 0.82);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (element === "poison") {
      for (const [bx, by, br] of [[-0.36, 0.25, 0.55], [0.3, 0.18, 0.68], [0.16, -0.56, 0.38]]) {
        ctx.beginPath();
        ctx.arc(bx * r, by * r, br * r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (element === "ground") {
      for (const [bx, by, br] of [[-0.55, 0.3, 0.52], [0, 0, 0.72], [0.55, 0.3, 0.48]]) {
        ctx.beginPath();
        ctx.arc(bx * r, by * r, br * r, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.34);
      ctx.lineTo(r, r * 0.34);
      ctx.stroke();
    } else if (element === "flying") {
      for (let band = -1; band <= 1; band++) {
        ctx.beginPath();
        ctx.arc(-r * 0.25, band * r * 0.36, r * (0.75 - Math.abs(band) * 0.08), -0.82, 0.82);
        ctx.stroke();
      }
    } else if (element === "psychic") {
      ctx.save();
      ctx.rotate((Number(time) || 0) * 2.4);
      for (let ring = 1; ring <= 2; ring++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, r * (0.48 + ring * 0.28), r * (0.22 + ring * 0.14), ring * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    } else if (element === "bug") {
      ctx.beginPath();
      ctx.ellipse(-r * 0.48, 0, r * 0.52, r * 0.72, -0.42, 0, Math.PI * 2);
      ctx.ellipse(r * 0.48, 0, r * 0.52, r * 0.72, 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.22, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (element === "rock") {
      ctx.save();
      ctx.rotate((Number(time) || 0) * 1.8);
      ctx.beginPath();
      for (let point = 0; point < 7; point++) {
        const angle = (point / 7) * Math.PI * 2;
        const pr = r * (point % 2 ? 0.78 : 1);
        const px = Math.cos(angle) * pr;
        const py = Math.sin(angle) * pr;
        if (point === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (element === "ghost") {
      ctx.beginPath();
      ctx.arc(0, -r * 0.18, r * 0.74, Math.PI, 0);
      ctx.lineTo(r * 0.74, r * 0.72);
      ctx.lineTo(r * 0.28, r * 0.42);
      ctx.lineTo(0, r * 0.78);
      ctx.lineTo(-r * 0.28, r * 0.42);
      ctx.lineTo(-r * 0.74, r * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = core;
      for (const eyeX of [-0.27, 0.27]) {
        ctx.beginPath();
        ctx.arc(eyeX * r, -r * 0.14, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (element === "dragon") {
      ctx.beginPath();
      for (let step = 0; step <= 20; step++) {
        const frac = step / 20;
        const angle = frac * Math.PI * 2.4;
        const sr = r * (1 - frac * 0.7);
        const px = Math.cos(angle) * sr;
        const py = Math.sin(angle) * sr;
        if (step === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = accent;
      drawStarPath(ctx, 3, r * 0.42, r * 0.18);
      ctx.fill();
    } else if (element === "dark") {
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, r * 0.46);
      ctx.beginPath();
      ctx.arc(-r * 0.08, 0, r * 0.7, -1.18, 1.18);
      ctx.stroke();
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath();
      ctx.arc(-r * 0.08, 0, r * 0.94, -1.05, 1.05);
      ctx.stroke();
    } else if (element === "steel") {
      ctx.save();
      ctx.rotate((Number(time) || 0) * 1.4);
      ctx.lineWidth = Math.max(2.5, r * 0.22);
      for (let arm = 0; arm < 4; arm++) {
        const angle = arm * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * -r, Math.sin(angle) * -r);
        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
        ctx.stroke();
      }
      ctx.restore();
    } else if (element === "fairy") {
      ctx.save();
      ctx.rotate((Number(time) || 0) * 1.8);
      drawStarPath(ctx, 5, r, r * 0.42);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    return true;
  }

  function inferSpecialEmitter(user, move, baseProfile, tokens) {
    const species = getSpeciesSlug(user);
    const form = getFormSlug(user);
    const shape = normalizeToken(user?.shapeSlug || "upright");
    const element = normalizeToken(move?.elementType || user?.types?.[0] || "normal");
    const hasCannonAnatomy = CANNON_SPECIES.has(species) || (species === "slowbro" && form.includes("galar"));

    if (
      hasCannonAnatomy &&
      (baseProfile.family === "beam" || baseProfile.family === "projectile" || CANNON_MOVE_RE.test(tokens))
    ) {
      return "cannon";
    }
    if (MOUTH_RE.test(tokens)) return "mouth";
    if (HAND_RE.test(tokens) && HAND_SHAPES.has(shape)) return "hand";
    if (BODY_EMITTER_SPECIES.has(species) || BODY_SHAPES.has(shape)) return "body";
    if (MOUTH_SHAPES.has(shape)) return "mouth";
    if (HAND_SHAPES.has(shape)) return "hand";
    if (["fire", "water", "ice", "dragon", "poison"].includes(element)) return "mouth";
    return baseProfile.emitter === "mouth" ? "mouth" : "body";
  }

  function resolveAttackEffectProfile(user, move) {
    // Arena effect IDs intentionally contain underscores (for example
    // shadowball_mini), so keep their canonical key intact for manifest lookup.
    const visualType = String(move?.type || "").trim().toLowerCase();
    const base = manifest.visualTypes[visualType] || {
      family: move?.category === "physical" ? "contact" : "projectile",
      emitter: move?.category === "physical" ? "contact" : "body",
      asset: move?.category === "physical" ? "impact" : "body"
    };
    const tokens = getMoveTokens(move);
    const identityTokens = getMoveIdentityTokens(move);
    const element = normalizeToken(move?.elementType || user?.types?.[0] || "normal");
    const elementAsset = getElementAssetKey(element);

    if (base.nativeOnly) {
      // Canvas-native effects still need the same anatomy-aware origin as GIF
      // effects. In particular, Hydro Pump must leave Blastoise's cannons,
      // while self/status effects retain their manifest-defined origin.
      const nativeEmitter = base.family === "status" || base.family === "movement"
        ? base.emitter
        : inferSpecialEmitter(user, move, base, tokens);
      return {
        ...base,
        visualType,
        element,
        action: base.family === "status" || base.family === "movement"
          ? "status"
          : base.family === "area" ? "channel" : base.family === "beam" ? "beam" : "cast",
        emitter: nativeEmitter,
        asset: null,
        nativeOnly: true
      };
    }

    if (move?.category === "status" || base.family === "status" || base.family === "movement") {
      return { ...base, visualType, element, action: "status", asset: null };
    }

    if (base.family === "contact") {
      let action = "impact";
      let asset = "impact";
      if (BITE_RE.test(` ${identityTokens} `)) {
        action = "bite";
        asset = "fang";
      } else if (CLAW_RE.test(identityTokens)) {
        action = "claw";
        asset = "claw";
      } else if (HAND_RE.test(identityTokens)) {
        action = "punch";
        asset = "impact";
      }
      // Keep explicit claw/fang silhouettes, but use the requested elemental
      // animation for punches, tackles, stomps, horns, and other contact hits.
      if (action !== "bite" && action !== "claw" && elementAsset) asset = elementAsset;
      return {
        ...base,
        visualType,
        element,
        action,
        emitter: "contact",
        asset,
        simpleElemental: asset === elementAsset
      };
    }

    const emitter = inferSpecialEmitter(user, move, base, tokens);
    const emitterAsset = emitter === "cannon" ? "cannon" : emitter === "mouth" ? "mouth" : emitter === "hand" ? "hand" : "body";
    const asset = elementAsset || emitterAsset;
    return {
      ...base,
      visualType,
      element,
      action: base.family === "beam" ? "beam" : base.family === "area" ? "channel" : "cast",
      emitter,
      asset,
      simpleElemental: Boolean(elementAsset)
    };
  }

  function normalizeDirection(user, dirX, dirY) {
    let x = Number(dirX);
    let y = Number(dirY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.001) {
      const angle = Number.isFinite(user?.faceAngle) ? user.faceAngle : user?.facing === -1 ? Math.PI : 0;
      x = Math.cos(angle);
      y = Math.sin(angle);
    }
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  function resolveEmitterAnchor(user, emitter, dirX, dirY, perpendicularOffset = 0) {
    const dir = normalizeDirection(user, dirX, dirY);
    const species = getSpeciesSlug(user);
    const size = clamp(Number(user?.targetPx) || 68 * (Number(user?.scale) || 1.35), 34, 236);
    const floorY =
      (Number(user?.y) || 0) + 14 - (Number(user?.z) || 0) - (Number(user?.groundZ) || 0);
    const centerX = Number(user?.x) || 0;
    const centerY = floorY - size * 0.45;
    const perpX = -dir.y;
    const perpY = dir.x;

    if ((emitter === "cannon" || emitter === "left_cannon" || emitter === "right_cannon") && species === "blastoise") {
      // Blastoise uses a 4-directional 3/4-view sprite (front-left, front-right,
      // back-left, back-right). Its two shoulder barrels sit near the top of its
      // shell (~0.77..0.82 of sprite height above the feet) and remain horizontally
      // separated on its left and right shoulders regardless of firing angle.
      const effectiveOffset =
        emitter === "left_cannon"
          ? -0.17
          : emitter === "right_cannon"
            ? 0.17
            : perpendicularOffset;
      const dir8 = typeof user?.dir8 === "string" ? user.dir8 : "";
      const rawIsBackDir = dir8 ? (dir8.includes("back") || dir8 === "N" || dir8 === "NE" || dir8 === "NW") : dir.y < -0.15;
      const faceRight = dir8
        ? (dir8.includes("right") || dir8 === "E" || dir8 === "NE" || dir8 === "SE"
            ? true
            : dir8.includes("left") || dir8 === "W" || dir8 === "NW" || dir8 === "SW"
              ? false
              : dir.x < -0.05
                ? false
                : dir.x > 0.05
                  ? true
                  : (user?.facing ?? 1) >= 0)
        : dir.x < -0.05
          ? false
          : dir.x > 0.05
            ? true
            : (user?.facing ?? 1) >= 0;
      const isGmax =
        (Number(user?.gmaxMode) || 0) > 0 ||
        Boolean(user?.sprite && String(user.sprite).includes("blastoise-gmax"));
      const isMega =
        (Number(user?.megaMode) || 0) > 0 ||
        Boolean(user?.sprite && String(user.sprite).includes("blastoise-mega"));
      const isBackDir = isGmax ? !rawIsBackDir : rawIsBackDir;
      const hSign = faceRight ? 1 : -1;

      let barrelOffsetX;
      let barrelHeightRatio;
      if (Math.abs(effectiveOffset) < 0.01) {
        // Central dorsal cannon (Mega Blastoise main barrel / single-anchor query)
        barrelOffsetX = hSign * (isMega ? -0.05 : -0.14);
        barrelHeightRatio = isMega ? 0.86 : 0.80;
      } else if (!isBackDir) {
        // front.gif (70x66): outer shoulder barrel at x=-0.34, y=0.81 from bottom;
        // inner shoulder barrel at x=+0.04, y=0.76 from bottom (mirrored when facing right).
        if (faceRight) {
          barrelOffsetX = effectiveOffset < 0 ? -0.04 : 0.34;
          barrelHeightRatio = effectiveOffset < 0 ? 0.76 : 0.81;
        } else {
          barrelOffsetX = effectiveOffset < 0 ? -0.34 : 0.04;
          barrelHeightRatio = effectiveOffset < 0 ? 0.81 : 0.76;
        }
      } else {
        // back.gif (68x68): outer shoulder barrel at x=-0.36, y=0.77 from bottom;
        // inner shoulder barrel at x=+0.01, y=0.78 from bottom (mirrored when facing back-left).
        if (faceRight) {
          barrelOffsetX = effectiveOffset < 0 ? -0.36 : 0.01;
          barrelHeightRatio = effectiveOffset < 0 ? 0.77 : 0.78;
        } else {
          barrelOffsetX = effectiveOffset < 0 ? -0.01 : 0.36;
          barrelHeightRatio = effectiveOffset < 0 ? 0.78 : 0.77;
        }
      }

      const muzzleNudgeX = dir.x * size * 0.06;
      const muzzleNudgeY = dir.y * size * 0.04;
      return {
        x: centerX + barrelOffsetX * size + muzzleNudgeX,
        y: floorY - barrelHeightRatio * size + muzzleNudgeY,
        size,
        angle: Math.atan2(dir.y, dir.x),
        dirX: dir.x,
        dirY: dir.y
      };
    }

    let forward = 0.18;
    let vertical = 0;

    if (emitter === "mouth") {
      forward = 0.34;
      vertical = -0.08;
    } else if (emitter === "hand") {
      forward = 0.38;
      vertical = 0.08;
    } else if (emitter === "cannon") {
      forward = 0.43;
      vertical = -0.15;
    } else if (emitter === "contact") {
      forward = 0.58;
      vertical = 0.12;
    }

    return {
      x: centerX + dir.x * size * forward + perpX * size * perpendicularOffset,
      y: centerY + dir.y * size * forward + size * vertical + perpY * size * perpendicularOffset,
      size,
      angle: Math.atan2(dir.y, dir.x),
      dirX: dir.x,
      dirY: dir.y
    };
  }

  function trimOldEffects() {
    while (activeGifEffects.length >= 22) {
      const oldest = activeGifEffects.shift();
      if (oldest?.node?.parentNode) oldest.node.parentNode.removeChild(oldest.node);
    }
    if (richEffects.length > 240) richEffects.splice(0, richEffects.length - 240);
  }

  function createGifEffect(assetKey, options) {
    const asset = manifest.assets[assetKey];
    if (!asset || typeof document === "undefined") return null;
    const layer = document.getElementById("attack-gif-layer");
    if (!layer) return null;

    trimOldEffects();
    // Re-triggering the same emitter replaces its previous one-shot instead of
    // stacking another bright layer. Dual cannons remain independent because
    // their perpendicular offsets differ.
    if (options.owner) {
      for (let index = activeGifEffects.length - 1; index >= 0; index--) {
        const previous = activeGifEffects[index];
        if (
          previous.owner === options.owner &&
          previous.emitter === (options.emitter || "body") &&
          previous.perpendicularOffset === (options.perpendicularOffset || 0)
        ) {
          if (previous.node?.parentNode) previous.node.parentNode.removeChild(previous.node);
          activeGifEffects.splice(index, 1);
        }
      }
    }
    const node = document.createElement("img");
    const runId = ++sequenceId;
    const isElementAsset = assetKey.startsWith("element_");
    const phase = options.phase || "release";
    node.className = `attack-gif-effect attack-gif-${assetKey} attack-gif-phase-${phase}${isElementAsset ? " attack-gif-element" : ""}`;
    node.alt = "";
    node.draggable = false;
    node.decoding = "async";
    // A fragment gives every DOM image a fresh animation identity while the
    // browser can reuse the same decoded/file payload (fragments are not sent).
    node.src = `${asset.src}#fx=${runId}`;
    node.style.setProperty("--attack-fx-hue", `${isElementAsset ? 0 : ELEMENT_HUES[options.element] || 0}deg`);
    layer.appendChild(node);

    const effect = {
      node,
      asset,
      assetKey,
      owner: options.owner || null,
      emitter: options.emitter || "body",
      perpendicularOffset: options.perpendicularOffset || 0,
      dirX: options.dirX,
      dirY: options.dirY,
      x: options.x,
      y: options.y,
      angle: Number.isFinite(options.angle) ? options.angle : 0,
      lockUpright: options.lockUpright ?? isElementAsset,
      sizeMult: options.sizeMult || 1,
      phase,
      age: 0,
      duration: (asset.durationMs || 600) / 1000
    };
    node.onerror = () => {
      effect.age = effect.duration;
    };
    activeGifEffects.push(effect);
    return effect;
  }

  function addRichEffect(effect) {
    richEffects.push({ age: 0, ...effect });
    trimOldEffects();
  }

  function spawnAttackSequence(user, move, dirX, dirY, powerScale = 1, rangeScale = 1) {
    const profile = resolveAttackEffectProfile(user, move);
    if (!profile.asset) return profile;

    const anchor = resolveEmitterAnchor(user, profile.emitter, dirX, dirY);
    const strength = clamp(Number(powerScale) || 1, 0.7, 2.2);
    const simpleElemental = Boolean(profile.simpleElemental);
    const isContact = profile.family === "contact";
    const species = getSpeciesSlug(user);
    const isCannon = profile.emitter === "cannon";
    const offsets = isCannon && DUAL_CANNON_SPECIES.has(species) ? [-0.17, 0.17] : [0];
    if (isCannon && species === "blastoise" && (user?.megaMode > 0 || user?.gmaxMode > 0)) offsets.push(0);

    // Contact silhouettes belong on the target at the moment of impact. The
    // one emitter GIF used by ranged attacks doubles as the short charge and
    // release cue, matching the reference without layering a second halo.
    if (!isContact) {
      offsets.forEach((perpendicularOffset, index) => {
        createGifEffect(profile.asset, {
          owner: user,
          emitter: profile.emitter,
          perpendicularOffset,
          dirX: anchor.dirX,
          dirY: anchor.dirY,
          angle: anchor.angle,
          element: profile.element,
          phase: "charge",
          lockUpright: simpleElemental
            ? !DIRECTIONAL_ELEMENT_TYPES.has(profile.element)
            : false,
          sizeMult: clamp(
            (0.28 + anchor.size / 180) * (0.84 + strength * 0.14) * (index === 2 ? 1.18 : 1) *
              (simpleElemental ? 0.82 : 1) * (isContact ? 0.68 : 0.76),
            isContact ? 0.3 : 0.32,
            isContact ? 0.72 : simpleElemental ? 0.82 : 0.92
          )
        });
      });
    }
    return profile;
  }

  function spawnImpactSequence(target, element = "normal", power = 12, options = {}) {
    if (!target) return false;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (recentImpacts) {
      if (recentImpacts.has(target)) {
        const last = recentImpacts.get(target);
        if (now - last < 240) return false;
      }
      recentImpacts.set(target, now);
    }

    const normalizedElement = normalizeToken(element || "normal");
    // Game callers identify true contact separately from the damage category.
    // Preserve the physical fallback for older/direct callers, while keeping
    // non-contact physical projectiles out of the restrained melee treatment.
    const restrainedContact = options.contact === undefined
      ? Boolean(options.physical)
      : Boolean(options.contact);
    const primaryAsset = String(options.primaryAsset || "");
    const targetSize = clamp(Number(target.targetPx) || 68 * (Number(target.scale) || 1.35), 34, 236);
    const strength = clamp((Number(power) || 12) / 18, 0.65, 2.1);
    const x = Number(target.x) || 0;
    const y =
      (Number(target.y) || 0) + 14 - (Number(target.z) || 0) -
      (Number(target.groundZ) || 0) - targetSize * 0.42;
    const elementAsset = getElementAssetKey(normalizedElement);
    const contactAsset = manifest.assets[primaryAsset]
      ? primaryAsset
      : elementAsset || "impact";
    const hitAsset = restrainedContact ? contactAsset : null;
    if (hitAsset) {
      const directionalElement = hitAsset.startsWith("element_") && DIRECTIONAL_ELEMENT_TYPES.has(normalizedElement);
      createGifEffect(hitAsset, {
        x,
        y,
        angle: Number.isFinite(options.angle) ? options.angle : 0,
        element: normalizedElement,
        phase: "impact",
        lockUpright:
          hitAsset === "fang" ||
          hitAsset === "impact" ||
          (hitAsset.startsWith("element_") && !directionalElement),
        sizeMult: clamp(
          (0.24 + targetSize / 190) * (0.82 + strength * 0.16) * (restrainedContact ? 0.7 : 0.76),
          restrainedContact ? 0.28 : 0.34,
          restrainedContact ? 0.56 : 0.72
        )
      });
    }

    // Contact GIFs contain their own restrained hit cue. Ranged attacks use a
    // single thin ring; never stack the two presentations.
    if (!restrainedContact && !hitAsset) {
      const colors = getElementColors(normalizedElement);
      addRichEffect({
        kind: "impact",
        x,
        y,
        size: clamp(48 + targetSize * 0.28 + strength * 10, 62, 105),
        duration: 0.22,
        subtle: true,
        rays: 0,
        color: options.effectiveness >= 2 ? "#fff8a8" : colors[0],
        accent: colors[1]
      });
    }
    return true;
  }

  function updateAttackEffects(dt) {
    const step = clamp(Number(dt) || 0, 0, 0.08);
    for (let i = activeGifEffects.length - 1; i >= 0; i--) {
      const effect = activeGifEffects[i];
      effect.age += step;
      if (effect.age >= effect.duration) {
        if (effect.node?.parentNode) effect.node.parentNode.removeChild(effect.node);
        activeGifEffects.splice(i, 1);
      }
    }
    for (let i = richEffects.length - 1; i >= 0; i--) {
      const effect = richEffects[i];
      effect.age += step;
      if (effect.kind === "spark") {
        effect.x += effect.vx * step;
        effect.y += effect.vy * step;
        effect.vx *= Math.pow(0.12, step);
        effect.vy *= Math.pow(0.12, step);
      }
      if (effect.age >= effect.duration) richEffects.splice(i, 1);
    }
  }

  function currentEffectAnchor(effect) {
    if (!effect.owner) return effect;
    return resolveEmitterAnchor(
      effect.owner,
      effect.emitter,
      effect.dirX,
      effect.dirY,
      effect.perpendicularOffset || 0
    );
  }

  function syncAttackGifEffects(camOffsetX, camOffsetY) {
    for (const effect of activeGifEffects) {
      const anchor = currentEffectAnchor(effect);
      const assetSize = (effect.asset.displaySize || 220) * effect.sizeMult;
      const pivot = effect.asset.pivot || [0.5, 0.5];
      const life = clamp(1 - effect.age / effect.duration, 0, 1);
      effect.node.style.width = `${assetSize}px`;
      effect.node.style.height = `${assetSize}px`;
      effect.node.style.left = `${anchor.x + camOffsetX - assetSize * pivot[0]}px`;
      effect.node.style.top = `${anchor.y + camOffsetY - assetSize * pivot[1]}px`;
      effect.node.style.transformOrigin = `${pivot[0] * 100}% ${pivot[1] * 100}%`;
      const rotation = effect.lockUpright
        ? 0
        : Number.isFinite(effect.angle) ? effect.angle : anchor.angle || 0;
      effect.node.style.transform = `rotate(${rotation}rad)`;
      effect.node.style.opacity = `${clamp(life * 1.25, 0, 1)}`;
    }
  }

  function drawRing(ctx, x, y, radius, color, alpha, width) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, radius), 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRichAttackEffects(ctx) {
    if (!ctx || richEffects.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (const effect of richEffects) {
      const anchor = currentEffectAnchor(effect);
      const t = clamp(effect.age / effect.duration, 0, 1);
      const fade = Math.sin(Math.PI * Math.min(1, t)) * (1 - t * 0.22);
      const x = anchor.x;
      const y = anchor.y;

      if (effect.kind === "spark") {
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = effect.size * (1 - t * 0.5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - effect.vx * 0.035, y - effect.vy * 0.035);
        ctx.stroke();
        continue;
      }

      if (effect.kind === "charge") {
        const radius = effect.size * (0.16 + t * 0.68);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(8, radius));
        glow.addColorStop(0, effect.color);
        glow.addColorStop(0.22, effect.accent);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(8, radius), 0, Math.PI * 2);
        ctx.fill();
        drawRing(ctx, x, y, radius * 0.74, effect.color, fade, 2.5 + (1 - t) * 3);
        drawRing(ctx, x, y, radius, effect.accent, fade * 0.72, 1.5);
        continue;
      }

      if (effect.kind === "release") {
        const length = effect.size * (0.4 + t * 0.95);
        const width = effect.size * (0.23 + (1 - t) * 0.22);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(effect.angle || 0);
        const beam = ctx.createLinearGradient(0, 0, length, 0);
        beam.addColorStop(0, effect.color);
        beam.addColorStop(0.32, effect.accent);
        beam.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = fade * 0.76;
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(0, -width * 0.42);
        ctx.lineTo(length, 0);
        ctx.lineTo(0, width * 0.42);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        drawRing(ctx, x, y, width * 0.72, effect.color, fade * 0.9, 3.2);
        continue;
      }

      if (effect.kind === "slashEcho") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((effect.angle || 0) - 0.72);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.strokeStyle = effect.accent;
        ctx.lineWidth = Math.max(1, effect.size * 0.08 * (1 - t));
        ctx.beginPath();
        ctx.arc(0, 0, effect.size * (0.3 + t * 0.38), -1.2, 1.2);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (effect.kind === "impact") {
        const radius = effect.size * (0.16 + t * 0.72);
        const outerWidth = effect.subtle ? 2.3 * (1 - t) + 0.8 : 4.5 * (1 - t) + 1;
        drawRing(ctx, x, y, radius, effect.color, (1 - t) * 0.95, outerWidth);
        if (!effect.subtle) {
          drawRing(ctx, x, y, radius * 0.66, effect.accent, (1 - t) * 0.82, 2.5);
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = (1 - t) * 0.88;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = 2.3;
        const rayCount = effect.rays ?? 12;
        for (let ray = 0; ray < rayCount; ray++) {
          const angle = (ray / rayCount) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * radius * 0.3, Math.sin(angle) * radius * 0.3);
          ctx.lineTo(Math.cos(angle) * radius * (1.05 + (ray % 3) * 0.16), Math.sin(angle) * radius * (1.05 + (ray % 3) * 0.16));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function preloadAttackEffectGifs() {
    if (typeof Image === "undefined") return;
    Object.values(manifest.assets || {}).forEach(asset => {
      if (!asset?.src || preloaded.has(asset.src)) return;
      const image = new Image();
      image.src = asset.src;
      preloaded.set(asset.src, image);
    });
  }

  root.AttackEffectSystem = Object.freeze({
    getElementColors,
    isSimpleElementType,
    drawElementProjectile,
    resolveAttackEffectProfile,
    resolveEmitterAnchor,
    spawnAttackSequence,
    spawnImpactSequence,
    updateAttackEffects,
    drawRichAttackEffects,
    syncAttackGifEffects,
    preloadAttackEffectGifs,
    get activeGifCount() { return activeGifEffects.length; },
    get richEffectCount() { return richEffects.length; }
  });
  root.spawnAttackSequence = spawnAttackSequence;
  root.spawnImpactSequence = spawnImpactSequence;
  root.getAttackElementColors = getElementColors;
  root.isSimpleAttackElement = isSimpleElementType;
  root.drawElementProjectile = drawElementProjectile;
  root.updateAttackEffects = updateAttackEffects;
  root.drawRichAttackEffects = drawRichAttackEffects;
  root.syncAttackGifEffects = syncAttackGifEffects;
  root.preloadAttackEffectGifs = preloadAttackEffectGifs;

  preloadAttackEffectGifs();
})(typeof window !== "undefined" ? window : globalThis);
