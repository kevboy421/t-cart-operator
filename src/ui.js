// ui.js - DOM Overlay management for Title, Shift Summary, Shop, and Pause Menus

import { CONFIG } from './config.js';
import * as Audio from './audio.js';

export class UIManager {
  constructor(engine, callbacks) {
    this.engine = engine;
    this.callbacks = callbacks || {};

    this.previousScreenBeforeShop = 'title';

    this.cacheDomElements();
    this.bindEvents();
    this.updateSaveStatus();
  }

  cacheDomElements() {
    this.modalTitle = document.getElementById('modal-title');
    this.modalSummary = document.getElementById('modal-summary');
    this.modalShop = document.getElementById('modal-shop');
    this.modalPause = document.getElementById('modal-pause');

    this.btnStartGame = document.getElementById('btn-start-game');
    this.btnContinueGame = document.getElementById('btn-continue-game');
    this.btnOpenShopTitle = document.getElementById('btn-open-shop-title');
    this.btnResetSave = document.getElementById('btn-reset-save');
    this.saveStatusText = document.getElementById('save-status');

    this.summaryShiftTitle = document.getElementById('summary-shift-title');
    this.statBoxesShipped = document.getElementById('stat-boxes-shipped');
    this.statGrossRev = document.getElementById('stat-gross-rev');
    this.statJobBonuses = document.getElementById('stat-job-bonuses');
    this.statRushBonuses = document.getElementById('stat-rush-bonuses');
    this.statBalerBonuses = document.getElementById('stat-baler-bonuses');
    this.statDowntimePen = document.getElementById('stat-downtime-pen');
    this.statBacklogPen = document.getElementById('stat-backlog-pen');
    this.statNetEarnings = document.getElementById('stat-net-earnings');
    this.statTotalBank = document.getElementById('stat-total-bank');

    this.oeeGradeBadge = document.getElementById('oee-grade-badge');
    this.statOeeOverall = document.getElementById('stat-oee-overall');
    this.statOeeStatus = document.getElementById('stat-oee-status');
    this.statOeeAvail = document.getElementById('stat-oee-avail');
    this.barOeeAvail = document.getElementById('bar-oee-avail');
    this.statOeePerf = document.getElementById('stat-oee-perf');
    this.barOeePerf = document.getElementById('bar-oee-perf');
    this.statOeeQual = document.getElementById('stat-oee-qual');
    this.barOeeQual = document.getElementById('bar-oee-qual');
    this.oeeBonusBanner = document.getElementById('oee-bonus-banner');

    this.btnOpenShopSummary = document.getElementById('btn-open-shop-summary');
    this.btnNextShift = document.getElementById('btn-next-shift');

    this.shopCashVal = document.getElementById('shop-cash-val');
    this.shopCatalog = document.getElementById('shop-catalog');
    this.btnCloseShop = document.getElementById('btn-close-shop');

    this.btnResumeGame = document.getElementById('btn-resume-game');
    this.btnPauseShop = document.getElementById('btn-pause-shop');
    this.btnToggleSound = document.getElementById('btn-toggle-sound');
    this.btnQuitTitle = document.getElementById('btn-quit-title');

    this.quickMuteBtn = document.getElementById('quick-mute-btn');
    this.quickPauseBtn = document.getElementById('quick-pause-btn');
    this.touchControls = document.getElementById('touch-controls');
  }

