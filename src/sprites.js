// sprites.js - 16-bit procedural fallback sprites & async asset loader with magenta chroma-key auto-trim

import { CONFIG } from './config.js';

export const SPRITES = {
  img: {} // real image assets processed from assets/
};

function createOffscreen(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w);
  canvas.height = Math.round(h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function fill(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// -------------------------------------------------------------
// ASSET LOADER WITH MAGENTA CHROMA-KEY & AUTO-TRIM
// -------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load ' + src));
    img.src = src;
  });
}

async function loadAssetImage(baseName) {
  const extensions = ['.jpg', '.png', '.jpeg'];
  for (const ext of extensions) {
    try {
      const img = await loadImage(`assets/${baseName}${ext}`);
      return img;
    } catch (e) {
      // try next extension
    }
  }
  return null;
}

function processSprite(img, name) {
  if (!img) return null;
  const w = img.width;
  const h = img.height;

  // Background: Full bleed, no chroma key
  if (name === 'bg_factory') {
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const octx = off.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(img, 0, 0);
    return off;
  }

  // Isolated sprites: Chroma-key, watermark wipe, despill, auto-crop
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(img, 0, 0);

  const imgData = octx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Step 1: Wipe far bottom-right corner (x > w*0.90 && y > h*0.90) to remove corner marks
  const wmStartX = Math.floor(w * 0.90);
  const wmStartY = Math.floor(h * 0.90);

  // Step 2 & 3: Strip neon magenta (#FF00FF)
  const isTransparent = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    const isWmV = y >= wmStartY;
    for (let x = 0; x < w; x++) {
      const pIdx = y * w + x;
      const idx = pIdx * 4;

      if (isWmV && x >= wmStartX) {
        data[idx + 3] = 0;
        isTransparent[pIdx] = 1;
        continue;
      }

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Magenta chroma-key rule:
      if ((r > 170 && g < 115 && b > 170) || (r - g > 65 && b - g > 65)) {
        data[idx + 3] = 0;
        isTransparent[pIdx] = 1;
      }
    }
  }

  // Step 4: 1-pixel edge despill pass on opaque pixels touching transparent pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pIdx = y * w + x;
      if (isTransparent[pIdx]) continue;
      const idx = pIdx * 4;
      if (data[idx + 3] === 0) continue;

      let touchesTrans = false;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) { touchesTrans = true; break; }
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w || isTransparent[ny * w + nx]) {
            touchesTrans = true;
            break;
          }
        }
        if (touchesTrans) break;
      }

      if (touchesTrans) {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (r > g + 35 && b > g + 35) {
          // Neutralize pink/magenta fringe toward dark charcoal outline #1c1e22
          data[idx] = 28;
          data[idx + 1] = 30;
          data[idx + 2] = 34;
        }
      }
    }
  }

  // Step 5: Auto-crop tightly to bounding box of remaining opaque pixels
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (data[idx + 3] > 15) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX >= minX && maxY >= minY) {
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const cropped = document.createElement('canvas');
    cropped.width = cropW;
    cropped.height = cropH;
    const cctx = cropped.getContext('2d');
    cctx.imageSmoothingEnabled = false;

    // Put image data into temp and draw cropped region
    octx.putImageData(imgData, 0, 0);
    cctx.drawImage(off, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return cropped;
  }

  octx.putImageData(imgData, 0, 0);
  return off;
}

// Pre-generate Wax stack from White-Top (or Kraft) with glossy slate-blue overlay
function generateWaxStack(baseStack) {
  if (!baseStack) return null;
  const w = baseStack.width;
  const h = baseStack.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseStack, 0, 0);

  // Tint top surface with slate-blue #4d88b5
  const topH = Math.round(h * 0.45);
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(77, 136, 181, 0.85)';
  ctx.fillRect(0, 0, w, topH);

  // Glossy highlight shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillRect(Math.round(w * 0.1), Math.round(h * 0.04), Math.round(w * 0.8), Math.max(2, Math.round(h * 0.05)));
  ctx.restore();

  return c;
}

