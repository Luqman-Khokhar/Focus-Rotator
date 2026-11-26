'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = require('electron');
const path = require('path');
const { Scheduler } = require('./scheduler');
const { createStore } = require('./store');
const { raise, listWindows, chromeProfiles } = require('./switcher');

const APP_TITLE = 'Focus Rotator';
let win = null;
let tray = null;
let store = null;
let scheduler = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => showWindow());

function showWindow() {
  if (!win) return;
  win.show();
  win.focus();
}

function createWindow() {
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
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
}

function state() {
  const s = store.get();
  return { ...scheduler.snapshot(), targets: s.targets };
}

function push() {
  if (win && !win.isDestroyed()) win.webContents.send('state', state());
  rebuildTray();
}

function rebuildTray() {
  if (!tray) return;
  const st = scheduler.status;
  tray.setToolTip(APP_TITLE + ' - ' + st);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Hide window' : 'Show / edit', click: () => (win.isVisible() ? win.hide() : showWindow()) },
    { type: 'separator' },
    st === 'running'
      ? { label: 'Pause', click: () => { scheduler.pause(); push(); } }
      : { label: st === 'paused' ? 'Resume' : 'Start', click: () => { scheduler.start(); push(); } },
    { label: 'Switch now', enabled: st !== 'stopped', click: () => { scheduler.skip(); push(); } },
    { label: 'Stop', enabled: st !== 'stopped', click: () => { scheduler.stop(); push(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 22, height: 22 });
  tray = new Tray(img);
  tray.on('click', () => (win.isVisible() ? win.hide() : showWindow()));
  rebuildTray();
}

function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function registerIpc() {
  ipcMain.handle('state:get', () => state());
  ipcMain.handle('timer:start', () => { scheduler.start(); push(); });
  ipcMain.handle('timer:pause', () => { scheduler.pause(); push(); });
  ipcMain.handle('timer:stop', () => { scheduler.stop(); push(); });
  ipcMain.handle('timer:skip', () => { scheduler.skip(); push(); });
  ipcMain.handle('interval:set', (_e, sec) => { scheduler.setInterval(store.setIntervalSec(sec)); push(); });
  ipcMain.handle('targets:add', (_e, t) => {
    const added = store.add({ kind: str(t && t.kind, 10), label: str(t && t.label, 80), value: str(t && t.value, 500), wclass: str(t && t.wclass, 120), wid: str(t && t.wid, 20) });
    push(); return !!added;
  });
  ipcMain.handle('targets:remove', (_e, id) => { const i = store.remove(str(id, 60)); if (i >= 0) scheduler.targetRemoved(i); push(); });
  ipcMain.handle('targets:move', (_e, id, dir) => {
    const s = store.get().targets;
    const i = s.findIndex((t) => t.id === id);
    const act = scheduler.activeIndex >= 0 ? s[scheduler.activeIndex] : null;
    if (store.move(str(id, 60), Number(dir) < 0 ? -1 : 1) && act) scheduler.activeIndex = store.get().targets.findIndex((t) => t.id === act.id);
    push(); return i;
  });
  ipcMain.handle('windows:list', async () => (await listWindows()).filter((w) => w.title && w.title !== APP_TITLE));
  ipcMain.handle('chrome:profiles', () => chromeProfiles());
  ipcMain.handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('win:hide', () => win.hide());
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
  createWindow();
  createTray();
  setInterval(() => { scheduler.tick(); push(); }, 500);
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});
