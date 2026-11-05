'use strict';

// Данные: window.PDD = {ver, src, books: [{n: название, s: короткое, c: [{n: глава, v: [[номер, текст, группа], ...]}]}]}
// «Стих» здесь - пункт (подпункт) с номером из Правил; на экране - пункт целиком или его часть.
const BOOKS = window.PDD.books;
const START = { b: 0, c: 0, v: -1 }; // заголовок главы 1
const WPM_MIN = 50;
const WPM_MAX = 500;

const $ = (id) => document.getElementById(id);
const body = document.body;
const el = {
  reader: $('reader'), ref: $('ref'), bar: $('bar'), verse: $('verse'), vt: $('vt'),
  wpm: $('wpm'), menu: $('menu'), menuTitle: $('menu-title'),
  menuBack: $('menu-back'), menuList: $('menu-list'), tabs: $('tabs'),
};

// ---------- хранилище ----------

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem('pdd.' + key));
    return v ?? fallback;
  } catch (e) {
    return fallback;
  }
}

function store(key, value) {
  try { localStorage.setItem('pdd.' + key, JSON.stringify(value)); } catch (e) { /* без сохранения */ }
}

// ---------- пункты ----------

const item = (b, c, v) => BOOKS[b].c[c].v[v];
const isSign = (it) => it[1].startsWith('«');
const chapNo = (ch) => (/^Глава (\d+)\./.exec(ch.n) || [])[1] || '';

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// слова пункта; br - слово начинает новую строку (элементы списка внутри пункта), строчные строки списка получают тире
const tokCache = new Map();

function tokensOf(b, c, v) {
  const key = b + ':' + c + ':' + v;
  if (tokCache.has(key)) return tokCache.get(key);
  const out = [];
  item(b, c, v)[1].split('\n').forEach((line, li) => {
    const words = line.split(/\s+/).filter(Boolean);
    const dash = li > 0 && /^[а-яёa-z]/.test(line);
    words.forEach((w, wi) => out.push({ w: dash && wi === 0 ? '–\u00a0' + w : w, br: li > 0 && wi === 0 }));
  });
  tokCache.set(key, out);
  return out;
}

// родительские пункты для подпункта, который читается только вместе с ними (текст со строчной буквы):
// 36.1.1 «со стороны левого и правого бока...» без 36.1 «руки вытянуты в стороны или опущены» непонятен
function parentsOf(b, c, v) {
  const it = item(b, c, v);
  if (!/^\d+(\.\d+)+$/.test(it[0]) || !/^[а-яёa-z]/.test(it[1])) return [];
  const list = BOOKS[b].c[c].v;
  const parts = it[0].split('.');
  const out = [];
  for (let n = parts.length - 1; n >= 1 && out.length < 2; n--) {
    const num = parts.slice(0, n).join('.');
    for (let k = v - 1; k >= 0; k--) {
      if (list[k][0] === num) {
        out.unshift(list[k]);
        break;
      }
    }
  }
  return out;
}

function upHtml(b, c, v) {
  const ps = parentsOf(b, c, v);
  if (!ps.length) return '';
  const rows = ps.map((p) => {
    let t = p[1].split('\n')[0];
    if (t.length > 220) t = t.slice(0, 217).replace(/\s+\S*$/, '') + '…';
    return '<p><b>' + p[0] + '.</b>' + escapeHtml(t) + '</p>';
  });
  return '<div class="up">' + rows.join('') + '</div>';
}

function labelOf(b, c, v) {
  const it = item(b, c, v);
  const group = it[2] ? it[2].replace(/^§\s*\d+\.\s*/, '') : '';
  if (isSign(it)) return group; // номер знака уже в тексте
  return it[0] ? 'п. ' + it[0] + (group ? ' · ' + group : '') : '';
}

function partHtml(b, c, v, toks, a, z, np, pi) {
  let text = '';
  for (let k = a; k <= z; k++) text += (k > a ? (toks[k].br ? '\n' : ' ') : '') + escapeHtml(toks[k].w);
  const label = labelOf(b, c, v) + (np > 1 ? ' <i>· ' + (pi + 1) + '/' + np + '</i>' : '');
  return upHtml(b, c, v) + (label ? '<div class="num">' + label + '</div>' : '') + '<div>' + text + '</div>';
}

// ---------- экраны главы ----------
// заголовок, затем пункт целиком или его части {v, pi, np, a, z (слова)}. Деление зависит от размера экрана,
// шрифта и размера букв (меряется в #vt), поэтому кэш сбрасывается в measure()