// Pre-generate Flexo Locked from active Flexo
function generateFlexoLocked(baseFlexo) {
  if (!baseFlexo) return null;
  const w = baseFlexo.width;
  const h = baseFlexo.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseFlexo, 0, 0);

  // Dark overlay & caution tape clipped strictly to machine silhouette
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(15, 20, 25, 0.72)';
  ctx.fillRect(0, 0, w, h);

  // Diagonal yellow/black caution tape across center
  ctx.translate(w / 2, h / 2 - 10);
  ctx.rotate(-0.35);
  const tapeW = Math.round(w * 1.3);
  const tapeH = Math.max(16, Math.round(h * 0.15));
  ctx.fillStyle = '#f0c419';
  ctx.fillRect(-tapeW / 2, -tapeH / 2, tapeW, tapeH);
  ctx.fillStyle = '#1c1e22';
  for (let tx = -tapeW / 2; tx < tapeW / 2; tx += 28) {
    ctx.beginPath();
    ctx.moveTo(tx, tapeH / 2);
    ctx.lineTo(tx + 14, -tapeH / 2);
    ctx.lineTo(tx + 22, -tapeH / 2);
    ctx.lineTo(tx + 8, tapeH / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Crisp yellow padlock at center-top
  const px = Math.round(w / 2);
  const py = Math.round(h * 0.28);
  const pw = Math.max(24, Math.round(w * 0.18));
  const ph = Math.max(20, Math.round(h * 0.15));

  ctx.strokeStyle = '#cfd8dc';
  ctx.lineWidth = Math.max(3, Math.round(w * 0.025));
  ctx.strokeRect(px - pw * 0.35, py - ph * 0.5, pw * 0.7, ph * 0.6);

  ctx.fillStyle = '#ffd54f';
  ctx.fillRect(px - pw / 2, py, pw, ph);
  ctx.fillStyle = '#212121';
  ctx.fillRect(px - pw * 0.1, py + ph * 0.3, pw * 0.2, ph * 0.35);

  return c;
}

export async function loadAllSprites() {
  // 1. Run procedural generator first for fallbacks
  initSprites();

  // 2. Load 10 real image assets concurrently
  const assetNames = [
    'bg_factory',
    'tcart_single',
    'tcart_twin',
    'corrugator',
    'flexo',
    'baler',
    'stack_kraft',
    'stack_doublewall',
    'stack_whitetop',
    'stack_warped'
  ];

  const loadedImages = await Promise.all(assetNames.map(async name => {
    const raw = await loadAssetImage(name);
    return { name, raw };
  }));

  let loadedCount = 0;
  for (const item of loadedImages) {
    if (item.raw) {
      SPRITES.img[item.name] = processSprite(item.raw, item.name);
      loadedCount++;
    } else {
      console.warn(`Asset ${item.name} not found; procedural fallback active.`);
    }
  }

  // Pre-generate Wax stack from White-Top or Kraft
  if (SPRITES.img.stack_whitetop) {
    SPRITES.img.stack_wax = generateWaxStack(SPRITES.img.stack_whitetop);
  } else if (SPRITES.img.stack_kraft) {
    SPRITES.img.stack_wax = generateWaxStack(SPRITES.img.stack_kraft);
  }

  // Pre-generate Flexo Locked from Flexo
  if (SPRITES.img.flexo) {
    SPRITES.img.flexo_locked = generateFlexoLocked(SPRITES.img.flexo);
  }

  console.log(`[Sprites] Successfully loaded & chroma-keyed ${loadedCount}/${assetNames.length} real assets.`);
}

// -------------------------------------------------------------
// PROCEDURAL 16-BIT FALLBACK SPRITES
// -------------------------------------------------------------

export function initSprites() {
  generateBrightFloorAndHighBay();
  generateHazardStripes();
  generateRollers();
  generateCardboardStacks();
  generatePTCTCarts();
  generateFlexoMachines();
  generateCorrugatorStacker();
  generateScrapBaler();
  generatePalletAndBoxes();
  generateAutoFeeder();
  generateAndonLights();
  generatePlantDetails();
}

function generateBrightFloorAndHighBay() {
  const f = createOffscreen(16, 16);
  fill(f.ctx, '#9aa0a8', 0, 0, 16, 16);
  fill(f.ctx, '#a8aeb6', 0, 0, 16, 1);
  fill(f.ctx, '#a8aeb6', 0, 0, 1, 16);
  fill(f.ctx, '#7d838c', 0, 15, 16, 1);
  fill(f.ctx, '#7d838c', 15, 0, 1, 16);
  fill(f.ctx, '#a1a7b0', 4, 4, 2, 2);
  fill(f.ctx, '#9399a1', 9, 7, 2, 1);
  fill(f.ctx, '#a4abb3', 12, 11, 2, 2);
  SPRITES.floorTile = f.canvas;

  const r = createOffscreen(16, 48);
  fill(r.ctx, '#f0c419', 0, 0, 16, 48);
  fill(r.ctx, '#f7d340', 0, 0, 16, 2);
  fill(r.ctx, '#26292e', 0, 13, 16, 6);
  fill(r.ctx, '#3a3f47', 0, 14, 16, 4);
  fill(r.ctx, '#cfd8dc', 0, 15, 16, 2);
  fill(r.ctx, '#ffffff', 0, 15, 16, 1);
  fill(r.ctx, '#26292e', 0, 31, 16, 6);
  fill(r.ctx, '#3a3f47', 0, 32, 16, 4);
  fill(r.ctx, '#cfd8dc', 0, 33, 16, 2);
  fill(r.ctx, '#ffffff', 0, 33, 16, 1);
  SPRITES.railSegment = r.canvas;

  const w = createOffscreen(32, 34);
  const wctx = w.ctx;
  fill(wctx, '#484f58', 0, 0, 32, 34);
  wctx.strokeStyle = '#68727d';
  wctx.lineWidth = 1;
  wctx.beginPath();
  wctx.moveTo(0, 0); wctx.lineTo(32, 34);
  wctx.moveTo(32, 0); wctx.lineTo(0, 34);
  wctx.stroke();

  fill(wctx, '#383e46', 4, 2, 24, 14);
  fill(wctx, '#b8dcff', 5, 3, 22, 12);
  fill(wctx, '#e8f5ff', 6, 4, 10, 10);
  fill(wctx, '#5a626c', 15, 2, 2, 14);
  fill(wctx, '#5a626c', 4, 8, 24, 2);
  fill(wctx, '#29b6f6', 0, 18, 32, 3);
  fill(wctx, '#ef5350', 0, 23, 32, 2);
  fill(wctx, '#90a4ae', 0, 27, 32, 2);
  fill(wctx, '#212529', 14, 25, 4, 3);
  fill(wctx, '#ffd54f', 15, 28, 2, 2);
  SPRITES.highBayWall = w.canvas;
}

function generateHazardStripes() {
  const h = createOffscreen(32, 8);
  fill(h.ctx, '#f0c419', 0, 0, 32, 8);
  h.ctx.fillStyle = '#1c1e22';
  for (let x = -8; x < 40; x += 12) {
    h.ctx.beginPath();
    h.ctx.moveTo(x, 8);
    h.ctx.lineTo(x + 6, 0);
    h.ctx.lineTo(x + 10, 0);
    h.ctx.lineTo(x + 4, 8);
    h.ctx.closePath();
    h.ctx.fill();
  }
  SPRITES.hazardStripe = h.canvas;
}

function generateRollers() {
  SPRITES.rollers = [];
  for (let frame = 0; frame < 2; frame++) {
    const r = createOffscreen(32, 12);
    fill(r.ctx, '#26292e', 0, 0, 32, 12);
    for (let i = 0; i < 4; i++) {
      const rx = i * 8 + 1;
      fill(r.ctx, '#5e6772', rx, 1, 6, 10);
      fill(r.ctx, '#8c97a3', rx + 1, 1, 4, 10);
      const hOffset = frame === 0 ? 2 : 4;
      fill(r.ctx, '#d8e0e8', rx + hOffset, 1, 1, 10);
      fill(r.ctx, '#363c44', rx + 5, 1, 1, 10);
    }
    SPRITES.rollers.push(r.canvas);
  }
}

function generateCardboardStacks() {
  SPRITES.stacks = {};
  const grades = CONFIG.BOARD_GRADES;

  Object.keys(grades).forEach(code => {
    const g = grades[code];
    const w = 34;
    const h = g.thicker ? 20 : 16;
    const s = createOffscreen(w, h);
    const ctx = s.ctx;

    fill(ctx, 'rgba(15,20,25,0.35)', 2, 4, w - 2, h - 3);
    fill(ctx, g.fluteColor, 1, 5, w - 2, h - 5);
    for (let x = 2; x < w - 2; x += 3) {
      fill(ctx, '#2c1e11', x, 6, 1, h - 7);
      fill(ctx, '#efe2ce', x + 1, 7, 1, h - 8);
    }
    fill(ctx, '#3d2b1a', 1, h - 2, w - 2, 2);

    fill(ctx, g.color, 1, 0, w - 2, 6);
    fill(ctx, '#ffffff', 2, 0, w - 4, 1);
    fill(ctx, 'rgba(0,0,0,0.12)', 1, 5, w - 2, 1);

    const labelW = 12;
    const labelH = 7;
    const lx = Math.round((w - labelW) / 2);
    const ly = 0;
    const labelBg = (g.code === 'K' || g.code === 'W') ? '#ffffff' : '#14181c';
    fill(ctx, labelBg, lx, ly, labelW, labelH);
    fill(ctx, '#333333', lx, ly, labelW, 1);

    ctx.fillStyle = g.textColor;
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.code, Math.round(w / 2), ly + 4);

    SPRITES.stacks[code] = s.canvas;
  });

  const ww = 34;
  const wh = 18;
  const ws = createOffscreen(ww, wh);
  const wctx = ws.ctx;

  fill(wctx, 'rgba(15,20,25,0.35)', 2, 4, ww - 2, wh - 3);
  fill(wctx, '#9c6f3b', 1, 6, ww - 2, wh - 7);
  for (let x = 2; x < ww - 2; x += 4) {
    const bend = (x % 8 === 0) ? -2 : 1;
    fill(wctx, '#402812', x, 7 + bend, 2, wh - 9);
    fill(wctx, '#e0a96d', x + 1, 8 + bend, 1, wh - 10);
  }
  fill(wctx, '#c89658', 1, 1, ww - 2, 6);

  const wlx = Math.round((ww - 12) / 2);
  fill(wctx, '#d32f2f', wlx, 0, 12, 7);
  fill(wctx, '#ffffff', Math.round(ww / 2 - 1), 1, 2, 3);
  fill(wctx, '#ffffff', Math.round(ww / 2 - 1), 5, 2, 1);
  SPRITES.stacks.WARPED = ws.canvas;
}

