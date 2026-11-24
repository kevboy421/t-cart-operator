// renderer.js - Top-Down 3/4 Oblique Factory Renderer (Native 1280x720, Real 16-Bit Assets & Razor-Sharp Typography)

import { CONFIG } from './config.js';
import { SPRITES } from './sprites.js';

// Native resolution constants
const NATIVE_W = 1280;
const NATIVE_H = 720;
const S = 2; // Scale factor from logical 640x360 coordinates

// High-contrast, pixel-perfect 5x7 arcade matrices for single-letter grade badges
const PIXEL_GLYPHS = {
  'K': [
    [1,0,0,0,1],
    [1,0,0,1,0],
    [1,0,1,0,0],
    [1,1,0,0,0],
    [1,0,1,0,0],
    [1,0,0,1,0],
    [1,0,0,0,1]
  ],
  'D': [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0]
  ],
  'W': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,0,1,0,1],
    [1,0,1,0,1],
    [0,1,0,1,0],
    [0,1,0,1,0]
  ],
  'X': [
    [1,0,0,0,1],
    [1,0,0,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1]
  ],
  '!': [
    [1,1],
    [1,1],
    [1,1],
    [1,1],
    [0,0],
    [1,1],
    [1,1]
  ]
};

function drawPixelGlyph(ctx, char, cx, cy, color, size = 2) {
  const g = PIXEL_GLYPHS[char];
  if (!g) return;
  const gw = g[0].length * size;
  const gh = g.length * size;
  const startX = Math.round(cx - gw / 2);
  const startY = Math.round(cy - gh / 2);

  // Crisp black border around each pixel block for maximum contrast
  ctx.fillStyle = '#000000';
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[0].length; c++) {
      if (g[r][c]) {
        ctx.fillRect(startX + c * size - 1, startY + r * size - 1, size + 2, size + 2);
      }
    }
  }

  // Colored foreground pixels
  ctx.fillStyle = color;
  for (let r = 0; r < g.length; r++) {
    for (let c = 0; c < g[0].length; c++) {
      if (g[r][c]) {
        ctx.fillRect(startX + c * size, startY + r * size, size, size);
      }
    }
  }
}

export function drawGradeBadge(ctx, code, isWarped, x, y, w, h) {
  const bgColor = isWarped ? '#d32f2f' : (code === 'K' ? '#9c6128' : code === 'D' ? '#4a5568' : code === 'W' ? '#e2e8f0' : '#2b6cb0');
  const textColor = isWarped ? '#ffffff' : (code === 'W' ? '#1a202c' : '#ffffff');
  const tagChar = isWarped ? '!' : (code || 'K');

  // Solid dark 1px border + bright grade background
  ctx.fillStyle = '#000000';
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.fillStyle = bgColor;
  ctx.fillRect(Math.round(x + 1), Math.round(y + 1), Math.round(w - 2), Math.round(h - 2));

  // Razor-sharp 5x7 arcade pixel glyph centered in badge
  drawPixelGlyph(ctx, tagChar, x + w / 2, y + h / 2, textColor, 2);
}

export function drawTextWithOutline(ctx, text, x, y, color = '#ffffff', font = 'bold 15px Consolas, "Lucida Console", Monaco, monospace', align = 'center', outlineColor = '#000000', outlineWidth = 3) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (outlineWidth > 0) {
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = outlineColor;
    ctx.strokeText(text, Math.round(x), Math.round(y));
  }
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

function drawStackSprite(ctx, stack, x, y, w = 54, h = 46) {
  if (!stack) return;
  let spr = null;
  if (stack.isWarped) {
    spr = SPRITES.img.stack_warped || (SPRITES.stacks && SPRITES.stacks.WARPED);
  } else {
    const code = stack.grade ? stack.grade.code : 'K';
    if (code === 'K') spr = SPRITES.img.stack_kraft || (SPRITES.stacks && SPRITES.stacks.K);
    else if (code === 'D') spr = SPRITES.img.stack_doublewall || (SPRITES.stacks && SPRITES.stacks.D);
    else if (code === 'W') spr = SPRITES.img.stack_whitetop || (SPRITES.stacks && SPRITES.stacks.W);
    else if (code === 'X') spr = SPRITES.img.stack_wax || (SPRITES.stacks && SPRITES.stacks.X);
    else spr = SPRITES.img.stack_kraft || (SPRITES.stacks && SPRITES.stacks.K);
  }

  // Preserve natural aspect ratio fitting inside w x h (default 54x46)
  const maxW = w;
  const maxH = h;
  let targetW = maxW;
  let targetH = maxH;
  if (spr && spr.width && spr.height) {
    const aspect = spr.width / spr.height;
    targetW = maxW;
    targetH = targetW / aspect;
    if (targetH > maxH) {
      targetH = maxH;
      targetW = targetH * aspect;
    }
  }

  const drawX = Math.round(x + (w - targetW) / 2);
  const drawY = Math.round(y + (h - targetH) / 2);

  if (spr) {
    ctx.drawImage(spr, drawX, drawY, Math.round(targetW), Math.round(targetH));
  } else {
    ctx.fillStyle = stack.isWarped ? '#d32f2f' : (stack.grade ? stack.grade.color : '#b07844');
    ctx.fillRect(drawX, drawY, Math.round(targetW), Math.round(targetH));
  }

  // Crisp high-contrast grade tag stamped at top-center of cardboard stack
  const badgeW = 26;
  const badgeH = 18;
  const bx = Math.round(x + (w - badgeW) / 2);
  const by = Math.round(drawY - 4);

  drawGradeBadge(ctx, stack.grade ? stack.grade.code : 'K', stack.isWarped, bx, by, badgeW, badgeH);
}