const screenCache = new Map();
const CLAUSE_END = /[,;:.!?…—]["»”')]*$/;

function fits(html) {
  el.vt.innerHTML = html;
  return el.vt.offsetHeight <= el.verse.clientHeight - 6;
}

// части: сначала целиком, иначе на n частей примерно равной длины (n = 2, 3, ...), границы - у знаков препинания и строк списка
function splitVerse(b, c, v) {
  const toks = tokensOf(b, c, v);
  const last = toks.length - 1;
  const html = (a, z, np, pi) => partHtml(b, c, v, toks, a, z, np, pi);
  if (last <= 0 || fits(html(0, last, 1, 0))) return [[0, last]];
  const cum = [];
  let sum = 0;
  toks.forEach((t) => { sum += t.w.length + 1; cum.push(sum); });
  const first = Math.max(2, Math.floor(el.vt.offsetHeight / Math.max(1, el.verse.clientHeight)));
  let parts = [];
  for (let n = first; n <= 60; n++) {
    parts = [];
    let from = 0;
    for (let k = 1; k < n; k++) {
      const ideal = (sum * k) / n;
      let best = -1;
      let bestScore = Infinity;
      for (let q = from; q <= last - (n - k); q++) {
        const edge = CLAUSE_END.test(toks[q].w) || (toks[q + 1] && toks[q + 1].br);
        const score = Math.abs(cum[q] - ideal) * (edge ? 1 : 2.5);
        if (score < bestScore) {
          bestScore = score;
          best = q;
        }
      }
      if (best < from) break;
      parts.push([from, best]);
      from = best + 1;
    }
    parts.push([from, last]);
    if (parts.length === n && parts.every(([a, z], i) => fits(html(a, z, n, i)))) return parts;
  }
  return parts;
}

function screensOf(b, c) {
  const key = b + ':' + c;
  if (screenCache.has(key)) return screenCache.get(key);
  const out = [{ h: true, v: -1, pi: 0, np: 1 }];
  BOOKS[b].c[c].v.forEach((_, v) => {
    const parts = splitVerse(b, c, v);
    parts.forEach(([a, z], pi) => out.push({ v, pi, np: parts.length, a, z }));
  });
  if (screenCache.size > 6) screenCache.delete(screenCache.keys().next().value);
  screenCache.set(key, out);
  return out;
}

// ---------- позиция ----------
// в памяти pos = {b, c, v, p}: пункт и номер части (v = -1 - заголовок главы); сохраняется {b, c, v}

function resolve(s) {
  if (!s || !BOOKS[s.b] || !BOOKS[s.b].c[s.c]) return null;
  const n = BOOKS[s.b].c[s.c].v.length;
  if (!(s.v >= -1 && s.v < n)) return null;
  return { b: s.b, c: s.c, v: s.v, p: 0 };
}

const freeze = (p) => ({ b: p.b, c: p.c, v: p.v });
let pos = resolve(load('pos', null)) || { ...START, p: 0 };

function screenIndex() {
  const k = screensOf(pos.b, pos.c).findIndex((s) => s.v === pos.v && s.pi === (pos.p || 0));
  return k < 0 ? 0 : k;
}
const curScreen = () => screensOf(pos.b, pos.c)[screenIndex()];

function nextChapter(p) {
  if (p.c + 1 < BOOKS[p.b].c.length) return { b: p.b, c: p.c + 1 };
  if (p.b + 1 < BOOKS.length) return { b: p.b + 1, c: 0 };
  return null;
}

function prevChapter(p) {
  if (p.c > 0) return { b: p.b, c: p.c - 1 };
  if (p.b > 0) return { b: p.b - 1, c: BOOKS[p.b - 1].c.length - 1 };
  return null;
}

// ставит pos на соседний экран (в том числе в соседней главе); false - дальше некуда
function moveScreen(dir) {
  const list = screensOf(pos.b, pos.c);
  const k = screenIndex();
  if (list[k + dir]) {
    pos.v = list[k + dir].v;
    pos.p = list[k + dir].pi;
    return true;
  }
  const to = dir > 0 ? nextChapter(pos) : prevChapter(pos);
  if (!to) return false;
  const next = screensOf(to.b, to.c);
  const s = dir > 0 ? next[0] : next[next.length - 1];
  pos = { ...to, v: s.v, p: s.pi };
  return true;
}

// ---------- шрифт и размер ----------

const FONTS = [
  ['system', 'Обычный', 'Roboto, "Segoe UI", system-ui, sans-serif'],
  ['condensed', 'Roboto Condensed', '"Roboto Condensed", Roboto, system-ui, sans-serif'],
  ['literata', 'Literata', 'Literata, Georgia, serif'],
];
const SIZES = [['s', 'Мелкий', 19], ['m', 'Средний', 22], ['l', 'Крупный', 26]];
let font = FONTS.find((f) => f[0] === load('font', 'system')) || FONTS[0];
let size = SIZES.find((s) => s[0] === load('size', 'm')) || SIZES[1];

function measure() {
  screenCache.clear();
  document.documentElement.style.setProperty('--fs', size[2] + 'px');
}

function applyFont(f) {
  font = f;
  document.documentElement.style.setProperty('--read-font', f[2]);
  measure();
  render();
  // свой шрифт грузится не сразу - пересчитать деление на части, когда загрузится
  if (document.fonts) document.fonts.load('20px ' + f[2], 'Правила').then(() => { if (font === f) { measure(); render(); } }, () => {});
}

function applySize(s) {
  size = s;
  measure();
  render();
}

// ---------- отрисовка ----------

function refText(p) {
  const book = BOOKS[p.b];
  const ch = book.c[p.c];
  const head = p.b === 0 ? 'Гл. ' + chapNo(ch) : book.s + (book.c.length > 1 && chapNo(ch) ? ', гл. ' + chapNo(ch) : '');
  if (p.v < 0) return p.b === 0 ? head : book.s + (book.c.length > 1 ? ', ' + ch.n.replace(/\..*$/, '').toLowerCase() : '');
  const it = item(p.b, p.c, p.v);
  return head + (it[0] ? ' · ' + (isSign(it) ? 'знак ' : 'п. ') + it[0] : '');
}

function render() {
  const s = curScreen();
  el.verse.classList.toggle('heading', !!s.h);
  body.classList.toggle('on-heading', !!s.h);
  body.classList.toggle('manual', manual());
  if (s.h) {
    const ch = BOOKS[pos.b].c[pos.c];
    el.vt.textContent = (pos.b === 0 ? '' : BOOKS[pos.b].n + '\n') + ch.n;
  } else {
    el.vt.innerHTML = partHtml(pos.b, pos.c, s.v, tokensOf(pos.b, pos.c, s.v), s.a, s.z, s.np, s.pi);
  }
  $('share').hidden = !!s.h;
  const text = refText(pos);
  if (el.ref.textContent !== text) el.ref.textContent = text;
  const n = screensOf(pos.b, pos.c).length;
  el.bar.style.width = (100 * screenIndex() / Math.max(1, n - 1)) + '%';
}

function showPaused() {
  render();
  store('pos', freeze(pos));
}

// ---------- воспроизведение ----------

let playing = false;
let timer = 0;
let wake = null;
let sleepTimer = 0;
const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
let wpm = Math.min(WPM_MAX, Math.max(WPM_MIN, load('wpm', 150)));

// экран не гаснет, пока учим, и ещё минуту после последнего касания
async function keepAwake() {
  clearTimeout(sleepTimer);
  try {
    if (plugins.KeepAwake) await plugins.KeepAwake.keepAwake();
    else if ('wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch (e) { /* не поддерживается */ }
}

function allowSleepLater() {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => {
    try {
      if (plugins.KeepAwake) plugins.KeepAwake.allowSleep();
      else if (wake) wake.release();
    } catch (e) { /* ок */ }
  }, 60000);
}

// сколько держать экран при автолистании: время на чтение по скорости, не меньше 2 с
function screenDelay(s) {
  if (s.h) return 1500;
  return Math.max(2000, (s.z - s.a + 1) * 60000 / wpm);
}

function play() {
  if (playing) return;
  endManual();
  playing = true;
  body.classList.add('playing', 'started');
  startSession();
  keepAwake();
  render();
  timer = setTimeout(step, screenDelay(curScreen()));
}

function step() {
  if (!playing) return;
  if (!moveScreen(1)) {
    pause();
    return;
  }
  countScreen();
  render();
  timer = setTimeout(step, screenDelay(curScreen()));
}

function pause() {
  if (!playing) return;
  playing = false;
  clearTimeout(timer);
  body.classList.remove('playing');
  endSession();
  allowSleepLater();
  showPaused();
  reloadIfIdle();
}

function prevScreen() {
  body.classList.add('started');
  moveScreen(-1);
  showPaused();
}

// при листании касанием ход вперёд считается чтением; при автолистании только переход
function nextScreen() {
  body.classList.add('started');
  const reading = !playing;
  if (reading && !session) startSession();
  if (!moveScreen(1)) return;
  if (reading) countScreen();
  showPaused();
  if (reading) {
    touchManual();
    keepAwake();
    allowSleepLater();
  }
}

// ---------- прочитанное, история, дни ----------

const HISTORY_MAX = 300;
const SESSION_GAP = 30 * 60000;
let readHistory = load('history', []);
if (!Array.isArray(readHistory)) readHistory = [];
readHistory = readHistory.filter((e) => e && resolve(e.start) && resolve(e.end));
let days = load('days', {}); // 'ГГГГ-ММ-ДД' -> {ms, items}
let readMap = load('read', {}); // 'книга.глава' -> строка из 0/1 по пунктам
let session = null;

const cmpPos = (a, b) => a.b - b.b || a.c - b.c || a.v - b.v;

function dateKey(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// пункт прочитан, когда во время чтения показана его последняя часть
function markVerse(b, c, v) {
  const key = b + '.' + c;
  const n = BOOKS[b].c[c].v.length;
  let s = readMap[key];
  if (!s || s.length !== n) s = '0'.repeat(n);
  if (s[v] === '1') return;
  readMap[key] = s.slice(0, v) + '1' + s.slice(v + 1);
}

const versesIn = (b) => BOOKS[b].c.reduce((sum, ch) => sum + ch.v.length, 0);
const BOOK_VERSES = BOOKS.map((_, b) => versesIn(b));

function readCount(b, c) {
  const s = readMap[b + '.' + c];
  return s ? s.split('1').length - 1 : 0;
}

function bookRead(b) {
  let n = 0;
  for (let c = 0; c < BOOKS[b].c.length; c++) n += readCount(b, c);
  return n;
}

function startSession() {
  if (session) return;
  session = { from: freeze(pos), t: Date.now(), items: 0 };
}

// экран показан во время чтения: пункт считается прочитанным, когда показана его последняя часть
function countScreen() {
  const s = curScreen();
  if (s.h || !session) return;
  session.last = Date.now();
  if (s.pi === s.np - 1) {
    const it = BOOKS[pos.b].c[pos.c].v;
    if (it[s.v] && readMap[pos.b + '.' + pos.c]?.[s.v] !== '1') session.items++;
    markVerse(pos.b, pos.c, s.v);
  }
}

// продолжение рядом с прошлым местом в течение 30 минут дописывается в ту же запись
function endSession(at) {
  const s = session;
  session = null;
  if (!s || !s.items) {
    if (s) store('read', readMap);
    return;
  }
  const now = at || Date.now();
  const end = freeze(pos);
  track('read', { items: s.items, seconds: Math.round((now - s.t) / 1000), chapter: refText(pos) });
  const day = days[dateKey(now)] || { ms: 0, items: 0 };
  day.ms += now - s.t;
  day.items += s.items;
  days[dateKey(now)] = day;
  store('days', days);
  store('read', readMap);
  const last = readHistory[0];
  const near = last && now - last.t1 < SESSION_GAP && last.end.b === s.from.b && Math.abs(last.end.c - s.from.c) <= 1;
  if (near) {
    if (cmpPos(s.from, last.start) < 0) last.start = s.from;
    last.end = end;
    last.t1 = now;
    last.items += s.items;
    last.ms += now - s.t;
  } else {
    readHistory.unshift({ start: s.from, end, t0: s.t, t1: now, items: s.items, ms: now - s.t });
    if (readHistory.length > HISTORY_MAX) readHistory.length = HISTORY_MAX;
  }
  store('history', readHistory);
}

// листание касанием: сессия кончается после минуты без касаний (время - по последнему касанию),
// при меню, сворачивании; запуск автолистания тоже её закрывает
let manualIdle = 0;

function touchManual() {
  if (playing || !session) return;
  session.last = Date.now();
  clearTimeout(manualIdle);
  manualIdle = setTimeout(endManual, 60000);
}

function endManual() {
  clearTimeout(manualIdle);
  if (playing || !session) return;
  endSession(session.last || Date.now());
  store('pos', freeze(pos));
}

// ---------- управление (Настройки → Листание) ----------
// tap - листание касанием (по умолчанию); hold - пункты сменяются сами, пока держишь палец;
// auto - сами, касание: старт и стоп. Тексты на согласовании.

const FLOWS = [
  ['tap', 'Касанием', 'Пункт сменяется касанием у правого края, назад - у левого. Свайп влево и вправо делает то же.',
    ['Касание у правого края - пункт дальше.', 'Касание у левого края - пункт назад.']],
  ['hold', 'Само, пока держите палец', 'Держите палец на экране - пункты сменяются сами. Отпустили - пауза.',
    ['Держите палец на экране - пункты пойдут сами.', 'Отпустите - пауза.', 'Касание у левого или правого края - пункт назад или вперёд.']],
  ['auto', 'Само, старт и стоп', 'Коснулись - пункты сменяются сами. Коснулись ещё раз - пауза.',
    ['Коснитесь экрана - пункты пойдут сами.', 'Коснитесь ещё раз - пауза.', 'Касание у левого или правого края - пункт назад или вперёд.']],
];
let flow = FLOWS.find((f) => f[0] === load('flow', 'tap')) || FLOWS[0];
const manual = () => flow[0] === 'tap';

function showHint() {
  const hint = $('hint');
  hint.replaceChildren();
  flow[3].forEach((line, k) => {
    if (k) hint.append(document.createElement('br'));
    hint.append(line);
  });
}

const pointers = new Set();
const TAP_MS = 220;
const TAP_MOVE = 20;
const SWIPE_MIN = 70;
let edge = null;
let swipe = null;

function edgeSide(x) {
  const w = el.reader.clientWidth;
  const zone = Math.max(56, w * 0.2);
  return x < zone ? -1 : x > w - zone ? 1 : 0;
}

function flash(side) {
  const f = $('flash');
  f.className = side < 0 ? 'left' : 'right';
  void f.offsetWidth;
  f.classList.add('on');
}

el.reader.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.ui')) return;
  e.preventDefault();
  pointers.add(e.pointerId);
  try { el.reader.setPointerCapture(e.pointerId); } catch (err) { /* ок */ }
  const side = edgeSide(e.clientX);
  swipe = pointers.size === 1 && !playing ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  if (flow[0] === 'tap') {
    if (side && pointers.size === 1) edge = { id: e.pointerId, side, x: e.clientX, y: e.clientY };
    return;
  }
  if (flow[0] === 'auto') {
    if (pointers.size > 1) return;
    if (playing) pause();
    else if (side) edge = { id: e.pointerId, side, x: e.clientX, y: e.clientY };
    else play();
    return;
  }
  if (side && !playing && pointers.size === 1) {
    edge = { id: e.pointerId, side, x: e.clientX, y: e.clientY };
    edge.timer = setTimeout(() => { edge = null; play(); }, TAP_MS);
    return;
  }
  play();
});

el.reader.addEventListener('pointermove', (e) => {
  if (swipe && swipe.id === e.pointerId && !playing) {
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > 1.8 * Math.abs(dy)) {
      swipe = null;
      if (edge) clearTimeout(edge.timer);
      edge = null;
      if (dx < 0) nextScreen();
      else prevScreen();
      flash(dx < 0 ? 1 : -1);
      return;
    }
  }
  if (!edge || edge.id !== e.pointerId) return;
  if (Math.hypot(e.clientX - edge.x, e.clientY - edge.y) > TAP_MOVE) {
    clearTimeout(edge.timer);
    edge = null;
    if (flow[0] === 'hold') play();
  }
});

