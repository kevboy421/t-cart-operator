// config.js - Complete tuning, layout, and economy parameters for T-Cart Operator

export const CONFIG = {
  // Screen & Viewport
  CANVAS_WIDTH: 640,
  CANVAS_HEIGHT: 360,

  // Layout Vertical Bands
  LAYOUT: {
    HUD_TOP: { y: 0, h: 32 },
    FLEXO_ZONE: {
      y: 32,
      h: 152,
      palletDock: { y: 34, h: 22 },
      machineBody: { y: 66, h: 86 },
      infeedHopper: { y: 152, h: 28 }
    },
    RAIL_CORRIDOR: { y: 184, h: 48, railY: 208 },
    WIP_ZONE: { y: 232, h: 98 },
    BOTTOM_TICKER: { y: 330, h: 30 }
  },

  // 8 Fixed Bay coordinates (dock centers & boundaries)
  BAYS: [
    { id: 0, name: 'Corrugator Stacker', type: 'stacker', xMin: 0, xMax: 96, center: 56 },
    { id: 1, name: 'Flexo Line 1', type: 'flexo', lineIndex: 0, xMin: 96, xMax: 172, center: 134 },
    { id: 2, name: 'Flexo Line 2', type: 'flexo', lineIndex: 1, xMin: 172, xMax: 248, center: 210 },
    { id: 3, name: 'Flexo Line 3', type: 'flexo', lineIndex: 2, xMin: 248, xMax: 324, center: 286 },
    { id: 4, name: 'Flexo Line 4', type: 'flexo', lineIndex: 3, xMin: 324, xMax: 400, center: 362 },
    { id: 5, name: 'Flexo Line 5', type: 'flexo', lineIndex: 4, xMin: 400, xMax: 476, center: 438 },
    { id: 6, name: 'Flexo Line 6', type: 'flexo', lineIndex: 5, xMin: 476, xMax: 552, center: 514 },
    { id: 7, name: 'Scrap Baler', type: 'baler', xMin: 552, xMax: 640, center: 596 }
  ],
  MAGNETIC_SNAP_DISTANCE: 20, // Snap when releasing move key within +-20px of dock center

  // Shift & Timing (in seconds)
  SHIFT_DURATION: 180, // 3:00 real time
  START_CLOCK_HOURS: 6.0,  // 06:00
  END_CLOCK_HOURS: 14.0,   // 14:00 (8 compressed hours)

  // Corrugator Stacker settings
  CORRUGATOR: {
    BASE_CYCLE_TIME: 8.5, // seconds per stack on Shift 1 (2 lines active)
    MIN_CYCLE_TIME: 1.8,
    CYCLE_SCALE_PER_SHIFT: 0.95, // 5% faster output per shift
    MAX_QUEUE_CAPACITY: 4, // base queue capacity (single knife)
    MAX_QUEUE_CAPACITY_DUAL: 6, // queue capacity when dual knife (3 upper, 3 lower)
    CREEP_SPEED_BUFFER: 5.0, // 5s amber warning buffer before backlog charges cash/OEE penalty
    BACKLOG_PENALTY_PER_SEC: 8.0, // $ penalty per second once creep timer expires
    DUAL_KNIFE_UNLOCK_SHIFT: 4, // Dual-knife active Shift 4+ OR when 4+ Flexo lines unlocked
    WARPED_CHANCE_BASE: 0.05,
    WARPED_CHANCE_EVENT: 0.35,
    WARPED_BALER_BONUS: 15 // $ QC catch bonus for baling warped board
  },

  // 4 Board Grades (Natural kraft colors & high-contrast text)
  BOARD_GRADES: {
    K: {
      code: 'K',
      name: '32 ECT Kraft',
      color: '#c89658',
      fluteColor: '#9c6f3b',
      textColor: '#181a1c',
      minShift: 1,
      stackSheets: 100,
      boxValue: 0.40, // $ earned per box shipped
      orderStacksMin: 3,
      orderStacksMax: 5,
      completionBonus: 35,
      thicker: false
    },
    D: {
      code: 'D',
      name: '44 ECT Double-Wall',
      color: '#7a4f2b',
      fluteColor: '#543114',
      textColor: '#ffffff',
      minShift: 1,
      stackSheets: 80,
      boxValue: 0.55,
      orderStacksMin: 3,
      orderStacksMax: 5,
      completionBonus: 50,
      thicker: true
    },
    W: {
      code: 'W',
      name: 'White-Top',
      color: '#e8e6df',
      fluteColor: '#b4b0a4',
      textColor: '#181a1c',
      minShift: 2,
      stackSheets: 100,
      boxValue: 0.75,
      orderStacksMin: 3,
      orderStacksMax: 6,
      completionBonus: 70,
      thicker: false
    },
    X: {
      code: 'X',
      name: 'Wax Moisture-Guard',
      color: '#4d88b5',
      fluteColor: '#2f5b7d',
      textColor: '#ffffff',
      minShift: 4,
      stackSheets: 90,
      boxValue: 1.05,
      orderStacksMin: 4,
      orderStacksMax: 6,
      completionBonus: 95,
      thicker: false
    }
  },

  // PTC T-Cart Physics & Sizing
  CART: {
    WIDTH_SINGLE: 54,
    WIDTH_TWIN: 68,
    HEIGHT: 34,
    BASE_SPEED: 180, // px / sec
    BASE_ACCEL: 850, // px / sec^2
    FRICTION: 750,
    BASE_TRANSFER_TIME: 0.35, // seconds for stack slide animation
    JAM_FIX_HOLD_TIME: 1.2, // hold E for 1.2s to clear jam
    JAM_AUDIO_THROTTLE: 0.15 // seconds between wrench ticks
  },

  // Flexo Line Specs
  FLEXO: {
    BASE_HOPPER_CAPACITY: 4, // stacks
    HOPPER_CAP_PER_LEVEL: 1, // +1 stack per Extended Hopper upgrade level (max 4 upgrades -> 8 stacks)
    BOXES_PER_SEC_BASE: 4.0, // feed rate (4.0 boxes/sec = 100-sheet stack lasts 25s!)
    BOXES_PER_PALLET: 200, // bundled boxes per shipping pallet
    CHANGEOVER_TIME_BASE: 8.0, // seconds
    CHANGEOVER_GRACE_TIME: 6.0, // seconds after changeover where downtime isn't penalized
    STARVED_PENALTY_PER_SEC: 6.0, // $ penalty per second line is starved (hopper = 0)
    LOW_HOPPER_THRESHOLD: 0.25 // < 25% flashes amber
  },

  // WIP Storage Specs
  WIP: {
    LANE_WIDTH: 36,
    BASE_UNLOCKED_LANES: 2, // Lanes 1 & 2 start unlocked on Shift 1!
    BASE_CAPACITY: 1, // stacks
    MAX_CAPACITY: 3 // up to 3 stacks with Deepen upgrades
  },

  // Auto-Feeder AGV specs
  AUTO_FEEDER: {
    TRIGGER_THRESHOLD: 0.50, // Triggers when Flexo hopper is below 50%
    BASE_TRANSFER_TIME: 1.8, // seconds per auto-transfer
    SPEED_MULTIPLIER_PER_LEVEL: 1.3
  },

  // Baler specs
  BALER: {
    CRUSH_ANIM_DURATION: 0.8 // seconds
  },

  // Random Events Config
  EVENTS: {
    MIN_EVENTS_PER_SHIFT: 2,
    MAX_EVENTS_PER_SHIFT: 4,
    RUSH_ORDER_DURATION: 25.0,
    WARPED_RUN_DURATION: 20.0,
    KNIFE_CHANGE_DURATION: 10.0,
    FATIGUE_DURATION: 15.0
  },

  // OEE Weights & Letter Grades
  OEE: {
    BENCHMARK_SCORE: 0.80, // >= 80% awards bonus cash
    BENCHMARK_BONUS: 200,
    GRADES: [
      { min: 0.90, grade: 'S', color: '#ffd700', multiplier: 1.25 },
      { min: 0.80, grade: 'A', color: '#4caf50', multiplier: 1.15 },
      { min: 0.70, grade: 'B', color: '#29b6f6', multiplier: 1.05 },
      { min: 0.60, grade: 'C', color: '#ff9800', multiplier: 1.00 },
      { min: 0.00, grade: 'D', color: '#f44336', multiplier: 0.90 }
    ]
  },

  // 10 Upgrades Catalog (Balanced costs for $650-$950 Shift 1 earnings)
  UPGRADES: [
    {
      id: 'cart_speed',
      name: 'Cart Drive Motor',
      maxLevel: 5,
      costs: [80, 160, 280, 460, 720],
      desc: 'Increases PTC top speed (+25%) & acceleration.',
      effectText: (lvl) => `Speed: +${lvl * 25}%`
    },
    {
      id: 'roller_deck',
      name: 'Hydraulic Roller Deck',
      maxLevel: 4,
      costs: [90, 180, 320, 520],
      desc: 'Cuts stack load/unload transfer slide duration.',
      effectText: (lvl) => `Transfer: -${(lvl * 18).toFixed(0)}% time`
    },
    {
      id: 'twin_bed',
      name: 'Twin-Bed T-Cart',
      maxLevel: 1,
      costs: [320],
      desc: 'Doubles cart carry capacity to 2 stacks side-by-side.',
      effectText: (lvl) => lvl > 0 ? 'Capacity: 2 Stacks' : 'Capacity: 1 Stack'
    },
    {
      id: 'unlock_flexo',
      name: 'Unlock Flexo Lines',
      maxLevel: 4, // 0 = 2 unlocked, 1 = Line 3, 2 = Line 4, 3 = Line 5, 4 = Line 6
      costs: [180, 360, 620, 950],
      desc: 'Commissions the next Flexo line for increased plant capacity.',
      effectText: (lvl) => `Active Lines: ${2 + lvl} of 6`
    },
    {
      id: 'wip_lanes',
      name: 'Expand WIP Lanes',
      maxLevel: 4, // Lanes 1 & 2 start unlocked; 1 = Lane 3, 2 = Lane 4, 3 = Lane 5, 4 = Lane 6
      costs: [120, 220, 360, 520],
      desc: 'Builds powered WIP storage conveyor lanes for Bays 3 through 6.',
      effectText: (lvl) => `Active Lanes: ${2 + lvl} of 6`
    },
    {
      id: 'wip_capacity',
      name: 'Deepen WIP Storage',
      maxLevel: 2, // 0 = 1 stack, 1 = 2 stacks, 2 = 3 stacks
      costs: [140, 320],
      desc: 'Extends length of each WIP conveyor to hold deeper queues.',
      effectText: (lvl) => `Lanes hold ${1 + lvl} stacks each`
    },
    {
      id: 'hopper_capacity',
      name: 'Extended Infeed Hoppers',
      maxLevel: 4,
      costs: [100, 200, 360, 580],
      desc: 'Increases sheet capacity on all Flexo infeed hoppers (+25% each).',
      effectText: (lvl) => `Hopper: +${lvl * 25}% sheets`
    },
    {
      id: 'rf_scanner',
      name: 'RF Barcode Scanner',
      maxLevel: 1,
      costs: [160],
      desc: 'Heads-up display highlights Flexo lines needing your cart cargo.',
      effectText: (lvl) => lvl > 0 ? 'HUD Reticle & Guidance Active' : 'Offline'
    },
    {
      id: 'auto_feeder',
      name: 'WIP Auto-Feeder Shuttle',
      maxLevel: 3,
      costs: [240, 480, 820],
      desc: 'Autonomous AGV shuttle transfers matching stacks from WIP to Flexo.',
      effectText: (lvl) => lvl === 0 ? 'None' : lvl === 1 ? 'Covers Bays 1–2' : lvl === 2 ? 'Covers Bays 1–4' : 'Covers All Bays (1–6)'
    },
    {
      id: 'quick_plates',
      name: 'Quick-Lock Print Plates',
      maxLevel: 3,
      costs: [110, 220, 400],
      desc: 'Rapid setup tooling cuts Flexo changeover wash-up time by 20% / lvl.',
      effectText: (lvl) => `Changeover: -${lvl * 20}% time`
    }
  ]
};