function generatePTCTCarts() {
  function drawOperator(ctx, ox, oy) {
    fill(ctx, '#181b1f', ox - 2, oy + 12, 4, 8);
    fill(ctx, '#455a64', ox - 2, oy + 14, 4, 1);
    fill(ctx, '#455a64', ox - 2, oy + 18, 4, 1);

    fill(ctx, '#263238', ox + 8, oy + 8, 6, 10);
    fill(ctx, '#00e676', ox + 9, oy + 10, 2, 1);
    fill(ctx, '#29b6f6', ox + 12, oy + 10, 1, 1);
    fill(ctx, '#ffd54f', ox + 10, oy + 13, 3, 2);

    fill(ctx, '#263238', ox + 2, oy + 12, 6, 8);
    fill(ctx, '#8e959d', ox + 1, oy + 6, 8, 7);
    fill(ctx, '#aeb5bd', ox + 2, oy + 6, 6, 6);
    fill(ctx, '#ffffff', ox + 4, oy + 5, 2, 1);
    fill(ctx, '#aeb5bd', ox + 6, oy + 8, 3, 3);
    fill(ctx, '#f5c096', ox + 8, oy + 9, 2, 2);

    fill(ctx, '#f5c096', ox + 3, oy + 1, 6, 5);
    fill(ctx, '#4a3525', ox + 2, oy - 1, 7, 3);
    fill(ctx, '#382417', ox + 1, oy + 1, 2, 2);
    fill(ctx, '#c89658', ox + 7, oy + 1, 2, 1);

    fill(ctx, '#ffffff', ox + 5, oy + 2, 3, 2);
    fill(ctx, '#1a237e', ox + 6, oy + 2, 1, 1);
    fill(ctx, '#e0e0e0', ox + 4, oy + 2, 1, 1);
    fill(ctx, '#5d4037', ox + 5, oy + 4, 3, 1);
    fill(ctx, '#d84315', ox + 6, oy + 5, 2, 1);
  }

  const sc = createOffscreen(54, 34);
  const sctx = sc.ctx;
  fill(sctx, '#1d3c56', 0, 22, 54, 12);
  fill(sctx, '#2d587c', 1, 23, 52, 10);
  fill(sctx, '#4278a3', 1, 23, 52, 1);
  fill(sctx, '#111111', 24, 31, 8, 3);
  fill(sctx, '#f5c518', 25, 31, 2, 2);
  fill(sctx, '#f5c518', 29, 31, 2, 2);

  fill(sctx, '#c8372d', 16, 12, 36, 10);
  fill(sctx, '#e04a3f', 17, 13, 34, 1);
  fill(sctx, '#263238', 40, 15, 10, 6);
  for (let gy = 16; gy <= 20; gy += 2) {
    fill(sctx, '#78909c', 41, gy, 8, 1);
  }

  fill(sctx, '#f5c518', 16, 2, 37, 2);
  fill(sctx, '#f5c518', 16, 10, 37, 2);
  fill(sctx, '#f5c518', 16, 2, 2, 20);
  fill(sctx, '#f5c518', 34, 2, 2, 20);
  fill(sctx, '#f5c518', 51, 2, 2, 20);

  fill(sctx, '#1e2226', 18, 14, 32, 8);
  for (let rx = 19; rx <= 48; rx += 4) {
    fill(sctx, '#8c97a3', rx, 14, 3, 8);
    fill(sctx, '#d8e0e8', rx + 1, 14, 1, 8);
  }

  drawOperator(sctx, 4, 8);
  fill(sctx, '#fff59d', 0, 24, 2, 4);
  fill(sctx, '#ffffff', 0, 25, 1, 2);
  fill(sctx, '#fff59d', 52, 24, 2, 4);
  fill(sctx, '#ffffff', 53, 25, 1, 2);
  SPRITES.cartSingle = sc.canvas;

  const tc = createOffscreen(68, 34);
  const tctx = tc.ctx;
  fill(tctx, '#1d3c56', 0, 22, 68, 12);
  fill(tctx, '#2d587c', 1, 23, 66, 10);
  fill(tctx, '#4278a3', 1, 23, 66, 1);
  fill(tctx, '#111111', 32, 31, 8, 3);
  fill(tctx, '#f5c518', 33, 31, 2, 2);
  fill(tctx, '#f5c518', 37, 31, 2, 2);

  fill(tctx, '#c8372d', 16, 12, 50, 10);
  fill(tctx, '#e04a3f', 17, 13, 48, 1);
  fill(tctx, '#263238', 54, 15, 10, 6);
  for (let gy = 16; gy <= 20; gy += 2) {
    fill(tctx, '#78909c', 55, gy, 8, 1);
  }

  fill(tctx, '#f5c518', 16, 2, 51, 2);
  fill(tctx, '#f5c518', 16, 10, 51, 2);
  fill(tctx, '#f5c518', 16, 2, 2, 20);
  fill(tctx, '#f5c518', 40, 2, 2, 20);
  fill(tctx, '#f5c518', 65, 2, 2, 20);

  fill(tctx, '#1e2226', 18, 14, 21, 8);
  for (let rx = 19; rx <= 37; rx += 4) {
    fill(tctx, '#8c97a3', rx, 14, 3, 8);
    fill(tctx, '#d8e0e8', rx + 1, 14, 1, 8);
  }
  fill(tctx, '#1e2226', 43, 14, 21, 8);
  for (let rx = 44; rx <= 62; rx += 4) {
    fill(tctx, '#8c97a3', rx, 14, 3, 8);
    fill(tctx, '#d8e0e8', rx + 1, 14, 1, 8);
  }

  drawOperator(tctx, 4, 8);
  fill(tctx, '#fff59d', 0, 24, 2, 4);
  fill(tctx, '#ffffff', 0, 25, 1, 2);
  fill(tctx, '#fff59d', 66, 24, 2, 4);
  fill(tctx, '#ffffff', 67, 25, 1, 2);
  SPRITES.cartTwin = tc.canvas;
}

