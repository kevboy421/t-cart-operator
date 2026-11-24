// main.js - Bootstrapper, canvas scaling, input handling, and main game loop

import { CONFIG } from './config.js';
import { loadAllSprites } from './sprites.js';
import * as Audio from './audio.js';
import { SimulationEngine } from './engine.js';
import { FactoryRenderer } from './renderer.js';
import { UIManager } from './ui.js';

window.addEventListener('DOMContentLoaded', async () => {
  // 0. Register Progressive Web App (PWA) Service Worker safely on HTTP/HTTPS
  if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((reg) => {
        console.log('T-Cart Service Worker active, scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
  }

  // Global Audio Unlocker for iOS Safari and mobile browsers (one-time on first user gesture)
  const unlockAudio = () => {
    Audio.initAudio();
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true, once: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true, once: true });
  window.addEventListener('touchend', unlockAudio, { passive: true, once: true });
  window.addEventListener('keydown', unlockAudio, { passive: true, once: true });

  // 1. Initialize Canvas & Pixel Scaling
  const canvas = document.getElementById('game-canvas');

  function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const targetAspect = 16 / 9;

    const maxW = windowWidth * 0.98;
    const maxH = windowHeight * 0.98;

    let w = maxW;
    let h = w / targetAspect;

    if (h > maxH) {
      h = maxH;
      w = h * targetAspect;
    }

    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(h)}px`;
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // 2. Load Real Assets & Procedural Fallbacks Concurrently
  await loadAllSprites();

  // 3. Instantiate Engine, Renderer & UI Manager
  const engine = new SimulationEngine();
  const renderer = new FactoryRenderer(canvas);

  const ui = new UIManager(engine, {
    onStartShift: (shiftNum) => {
      engine.startShift(shiftNum);
    }
  });

  engine.onShiftComplete = (stats) => {
    ui.showSummary(stats);
  };

  // 4. Input State & Keyboard Listeners (with e.repeat suppression on discrete actions)
  const inputState = {
    left: false,
    right: false,
    fix: false
  };

  window.addEventListener('keydown', (e) => {
    Audio.initAudio();

    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Movement keys (allow holding)
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      inputState.left = true;
      return;
    }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      inputState.right = true;
      return;
    }
    if (e.code === 'KeyE') {
      inputState.fix = true;
      return;
    }

    // Discrete action keys: ignore auto-repeats from OS
    if (e.repeat) return;

    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        if (engine.isShiftRunning && !engine.isPaused) {
          engine.handleActionUp();
        }
        break;

      case 'ArrowDown':
      case 'KeyS':
        if (engine.isShiftRunning && !engine.isPaused) {
          engine.handleActionDown();
        }
        break;

      case 'Space':
        e.preventDefault();
        if (engine.isShiftRunning && !engine.isPaused) {
          engine.handleActionSpace();
        }
        break;

      case 'KeyQ':
        if (engine.isShiftRunning && !engine.isPaused) {
          engine.handleActionSwap();
        }
        break;

      case 'KeyP':
      case 'Escape':
        if (engine.isShiftRunning) {
          ui.togglePause();
        }
        break;

      case 'KeyM':
        ui.handleToggleMute();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        inputState.left = false;
        break;

      case 'ArrowRight':
      case 'KeyD':
        inputState.right = false;
        break;

      case 'KeyE':
        inputState.fix = false;
        break;
    }
  });

  // 5. Visibility Change: Silence Rail Hum & Auto-Pause on App Switch
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      Audio.stopRailHum();
      if (engine.isShiftRunning && !engine.isPaused) {
        ui.togglePause();
      }
    } else {
      Audio.initAudio();
    }
  });

  // 6. Tap-a-Bay Auto-Drive on Canvas
  canvas.addEventListener('pointerdown', (e) => {
    Audio.initAudio();
    if (!engine.isShiftRunning || engine.isPaused) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    if (clientX === null) return;

    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const gameX = normX * CONFIG.CANVAS_WIDTH;

    const nearest = engine.getNearestBay(gameX);
    if (nearest) {
      engine.cart.targetX = nearest.center;
    }
  });

  // 7. Orientation Warning Dismissal
  const btnRotateDismiss = document.getElementById('btn-rotate-dismiss');
  if (btnRotateDismiss) {
    btnRotateDismiss.addEventListener('click', () => {
      document.body.classList.add('dismiss-rotate');
    });
  }

  if (window.matchMedia) {
    window.matchMedia('(orientation: landscape)').addEventListener('change', (e) => {
      if (e.matches) {
        document.body.classList.remove('dismiss-rotate');
      }
    });
  }

  // 8. Mobile Touch Controls Binding & Top Bar Toggle
  const touchControls = document.getElementById('touch-controls');
  const quickTouchBtn = document.getElementById('quick-touch-btn');

  // Auto-enable touch controls on touch/coarse devices
  const isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
  if (isTouchDevice && touchControls) {
    touchControls.classList.add('visible');
  }

  if (quickTouchBtn && touchControls) {
    quickTouchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      touchControls.classList.toggle('visible');
    });
  }

  const touchRefs = setupTouchControls(engine, ui, inputState);

  // 9. Main requestAnimationFrame Game Loop
  let lastTime = performance.now();

  function gameLoop(currentTime) {
    const rawDt = currentTime ? (currentTime - lastTime) / 1000 : 0.016;
    lastTime = currentTime || performance.now();
    const clampedDt = (typeof rawDt === 'number' && !isNaN(rawDt) && rawDt > 0)
      ? Math.min(rawDt, 0.05)
      : 0.016;

    // Simulation update with clamped dt
    engine.update(clampedDt, inputState);

    // Dynamic Touch UI updates: Twin-Bed swap button & Jam fix wrench pulse
    if (touchRefs.btnSwap) {
      touchRefs.btnSwap.style.display = engine.cart.twinBed ? '' : 'none';
    }
    if (touchRefs.btnJam) {
      touchRefs.btnJam.classList.toggle('pulse-jam', engine.isAtJammedFlexo());
    }

    // Canvas render
    renderer.render(engine, clampedDt);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

  // Expose Debug Handle for verification & live inspection
  window.GAME_DEBUG = {
    engine,
    renderer,
    ui,
    Audio,
    CONFIG
  };
});

function setupTouchControls(engine, ui, inputState) {
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnFeed = document.getElementById('btn-feed');
  const btnStore = document.getElementById('btn-store');
  const btnPull = document.getElementById('btn-pull');
  const btnJam = document.getElementById('btn-jam');
  const btnSwap = document.getElementById('btn-swap');

  function bindContinuous(btn, keyProp) {
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      Audio.initAudio();
      inputState[keyProp] = true;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {}
    };
    const end = (e) => {
      e.preventDefault();
      inputState[keyProp] = false;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch (err) {}
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
  }

  bindContinuous(btnLeft, 'left');
  bindContinuous(btnRight, 'right');
  bindContinuous(btnJam, 'fix');

  if (btnFeed) {
    btnFeed.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Audio.initAudio();
      if (engine.isShiftRunning && !engine.isPaused) {
        engine.handleActionUp();
      }
    });
  }

  if (btnStore) {
    btnStore.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Audio.initAudio();
      if (engine.isShiftRunning && !engine.isPaused) {
        engine.handleActionDown();
      }
    });
  }

  if (btnPull) {
    btnPull.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Audio.initAudio();
      if (engine.isShiftRunning && !engine.isPaused) {
        engine.handleActionSpace();
      }
    });
  }

  if (btnSwap) {
    btnSwap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Audio.initAudio();
      if (engine.isShiftRunning && !engine.isPaused) {
        engine.handleActionSwap();
      }
    });
  }

  return { btnSwap, btnJam };
}
