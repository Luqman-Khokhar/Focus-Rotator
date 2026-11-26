'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Scheduler } = require('../src/scheduler');
const { parseWindows } = require('../src/switcher');
const { clampSec } = require('../src/store');

function make(count = 3) {
  let t = 0; const fired = [];
  const s = new Scheduler({ intervalSec: 10, getCount: () => count, onFire: (i) => fired.push(i), now: () => t });
  return { s, fired, adv: (ms) => { t += ms; s.tick(); } };
}

test('rotates round-robin each interval', () => {
  const { s, fired, adv } = make();
  s.start();
  adv(10000); adv(10000); adv(10000); adv(10000);
  assert.deepStrictEqual(fired, [0, 1, 2, 0]);
});

test('pause keeps remaining time, resume continues', () => {
  const { s, fired, adv } = make();
  s.start(); adv(4000); s.pause();
  adv(60000);
  assert.deepStrictEqual(fired, []);
  assert.strictEqual(s.snapshot().remainingMs, 6000);
  s.start(); adv(6000);
  assert.deepStrictEqual(fired, [0]);
});

test('snapshot exposes endAt only while running', () => {
  const { s, adv } = make();
  assert.strictEqual(s.snapshot().endAt, 0);
  s.start(); adv(1000);
  assert.strictEqual(s.snapshot().endAt, 10000);
  s.pause();
  assert.strictEqual(s.snapshot().endAt, 0);
});

test('stop resets; skip fires now; no targets never fires', () => {
  const a = make(); a.s.start(); a.adv(3000); a.s.stop();
  assert.strictEqual(a.s.snapshot().remainingMs, 10000);
  assert.strictEqual(a.s.activeIndex, -1);
  const b = make(); b.s.start(); b.s.skip();
  assert.deepStrictEqual(b.fired, [0]);
  const c = make(0); c.s.start(); c.adv(10000);
  assert.deepStrictEqual(c.fired, []);
});

test('targetRemoved keeps index valid', () => {
  const { s, adv } = make(); s.start(); adv(10000); adv(10000);
  assert.strictEqual(s.activeIndex, 1);
  s.targetRemoved(0);
  assert.strictEqual(s.activeIndex, 0);
});

test('parseWindows drops panels, keeps titles with spaces', () => {
  const w = parseWindows('0x01 -1 xfce4-panel.Xfce4-panel h Panel\n0x02 0 Navigator.Google-chrome host My Tab - Google Chrome\n');
  assert.strictEqual(w.length, 1);
  assert.deepStrictEqual(w[0], { wid: '0x02', desktop: 0, wclass: 'Navigator.Google-chrome', title: 'My Tab - Google Chrome' });
});

test('store keeps wid for chrome targets', () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const { createStore } = require('../src/store');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fr-')), 's.json');
  const st = createStore(f);
  const t = st.add({ kind: 'chrome', label: 'Chrome: A', value: 'Profile 1', wclass: 'google-chrome.Google-chrome', wid: '0x03e00016' });
  assert.strictEqual(t.wid, '0x03e00016');
  assert.strictEqual(createStore(f).get().targets[0].wid, '0x03e00016');
});

test('matchesTarget only accepts the intended window', () => {
  const { matchesTarget, KEYS } = require('../src/switcher');
  const chromeW = { wid: '0x1', wclass: 'google-chrome.Google-chrome', title: 'x' };
  assert.ok(matchesTarget(chromeW, { kind: 'chrome', wid: '0x1' }));
  assert.ok(!matchesTarget(chromeW, { kind: 'chrome', wid: '0x2' }));
  assert.ok(!matchesTarget({ wid: '0x3', wclass: 'gnome-terminal.Gnome-terminal', title: 't' }, { kind: 'chrome' }));
  assert.ok(matchesTarget({ wid: '0x4', wclass: 'code.Code', title: 'f' }, { kind: 'code' }));
  assert.ok(matchesTarget(chromeW, { kind: 'window', wclass: 'google-chrome.Google-chrome' }));
  assert.deepStrictEqual(Object.keys(KEYS), ['scroll', 'tab']);
});

test('store validates and persists target action', () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const { createStore } = require('../src/store');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fr-')), 's.json');
  const st = createStore(f);
  const t = st.add({ kind: 'code', label: 'Code: x', value: '/tmp/x', action: 'bogus' });
  assert.strictEqual(t.action, 'none');
  assert.ok(st.setAction(t.id, 'tab'));
  assert.ok(!st.setAction(t.id, 'rm -rf'));
  assert.ok(!st.setAction('nope', 'scroll'));
  assert.strictEqual(createStore(f).get().targets[0].action, 'tab');
});

test('clampSec bounds', () => {
  assert.strictEqual(clampSec(1), 5);
  assert.strictEqual(clampSec('abc'), 180);
  assert.strictEqual(clampSec(999999), 86400);
});