function generateFlexoMachines() {
  const w = 72;
  const h = 86;
  const m = createOffscreen(w, h);
  const ctx = m.ctx;

  fill(ctx, '#1c282e', 0, 0, w, h);
  fill(ctx, '#385a68', 2, 2, w - 4, h - 4);
  fill(ctx, '#527c8c', 3, 3, w - 6, 2);

  fill(ctx, '#22323a', 4, 66, w - 8, 16);
  fill(ctx, '#8c97a3', 8, 70, w - 16, 8);
  fill(ctx, '#d0d7de', 8, 72, w - 16, 2);

  fill(ctx, '#273c45', 6, 12, 28, 22);
  fill(ctx, '#273c45', 38, 12, 28, 22);
  fill(ctx, '#00bcd4', 10, 16, 20, 6);
  fill(ctx, '#e91e63', 42, 16, 20, 6);
  fill(ctx, 'rgba(255,255,255,0.25)', 8, 14, 8, 18);
  fill(ctx, 'rgba(255,255,255,0.25)', 40, 14, 8, 18);

  fill(ctx, '#1c2b32', 6, 36, w - 12, 12);
  fill(ctx, '#a0aab5', 10, 38, w - 20, 8);
  for (let cx = 14; cx < w - 22; cx += 8) {
    fill(ctx, '#40454d', cx, 38, 2, 8);
  }

  fill(ctx, '#2e434e', 6, 50, w - 12, 14);
  fill(ctx, '#d97724', 10, 53, 4, 6);
  fill(ctx, '#232528', 16, 54, w - 32, 4);

  for (let ly = 14; ly < 50; ly += 5) {
    fill(ctx, '#172227', 2, ly, 2, 3);
    fill(ctx, '#172227', w - 4, ly, 2, 3);
  }
  SPRITES.flexoBody = m.canvas;

  const lm = createOffscreen(w, h);
  const lctx = lm.ctx;
  lctx.drawImage(m.canvas, 0, 0);
  fill(lctx, 'rgba(15, 20, 25, 0.75)', 0, 0, w, h);

  lctx.save();
  lctx.translate(w / 2, h / 2 - 8);
  lctx.rotate(-0.35);
  fill(lctx, '#f0c419', -45, -8, 90, 16);
  lctx.fillStyle = '#1c1e22';
  for (let tx = -40; tx < 45; tx += 14) {
    lctx.beginPath();
    lctx.moveTo(tx, 8);
    lctx.lineTo(tx + 6, -8);
    lctx.lineTo(tx + 10, -8);
    lctx.lineTo(tx + 4, 8);
    lctx.closePath();
    lctx.fill();
  }
  lctx.restore();

  const px = Math.round(w / 2);
  lctx.strokeStyle = '#b0bec5';
  lctx.lineWidth = 3;
  lctx.strokeRect(px - 7, 24, 14, 10);
  fill(lctx, '#ffd54f', px - 10, 32, 20, 16);
  fill(lctx, '#202226', px - 2, 38, 4, 6);

  fill(lctx, '#121417', px - 26, 54, 52, 18);
  lctx.strokeStyle = '#f0c419';
  lctx.lineWidth = 1;
  lctx.strokeRect(px - 26, 54, 52, 18);
  SPRITES.flexoLocked = lm.canvas;
}