function release(e) {
  if (!pointers.delete(e.pointerId)) return;
  if (swipe && swipe.id === e.pointerId) swipe = null;
  if (edge && edge.id === e.pointerId) {
    clearTimeout(edge.timer);
    const { side } = edge;
    edge = null;
    if (!playing && e.type === 'pointerup') {
      if (side < 0) prevScreen();
      else nextScreen();
      flash(side);
    }
  }
  if (flow[0] === 'hold' && !pointers.size) pause();
}

el.reader.addEventListener('pointerup', release);
el.reader.addEventListener('pointercancel', release);
el.reader.addEventListener('lostpointercapture', release);
// в полях ввода меню (вставить, выделить) нужно
document.addEventListener('contextmenu', (e) => { if (!e.target.closest('textarea, input')) e.preventDefault(); });

// на компьютере: стрелки - пункты, пробел - как касание, +/- скорость
document.addEventListener('keydown', (e) => {
  if (!el.menu.hidden) {
    if (e.key === 'Escape') closeMenu();
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (flow[0] === 'tap') nextScreen();
    else if (flow[0] === 'hold' || !playing) play();
    else pause();
  } else if (!playing && e.key === 'ArrowLeft') prevScreen();
  else if (!playing && e.key === 'ArrowRight') nextScreen();
  else if (e.key === '+' || e.key === '=') changeWpm(1);
  else if (e.key === '-') changeWpm(-1);
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && flow[0] === 'hold') pause();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pointers.clear();
    pause();
    endManual();
    store('pos', freeze(pos));
  }
});

