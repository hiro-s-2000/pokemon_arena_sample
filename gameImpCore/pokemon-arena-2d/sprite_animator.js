// Pokémon Arena 2D - Live Multi-Frame GIF + 60fps Battle Choreography Animator (using ../pokeSprite/*.gif)

const DIRS_8_LIST = [
  "right",
  "front-right",
  "front",
  "front-left",
  "left",
  "back-left",
  "back",
  "back-right"
];

// Pool of live DOM <img> nodes inside #battlefield-sprites-layer so browsers natively play all 50-75 GIF frames
const BF_DOM_MAP = new Map();
let bfFighterUidCounter = 1;

function ensureFighterDomNode(f) {
  if (!f._bfUid) {
    f._bfUid = bfFighterUidCounter++;
  }
  let entry = BF_DOM_MAP.get(f._bfUid);
  if (!entry) {
    const layer = document.getElementById("battlefield-sprites-layer");
    if (!layer) return null;
    const wrap = document.createElement("div");
    wrap.className = "bf-fighter-node";

    const ghosts = [];
    for (let i = 0; i < 3; i++) {
      const gImg = document.createElement("img");
      gImg.className = "bf-ghost-gif";
      gImg.style.opacity = "0";
      wrap.appendChild(gImg);
      ghosts.push({ el: gImg, lastSrc: "" });
    }

    const mainImg = document.createElement("img");
    mainImg.className = "bf-fighter-gif";
    wrap.appendChild(mainImg);

    layer.appendChild(wrap);
    entry = { wrap, mainImg, lastSrc: "", ghosts };
    BF_DOM_MAP.set(f._bfUid, entry);
  }
  return entry;
}

function cleanupUnusedFighterDomNodes(activeFighters, camShakeX = 0, camShakeY = 0) {
  const layer = document.getElementById("battlefield-sprites-layer");
  if (layer) {
    if (camShakeX !== 0 || camShakeY !== 0) {
      layer.style.transform = `translate3d(${camShakeX.toFixed(1)}px, ${camShakeY.toFixed(1)}px, 0)`;
    } else {
      layer.style.transform = "none";
    }
  }
  const activeSet = new Set(activeFighters.map(f => f._bfUid).filter(Boolean));
  for (const [uid, entry] of BF_DOM_MAP.entries()) {
    if (!activeSet.has(uid)) {
      if (entry.wrap && entry.wrap.parentNode) {
        entry.wrap.parentNode.removeChild(entry.wrap);
      }
      BF_DOM_MAP.delete(uid);
    }
  }
}

/**
 * Converts a radian angle atan2(dy, dx) into one of the 8 compass directions
 * with hysteresis around octant boundaries so directions never flicker.
 */
function angleTo8Dir(rad, currentDir = null, fallbackFacing = -1) {
  const vx = Math.cos(rad);
  const vy = Math.sin(rad);

  const prevRight = currentDir ? currentDir.includes("right") : fallbackFacing >= 0;
  const prevBack = currentDir ? currentDir.includes("back") : false;

  const isRight = Math.abs(vx) < 0.01 ? prevRight : vx >= 0;
  const isBack = Math.abs(vy) < 0.01 ? prevBack : vy < 0;

  if (isBack) {
    return isRight ? "back-right" : "back-left";
  }
  return isRight ? "front-right" : "front-left";
}

function getPortraitSrc(spritePath) {
  return spritePath;
}

/**
 * Computes a 3-phase attack animation curve (Wind-up -> Explosive Strike -> Elastic Recovery)
 * given normalized progress p in [0, 1] (0 = start of move, 1 = end of move).
 */
function computeAttackChoreography(p, isMelee) {
  if (p <= 0 || p >= 1) {
    return { lunge: 0, sx: 1, sy: 1, pitch: 0, liftZ: 0 };
  }
  if (p < 0.18) {
    // Phase 1: Anticipation wind-up crouch & pullback
    const t = p / 0.18;
    const ease = Math.sin(t * Math.PI * 0.5);
    return {
      lunge: -ease * (isMelee ? 10 : 6),
      sx: 1 + ease * 0.14,
      sy: 1 - ease * 0.13,
      pitch: -ease * 0.12,
      liftZ: 0
    };
  } else if (p < 0.52) {
    // Phase 2: Explosive forward lunge / cast stretch
    const t = (p - 0.18) / 0.34;
    const burst = Math.sin(t * Math.PI);
    return {
      lunge: burst * (isMelee ? 30 : 14),
      sx: 1 + burst * (isMelee ? 0.24 : 0.15),
      sy: 1 - burst * (isMelee ? 0.12 : 0.06),
      pitch: burst * (isMelee ? 0.22 : 0.12),
      liftZ: isMelee ? burst * 12 : burst * 4
    };
  } else {
    // Phase 3: Elastic follow-through recovery
    const t = (p - 0.52) / 0.48;
    const damp = Math.cos(t * Math.PI * 0.5);
    return {
      lunge: damp * (isMelee ? 6 : 3),
      sx: 1 - damp * 0.04,
      sy: 1 + damp * 0.04,
      pitch: damp * 0.04,
      liftZ: 0
    };
  }
}

