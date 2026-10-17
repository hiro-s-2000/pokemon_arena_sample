// Pokémon Arena 2D (newSpriteGame) - Front & Back Sprite Animator using ../pokeSprite/

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

/**
 * Converts a radian angle atan2(dy, dx) into one of the 8 compass directions
 * with hysteresis around octant boundaries so directions never flicker.
 */
function angleTo8Dir(rad, currentDir = null) {
  const step = Math.PI / 4;
  if (currentDir) {
    const curIdx = DIRS_8_LIST.indexOf(currentDir);
    if (curIdx !== -1) {
      const curCenter = curIdx * step;
      const diff = Math.atan2(Math.sin(rad - curCenter), Math.cos(rad - curCenter));
      if (Math.abs(diff) < step * 0.5 + 0.15) {
        return currentDir;
      }
    }
  }
  let idx = Math.round(rad / step);
  idx = ((idx % 8) + 8) % 8;
  return DIRS_8_LIST[idx];
}

function getPortraitSrc(spritePath) {
  return spritePath;
}

/**
 * Renders a Pokémon using the authentic front & back sprites stored in ../pokeSprite/.
 * - When facing away (up / back / back-left / back-right), uses the authentic back sprite (`f.backSprite`)!
 * - When facing toward the camera (front / front-left / front-right / left / right), uses the front sprite (`f.sprite`).
 * - Applies smooth 60fps breathing, walking hops, water submersion, attack lunges, and Mega/Gigantamax auras.
 */