function generateCorrugatorStacker() {
  const w = 90;
  const h = 86;
  const cs = createOffscreen(w, h);
  const ctx = cs.ctx;

  fill(ctx, '#1a1d20', 0, 0, w, h);
  fill(ctx, '#3c424a', 2, 2, w - 4, h - 4);
  fill(ctx, '#c89658', 0, 14, 26, 20);
  fill(ctx, '#9c6f3b', 0, 22, 26, 6);
  fill(ctx, '#e0ab70', 0, 14, 26, 2);

  fill(ctx, '#23262b', 26, 8, 16, 34);
  fill(ctx, '#d0d7de', 29, 10, 10, 30);
  fill(ctx, '#d32f2f', 26, 6, 16, 3);

  fill(ctx, '#292d33', 44, 12, 44, 24);
  fill(ctx, '#8c97a3', 46, 28, 40, 6);
  for (let rx = 48; rx < 84; rx += 8) {
    fill(ctx, '#d6dee6', rx, 28, 2, 6);
  }

  fill(ctx, '#292d33', 44, 46, 44, 24);
  fill(ctx, '#8c97a3', 46, 62, 40, 6);
  for (let rx = 48; rx < 84; rx += 8) {
    fill(ctx, '#d6dee6', rx, 62, 2, 6);
  }

  fill(ctx, '#f0c419', 42, 18, 3, 50);
  fill(ctx, '#cfd8dc', 43, 22, 1, 42);

  fill(ctx, '#15171a', 4, 58, 36, 18);
  fill(ctx, '#f0c419', 5, 59, 34, 16);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CORRUGATOR', 22, 69);
  SPRITES.stacker = cs.canvas;
}

