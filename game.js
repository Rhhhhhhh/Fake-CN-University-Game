/* 野鸡大学辨别 —— 游戏逻辑
 * 安全约定：
 *   1. 全程使用 createElement + textContent 渲染，禁止 innerHTML / eval / document.write
 *   2. 载入的静态数据在渲染前做白名单字段与类型、长度校验
 *   3. 不写入 localStorage / Cookie，不发起任何网络请求，不加载第三方资源
 */
(function () {
  'use strict';

  var REAL_COUNT = 15;      // 每局正规大学数量
  var FAKE_COUNT = 15;      // 每局野鸡大学数量
  var MAX_MISTAKES = 5;     // 允许错误次数
  var TIME_LIMIT = 300;     // 限时（秒）
  var MAX_NAME_LEN = 40;

  var LEVEL_HINT = {
    easy: '简单：知名公办大学 VS 名字浮夸的野鸡大学',
    medium: '中等：正规“学院”与各类公办大学 VS 名字正常、只差后缀的野鸡大学',
    hard: '困难：公办与民办院校混合 VS 高度仿冒的野鸡大学',
    hell: '地狱：以地方院校为主，仅 2~4 所大学 VS 高度仿冒的野鸡大学'
  };

  var el = {};
  var state = null;
  var timerId = null;

  /* ---------------- 数据校验（防数据被篡改后注入） ---------------- */

  function cleanText(value, maxLen) {
    if (typeof value !== 'string') return '';
    // 去除控制字符，限制长度，避免异常数据撑爆布局
    return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, maxLen);
  }

  function pickString(source, key, maxLen) {
    return Object.prototype.hasOwnProperty.call(source, key)
      ? cleanText(source[key], maxLen)
      : '';
  }

  function toReal(item) {
    if (!item || typeof item !== 'object') return null;
    var name = pickString(item, 'n', MAX_NAME_LEN);
    if (name.length < 3) return null;
    var pub = pickString(item, 'pub', 4);
    return {
      name: name,
      loc: pickString(item, 'loc', 12),
      pub: (pub === '公办' || pub === '民办') ? pub : '公办',
      lvl: pickString(item, 'lvl', 4) || '本科',
      twin: pickString(item, 'twin', MAX_NAME_LEN),
      tsim: typeof item.tsim === 'number' && isFinite(item.tsim) ? item.tsim : 0
    };
  }

  function normalizePool(rawPool) {
    var result = { real: [], fake: [], realUniv: [] };
    if (!rawPool || typeof rawPool !== 'object') return result;

    var rawReal = Array.isArray(rawPool.real) ? rawPool.real : [];
    var rawFake = Array.isArray(rawPool.fake) ? rawPool.fake : [];
    var rawUniv = Array.isArray(rawPool.realUniv) ? rawPool.realUniv : [];

    rawReal.concat(rawUniv).forEach(function (item, idx) {
      var rec = toReal(item);
      if (!rec) return;
      if (idx < rawReal.length) result.real.push(rec);
      else result.realUniv.push(rec);
    });

    rawFake.forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var name = pickString(item, 'n', MAX_NAME_LEN);
      if (name.length < 3) return;
      result.fake.push({
        name: name,
        prov: pickString(item, 'prov', 12)
      });
    });

    return result;
  }

  function loadPools() {
    var data = window.GAME_DATA;
    if (!data || !data.pools || typeof data.pools !== 'object') return null;
    var pools = {};
    ['easy', 'medium', 'hard', 'hell'].forEach(function (level) {
      pools[level] = normalizePool(data.pools[level]);
    });
    if (!pools.easy.real.length || !pools.easy.fake.length) return null;
    return pools;
  }

  /* ---------------- 工具 ---------------- */

  function shuffle(list) {
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function sample(list, count) {
    return shuffle(list).slice(0, Math.min(count, list.length));
  }

  function formatTime(seconds) {
    var s = Math.max(0, seconds);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : String(r));
  }

  /* ---------------- 组局 ---------------- */

  function buildRound(level) {
    var pool = state.pools[level] || state.pools.easy;
    var reals = pool.real;
    var fakes = pool.fake;

    var pickedFake = sample(fakes, FAKE_COUNT);
    var fakeNames = pickedFake.map(function (f) { return f.name; });

    // 避免同一局出现与某所野鸡大学几乎同名的正规大学（防止出现"两个答案"的死局）
    var usable = pool.realUniv.length ? pool.real.concat(pool.realUniv) : reals;
    var candidates = usable.filter(function (r) {
      return !(r.twin && r.tsim >= 0.88 && fakeNames.indexOf(r.twin) !== -1);
    });
    if (candidates.length < REAL_COUNT) candidates = usable;

    var pickedReal;
    if (pool.realUniv.length) {
      // 地狱档：先定 2~4 所普通大学，其余名额全部给普通学院
      var univWant = 2 + Math.floor(Math.random() * 3);
      var univPool = candidates.filter(function (r) {
        return pool.realUniv.indexOf(r) !== -1;
      });
      var collegePool = candidates.filter(function (r) {
        return pool.realUniv.indexOf(r) === -1;
      });
      var pickedUniv = sample(univPool, Math.min(univWant, univPool.length));
      pickedReal = pickedUniv.concat(sample(collegePool, REAL_COUNT - pickedUniv.length));
    } else {
      pickedReal = sample(candidates, REAL_COUNT);
    }

    var cards = pickedReal.map(function (r) {
      return { name: r.name, kind: 'real', note: [r.loc, r.pub, r.lvl].filter(Boolean).join(' · ') };
    }).concat(pickedFake.map(function (f) {
      return { name: f.name, kind: 'fake', note: '虚假大学 · ' + f.prov };
    }));

    return shuffle(cards);
  }

  /* ---------------- 渲染 ---------------- */

  function makeText(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function renderGrid(cards) {
    var grid = el.grid;
    grid.textContent = '';
    cards.forEach(function (card, index) {
      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.setAttribute('role', 'listitem');
      tile.dataset.index = String(index);
      tile.appendChild(makeText('span', 'tile-name', card.name));
      tile.appendChild(makeText('span', 'tile-note', ''));
      grid.appendChild(tile);
      card.node = tile;
    });
  }

  function updateHud() {
    el.hudFound.textContent = String(state.found);
    el.hudLeft.textContent = String(REAL_COUNT - state.found);
    el.hudLives.textContent = String(MAX_MISTAKES - state.mistakes);
    var timeText = formatTime(state.remain);
    el.hudTime.textContent = timeText;
    if (state.remain <= 30) {
      el.hudTime.classList.add('urgent');
    } else {
      el.hudTime.classList.remove('urgent');
    }
  }

  function lockTile(card, className) {
    card.node.classList.add('locked', className);
    card.node.disabled = true;
    card.node.setAttribute('aria-disabled', 'true');
    var note = card.node.querySelector('.tile-note');
    if (note) note.textContent = card.note;
  }

  /* ---------------- 流程 ---------------- */

  function startTimer() {
    stopTimer();
    timerId = window.setInterval(function () {
      if (state.over) { stopTimer(); return; }
      state.remain -= 1;
      updateHud();
      if (state.remain <= 0) {
        state.remain = 0;
        finish('timeout');
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function finish(reason) {
    if (state.over) return;
    state.over = true;
    stopTimer();

    state.cards.forEach(function (card) {
      card.node.disabled = true;
      card.node.classList.add('locked');
      card.node.classList.remove('dim');
      var note = card.node.querySelector('.tile-note');
      if (note) note.textContent = card.note;
      if (card.kind === 'real') {
        if (card.state === 'found') return;      // 已选中的正规大学保持绿色
        card.node.classList.add('missed');
      } else {
        if (card.state === 'wrong') return;      // 已选错的野鸡大学保持红色
        card.node.classList.add('reveal-fake');
        card.node.classList.add('dim');
      }
    });

    el.legend.classList.remove('hidden');
    showResult(reason);
  }

  function showResult(reason) {
    var title = el.resultTitle;
    var detail = el.resultDetail;
    el.result.classList.remove('hidden');
    title.classList.remove('win', 'lose');

    var used = TIME_LIMIT - state.remain;
    if (reason === 'win') {
      title.textContent = '恭喜通关！15 所正规大学全部找到';
      title.classList.add('win');
      detail.textContent = '用时 ' + formatTime(used) + '，失误 ' + state.mistakes + ' 次（最多允许 ' + MAX_MISTAKES + ' 次）。对照下方颜色核对答案。';
    } else if (reason === 'timeout') {
      title.textContent = '时间到！';
      title.classList.add('lose');
      detail.textContent = '已找到 ' + state.found + '/15 所正规大学，失误 ' + state.mistakes + ' 次。下方标出全部正确答案。';
    } else {
      title.textContent = '错误次数已用完！';
      title.classList.add('lose');
      detail.textContent = '已找到 ' + state.found + '/15 所正规大学。下方标出全部正确答案，看看漏了哪些。';
    }
  }

  function onTileClick(event) {
    var tile = event.target.closest ? event.target.closest('.tile') : null;
    if (!tile || state.over) return;
    var index = Number(tile.dataset.index);
    if (!isFinite(index)) return;
    var card = state.cards[index];
    if (!card || card.state) return;

    if (card.kind === 'real') {
      card.state = 'found';
      state.found += 1;
      lockTile(card, 'correct');
      updateHud();
      if (state.found >= REAL_COUNT) finish('win');
    } else {
      card.state = 'wrong';
      state.mistakes += 1;
      lockTile(card, 'wrong');
      updateHud();
      if (state.mistakes >= MAX_MISTAKES) finish('mistakes');
    }
  }

  function startGame(level) {
    stopTimer();
    var pool = state.pools[level] ? level : 'easy';
    state.level = pool;
    state.cards = buildRound(pool);
    state.found = 0;
    state.mistakes = 0;
    state.remain = TIME_LIMIT;
    state.over = false;

    el.levelHint.textContent = LEVEL_HINT[pool] || LEVEL_HINT.easy;
    el.result.classList.add('hidden');
    el.legend.classList.add('hidden');
    el.resultTitle.textContent = '';
    el.resultDetail.textContent = '';

    renderGrid(state.cards);
    updateHud();
    show('game');
    startTimer();
  }

  function show(screen) {
    var isGame = screen === 'game';
    el.home.classList.toggle('hidden', isGame);
    el.game.classList.toggle('hidden', !isGame);
    window.scrollTo(0, 0);
  }

  /* ---------------- 初始化 ---------------- */

  function init() {
    el.home = document.getElementById('screen-home');
    el.game = document.getElementById('screen-game');
    el.grid = document.getElementById('grid');
    el.hudTime = document.getElementById('hudTime');
    el.hudFound = document.getElementById('hudFound');
    el.hudLeft = document.getElementById('hudLeft');
    el.hudLives = document.getElementById('hudLives');
    el.result = document.getElementById('result');
    el.resultTitle = document.getElementById('resultTitle');
    el.resultDetail = document.getElementById('resultDetail');
    el.legend = document.getElementById('legend');
    el.levelHint = document.getElementById('levelHint');

    var pools = loadPools();
    if (!pools) {
      el.levelHint.textContent = '数据加载失败，请确认 data.js 是否完整。';
      return;
    }
    state = { pools: pools, cards: [], found: 0, mistakes: 0, remain: TIME_LIMIT, over: true, level: 'easy' };

    var levelButtons = document.querySelectorAll('.level-card');
    Array.prototype.forEach.call(levelButtons, function (btn) {
      btn.addEventListener('click', function () {
        var level = btn.dataset.level;
        if (level === 'easy' || level === 'medium' || level === 'hard' || level === 'hell') startGame(level);
      });
    });

    el.grid.addEventListener('click', onTileClick);
    document.getElementById('btnRestart').addEventListener('click', function () { startGame(state.level); });
    document.getElementById('btnBack').addEventListener('click', function () { stopTimer(); show('home'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