function drawArticulatedPokemon(ctx, f, frontImg, baseSize, time) {
  const spd = Math.hypot(f.vx || 0, f.vy || 0);
  const isMoving = spd > 0.18 || (f.dashTimer && f.dashTimer > 0);
  const inWaterSurface =
    typeof state !== "undefined" &&
    state.fieldType === "water" &&
    !f.data.flier &&
    f.z <= 2 &&
    typeof getPlatformUnder === "function" &&
    !getPlatformUnder(f.x, f.y);

  const dir8 = f.dir8 || "front-left";
  const isBackDir = dir8.includes("back");

  // Select authentic back sprite when facing away, or front sprite when facing down/sideways
  let activeImg = frontImg;
  let usingBackSprite = false;
  if (isBackDir && f.backSprite && typeof getSprite === "function") {
    const bImg = getSprite(f.backSprite);
    if (bImg && bImg.complete && bImg.naturalWidth > 0) {
      activeImg = bImg;
      usingBackSprite = true;
    }
  }

  if (!activeImg || !activeImg.complete || !activeImg.naturalWidth) {
    return;
  }

  const seed = ((f.id ? f.id.charCodeAt(0) : 1) * 0.7 + (f.team || 1) * 2.1) % 6.28;
  const isGyarados = f.id === "gyarados";
  const breathPhase = time * (f.data.flier ? 4.4 : 3.5) + seed;
  const breathCycle = Math.sin(breathPhase);
  const walkPhase = time * 12.5 + seed;
  const attackPulse = f.activeMoveTimer > 0 ? Math.sin((f.activeMoveTimer / 0.85) * Math.PI) : 0;

  const faceRight = dir8.includes("right") ? true : dir8.includes("left") ? false : f.facing > 0;
  const faceSignX = faceRight ? 1 : -1;
  const faceSignY = dir8.includes("front") ? 1 : isBackDir ? -1 : 0;

  // Scale up for Mega Evolution and Gigantamax
  const formScale = f.gmaxMode > 0 ? 1.38 : f.megaMode > 0 ? 1.18 : 1.0;
  const drawW = 148 * (f.data.scale ? f.data.scale / 1.4 : 1.0) * formScale;
  const drawH = 148 * (f.data.scale ? f.data.scale / 1.4 : 1.0) * formScale;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Gigantamax / Mega ambient ground aura
  if (f.gmaxMode > 0 && !f.ko) {
    ctx.save();
    const pulse = 0.75 + Math.sin(time * 6) * 0.2;
    ctx.strokeStyle = `rgba(244, 63, 94, ${pulse})`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, 2, drawW * 0.38, drawH * 0.14, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 3 swirling Gigantamax clouds above head
    for (let c = 0; c < 3; c++) {
      const ang = time * 2.6 + (c * Math.PI * 2) / 3;
      const cx = Math.cos(ang) * 26;
      const cy = -drawH * 0.78 + Math.sin(ang) * 5;
      ctx.fillStyle = "rgba(225, 29, 72, 0.88)";
      ctx.beginPath();
      ctx.ellipse(cx, cy, 10, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Serpentine slithering wave for Gyarados
  if (isGyarados) {
    const wavePhase = time * 5.2 + seed;
    ctx.translate(Math.cos(wavePhase) * 2.5, Math.sin(wavePhase * 1.3) * 2.8);
  }

  const hopY = isMoving && !inWaterSurface ? -Math.abs(Math.sin(walkPhase)) * 5.5 : 0;
  const swimY = inWaterSurface ? 8 + Math.sin(time * 5.5 + seed) * 2.4 : 0;
  const lungeX = attackPulse * faceSignX * 8.5;
  const lungeY = attackPulse * faceSignY * 5.5;
  ctx.translate(lungeX, hopY + swimY + lungeY);

  const tilt =
    (isMoving ? Math.sin(walkPhase) * 0.045 : Math.sin(breathPhase * 0.5) * 0.014) +
    attackPulse * 0.075 * faceSignX;
  ctx.rotate(tilt);

  // PokeAPI/pokestats.gg front sprites naturally face front-left, and back sprites naturally face back-right.
  let flipX = 1;
  if (usingBackSprite) {
    flipX = faceRight ? 1 : -1;
  } else {
    flipX = faceRight ? -1 : 1;
  }

  const scaleX = (1 + breathCycle * 0.022 + attackPulse * 0.05) * flipX;
  const scaleY = 1 - breathCycle * 0.02 + attackPulse * 0.04;
  ctx.scale(scaleX, scaleY);

  if (f.hurtTimer && f.hurtTimer > 0) {
    ctx.filter = "brightness(1.6) contrast(1.15)";
  } else if (f.gmaxMode > 0) {
    ctx.filter = "drop-shadow(0 0 8px rgba(244, 63, 94, 0.85))";
  } else if (f.megaMode > 0) {
    ctx.filter =
      f.megaMode === 2
        ? "drop-shadow(0 0 7px rgba(251, 146, 60, 0.85))"
        : "drop-shadow(0 0 7px rgba(56, 189, 248, 0.85))";
  }

  // Preserve 1:1 pixel aspect ratio for trimmed animated GIF sprites (pokestats.gg Gen 5 & custom 2D GIFs)
  const natW = activeImg.naturalWidth || 96;
  const natH = activeImg.naturalHeight || 96;
  const isTrimmed = natW !== 96 || natH !== 96;
  const pixelScale = (148 / 88) * (f.data.scale ? f.data.scale / 1.4 : 1.0) * formScale;
  const renderW = isTrimmed ? natW * pixelScale : drawW;
  const renderH = isTrimmed ? natH * pixelScale : drawH;
  const footOffset = isTrimmed ? 4 : 14;
  ctx.drawImage(activeImg, -renderW * 0.5, -renderH + footOffset, renderW, renderH);
  ctx.restore();

  drawLivingElementalDetails8Dir(ctx, f, 68 * formScale, 68 * formScale, dir8, faceSignX, faceSignY, breathCycle, time);

  if (inWaterSurface) {
    ctx.save();
    ctx.strokeStyle = "rgba(224, 247, 255, 0.86)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const halfWaist = 26 * formScale;
    ctx.moveTo(-halfWaist, 2);
    ctx.quadraticCurveTo(0, 5 + Math.sin(time * 9 + seed) * 2.5, halfWaist, 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawLivingElementalDetails8Dir(ctx, f, visW, visH, dir8, faceSignX, faceSignY, breathCycle, time) {
  if (f.ko) return;

  if (breathCycle > 0.52 && dir8 !== "back") {
    const a = (breathCycle - 0.52) / 0.48;
    const mx = faceSignX * (visW * 0.34 + (1 - a) * 7);
    const my = -visH * 0.62 + faceSignY * 4 - (1 - a) * 3;
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