function generateScrapBaler() {
  const w = 80;
  const h = 86;
  const b = createOffscreen(w, h);
  const ctx = b.ctx;

  fill(ctx, '#18241c', 0, 0, w, h);
  fill(ctx, '#2e4e37', 2, 2, w - 4, h - 4);
  fill(ctx, '#406e4d', 3, 3, w - 6, 2);

  fill(ctx, '#141d17', 10, 48, w - 20, 32);
  fill(ctx, '#78909c', 14, 52, w - 28, 6);
  for (let tx = 16; tx < w - 20; tx += 6) {
    fill(ctx, '#37474f', tx, 52, 2, 6);
  }

  fill(ctx, '#37474f', 26, 6, 28, 38);
  fill(ctx, '#b0bec5', 30, 8, 20, 34);
  fill(ctx, '#ffffff', 32, 8, 3, 34);
  fill(ctx, '#f57c00', 22, 40, 36, 6);

  fill(ctx, '#b0bec5', 4, 12, 14, 14);
  fill(ctx, '#263238', 8, 16, 6, 6);
  fill(ctx, '#cfd8dc', 5, 28, 1, 30);

  fill(ctx, '#d32f2f', 12, 80, w - 24, 5);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCRAP BALER', w / 2, 84);
  SPRITES.baler = b.canvas;
}

