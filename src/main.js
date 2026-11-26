'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, powerMonitor } = require('electron');
const path = require('path');
const { Scheduler } = require('./scheduler');
const { createStore } = require('./store');
const { raise, listWindows, chromeProfiles } = require('./switcher');

// Low-footprint switches: UI is plain DOM, no GPU needed; cap renderer JS heap.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=32');
const APP_TITLE = 'Focus Rotator';
let win = null;
let tray = null;
let store = null;
let scheduler = null;
let timer = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

// The window is created on demand and destroyed when hidden, so the renderer
// (and GPU) processes cost nothing while the app sits in the tray.
function showWindow() {
  if (win) { win.show(); win.focus(); return; }
  win = new BrowserWindow({
    title: APP_TITLE,
    width: 340,
    height: 520,
    minWidth: 280,
    minHeight: 360,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    backgroundColor: '#14161a',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; rebuildTray(); });
  rebuildTray();
}

function state() {
  return { ...scheduler.snapshot(), targets: store.get().targets };
}

// Single place that reacts to any change: re-arm the one timer, update UI + tray.
function changed() {
  clearTimeout(timer);
  timer = null;
  if (scheduler.status === 'running') {
    const delay = Math.max(0, scheduler.endAt - Date.now()) + 5;
    timer = setTimeout(() => { scheduler.tick(); changed(); }, delay);
  }
  if (win) win.webContents.send('state', state());
  rebuildTray();
}

function rebuildTray() {
  if (!tray) return;
  const st = scheduler.status;
  tray.setToolTip(APP_TITLE + ' - ' + st);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win ? 'Hide window' : 'Show / edit', click: () => (win ? win.close() : showWindow()) },
    { type: 'separator' },
    st === 'running'
      ? { label: 'Pause', click: () => { scheduler.pause(); changed(); } }
      : { label: st === 'paused' ? 'Resume' : 'Start', click: () => { scheduler.start(); changed(); } },
    { label: 'Switch now', enabled: st !== 'stopped', click: () => { scheduler.skip(); changed(); } },
    { label: 'Stop', enabled: st !== 'stopped', click: () => { scheduler.stop(); changed(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 22, height: 22 });
  tray = new Tray(img);
  tray.on('click', () => (win ? win.close() : showWindow()));
  rebuildTray();
}

function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function registerIpc() {
  ipcMain.handle('state:get', () => state());
  ipcMain.handle('timer:start', () => { scheduler.start(); changed(); });
  ipcMain.handle('timer:pause', () => { scheduler.pause(); changed(); });
  ipcMain.handle('timer:stop', () => { scheduler.stop(); changed(); });
  ipcMain.handle('timer:skip', () => { scheduler.skip(); changed(); });
  ipcMain.handle('interval:set', (_e, sec) => { scheduler.setInterval(store.setIntervalSec(sec)); changed(); });
  ipcMain.handle('targets:add', (_e, t) => {
    const added = store.add({ kind: str(t && t.kind, 10), label: str(t && t.label, 80), value: str(t && t.value, 500), wclass: str(t && t.wclass, 120), wid: str(t && t.wid, 20) });
    changed(); return !!added;
  });
  ipcMain.handle('targets:action', (_e, id, action) => { const ok = store.setAction(str(id, 60), str(action, 10)); changed(); return ok; });
  ipcMain.handle('targets:remove', (_e, id) => { const i = store.remove(str(id, 60)); if (i >= 0) scheduler.targetRemoved(i); changed(); });
  ipcMain.handle('targets:move', (_e, id, dir) => {
    const s = store.get().targets;
    const i = s.findIndex((t) => t.id === id);
    const act = scheduler.activeIndex >= 0 ? s[scheduler.activeIndex] : null;
    if (store.move(str(id, 60), Number(dir) < 0 ? -1 : 1) && act) scheduler.activeIndex = store.get().targets.findIndex((t) => t.id === act.id);
    changed(); return i;
  });
  ipcMain.handle('windows:list', async () => (await listWindows()).filter((w) => w.title && w.title !== APP_TITLE));
  ipcMain.handle('chrome:profiles', () => chromeProfiles());
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('win:hide', () => { if (win) win.close(); });
  ipcMain.handle('win:quit', () => { quitting = true; app.quit(); });
}

app.whenReady().then(() => {
  store = createStore(path.join(app.getPath('userData'), 'state.json'));
  scheduler = new Scheduler({
    intervalSec: store.get().intervalSec,
    getCount: () => store.get().targets.length,
    onFire: (i) => { const t = store.get().targets[i]; if (t) raise(t); },
  });
  registerIpc();
  createTray();
  showWindow();
  // setTimeout runs on a monotonic clock that pauses during suspend: re-sync on wake.
  powerMonitor.on('resume', () => { scheduler.tick(); changed(); });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay alive in tray */ });