// ---------- скорость ----------

function changeWpm(dir) {
  wpm = Math.min(WPM_MAX, Math.max(WPM_MIN, wpm + dir * 10));
  el.wpm.textContent = wpm;
  store('wpm', wpm);
}

$('slower').addEventListener('click', () => changeWpm(-1));
$('faster').addEventListener('click', () => changeWpm(1));
$('prev').addEventListener('click', () => { prevScreen(); touchManual(); });
$('next').addEventListener('click', nextScreen);

// ---------- меню: правила, приложения, история ----------

let tab = pos.b === 0 ? 'rules' : 'apps';

function openMenu() {
  pause();
  endManual();
  tab = pos.b === 0 ? 'rules' : 'apps';
  showMenuTab();
  el.menu.hidden = false;
}

function closeMenu() {
  el.menu.hidden = true;
  reloadIfIdle();
}

function percent(x) {
  const p = x * 100;
  if (p > 0 && p < 1) return '<1%';
  return (p >= 99.95 ? 100 : Math.floor(p * 10) / 10).toLocaleString('ru-RU') + '%';
}

function node(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// кнопки «?» и ⚙ в шапке меню - только на вкладках
function menuIcons(show) {
  $('menu-help').hidden = !show;
  $('menu-settings').hidden = !show;
}

// вложенный экран меню (справка, настройки): слева «‹ назад», вкладки скрыты
function subScreen(backLabel) {
  el.menuBack.textContent = '‹ ' + backLabel;
  el.menuBack.hidden = false;
  menuIcons(false);
  el.tabs.hidden = true;
}

function showMenuTab() {
  el.menuBack.hidden = true;
  menuIcons(true);
  el.tabs.hidden = false;
  el.tabs.querySelectorAll('button').forEach((btn) => btn.classList.toggle('on', btn.dataset.tab === tab));
  if (tab === 'hist') showHistory();
  else if (tab === 'apps') showApps();
  else showRules();
}

// список глав книги; название главы без слова «Глава N.» в начале убирать не нужно - номер важен
function chapterButtons(b) {
  const list = node('div', 'chaps');
  BOOKS[b].c.forEach((ch, c) => {
    const btn = node('button');
    btn.type = 'button';
    btn.append(node('span', '', ch.n));
    const x = readCount(b, c) / ch.v.length;
    if (x > 0) btn.append(node('small', '', percent(x)));
    if (x > 0) btn.style.setProperty('--done', (x * 100).toFixed(1) + '%');
    if (x >= 0.999) btn.classList.add('done');
    if (b === pos.b && c === pos.c) btn.classList.add('cur');
    btn.addEventListener('click', () => goTo({ b, c, v: -1 }));
    list.append(btn);
  });
  return list;
}

// номер пункта в тексте набирают по-разному: «14.1», «п. 14.1», «14,1», «57/1» (индекс - как в Правилах: 57¹)
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function normNumber(s) {
  let t = s.trim().toLowerCase().replace(/^п(ункт)?\.?\s*/, '').replace(/,/g, '.').replace(/\.$/, '');
  t = t.replace(/\/(\d+)$/, (_, d) => [...d].map((x) => SUP[x]).join(''));
  return t;
}

function findNumber(s) {
  const num = normNumber(s);
  if (!num) return null;
  const chapters = BOOKS[0].c;
  for (let c = 0; c < chapters.length; c++) {
    const v = chapters[c].v.findIndex((it) => it[0] === num);
    if (v >= 0) return { b: 0, c, v };
  }
  return null;
}

function showRules() {
  el.menuTitle.textContent = BOOKS[0].n;
  const totalRead = bookRead(0);
  const jump = node('form', 'jump');
  const input = node('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.placeholder = 'Номер пункта: 31.4';
  input.autocomplete = 'off';
  const go = node('button', '', 'Перейти');
  go.type = 'submit';
  const note = node('p', 'summary', '');
  jump.addEventListener('submit', (e) => {
    e.preventDefault();
    const p = findNumber(input.value);
    if (p) goTo(p);
    else note.textContent = input.value.trim() ? 'Пункта ' + input.value.trim() + ' в Правилах нет.' : '';
  });
  jump.append(input, go);
  const summary = node('p', 'summary', 'Изучено ' + percent(totalRead / BOOK_VERSES[0]) + ' · ' + BOOKS[0].c.length + ' глав');
  el.menuList.replaceChildren(summary, jump, note, chapterButtons(0));
  const cur = el.menuList.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
  else el.menuList.scrollTop = 0;
}

function showApps() {
  el.menuTitle.textContent = 'Приложения';
  const parts = [node('p', 'summary', 'Знаки и разметка даны словесным описанием: рисунков в приложении нет.')];
  for (let b = 1; b < BOOKS.length; b++) {
    parts.push(node('h3', 'sect', BOOKS[b].n + ' · ' + percent(bookRead(b) / BOOK_VERSES[b])), chapterButtons(b));
  }
  el.menuList.replaceChildren(...parts);
  const cur = el.menuList.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
  else el.menuList.scrollTop = 0;
}

function goTo(p) {
  pos = resolve(p) || pos;
  closeMenu();
  showPaused();
}

// ---------- история и статистика ----------

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const itemsText = (n) => n.toLocaleString('ru-RU') + ' ' + plural(n, 'пункт', 'пункта', 'пунктов');

function duration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 мин';
  if (min < 60) return min + ' мин';
  return Math.floor(min / 60) + ' ч ' + (min % 60) + ' мин';
}

function dayLabel(key) {
  const now = Date.now();
  if (key === dateKey(now)) return 'Сегодня';
  if (key === dateKey(now - 86400000)) return 'Вчера';
  const [y, m, d] = key.split('-').map(Number);
  const opts = { day: 'numeric', month: 'long' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', opts);
}

function streak() {
  let t = Date.now();
  if (!days[dateKey(t)]) t -= 86400000;
  let n = 0;
  while (days[dateKey(t)]) {
    n++;
    t -= 86400000;
  }
  return n;
}

function stat(label, value) {
  const box = node('div', 'stat');
  box.append(node('b', '', value), node('span', '', label));
  return box;
}

function showHistory() {
  el.menuTitle.textContent = 'История';
  const now = Date.now();
  const today = days[dateKey(now)] || { ms: 0, items: 0 };
  let week = 0;
  let weekItems = 0;
  for (let k = 0; k < 7; k++) {
    const d = days[dateKey(now - k * 86400000)];
    if (d) {
      week += d.ms;
      weekItems += d.items;
    }
  }
  const s = streak();
  const stats = node('div', 'stats');
  stats.append(
    stat('сегодня · ' + itemsText(today.items), duration(today.ms)),
    stat('за 7 дней · ' + itemsText(weekItems), duration(week)),
    stat(plural(s, 'день подряд', 'дня подряд', 'дней подряд'), String(s)),
    stat('Правил изучено', percent(bookRead(0) / BOOK_VERSES[0])),
  );

  const list = node('div', 'history');
  if (!readHistory.length) list.append(node('p', 'summary', 'Здесь появятся места, где вы остановились.'));
  let lastDay = '';
  for (const e of readHistory) {
    const key = dateKey(e.t1);
    if (key !== lastDay) {
      list.append(node('h3', '', dayLabel(key)));
      lastDay = key;
    }
    const btn = node('button');
    btn.type = 'button';
    const time = new Date(e.t1).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    btn.append(
      node('span', '', refText(e.end)),
      node('small', '', ['с ' + refText(e.start), time, duration(e.ms), itemsText(e.items)].join(' · ')),
    );
    btn.addEventListener('click', () => goTo(e.end));
    list.append(btn);
  }

  const tools = node('div', 'tools');
  const exp = node('button', '', 'Сохранить прогресс в файл');
  const imp = node('button', '', 'Загрузить прогресс из файла');
  exp.type = imp.type = 'button';
  exp.addEventListener('click', exportProgress);
  imp.addEventListener('click', () => $('import-file').click());
  tools.append(exp, imp, node('p', 'summary', 'Файл пригодится при переустановке приложения или смене телефона.'),
    node('p', 'summary', versionLine()));

  el.menuList.replaceChildren(stats, list, tools);
  el.menuList.scrollTop = 0;
}

// ---------- сохранение прогресса в файл ----------

function progressData() {
  return { app: 'pdd-study', version: 1, exported: new Date().toISOString(), pos: freeze(pos), wpm, history: readHistory, days, read: readMap };
}

async function exportProgress() {
  const json = JSON.stringify(progressData());
  const name = 'pdd-progress-' + dateKey(Date.now()) + '.json';
  try {
    if (plugins.Filesystem && plugins.Share) {
      const file = await plugins.Filesystem.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' });
      await plugins.Share.share({ title: 'Прогресс', files: [file.uri] });
    } else {
      // веб-версия: на телефоне (iPhone) - меню «Поделиться», на компьютере - скачивание
      const file = new File([json], name, { type: 'application/json' });
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Прогресс' });
      } else {
        const a = node('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    }
  } catch (e) {
    const cancelled = e && (e.name === 'AbortError' || /cancel/i.test(String(e.message)));
    if (!cancelled) alert('Не получилось сохранить файл: ' + (e && e.message));
  }
}

function mergeProgress(data) {
  for (const [key, s] of Object.entries(data.read || {})) {
    const mine = readMap[key];
    if (typeof s !== 'string') continue;
    if (!mine || mine.length !== s.length) readMap[key] = s;
    else readMap[key] = [...s].map((ch, i) => (ch === '1' || mine[i] === '1' ? '1' : '0')).join('');
  }
  for (const [key, d] of Object.entries(data.days || {})) {
    const mine = days[key] || { ms: 0, items: 0 };
    days[key] = { ms: Math.max(mine.ms, d.ms || 0), items: Math.max(mine.items, d.items || 0) };
  }
  const seen = new Set(readHistory.map((e) => e.t0));
  for (const e of data.history || []) if (e && resolve(e.start) && resolve(e.end) && !seen.has(e.t0)) readHistory.push(e);
  readHistory.sort((a, b) => b.t1 - a.t1);
  if (readHistory.length > HISTORY_MAX) readHistory.length = HISTORY_MAX;
  pos = resolve(data.pos) || pos;
  if (data.wpm >= WPM_MIN && data.wpm <= WPM_MAX) wpm = data.wpm;
  store('read', readMap);
  store('days', days);
  store('history', readHistory);
  store('pos', freeze(pos));
  store('wpm', wpm);
  el.wpm.textContent = wpm;
}

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'pdd-study') throw new Error('это не файл прогресса');
    const when = new Date(data.exported).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!confirm('Загрузить прогресс от ' + when + '? Он объединится с текущим, место возьмётся из файла.')) return;
    mergeProgress(data);
    showPaused();
    showHistory();
  } catch (err) {
    alert('Не получилось загрузить файл: ' + err.message);
  }
});