function generatePalletAndBoxes() {
  const p = createOffscreen(32, 20);
  const pctx = p.ctx;
  fill(pctx, '#6d4c41', 2, 15, 28, 4);
  fill(pctx, '#4e342e', 4, 15, 4, 4);
  fill(pctx, '#4e342e', 14, 15, 4, 4);
  fill(pctx, '#4e342e', 24, 15, 4, 4);
  fill(pctx, '#8d6e63', 0, 12, 32, 3);

  fill(pctx, '#c89658', 2, 2, 28, 11);
  fill(pctx, '#9c6f3b', 2, 5, 28, 1);
  fill(pctx, '#9c6f3b', 2, 8, 28, 1);
  fill(pctx, '#9c6f3b', 16, 2, 1, 10);
  fill(pctx, '#ffffff', 8, 1, 2, 13);
  fill(pctx, '#ffffff', 22, 1, 2, 13);
  SPRITES.pallet = p.canvas;
}

function generateAutoFeeder() {
  const af = createOffscreen(24, 20);
  const actx = af.ctx;
  fill(actx, '#212121', 0, 4, 24, 14);
  fill(actx, '#ffb300', 1, 5, 22, 12);
  fill(actx, '#000000', 1, 17, 5, 3);
  fill(actx, '#000000', 18, 17, 5, 3);
  fill(actx, '#78909c', 3, 2, 18, 4);
  for (let x = 4; x <= 18; x += 4) {
    fill(actx, '#cfd8dc', x, 2, 1, 4);
  }
  fill(actx, '#29b6f6', 10, 0, 4, 3);
  fill(actx, '#e1f5fe', 11, 0, 2, 1);
  SPRITES.autoFeeder = af.canvas;
}

