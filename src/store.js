'use strict';
const fs = require('fs');
const path = require('path');

const MIN_SEC = 5;
const MAX_SEC = 24 * 3600;
const KINDS = new Set(['window', 'chrome', 'code']);

function clean(t) {
  if (!t || typeof t !== 'object' || !KINDS.has(t.kind)) return null;
  const label = String(t.label || '').trim().slice(0, 80);
  const value = String(t.value || '').trim().slice(0, 500);
  if (!label || !value) return null;
  const out = { id: String(t.id || Date.now() + Math.random().toString(36).slice(2, 6)), kind: t.kind, label, value };
  if (t.kind === 'window') {
    out.wclass = String(t.wclass || '').trim().slice(0, 120);
    out.wid = String(t.wid || '').trim().slice(0, 20);
  }
  return out;
}

function clampSec(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return 180;
  return Math.min(MAX_SEC, Math.max(MIN_SEC, n));
}

function createStore(file) {
  let data = { intervalSec: 180, targets: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.intervalSec = clampSec(raw.intervalSec);
    data.targets = (Array.isArray(raw.targets) ? raw.targets : []).map(clean).filter(Boolean);
  } catch (_) { /* first run or corrupt file: defaults */ }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return {
    get: () => data,
    setIntervalSec(n) { data.intervalSec = clampSec(n); save(); return data.intervalSec; },
    add(t) { const c = clean({ ...t, id: undefined }); if (!c) return null; data.targets.push(c); save(); return c; },
    remove(id) {
      const i = data.targets.findIndex((t) => t.id === id);
      if (i === -1) return -1;
      data.targets.splice(i, 1); save(); return i;
    },
    move(id, dir) {
      const i = data.targets.findIndex((t) => t.id === id);
      const j = i + (dir < 0 ? -1 : 1);
      if (i === -1 || j < 0 || j >= data.targets.length) return false;
      [data.targets[i], data.targets[j]] = [data.targets[j], data.targets[i]];
      save(); return true;
    },
  };
}

module.exports = { createStore, clampSec, MIN_SEC, MAX_SEC };