// ---------- справка ----------
// тексты на согласовании

const HELP = [
  ['Как учить', [
    'Пункт Правил показан целиком. Длинный пункт делится на части.',
    null,
    'У подпункта серым слева показан главный пункт, к которому он относится.',
    'Способ листания, шрифт и размер букв - Меню → ⚙ Настройки.',
  ]],
  ['Переходы', [
    'Кнопки «‹ пункт» и «пункт ›» внизу листают так же, как касание у краёв.',
    'Касание номера вверху - выбор главы. Поле «Номер пункта» сразу открывает нужный пункт, например 31.4 или 105.',
  ]],
  ['История и прогресс', [
    'Меню → История: где вы остановились, сколько изучили и за какое время. Касание записи - вернуться туда.',
    'Пункт считается изученным, когда вы дошли до его конца при листании. У глав виден процент.',
    'Перед переустановкой или сменой телефона нажмите «Сохранить прогресс в файл», потом на новом месте - «Загрузить прогресс из файла».',
  ]],
  ['О тексте', [
    'Правила дорожного движения Республики Беларусь (Указ Президента №551 от 28.11.2005) в редакции с учётом Указа №295 от 04.08.2025. Источник - etalonline.by.',
    'Рисунков знаков, разметки и светофоров нет: знаки и разметка даны словесным описанием.',
    'Приложение - пособие для изучения, оно не заменяет официальный текст. Сверяйтесь с действующей редакцией на pravo.by.',
  ]],
];

