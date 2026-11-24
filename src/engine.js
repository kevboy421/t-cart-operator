// engine.js - Demand-aware simulation engine, physics, PTC mechanics, and continuous OEE

import { CONFIG } from './config.js';
import * as Audio from './audio.js';

const STORAGE_KEY = 'tcart_operator_v1';

export class SimulationEngine {
  constructor() {
    this.resetAll();
  }

  resetAll() {
    this.saveData = this.loadSaveData() || this.getDefaultSaveData();

    this.shiftNumber = this.saveData.shiftNumber || 1;
    this.cash = Math.max(0, this.saveData.cash || 0);
    this.upgrades = Object.assign(this.getDefaultUpgrades(), this.saveData.upgrades || {});

    this.isShiftRunning = false;
    this.isPaused = false;
    this.shiftTimer = 0; // 0..180s
    this.clockTimeStr = '06:00';

    // T-Cart physics & cargo
    this.cart = {
      x: CONFIG.BAYS[0].center,
      vx: 0,
      ax: 0,
      activeBay: 0,
      isNearBay: true,
      dockedBay: 0,
      twinBed: false,
      activeBed: 0, // 0 = Bed A, 1 = Bed B
      stacks: [], // [stack0, stack1]
      transferAnim: null,
      jamFixTimer: 0,
      wrenchAudioTimer: 0,
      targetX: null // Tap-a-Bay target destination
    };

    // Corrugator Stacker (Bay 0)
    this.corrugator = {
      cycleTimer: 0,
      cycleDuration: CONFIG.CORRUGATOR.BASE_CYCLE_TIME,
      upperQueue: [],
      lowerQueue: [],
      upcomingLineup: [], // 3-stack dry-end lineup preview
      maxCapacity: CONFIG.CORRUGATOR.MAX_QUEUE_CAPACITY,
      isDualKnife: false,
      creepTimer: 0, // 5s amber creep speed buffer before penalties
      isCreepSpeed: false,
      isDryEndStop: false,
      pausedTimer: 0,
      totalProduced: 0
    };

    // Flexo lines 1-6 (Bays 1-6)
    this.flexos = [];
    this.initFlexos();

    // WIP Storage Lanes (Bays 1-6)
    this.wipLanes = [];
    this.initWipLanes();

    // Scrap Baler (Bay 7)
    this.baler = {
      ramAnim: 0,
      isCrushing: false
    };

    // Auto-Feeder AGV
    this.autoFeeder = {
      active: false,
      bayIndex: 1,
      targetBay: 1,
      progress: 0,
      status: 'idle',
      stack: null
    };

    this.activeEvent = null;
    this.eventSchedule = [];

    // Financial & OEE Tracking
    this.shiftStats = {
      boxesShipped: 0,
      totalBoxesProduced: 0,
      grossRevenue: 0,
      jobBonuses: 0,
      rushBonuses: 0,
      balerBonuses: 0,
      downtimePenalty: 0,
      backlogPenalty: 0,
      netEarnings: 0,

      totalLineActiveTime: 0,
      totalDowntime: 0,
      goodStacksFed: 0,
      scrapLosses: 0,
      theoreticalMaxBoxes: 0,

      oee: {
        availability: 1.0,
        performance: 1.0,
        quality: 1.0,
        overall: 1.0,
        grade: 'A',
        gradeColor: '#4caf50',
        bonusAwarded: 0
      }
    };

    this.popups = [];
    this.particles = [];

    this.applyUpgrades();
    this.refillLineup();
  }

  getDefaultSaveData() {
    return {
      version: 1,
      shiftNumber: 1,
      cash: 0,
      upgrades: this.getDefaultUpgrades(),
      careerBoxes: 0
    };
  }

  getDefaultUpgrades() {
    const ups = {};
    CONFIG.UPGRADES.forEach(u => {
      ups[u.id] = 0;
    });
    return ups;
  }