export class FactoryRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.animTime = 0;
    this.rollerFrame = 0;
  }

  render(engine, dt = 0.016) {
    const safeDt = (typeof dt === 'number' && !isNaN(dt) && dt > 0) ? Math.min(dt, 0.05) : 0.016;
    this.animTime += safeDt;
    const rollerCount = (SPRITES.rollers && SPRITES.rollers.length > 0) ? SPRITES.rollers.length : 1;
    this.rollerFrame = Math.abs(Math.floor(this.animTime * 10)) % rollerCount;

    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    // 1. Factory Floor & Background (Full-Bleed 1280x720)
    this.drawBackground();

    // 2. Ceiling Light Illumination Cones
    this.drawCeilingLights();

    // 3. Yellow Transfer Rail Corridor
    this.drawRailCorridor();

    // 4. WIP Storage Conveyor Lanes (South Zone: y = 472..660 native)
    this.drawWipZone(engine);

    // 5. Flexo Lines (North Zone: y = 64..368 native)
    this.drawFlexoZone(engine);

    // 6. Bay 0: Corrugator Stacker & Dry-End Queue
    this.drawCorrugatorBay(engine);

    // 7. Bay 7: Scrap Baler
    this.drawScrapBalerBay(engine);

    // 8. Auto-Feeder AGV Shuttle
    this.drawAutoFeeder(engine);

    // 9. Real PTC T-Cart & Custom Operator
    this.drawPTCTCart(engine);

    // 10. Sliding Stack Transfer Animation
    this.drawTransferAnim(engine);

    // 11. Particles & Sparks
    this.drawParticles(engine);

    // 12. Top HUD Bar (Native y = 0..64)
    this.drawTopHud(engine);

    // 13. Bottom Ticker & Contextual Controls (Native y = 660..720)
    this.drawBottomTicker(engine);

    // 14. Floating Popups
    this.drawPopups(engine);
  }

  // 1. Full-Bleed 1280x720 Background
  drawBackground() {
    const ctx = this.ctx;
    const bg = SPRITES.img.bg_factory;

    if (bg) {
      ctx.drawImage(bg, 0, 0, NATIVE_W, NATIVE_H);
    } else {
      const tile = SPRITES.floorTile;
      if (tile) {
        for (let y = 64; y < 660; y += 32) {
          for (let x = 0; x < NATIVE_W; x += 32) {
            ctx.drawImage(tile, x, y, 32, 32);
          }
        }
      } else {
        ctx.fillStyle = '#9aa0a8';
        ctx.fillRect(0, 0, NATIVE_W, NATIVE_H);
      }

      const wall = SPRITES.highBayWall;
      if (wall) {
        for (let x = 0; x < NATIVE_W; x += 64) {
          ctx.drawImage(wall, x, 64, 64, 64);
        }
      }

      const bgPallet = SPRITES.bgPalletStack;
      if (bgPallet) {
        ctx.drawImage(bgPallet, 0, 480, 48, 48);
        ctx.drawImage(bgPallet, 0, 564, 48, 48);
        ctx.drawImage(bgPallet, NATIVE_W - 48, 480, 48, 48);
        ctx.drawImage(bgPallet, NATIVE_W - 48, 564, 48, 48);
      }
    }
  }

  // 2. Soft downward ceiling light illumination cones
  drawCeilingLights() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255, 248, 220, 0.04)';

    CONFIG.BAYS.forEach(b => {
      const cx = b.center * S;
      ctx.beginPath();
      ctx.moveTo(cx, 68);
      ctx.lineTo(cx - 52, 356);
      ctx.lineTo(cx + 52, 356);
      ctx.closePath();
      ctx.fill();
    });
  }

  // 3. Bright Safety-Yellow PTC Rail Corridor (Native y = 368..464)
  drawRailCorridor() {
    const ctx = this.ctx;
    // If bg_factory asset is loaded, skip drawing flat fill, rails, and hazard stripes!
    // Let bg_factory's built-in 16-bit shaded rail corridor and hazard borders show through untouched!
    if (SPRITES.img.bg_factory) {
      return;
    }

    // Procedural fallback when bg_factory is not loaded
    const yStart = 184 * S;
    const yEnd = 232 * S;
    const corridorH = yEnd - yStart;

    ctx.fillStyle = '#f0c419';
    ctx.fillRect(0, yStart, NATIVE_W, corridorH);

    const stripe = SPRITES.hazardStripe;
    if (stripe) {
      for (let x = 0; x < NATIVE_W; x += 64) {
        ctx.drawImage(stripe, x, yStart - 8, 64, 8);
        ctx.drawImage(stripe, x, yEnd, 64, 8);
      }
    } else {
      ctx.fillStyle = '#1c1e22';
      ctx.fillRect(0, yStart - 8, NATIVE_W, 8);
      ctx.fillRect(0, yEnd, NATIVE_W, 8);
    }

    const railY1 = 400;
    const railY2 = 432;

    ctx.fillStyle = '#26292e';
    ctx.fillRect(0, railY1 - 2, NATIVE_W, 8);
    ctx.fillRect(0, railY2 - 2, NATIVE_W, 8);

    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(0, railY1, NATIVE_W, 4);
    ctx.fillRect(0, railY2, NATIVE_W, 4);

    ctx.fillStyle = '#546e7a';
    for (let x = 0; x < NATIVE_W; x += 32) {
      ctx.fillRect(x, railY1 - 4, 6, 12);
      ctx.fillRect(x, railY2 - 4, 6, 12);
    }
  }

  // 4. WIP Storage Conveyor Lanes (South Zone: y = 472..652 native)
  drawWipZone(engine) {
    const ctx = this.ctx;

    for (let i = 0; i < 6; i++) {
      const bay = CONFIG.BAYS[i + 1];
      const lane = engine.wipLanes[i];
      const cx = bay.center * S;
      const lx = cx - 38;
      const ly = 472;
      const lw = 76;
      const lh = 180;

      if (!lane.isUnlocked) {
        ctx.fillStyle = '#191c20';
        ctx.fillRect(lx, ly, lw, lh);
        ctx.strokeStyle = '#2c323b';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx, ly, lw, lh);

        drawTextWithOutline(ctx, 'LOCKED', cx, ly + 90, '#757575', 'bold 15px Consolas, monospace', 'center');
        continue;
      }

      ctx.fillStyle = '#202328';
      ctx.fillRect(lx, ly, lw, lh);
      ctx.strokeStyle = '#4a535f';
      ctx.lineWidth = 2;
      ctx.strokeRect(lx, ly, lw, lh);

      const rollerSpr = (SPRITES.rollers && SPRITES.rollers[this.rollerFrame]) || (SPRITES.rollers ? SPRITES.rollers[0] : null);
      if (rollerSpr) {
        for (let ry = ly + 8; ry < ly + lh - 26; ry += 24) {
          ctx.drawImage(rollerSpr, lx + 4, ry, 68, 18);
        }
      }

      for (let sIdx = 0; sIdx < lane.stacks.length; sIdx++) {
        const stack = lane.stacks[sIdx];
        const sy = ly + 10 + sIdx * 54;
        drawStackSprite(ctx, stack, cx - 27, sy, 54, 46);
      }

      const badgeY = ly + lh - 24;
      ctx.fillStyle = '#101316';
      ctx.fillRect(cx - 36, badgeY, 72, 22);
      ctx.strokeStyle = '#546070';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 36, badgeY, 72, 22);

      drawTextWithOutline(ctx, `W${lane.id} ${lane.stacks.length}/${lane.capacity}`, cx, badgeY + 11, '#e0e6ed', 'bold 13px Consolas, monospace', 'center');
    }
  }

  // 5. Flexo Lines (North Zone: y = 64..368 native)
  drawFlexoZone(engine) {
    const ctx = this.ctx;

    for (let i = 0; i < 6; i++) {
      const bay = CONFIG.BAYS[i + 1];
      const flexo = engine.flexos[i];
      const cx = bay.center * S;
      const mx = cx - 72; // 144px wide machine

      // 5A. Shipping Palletizer Dock (y = 68..116 native)
      ctx.fillStyle = '#22252a';
      ctx.fillRect(cx - 36, 68, 72, 48);
      ctx.strokeStyle = '#3d444e';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 36, 68, 72, 48);

      const roller = (SPRITES.rollers && SPRITES.rollers[this.rollerFrame]) || (SPRITES.rollers ? SPRITES.rollers[0] : null);
      if (roller) {
        ctx.drawImage(roller, cx - 32, 72, 64, 18);
        ctx.drawImage(roller, cx - 32, 92, 64, 18);
      }

      if (flexo.isUnlocked) {
        let palletY = 78;
        let palletAlpha = 1.0;
        if (flexo.palletSlideAnim > 0) {
          palletY = 78 - flexo.palletSlideAnim * 28;
          palletAlpha = Math.max(0, 1.0 - flexo.palletSlideAnim);
        }
        if (SPRITES.pallet) {
          ctx.save();
          ctx.globalAlpha = palletAlpha;
          ctx.drawImage(SPRITES.pallet, cx - 32, palletY, 64, 32);
          ctx.restore();
        }

        const totalJobSheets = flexo.orderTotalStacks * flexo.requiredGrade.stackSheets;
        const jobRatio = Math.min(1.0, flexo.boxesFedInJob / totalJobSheets);
        ctx.fillStyle = '#101316';
        ctx.fillRect(cx - 32, 68, 64, 5);
        ctx.fillStyle = '#4caf50';
        ctx.fillRect(cx - 32, 68, Math.round(64 * jobRatio), 5);
      }

      // 5B. Machine Body (y = 124..300 native, 144x176px)
      if (!flexo.isUnlocked) {
        const lockedSpr = SPRITES.img.flexo_locked || SPRITES.flexoLocked;
        if (lockedSpr) {
          ctx.drawImage(lockedSpr, mx, 124, 144, 176);
        } else {
          ctx.fillStyle = '#1e2228';
          ctx.fillRect(mx, 124, 144, 176);
        }

        ctx.fillStyle = '#101416';
        ctx.fillRect(cx - 48, 236, 96, 36);
        ctx.strokeStyle = '#434a54';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 48, 236, 96, 36);

        drawTextWithOutline(ctx, `LINE ${flexo.id}`, cx, 248, '#ffd54f', 'bold 15px Consolas, monospace', 'center');
        drawTextWithOutline(ctx, 'LOCKED', cx, 263, '#cfd8dc', 'bold 13px Consolas, monospace', 'center');
      } else {
        const bodySpr = SPRITES.img.flexo || SPRITES.flexoBody;
        if (bodySpr) {
          ctx.drawImage(bodySpr, mx, 124, 144, 176);
        } else {
          ctx.fillStyle = '#324a56';
          ctx.fillRect(mx, 124, 144, 176);
        }

        // Sleek 104x46 dark screen recess fitted inside upper recess so roller windows remain visible
        ctx.fillStyle = '#14171b';
        ctx.fillRect(mx + 12, 128, 104, 46);
        ctx.strokeStyle = '#37474f';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx + 12, 128, 104, 46);

        const totalJobSheets = flexo.orderTotalStacks * flexo.requiredGrade.stackSheets;
        const remainingStacks = Math.max(0, Math.ceil((totalJobSheets - flexo.boxesFedInJob) / flexo.requiredGrade.stackSheets));

        // Row 1 (y = 138): LINE X (left) and REM: X/Y (right)
        drawTextWithOutline(ctx, `LINE ${flexo.id}`, mx + 18, 138, '#ffd54f', 'bold 12px Consolas, monospace', 'left');
        drawTextWithOutline(ctx, `REM: ${remainingStacks}/${flexo.orderTotalStacks}`, mx + 112, 138, '#90a4ae', 'bold 12px Consolas, monospace', 'right');

        // Row 2 (y = 158): RUN + 20x18 grade badge and NXT + 20x18 grade badge
        drawTextWithOutline(ctx, 'RUN', mx + 18, 158, '#b0bec5', 'bold 12px Consolas, monospace', 'left');
        drawGradeBadge(ctx, flexo.requiredGrade.code, false, mx + 44, 149, 20, 18);

        drawTextWithOutline(ctx, 'NXT', mx + 68, 158, '#b0bec5', 'bold 12px Consolas, monospace', 'left');
        const nextG = flexo.nextGrade || flexo.requiredGrade;
        drawGradeBadge(ctx, nextG.code, false, mx + 92, 149, 20, 18);

        // Rush 2x Badge
        if (flexo.isRush) {
          const blink = Math.sin(this.animTime * 12) > 0;
          ctx.fillStyle = blink ? '#ffd700' : '#ff9800';
          ctx.fillRect(cx - 36, 178, 72, 14);
          drawTextWithOutline(ctx, '★ RUSH 2x ★', cx, 185, '#000000', 'bold 12px Consolas, monospace', 'center', '#ffd700', 0);
        }

        // Andon Light on Top-Right Corner of Flexo
        let andonColor = '#4caf50';
        let andonGlow = 'rgba(76, 175, 80, 0.5)';
        let isLit = true;

        if (flexo.state === 'JAMMED') {
          isLit = Math.sin(this.animTime * 16) > 0;
          andonColor = '#f44336';
          andonGlow = 'rgba(244, 67, 54, 0.6)';
        } else if (flexo.state === 'CHANGEOVER') {
          andonColor = '#29b6f6';
          andonGlow = 'rgba(41, 182, 246, 0.6)';
        } else if (flexo.state === 'STARVED') {
          andonColor = '#f44336';
          andonGlow = 'rgba(244, 67, 54, 0.5)';
        } else if (flexo.state === 'LOW_HOPPER') {
          isLit = Math.sin(this.animTime * 10) > 0;
          andonColor = '#ffb300';
          andonGlow = 'rgba(255, 179, 0, 0.6)';
        }

        if (SPRITES.img.flexo) {
          // Emissive indicator bulb + soft radial glow over built-in top-right Andon tower (mx + 128, y = 132)
          if (isLit) {
            const ax = mx + 128;
            const ay = 132;

            const grad = ctx.createRadialGradient(ax, ay, 2, ax, ay, 12);
            grad.addColorStop(0, andonGlow);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(ax, ay, 12, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#000000';
            ctx.fillRect(ax - 5, ay - 5, 10, 10);
            ctx.fillStyle = andonColor;
            ctx.fillRect(ax - 4, ay - 4, 8, 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(ax - 2, ay - 2, 4, 4);
          }
        } else {
          // Procedural fallback
          let andonState = 'GREEN';
          if (flexo.state === 'JAMMED') andonState = Math.sin(this.animTime * 16) > 0 ? 'RED' : 'AMBER';
          else if (flexo.state === 'CHANGEOVER') andonState = 'BLUE';
          else if (flexo.state === 'STARVED') andonState = 'RED';
          else if (flexo.state === 'LOW_HOPPER') andonState = Math.sin(this.animTime * 10) > 0 ? 'AMBER' : 'OFF';

          const andonSpr = SPRITES.andon && SPRITES.andon[andonState];
          if (andonSpr) {
            ctx.drawImage(andonSpr, mx + 118, 126, 20, 36);
          }
        }

        // Translucent Blue WASH-UP Countdown Bar during CHANGEOVER
        if (flexo.state === 'CHANGEOVER') {
          const washRatio = Math.max(0, Math.min(1.0, flexo.changeoverTimer / (engine.changeoverDuration || 8.0)));
          ctx.fillStyle = 'rgba(13, 71, 161, 0.92)';
          ctx.fillRect(mx + 8, 230, 128, 28);
          ctx.strokeStyle = '#29b6f6';
          ctx.lineWidth = 2;
          ctx.strokeRect(mx + 8, 230, 128, 28);

          ctx.fillStyle = '#29b6f6';
          ctx.fillRect(mx + 10, 232, Math.round(124 * (1 - washRatio)), 24);

          drawTextWithOutline(ctx, `WASH-UP: ${flexo.changeoverTimer.toFixed(1)}s`, cx, 244, '#ffffff', 'bold 14px Consolas, monospace', 'center');
        }

        // Jam Visual Alert (Sparks, Smoke & Wrench)
        if (flexo.state === 'JAMMED') {
          const bounce = Math.sin(this.animTime * 8) * 6;
          if (SPRITES.wrench) {
            ctx.drawImage(SPRITES.wrench, cx - 14, 236 + bounce, 28, 28);
          }
          if (engine.cart.activeBay === flexo.id && engine.cart.jamFixTimer > 0) {
            const fixRatio = Math.min(1.0, engine.cart.jamFixTimer / CONFIG.CART.JAM_FIX_HOLD_TIME);
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(cx - 36, 270, 72, 12);
            ctx.fillStyle = '#ffca28';
            ctx.fillRect(cx - 36, 270, Math.round(72 * fixRatio), 12);
          }
        }

        // 5C. Infeed Hopper (y = 304..356 native)
        const hx = cx - 40;
        const hy = 304;
        const hw = 80;
        const hh = 52;

        ctx.fillStyle = '#1c2025';
        ctx.fillRect(hx, hy, hw, hh);
        ctx.strokeStyle = '#434a55';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx, hy, hw, hh);

        // Grade Badge Tab
        const reqGrade = flexo.requiredGrade;
        drawGradeBadge(ctx, reqGrade.code, false, hx + 4, hy + 4, 30, 24);

        // Hopper Fill Meter
        const hopperCapSheets = flexo.maxHopper * reqGrade.stackSheets;
        const fillRatio = Math.max(0, Math.min(1.0, flexo.hopperSheets / hopperCapSheets));

        ctx.fillStyle = '#101316';
        ctx.fillRect(hx + 38, hy + 6, 38, 20);
        ctx.fillStyle = fillRatio < 0.25 ? '#ef5350' : fillRatio < 0.5 ? '#ffb300' : '#4caf50';
        ctx.fillRect(hx + 38, hy + 6, Math.round(38 * fillRatio), 20);

        // Hopper Galvanized Rollers
        const hRoller = (SPRITES.rollers && SPRITES.rollers[this.rollerFrame]) || (SPRITES.rollers ? SPRITES.rollers[0] : null);
        if (hRoller) {
          ctx.drawImage(hRoller, hx + 8, hy + 30, 64, 18);
        }

        // RF Scanner Reticle & Guidance Arrow
        if (engine.hasRfScanner && engine.cart.stacks.length > 0) {
          const hasMatchingGrade = engine.cart.stacks.some(s => s.grade.code === reqGrade.code && !s.isWarped);
          if (hasMatchingGrade) {
            const pulse = (Math.sin(this.animTime * 10) + 1) * 0.5;
            ctx.strokeStyle = `rgba(0, 230, 118, ${0.4 + pulse * 0.6})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(hx - 3, hy - 3, hw + 6, hh + 6);

            if (SPRITES.rfArrow) {
              const arrowBob = Math.sin(this.animTime * 8) * 6;
              ctx.drawImage(SPRITES.rfArrow, cx - 12, hy - 26 + arrowBob, 24, 24);
            }
          }
        }
      }
    }
  }

  // 6. Bay 0: Corrugator Stacker & Dry-End Queue (Native x = 8..188, y = 124..356)
  drawCorrugatorBay(engine) {
    const ctx = this.ctx;
    const stackerSpr = SPRITES.img.corrugator || SPRITES.stacker;
    if (stackerSpr) {
      ctx.drawImage(stackerSpr, 8, 124, 180, 148);
    } else {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(8, 124, 180, 148);
    }

    const upper = engine.corrugator.upperQueue;
    const lower = engine.corrugator.lowerQueue;
    const totalQueued = upper.length + lower.length;
    const maxCap = engine.corrugator.maxCapacity;

    // Clean UI panel below corrugator body at native y = 274..308
    ctx.fillStyle = '#14181c';
    ctx.fillRect(10, 274, 176, 34);
    ctx.strokeStyle = '#434a54';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 274, 176, 34);

    if (engine.corrugator.isDryEndStop) {
      const flash = Math.sin(this.animTime * 14) > 0;
      ctx.fillStyle = flash ? '#d32f2f' : '#b71c1c';
      ctx.fillRect(12, 276, 172, 16);
      drawTextWithOutline(ctx, '! DRY-END STOP !', 98, 284, '#ffffff', 'bold 14px Consolas, monospace', 'center');
    } else if (engine.corrugator.isCreepSpeed) {
      const flash = Math.sin(this.animTime * 10) > 0;
      ctx.fillStyle = flash ? '#f57c00' : '#ffb300';
      ctx.fillRect(12, 276, 172, 16);
      const creepRem = Math.max(0, CONFIG.CORRUGATOR.CREEP_SPEED_BUFFER - engine.corrugator.creepTimer);
      drawTextWithOutline(ctx, `! CREEP SPEED (${creepRem.toFixed(1)}s) !`, 98, 284, '#000000', 'bold 13px Consolas, monospace', 'center');
    } else {
      drawTextWithOutline(ctx, `QUEUE: ${totalQueued}/${maxCap}`, 98, 284, '#ffd54f', 'bold 15px Consolas, monospace', 'center');
    }

    // Lineup preview: NEXT: left-aligned at x = 16, 3 mini badges at 60, 86, 112, cycle bar at 142..180
    drawTextWithOutline(ctx, 'NEXT:', 16, 298, '#9e9e9e', 'bold 13px Consolas, monospace', 'left');

    const lineup = engine.corrugator.upcomingLineup || [];
    for (let i = 0; i < 3; i++) {
      const st = lineup[i];
      if (st) {
        drawGradeBadge(ctx, st.grade.code, st.isWarped, 60 + i * 26, 289, 24, 18);
      }
    }

    // Cycle progress bar
    const cycleProgress = Math.min(1.0, engine.corrugator.cycleTimer / engine.corrugator.cycleDuration);
    ctx.fillStyle = '#101316';
    ctx.fillRect(142, 293, 38, 10);
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(142, 293, Math.round(38 * cycleProgress), 10);

    // Live outfeed rollers below at native y = 310..358
    ctx.fillStyle = '#22252a';
    ctx.fillRect(40, 310, 120, 48);
    ctx.strokeStyle = '#4e5562';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 310, 120, 48);

    const roller = (SPRITES.rollers && SPRITES.rollers[this.rollerFrame]) || (SPRITES.rollers ? SPRITES.rollers[0] : null);
    if (roller) {
      ctx.drawImage(roller, 44, 324, 112, 18);
    }

    // Render Stacks on Outfeed Rollers
    if (engine.corrugator.isDualKnife) {
      if (upper.length > 0) {
        drawStackSprite(ctx, upper[0], 44, 314, 52, 38);
      }
      if (lower.length > 0) {
        drawStackSprite(ctx, lower[0], 102, 314, 52, 38);
      }
    } else {
      if (upper.length > 0) {
        drawStackSprite(ctx, upper[0], 70, 314, 54, 46);
      }
    }
  }

  // 7. Bay 7: Scrap Baler (Native x = 1112..1272, y = 124..356)
  drawScrapBalerBay(engine) {
    const ctx = this.ctx;
    const balerSpr = SPRITES.img.baler || SPRITES.baler;

    let balerX = 1112;
    let balerY = 124;

    // Clean crushing animation: hydraulic compression bounce + scrap particle burst
    if (engine.baler.isCrushing) {
      const bounce = Math.sin(engine.baler.ramAnim * Math.PI * 4) * 3;
      const jitter = (Math.random() - 0.5) * 2;
      balerY += Math.round(bounce);
      balerX += Math.round(jitter);

      if (Math.random() < 0.35) {
        engine.addParticle(596 + (Math.random() - 0.5) * 20, 152 + (Math.random() - 0.5) * 8, '#8d6e63', 3, 0.4);
      }
    }

    if (balerSpr) {
      ctx.drawImage(balerSpr, balerX, balerY, 160, 176);
    } else {
      ctx.fillStyle = '#2e4a3e';
      ctx.fillRect(balerX, balerY, 160, 176);
    }

    ctx.fillStyle = '#181b20';
    ctx.fillRect(1148, 304, 88, 52);
    ctx.strokeStyle = '#3e4450';
    ctx.lineWidth = 2;
    ctx.strokeRect(1148, 304, 88, 52);

    drawTextWithOutline(ctx, 'DROP CHUTE', 1192, 330, '#81c784', 'bold 15px Consolas, monospace', 'center');
  }

  // 8. Auto-Feeder AGV Shuttle
  drawAutoFeeder(engine) {
    if (!engine.autoFeeder.unlocked || engine.autoFeeder.status !== 'transferring') return;

    const ctx = this.ctx;
    const af = engine.autoFeeder;
    const bay = CONFIG.BAYS[af.bayIndex];
    if (!bay) return;

    const currentY = (260 - af.progress * 96) * S;
    const bayCx = bay.center * S;

    if (SPRITES.autoFeeder) {
      ctx.drawImage(SPRITES.autoFeeder, bayCx - 24, currentY, 48, 48);
    }

    if (af.stack) {
      drawStackSprite(ctx, af.stack, bayCx - 27, currentY - 16, 54, 46);
    }
  }

  // 9. Real PTC T-Cart & Custom Operator (Centered on railY = 416 native)
  drawPTCTCart(engine) {
    const ctx = this.ctx;
    const cart = engine.cart;
    const cx = Math.round(cart.x * S);
    const cy = 416; // Center rail line

    ctx.fillStyle = 'rgba(255, 245, 157, 0.20)';
    ctx.beginPath();
    ctx.moveTo(cx - 44, cy + 16);
    ctx.lineTo(cx - 160, cy - 20);
    ctx.lineTo(cx - 160, cy + 52);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + 44, cy + 16);
    ctx.lineTo(cx + 160, cy - 20);
    ctx.lineTo(cx + 160, cy + 52);
    ctx.closePath();
    ctx.fill();

    const dockedBay = CONFIG.BAYS[cart.activeBay];
    if (dockedBay && cart.isNearBay) {
      const bx = dockedBay.center * S;
      ctx.strokeStyle = '#ffd54f';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 48, cy - 36, 12, 2);
      ctx.strokeRect(bx - 48, cy - 36, 2, 12);
      ctx.strokeRect(bx + 36, cy - 36, 12, 2);
      ctx.strokeRect(bx + 46, cy - 36, 2, 12);
      ctx.strokeRect(bx - 48, cy + 34, 12, 2);
      ctx.strokeRect(bx - 48, cy + 24, 2, 12);
      ctx.strokeRect(bx + 36, cy + 34, 12, 2);
      ctx.strokeRect(bx + 46, cy + 24, 2, 12);
    }

    if (!cart.twinBed) {
      const cartSpr = SPRITES.img.tcart_single || SPRITES.cartSingle;
      if (cartSpr) {
        ctx.drawImage(cartSpr, cx - 76, cy - 48, 152, 96);
      } else {
        ctx.fillStyle = '#2d587c';
        ctx.fillRect(cx - 76, cy - 48, 152, 96);
      }

      if (cart.stacks.length > 0) {
        const stack = cart.stacks[0];
        drawStackSprite(ctx, stack, cx - 2, cy - 23, 54, 46);
      }
    } else {
      const cartSpr = SPRITES.img.tcart_twin || SPRITES.cartTwin;
      if (cartSpr) {
        ctx.drawImage(cartSpr, cx - 98, cy - 48, 196, 96);
      } else {
        ctx.fillStyle = '#2d587c';
        ctx.fillRect(cx - 98, cy - 48, 196, 96);
      }

      const activeBedX = cart.activeBed === 0 ? cx - 10 : cx + 58;
      ctx.strokeStyle = '#e040fb';
      ctx.lineWidth = 3;
      ctx.strokeRect(activeBedX - 26, cy - 46, 52, 4);

      if (cart.stacks[0]) {
        drawStackSprite(ctx, cart.stacks[0], cx - 32, cy - 22, 52, 44);
      }
      if (cart.stacks[1]) {
        drawStackSprite(ctx, cart.stacks[1], cx + 28, cy - 22, 52, 44);
      }
    }
  }

  // 10. Sliding Stack Transfer Animation
  drawTransferAnim(engine) {
    const anim = engine.cart.transferAnim;
    if (!anim) return;

    const ctx = this.ctx;
    const currentX = (anim.fromX + (anim.toX - anim.fromX) * anim.progress) * S;
    const currentY = (anim.fromY + (anim.toY - anim.fromY) * anim.progress) * S;

    drawStackSprite(ctx, anim.stack, currentX - 27, currentY - 23, 54, 46);
  }

  // 11. Particles & Sparks
  drawParticles(engine) {
    const ctx = this.ctx;
    engine.particles.forEach(pt => {
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x * S), Math.round(pt.y * S), pt.size * S, pt.size * S);
    });
  }

  // 12. Top HUD Bar with True Continuous Live OEE % & Grade-Badged Backlog (Native y = 0..64)
  drawTopHud(engine) {
    const ctx = this.ctx;

    ctx.fillStyle = '#16191d';
    ctx.fillRect(0, 0, NATIVE_W, 64);
    ctx.fillStyle = '#373d47';
    ctx.fillRect(0, 62, NATIVE_W, 2);

    // Shift #
    drawTextWithOutline(ctx, `SHIFT ${engine.shiftNumber}`, 20, 32, '#ffd54f', 'bold 18px Consolas, monospace', 'left');

    // Clock
    drawTextWithOutline(ctx, `⏱ ${engine.clockTimeStr}`, 150, 32, '#ffffff', 'bold 18px Consolas, monospace', 'left');

    // Capital ($)
    drawTextWithOutline(ctx, `$${engine.cash.toFixed(2)}`, 290, 32, '#66bb6a', 'bold 18px Consolas, monospace', 'left');

    // Continuous Live OEE %
    const liveOee = engine.getLiveOEE();
    const livePct = Math.round(liveOee.overall * 100);

    drawTextWithOutline(ctx, 'LIVE OEE:', 450, 32, '#cfd8dc', 'bold 15px Consolas, monospace', 'left');
    const oeeColor = livePct >= 80 ? '#66bb6a' : livePct >= 65 ? '#ffb300' : '#ef5350';
    drawTextWithOutline(ctx, `${livePct}%`, 540, 32, oeeColor, 'bold 18px Consolas, monospace', 'left');

    // Corrugator Backlog Pip Boxes with Pulsing Border Flash during Creep Speed & Dry-End Stop
    const upper = engine.corrugator.upperQueue;
    const lower = engine.corrugator.lowerQueue;
    const allQueue = upper.concat(lower);
    const maxCap = engine.corrugator.maxCapacity;

    drawTextWithOutline(ctx, 'BACKLOG:', 620, 32, '#9e9e9e', 'bold 15px Consolas, monospace', 'left');

    const isCreep = engine.corrugator.isCreepSpeed;
    const isDryStop = engine.corrugator.isDryEndStop;
    const creepPulse = Math.sin(this.animTime * 10) > 0;
    const dryPulse = Math.sin(this.animTime * 14) > 0;

    for (let b = 0; b < maxCap; b++) {
      const bx = 710 + b * 28;
      const by = 20;
      const stack = allQueue[b];

      if (stack) {
        drawGradeBadge(ctx, stack.grade.code, stack.isWarped, bx, by, 24, 24);

        if (isDryStop) {
          ctx.strokeStyle = dryPulse ? '#ff1744' : '#d50000';
          ctx.lineWidth = 2;
          ctx.strokeRect(bx - 1, by - 1, 26, 26);
        } else if (isCreep) {
          ctx.strokeStyle = creepPulse ? '#ffd700' : '#ff9800';
          ctx.lineWidth = 2;
          ctx.strokeRect(bx - 1, by - 1, 26, 26);
        }
      } else {
        let pipBg = '#24282f';
        let pipBorder = '#373d47';

        if (isDryStop) {
          pipBorder = dryPulse ? '#ef5350' : '#b71c1c';
          pipBg = dryPulse ? 'rgba(239, 83, 80, 0.25)' : '#24282f';
        } else if (isCreep) {
          pipBorder = creepPulse ? '#ffb300' : '#f57c00';
          pipBg = creepPulse ? 'rgba(255, 179, 0, 0.25)' : '#24282f';
        }

        ctx.fillStyle = pipBg;
        ctx.fillRect(bx, by, 24, 24);
        ctx.strokeStyle = pipBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, 24, 24);
      }
    }
  }

  // 13. Bottom Ticker & Controls (Native y = 660..720)
  drawBottomTicker(engine) {
    const ctx = this.ctx;

    ctx.fillStyle = '#16191d';
    ctx.fillRect(0, 660, NATIVE_W, 60);
    ctx.fillStyle = '#373d47';
    ctx.fillRect(0, 660, NATIVE_W, 2);

    let startX = 24;
    const hasEvent = !!engine.activeEvent;

    if (hasEvent) {
      const ev = engine.activeEvent;
      const pulse = Math.sin(this.animTime * 10) > 0;

      // Widen event banner to x = 0..420 with strict clipping to prevent text bleeding
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 660, 416, 60);
      ctx.clip();

      ctx.fillStyle = pulse ? '#c62828' : '#e65100';
      ctx.fillRect(0, 660, 416, 60);

      drawTextWithOutline(ctx, `⚡ ${ev.name}`, 16, 680, '#ffffff', 'bold 15px Consolas, monospace', 'left');
      const shortDesc = ev.type === 'FLEXO_JAM'
        ? `Hold [E] at Bay (${Math.ceil(ev.timer)}s)`
        : `${ev.desc} (${Math.ceil(ev.timer)}s)`;
      drawTextWithOutline(ctx, shortDesc, 16, 700, '#ffe082', 'bold 13px Consolas, monospace', 'left');
      ctx.restore();

      startX = 432;
    }

    const bayId = engine.cart.activeBay;
    let prompt = '';

    if (bayId === 0) {
      prompt = engine.corrugator.isDualKnife
        ? '[W] Grab Upper  [S] Grab Lower  [SPACE] Smart Grab'
        : '[W / SPACE] Grab Corrugator Stacker Queue';
    } else if (bayId >= 1 && bayId <= 6) {
      const flexo = engine.flexos[bayId - 1];
      if (flexo && flexo.isUnlocked && flexo.state === 'JAMMED') {
        prompt = `⚠️ LINE ${flexo.id} JAMMED! HOLD [E] TO CLEAR JAM (${(CONFIG.CART.JAM_FIX_HOLD_TIME - engine.cart.jamFixTimer).toFixed(1)}s)`;
      } else {
        prompt = `[W] Feed Line ${bayId}  [S] Store WIP  [SPACE] Pull WIP`;
      }
    } else if (bayId === 7) {
      prompt = '[W / S / SPACE] Dump Stack to Scrap Baler (+$15 if Warped)';
    }

    drawTextWithOutline(ctx, prompt, startX, 690, '#ffd54f', 'bold 16px Consolas, monospace', 'left');

    // Omit far-right keybind hint when event banner is active so prompt never collides
    if (!hasEvent) {
      drawTextWithOutline(ctx, '[A/D] Drive  [Q] Swap Bed  [M] Mute  [P] Pause', NATIVE_W - 24, 690, '#90a4ae', 'bold 14px Consolas, monospace', 'right');
    }
  }

  // 14. Floating Popups
  drawPopups(engine) {
    const ctx = this.ctx;
    engine.popups.forEach(p => {
      const alpha = Math.min(1.0, p.life / (p.maxLife * 0.4));
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      drawTextWithOutline(ctx, p.text, p.x * S, p.y * S, p.color, 'bold 16px Consolas, monospace', 'center', '#000000', 3);
      ctx.restore();
    });
  }
}