/**
 * Renders a Pokémon using:
 * 1) Live multi-frame animated DOM <img> element in #battlefield-sprites-layer (so all 50-75 GIF frames play smoothly!)
 * 2) Ground aura & water reflection on `ctx` (#arenaCanvas)
 * 3) Foreground elemental breath, waterline ripples, and slash trails on `fxCtx` (#fxCanvas)
 */
function getReverseGifPath(srcPath) {
  if (!srcPath || !srcPath.endsWith(".gif")) return null;
  const lastSlash = srcPath.lastIndexOf("/");
  if (lastSlash < 0) return null;
  const dir = srcPath.slice(0, lastSlash);
  const file = srcPath.slice(lastSlash + 1);
  if (file.endsWith("_back.gif")) {
    return `${dir}/reverse/${file.slice(0, -9)}_back_reverse.gif`;
  }
  return `${dir}/reverse/${file.slice(0, -4)}_reverse.gif`;
}

function drawArticulatedPokemon(ctx, f, frontImg, baseSize, time, fxCtx = null) {
  const targetFxCtx = fxCtx || ctx;
  const spd = Math.hypot(f.vx || 0, f.vy || 0);
  const isMoving = spd > 0.16 || (f.dashTimer && f.dashTimer > 0);
  const isFlier = Boolean(f.flier !== undefined ? f.flier : f.data.flier);
  const inWaterSurface =
    typeof state !== "undefined" &&
    state.fieldType === "water" &&
    !isFlier &&
    f.z <= 2 &&
    typeof getPlatformUnder === "function" &&
    !getPlatformUnder(f.x, f.y);

  const dir8 = f.dir8 || "front-left";
  const rawIsBackDir = dir8.includes("back");
  const rawFaceRight = dir8.includes("right") ? true : dir8.includes("left") ? false : f.facing > 0;
  const isBlastoiseGmax = Boolean(
    (f.id === "blastoise" && f.gmaxMode > 0) ||
      (f.sprite && f.sprite.includes("blastoise-gmax"))
  );
  // Gigantamax Blastoise directional GIF mapping (front/back inverted, left/right swapped per user request):
  // - Enemy at back-right (右上): 0009_blastoise-gmax_reverse.gif
  // - Enemy at back-left (左上): 0009_blastoise-gmax.gif
  // - Enemy at front-left (左下): 0009_blastoise-gmax_back_reverse.gif
  // - Enemy at front-right (右下): 0009_blastoise-gmax_back.gif
  const isBackDir = isBlastoiseGmax ? !rawIsBackDir : rawIsBackDir;
  const faceRight = rawFaceRight;

  // Select authentic back GIF when facing away, or front GIF when facing down/sideways
  let activeImg = frontImg;
  let activeSrc = f.sprite;
  let usingBackSprite = false;
  if (isBackDir && f.backSprite) {
    activeSrc = f.backSprite;
    usingBackSprite = true;
    if (typeof getSprite === "function") {
      const bImg = getSprite(f.backSprite);
      if (bImg && bImg.complete && bImg.naturalWidth > 0) {
        activeImg = bImg;
      }
    }
  }

  // PokeAPI/pokestats.gg front GIFs natively face front-left; back GIFs natively face back-right.
  // When facing the opposite horizontal direction, load the pre-flipped _reverse.gif / _back_reverse.gif from pokeSprite!
  const needsReverse = usingBackSprite ? !faceRight : faceRight;
  let flipX = 1;
  if (needsReverse) {
    const revSrc = getReverseGifPath(activeSrc);
    if (revSrc) {
      activeSrc = revSrc;
      flipX = 1; // Already natively flipped in the _reverse.gif file!
      if (typeof getSprite === "function") {
        const revImg = getSprite(revSrc);
        if (revImg && revImg.complete && revImg.naturalWidth > 0) {
          activeImg = revImg;
        }
      }
    } else {
      flipX = -1;
    }
  }

  const domEntry = ensureFighterDomNode(f);
  const refImg = (domEntry && domEntry.mainImg && domEntry.mainImg.naturalWidth > 0) ? domEntry.mainImg : activeImg;
  const natW = (refImg && refImg.naturalWidth) || 64;
  const natH = (refImg && refImg.naturalHeight) || 64;

  const seed = ((f.id ? f.id.charCodeAt(0) : 1) * 0.7 + (f.team || 1) * 2.1) % 6.28;
  const isSerp = Boolean(f.isSerpentine || f.id === "gyarados");
  const tempo = f.animTempo || 1.0;
  const breathPhase = time * (isFlier ? 5.2 : 3.8) * tempo + seed;
  const breathCycle = Math.sin(breathPhase);
  const walkPhase = time * (10.5 * tempo + Math.min(7, spd * 1.45)) + seed;

  // 3-phase attack choreography (0 -> 1 progress)
  const moveProgress = f.activeMoveTimer > 0 ? 1 - Math.min(1, f.activeMoveTimer / (f.activeMoveDuration || 0.52)) : 0;
  const atkCurve = computeAttackChoreography(moveProgress, Boolean(f.activeMoveIsMelee));

  const faceSignX = rawFaceRight ? 1 : -1;
  const faceSignY = dir8.includes("front") ? 1 : rawIsBackDir ? -1 : 0;
  const aimCos = f.faceAngle !== undefined ? Math.cos(f.faceAngle) : faceSignX;
  const aimSin = f.faceAngle !== undefined ? Math.sin(f.faceAngle) : faceSignY;

  // Physique scale from pokeData height.meters (0.1m .. 75m), separated into 7 unmistakable size tiers
  // and scaled up to the 236px Pokéball platform width in the water battle:
  // 1. 超小型〜小型 (<=0.4m): 22px .. 34px
  // 2. 御三家たね (0.5m..0.8m): 44px .. 56px
  // 3. 中間進化 (0.9m..1.3m): 68px .. 82px
  // 4. 最終進化・中〜大型 (1.4m..2.5m): 98px .. 122px
  // 5. メガシンカ: 136px .. 156px (Mega Legendaries: 178px .. 192px)
  // 6. 超大型・伝説 (>2.5m): 158px .. 188px
  // 7. キョダイマックス (14m..75m): 202px .. 234px (86% .. 99% of the 236px Pokéball platform width!)
  const pokeballWidth = typeof POKEBALL_PLATFORM_WIDTH === "number" ? POKEBALL_PLATFORM_WIDTH : 236;
  const effectiveScale = f.scale || f.data.scale || 1.0;
  const isTrimmed = natW !== 96 || natH !== 96;
  const maxDim = Math.max(natW, natH, 1);
  const rawTargetPx = f.targetPx || f.data.targetPx || Math.round(70 * effectiveScale);
  const targetMaxPx = Math.max(
    22,
    Math.min(pokeballWidth - 2, rawTargetPx)
  );

  let renderW;
  let renderH;
  if (!isTrimmed) {
    renderW = targetMaxPx;
    renderH = targetMaxPx;
  } else if (f.gmaxMode > 0) {
    const pixelScale = targetMaxPx / maxDim;
    renderW = natW * pixelScale;
    renderH = natH * pixelScale;
  } else {
    // Normalize vertical height (natH) higher than width (maxDim) so wide tails/wings do not shrink standing height.
    // For final evolutions & larger Pokémon (targetMaxPx > 82), anchor the reference body dimension at 66px
    // (the standard Gen 5 adult torso height) so sprites with large wingspans (Charizard 87x89 / 100x85, Dragonite 80x82),
    // wide foliage (Venusaur 86x71 / 91x66), or long tails (Mewtwo 90x69 / 95x71) keep their full body magnification
    // AND let their wings/tails extend naturally outward!
    const rawDim = natH * 0.75 + maxDim * 0.25;
    const heightM = f.heightM || 1.2;
    let coreRefDim;
    if (targetMaxPx <= 82 && !(f.megaMode > 0)) {
      coreRefDim = rawDim;
    } else if (f.megaMode > 0 || heightM > 2.5) {
      coreRefDim = Math.min(rawDim, 74 + Math.max(0, rawDim - 74) * 0.45);
    } else {
      coreRefDim = Math.min(rawDim, 66);
    }
    let pixelScale = targetMaxPx / Math.max(1, coreRefDim);
    renderW = natW * pixelScale;
    renderH = natH * pixelScale;
    const maxEnvelope = f.megaMode > 0 ? 188 : heightM > 2.5 ? 198 : 162;
    if (Math.max(renderW, renderH) > maxEnvelope) {
      const clampScale = maxEnvelope / Math.max(renderW, renderH);
      renderW *= clampScale;
      renderH *= clampScale;
    }
  }
  const drawW = Math.max(renderW, renderH);
  const drawH = drawW;
  const footOffset = isTrimmed ? 4 : 10;

  // Gigantamax / Mega ambient ground aura on #arenaCanvas
  if (f.gmaxMode > 0 && !f.ko) {
    ctx.save();
    const pulse = 0.78 + Math.sin(time * 6) * 0.2;
    ctx.strokeStyle = `rgba(244, 63, 94, ${pulse})`;
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(0, 4, drawW * 0.42, drawH * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (f.megaMode > 0 && !f.ko) {
    ctx.save();
    const pulse = 0.65 + Math.sin(time * 6) * 0.2;
    ctx.strokeStyle = f.megaMode === 2 ? `rgba(251, 146, 60, ${pulse})` : `rgba(56, 189, 248, ${pulse})`;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.ellipse(0, 2, drawW * 0.34, drawH * 0.12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Kinematics: Stride hop, flight hover, swim bob, attack lunge, hurt shake, clash vibration
  const weightFactor = f.weightKg ? Math.max(0.65, Math.min(1.45, Math.pow(f.weightKg / 60, 0.2))) : 1.0;
  const flierHover = isFlier && !f.ko ? Math.sin(breathPhase) * 4.8 - 7 : 0;
  const hopY = isMoving && !inWaterSurface && !isFlier ? -Math.abs(Math.sin(walkPhase)) * Math.min(8.0, (2.4 + spd * 1.15) / weightFactor) : 0;
  const swimY = inWaterSurface ? 8 + Math.sin(time * 5.5 * tempo + seed) * 2.6 : 0;
  const serpX = isSerp ? Math.cos(time * 5.2 * tempo + seed) * 3.0 : 0;
  const serpY = isSerp ? Math.sin(time * 6.8 * tempo + seed) * 2.8 : 0;

  const lungeScale = Math.max(0.85, Math.min(1.35, f.actionSpeedMult || 1.0));
  const lungeX = atkCurve.lunge * lungeScale * aimCos;
  const lungeY = atkCurve.lunge * lungeScale * aimSin - atkCurve.liftZ;

  const hurtShakeX = f.hurtTimer > 0 ? Math.sin(time * 95) * 6.5 * f.hurtTimer : 0;
  const hurtShakeY = f.hurtTimer > 0 ? Math.cos(time * 85) * 3.5 * f.hurtTimer : 0;

  const clashActive = typeof state !== "undefined" && state.clash && state.clash.active && (f === state.clash.f1 || f === state.clash.f2);
  const clashVibX = clashActive ? (Math.random() - 0.5) * 5.5 : 0;
  const clashVibY = clashActive ? (Math.random() - 0.5) * 3.5 : 0;

  const localDx = serpX + lungeX + hurtShakeX + clashVibX;
  const localDy = serpY + hopY + flierHover + swimY + lungeY + hurtShakeY + clashVibY;

  // Dynamic rotation: velocity bank + stride cadence + attack pitch + hurt recoil
  const velBank = Math.max(-0.20, Math.min(0.20, (f.vx || 0) * 0.022 * tempo));
  const walkRock = isMoving ? Math.sin(walkPhase) * (0.058 / weightFactor) : Math.sin(breathPhase * 0.5) * 0.016;
  const hurtTilt = f.hurtTimer > 0 ? -faceSignX * f.hurtTimer * 0.35 : 0;
  const koRot = f.ko ? Math.PI * 0.45 : 0;
  const totalRotRad = velBank + walkRock + atkCurve.pitch * faceSignX + hurtTilt + koRot;

  // Squash & Stretch + Physique build (stocky vs slender from BMI)
  const jumpStretch = Math.max(-0.12, Math.min(0.16, (f.vz || 0) * 0.018));
  const landSquash = f.landSquashTimer > 0 ? Math.sin((f.landSquashTimer / 0.22) * Math.PI) * 0.16 * weightFactor : 0;
  const hurtSquash = f.hurtTimer > 0 ? f.hurtTimer * 0.28 : 0;
  const buildWidth = f.physiqueWidthMult || 1.0;

  const magScaleX =
    (1 + breathCycle * 0.024 - jumpStretch * 0.6 + landSquash - hurtSquash * 0.5) * atkCurve.sx * buildWidth;
  const magScaleY =
    (1 - breathCycle * 0.022 + jumpStretch - landSquash * 0.85 + hurtSquash * 0.45) * atkCurve.sy;

  const finalScaleX = magScaleX * flipX;
  const finalScaleY = magScaleY;

  // CSS Filter for live GIF element
  let cssFilter = "none";
  if (f.ko) {
    cssFilter = "grayscale(0.85) brightness(0.72)";
  } else if (f.hurtTimer && f.hurtTimer > 0) {
    cssFilter = "brightness(1.85) contrast(1.25) drop-shadow(0 0 8px rgba(255,255,255,0.9))";
  } else if (f.gmaxMode > 0) {
    cssFilter = "drop-shadow(0 0 14px rgba(244, 63, 94, 0.95))";
  } else if (f.megaMode > 0) {
    cssFilter =
      f.megaMode === 2
        ? "drop-shadow(0 0 8px rgba(251, 146, 60, 0.9))"
        : "drop-shadow(0 0 8px rgba(56, 189, 248, 0.9))";
  }

  // World anchor position of fighter's feet
  const worldFootX = f.x + localDx;
  const worldFootY = f.y + 14 - f.z + localDy + (f.ko ? -baseSize * 0.25 : 0);

  // Record motion trail history for high-speed dash/lunge afterimages
  if (!f.trailHistory) f.trailHistory = [];
  f.trailHistory.unshift({
    x: worldFootX,
    y: worldFootY,
    w: renderW,
    h: renderH,
    footOffset,
    sx: finalScaleX,
    sy: finalScaleY,
    rot: totalRotRad,
    src: activeSrc
  });
  if (f.trailHistory.length > 7) f.trailHistory.pop();

  const showTrail =
    !f.ko && (f.dashTimer > 0 || spd > 2.6 || (moveProgress > 0.15 && moveProgress < 0.62));

  if (domEntry) {
    domEntry.wrap.style.zIndex = String(Math.max(1, Math.round(100000 + f.y)));

    // Update main live animated GIF element
    const imgEl = domEntry.mainImg;
    if (domEntry.lastSrc !== activeSrc) {
      imgEl.src = activeSrc;
      domEntry.lastSrc = activeSrc;
    }
    imgEl.style.width = `${renderW.toFixed(1)}px`;
    imgEl.style.height = `${renderH.toFixed(1)}px`;
    imgEl.style.left = `${(-renderW * 0.5).toFixed(1)}px`;
    imgEl.style.top = `${(-renderH + footOffset).toFixed(1)}px`;
    imgEl.style.transform = `translate3d(${worldFootX.toFixed(1)}px, ${worldFootY.toFixed(1)}px, 0) rotate(${totalRotRad.toFixed(3)}rad) scale(${finalScaleX.toFixed(3)}, ${finalScaleY.toFixed(3)})`;
    imgEl.style.filter = cssFilter;
    imgEl.style.clipPath = inWaterSurface ? "inset(0px 0px 14% 0px)" : "none";

    // Update 3 ghost afterimages during dashes/lunges (use opacity: 0 instead of display: none so browser never pauses shared GIF cache)
    const ghostIndices = [2, 4, 6];
    const ghostOpacities = [0.42, 0.25, 0.13];
    for (let gi = 0; gi < 3; gi++) {
      const gObj = domEntry.ghosts[gi];
      const hist = f.trailHistory[ghostIndices[gi]];
      if (showTrail && hist) {
        if (gObj.lastSrc !== hist.src) {
          gObj.el.src = hist.src;
          gObj.lastSrc = hist.src;
        }
        gObj.el.style.width = `${hist.w.toFixed(1)}px`;
        gObj.el.style.height = `${hist.h.toFixed(1)}px`;
        gObj.el.style.left = `${(-hist.w * 0.5).toFixed(1)}px`;
        gObj.el.style.top = `${(-hist.h + hist.footOffset).toFixed(1)}px`;
        gObj.el.style.opacity = String(ghostOpacities[gi]);
        gObj.el.style.filter = "brightness(1.6) saturate(1.4) hue-rotate(10deg)";
        gObj.el.style.transform = `translate3d(${hist.x.toFixed(1)}px, ${hist.y.toFixed(1)}px, 0) rotate(${hist.rot.toFixed(3)}rad) scale(${hist.sx.toFixed(3)}, ${hist.sy.toFixed(3)})`;
      } else {
        gObj.el.style.opacity = "0";
      }
    }
  } else if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
    // Fallback canvas draw if DOM layer is unavailable
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(localDx, localDy);
    ctx.rotate(totalRotRad);
    ctx.scale(finalScaleX, finalScaleY);
    ctx.drawImage(activeImg, -renderW * 0.5, -renderH + footOffset, renderW, renderH);
    ctx.restore();
  }

  // Foreground effects on fxCtx (above the live GIF sprites!)
  targetFxCtx.save();
  targetFxCtx.translate(f.x, f.y + 14 - f.z);

  // 3 swirling Gigantamax clouds above head on fxCtx (scaled to giant G-Max body size)
  if (f.gmaxMode > 0 && !f.ko) {
    const cloudOrbitR = Math.max(36, renderW * 0.28);
    const cloudW = Math.max(15, renderW * 0.095);
    const cloudH = Math.max(6.5, cloudW * 0.44);
    for (let c = 0; c < 3; c++) {
      const ang = time * 2.8 + (c * Math.PI * 2) / 3;
      const cx = localDx + Math.cos(ang) * cloudOrbitR;
      const cy = localDy - renderH * 0.90 + Math.sin(ang) * 7;
      targetFxCtx.fillStyle = "rgba(225, 29, 72, 0.90)";
      targetFxCtx.beginPath();
      targetFxCtx.ellipse(cx, cy, cloudW, cloudH, 0, 0, Math.PI * 2);
      targetFxCtx.fill();
    }
  }

  drawLivingElementalDetails8Dir(
    targetFxCtx,
    f,
    renderW,
    renderH,
    dir8,
    faceSignX,
    faceSignY,
    breathCycle,
    time,
    localDx,
    localDy
  );

  if (inWaterSurface) {
    targetFxCtx.save();
    targetFxCtx.strokeStyle = "rgba(224, 247, 255, 0.88)";
    targetFxCtx.lineWidth = 2.6;
    targetFxCtx.beginPath();
    const halfWaist = Math.max(18, renderW * 0.36);
    targetFxCtx.moveTo(localDx - halfWaist, localDy + 2);
    targetFxCtx.quadraticCurveTo(
      localDx,
      localDy + 5 + Math.sin(time * 9 + seed) * 2.5,
      localDx + halfWaist,
      localDy + 2
    );
    targetFxCtx.stroke();
    targetFxCtx.restore();
  }

  targetFxCtx.restore();
}

function drawLivingElementalDetails8Dir(
  ctx,
  f,
  visW,
  visH,
  dir8,
  faceSignX,
  faceSignY,
  breathCycle,
  time,
  offsetX = 0,
  offsetY = 0
) {
  if (f.ko) return;

  if (breathCycle > 0.52 && dir8 !== "back") {
    const a = (breathCycle - 0.52) / 0.48;
    const mx = offsetX + faceSignX * (visW * 0.34 + (1 - a) * 7);
    const my = offsetY - visH * 0.62 + faceSignY * 4 - (1 - a) * 3;
    ctx.save();
    if (f.gmaxMode > 0) {
      ctx.fillStyle = `rgba(244, 63, 94, ${a * 0.92})`;
      ctx.beginPath();
      ctx.arc(mx, my, 4.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.id === "charizard") {
      if (f.megaMode === 1) {
        ctx.fillStyle = `rgba(0, 229, 255, ${a * 0.9})`;
        ctx.beginPath();
        ctx.arc(mx, my, 3.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (f.megaMode === 2) {
        ctx.fillStyle = `rgba(253, 224, 71, ${a * 0.9})`;
        ctx.beginPath();
        ctx.arc(mx, my, 4.0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(255, 175, 25, ${a * 0.82})`;
        ctx.beginPath();
        ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (f.megaMode > 0) {
      ctx.fillStyle = f.megaMode === 1 ? `rgba(56, 189, 248, ${a * 0.88})` : `rgba(253, 224, 71, ${a * 0.88})`;
      ctx.beginPath();
      ctx.arc(mx, my, 3.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.id === "pikachu") {
      ctx.strokeStyle = `rgba(255, 240, 50, ${a * 0.92})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mx * 0.7, my);
      ctx.lineTo(mx + Math.sin(time * 32) * 3, my - 3);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(240, 249, 255, ${a * 0.42})`;
      ctx.beginPath();
      ctx.ellipse(mx, my, 5 + (1 - a) * 3, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