  loadSaveData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && data.version === 1) return data;
    } catch (e) {
      console.warn('Failed to load save data:', e);
    }
    return null;
  }

  persistSaveData(nextShiftNumber = null) {
    try {
      const savedShift = (this.saveData && this.saveData.shiftNumber) ? this.saveData.shiftNumber : this.shiftNumber;
      const targetShift = nextShiftNumber !== null ? nextShiftNumber : (this.isShiftRunning ? this.shiftNumber : savedShift);
      const data = {
        version: 1,
        shiftNumber: targetShift,
        cash: Math.round(this.cash * 100) / 100,
        upgrades: this.upgrades,
        careerBoxes: (this.saveData && typeof this.saveData.careerBoxes === 'number') ? this.saveData.careerBoxes : 0
      };
      this.saveData = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to persist save data:', e);
    }
  }

  resetSaveData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    this.resetAll();
  }

  applyUpgrades() {
    // 1. Cart Speed & Accel
    const speedLvl = this.upgrades.cart_speed || 0;
    this.cart.maxSpeed = CONFIG.CART.BASE_SPEED * (1 + speedLvl * 0.25);
    this.cart.accel = CONFIG.CART.BASE_ACCEL * (1 + speedLvl * 0.25);

    // 2. Transfer Deck Slide Speed
    const deckLvl = this.upgrades.roller_deck || 0;
    this.cart.transferTime = Math.max(0.12, CONFIG.CART.BASE_TRANSFER_TIME * (1 - deckLvl * 0.18));

    // 3. Twin-Bed T-Cart
    this.cart.twinBed = (this.upgrades.twin_bed || 0) > 0;

    // 4. Flexo Line Unlocks (0 = 2 unlocked, 1 = 3, 2 = 4, 3 = 5, 4 = 6)
    const flexoLvl = this.upgrades.unlock_flexo || 0;
    const unlockedFlexos = Math.min(6, 2 + flexoLvl);
    this.flexos.forEach((f, idx) => {
      f.isUnlocked = idx < unlockedFlexos;
    });

    // 5. WIP Roller Lanes (Lanes 1 & 2 start unlocked on Shift 1! Lvl 1 = 3, Lvl 2 = 4, Lvl 3 = 5, Lvl 4 = 6)
    const wipLanesLvl = this.upgrades.wip_lanes || 0;
    const unlockedLanes = Math.min(6, CONFIG.WIP.BASE_UNLOCKED_LANES + wipLanesLvl);
    this.wipLanes.forEach((l, idx) => {
      l.isUnlocked = idx < unlockedLanes;
    });

    // 6. WIP Lane Capacity (0 = 1 stack, 1 = 2 stacks, 2 = 3 stacks)
    const wipCapLvl = this.upgrades.wip_capacity || 0;
    const laneCap = Math.min(3, CONFIG.WIP.BASE_CAPACITY + wipCapLvl);
    this.wipLanes.forEach(l => {
      l.capacity = laneCap;
    });

    // 7. Hopper Capacity (+25% per level)
    const hopperLvl = this.upgrades.hopper_capacity || 0;
    const hopperCap = CONFIG.FLEXO.BASE_HOPPER_CAPACITY + hopperLvl * CONFIG.FLEXO.HOPPER_CAP_PER_LEVEL;
    this.flexos.forEach(f => {
      f.maxHopper = hopperCap;
    });

    // 8. RF Scanner
    this.hasRfScanner = (this.upgrades.rf_scanner || 0) > 0;

    // 9. WIP Auto-Feeder AGV
    const autoFeederLvl = this.upgrades.auto_feeder || 0;
    this.autoFeeder.unlocked = autoFeederLvl > 0;
    this.autoFeeder.maxBay = autoFeederLvl === 1 ? 2 : autoFeederLvl === 2 ? 4 : autoFeederLvl === 3 ? 6 : 0;
    this.autoFeeder.transferSpeed = CONFIG.AUTO_FEEDER.BASE_TRANSFER_TIME / Math.pow(CONFIG.AUTO_FEEDER.SPEED_MULTIPLIER_PER_LEVEL, autoFeederLvl - 1 || 0);

    // 10. Quick-Lock Plates (-20% changeover time per level)
    const platesLvl = this.upgrades.quick_plates || 0;
    this.changeoverDuration = Math.max(2.5, CONFIG.FLEXO.CHANGEOVER_TIME_BASE * (1 - platesLvl * 0.20));

    // Dynamic Corrugator Pacing:
    // Scale corrugator output to 120-130% of active flexo demand
    const shiftScale = Math.pow(CONFIG.CORRUGATOR.CYCLE_SCALE_PER_SHIFT, this.shiftNumber - 1);
    const lineScale = 1 + (unlockedFlexos - 2) * 0.45;
    this.corrugator.cycleDuration = Math.max(CONFIG.CORRUGATOR.MIN_CYCLE_TIME, (CONFIG.CORRUGATOR.BASE_CYCLE_TIME * shiftScale) / lineScale);

    // Dual-Knife automatically unlocks at Shift 4 OR when 4+ Flexos unlocked
    this.corrugator.isDualKnife = this.shiftNumber >= CONFIG.CORRUGATOR.DUAL_KNIFE_UNLOCK_SHIFT || unlockedFlexos >= 4;
    this.corrugator.maxCapacity = this.corrugator.isDualKnife
      ? CONFIG.CORRUGATOR.MAX_QUEUE_CAPACITY_DUAL
      : CONFIG.CORRUGATOR.MAX_QUEUE_CAPACITY;
  }

  initFlexos() {
    this.flexos = [];
    for (let i = 0; i < 6; i++) {
      const bay = CONFIG.BAYS[i + 1];
      const initialGrade = this.getRandomUnlockedGrade();
      const nextGrade = this.getRandomNextGrade(initialGrade);
      const orderStacks = Math.floor(Math.random() * (initialGrade.orderStacksMax - initialGrade.orderStacksMin + 1)) + initialGrade.orderStacksMin;

      this.flexos.push({
        id: i + 1,
        bayId: bay.id,
        xMin: bay.xMin,
        xMax: bay.xMax,
        center: bay.center,
        isUnlocked: i < 2,
        state: 'RUNNING',
        requiredGrade: initialGrade,
        nextGrade: nextGrade,
        hopperSheets: initialGrade.stackSheets * 2, // start with 2 stacks
        maxHopper: CONFIG.FLEXO.BASE_HOPPER_CAPACITY,
        orderTotalStacks: orderStacks,
        boxesFedInJob: 0,
        boxesShippedInPallet: 0,
        palletSlideAnim: 0, // 0..1 for shipping pallet slide out
        changeoverTimer: 0,
        graceTimer: 0,
        isRush: false,
        rushTimer: 0,
        jammed: false,
        smokeTimer: 0,
        activeTime: 0,
        starvedTime: 0
      });
    }
  }

  initWipLanes() {
    this.wipLanes = [];
    for (let i = 0; i < 6; i++) {
      const bay = CONFIG.BAYS[i + 1];
      this.wipLanes.push({
        id: i + 1,
        bayId: bay.id,
        center: bay.center,
        isUnlocked: i < CONFIG.WIP.BASE_UNLOCKED_LANES, // Bays 1 & 2 start unlocked!
        capacity: CONFIG.WIP.BASE_CAPACITY,
        stacks: []
      });
    }
  }

  getRandomUnlockedGrade() {
    const grades = CONFIG.BOARD_GRADES;
    const candidates = Object.keys(grades)
      .map(k => grades[k])
      .filter(g => g.minShift <= this.shiftNumber);
    return candidates[Math.floor(Math.random() * candidates.length)] || grades.K;
  }

  getRandomNextGrade(currentGrade) {
    const allUnlocked = Object.keys(CONFIG.BOARD_GRADES)
      .map(k => CONFIG.BOARD_GRADES[k])
      .filter(g => g.minShift <= this.shiftNumber);
    if (allUnlocked.length <= 1) return allUnlocked[0] || CONFIG.BOARD_GRADES.K;

    const others = allUnlocked.filter(g => g.code !== currentGrade.code);
    return others[Math.floor(Math.random() * others.length)] || allUnlocked[0];
  }

  // Refill the 3-stack dry-end lineup preview
  refillLineup() {
    while (this.corrugator.upcomingLineup.length < 3) {
      this.corrugator.upcomingLineup.push(this.decideNextCorrugatorStack());
    }
  }

  // Demand-Aware Corrugator Director
  decideNextCorrugatorStack() {
    // 1. Warped Board check
    const warpedChance = (this.activeEvent && this.activeEvent.type === 'WARPED_RUN')
      ? CONFIG.CORRUGATOR.WARPED_CHANCE_EVENT
      : CONFIG.CORRUGATOR.WARPED_CHANCE_BASE;

    if (Math.random() < warpedChance) {
      const g = this.getRandomUnlockedGrade();
      return { grade: g, isWarped: true, sheets: g.stackSheets, createdAt: this.shiftTimer };
    }

    // 2. Calculate net unmet demand per grade across all unlocked Flexos
    // Unmet demand = remaining order sheets - (sheets already in queue + cart + WIP + in-flight)
    const floorCounts = { K: 0, D: 0, W: 0, X: 0 };

    // In stacker queues
    this.corrugator.upperQueue.forEach(s => { if (!s.isWarped) floorCounts[s.grade.code] = (floorCounts[s.grade.code] || 0) + s.sheets; });
    this.corrugator.lowerQueue.forEach(s => { if (!s.isWarped) floorCounts[s.grade.code] = (floorCounts[s.grade.code] || 0) + s.sheets; });
    // In lineup preview
    this.corrugator.upcomingLineup.forEach(s => { if (!s.isWarped) floorCounts[s.grade.code] = (floorCounts[s.grade.code] || 0) + s.sheets; });
    // On cart
    this.cart.stacks.forEach(s => { if (!s.isWarped) floorCounts[s.grade.code] = (floorCounts[s.grade.code] || 0) + s.sheets; });
    // In WIP lanes
    this.wipLanes.forEach(lane => {
      lane.stacks.forEach(s => { if (!s.isWarped) floorCounts[s.grade.code] = (floorCounts[s.grade.code] || 0) + s.sheets; });
    });
    // In transfer anim
    if (this.cart.transferAnim && this.cart.transferAnim.stack && !this.cart.transferAnim.stack.isWarped) {
      const code = this.cart.transferAnim.stack.grade.code;
      floorCounts[code] = (floorCounts[code] || 0) + this.cart.transferAnim.stack.sheets;
    }

    // Calculate active order needs and hopper fill ratios
    const activeDemands = [];
    this.flexos.forEach(f => {
      if (!f.isUnlocked) return;
      const totalJobSheets = f.orderTotalStacks * f.requiredGrade.stackSheets;
      const remainingNeeded = Math.max(0, totalJobSheets - f.boxesFedInJob - f.hopperSheets);
      const floorStock = floorCounts[f.requiredGrade.code] || 0;
      const netUnmet = remainingNeeded - floorStock;
      const fillRatio = f.hopperSheets / (f.maxHopper * f.requiredGrade.stackSheets);

      activeDemands.push({
        flexo: f,
        grade: f.requiredGrade,
        netUnmet: netUnmet,
        fillRatio: fillRatio
      });
    });

    // Priority 1: Any active Flexo with net unmet demand > 0
    const unmet = activeDemands.filter(d => d.netUnmet > 0);
    if (unmet.length > 0) {
      unmet.sort((a, b) => a.fillRatio - b.fillRatio); // lowest hopper first
      const chosen = unmet[0].grade;
      return { grade: chosen, isWarped: false, sheets: chosen.stackSheets, createdAt: this.shiftTimer };
    }

    // Priority 2: All active orders covered -> Produce for upcoming NEXT order (WIP staging)
    const nextCandidates = this.flexos
      .filter(f => f.isUnlocked && f.nextGrade)
      .map(f => f.nextGrade);

    if (nextCandidates.length > 0) {
      const chosen = nextCandidates[Math.floor(Math.random() * nextCandidates.length)];
      return { grade: chosen, isWarped: false, sheets: chosen.stackSheets, createdAt: this.shiftTimer };
    }

    const fallback = this.getRandomUnlockedGrade();
    return { grade: fallback, isWarped: false, sheets: fallback.stackSheets, createdAt: this.shiftTimer };
  }

  startShift(shiftNum = this.shiftNumber) {
    this.shiftNumber = shiftNum;
    this.applyUpgrades();
    this.isShiftRunning = true;
    this.isPaused = false;
    this.shiftTimer = 0;
    this.clockTimeStr = '06:00';

    // Clear cart & animations
    this.cart.transferAnim = null;
    this.cart.jamFixTimer = 0;
    this.cart.wrenchAudioTimer = 0;
    this.cart.vx = 0;
    this.cart.ax = 0;
    this.cart.targetX = null;
    this.cart.x = CONFIG.BAYS[0].center;

    // Reset corrugator queues & creep timer
    this.corrugator.upperQueue = [];
    this.corrugator.lowerQueue = [];
    this.corrugator.upcomingLineup = [];
    this.corrugator.cycleTimer = 0;
    this.corrugator.creepTimer = 0;
    this.corrugator.isCreepSpeed = false;
    this.corrugator.isDryEndStop = false;
    this.refillLineup();

    // Re-initialize active flexos with 2 stacks, fresh nextGrade, and clear jams
    this.flexos.forEach(f => {
      if (f.isUnlocked) {
        f.requiredGrade = this.getRandomUnlockedGrade();
        f.nextGrade = this.getRandomNextGrade(f.requiredGrade);
        f.hopperSheets = f.requiredGrade.stackSheets * 2;
        f.orderTotalStacks = Math.floor(Math.random() * (f.requiredGrade.orderStacksMax - f.requiredGrade.orderStacksMin + 1)) + f.requiredGrade.orderStacksMin;
        f.boxesFedInJob = 0;
        f.boxesShippedInPallet = 0;
        f.palletSlideAnim = 0;
        f.state = 'RUNNING';
        f.jammed = false;
        f.isRush = false;
        f.rushTimer = 0;
        f.changeoverTimer = 0;
        f.graceTimer = 0;
        f.starvedTime = 0;
        f.activeTime = 0;
      }
    });

    // Reset shift performance stats
    this.shiftStats = {
      boxesShipped: 0,
      totalBoxesProduced: 0,
      grossRevenue: 0,
      jobBonuses: 0,
      rushBonuses: 0,
      balerBonuses: 0,
      downtimePenalty: 0,
      backlogPenalty: 0,
      netEarnings: 0,
      totalLineActiveTime: 0,
      totalDowntime: 0,
      goodStacksFed: 0,
      scrapLosses: 0,
      theoreticalMaxBoxes: 0,
      oee: {
        availability: 1.0,
        performance: 1.0,
        quality: 1.0,
        overall: 1.0,
        grade: 'A',
        gradeColor: '#4caf50',
        bonusAwarded: 0
      }
    };

    this.scheduleShiftEvents();
    Audio.initAudio();
    Audio.playShiftHorn();
    this.addPopup('SHIFT ' + this.shiftNumber + ' STARTED!', 320, 180, '#f0c419', 2.0);
  }

  scheduleShiftEvents() {
    this.eventSchedule = [];
    this.activeEvent = null;
    const numEvents = Math.floor(Math.random() * (CONFIG.EVENTS.MAX_EVENTS_PER_SHIFT - CONFIG.EVENTS.MIN_EVENTS_PER_SHIFT + 1)) + CONFIG.EVENTS.MIN_EVENTS_PER_SHIFT;
    const eventTypes = ['FLEXO_JAM', 'RUSH_ORDER', 'WARPED_RUN', 'KNIFE_CHANGE', 'FATIGUE'];
    const minSpacing = 28;
    const firstTrigger = 20;
    const lastTrigger = CONFIG.SHIFT_DURATION - 25;

    let currentTime = firstTrigger;
    for (let i = 0; i < numEvents; i++) {
      const windowEnd = firstTrigger + ((lastTrigger - firstTrigger) / numEvents) * (i + 1);
      const triggerTime = currentTime + Math.random() * Math.max(5, (windowEnd - currentTime));
      const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      this.eventSchedule.push({
        triggerTime: Math.min(lastTrigger, triggerTime),
        type: type,
        fired: false
      });
      currentTime = triggerTime + minSpacing;
    }
  }

  update(rawDt, inputState) {
    if (!this.isShiftRunning || this.isPaused) return;

    const dt = Math.min(rawDt, 0.05);

    this.updateClock(dt);
    this.updateCartPhysics(dt, inputState);
    this.updateCorrugator(dt);
    this.updateFlexos(dt);
    this.updateAutoFeeder(dt);
    this.updateBaler(dt);
    this.updateRandomEvents(dt);
    this.updatePopupsAndParticles(dt);

    const speedRatio = Math.abs(this.cart.vx) / (this.cart.maxSpeed || 200);
    Audio.updateRailHum(speedRatio);

    if (this.shiftTimer >= CONFIG.SHIFT_DURATION) {
      this.completeShift();
    }
  }

  updateClock(dt) {
    this.shiftTimer += dt;
    const progress = Math.min(1.0, this.shiftTimer / CONFIG.SHIFT_DURATION);
    const totalHours = CONFIG.START_CLOCK_HOURS + progress * (CONFIG.END_CLOCK_HOURS - CONFIG.START_CLOCK_HOURS);
    const hours = Math.floor(totalHours);
    const minutes = Math.floor((totalHours - hours) * 60);
    this.clockTimeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  updateCartPhysics(dt, input) {
    if (this.cart.transferAnim) {
      this.cart.vx = 0;
      this.updateTransferAnim(dt);
      return;
    }

    if (input.left || input.right) {
      this.cart.targetX = null;
    }

    let moveDir = 0;
    if (input.left) moveDir -= 1;
    if (input.right) moveDir += 1;

    let speedMod = 1.0;
    if (this.activeEvent && this.activeEvent.type === 'FATIGUE') {
      speedMod = 0.85;
    }

    if (moveDir !== 0) {
      this.cart.vx += moveDir * this.cart.accel * dt;
      const maxSpd = this.cart.maxSpeed * speedMod;
      this.cart.vx = Math.max(-maxSpd, Math.min(maxSpd, this.cart.vx));
    } else if (this.cart.targetX !== null) {
      // Tap-a-Bay Auto-Drive: smoothly drive toward targetX
      const diff = this.cart.targetX - this.cart.x;
      if (Math.abs(diff) <= 2) {
        this.cart.x = this.cart.targetX;
        this.cart.vx = 0;
        this.cart.targetX = null;
      } else {
        const autoDir = Math.sign(diff);
        const maxSpd = this.cart.maxSpeed * speedMod;
        const decelDist = (this.cart.vx * this.cart.vx) / (2 * Math.max(100, CONFIG.CART.FRICTION));
        if (Math.abs(diff) <= Math.max(12, decelDist) && Math.sign(this.cart.vx) === autoDir) {
          const sign = Math.sign(this.cart.vx);
          this.cart.vx -= sign * CONFIG.CART.FRICTION * dt;
          if (Math.sign(this.cart.vx) !== sign) this.cart.vx = autoDir * 15;
        } else {
          this.cart.vx += autoDir * this.cart.accel * dt;
          this.cart.vx = Math.max(-maxSpd, Math.min(maxSpd, this.cart.vx));
        }
      }
    } else {
      if (Math.abs(this.cart.vx) > 5) {
        const sign = Math.sign(this.cart.vx);
        this.cart.vx -= sign * CONFIG.CART.FRICTION * dt;
        if (Math.sign(this.cart.vx) !== sign) {
          this.cart.vx = 0;
        }
      } else {
        this.cart.vx = 0;
      }

      // Magnetic Bay Snapping
      const nearestBay = this.getNearestBay(this.cart.x);
      if (nearestBay) {
        const dist = nearestBay.center - this.cart.x;
        if (Math.abs(dist) <= CONFIG.MAGNETIC_SNAP_DISTANCE && Math.abs(dist) > 0.4) {
          const snapStep = Math.sign(dist) * Math.min(Math.abs(dist), 180 * dt);
          this.cart.x += snapStep;
        }
      }
    }

    this.cart.x += this.cart.vx * dt;
    const minX = CONFIG.BAYS[0].center - 6;
    const maxX = CONFIG.BAYS[7].center + 6;
    this.cart.x = Math.max(minX, Math.min(maxX, this.cart.x));

    const nearest = this.getNearestBay(this.cart.x);
    if (nearest) {
      this.cart.activeBay = nearest.id;
      this.cart.isNearBay = Math.abs(this.cart.x - nearest.center) <= CONFIG.MAGNETIC_SNAP_DISTANCE;
      this.cart.dockedBay = Math.abs(this.cart.x - nearest.center) <= 4 ? nearest.id : -1;
    }

    this.updateJamFixing(dt, input);
  }

  getNearestBay(x) {
    let nearest = CONFIG.BAYS[0];
    let minDist = 99999;
    for (let i = 0; i < CONFIG.BAYS.length; i++) {
      const b = CONFIG.BAYS[i];
      const dist = Math.abs(x - b.center);
      if (dist < minDist) {
        minDist = dist;
        nearest = b;
      }
    }
    return nearest;
  }

  isAtJammedFlexo() {
    if (this.cart.activeBay >= 1 && this.cart.activeBay <= 6) {
      const flexo = this.flexos[this.cart.activeBay - 1];
      return !!(flexo && flexo.isUnlocked && flexo.state === 'JAMMED' && this.cart.isNearBay);
    }
    return false;
  }

  // Jam fix mechanic with throttled wrench audio (0.15s)
  updateJamFixing(dt, input) {
    if (this.cart.activeBay >= 1 && this.cart.activeBay <= 6) {
      const flexo = this.flexos[this.cart.activeBay - 1];
      if (flexo && flexo.isUnlocked && flexo.state === 'JAMMED') {
        if (input.fix) {
          this.cart.jamFixTimer += dt;
          this.cart.wrenchAudioTimer += dt;

          if (this.cart.wrenchAudioTimer >= CONFIG.CART.JAM_AUDIO_THROTTLE) {
            this.cart.wrenchAudioTimer = 0;
            Audio.playWrenchTick();
          }

          if (Math.random() < 0.3) {
            this.addParticle(flexo.center + (Math.random() * 20 - 10), 120, '#ffca28', 1.5, 0.3);
          }

          if (this.cart.jamFixTimer >= CONFIG.CART.JAM_FIX_HOLD_TIME) {
            flexo.state = flexo.hopperSheets > 0 ? 'RUNNING' : 'STARVED';
            flexo.jammed = false;
            this.cart.jamFixTimer = 0;
            this.cart.wrenchAudioTimer = 0;

            // Clear active event if it was a jam
            if (this.activeEvent && this.activeEvent.type === 'FLEXO_JAM') {
              this.activeEvent = null;
            }

            this.addPopup('JAM CLEARED! 🔧', flexo.center, 120, '#66bb6a', 1.4);
            Audio.playHydraulicHiss();
          }
          return;
        }
      }
    }
    this.cart.jamFixTimer = 0;
    this.cart.wrenchAudioTimer = 0;
  }

  updateTransferAnim(dt) {
    const anim = this.cart.transferAnim;
    if (!anim) return;

    anim.progress += dt / this.cart.transferTime;
    if (anim.progress >= 1.0) {
      anim.progress = 1.0;
      if (anim.onComplete) {
        anim.onComplete();
      }
      this.cart.transferAnim = null;
    }
  }

  // Corrugator Stacker with 5-Second CREEP SPEED buffer
  updateCorrugator(dt) {
    if (this.corrugator.pausedTimer > 0) {
      this.corrugator.pausedTimer -= dt;
      return;
    }

    const totalQueueCount = this.corrugator.upperQueue.length + this.corrugator.lowerQueue.length;
    const isFull = totalQueueCount >= this.corrugator.maxCapacity;

    if (isFull) {
      this.corrugator.creepTimer += dt;
      if (this.corrugator.creepTimer <= CONFIG.CORRUGATOR.CREEP_SPEED_BUFFER) {
        // AMBER CREEP SPEED: Zero penalty, visual warning
        this.corrugator.isCreepSpeed = true;
        this.corrugator.isDryEndStop = false;
      } else {
        // RED DRY-END STOP: Penalties begin after 5.0s
        this.corrugator.isCreepSpeed = false;
        this.corrugator.isDryEndStop = true;
        const pen = CONFIG.CORRUGATOR.BACKLOG_PENALTY_PER_SEC * dt;
        this.shiftStats.backlogPenalty += pen;
        this.shiftStats.scrapLosses += 0.2 * dt;
        this.cash = Math.max(0, this.cash - pen);

        if (Math.random() < 0.05) {
          this.addPopup('-$' + pen.toFixed(0) + ' BACKLOG!', 56, 120, '#ef5350', 0.8);
        }
      }
      return; // output halted while full
    } else {
      // Pulling even 1 stack immediately resets creep timer!
      this.corrugator.creepTimer = 0;
      this.corrugator.isCreepSpeed = false;
      this.corrugator.isDryEndStop = false;
    }

    this.corrugator.cycleTimer += dt;
    if (this.corrugator.cycleTimer >= this.corrugator.cycleDuration) {
      this.corrugator.cycleTimer = 0;
      this.produceCorrugatorStack();
    }
  }

  produceCorrugatorStack() {
    this.refillLineup();
    const nextStack = this.corrugator.upcomingLineup.shift();
    this.refillLineup();

    // Route to Upper or Lower Stacker in Dual-Knife mode
    if (this.corrugator.isDualKnife && this.corrugator.upperQueue.length > this.corrugator.lowerQueue.length) {
      this.corrugator.lowerQueue.push(nextStack);
    } else {
      this.corrugator.upperQueue.push(nextStack);
    }

    this.corrugator.totalProduced++;
    Audio.playRollerTransfer();
  }

  // Flexo Lifecycle & Continuous Production
  updateFlexos(dt) {
    this.flexos.forEach(f => {
      if (!f.isUnlocked) return;

      f.activeTime += dt;
      this.shiftStats.totalLineActiveTime += dt;

      // Pallet sliding animation countdown
      if (f.palletSlideAnim > 0) {
        f.palletSlideAnim += dt * 1.5;
        if (f.palletSlideAnim >= 1.0) f.palletSlideAnim = 0;
      }

      if (f.isRush) {
        f.rushTimer -= dt;
        if (f.rushTimer <= 0) f.isRush = false;
      }

      // 1. CHANGEOVER State
      if (f.state === 'CHANGEOVER') {
        f.changeoverTimer -= dt;
        if (f.changeoverTimer <= 0) {
          f.state = f.hopperSheets > 0 ? 'RUNNING' : 'STARVED';
          f.graceTimer = CONFIG.FLEXO.CHANGEOVER_GRACE_TIME;
          this.addPopup('SETUP COMPLETE: ' + f.requiredGrade.code, f.center, 90, '#29b6f6', 1.5);
          Audio.playHydraulicHiss();
        }
        return; // do not increment theoreticalMaxBoxes or produce during changeover
      }

      // Increment theoretical max only when NOT in changeover
      const drainRate = CONFIG.FLEXO.BOXES_PER_SEC_BASE * (1 + (this.shiftNumber - 1) * 0.04);
      this.shiftStats.theoreticalMaxBoxes += drainRate * dt;

      // 2. JAMMED State (Counts toward downtime & hurts OEE!)
      if (f.state === 'JAMMED') {
        f.starvedTime += dt;
        this.shiftStats.totalDowntime += dt;
        f.smokeTimer += dt;
        if (f.smokeTimer >= 0.15) {
          f.smokeTimer = 0;
          this.addParticle(f.center + (Math.random() * 16 - 8), 110, '#9e9e9e', 2.0, 0.4);
        }
        return;
      }

      if (f.graceTimer > 0) {
        f.graceTimer -= dt;
      }

      // 3. STARVED State (Hopper = 0)
      if (f.hopperSheets <= 0) {
        f.state = 'STARVED';
        if (f.graceTimer <= 0) {
          f.starvedTime += dt;
          this.shiftStats.totalDowntime += dt;
          const pen = CONFIG.FLEXO.STARVED_PENALTY_PER_SEC * dt;
          this.shiftStats.downtimePenalty += pen;
          this.cash = Math.max(0, this.cash - pen);

          if (Math.random() < 0.04) {
            this.addPopup('-$' + pen.toFixed(0) + ' DOWNTIME', f.center, 120, '#ef5350', 0.8);
          }
        }
        return;
      }

      // 4. RUNNING / LOW HOPPER
      const hopperCapacitySheets = f.maxHopper * f.requiredGrade.stackSheets;
      const fillRatio = f.hopperSheets / hopperCapacitySheets;
      const previousState = f.state;
      f.state = fillRatio < CONFIG.FLEXO.LOW_HOPPER_THRESHOLD ? 'LOW_HOPPER' : 'RUNNING';

      // Play low hopper beep once on transition
      if (previousState === 'RUNNING' && f.state === 'LOW_HOPPER') {
        Audio.playLowHopperBeep();
      }

      // Drain sheets smoothly into boxes
      const boxesToFeed = drainRate * dt;
      f.hopperSheets -= boxesToFeed;
      f.boxesFedInJob += boxesToFeed;
      f.boxesShippedInPallet += boxesToFeed;
      this.shiftStats.totalBoxesProduced += boxesToFeed; // Continuous OEE performance tracking!

      // Pallet completed (200 boxes ship!)
      if (f.boxesShippedInPallet >= CONFIG.FLEXO.BOXES_PER_PALLET) {
        f.boxesShippedInPallet -= CONFIG.FLEXO.BOXES_PER_PALLET;
        f.palletSlideAnim = 0.01;
        this.shipPallet(f);
      }

      // Job order completed -> Promote NEXT grade and start changeover
      const totalJobSheets = f.orderTotalStacks * f.requiredGrade.stackSheets;
      if (f.boxesFedInJob >= totalJobSheets) {
        this.completeFlexoOrder(f);
      }
    });
  }

  shipPallet(flexo) {
    this.shiftStats.boxesShipped += CONFIG.FLEXO.BOXES_PER_PALLET;
    const baseRev = CONFIG.FLEXO.BOXES_PER_PALLET * flexo.requiredGrade.boxValue;
    const rushMultiplier = flexo.isRush ? 2 : 1;
    const totalRev = baseRev * rushMultiplier;

    this.shiftStats.grossRevenue += totalRev;
    if (flexo.isRush) {
      this.shiftStats.rushBonuses += (totalRev - baseRev);
    }
    this.cash += totalRev;

    Audio.playCashChime();
    this.addPopup(`+$${totalRev.toFixed(0)} SHIP!`, flexo.center, 50, '#ffd54f', 1.2);
  }

  // Job Order Completed -> Clean Changeover
  completeFlexoOrder(flexo) {
    const bonus = flexo.requiredGrade.completionBonus * (flexo.isRush ? 2 : 1);
    this.shiftStats.jobBonuses += bonus;
    this.cash += bonus;

    this.addPopup(`JOB DONE! +$${bonus}`, flexo.center, 70, '#66bb6a', 1.6);
    Audio.playCashChime();

    // Clean hopper out on changeover
    flexo.hopperSheets = 0;
    flexo.boxesFedInJob = 0;
    flexo.state = 'CHANGEOVER';
    flexo.changeoverTimer = this.changeoverDuration;

    // Promote NEXT grade to CURRENT required grade
    flexo.requiredGrade = flexo.nextGrade || this.getRandomUnlockedGrade();
    // Roll fresh NEXT grade
    flexo.nextGrade = this.getRandomNextGrade(flexo.requiredGrade);
    flexo.orderTotalStacks = Math.floor(Math.random() * (flexo.requiredGrade.orderStacksMax - flexo.requiredGrade.orderStacksMin + 1)) + flexo.requiredGrade.orderStacksMin;
  }

  // Auto-Feeder AGV Shuttle
  updateAutoFeeder(dt) {
    if (!this.autoFeeder.unlocked) return;

    if (this.autoFeeder.status === 'idle') {
      for (let b = 1; b <= this.autoFeeder.maxBay; b++) {
        const flexo = this.flexos[b - 1];
        const wip = this.wipLanes[b - 1];
        // Skip if flexo is in changeover or jammed
        if (flexo && flexo.isUnlocked && flexo.state !== 'CHANGEOVER' && flexo.state !== 'JAMMED' && wip && wip.isUnlocked && wip.stacks.length > 0) {
          const hopperCapacitySheets = flexo.maxHopper * flexo.requiredGrade.stackSheets;
          const totalJobSheets = flexo.orderTotalStacks * flexo.requiredGrade.stackSheets;
          const orderSheetsRemaining = Math.max(0, totalJobSheets - flexo.boxesFedInJob);

          // Skip if hopper already covers remaining job needs
          if (flexo.hopperSheets >= orderSheetsRemaining) continue;

          if (flexo.hopperSheets < hopperCapacitySheets * CONFIG.AUTO_FEEDER.TRIGGER_THRESHOLD) {
            const candidate = wip.stacks[0];
            if (candidate && !candidate.isWarped && candidate.grade.code === flexo.requiredGrade.code) {
              this.autoFeeder.status = 'transferring';
              this.autoFeeder.bayIndex = b;
              this.autoFeeder.progress = 0;
              this.autoFeeder.stack = wip.stacks.shift();
              Audio.playRollerTransfer();
              break;
            }
          }
        }
      }
    } else if (this.autoFeeder.status === 'transferring') {
      this.autoFeeder.progress += dt / this.autoFeeder.transferSpeed;
      if (this.autoFeeder.progress >= 1.0) {
        const flexo = this.flexos[this.autoFeeder.bayIndex - 1];
        if (flexo && this.autoFeeder.stack) {
          flexo.hopperSheets += this.autoFeeder.stack.sheets;
          this.shiftStats.goodStacksFed++;
          this.addPopup('AUTO-FED!', flexo.center, 150, '#29b6f6', 1.0);
          Audio.playHydraulicHiss();
        }
        this.autoFeeder.stack = null;
        this.autoFeeder.status = 'idle';
      }
    }
  }

  updateBaler(dt) {
    if (this.baler.isCrushing) {
      this.baler.ramAnim += dt / CONFIG.BALER.CRUSH_ANIM_DURATION;
      if (this.baler.ramAnim >= 1.0) {
        this.baler.ramAnim = 0;
        this.baler.isCrushing = false;
      }
    }
  }

  updateRandomEvents(dt) {
    if (!this.activeEvent) {
      for (let i = 0; i < this.eventSchedule.length; i++) {
        const ev = this.eventSchedule[i];
        if (!ev.fired && this.shiftTimer >= ev.triggerTime) {
          ev.fired = true;
          this.triggerRandomEvent(ev.type);
          break;
        }
      }
    } else {
      this.activeEvent.timer -= dt;
      if (this.activeEvent.timer <= 0) {
        this.addPopup('EVENT CONCLUDED', 320, 340, '#81c784', 1.2);
        this.activeEvent = null;
      }
    }
  }

  triggerRandomEvent(type) {
    Audio.playEventAlert();

    switch (type) {
      case 'FLEXO_JAM': {
        const running = this.flexos.filter(f => f.isUnlocked && f.state !== 'JAMMED' && f.state !== 'CHANGEOVER');
        if (running.length > 0) {
          const target = running[Math.floor(Math.random() * running.length)];
          target.state = 'JAMMED';
          target.jammed = true;
          Audio.playJamBuzzer();
          this.activeEvent = {
            type: 'FLEXO_JAM',
            name: `JAM AT LINE ${target.id}!`,
            timer: 30.0,
            desc: `Line ${target.id} jammed! Park at bay & hold [E] to fix.`
          };
          this.addPopup(`LINE ${target.id} JAMMED!`, target.center, 100, '#ef5350', 2.0);
        }
        break;
      }
      case 'RUSH_ORDER': {
        const unlocked = this.flexos.filter(f => f.isUnlocked && f.state !== 'CHANGEOVER');
        if (unlocked.length > 0) {
          const target = unlocked[Math.floor(Math.random() * unlocked.length)];
          target.isRush = true;
          target.rushTimer = CONFIG.EVENTS.RUSH_ORDER_DURATION;
          this.activeEvent = {
            type: 'RUSH_ORDER',
            name: `RUSH 2x: LINE ${target.id}`,
            timer: CONFIG.EVENTS.RUSH_ORDER_DURATION,
            desc: `2x Revenue for Line ${target.id} shipments!`
          };
          this.addPopup('RUSH ORDER 2x!', target.center, 100, '#ffd700', 2.2);
        }
        break;
      }
      case 'WARPED_RUN': {
        this.activeEvent = {
          type: 'WARPED_RUN',
          name: 'WARPED BOARD RUN!',
          timer: CONFIG.EVENTS.WARPED_RUN_DURATION,
          desc: 'High warped board rate! Route rejects to Scrap Baler (Bay 7).'
        };
        this.addPopup('WARPED BOARD RUN DETECTED!', 320, 200, '#ff9800', 2.0);
        break;
      }
      case 'KNIFE_CHANGE': {
        this.corrugator.pausedTimer = CONFIG.EVENTS.KNIFE_CHANGE_DURATION;
        this.activeEvent = {
          type: 'KNIFE_CHANGE',
          name: 'CORRUGATOR KNIFE CHANGE',
          timer: CONFIG.EVENTS.KNIFE_CHANGE_DURATION,
          desc: 'Corrugator paused 10s for knife change. Catch up on WIP!'
        };
        this.addPopup('KNIFE CHANGE PAUSE (10s)', 56, 100, '#29b6f6', 2.0);
        break;
      }
      case 'FATIGUE': {
        this.activeEvent = {
          type: 'FATIGUE',
          name: 'LOW BATTERY / HIGH DEMAND',
          timer: CONFIG.EVENTS.FATIGUE_DURATION,
          desc: 'Cart speed reduced 15% briefly.'
        };
        this.addPopup('LOW BATTERY ALERT!', 320, 200, '#ff7043', 2.0);
        break;
      }
    }
  }

  // --- ACTIONS (W, S, Space, Q) ---

  handleActionUp() {
    if (this.cart.transferAnim) return;
    const bayId = this.cart.activeBay;

    if (bayId === 0) {
      this.grabFromStacker('upper');
      return;
    }
    if (bayId >= 1 && bayId <= 6) {
      this.feedToFlexo(bayId - 1);
      return;
    }
    if (bayId === 7) {
      this.dumpToBaler();
      return;
    }
  }

  handleActionDown() {
    if (this.cart.transferAnim) return;
    const bayId = this.cart.activeBay;

    if (bayId === 0) {
      this.grabFromStacker('lower');
      return;
    }
    if (bayId >= 1 && bayId <= 6) {
      this.depositToWip(bayId - 1);
      return;
    }
    if (bayId === 7) {
      this.dumpToBaler();
      return;
    }
  }

  handleActionSpace() {
    if (this.cart.transferAnim) return;
    const bayId = this.cart.activeBay;

    if (bayId === 0) {
      this.grabFromStacker('smart');
      return;
    }
    if (bayId >= 1 && bayId <= 6) {
      this.pullFromWip(bayId - 1);
      return;
    }
    if (bayId === 7) {
      this.dumpToBaler();
      return;
    }
  }

  handleActionSwap() {
    if (this.cart.twinBed) {
      this.cart.activeBed = 1 - this.cart.activeBed;
      Audio.playHydraulicHiss();
      this.addPopup(`BED ${this.cart.activeBed === 0 ? 'A' : 'B'} ACTIVE`, this.cart.x, 190, '#ce93d8', 0.8);
    }
  }

  // Grab from Corrugator Stacker (Bay 0) with smart oldest comparison
  grabFromStacker(preference = 'smart') {
    const maxCapacity = this.cart.twinBed ? 2 : 1;
    if (this.cart.stacks.length >= maxCapacity) {
      this.addPopup('CART FULL!', 56, 190, '#ef5350', 0.8);
      Audio.playWrongGrade();
      return;
    }

    let sourceQueue = null;
    if (preference === 'upper' || !this.corrugator.isDualKnife) {
      sourceQueue = this.corrugator.upperQueue.length > 0 ? this.corrugator.upperQueue : this.corrugator.lowerQueue;
    } else if (preference === 'lower') {
      sourceQueue = this.corrugator.lowerQueue.length > 0 ? this.corrugator.lowerQueue : this.corrugator.upperQueue;
    } else {
      // Smart: Compare genuine oldest stack between upper & lower
      const uStack = this.corrugator.upperQueue[0];
      const lStack = this.corrugator.lowerQueue[0];
      if (uStack && lStack) {
        sourceQueue = (uStack.createdAt <= lStack.createdAt) ? this.corrugator.upperQueue : this.corrugator.lowerQueue;
      } else {
        sourceQueue = this.corrugator.upperQueue.length > 0 ? this.corrugator.upperQueue : this.corrugator.lowerQueue;
      }
    }

    if (!sourceQueue || sourceQueue.length === 0) {
      this.addPopup('STACKER EMPTY', 56, 190, '#9e9e9e', 0.8);
      return;
    }

    const stack = sourceQueue.shift();
    Audio.playRollerTransfer();

    this.cart.transferAnim = {
      fromX: 56,
      fromY: 154,
      toX: this.cart.x,
      toY: CONFIG.LAYOUT.RAIL_CORRIDOR.railY,
      progress: 0,
      stack: stack,
      onComplete: () => {
        this.cart.stacks.push(stack);
        Audio.playHydraulicHiss();
      }
    };
  }

  // Feed stack UP into Flexo Infeed Hopper (Bays 1-6)
  feedToFlexo(flexoIndex) {
    const flexo = this.flexos[flexoIndex];
    if (!flexo || !flexo.isUnlocked) {
      this.addPopup('LINE LOCKED', this.cart.x, 170, '#9e9e9e', 0.8);
      return;
    }

    if (flexo.state === 'CHANGEOVER') {
      this.addPopup('LINE IN CHANGEOVER', flexo.center, 160, '#29b6f6', 0.8);
      Audio.playWrongGrade();
      return;
    }

    if (this.cart.stacks.length === 0) {
      this.addPopup('CART EMPTY', this.cart.x, 190, '#9e9e9e', 0.8);
      return;
    }

    // Check order completion limit (prevent old-grade cheating)
    const totalJobSheets = flexo.orderTotalStacks * flexo.requiredGrade.stackSheets;
    const orderSheetsRemaining = Math.max(0, totalJobSheets - flexo.boxesFedInJob);
    if (flexo.hopperSheets >= orderSheetsRemaining) {
      this.addPopup('ORDER FULL (WASH-UP NEXT)', flexo.center, 160, '#ffca28', 1.0);
      Audio.playWrongGrade();
      return;
    }

    // Check hopper capacity
    const hopperCapSheets = flexo.maxHopper * flexo.requiredGrade.stackSheets;
    if (flexo.hopperSheets >= hopperCapSheets) {
      this.addPopup('HOPPER FULL!', flexo.center, 160, '#ef5350', 0.8);
      Audio.playWrongGrade();
      return;
    }

    // Prioritize matching bed on Twin-Bed
    let stackIndex = 0;
    if (this.cart.twinBed && this.cart.stacks.length === 2) {
      if (this.cart.stacks[1].grade.code === flexo.requiredGrade.code && !this.cart.stacks[1].isWarped) {
        stackIndex = 1;
      }
    }

    const stack = this.cart.stacks[stackIndex];

    if (stack.isWarped) {
      this.addPopup('WARPED BOARD! (REJECT)', flexo.center, 160, '#ef5350', 1.2);
      Audio.playWrongGrade();
      return;
    }

    if (stack.grade.code !== flexo.requiredGrade.code) {
      this.addPopup('WRONG GRADE! (' + flexo.requiredGrade.code + ' REQ)', flexo.center, 160, '#ef5350', 1.2);
      Audio.playWrongGrade();
      return;
    }

    this.cart.stacks.splice(stackIndex, 1);
    Audio.playRollerTransfer();

    this.cart.transferAnim = {
      fromX: this.cart.x,
      fromY: CONFIG.LAYOUT.RAIL_CORRIDOR.railY,
      toX: flexo.center,
      toY: 164,
      progress: 0,
      stack: stack,
      onComplete: () => {
        flexo.hopperSheets += stack.sheets;
        this.shiftStats.goodStacksFed++;
        if (flexo.state === 'STARVED') {
          flexo.state = 'RUNNING';
        }
        Audio.playHydraulicHiss();
        this.addPopup('FED ' + stack.grade.code, flexo.center, 160, '#66bb6a', 0.9);
      }
    };
  }

  depositToWip(wipIndex) {
    const lane = this.wipLanes[wipIndex];
    if (!lane || !lane.isUnlocked) {
      this.addPopup('WIP LANE LOCKED', this.cart.x, 250, '#9e9e9e', 0.8);
      return;
    }

    if (this.cart.stacks.length === 0) {
      this.addPopup('CART EMPTY', this.cart.x, 190, '#9e9e9e', 0.8);
      return;
    }

    if (lane.stacks.length >= lane.capacity) {
      this.addPopup('WIP LANE FULL!', lane.center, 250, '#ef5350', 0.8);
      Audio.playWrongGrade();
      return;
    }

    let stackIndex = 0;
    if (this.cart.twinBed && this.cart.stacks.length === 2) {
      stackIndex = this.cart.activeBed;
    }
    const stack = this.cart.stacks.splice(stackIndex, 1)[0];
    Audio.playRollerTransfer();

    this.cart.transferAnim = {
      fromX: this.cart.x,
      fromY: CONFIG.LAYOUT.RAIL_CORRIDOR.railY,
      toX: lane.center,
      toY: 260 + lane.stacks.length * 24,
      progress: 0,
      stack: stack,
      onComplete: () => {
        lane.stacks.push(stack);
        Audio.playHydraulicHiss();
        this.addPopup('STORED ' + stack.grade.code, lane.center, 260, '#29b6f6', 0.9);
      }
    };
  }

  pullFromWip(wipIndex) {
    const lane = this.wipLanes[wipIndex];
    if (!lane || !lane.isUnlocked) {
      this.addPopup('WIP LANE LOCKED', this.cart.x, 250, '#9e9e9e', 0.8);
      return;
    }

    const maxCap = this.cart.twinBed ? 2 : 1;
    if (this.cart.stacks.length >= maxCap) {
      this.addPopup('CART FULL!', this.cart.x, 190, '#ef5350', 0.8);
      Audio.playWrongGrade();
      return;
    }

    if (lane.stacks.length === 0) {
      this.addPopup('WIP LANE EMPTY', lane.center, 250, '#9e9e9e', 0.8);
      return;
    }

    const stack = lane.stacks.shift();
    Audio.playRollerTransfer();

    this.cart.transferAnim = {
      fromX: lane.center,
      fromY: 260,
      toX: this.cart.x,
      toY: CONFIG.LAYOUT.RAIL_CORRIDOR.railY,
      progress: 0,
      stack: stack,
      onComplete: () => {
        this.cart.stacks.push(stack);
        Audio.playHydraulicHiss();
        this.addPopup('PULLED ' + stack.grade.code, this.cart.x, 190, '#66bb6a', 0.9);
      }
    };
  }

  dumpToBaler() {
    if (this.cart.stacks.length === 0) {
      this.addPopup('CART EMPTY', 596, 190, '#9e9e9e', 0.8);
      return;
    }

    let stackIndex = 0;
    if (this.cart.twinBed && this.cart.stacks.length === 2) {
      stackIndex = this.cart.activeBed;
    }
    const stack = this.cart.stacks.splice(stackIndex, 1)[0];

    this.baler.isCrushing = true;
    this.baler.ramAnim = 0;
    Audio.playBalerCrush();

    if (stack.isWarped) {
      const bonus = CONFIG.CORRUGATOR.WARPED_BALER_BONUS;
      this.shiftStats.balerBonuses += bonus;
      this.cash += bonus;
      this.addPopup(`+$${bonus} QC CATCH!`, 596, 120, '#66bb6a', 1.5);
    } else {
      this.addPopup('SCRAP BALED', 596, 120, '#ff9800', 1.0);
    }
  }

  // Continuous Live OEE Calculation
  getLiveOEE() {
    const totalLineTime = Math.max(1, this.shiftStats.totalLineActiveTime);
    const downtime = Math.min(totalLineTime, this.shiftStats.totalDowntime);
    const availability = Math.max(0, Math.min(1.0, (totalLineTime - downtime) / totalLineTime));

    const theoreticalMax = Math.max(1, this.shiftStats.theoreticalMaxBoxes);
    const performance = Math.max(0, Math.min(1.0, this.shiftStats.totalBoxesProduced / theoreticalMax));

    // Quality: 100% when no scrap lost yet, and count pre-loaded starting stacks (2 per active flexo = 4+)
    const goodFed = this.shiftStats.goodStacksFed;
    const scrap = this.shiftStats.scrapLosses;
    const startingStacks = 4; // pre-loaded shift-start hopper stacks
    let quality = 1.0;
    if (goodFed === 0 && scrap === 0) {
      quality = 1.0;
    } else {
      quality = Math.max(0, Math.min(1.0, (goodFed + startingStacks) / (goodFed + startingStacks + scrap)));
    }

    const overall = availability * performance * quality;
    return { availability, performance, quality, overall };
  }

  // End of Shift Summary & Save
  completeShift() {
    this.isShiftRunning = false;
    Audio.stopRailHum();
    Audio.playShiftHorn();

    const live = this.getLiveOEE();
    const overall = live.overall;

    let gradeObj = CONFIG.OEE.GRADES[CONFIG.OEE.GRADES.length - 1];
    for (let i = 0; i < CONFIG.OEE.GRADES.length; i++) {
      if (overall >= CONFIG.OEE.GRADES[i].min) {
        gradeObj = CONFIG.OEE.GRADES[i];
        break;
      }
    }

    let bonusCash = 0;
    if (overall >= CONFIG.OEE.BENCHMARK_SCORE) {
      bonusCash = CONFIG.OEE.BENCHMARK_BONUS;
      this.cash += bonusCash;
    }

    const totalRev = this.shiftStats.grossRevenue + this.shiftStats.jobBonuses + this.shiftStats.rushBonuses + this.shiftStats.balerBonuses + bonusCash;
    const totalPen = this.shiftStats.downtimePenalty + this.shiftStats.backlogPenalty;
    const netEarnings = Math.max(0, totalRev - totalPen);
    this.shiftStats.netEarnings = netEarnings;

    this.shiftStats.oee = {
      availability: live.availability,
      performance: live.performance,
      quality: live.quality,
      overall: overall,
      grade: gradeObj.grade,
      gradeColor: gradeObj.color,
      bonusAwarded: bonusCash
    };

    // Save with NEXT shift number so reload/continue advances to Shift N+1
    const nextShift = this.shiftNumber + 1;
    if (this.saveData) {
      this.saveData.careerBoxes = (this.saveData.careerBoxes || 0) + this.shiftStats.boxesShipped;
    }
    this.persistSaveData(nextShift);

    if (this.onShiftComplete) {
      this.onShiftComplete(this.shiftStats);
    }
  }

  purchaseUpgrade(upgradeId) {
    const item = CONFIG.UPGRADES.find(u => u.id === upgradeId);
    if (!item) return false;

    const currentLvl = this.upgrades[upgradeId] || 0;
    if (currentLvl >= item.maxLevel) return false;

    const cost = item.costs[currentLvl];
    if (this.cash < cost) return false;

    this.cash -= cost;
    this.upgrades[upgradeId] = currentLvl + 1;
    this.applyUpgrades();
    this.persistSaveData();
    Audio.playUpgradePurchase();
    return true;
  }

  addPopup(text, x, y, color = '#ffffff', maxLife = 1.0) {
    this.popups.push({
      text: text,
      x: x,
      y: y,
      vy: -25,
      color: color,
      life: maxLife,
      maxLife: maxLife
    });
  }

  addParticle(x, y, color = '#ffca28', size = 2, maxLife = 0.4) {
    this.particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      color: color,
      size: size,
      life: maxLife,
      maxLife: maxLife
    });
  }

  updatePopupsAndParticles(dt) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.popups.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
}