function generateAndonLights() {
  SPRITES.andon = {};
  const states = ['GREEN', 'AMBER', 'RED', 'BLUE', 'OFF'];
  const colors = {
    GREEN: '#4caf50',
    AMBER: '#ffb300',
    RED: '#f44336',
    BLUE: '#29b6f6',
    OFF: '#37474f'
  };

  states.forEach(state => {
    const a = createOffscreen(10, 22);
    const actx = a.ctx;
    fill(actx, '#263238', 4, 12, 2, 10);
    fill(actx, '#455a64', 3, 20, 4, 2);
    fill(actx, '#101416', 2, 0, 6, 12);

    fill(actx, state === 'RED' ? colors.RED : '#3e2723', 3, 1, 4, 2);
    fill(actx, state === 'AMBER' ? colors.AMBER : '#3e2723', 3, 4, 4, 2);
    fill(actx, state === 'GREEN' ? colors.GREEN : '#1b381e', 3, 7, 4, 2);
    fill(actx, state === 'BLUE' ? colors.BLUE : '#0d2738', 3, 10, 4, 2);

    if (state !== 'OFF') {
      const activeColor = colors[state];
      actx.shadowColor = activeColor;
      actx.shadowBlur = 4;
      fill(actx, '#ffffff', 4, state === 'RED' ? 1 : state === 'AMBER' ? 4 : state === 'GREEN' ? 7 : 10, 2, 1);
      actx.shadowBlur = 0;
    }

    SPRITES.andon[state] = a.canvas;
  });
}

function generatePlantDetails() {
  const s = createOffscreen(26, 16);
  const sctx = s.ctx;
  fill(sctx, '#2e7d32', 0, 0, 26, 16);
  fill(sctx, '#ffffff', 1, 1, 24, 14);
  fill(sctx, '#2e7d32', 2, 2, 22, 5);
  sctx.fillStyle = '#ffffff';
  sctx.font = 'bold 4px monospace';
  sctx.textAlign = 'center';
  sctx.fillText('SAFETY', 13, 6);
  sctx.fillStyle = '#2e7d32';
  sctx.fillText('FIRST', 13, 13);
  SPRITES.safetySign = s.canvas;

  const bp = createOffscreen(24, 48);
  const bpctx = bp.ctx;
  fill(bpctx, '#5d4037', 0, 44, 24, 4);
  for (let tier = 0; tier < 4; tier++) {
    const ty = 44 - (tier + 1) * 11;
    fill(bpctx, '#c89658', 1, ty, 22, 10);
    fill(bpctx, '#9c6f3b', 1, ty + 4, 22, 1);
    fill(bpctx, '#e0ab70', 2, ty, 20, 1);
    fill(bpctx, '#ffffff', 6, ty, 1, 10);
    fill(bpctx, '#ffffff', 17, ty, 1, 10);
  }
  SPRITES.bgPalletStack = bp.canvas;

  const w = createOffscreen(14, 14);
  const wctx = w.ctx;
  fill(wctx, '#ffca28', 2, 10, 4, 2);
  fill(wctx, '#ffca28', 4, 8, 3, 3);
  fill(wctx, '#ffca28', 7, 5, 3, 3);
  fill(wctx, '#ffca28', 9, 2, 4, 4);
  fill(wctx, '#000000', 10, 3, 2, 2);
  fill(wctx, '#fff9c4', 3, 10, 2, 1);
  SPRITES.wrench = w.canvas;

  const r = createOffscreen(12, 12);
  const rctx = r.ctx;
  rctx.fillStyle = '#00e676';
  rctx.beginPath();
  rctx.moveTo(6, 10);
  rctx.lineTo(1, 4);
  rctx.lineTo(4, 4);
  rctx.lineTo(4, 0);
  rctx.lineTo(8, 0);
  rctx.lineTo(8, 4);
  rctx.lineTo(11, 4);
  rctx.closePath();
  rctx.fill();
  SPRITES.rfArrow = r.canvas;
}
