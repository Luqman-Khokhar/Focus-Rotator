'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000 }, (err, stdout) => resolve({ ok: !err, out: stdout || '' }));
  });
}

// wmctrl -lx line: <id> <desktop> <class> <host> <title...>
function parseWindows(text) {
  return text.split('\n').map((line) => {
    const m = line.match(/^(0x[0-9a-f]+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s?(.*)$/i);
    if (!m) return null;
    return { wid: m[1], desktop: Number(m[2]), wclass: m[3], title: m[5].trim() };
  }).filter((w) => w && w.desktop !== -1); // -1 = panels/desktop
}

async function listWindows() {
  const r = await run('wmctrl', ['-lx']);
  return r.ok ? parseWindows(r.out) : [];
}

async function raiseWindow(t) {
  const all = await listWindows();
  const byId = all.find((w) => w.wid === t.wid && w.wclass === t.wclass);
  const byTitle = all.find((w) => w.wclass === t.wclass && w.title === t.value)
    || all.find((w) => w.wclass === t.wclass && w.title.includes(t.value));
  const hit = byId || byTitle;
  if (hit) return (await run('wmctrl', ['-i', '-a', hit.wid])).ok;
  return (await run('wmctrl', ['-a', t.value])).ok;
}

function chromeProfiles() {
  const bases = ['google-chrome', 'chromium'].map((b) => path.join(os.homedir(), '.config', b));
  for (const base of bases) {
    try {
      const st = JSON.parse(fs.readFileSync(path.join(base, 'Local State'), 'utf8'));
      const cache = (st.profile && st.profile.info_cache) || {};
      return Object.keys(cache).map((dir) => ({ dir, name: cache[dir].name || dir }));
    } catch (_) { /* try next */ }
  }
  return [];
}

function launchChrome(profileDir) {
  return run('google-chrome', ['--profile-directory=' + profileDir]).then((r) => r.ok);
}

function launchCode(folder) {
  return run('code', [folder]).then((r) => r.ok);
}

async function raise(t) {
  if (t.kind === 'window') return raiseWindow(t);
  if (t.kind === 'chrome') return launchChrome(t.value);
  if (t.kind === 'code') return launchCode(t.value);
  return false;
}

module.exports = { raise, listWindows, chromeProfiles, parseWindows };
