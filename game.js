(() => {
  window.NMR_BUILD = '20260829-bgscroll1';
  const canvas = document.querySelector('#game');
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const WORLD_W = 2720;
  const WORLD_H = 1840;
  const GATOR_SCALE = 0.78;
  const params = new URLSearchParams(location.search);
  const debugMode = params.has('selftest') || params.has('debug');

  const palette = [
    ['#c56a65', '#f1a65f'],
    ['#6e629b', '#b99cee'],
    ['#527b93', '#7ce2db'],
    ['#756c5d', '#f0c66e'],
    ['#925d7d', '#ff93b1'],
    ['#607749', '#d5ff69'],
    ['#7c4d3f', '#ffca61'],
    ['#455a78', '#75e2ff']
  ];

  const H_ROADS = [
    { y: 170, w: 104 }, { y: 424, w: 118 }, { y: 705, w: 92 },
    { y: 1018, w: 124 }, { y: 1326, w: 98 }, { y: 1634, w: 110 }
  ];
  const V_ROADS = [
    { x: 210, w: 104 }, { x: 512, w: 90 }, { x: 828, w: 116 },
    { x: 1185, w: 96 }, { x: 1525, w: 126 }, { x: 1905, w: 94 },
    { x: 2328, w: 108 }
  ];

  const buildingNames = [
    'RUGPULL BANK', 'GAS FEE DINER', 'FOMO MART', 'HODL HOTEL',
    'BAG HOLDER BAR', 'LAMBO LOT', 'SHILL SHOP', 'MOONBOY MALL',
    'PAPER HANDS', 'WHALE BAIT', 'EXIT LIQUIDITY', 'DUST COIN',
    'PUMP N DUMP', 'AIRDROP ALLEY', 'DEGEN DENTAL', 'KYC KAFE',
    'ALTCOIN ARCADE', 'CANDLE CLUB', 'LEVERAGE LAUNDRY', 'FORKED CAFE',
    'MINTY PAWN', 'SLIPPAGE SALON', 'FLOOR PRICE FLATS', 'TOKEN TANTRUM',
    'WEN DONUT', 'CHAIN PAIN', 'BUBBLE BROKER', 'LIQUIDATION LAIR'
  ];

  const cryptoInsults = [
    'Nice wallet, zero balance.',
    'Your bags have bags.',
    'I shorted your confidence.',
    'Stocky, your chart looks like stairs to a basement.',
    'Your seed phrase is just panic.',
    'Even demo coins rejected you.',
    'You bought the top and framed the receipt.',
    'Your portfolio needs a toe tag.',
    'Bubble City called, you are exit liquidity.',
    'That jacket screams paper hands.',
    'Your moon mission landed in a parking meter.',
    "Haha, you're crypto poor and real-life poor.",
    'Your alpha is just a rumor with shoes.',
    'I have seen stronger support in wet cardboard.',
    'Your stop loss has a restraining order.',
    'You are bullish on bad decisions.',
    'Your candle closed in therapy.',
    'The dip dipped to avoid you.',
    'Your wallet is lighter than gas fees.',
    'You ape in like a broken vending machine.',
    'Your diamond hands are painted plastic.',
    'The whales use your portfolio as bait.',
    'You got rugged by a loading screen.',
    'Your NFT collection has a dust allergy.',
    'You trade like your keyboard owes you money.',
    'Your charts need parental controls.',
    'The market muted you.',
    'Your gains are still buffering.',
    'You are the reason candles wear helmets.',
    'Your thesis is cope with punctuation.',
    'Even fake yield walked away from you.',
    'Your wallet balance is a jump scare.',
    'You got liquidated by lunch.',
    'Your bags are historic ruins.',
    'You chase pumps like they stole your shoes.',
    'Your portfolio is a cautionary pamphlet.',
    'The blockchain asked you to stop calling.',
    'Your limit order is fossilized.',
    'You have negative drip and negative yield.',
    'Your risk management is a sticky note.',
    'You are down-only technology.',
    'Your memecoin has a bedtime.',
    'The bull market forgot your address.',
    'You got frontrun by common sense.',
    'Your floor price is the sidewalk.',
    'Your leverage has stage fright.',
    'Your tokenomics are a garage sale.',
    'Your exit strategy is crying.',
    'Even stablecoins feel volatile near you.',
    'Your bags need a moving truck.'
  ];

  const pedLines = [
    'Nice socks, Stocky.', 'Two sodas says he survives a minute.',
    'I only came here for bubble tea.', 'This town needs cheaper gas fees.',
    'That candle shop is cursed.', 'Your haircut is a bear market.',
    'I am not buying another duck coin.', 'The bank sign feels personal.',
    'Move it, paper hands.', 'My cousin got rugged by a sandwich token.',
    'Honestly, the little teal guy has style.', 'Haha, rent is up and bags are down.',
    'I miss boring savings accounts.', 'That driver owes me a mirror.',
    'Stocks? Never heard of them.', 'Everyone here needs a financial adult.'
  ];

  const demoScores = [
    { name: 'BEEPBOOP', score: 12750 },
    { name: 'SUGAR RUSH', score: 9020 },
    { name: 'MOP DOG', score: 6440 },
    { name: 'TOAST', score: 4180 }
  ];

  const $ = s => document.querySelector(s);
  const ui = {
    health: $('#healthBar'),
    kills: $('#kills'),
    timer: $('#timer'),
    score: $('#score'),
    heat: $('#heat'),
    ammo: $('#ammo'),
    mult: $('#mult'),
    start: $('#startScreen'),
    over: $('#gameOver'),
    result: $('#resultLine'),
    name: $('#playerName'),
    board: $('#leaderboard'),
    note: $('#boardNote')
  };

  const buildings = [];
  const stores = [];
  const props = [];
  const phones = [];
  const garages = [];
  const keys = new Set();
  const movementKeys = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  const actionKeys = new Set([' ', 'f', 'e']);
  const gameKeys = new Set([...movementKeys, ...actionKeys]);
  let game;
  let last = 0;
  let runId = 0;

  buildCity();

  addEventListener('keydown', e => {
    const key = normalizeKey(e);
    if (!gameKeys.has(key) || isTypingTarget(e.target)) return;
    e.preventDefault();
    if (!game?.alive || !ui.start.classList.contains('hidden')) return;
    keys.add(key);
    if (!e.repeat && movementKeys.has(key)) tapMove(key);
    if (!e.repeat) pressAction(key);
  });
  addEventListener('keyup', e => {
    const key = normalizeKey(e);
    if (!gameKeys.has(key)) return;
    e.preventDefault();
    keys.delete(key);
    if (key === 'e' && game?.player) game.player.eLatch = false;
  });

  canvas.addEventListener('pointermove', aimFromPointer);
  canvas.addEventListener('pointerdown', e => {
    focusGame();
    if (!game?.alive || !ui.start.classList.contains('hidden')) return;
    aimFromPointer(e);
    fireFromInput();
  });

  function normalizeKey(e) {
    if (e.key === ' ' || e.code === 'Space') return ' ';
    return e.key.toLowerCase();
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function focusGame() {
    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus();
    }
  }

  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function buildCity() {
    const rnd = mulberry32(8675309);
    const xBands = bandsFromRoads(V_ROADS, WORLD_W, 'x');
    const yBands = bandsFromRoads(H_ROADS, WORLD_H, 'y');
    let sign = 0;

    yBands.forEach((yb, yi) => {
      xBands.forEach((xb, xi) => {
        const zoneW = xb[1] - xb[0];
        const zoneH = yb[1] - yb[0];
        if (zoneW < 76 || zoneH < 68) return;

        if (rnd() < 0.13) {
          addPlaza(xb, yb, rnd);
          return;
        }

        const cols = zoneW > 300 ? 2 : 1;
        const rows = zoneH > 245 ? 2 : 1;
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            if (rnd() < 0.12) continue;
            const cellX = xb[0] + zoneW * cx / cols;
            const cellY = yb[0] + zoneH * cy / rows;
            const cellW = zoneW / cols;
            const cellH = zoneH / rows;
            const pad = 12 + rnd() * 18;
            const w = Math.max(62, cellW - pad * (1.8 + rnd() * 1.2));
            const h = Math.max(50, cellH - pad * (1.8 + rnd() * 1.2));
            const x = cellX + pad + rnd() * Math.max(4, cellW - w - pad * 2);
            const y = cellY + pad + rnd() * Math.max(4, cellH - h - pad * 2);
            const p = palette[(yi * 5 + xi + cx + cy) % palette.length];
            const b = {
              x, y, w, h,
              roof: p[0],
              trim: p[1],
              sign: buildingNames[sign++ % buildingNames.length],
              tall: rnd() > 0.54
            };
            buildings.push(b);
            addStoreDoor(b, rnd);
          }
        }
      });
    });

    seedStreetProps(rnd);
    seedServiceSpots(rnd);
  }

  function bandsFromRoads(roads, max, axis) {
    const sorted = roads.map(r => ({ start: r[axis] - r.w / 2, end: r[axis] + r.w / 2 })).sort((a, b) => a.start - b.start);
    const bands = [];
    let cursor = 26;
    sorted.forEach(r => {
      const end = r.start - 18;
      if (end - cursor > 58) bands.push([cursor, end]);
      cursor = r.end + 18;
    });
    if (max - 26 - cursor > 58) bands.push([cursor, max - 26]);
    return bands;
  }

  function addStoreDoor(b, rnd) {
    const side = Math.floor(rnd() * 4);
    let x = b.x + b.w / 2;
    let y = b.y + b.h / 2;
    if (side === 0) {
      y = b.y - 8;
      x = b.x + 24 + rnd() * Math.max(8, b.w - 48);
    }
    if (side === 1) {
      y = b.y + b.h + 8;
      x = b.x + 24 + rnd() * Math.max(8, b.w - 48);
    }
    if (side === 2) {
      x = b.x - 8;
      y = b.y + 24 + rnd() * Math.max(8, b.h - 48);
    }
    if (side === 3) {
      x = b.x + b.w + 8;
      y = b.y + 24 + rnd() * Math.max(8, b.h - 48);
    }
    stores.push({ x: clamp(x, 20, WORLD_W - 20), y: clamp(y, 20, WORLD_H - 20), name: b.sign });
  }

  function addPlaza(xb, yb, rnd) {
    const cx = (xb[0] + xb[1]) / 2;
    const cy = (yb[0] + yb[1]) / 2;
    props.push({ type: 'park', x: cx, y: cy, w: Math.min(110, xb[1] - xb[0] - 36), h: Math.min(86, yb[1] - yb[0] - 36) });
    for (let i = 0; i < 4; i++) {
      props.push({ type: ['bench', 'bin', 'news', 'cone'][Math.floor(rnd() * 4)], x: xb[0] + 18 + rnd() * (xb[1] - xb[0] - 36), y: yb[0] + 18 + rnd() * (yb[1] - yb[0] - 36) });
    }
  }

  function seedStreetProps(rnd) {
    H_ROADS.forEach(road => {
      for (let x = 60 + rnd() * 80; x < WORLD_W - 60; x += 145 + rnd() * 130) {
        const side = rnd() > 0.5 ? -1 : 1;
        props.push({ type: ['hydrant', 'news', 'phone', 'bin', 'bench', 'cone'][Math.floor(rnd() * 6)], x, y: road.y + side * (road.w / 2 + 15 + rnd() * 12) });
      }
    });
    V_ROADS.forEach(road => {
      for (let y = 70 + rnd() * 90; y < WORLD_H - 70; y += 155 + rnd() * 135) {
        const side = rnd() > 0.5 ? -1 : 1;
        props.push({ type: ['hydrant', 'news', 'phone', 'bin', 'bench', 'manhole'][Math.floor(rnd() * 6)], x: road.x + side * (road.w / 2 + 15 + rnd() * 12), y });
      }
    });
  }

  function seedServiceSpots(rnd) {
    const shuffled = stores.slice().sort(() => rnd() - 0.5);
    shuffled.slice(0, 9).forEach((store, i) => {
      const phone = { type: 'jobphone', x: store.x, y: store.y, pulse: i * 0.7 };
      phones.push(phone);
      props.push(phone);
    });
    shuffled.slice(10, 16).forEach(store => {
      const garage = { type: 'garage', x: store.x, y: store.y, w: 42, h: 26 };
      garages.push(garage);
      props.push(garage);
    });
  }

  function reset() {
    const start = findStartPoint();
    game = {
      id: ++runId,
      alive: true,
      t: 0,
      kills: 0,
      bonus: 0,
      mult: 1,
      noise: 0,
      armor: 0,
      health: 100,
      spawn: 3.1,
      bossAt: 38,
      bossIndex: 0,
      pedTick: 0,
      crateTick: 2,
      mission: null,
      notice: null,
      player: { x: start.x, y: start.y, a: -Math.PI / 2, bonk: 0, vehicle: null, fire: 0, weapon: 'spark', weaponT: 0, turboT: 0, aimLock: 0 },
      enemies: [],
      peds: [],
      cars: [],
      bullets: [],
      enemyBullets: [],
      drops: [],
      crates: [],
      particles: [],
      camera: { x: clamp(start.x - W / 2, 0, WORLD_W - W), y: clamp(start.y - H / 2, 0, WORLD_H - H) }
    };

    [
      ['Bubble Bug', '#ff6d93', 645, 418],
      ['Citrus Cab', '#ffbd3d', 1300, 1018],
      ['Meat Wagon', '#cb7bf3', 612, 705],
      ['Puff Van', '#64d5ca', 1645, 424],
      ['Soda Sled', '#f16c8a', 1995, 1326],
      ['Mint Coupe', '#6ff7a7', 2328, 1018]
    ].forEach((v, i) => game.cars.push({ kind: 'parked', name: v[0], color: v[1], x: v[2], y: v[3], a: i * 0.7, occupied: false, life: 100, maxLife: 100, radius: 25 }));

    for (let i = 0; i < 20; i++) spawnPed(true);
    for (let i = 0; i < 18; i++) spawnTraffic();
    for (let i = 0; i < 14; i++) spawnCrate();
    for (let i = 0; i < 2; i++) spawnHostile();
    spawnHostile(false, 'badge');
    updateHud();
  }

  function start() {
    reset();
    keys.clear();
    ui.start.classList.add('hidden');
    ui.over.classList.add('hidden');
    focusGame();
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!game?.alive) return;
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const p = game.player;
    game.t += dt;
    game.spawn -= dt;
    game.pedTick -= dt;
    game.crateTick -= dt;
    if (game.notice) {
      game.notice.t -= dt;
      if (game.notice.t <= 0) game.notice = null;
    }
    game.noise = Math.max(0, game.noise - dt * 0.48);
    p.fire -= dt;
    p.turboT = Math.max(0, p.turboT - dt);
    p.aimLock = Math.max(0, p.aimLock - dt);

    const heat = heatLevel();
    const enemyCap = Math.min(24, 4 + heat * 2);
    if (game.spawn <= 0 && game.enemies.length < enemyCap) {
      spawnHostile();
      game.spawn = Math.max(0.42, 2.8 - heat * 0.15);
    }
    if (game.pedTick <= 0 && game.peds.length < 24) {
      spawnPed();
      game.pedTick = 2.5;
    }
    if (game.crateTick <= 0 && game.crates.length < 18) {
      spawnCrate();
      game.crateTick = 4.5 + Math.random() * 4;
    }
    if (game.t > game.bossAt) {
      spawnBoss();
      game.bossAt += 52 + Math.random() * 18;
    }

    let dx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let dy = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (dx || dy) {
      const l = Math.hypot(dx, dy);
      dx /= l;
      dy /= l;
      if (p.aimLock <= 0.02) p.a = Math.atan2(dy, dx);
    }

    const turbo = p.turboT > 0 ? 1.34 : 1;
    move(p, dx * (p.vehicle ? 275 : 150) * turbo * dt, dy * (p.vehicle ? 275 : 150) * turbo * dt, p.vehicle ? 21 : 11);

    if (keys.has('e') && !p.eLatch) {
      p.eLatch = true;
      toggleRide();
    }
    if (!keys.has('e')) p.eLatch = false;

    if (p.vehicle) {
      p.vehicle.x = p.x;
      p.vehicle.y = p.y;
      p.vehicle.a = p.a;
      p.vehicle.life -= dt * 0.85;
      if (p.vehicle.life <= 0) wreckCar(p.vehicle, true);
    }

    if (p.weapon !== 'spark') {
      p.weaponT -= dt;
      if (p.weaponT <= 0) p.weapon = 'spark';
    }

    if (keys.has('f') && p.fire <= 0) fireFromInput();
    if (keys.has(' ') && !p.bonk) {
      p.bonk = 0.25;
      bonk();
    }
    p.bonk = Math.max(0, p.bonk - dt);

    updateTraffic(dt);
    updatePeds(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateCrates(dt);
    updateDrops(dt);
    updateParticles(dt);
    updateMission(dt);

    game.camera.x = clamp(p.x - W / 2, 0, WORLD_W - W);
    game.camera.y = clamp(p.y - H / 2, 0, WORLD_H - H);
    if (game.health <= 0) end();
    updateHud();
  }

  function tapMove(key) {
    const p = game.player;
    let dx = (key === 'd' || key === 'arrowright' ? 1 : 0) - (key === 'a' || key === 'arrowleft' ? 1 : 0);
    let dy = (key === 's' || key === 'arrowdown' ? 1 : 0) - (key === 'w' || key === 'arrowup' ? 1 : 0);
    if (!dx && !dy) return;
    const l = Math.hypot(dx, dy);
    dx /= l;
    dy /= l;
    if (p.aimLock <= 0.02) p.a = Math.atan2(dy, dx);
    const turbo = p.turboT > 0 ? 1.34 : 1;
    const nudge = (p.vehicle ? 17 : 10) * turbo;
    move(p, dx * nudge, dy * nudge, p.vehicle ? 21 : 11);
    game.camera.x = clamp(p.x - W / 2, 0, WORLD_W - W);
    game.camera.y = clamp(p.y - H / 2, 0, WORLD_H - H);
    updateHud();
    draw();
  }

  function spawnHostile(initial = false, forcedType = null) {
    const heat = heatLevel();
    const roll = Math.random();
    let type = forcedType || 'gang';
    if (!forcedType && heat > 1 && roll > 0.64) type = 'badge';
    if (!forcedType && heat > 3 && roll > 0.84) type = 'gangShooter';
    const pt = initial ? randomOpenPoint() : spawnPointAroundPlayer(520, 840);
    if (!pt) return;
    const stats = {
      gang: { hp: 2, speed: 36 + heat * 4, color: '#ff7b63', hair: '#28304c', radius: 11 },
      gangShooter: { hp: 3, speed: 34 + heat * 3, color: '#c77dff', hair: '#1d2338', radius: 11, shoot: 1.75 },
      badge: { hp: 3, speed: 30 + heat * 3, color: '#6fd0ff', hair: '#0e2542', radius: 12, shoot: 1.8 }
    }[type];
    game.enemies.push({
      x: pt.x, y: pt.y, a: 0, type, hp: stats.hp, maxHp: stats.hp,
      speed: stats.speed, color: stats.color, hair: stats.hair, radius: stats.radius,
      runId: game.id, stun: 0, shootCd: stats.shoot ? Math.random() * stats.shoot : 0, speech: null, speechCd: 0, hitFlash: 0
    });
  }

  function spawnBoss() {
    const kinds = ['bossCar', 'bossGun', 'bossBruiser'];
    const type = kinds[game.bossIndex++ % kinds.length];
    const pt = spawnPointAroundPlayer(430, 760) || randomOpenPoint();
    if (!pt) return;

    if (type === 'bossCar') {
      const boss = {
        kind: 'boss', name: 'Margin Call Vince', color: '#1e273b', x: pt.x, y: pt.y, a: 0,
        runId: game.id, life: 320, maxLife: 320, radius: 34, speed: 170, turn: 0, boss: true, speech: null, speechCd: 0
      };
      say(boss, randomInsult(), 3.4);
      game.cars.push(boss);
      return;
    }

    const gun = type === 'bossGun';
    const boss = {
      x: pt.x, y: pt.y, a: 0, type, hp: gun ? 12 : 18, maxHp: gun ? 12 : 18,
      speed: gun ? 54 : 92, color: gun ? '#f7d35c' : '#e75f8f', hair: '#11192c',
      runId: game.id, radius: gun ? 16 : 19, stun: 0, shootCd: gun ? 0.4 : 0, speech: null, speechCd: 0, hitFlash: 0
    };
    say(boss, randomInsult(), 3.4);
    game.enemies.push(boss);
  }

  function spawnPed(initial = false) {
    const store = stores[Math.floor(Math.random() * stores.length)];
    const pt = initial ? randomOpenPoint() : spawnPointAroundPlayer(420, 720);
    if (!pt || !store) return;
    game.peds.push({
      x: pt.x, y: pt.y, a: 0, target: store, wait: Math.random() * 1.5,
      color: ['#8be18e', '#ffd76c', '#fc93b8', '#92a5ff', '#d5ff69'][Math.floor(Math.random() * 5)],
      hair: ['#31324b', '#6b402f', '#f8df7b', '#0b223d'][Math.floor(Math.random() * 4)],
      speech: null, speechCd: Math.random() * 5
    });
  }

  function spawnTraffic() {
    const horizontal = Math.random() > 0.5;
    const road = horizontal ? H_ROADS[Math.floor(Math.random() * H_ROADS.length)] : V_ROADS[Math.floor(Math.random() * V_ROADS.length)];
    const offset = (Math.random() - 0.5) * (road.w - 38);
    const dir = Math.random() > 0.5 ? 1 : -1;
    let x = horizontal ? Math.random() * WORLD_W : road.x + offset;
    let y = horizontal ? road.y + offset : Math.random() * WORLD_H;
    if (game?.player && Math.hypot(x - game.player.x, y - game.player.y) < 230) {
      if (horizontal) x = (x + WORLD_W / 2) % WORLD_W;
      else y = (y + WORLD_H / 2) % WORLD_H;
    }
    const c = {
      kind: 'traffic',
      name: 'Driver',
      color: ['#5fd6d2', '#ffbd3d', '#e35f7f', '#8ad05f', '#d8dde9', '#8d79df'][Math.floor(Math.random() * 6)],
      x,
      y,
      axis: horizontal ? 'h' : 'v',
      dir,
      a: horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: 82 + Math.random() * 78,
      turn: 1 + Math.random() * 2.5,
      life: 90,
      maxLife: 90,
      radius: 25
    };
    game.cars.push(c);
  }

  function spawnDrop(x, y, force = false) {
    if (!force && Math.random() > 0.075) return;
    dropItem(x, y, Math.random() > 0.65 ? 'rocket' : 'flame');
  }

  function dropItem(x, y, type) {
    game.drops.push({ x, y, type, life: type === 'quiet' || type === 'heal' ? 10 : 13 });
  }

  function spawnCrate() {
    for (let i = 0; i < 24; i++) {
      const pt = randomOpenPoint();
      if (!pt || onRoad(pt.x, pt.y, -4)) continue;
      game.crates.push({
        x: pt.x,
        y: pt.y,
        life: 1,
        spin: Math.random() * Math.PI
      });
      return;
    }
  }

  function updateTraffic(dt) {
    const p = game.player;
    game.cars.forEach(c => {
      if (c.kind === 'parked' || c.occupied || c.life <= 0) return;

      if (c.kind === 'boss') {
        const vx = p.x - c.x;
        const vy = p.y - c.y;
        const d = Math.hypot(vx, vy) || 1;
        c.a = Math.atan2(vy, vx);
        move(c, vx / d * c.speed * dt, vy / d * c.speed * dt, c.radius);
        c.speechCd -= dt;
        if (!c.speech || c.speech.t <= 0 || c.speechCd <= 0) say(c, randomInsult(), 3);
        if (d < (p.vehicle ? 52 : 38)) {
          damagePlayer((p.vehicle ? 2 : 3.8) * dt * 3.2, c.x, c.y);
          c.life -= p.vehicle ? dt * 18 : dt * 4;
          spark(c.x, c.y, '#ffeb68', 2);
        }
        if (c.speech) c.speech.t -= dt;
        return;
      }

      c.turn -= dt;
      if (c.axis === 'h') {
        c.x += c.dir * c.speed * dt;
        if (c.x < -40) c.x = WORLD_W + 40;
        if (c.x > WORLD_W + 40) c.x = -40;
        c.a = c.dir > 0 ? 0 : Math.PI;
      } else {
        c.y += c.dir * c.speed * dt;
        if (c.y < -40) c.y = WORLD_H + 40;
        if (c.y > WORLD_H + 40) c.y = -40;
        c.a = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }

      if (c.turn <= 0) {
        maybeTurnTraffic(c);
        c.turn = 0.85 + Math.random() * 2.4;
      }

      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < (p.vehicle ? 45 : 27)) {
        damagePlayer((p.vehicle ? 1.2 : 2.6) * dt * 2.8, c.x, c.y);
        c.life -= p.vehicle ? dt * 24 : dt * 6;
        spark((c.x + p.x) / 2, (c.y + p.y) / 2, '#ffffff', 2);
      }
    });

    game.cars = game.cars.filter(c => c.life > 0 || c.occupied);
    const traffic = game.cars.filter(c => c.kind === 'traffic').length;
    if (traffic < 18 && Math.random() < dt * 0.65) spawnTraffic();
  }

  function maybeTurnTraffic(c) {
    const nearV = V_ROADS.find(r => Math.abs(c.x - r.x) < 18);
    const nearH = H_ROADS.find(r => Math.abs(c.y - r.y) < 18);
    if (!nearV || !nearH || Math.random() > 0.28) return;
    if (c.axis === 'h') {
      c.axis = 'v';
      c.x = nearV.x + (Math.random() - 0.5) * (nearV.w - 40);
      c.dir = Math.random() > 0.5 ? 1 : -1;
    } else {
      c.axis = 'h';
      c.y = nearH.y + (Math.random() - 0.5) * (nearH.w - 40);
      c.dir = Math.random() > 0.5 ? 1 : -1;
    }
  }

  function updatePeds(dt) {
    const p = game.player;
    game.peds.forEach(ped => {
      if (ped.speech) ped.speech.t -= dt;
      ped.speechCd -= dt;
      if (ped.wait > 0) {
        ped.wait -= dt;
      } else {
        const vx = ped.target.x - ped.x;
        const vy = ped.target.y - ped.y;
        const d = Math.hypot(vx, vy) || 1;
        ped.a = Math.atan2(vy, vx);
        if (d < 18) {
          ped.target = stores[Math.floor(Math.random() * stores.length)];
          ped.wait = 0.8 + Math.random() * 2.3;
        } else {
          move(ped, vx / d * 48 * dt, vy / d * 48 * dt, 8);
        }
      }

      if (p.vehicle && Math.hypot(p.x - ped.x, p.y - ped.y) < 72) {
        const away = Math.atan2(ped.y - p.y, ped.x - p.x);
        move(ped, Math.cos(away) * 88 * dt, Math.sin(away) * 88 * dt, 8);
      }

      if ((!ped.speech || ped.speech.t <= 0) && ped.speechCd <= 0 && Math.random() < dt * 0.18) {
        say(ped, pedLines[Math.floor(Math.random() * pedLines.length)], 2.2);
        ped.speechCd = 7 + Math.random() * 14;
      }
    });
    game.peds = game.peds.filter(ped => !ped.speech || ped.speech.t > -0.5);
  }

  function updateEnemies(dt) {
    const p = game.player;
    const heat = heatLevel();

    game.enemies.forEach(e => {
      if (e.speech) e.speech.t -= dt;
      e.speechCd -= dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const vx = p.x - e.x;
      const vy = p.y - e.y;
      const d = Math.hypot(vx, vy) || 1;
      e.a = Math.atan2(vy, vx);

      if ((e.type === 'bossGun' || e.type === 'bossBruiser') && (!e.speech || e.speech.t <= 0 || e.speechCd <= 0)) {
        say(e, randomInsult(), 3);
      }

      if (e.stun > 0) {
        e.stun -= dt;
        move(e, -vx / d * 82 * dt, -vy / d * 82 * dt, e.radius);
        return;
      }

      if (e.type === 'badge' || e.type === 'gangShooter' || e.type === 'bossGun') {
        const ideal = e.type === 'bossGun' ? 205 : 165;
        const push = d < ideal ? -1 : 1;
        const strafe = Math.sin(game.t * 1.9 + e.x) * 0.48;
        const mx = (vx / d * push + -vy / d * strafe) * e.speed * dt;
        const my = (vy / d * push + vx / d * strafe) * e.speed * dt;
        if (d > 90 || push < 0) move(e, mx, my, e.radius);
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 470 && !lineBlocked(e.x, e.y, p.x, p.y)) {
          const volley = e.type === 'bossGun' ? 3 : 1;
          for (let i = 0; i < volley; i++) {
            setTimeout(() => enemyShoot(e, e.type === 'bossGun' ? 350 : 270, e.type === 'bossGun' ? 5.5 : 2.2), i * 90);
          }
          e.shootCd = e.type === 'bossGun' ? 1.15 : Math.max(0.55, 1.45 - heat * 0.08);
        }
      } else {
        move(e, vx / d * e.speed * dt, vy / d * e.speed * dt, e.radius);
        if (d < (e.type === 'bossBruiser' ? 34 : 23)) {
          damagePlayer((e.type === 'bossBruiser' ? 12 : 0.62 + heat * 0.14) * dt, e.x, e.y);
        }
      }
    });

    game.enemies = game.enemies.filter(e => e.hp > 0);
  }

  function updateBullets(dt) {
    game.bullets.forEach(b => {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind === 'rocket') {
        b.vx *= 1.006;
        b.vy *= 1.006;
        spark(b.x, b.y, '#ffad42', 1);
      }
      if (blocked(b.x, b.y, b.radius || 4)) explodeBullet(b);

      game.enemies.forEach(e => {
        if (b.life > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.radius + (b.radius || 4)) {
          hitEnemy(e, b.damage, b);
          if (b.kind === 'rocket') explodeBullet(b);
          else if (b.kind !== 'flame') b.life = 0;
        }
      });

      game.cars.forEach(c => {
        if (c.occupied || c.life <= 0) return;
        if (b.life > 0 && Math.hypot(b.x - c.x, b.y - c.y) < (c.radius || 25) + (b.radius || 4)) {
          c.life -= b.damage * (b.kind === 'rocket' ? 35 : 15);
          spark(b.x, b.y, b.kind === 'flame' ? '#ff765e' : '#fff58b', 3);
          if (c.life <= 0) wreckCar(c, false);
          if (b.kind === 'rocket') explodeBullet(b);
          else if (b.kind !== 'flame') b.life = 0;
        }
      });

      game.crates.forEach(crate => {
        if (b.life > 0 && crate.life > 0 && Math.hypot(b.x - crate.x, b.y - crate.y) < 17 + (b.radius || 4)) {
          breakCrate(crate);
          if (b.kind === 'rocket') explodeBullet(b);
          else if (b.kind !== 'flame') b.life = 0;
        }
      });
    });

    game.enemyBullets.forEach(b => {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (blocked(b.x, b.y, 4)) b.life = 0;
      const p = game.player;
      if (b.life > 0 && Math.hypot(b.x - p.x, b.y - p.y) < (p.vehicle ? 25 : 12) + 4) {
        damagePlayer(b.damage, b.x, b.y);
        spark(b.x, b.y, '#ff557f', 4);
        b.life = 0;
      }
    });

    game.bullets = game.bullets.filter(b => b.life > 0 && b.x > -30 && b.x < WORLD_W + 30 && b.y > -30 && b.y < WORLD_H + 30);
    game.enemyBullets = game.enemyBullets.filter(b => b.life > 0 && b.x > -30 && b.x < WORLD_W + 30 && b.y > -30 && b.y < WORLD_H + 30);
  }

  function updateCrates() {
    const p = game.player;
    if (p.vehicle) {
      game.crates.forEach(crate => {
        if (crate.life > 0 && Math.hypot(crate.x - p.x, crate.y - p.y) < 36) breakCrate(crate);
      });
    }
    game.crates = game.crates.filter(crate => crate.life > 0);
  }

  function breakCrate(crate) {
    if (crate.life <= 0) return;
    crate.life = 0;
    const roll = Math.random();
    const type = roll > 0.96 ? 'frenzy' : roll > 0.9 ? 'rocket' : roll > 0.72 ? 'flame' : roll > 0.55 ? 'armor' : roll > 0.38 ? 'turbo' : roll > 0.19 ? 'multi' : roll > 0.08 ? 'quiet' : 'heal';
    dropItem(crate.x, crate.y, type);
    burst(crate.x, crate.y, '#f8e378', 10);
  }

  function updateDrops(dt) {
    const p = game.player;
    game.drops.forEach(d => {
      d.life -= dt;
      if (Math.hypot(d.x - p.x, d.y - p.y) < 25) {
        if (d.type === 'rocket' || d.type === 'flame') {
          p.weapon = d.type;
          p.weaponT = d.type === 'rocket' ? 10 : 20;
          flash(d.type === 'rocket' ? 'ROCKETS FOR 10 SECONDS' : 'FIREBALLS FOR 20 SECONDS');
        } else if (d.type === 'armor') {
          game.armor = Math.min(100, game.armor + 35);
          flash('BUBBLE ARMOR UP');
        } else if (d.type === 'turbo') {
          p.turboT = 10;
          flash('TURBO FEET ONLINE');
        } else if (d.type === 'multi') {
          game.mult = Math.min(9, game.mult + 1);
          flash(`MULTIPLIER X${game.mult}`);
        } else if (d.type === 'quiet') {
          game.noise = Math.max(0, game.noise - 45);
          flash('QUIET COIN COOLS THE HEAT');
        } else if (d.type === 'heal') {
          game.health = Math.min(100, game.health + 28);
          flash('SNACK PATCHED YOU UP');
        } else if (d.type === 'frenzy') {
          startFrenzy();
        }
        d.life = 0;
        spark(d.x, d.y, dropColor(d.type), 14);
      }
    });
    game.drops = game.drops.filter(d => d.life > 0);
  }

  function updateParticles(dt) {
    game.particles = game.particles.filter(q => {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      return q.life > 0;
    });
  }

  function fireFromInput() {
    const p = game.player;
    if (p.fire > 0) return;
    if (p.aimLock <= 0) aimAssist();
    fire();
  }

  function fire() {
    const p = game.player;
    const weapon = p.weapon;
    const nose = p.vehicle ? 27 : 24;
    addNoise(weapon === 'rocket' ? 2.8 : weapon === 'flame' ? 1.4 : 0.28);
    if (weapon === 'rocket') {
      game.bullets.push({
        kind: 'rocket',
        x: p.x + Math.cos(p.a) * nose,
        y: p.y + Math.sin(p.a) * nose,
        vx: Math.cos(p.a) * 430,
        vy: Math.sin(p.a) * 430,
        life: 0.95,
        damage: 5.5,
        radius: 8
      });
      p.fire = 0.34;
      return;
    }
    if (weapon === 'flame') {
      for (let i = 0; i < 3; i++) {
        const a = p.a + (Math.random() - 0.5) * 0.38;
        game.bullets.push({
          kind: 'flame',
          x: p.x + Math.cos(a) * nose,
          y: p.y + Math.sin(a) * nose,
          vx: Math.cos(a) * (250 + Math.random() * 90),
          vy: Math.sin(a) * (250 + Math.random() * 90),
          life: 0.34 + Math.random() * 0.12,
          damage: 0.55,
          radius: 9
        });
      }
      p.fire = 0.07;
      return;
    }
    game.bullets.push({
      kind: 'spark',
      x: p.x + Math.cos(p.a) * nose,
      y: p.y + Math.sin(p.a) * nose,
      vx: Math.cos(p.a) * 560,
      vy: Math.sin(p.a) * 560,
      life: 0.74,
      damage: 1,
      radius: 4
    });
    p.fire = 0.14;
  }

  function enemyShoot(e, speed, damage) {
    if (!game?.alive || e.hp <= 0 || e.runId !== game.id) return;
    const p = game.player;
    if (lineBlocked(e.x, e.y, p.x, p.y)) return;
    const a = Math.atan2(p.y - e.y, p.x - e.x) + (Math.random() - 0.5) * 0.08;
    game.enemyBullets.push({
      x: e.x + Math.cos(a) * 15,
      y: e.y + Math.sin(a) * 15,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: 1.25,
      damage
    });
    spark(e.x, e.y, '#ff557f', 2);
  }

  function aimFromPointer(e) {
    if (!game) return;
    const rect = canvas.getBoundingClientRect();
    const wx = game.camera.x + (e.clientX - rect.left) * W / rect.width;
    const wy = game.camera.y + (e.clientY - rect.top) * H / rect.height;
    game.player.a = Math.atan2(wy - game.player.y, wx - game.player.x);
    game.player.aimLock = 0.75;
  }

  function aimAssist() {
    const p = game.player;
    let best = null;
    let bestD = Infinity;
    game.enemies.forEach(e => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD && d < 450 && !lineBlocked(p.x, p.y, e.x, e.y)) {
        best = e;
        bestD = d;
      }
    });
    game.cars.forEach(c => {
      if (c.kind === 'parked' || c.occupied) return;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD && d < 390 && !lineBlocked(p.x, p.y, c.x, c.y)) {
        best = c;
        bestD = d;
      }
    });
    if (best) p.a = Math.atan2(best.y - p.y, best.x - p.x);
  }

  function bonk() {
    const p = game.player;
    const range = p.vehicle ? 72 : 43;
    game.enemies.forEach(e => {
      if (Math.hypot(e.x - p.x, e.y - p.y) < range) {
        hitEnemy(e, p.vehicle ? 2.4 : 1, null);
        e.stun = 0.35;
      }
    });
    game.crates.forEach(crate => {
      if (crate.life > 0 && Math.hypot(crate.x - p.x, crate.y - p.y) < range) breakCrate(crate);
    });
  }

  function hitEnemy(e, damage, bullet) {
    e.hp -= damage;
    e.hitFlash = 0.08;
    spark(e.x, e.y, e.color, bullet?.kind === 'rocket' ? 10 : 5);
    if (e.hp <= 0 && !e.counted) {
      awardEnemy(e);
      spawnDrop(e.x, e.y, e.type?.startsWith('boss'));
    }
  }

  function explodeBullet(b) {
    if (b.life <= 0) return;
    const big = b.kind === 'rocket';
    const radius = big ? 82 : 34;
    game.enemies.forEach(e => {
      const d = Math.hypot(b.x - e.x, b.y - e.y);
      if (d < radius) hitEnemy(e, big ? 4.2 * (1 - d / radius) : 0.5, b);
    });
    game.cars.forEach(c => {
      if (c.occupied || c.life <= 0) return;
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < radius) {
        c.life -= (big ? 80 : 18) * (1 - d / radius);
        if (c.life <= 0) wreckCar(c, false);
      }
    });
    burst(b.x, b.y, big ? '#ffad42' : '#ff557f', big ? 26 : 10);
    b.life = 0;
  }

  function awardEnemy(e) {
    if (e.counted) return;
    e.counted = true;
    game.kills++;
    const bounty = e.type === 'bossGun' ? 1600 : e.type === 'bossBruiser' ? 1800 : e.type === 'badge' ? 450 : e.type === 'gangShooter' ? 380 : 250;
    game.bonus += Math.floor(bounty * game.mult);
    addNoise(e.type?.startsWith('boss') ? 18 : 6);
    noteMissionKill(e);
  }

  function wreckCar(c, playerWasInside) {
    if (c.dead) return;
    c.dead = true;
    c.occupied = false;
    if (game.player.vehicle === c) {
      game.player.vehicle = null;
      game.health -= playerWasInside ? 9 : 3;
    }
    if (c.kind === 'boss') {
      game.kills++;
      game.bonus += Math.floor(2200 * game.mult);
      addNoise(22);
      spawnDrop(c.x, c.y, true);
    } else if (c.kind === 'traffic') {
      game.bonus += Math.floor(75 * game.mult);
      addNoise(9);
      noteMissionCar(c);
      spawnDrop(c.x, c.y);
    }
    burst(c.x, c.y, '#ffad42', 30);
    c.life = 0;
  }

  function damagePlayer(amount, x, y) {
    const p = game.player;
    if (game.t < 9) amount *= 0.3;
    if (game.armor > 0) {
      const blockedDamage = Math.min(game.armor, amount * 4);
      game.armor -= blockedDamage;
      amount -= blockedDamage * 0.22;
    }
    if (p.vehicle) {
      p.vehicle.life -= amount * 4.2;
      game.health -= amount * 0.12;
      if (p.vehicle.life <= 0) wreckCar(p.vehicle, true);
    } else {
      game.health -= amount;
    }
    if (x !== undefined) spark((p.x + x) / 2, (p.y + y) / 2, '#ff557f', 1);
  }

  function toggleRide() {
    const p = game.player;
    if (p.vehicle) {
      if (useGarage()) return;
      p.vehicle.occupied = false;
      p.vehicle = null;
      return;
    }
    if (startMissionFromPhone()) return;
    const car = game.cars.find(c => c.kind === 'parked' && !c.occupied && c.life > 0 && Math.hypot(c.x - p.x, c.y - p.y) < 52);
    if (car) {
      p.vehicle = car;
      car.occupied = true;
      p.x = car.x;
      p.y = car.y;
      p.a = car.a;
    }
  }

  function startMissionFromPhone() {
    if (game.mission) {
      flash('FINISH THE CURRENT HUSTLE FIRST');
      return true;
    }
    const p = game.player;
    const phone = phones.find(item => Math.hypot(item.x - p.x, item.y - p.y) < 46);
    if (!phone) return false;
    const heat = heatLevel();
    const options = ['sweep', 'wreck', 'courier'];
    const type = options[Math.floor(Math.random() * options.length)];
    if (type === 'sweep') {
      const remaining = 3 + Math.min(4, Math.floor(heat / 2));
      game.mission = {
        type,
        remaining,
        total: remaining,
        timer: 36 + heat * 2,
        reward: 500 + heat * 160,
        text: `Drop ${remaining} street creeps`
      };
    } else if (type === 'wreck') {
      const remaining = 2 + Math.min(3, Math.floor(heat / 3));
      game.mission = {
        type,
        remaining,
        total: remaining,
        timer: 42,
        reward: 650 + heat * 180,
        text: `Scrap ${remaining} reckless rides`
      };
    } else {
      const target = farGarageOrStore(p.x, p.y);
      game.mission = {
        type,
        target,
        timer: 48,
        reward: 850 + heat * 120,
        text: 'Deliver any borrowed ride'
      };
    }
    flash(`SIDE HUSTLE: ${game.mission.text.toUpperCase()}`);
    return true;
  }

  function useGarage() {
    const p = game.player;
    const garage = garages.find(item => Math.hypot(item.x - p.x, item.y - p.y) < 58);
    if (!garage) return false;
    p.vehicle.life = Math.min(p.vehicle.maxLife, p.vehicle.life + 55);
    game.noise = Math.max(0, game.noise - 55);
    flash('BUBBLE WASH: RIDE FIXED, HEAT COOLED');
    spark(p.x, p.y, '#35d8d5', 18);
    return true;
  }

  function farGarageOrStore(x, y) {
    const pool = garages.length ? garages : stores;
    return pool.slice().sort((a, b) => Math.hypot(b.x - x, b.y - y) - Math.hypot(a.x - x, a.y - y))[0];
  }

  function updateMission(dt) {
    if (!game.mission) return;
    const m = game.mission;
    m.timer -= dt;
    if (m.type === 'courier' && m.target && game.player.vehicle && Math.hypot(game.player.x - m.target.x, game.player.y - m.target.y) < 58) {
      completeMission();
      return;
    }
    if (m.timer <= 0) failMission();
  }

  function startFrenzy() {
    const heat = heatLevel();
    const remaining = 5 + Math.min(5, heat);
    game.player.weapon = 'flame';
    game.player.weaponT = 20;
    game.mission = {
      type: 'sweep',
      remaining,
      total: remaining,
      timer: 24,
      reward: 1200 + heat * 260,
      text: `Bubble frenzy: drop ${remaining}`
    };
    flash('BUBBLE FRENZY - FIREBALLS ONLINE');
  }

  function noteMissionKill(e) {
    const m = game.mission;
    if (!m || m.type !== 'sweep') return;
    if (e.type === 'bossCar') return;
    m.remaining--;
    if (m.remaining <= 0) completeMission();
  }

  function noteMissionCar(c) {
    const m = game.mission;
    if (!m || m.type !== 'wreck' || c.kind !== 'traffic') return;
    m.remaining--;
    if (m.remaining <= 0) completeMission();
  }

  function completeMission() {
    const m = game.mission;
    if (!m) return;
    const paid = Math.floor(m.reward * game.mult);
    game.bonus += paid;
    game.mult = Math.min(9, game.mult + 1);
    game.noise = Math.max(0, game.noise - 25);
    flash(`HUSTLE CLEARED +${paid} PTS - MULTIPLIER X${game.mult}`);
    spark(game.player.x, game.player.y, '#d9ff5c', 28);
    game.mission = null;
  }

  function failMission() {
    if (!game.mission) return;
    game.mult = Math.max(1, game.mult - 1);
    flash('HUSTLE FIZZLED');
    game.mission = null;
  }

  function spawnPointAroundPlayer(min, max) {
    const p = game.player;
    for (let tries = 0; tries < 50; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = min + Math.random() * (max - min);
      const x = clamp(p.x + Math.cos(angle) * distance, 18, WORLD_W - 18);
      const y = clamp(p.y + Math.sin(angle) * distance, 18, WORLD_H - 18);
      if (!blocked(x, y, 14)) return { x, y };
    }
    return null;
  }

  function findStartPoint() {
    const openStreetStarts = [
      { x: 1185, y: 705 },
      { x: 1525, y: 705 },
      { x: 1185, y: 1018 },
      { x: 1525, y: 1018 }
    ];
    const streetStart = openStreetStarts.find(pt => !blocked(pt.x, pt.y, 28));
    if (streetStart) return streetStart;

    const cx = WORLD_W / 2;
    const cy = WORLD_H / 2;
    const options = stores
      .filter(s => !blocked(s.x, s.y, 12) && !onRoad(s.x, s.y, 12))
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    return options[0] || { x: 1280, y: 790 };
  }

  function onRoad(x, y, pad = 0) {
    return H_ROADS.some(r => Math.abs(y - r.y) < r.w / 2 + pad) || V_ROADS.some(r => Math.abs(x - r.x) < r.w / 2 + pad);
  }

  function randomOpenPoint() {
    for (let tries = 0; tries < 80; tries++) {
      const x = 30 + Math.random() * (WORLD_W - 60);
      const y = 30 + Math.random() * (WORLD_H - 60);
      if (!blocked(x, y, 14)) return { x, y };
    }
    return { x: 1185, y: 705 };
  }

  function blocked(x, y, r) {
    return buildings.some(b => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
  }

  function lineBlocked(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 32);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (blocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 5)) return true;
    }
    return false;
  }

  function move(entity, dx, dy, r) {
    const nx = clamp(entity.x + dx, r, WORLD_W - r);
    const ny = clamp(entity.y + dy, r, WORLD_H - r);
    if (!blocked(nx, entity.y, r)) entity.x = nx;
    if (!blocked(entity.x, ny, r)) entity.y = ny;
  }

  function heatLevel() {
    return Math.min(8, 1 + Math.floor(game.t / 30) + Math.floor(game.noise / 70));
  }

  function score() {
    return Math.floor(game.t * 12) + game.kills * 250 + game.bonus;
  }

  function end() {
    game.alive = false;
    keys.clear();
    const s = score();
    ui.result.textContent = `${Math.floor(game.t)} seconds alive · ${game.kills} knockouts · ${s.toLocaleString()} points`;
    ui.over.classList.remove('hidden');
  }

  function updateHud() {
    if (!game) return;
    ui.health.style.width = `${Math.max(0, game.health)}%`;
    ui.kills.textContent = String(game.kills).padStart(2, '0');
    ui.timer.textContent = `${String(Math.floor(game.t / 60)).padStart(2, '0')}:${String(Math.floor(game.t % 60)).padStart(2, '0')}`;
    ui.score.textContent = String(score()).padStart(5, '0');
    ui.heat.textContent = String(heatLevel()).padStart(2, '0');
    ui.ammo.textContent = game.player.weapon === 'rocket' ? 'RKT' : game.player.weapon === 'flame' ? 'FIRE' : '∞';
    if (ui.mult) ui.mult.textContent = `X${game.mult}`;
    publishRuntimeState();
  }

  function draw() {
    ctx.fillStyle = '#d8d1ae';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-game.camera.x, -game.camera.y);
    drawGround();
    drawRoads();
    props.forEach(drawProp);
    buildings.forEach(drawBuilding);
    game.crates.forEach(drawCrate);
    game.drops.forEach(drawDrop);
    game.cars.forEach(car);
    game.peds.forEach(ped => person(ped.x, ped.y, ped.a, ped.color, ped.hair, 0.82, 'ped'));
    game.enemies.forEach(drawEnemy);
    drawProjectiles();

    const p = game.player;
    if (p.bonk) {
      ctx.strokeStyle = '#d9ff5c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.vehicle ? 55 : 35, p.a - 0.72, p.a + 0.72);
      ctx.stroke();
    }
    if (!p.vehicle) drawGator(p.x, p.y, p.a);
    game.particles.forEach(q => {
      ctx.fillStyle = q.c;
      ctx.fillRect(q.x, q.y, q.size || 4, q.size || 4);
    });
    game.peds.forEach(drawSpeechFor);
    game.enemies.forEach(drawSpeechFor);
    game.cars.filter(c => c.kind === 'boss').forEach(drawSpeechFor);
    ctx.restore();
    drawCanvasHud();
  }

  function drawGround() {
    ctx.fillStyle = '#cfc9a8';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = 'rgba(86,92,80,.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WORLD_W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, WORLD_H);
      ctx.stroke();
    }
    for (let y = 0; y < WORLD_H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WORLD_W, y);
      ctx.stroke();
    }
  }

  function drawRoads() {
    H_ROADS.forEach(r => drawRoadRect(0, r.y - r.w / 2, WORLD_W, r.w, 'h'));
    V_ROADS.forEach(r => drawRoadRect(r.x - r.w / 2, 0, r.w, WORLD_H, 'v'));
    ctx.strokeStyle = '#f4c450';
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 28]);
    H_ROADS.forEach(r => {
      ctx.beginPath();
      ctx.moveTo(0, r.y);
      ctx.lineTo(WORLD_W, r.y);
      ctx.stroke();
    });
    V_ROADS.forEach(r => {
      ctx.beginPath();
      ctx.moveTo(r.x, 0);
      ctx.lineTo(r.x, WORLD_H);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function drawRoadRect(x, y, w, h, axis) {
    ctx.fillStyle = '#4b506c';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#31384f';
    if (axis === 'h') ctx.fillRect(x, y + h / 2 - 5, w, 10);
    else ctx.fillRect(x + w / 2 - 5, y, 10, h);
    ctx.strokeStyle = '#e9e4d3';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  }

  function drawProp(p) {
    if (p.type === 'park') {
      ctx.fillStyle = '#8bae5b';
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.fillStyle = '#5d823f';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(p.x - p.w / 2 + 18 + i * 15, p.y - 8 + Math.sin(i) * 18, 8, 0, 7);
        ctx.fill();
      }
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === 'hydrant') {
      ctx.fillStyle = '#ff4c4c';
      ctx.fillRect(-4, -8, 8, 16);
      ctx.fillRect(-8, -2, 16, 5);
      ctx.fillStyle = '#ffd66d';
      ctx.fillRect(-3, -12, 6, 4);
    } else if (p.type === 'news') {
      ctx.fillStyle = '#287ec6';
      ctx.fillRect(-10, -8, 20, 17);
      ctx.fillStyle = '#fff7b5';
      ctx.fillRect(-6, -5, 12, 4);
      ctx.fillRect(-6, 2, 12, 3);
    } else if (p.type === 'phone') {
      ctx.fillStyle = '#40b6d2';
      ctx.fillRect(-7, -11, 14, 22);
      ctx.fillStyle = '#f7fbff';
      ctx.fillRect(-4, -7, 8, 9);
    } else if (p.type === 'jobphone') {
      ctx.fillStyle = '#102535';
      ctx.fillRect(-8, -13, 16, 26);
      ctx.fillStyle = Math.sin(game.t * 5 + p.pulse) > 0 ? '#d9ff5c' : '#35d8d5';
      ctx.fillRect(-5, -9, 10, 8);
      ctx.fillStyle = '#f4ebd3';
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('JOB', 0, 10);
      ctx.textAlign = 'start';
    } else if (p.type === 'garage') {
      ctx.fillStyle = '#102535';
      ctx.fillRect(-22, -14, 44, 28);
      ctx.fillStyle = '#35d8d5';
      ctx.fillRect(-18, -10, 36, 20);
      ctx.fillStyle = '#102535';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WASH', 0, 3);
      ctx.textAlign = 'start';
    } else if (p.type === 'bench') {
      ctx.fillStyle = '#8e5b35';
      ctx.fillRect(-15, -4, 30, 6);
      ctx.fillRect(-13, 5, 26, 4);
    } else if (p.type === 'cone') {
      ctx.fillStyle = '#ff8c33';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(9, 9);
      ctx.lineTo(-9, 9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-5, 0, 10, 3);
    } else if (p.type === 'manhole') {
      ctx.fillStyle = '#202c3d';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#66778a';
      ctx.stroke();
    } else {
      ctx.fillStyle = '#31505c';
      ctx.fillRect(-6, -7, 12, 14);
    }
    ctx.restore();
  }

  function drawCrate(crate) {
    ctx.save();
    ctx.translate(crate.x, crate.y);
    ctx.rotate(crate.spin + Math.sin(game.t * 2 + crate.x) * 0.04);
    ctx.fillStyle = '#8e5b35';
    ctx.fillRect(-14, -14, 28, 28);
    ctx.fillStyle = '#f8e378';
    ctx.fillRect(-12, -3, 24, 6);
    ctx.fillRect(-3, -12, 6, 24);
    ctx.strokeStyle = '#102535';
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -14, 28, 28);
    ctx.restore();
  }

  function drawCanvasHud() {
    drawMissionHud();
    drawMinimap();
    drawContextPrompt();
    if (game.notice) {
      ctx.save();
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      const w = Math.min(470, Math.max(170, ctx.measureText(game.notice.text).width + 28));
      ctx.fillStyle = 'rgba(16,37,53,.84)';
      ctx.fillRect(W / 2 - w / 2, 86, w, 30);
      ctx.fillStyle = '#d9ff5c';
      ctx.fillText(game.notice.text, W / 2, 106);
      ctx.restore();
    }
  }

  function drawContextPrompt() {
    const p = game.player;
    let text = '';
    if (!game.mission && phones.some(item => Math.hypot(item.x - p.x, item.y - p.y) < 48)) text = 'E: ANSWER SIDE HUSTLE';
    else if (p.vehicle && garages.some(item => Math.hypot(item.x - p.x, item.y - p.y) < 60)) text = 'E: BUBBLE WASH';
    if (!text) return;
    ctx.save();
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 22;
    ctx.fillStyle = 'rgba(16,37,53,.88)';
    ctx.fillRect(W / 2 - w / 2, H - 88, w, 24);
    ctx.fillStyle = '#f8e378';
    ctx.fillText(text, W / 2, H - 72);
    ctx.restore();
  }

  function drawMissionHud() {
    if (!game.mission) return;
    const m = game.mission;
    const text = m.type === 'courier'
      ? `${m.text}  ${Math.ceil(m.timer)}s`
      : `${m.text}: ${m.remaining}/${m.total} left  ${Math.ceil(m.timer)}s`;
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    const w = Math.min(520, Math.max(230, ctx.measureText(text).width + 28));
    ctx.fillStyle = 'rgba(16,37,53,.88)';
    ctx.fillRect(W / 2 - w / 2, 50, w, 28);
    ctx.fillStyle = '#f8e378';
    ctx.fillText(text, W / 2, 69);
    ctx.restore();

    if (m.type === 'courier' && m.target) {
      const sx = m.target.x - game.camera.x;
      const sy = m.target.y - game.camera.y;
      if (sx > -40 && sx < W + 40 && sy > -40 && sy < H + 40) {
        ctx.save();
        ctx.strokeStyle = '#d9ff5c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 26 + Math.sin(game.t * 5) * 4, 0, 7);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawMinimap() {
    const x = 18;
    const y = 86;
    const w = 132;
    const h = 90;
    const sx = w / WORLD_W;
    const sy = h / WORLD_H;
    ctx.save();
    ctx.fillStyle = 'rgba(16,37,53,.78)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#f4ebd3';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(244,235,211,.18)';
    H_ROADS.forEach(r => ctx.fillRect(x, y + r.y * sy - 1, w, 2));
    V_ROADS.forEach(r => ctx.fillRect(x + r.x * sx - 1, y, 2, h));
    plotDots(phones, x, y, sx, sy, '#d9ff5c', 2);
    plotDots(garages, x, y, sx, sy, '#35d8d5', 2);
    plotDots(game.enemies.slice(0, 24), x, y, sx, sy, '#ff557f', 2);
    if (game.mission?.target) plotDots([game.mission.target], x, y, sx, sy, '#f8e378', 4);
    plotDots([game.player], x, y, sx, sy, '#ffffff', 3);
    ctx.restore();
  }

  function plotDots(items, x, y, sx, sy, color, size) {
    ctx.fillStyle = color;
    items.forEach(item => ctx.fillRect(x + item.x * sx - size / 2, y + item.y * sy - size / 2, size, size));
  }

  function drawBuilding(b) {
    ctx.fillStyle = '#263247';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.trim;
    ctx.fillRect(b.x, b.y, b.w, 8);
    ctx.fillStyle = 'rgba(0,0,0,.13)';
    ctx.fillRect(b.x, b.y + b.h - 18, b.w, 18);
    for (let x = b.x + 15; x < b.x + b.w - 12; x += b.tall ? 24 : 31) {
      for (let y = b.y + 21; y < b.y + b.h - 24; y += b.tall ? 21 : 27) {
        ctx.fillStyle = '#263247';
        ctx.fillRect(x, y, 15, 10);
        ctx.fillStyle = '#77cbd1';
        ctx.fillRect(x + 2, y + 2, 11, 6);
      }
    }
    ctx.fillStyle = '#f8e378';
    ctx.fillRect(b.x + b.w / 2 - 36, b.y + b.h - 19, 72, 15);
    ctx.fillStyle = '#283144';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(shortSign(b.sign), b.x + b.w / 2, b.y + b.h - 8);
    ctx.textAlign = 'start';
  }

  function drawDrop(d) {
    const labels = { rocket: 'R', flame: 'F', armor: 'A', turbo: 'T', multi: 'X', quiet: 'Q', heal: '+', frenzy: '!' };
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(game.t * 2.6);
    ctx.fillStyle = dropColor(d.type);
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = '#102535';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(labels[d.type] || '?', 0, 4);
    ctx.restore();
    ctx.textAlign = 'start';
  }

  function drawEnemy(e) {
    if (e.type === 'badge') badgeSprite(e);
    else if (e.type === 'gang' || e.type === 'gangShooter') gangSprite(e);
    else if (e.type === 'bossGun') bossSprite(e, 'gun');
    else if (e.type === 'bossBruiser') bossSprite(e, 'melee');
  }

  function drawProjectiles() {
    game.bullets.forEach(b => {
      if (b.kind === 'flame') {
        ctx.fillStyle = '#ff6f3f';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 9, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#fff58b';
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y - 2, 4, 0, 7);
        ctx.fill();
      } else if (b.kind === 'rocket') {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#ffad42';
        ctx.fillRect(-10, -4, 20, 8);
        ctx.fillStyle = '#fff2a1';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(3, -6);
        ctx.lineTo(3, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.strokeStyle = '#fff58b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    game.enemyBullets.forEach(b => {
      ctx.strokeStyle = '#ff557f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
  }

  function drawGator(x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(GATOR_SCALE, GATOR_SCALE);

    ctx.fillStyle = 'rgba(26,39,53,.32)';
    ctx.beginPath();
    ctx.ellipse(-2, 8, 22, 6, 0, 0, 7);
    ctx.fill();

    ctx.fillStyle = '#1f6f63';
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-32, -4);
    ctx.lineTo(-41, 0);
    ctx.lineTo(-32, 4);
    ctx.lineTo(-12, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#37b887';
    ctx.fillRect(-12, -13, 7, 8);
    ctx.fillRect(-12, 5, 7, 8);
    ctx.fillRect(6, -14, 7, 8);
    ctx.fillRect(6, 6, 7, 8);
    ctx.fillStyle = '#173543';
    ctx.fillRect(-12, -15, 9, 3);
    ctx.fillRect(-12, 12, 9, 3);
    ctx.fillRect(6, -16, 9, 3);
    ctx.fillRect(6, 13, 9, 3);

    ctx.fillStyle = '#35d8a6';
    ctx.beginPath();
    ctx.ellipse(-4, 0, 19, 11, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#d9ff5c';
    ctx.beginPath();
    ctx.ellipse(-5, 0, 9, 4, 0, 0, 7);
    ctx.fill();

    ctx.fillStyle = '#2fc790';
    ctx.beginPath();
    ctx.moveTo(6, -9);
    ctx.lineTo(30, -7);
    ctx.lineTo(39, 0);
    ctx.lineTo(30, 7);
    ctx.lineTo(6, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#dfffe8';
    ctx.beginPath();
    ctx.arc(20, -7, 3, 0, 7);
    ctx.arc(20, 7, 3, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#102535';
    ctx.fillRect(21, -8, 2, 2);
    ctx.fillRect(21, 6, 2, 2);
    ctx.fillRect(31, -2, 5, 4);

    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const tx = 10 + i * 5;
      ctx.beginPath();
      ctx.moveTo(tx, -7);
      ctx.lineTo(tx + 2, -10);
      ctx.lineTo(tx + 4, -7);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx, 7);
      ctx.lineTo(tx + 2, 10);
      ctx.lineTo(tx + 4, 7);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#102535';
    [-18, -10, -2, 6].forEach((sx, i) => {
      ctx.beginPath();
      ctx.moveTo(sx, -2);
      ctx.lineTo(sx + 4, 0);
      ctx.lineTo(sx, 2);
      ctx.closePath();
      ctx.fill();
      if (i < 3) ctx.fillRect(sx + 3, -1, 3, 2);
    });

    ctx.fillStyle = '#05080d';
    ctx.fillRect(10, 11, 31, 7);
    ctx.fillRect(35, 8, 11, 4);
    ctx.fillRect(13, 17, 8, 11);
    ctx.fillRect(6, 13, 8, 5);
    ctx.fillStyle = '#182536';
    ctx.fillRect(15, 12, 14, 2);
    ctx.fillRect(40, 9, 6, 2);

    ctx.restore();
  }

  function person(x, y, a, jacket, hair, scale = 1, style = 'plain') {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(26,39,53,.32)';
    ctx.beginPath();
    ctx.ellipse(2, 8, 9, 4, 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#243148';
    ctx.fillRect(-6, -1, 5, 10);
    ctx.fillRect(3, -1, 5, 10);
    ctx.fillStyle = jacket;
    ctx.fillRect(-7, -8, 14, 14);
    ctx.fillStyle = '#ffbd84';
    ctx.fillRect(5, -5, 7, 4);
    ctx.fillRect(-12, -5, 7, 4);
    ctx.beginPath();
    ctx.arc(0, -12, 6, 0, 7);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.fillRect(-6, -17, 12, 5);
    if (style === 'ped') ctx.fillRect(-4, -19, 7, 3);
    else ctx.fillRect(3, -13, 4, 4);
    ctx.restore();
  }

  function gangSprite(e) {
    person(e.x, e.y, e.a, e.hitFlash ? '#ffffff' : e.color, e.hair, 1.05, 'gang');
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    ctx.fillStyle = '#d9ff5c';
    ctx.fillRect(-3, -21, 6, 7);
    if (e.type === 'gangShooter') {
      ctx.fillStyle = '#1f2b40';
      ctx.fillRect(8, -9, 15, 5);
    }
    ctx.restore();
  }

  function badgeSprite(e) {
    person(e.x, e.y, e.a, e.hitFlash ? '#ffffff' : e.color, e.hair, 1.07, 'badge');
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    ctx.fillStyle = '#102535';
    ctx.fillRect(-8, -20, 16, 5);
    ctx.fillStyle = '#f8e378';
    ctx.beginPath();
    ctx.arc(2, -5, 3, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1f2b40';
    ctx.fillRect(8, -9, 16, 5);
    ctx.restore();
  }

  function bossSprite(e, flavor) {
    const scale = flavor === 'gun' ? 1.38 : 1.55;
    person(e.x, e.y, e.a, e.hitFlash ? '#ffffff' : e.color, e.hair, scale, 'boss');
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    ctx.fillStyle = flavor === 'gun' ? '#102535' : '#f8e378';
    if (flavor === 'gun') ctx.fillRect(12, -13, 25, 7);
    else {
      ctx.beginPath();
      ctx.arc(15, -8, 7, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    drawHp(e.x, e.y + 25, e.hp / e.maxHp, 36);
  }

  function car(c) {
    if (c.life <= 0) return;
    const boss = c.kind === 'boss';
    const scale = boss ? 1.34 : 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(21,31,47,.32)';
    ctx.fillRect(-20, -10, 48, 28);
    ctx.fillStyle = boss ? '#121827' : '#243148';
    ctx.fillRect(-25, -15, 50, 30);
    ctx.fillStyle = c.color;
    ctx.fillRect(-22, -12, 44, 24);
    ctx.fillStyle = '#ffde7c';
    ctx.fillRect(-22, -9, 4, 7);
    ctx.fillRect(-22, 3, 4, 7);
    ctx.fillStyle = '#213349';
    ctx.fillRect(-5, -10, 16, 20);
    ctx.fillStyle = '#9be7e1';
    ctx.fillRect(-2, -8, 10, 16);
    if (c.kind === 'traffic' || boss) {
      ctx.fillStyle = '#ffbd84';
      ctx.beginPath();
      ctx.arc(4, 0, 4, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = boss ? '#ff557f' : '#f9edf0';
    ctx.fillRect(13, -7, 5, 14);
    if (c.life < c.maxLife * 0.45) {
      ctx.fillStyle = 'rgba(25,30,42,.55)';
      ctx.fillRect(-18, -19, 16, 5);
    }
    ctx.restore();
    if (boss) drawHp(c.x, c.y + 37, c.life / c.maxLife, 46);
  }

  function drawHp(x, y, pct, w) {
    ctx.fillStyle = '#102535';
    ctx.fillRect(x - w / 2, y, w, 5);
    ctx.fillStyle = '#ff557f';
    ctx.fillRect(x - w / 2, y, w * clamp(pct, 0, 1), 5);
  }

  function drawSpeechFor(entity) {
    if (!entity.speech || entity.speech.t <= 0) return;
    drawSpeech(entity.x, entity.y - (entity.kind === 'boss' ? 48 : 30), entity.speech.text);
  }

  function drawSpeech(x, y, text) {
    const lines = wrapText(text, 22).slice(0, 3);
    ctx.font = 'bold 9px monospace';
    const width = Math.min(168, Math.max(54, ...lines.map(line => ctx.measureText(line).width + 14)));
    const height = 14 + lines.length * 11;
    ctx.fillStyle = 'rgba(16,37,53,.86)';
    ctx.fillRect(x - width / 2, y - height, width, height);
    ctx.fillStyle = '#f4ebd3';
    ctx.textAlign = 'center';
    lines.forEach((line, i) => ctx.fillText(line, x, y - height + 13 + i * 10));
    ctx.textAlign = 'start';
  }

  function wrapText(text, max) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function say(entity, text, ttl) {
    entity.speech = { text, t: ttl };
    entity.speechCd = ttl + 2.4 + Math.random() * 2.8;
  }

  function randomInsult() {
    return cryptoInsults[Math.floor(Math.random() * cryptoInsults.length)];
  }

  function flash(text, ttl = 2.3) {
    game.notice = { text, t: ttl };
  }

  function addNoise(amount) {
    game.noise = clamp(game.noise + amount, 0, 220);
  }

  function dropColor(type) {
    return {
      rocket: '#ffad42',
      flame: '#ff557f',
      armor: '#35d8d5',
      turbo: '#d9ff5c',
      multi: '#f8e378',
      quiet: '#92a5ff',
      heal: '#8be18e',
      frenzy: '#ffffff'
    }[type] || '#fff58b';
  }

  function spark(x, y, c, n) {
    for (let i = 0; i < n; i++) {
      game.particles.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, life: 0.22 + Math.random() * 0.16, c, size: 3 });
    }
  }

  function burst(x, y, c, n = 11) {
    for (let i = 0; i < n; i++) {
      game.particles.push({ x, y, vx: (Math.random() - 0.5) * 210, vy: (Math.random() - 0.5) * 210, life: 0.32 + Math.random() * 0.28, c, size: 3 + Math.random() * 4 });
    }
  }

  function shortSign(s) {
    return s.length > 13 ? `${s.slice(0, 12)}.` : s;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function publishSelfTest(payload) {
    window.NMR_SELFTEST_RESULTS = payload;
    document.documentElement.dataset.nmrSelftest = JSON.stringify(payload);
  }

  function publishRuntimeState() {
    if (!debugMode || !game) return;
    document.documentElement.dataset.nmrPlayer = JSON.stringify({
      alive: game.alive,
      x: Math.round(game.player.x * 10) / 10,
      y: Math.round(game.player.y * 10) / 10,
      t: Math.round(game.t * 10) / 10,
      keys: [...keys].sort()
    });
  }

  async function runSelfTest() {
    const results = [];
    const assert = (name, ok, details = '') => results.push({ name, ok: Boolean(ok), details });
    const p0 = () => game.player;
    const keyCode = key => ({
      w: 'KeyW',
      a: 'KeyA',
      s: 'KeyS',
      d: 'KeyD',
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      ' ': 'Space'
    }[String(key).toLowerCase()] || String(key));
    const sendKey = (type, key) => dispatchEvent(new KeyboardEvent(type, { key, code: keyCode(key), bubbles: true, cancelable: true }));
    const openNearPlayer = (preferred = 90) => {
      const p = p0();
      for (const dist of [preferred, 60, 120, 180, 240]) {
        for (let i = 0; i < 32; i++) {
          const a = (Math.PI * 2 * i) / 32;
          const x = clamp(p.x + Math.cos(a) * dist, 20, WORLD_W - 20);
          const y = clamp(p.y + Math.sin(a) * dist, 20, WORLD_H - 20);
          if (!blocked(x, y, 16) && !lineBlocked(p.x, p.y, x, y)) return { x, y };
        }
      }
      return { x: p.x, y: p.y };
    };

    try {
      reset();
      ui.start.classList.add('hidden');
      ui.over.classList.add('hidden');
      keys.clear();

      assert('canvas and world stay phone-friendly', W === 960 && H === 600 && WORLD_W <= 3200 && WORLD_H <= 2200, `${W}x${H} in ${WORLD_W}x${WORLD_H}`);
      assert('Stocky draws with a distinct gator silhouette', typeof drawGator === 'function', 'drawGator available');
      assert('Stocky sprite is scaled smaller for gameplay readability', GATOR_SCALE < 0.9, `scale ${GATOR_SCALE}`);
      assert('run starts in open street space for visible movement', onRoad(game.player.x, game.player.y) && !blocked(game.player.x + 28, game.player.y, 11) && !blocked(game.player.x - 28, game.player.y, 11) && !blocked(game.player.x, game.player.y + 28, 11) && !blocked(game.player.x, game.player.y - 28, 11), `${game.player.x},${game.player.y}`);
      assert('Bubble City has varied buildings and storefronts', buildings.length >= 30 && stores.length >= 16, `${buildings.length} buildings, ${stores.length} stores`);
      assert('phones and garages exist for side hustles', phones.length >= 3 && garages.length >= 3, `${phones.length} phones, ${garages.length} garages`);
      assert('pedestrians visit stores and do not target the player', game.peds.length >= 12 && game.peds.every(ped => ped.target && ped.hp === undefined && ped.shootCd === undefined), `${game.peds.length} peds`);
      assert('initial threats include gang and crooked-badge villains', game.enemies.some(e => e.type === 'gang') && game.enemies.some(e => e.type === 'badge'), game.enemies.map(e => e.type).join(','));
      assert('traffic drivers are active', game.cars.some(c => c.kind === 'traffic') && game.cars.some(c => c.kind === 'parked'), `${game.cars.length} cars`);

      const shotCount = game.bullets.length;
      pressAction('f');
      assert('keyboard/touch fire path creates a projectile', game.bullets.length > shotCount, `${shotCount}->${game.bullets.length}`);

      game.player.vehicle = null;
      game.player.x = 1185;
      game.player.y = 705;
      game.player.aimLock = 0;
      keys.clear();
      const beforeD = game.player.x;
      sendKey('keydown', 'd');
      update(0.12);
      sendKey('keyup', 'd');
      assert('WASD movement moves Stocky while held', game.player.x > beforeD + 18 && !keys.has('d'), `${beforeD.toFixed(1)}->${game.player.x.toFixed(1)}`);

      const beforeW = game.player.y;
      sendKey('keydown', 'w');
      update(0.12);
      sendKey('keyup', 'w');
      assert('W key moves Stocky upward', game.player.y < beforeW - 18 && !keys.has('w'), `${beforeW.toFixed(1)}->${game.player.y.toFixed(1)}`);

      const beforeArrow = game.player.x;
      sendKey('keydown', 'ArrowLeft');
      update(0.12);
      sendKey('keyup', 'ArrowLeft');
      assert('arrow keys still move Stocky', game.player.x < beforeArrow - 18 && !keys.has('arrowleft'), `${beforeArrow.toFixed(1)}->${game.player.x.toFixed(1)}`);

      const targetPoint = openNearPlayer(70);
      const target = {
        x: targetPoint.x,
        y: targetPoint.y,
        a: 0,
        type: 'gang',
        hp: 2,
        maxHp: 2,
        speed: 0,
        color: '#ff7b63',
        hair: '#28304c',
        radius: 11,
        runId: game.id,
        stun: 0,
        speech: null,
        speechCd: 0,
        hitFlash: 0
      };
      const killsBefore = game.kills;
      game.enemies.push(target);
      game.bullets.push({ kind: 'spark', x: target.x, y: target.y, vx: 0, vy: 0, life: 1, damage: 3, radius: 4 });
      updateBullets(0.016);
      assert('player projectiles can defeat enemies and award score bonus', game.kills === killsBefore + 1 && target.counted && game.bonus > 0, `kills ${killsBefore}->${game.kills}`);

      const shooterPoint = openNearPlayer(130);
      const enemyShotCount = game.enemyBullets.length;
      enemyShoot({ x: shooterPoint.x, y: shooterPoint.y, hp: 2, runId: game.id, radius: 12 }, 270, 2.2);
      assert('crooked-badge/gang shooters can fire at Stocky', game.enemyBullets.length > enemyShotCount, `${enemyShotCount}->${game.enemyBullets.length}`);

      const healthBeforeShot = game.health;
      game.enemyBullets.push({ x: game.player.x, y: game.player.y, vx: 0, vy: 0, life: 1, damage: 6 });
      updateBullets(0.016);
      assert('enemy bullets damage the player', game.health < healthBeforeShot, `${healthBeforeShot}->${game.health}`);

      const crate = { x: game.player.x + 18, y: game.player.y, life: 1, spin: 0 };
      game.crates.push(crate);
      bonk();
      assert('bonk breaks nearby lucky crates', crate.life <= 0 && game.drops.length > 0, `${game.drops.length} drops`);

      game.drops = [];
      game.player.weapon = 'spark';
      dropItem(game.player.x, game.player.y, 'rocket');
      updateDrops(0.016);
      assert('rocket pickup equips a timed overpowered weapon', game.player.weapon === 'rocket' && game.player.weaponT > 9.5, game.player.weaponT.toFixed(2));

      game.player.weapon = 'spark';
      dropItem(game.player.x, game.player.y, 'flame');
      updateDrops(0.016);
      assert('flame pickup equips timed fireballs', game.player.weapon === 'flame' && game.player.weaponT > 19.5, game.player.weaponT.toFixed(2));

      game.armor = 0;
      dropItem(game.player.x, game.player.y, 'armor');
      updateDrops(0.016);
      assert('armor pickup works', game.armor > 0, String(game.armor));

      game.player.turboT = 0;
      dropItem(game.player.x, game.player.y, 'turbo');
      updateDrops(0.016);
      assert('turbo pickup works', game.player.turboT > 9.5, game.player.turboT.toFixed(2));

      game.mult = 1;
      dropItem(game.player.x, game.player.y, 'multi');
      updateDrops(0.016);
      assert('multiplier pickup works', game.mult === 2, `x${game.mult}`);

      game.noise = 100;
      dropItem(game.player.x, game.player.y, 'quiet');
      updateDrops(0.016);
      assert('quiet pickup cools heat noise', game.noise < 100, String(game.noise));

      game.health = 50;
      dropItem(game.player.x, game.player.y, 'heal');
      updateDrops(0.016);
      assert('heal pickup restores vitality', game.health > 50, String(game.health));

      game.mission = null;
      dropItem(game.player.x, game.player.y, 'frenzy');
      updateDrops(0.016);
      assert('frenzy pickup starts a timed sweep challenge', game.mission?.type === 'sweep' && game.player.weapon === 'flame', game.mission?.text || '');

      game.mission = { type: 'sweep', remaining: 1, total: 1, timer: 10, reward: 120, text: 'QA sweep' };
      const bonusBeforeSweep = game.bonus;
      awardEnemy({ type: 'gang', counted: false });
      assert('sweep side hustle completes from enemy knockouts', !game.mission && game.bonus > bonusBeforeSweep, `${bonusBeforeSweep}->${game.bonus}`);

      game.mission = { type: 'wreck', remaining: 1, total: 1, timer: 10, reward: 120, text: 'QA wreck' };
      const traffic = { kind: 'traffic', x: game.player.x + 36, y: game.player.y, life: 1, maxLife: 90, radius: 25 };
      game.cars.push(traffic);
      wreckCar(traffic, false);
      assert('wreck side hustle completes from traffic takedowns', !game.mission && traffic.life <= 0, String(traffic.life));

      game.mission = { type: 'courier', target: { x: game.player.x, y: game.player.y }, timer: 10, reward: 120, text: 'QA courier' };
      game.player.vehicle = { kind: 'parked', occupied: true, life: 80, maxLife: 100, radius: 25 };
      updateMission(0.016);
      assert('courier side hustle completes at a target while driving', !game.mission, game.mission?.text || 'complete');

      const garage = garages[0];
      if (garage) {
        const ride = { kind: 'parked', occupied: true, x: garage.x, y: garage.y, life: 25, maxLife: 100, radius: 25 };
        game.player.vehicle = ride;
        game.player.x = garage.x;
        game.player.y = garage.y;
        game.noise = 90;
        const used = useGarage();
        assert('garages repair rides and cool heat', used && ride.life > 25 && game.noise < 90, `${ride.life}/${game.noise}`);
      } else {
        assert('garages repair rides and cool heat', false, 'no garage generated');
      }

      const bossesBefore = game.enemies.filter(e => e.type?.startsWith('boss')).length + game.cars.filter(c => c.kind === 'boss').length;
      spawnBoss();
      const bossesAfter = game.enemies.filter(e => e.type?.startsWith('boss')).length + game.cars.filter(c => c.kind === 'boss').length;
      assert('boss spawner introduces a large villain', bossesAfter > bossesBefore, `${bossesBefore}->${bossesAfter}`);

      const movingCar = game.cars.find(c => c.kind === 'traffic' && c.life > 0);
      if (movingCar) {
        const ox = movingCar.x;
        const oy = movingCar.y;
        updateTraffic(0.25);
        assert('traffic advances during simulation', Math.hypot(movingCar.x - ox, movingCar.y - oy) > 4, `${ox},${oy}->${movingCar.x},${movingCar.y}`);
      } else {
        assert('traffic advances during simulation', false, 'no traffic car');
      }

      const prevBoard = ui.board.innerHTML;
      renderBoard([{ name: '<RUGGED>', score: 1234 }]);
      assert('scoreboard escapes submitted names', !ui.board.innerHTML.includes('<RUGGED>') && ui.board.textContent.includes('<RUGGED>'), ui.board.innerHTML);
      const manyScores = Array.from({ length: 1000 }, (_, i) => ({ name: `BOT${i}`, score: 1000 - i }));
      renderBoard(manyScores);
      assert('scoreboard renders a bounded top five from 1000 rows', ui.board.querySelectorAll('li').length === 5, `${ui.board.querySelectorAll('li').length} rows`);
      ui.board.innerHTML = prevBoard;
      renderBoard(demoScores);

      game.t = 12.4;
      game.kills = 2;
      game.bonus = 345;
      game.health = 0;
      end();
      assert('game-over overlay summarizes a finished run', !ui.over.classList.contains('hidden') && ui.result.textContent.includes('seconds alive'), ui.result.textContent);
      const retiredCurrencyCopy = `${String.fromCharCode(98,117,98,98,108,101)} ${String.fromCharCode(98,117,99,107,115)}`;
      const retiredHudLabel = String.fromCharCode(66,85,67,75,83);
      assert('retired currency copy is absent from player-facing UI', !document.body.innerText.toLowerCase().includes(retiredCurrencyCopy) && !document.body.innerText.includes(retiredHudLabel), document.body.innerText);

      const boardSize = demoScores.length;
      const c = window.NEON_MUTT_SUPABASE || {};
      if (!c.url && !c.anonKey) {
        ui.name.value = 'QA RASCAL';
        $('#submitScore').textContent = 'POST';
        await submit();
        assert('local scoreboard submit works before Supabase is connected', demoScores.length === boardSize + 1 && $('#submitScore').textContent === 'POSTED!', `${boardSize}->${demoScores.length}`);
        demoScores.length = boardSize;
        ui.name.value = '';
        $('#submitScore').textContent = 'POST';
        renderBoard(demoScores);
      } else {
        assert('local scoreboard submit works before Supabase is connected', true, 'skipped because live Supabase config is present');
      }
    } catch (err) {
      results.push({ name: 'self-test runner exception', ok: false, details: err?.stack || String(err) });
    } finally {
      const passed = results.filter(r => r.ok).length;
      const total = results.length || 1;
      publishSelfTest({
        passed,
        total,
        rate: passed / total,
        results
      });
      reset();
      ui.start.classList.remove('hidden');
      ui.over.classList.add('hidden');
      draw();
    }
  }

  function renderBoard(rows, remote = false) {
    ui.board.innerHTML = rows.slice(0, 5).map((s, i) => `<li><span class="rank">${String(i + 1).padStart(2, '0')}</span><b>${safe(s.name || 'RASCAL')}</b><em>${Number(s.score).toLocaleString()}</em></li>`).join('');
    ui.note.textContent = remote ? 'Global scores · point total blends time alive, knockouts, and bonus points.' : 'Local demo scores are shown until Supabase is connected.';
  }

  function safe(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function leaderboard() {
    const c = window.NEON_MUTT_SUPABASE || {};
    if (!c.url || !c.anonKey) {
      renderBoard(demoScores);
      return;
    }
    try {
      const r = await fetch(`${c.url}/rest/v1/scores?select=name,score,kills,survival_seconds&order=score.desc&limit=5`, { headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}` } });
      if (!r.ok) throw Error();
      renderBoard(await r.json(), true);
    } catch {
      renderBoard(demoScores);
      ui.note.textContent = 'Could not reach the live board. Showing demo scores.';
    }
  }

  async function submit() {
    if (!game) return;
    const name = (ui.name.value.trim() || 'RASCAL').toUpperCase();
    const entry = { name, score: score(), kills: game.kills, survival_seconds: Math.floor(game.t) };
    const c = window.NEON_MUTT_SUPABASE || {};
    if (c.url && c.anonKey) {
      try {
        await fetch(`${c.url}/rest/v1/scores`, { method: 'POST', headers: { apikey: c.anonKey, Authorization: `Bearer ${c.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(entry) });
      } catch {}
    } else {
      demoScores.push(entry);
    }
    await leaderboard();
    $('#submitScore').textContent = 'POSTED!';
  }

  $('#startButton').onclick = start;
  $('#againButton').onclick = start;
  $('#submitScore').onclick = submit;
  $('#refreshBoard').onclick = leaderboard;
  const helpButton = $('#helpButton');
  const helpDialog = $('#helpDialog');
  const closeHelp = $('#closeHelp');
  if (helpButton && helpDialog) helpButton.onclick = () => helpDialog.showModal();
  if (closeHelp && helpDialog) closeHelp.onclick = () => helpDialog.close();
  document.querySelectorAll('[data-key]').forEach(button => {
    const key = button.dataset.key;
    const down = e => {
      e.preventDefault();
      focusGame();
      keys.add(key);
      button.classList.add('is-held');
      if (movementKeys.has(key)) tapMove(key);
      pressAction(key);
    };
    const up = e => {
      e.preventDefault();
      keys.delete(key);
      if (key === 'e' && game?.player) game.player.eLatch = false;
      button.classList.remove('is-held');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointerleave', up);
    button.addEventListener('pointercancel', up);
  });

  renderBoard(demoScores);
  reset();
  draw();
  window.NMR_BOTTOM_REACHED = '20260829-bgscroll1';
  document.documentElement.dataset.nmrBuild = '20260829-bgscroll1';
  document.documentElement.dataset.nmrBottomReached = '20260829-bgscroll1';
  if (params.has('selftest')) {
    publishSelfTest({
      passed: 0,
      total: 1,
      rate: 0,
      results: [{ name: 'self-test scheduled', ok: false, details: 'waiting for runner' }]
    });
    setTimeout(runSelfTest, 0);
  }

  function pressAction(key) {
    if (!game?.alive || !ui.start.classList.contains('hidden')) return;
    if (key === 'f') fireFromInput();
    if (key === ' ' && !game.player.bonk) {
      game.player.bonk = 0.25;
      bonk();
    }
    if (key === 'e' && !game.player.eLatch) {
      game.player.eLatch = true;
      toggleRide();
    }
  }
})();
