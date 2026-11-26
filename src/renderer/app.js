'use strict';
const $ = (id) => document.getElementById(id);
const api = window.rotator;
const KIND_LABEL = { window: 'window', chrome: 'chrome', code: 'vs code' };
let last = null;
let clockTimer = null;
let editingInterval = false;

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + pad(m % 60) + ':' + pad(s % 60) : pad(m) + ':' + pad(s % 60);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Countdown is drawn locally from endAt; main only pushes state on change. Idles when hidden.
function tickClock() {
  clearTimeout(clockTimer);
  if (!last) return;
  const running = last.status === 'running';
  const rem = running ? Math.max(0, last.endAt - Date.now()) : last.remainingMs;
  $('clock').textContent = fmt(rem);
  if (running && !document.hidden) clockTimer = setTimeout(tickClock, (rem % 1000) + 20);
}
document.addEventListener('visibilitychange', tickClock);

function render(s) {
  last = s;
  tickClock();
  $('status').textContent = s.status === 'running' ? 'Running' : s.status === 'paused' ? 'Paused' : 'Stopped';
  $('toggle').textContent = s.status === 'running' ? 'Pause' : s.status === 'paused' ? 'Resume' : 'Start';
  $('skip').disabled = s.status === 'stopped' || s.targets.length === 0;
  $('stop').disabled = s.status === 'stopped';
  $('toggle').disabled = s.targets.length === 0 && s.status === 'stopped';
  if (!editingInterval) {
    $('minutes').value = Math.floor(s.intervalSec / 60);
    $('seconds').value = s.intervalSec % 60;
  }

  const ul = $('targets');
  ul.replaceChildren();
  $('empty').hidden = s.targets.length > 0;
  s.targets.forEach((t, i) => {
    const li = el('li', 'item' + (i === s.activeIndex ? ' active' : ''));
    li.appendChild(el('span', 'kind', KIND_LABEL[t.kind] || t.kind));
    const name = el('span', 'name', t.label);
    name.title = t.value;
    li.appendChild(name);
    if (i === s.activeIndex) li.appendChild(el('span', 'badge', 'NOW'));
    const mk = (txt, label, fn, disabled) => {
      const b = el('button', 'icon-btn', txt);
      b.setAttribute('aria-label', label + ' ' + t.label);
      b.disabled = !!disabled;
      b.addEventListener('click', fn);
      return b;
    };
    li.appendChild(mk('↑', 'Move up', () => api.moveTarget(t.id, -1), i === 0));
    li.appendChild(mk('↓', 'Move down', () => api.moveTarget(t.id, 1), i === s.targets.length - 1));
    li.appendChild(mk('×', 'Remove', () => api.removeTarget(t.id)));
    ul.appendChild(li);
  });
}

function openPicker(title) {
  $('picker').hidden = false;
  $('picker-title').textContent = title;
  $('picker-list').replaceChildren();
  $('picker-msg').hidden = true;
  $('picker-msg').className = 'msg';
}
function pickerMsg(text, isError) {
  $('picker-msg').textContent = text;
  $('picker-msg').className = 'msg' + (isError ? ' error' : '');
  $('picker-msg').hidden = false;
}
function addPickRow(kindLabel, name, onPick, keepOpen) {
  const li = el('li', 'item');
  li.appendChild(el('span', 'kind', kindLabel));
  li.appendChild(el('span', 'name', name));
  const b = el('button', 'btn small', 'Add');
  b.setAttribute('aria-label', 'Add ' + name);
  b.addEventListener('click', async () => { await onPick(); if (!keepOpen) $('picker').hidden = true; });
  li.appendChild(b);
  $('picker-list').appendChild(li);
}

$('add-window').addEventListener('click', async () => {
  openPicker('Open windows');
  pickerMsg('Loading...');
  try {
    const wins = await api.listWindows();
    if (!wins.length) return pickerMsg('No windows found. Is wmctrl installed?', true);
    $('picker-msg').hidden = true;
    wins.forEach((w) => addPickRow(w.wclass.split('.').pop(), w.title, () =>
      api.addTarget({ kind: 'window', label: w.title, value: w.title, wclass: w.wclass, wid: w.wid })));
  } catch (_) { pickerMsg('Could not list windows.', true); }
});

$('add-chrome').addEventListener('click', async () => {
  openPicker('Chrome profiles');
  try {
    const ps = await api.chromeProfiles();
    if (!ps.length) return pickerMsg('No Chrome profiles found.', true);
    ps.forEach((p) => addPickRow('chrome', p.name + ' (' + p.dir + ')', async () => {
      await pickChromeWindow(p);
    }, true));
  } catch (_) { pickerMsg('Could not read Chrome profiles.', true); }
});

// step 2: bind the profile to its already-open window so the switch raises it instead of opening a new one
async function pickChromeWindow(p) {
  openPicker('Which window is "' + p.name + '"?');
  pickerMsg('Loading...');
  const base = { kind: 'chrome', label: 'Chrome: ' + p.name, value: p.dir };
  let wins = [];
  try { wins = (await api.listWindows()).filter((w) => /chrom/i.test(w.wclass)); } catch (_) { /* fall through to launch-only */ }
  $('picker-msg').hidden = wins.length > 0;
  if (!wins.length) pickerMsg('No open Chrome windows found. Open the profile first, or add it as launch-only.', true);
  wins.forEach((w) => addPickRow('window', w.title, () => api.addTarget({ ...base, wclass: w.wclass, wid: w.wid })));
  addPickRow('launch', 'None - launch profile (may open a new window)', () => api.addTarget(base));
}

$('add-code').addEventListener('click', async () => {
  const folder = await api.pickFolder();
  if (!folder) return;
  await api.addTarget({ kind: 'code', label: 'Code: ' + folder.split('/').filter(Boolean).pop(), value: folder });
});

$('picker-close').addEventListener('click', () => { $('picker').hidden = true; });
$('toggle').addEventListener('click', () => (last && last.status === 'running' ? api.pause() : api.start()));
$('skip').addEventListener('click', () => api.skip());
$('stop').addEventListener('click', () => api.stop());
$('hide').addEventListener('click', () => api.hide());
$('quit').addEventListener('click', () => api.quit());
['minutes', 'seconds'].forEach((id) => {
  $(id).addEventListener('focus', () => { editingInterval = true; });
  $(id).addEventListener('blur', () => { editingInterval = false; });
  $(id).addEventListener('change', () => {
    const m = Math.max(0, Math.floor(Number($('minutes').value) || 0));
    const s = Math.min(59, Math.max(0, Math.floor(Number($('seconds').value) || 0)));
    api.setInterval(m * 60 + s); // main clamps to 5s..24h
  });
});

api.onState(render);
api.getState().then(render);