function showHelp() {
  el.menuTitle.textContent = 'Справка';
  subScreen('Назад');
  const box = node('div', 'help');
  for (const [title, lines] of HELP) {
    const ul = node('ul');
    for (const line of lines) ul.append(node('li', '', line ?? flow[2]));
    box.append(node('h3', '', title), ul);
  }
  box.append(node('p', 'summary', versionLine()));
  el.menuList.replaceChildren(box);
  el.menuList.scrollTop = 0;
}

// ---------- настройки ----------

function showSettings() {
  el.menuTitle.textContent = 'Настройки';
  subScreen('Назад');
  const box = node('div', 'help');
  const flows = node('div', 'choices');
  for (const f of FLOWS) {
    const btn = node('button', f === flow ? 'on' : '', f[1]);
    btn.type = 'button';
    btn.append(node('small', '', f[2]));
    btn.addEventListener('click', () => {
      pause();
      endManual();
      flow = f;
      store('flow', f[0]);
      showHint();
      render();
      flows.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
    });
    flows.append(btn);
  }
  const fonts = node('div', 'choices');
  for (const f of FONTS) {
    const btn = node('button', f === font ? 'on' : '');
    btn.type = 'button';
    const sample = node('span', 'font-sample', 'Скорость движения');
    sample.style.fontFamily = f[2];
    btn.append(sample, node('small', '', f[1]));
    btn.addEventListener('click', () => {
      store('font', f[0]);
      applyFont(f);
      fonts.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
    });
    fonts.append(btn);
  }
  const sizes = node('div', 'sizes');
  for (const s of SIZES) {
    const btn = node('button', s === size ? 'on' : '', s[1]);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      store('size', s[0]);
      applySize(s);
      sizes.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
    });
    sizes.append(btn);
  }
  box.append(node('h3', '', 'Листание'), flows, node('h3', '', 'Шрифт'), fonts, node('h3', '', 'Размер букв'), sizes);
  el.menuList.replaceChildren(box);
  el.menuList.scrollTop = 0;
}