  bindEvents() {
    // Title Start Button: Prompts confirmation if existing career progress exists
    this.btnStartGame.addEventListener('click', () => {
      Audio.initAudio();
      const data = this.engine.saveData;
      const hasProgress = data && (data.shiftNumber > 1 || data.cash > 0 || Object.values(data.upgrades || {}).some(v => v > 0));

      if (hasProgress) {
        if (!confirm('Start a fresh career at Shift 1? This will reset your current shift progress and upgrades.')) {
          return;
        }
        this.engine.resetSaveData();
      }

      this.hideAllModals();
      if (this.callbacks.onStartShift) {
        this.callbacks.onStartShift(1);
      }
    });

    // Continue existing career shift
    this.btnContinueGame.addEventListener('click', () => {
      Audio.initAudio();
      this.hideAllModals();
      const shiftToRun = this.engine.saveData ? (this.engine.saveData.shiftNumber || 1) : 1;
      if (this.callbacks.onStartShift) {
        this.callbacks.onStartShift(shiftToRun);
      }
    });

    this.btnOpenShopTitle.addEventListener('click', () => {
      Audio.initAudio();
      this.previousScreenBeforeShop = 'title';
      this.openShop();
    });

    this.btnResetSave.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all shift progress, cash, and upgrades?')) {
        this.engine.resetSaveData();
        this.updateSaveStatus();
      }
    });

    // Summary buttons
    this.btnOpenShopSummary.addEventListener('click', () => {
      this.previousScreenBeforeShop = 'summary';
      this.openShop();
    });

    this.btnNextShift.addEventListener('click', () => {
      this.hideAllModals();
      const nextShiftNum = this.engine.shiftNumber + 1;
      if (this.callbacks.onStartShift) {
        this.callbacks.onStartShift(nextShiftNum);
      }
    });

    // Shop close button: Refreshes total bank balance when returning to summary
    this.btnCloseShop.addEventListener('click', () => {
      this.modalShop.classList.remove('active');
      if (this.previousScreenBeforeShop === 'title') {
        this.modalTitle.classList.add('active');
        this.updateSaveStatus();
      } else if (this.previousScreenBeforeShop === 'summary') {
        this.modalSummary.classList.add('active');
        if (this.statTotalBank) {
          this.statTotalBank.textContent = `$${this.engine.cash.toFixed(2)}`;
        }
      } else if (this.previousScreenBeforeShop === 'pause') {
        this.modalPause.classList.add('active');
      }
    });

    // Pause menu buttons
    this.btnResumeGame.addEventListener('click', () => {
      this.engine.isPaused = false;
      this.modalPause.classList.remove('active');
    });

    this.btnPauseShop.addEventListener('click', () => {
      this.previousScreenBeforeShop = 'pause';
      this.openShop();
    });

    this.btnToggleSound.addEventListener('click', () => {
      this.handleToggleMute();
    });

    this.btnQuitTitle.addEventListener('click', () => {
      Audio.stopRailHum();
      this.engine.isShiftRunning = false;
      this.engine.isPaused = false;
      this.hideAllModals();
      this.modalTitle.classList.add('active');
      this.updateSaveStatus();
    });

    // Quick bar buttons
    this.quickMuteBtn.addEventListener('click', () => {
      this.handleToggleMute();
    });

    this.quickPauseBtn.addEventListener('click', () => {
      if (this.engine.isShiftRunning) {
        this.togglePause();
      }
    });
  }

  handleToggleMute() {
    Audio.initAudio();
    const muted = Audio.toggleMute();
    this.quickMuteBtn.textContent = muted ? '🔇' : '🔊';
    this.btnToggleSound.textContent = muted ? 'SOUND: MUTED [M]' : 'SOUND: ON [M]';
  }

  togglePause() {
    if (!this.engine.isShiftRunning) return;
    this.engine.isPaused = !this.engine.isPaused;
    if (this.engine.isPaused) {
      Audio.stopRailHum();
      this.modalPause.classList.add('active');
    } else {
      this.modalPause.classList.remove('active');
    }
  }

  hideAllModals() {
    this.modalTitle.classList.remove('active');
    this.modalSummary.classList.remove('active');
    this.modalShop.classList.remove('active');
    this.modalPause.classList.remove('active');
  }

  updateSaveStatus() {
    const data = this.engine.saveData;
    if (data && (data.shiftNumber > 1 || data.cash > 0 || Object.values(data.upgrades || {}).some(v => v > 0))) {
      this.saveStatusText.textContent = `Active Career: Ready for Shift ${data.shiftNumber} • Plant Capital: $${(data.cash || 0).toFixed(2)}`;
      this.btnContinueGame.style.display = 'inline-block';
      this.btnContinueGame.textContent = `CONTINUE SHIFT ${data.shiftNumber}`;
    } else {
      this.saveStatusText.textContent = 'Welcome Operator. Ready to start Shift 1.';
      this.btnContinueGame.style.display = 'none';
    }
  }

  showSummary(stats) {
    this.hideAllModals();
    this.modalSummary.classList.add('active');

    // Header reflects the shift just completed
    this.summaryShiftTitle.textContent = `SHIFT ${this.engine.shiftNumber} COMPLETED — 14:00 WHISTLE`;

    this.statBoxesShipped.textContent = Math.round(stats.boxesShipped).toLocaleString();
    this.statGrossRev.textContent = `+$${stats.grossRevenue.toFixed(2)}`;
    this.statJobBonuses.textContent = `+$${stats.jobBonuses.toFixed(2)}`;
    this.statRushBonuses.textContent = `+$${stats.rushBonuses.toFixed(2)}`;
    this.statBalerBonuses.textContent = `+$${stats.balerBonuses.toFixed(2)}`;

    this.statDowntimePen.textContent = `-$${stats.downtimePenalty.toFixed(2)}`;
    this.statBacklogPen.textContent = `-$${stats.backlogPenalty.toFixed(2)}`;

    this.statNetEarnings.textContent = `$${stats.netEarnings.toFixed(2)}`;
    this.statTotalBank.textContent = `$${this.engine.cash.toFixed(2)}`;

    const oee = stats.oee;
    this.oeeGradeBadge.textContent = oee.grade;
    this.oeeGradeBadge.className = `grade-badge grade-${oee.grade.toLowerCase()}`;

    const overallPct = Math.round(oee.overall * 100);
    this.statOeeOverall.textContent = `${overallPct}%`;

    const statusMsg = overallPct >= 90 ? 'WORLD CLASS PERFORMANCE' :
                      overallPct >= 80 ? 'EXCELLENT PLANT PRODUCTIVITY' :
                      overallPct >= 70 ? 'STANDARD INDUSTRIAL OUTPUT' :
                      overallPct >= 60 ? 'ACCEPTABLE RUN WITH BOTTLENECKS' : 'CRITICAL STARVATION & BACKLOG';
    this.statOeeStatus.textContent = statusMsg;

    const availPct = Math.round(oee.availability * 100);
    this.statOeeAvail.textContent = `${availPct}%`;
    this.barOeeAvail.style.width = `${availPct}%`;

    const perfPct = Math.round(oee.performance * 100);
    this.statOeePerf.textContent = `${perfPct}%`;
    this.barOeePerf.style.width = `${perfPct}%`;

    const qualPct = Math.round(oee.quality * 100);
    this.statOeeQual.textContent = `${qualPct}%`;
    this.barOeeQual.style.width = `${qualPct}%`;

    // Explicitly reset banner styles so missed shift never leaves it stuck orange
    if (oee.bonusAwarded > 0) {
      this.oeeBonusBanner.style.display = 'block';
      this.oeeBonusBanner.style.background = '#2b3d2b';
      this.oeeBonusBanner.style.borderColor = '#4caf50';
      this.oeeBonusBanner.style.color = '#d5ffd8';
      this.oeeBonusBanner.innerHTML = `🏆 OEE TARGET REACHED (≥80%): <strong>+$${oee.bonusAwarded} CASH BONUS AWARDED!</strong>`;
    } else {
      this.oeeBonusBanner.style.display = 'block';
      this.oeeBonusBanner.style.background = '#332619';
      this.oeeBonusBanner.style.borderColor = '#ff9800';
      this.oeeBonusBanner.style.color = '#ffe0b2';
      this.oeeBonusBanner.innerHTML = `⚠️ OEE TARGET MISSED (&lt;80%): <em>Reach 80% OEE for +$${CONFIG.OEE.BENCHMARK_BONUS} bonus.</em>`;
    }

    this.btnNextShift.textContent = `START SHIFT ${this.engine.shiftNumber + 1} ➔`;
  }

  openShop() {
    this.hideAllModals();
    this.modalShop.classList.add('active');
    this.refreshShopUI();
  }

  refreshShopUI() {
    this.shopCashVal.textContent = `$${this.engine.cash.toFixed(2)}`;
    this.shopCatalog.innerHTML = '';

    CONFIG.UPGRADES.forEach(u => {
      const currentLvl = this.engine.upgrades[u.id] || 0;
      const isMaxed = currentLvl >= u.maxLevel;
      const nextCost = !isMaxed ? u.costs[currentLvl] : null;
      const canAfford = !isMaxed && this.engine.cash >= nextCost;

      const itemCard = document.createElement('div');
      itemCard.className = `shop-item ${isMaxed ? 'maxed' : ''}`;

      itemCard.innerHTML = `
        <div>
          <div class="shop-item-top">
            <span class="shop-item-title">${u.name}</span>
            <span class="shop-item-level">${isMaxed ? 'MAX' : `LVL ${currentLvl}/${u.maxLevel}`}</span>
          </div>
          <p class="shop-item-desc">${u.desc}</p>
          <div class="shop-item-effect">${u.effectText(currentLvl)}</div>
        </div>
        <div class="shop-item-action">
          <span class="shop-item-cost">${isMaxed ? 'MAXED' : `$${nextCost}`}</span>
          <button class="retro-btn primary-btn shop-buy-btn" ${(!canAfford || isMaxed) ? 'disabled' : ''}>
            ${isMaxed ? 'OWNED' : 'BUY'}
          </button>
        </div>
      `;

      const buyBtn = itemCard.querySelector('.shop-buy-btn');
      if (buyBtn && !isMaxed) {
        buyBtn.addEventListener('click', () => {
          const success = this.engine.purchaseUpgrade(u.id);
          if (success) {
            this.refreshShopUI();
          }
        });
      }

      this.shopCatalog.appendChild(itemCard);
    });
  }
}
