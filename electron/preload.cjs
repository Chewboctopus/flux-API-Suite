'use strict';
// Minimal preload — context bridge for future use.
// Currently exposes nothing; the app talks to localhost directly.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