function openHelp() {
  pause();
  endManual();
  tab = pos.b === 0 ? 'rules' : 'apps';
  showHelp();
  el.menu.hidden = false;
}

el.ref.addEventListener('click', openMenu);
$('menu-help').addEventListener('click', showHelp);
$('menu-settings').addEventListener('click', showSettings);
$('menu-close').addEventListener('click', closeMenu);
el.menuBack.addEventListener('click', showMenuTab);
el.tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  tab = btn.dataset.tab;
  showMenuTab();
});

// ---------- запуск ----------

window.addEventListener('resize', () => { measure(); render(); });
applyFont(font);
showHint();
el.wpm.textContent = wpm;
showPaused();
// новая веб-часть запустилась - иначе через 10 с модуль обновлений вернёт прежнюю
if (plugins.CapacitorUpdater) plugins.CapacitorUpdater.notifyAppReady().catch(() => { /* ок */ });

// веб-версия: работа без интернета и автообновление (в сборке Android не нужна).
// Новая версия ставится в фоне; страницу перезагружаем, когда не учат и меню закрыто - место сохранено
let reloadWhenIdle = false;

function reloadIfIdle() {
  if (reloadWhenIdle && !playing && el.menu.hidden) location.reload();
}

if ('serviceWorker' in navigator && !window.Capacitor && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // первая установка - страница и так свежая
    reloadWhenIdle = true;
    reloadIfIdle();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    // с экрана Домой приложение часто не запускается заново, а возвращается из фона - проверяем и тогда
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) reg.update().catch(() => { /* нет сети */ });
    });
  }).catch(() => { /* без офлайна */ });
}

// iPhone в Safari (не с экрана Домой): подсказать установку
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
if (isIos && !standalone && !window.Capacitor) $('install').hidden = false;

// ---------- статистика (Google Analytics 4) ----------
// Пустой GA_ID - статистика выключена (свойство GA4 для приложения ещё не заведено).

const GA_ID = '';
const PLATFORM = window.Capacitor ? 'android_apk'
  : isIos ? (standalone ? 'iphone_app' : 'iphone_safari')
  : standalone ? 'web_app' : 'browser';
const VERSION = (window.APP_VERSION || '').replace(' от ', ' ').replace(/ \d\d:\d\d$/, '');

