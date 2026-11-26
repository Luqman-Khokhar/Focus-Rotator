'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('rotator', {
  getState: call('state:get'),
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  start: call('timer:start'),
  pause: call('timer:pause'),
  stop: call('timer:stop'),
  skip: call('timer:skip'),
  setInterval: call('interval:set'),
  addTarget: call('targets:add'),
  removeTarget: call('targets:remove'),
  moveTarget: call('targets:move'),
  listWindows: call('windows:list'),
  chromeProfiles: call('chrome:profiles'),
  pickFolder: call('dialog:folder'),
  hide: call('win:hide'),
  quit: call('win:quit'),
});