function deviceId() {
  let id = load('device', null);
  if (!id) {
    id = Math.floor(Math.random() * 2e9) + '.' + Math.floor(Date.now() / 1000);
    store('device', id);
  }
  return id;
}

function track(name, params) {
  if (window.gtag) window.gtag('event', name, params);
}

if (GA_ID) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('set', 'user_properties', { platform: PLATFORM, app_version: VERSION });
  window.gtag('config', GA_ID, {
    client_id: deviceId(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.append(s);
}

// ---------- поделиться пунктом ----------
// Текст пункта целиком (даже если на экране его часть) и ссылка на место; без ссылки на приложение.
// Android - плагин Share, иначе системное меню браузера, иначе копирование в буфер.

let toastTimer = 0;

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { /* ок */ }
    ta.remove();
    return ok;
  }
}

async function shareItem() {
  const s = curScreen();
  if (s.h) return;
  const it = item(pos.b, pos.c, s.v);
  const where = pos.b === 0 ? 'Правила дорожного движения РБ, п. ' + it[0] : BOOKS[pos.b].n + ' (ПДД РБ), ' + (isSign(it) ? 'знак ' : 'п. ') + it[0];
  const text = it[1] + '\n' + where;
  try {
    if (plugins.Share) {
      await plugins.Share.share({ text, dialogTitle: 'Поделиться пунктом' });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return; // человек закрыл меню
  }
  toast(await copyText(text) ? 'Скопировано' : 'Не получилось скопировать');
}

$('share').addEventListener('click', shareItem);

// ---------- обновления Android-приложения (не из магазина) ----------
// android.json на сайте (пишет publish.py): code/name/url/notes - последний APK;
// web - последняя веб-часть: номер, минимальный APK (min_native), файлы с отпечатками SHA-256.
// Веб-часть обновляется тихо: модуль Capgo качает только изменённые файлы, включает новую версию,
// когда приложение свёрнуто или перезапущено, а если она не запустилась - возвращает прежнюю.
// Новый APK (иконка, модули телефона) - через окно «Обновить»: браузер, затем установщик Android.

const UPDATE_URL = 'https://artem-krotkov.github.io/pdd-study/android.json';
const UPDATE_TEXT = {
  title: 'Вышла версия {N}',
  go: 'Обновить',
  later: 'Позже',
  after: 'Скачивается новая версия. Когда загрузится - откройте файл и нажмите «Обновить» (если Android спросит разрешение на установку - разрешите). Место и история сохранятся.',
};
const updater = plugins.CapacitorUpdater;
let native = null; // {build: номер APK, version: '0.1.N'}
let updateLater = false;
let checking = false;
let webReady = 0;

// «Версия 0.1.12 от 22.10.2026 17:00 · приложение 0.1.10» (вторая часть - если APK старше веб-части)
function versionLine() {
  let s = 'Версия ' + (window.APP_VERSION || 'без номера');
  if (native && native.version && !String(window.APP_VERSION).startsWith(native.version + ' ')) s += ' · приложение ' + native.version;
  return s;
}

async function nativeInfo() {
  if (native || !plugins.App) return native;
  const i = await plugins.App.getInfo();
  native = { build: Number(i.build) || 0, version: i.version };
  if (window.gtag) window.gtag('set', 'user_properties', { apk_version: native.version });
  return native;
}

async function checkUpdate() {
  if (!window.Capacitor || checking) return;
  checking = true;
  try {
    const n = await nativeInfo();
    if (!n) return;
    const r = await fetch(UPDATE_URL + '?t=' + Date.now(), { cache: 'no-store' });
    const u = await r.json();
    if (u.code > n.build && u.url && !updateLater && $('update').hidden) showUpdate(u);
    const w = u.web;
    if (updater && w && w.code > (window.APP_WEB || 0) && n.build >= w.min_native && webReady !== w.code) {
      const { bundles } = await updater.list();
      let b = bundles.find((x) => x.version === w.name && x.status === 'success');
      if (!b) b = await updater.download({ url: UPDATE_URL, version: w.name, manifest: w.manifest });
      await updater.next({ id: b.id });
      webReady = w.code;
      track('web_update_ready', { to: w.name });
    }
  } catch (e) {
    /* нет сети или не скачалось - в другой раз */
  } finally {
    checking = false;
  }
}

function showUpdate(u) {
  const text = $('update-text');
  text.replaceChildren(node('b', '', UPDATE_TEXT.title.replace('{N}', u.name)));
  if (u.notes) text.append(document.createElement('br'), u.notes);
  $('update-go').textContent = UPDATE_TEXT.go;
  $('update-later').textContent = UPDATE_TEXT.later;
  $('update-buttons').hidden = false;
  $('update').hidden = false;
  body.classList.add('has-update');
  $('update-go').onclick = () => {
    track('update_click', { to: u.name });
    $('update-buttons').hidden = true;
    text.textContent = UPDATE_TEXT.after;
    location.href = u.url; // внешний адрес Capacitor открывает в браузере
  };
  $('update-later').onclick = () => {
    updateLater = true;
    $('update').hidden = true;
    body.classList.remove('has-update');
  };
  track('update_offer', { to: u.name });
}

checkUpdate();
if (plugins.App) plugins.App.addListener('resume', checkUpdate);

// при первом запуске справка открывается сама
if (!load('helpSeen', false)) {
  store('helpSeen', true);
  openHelp();
}

// кнопка «назад» Android: сначала закрыть меню, иначе свернуть приложение
if (plugins.App) {
  plugins.App.addListener('backButton', () => {
    if (!el.menu.hidden) {
      if (!el.menuBack.hidden) showMenuTab();
      else closeMenu();
    } else {
      plugins.App.minimizeApp();
    }
  });
}
