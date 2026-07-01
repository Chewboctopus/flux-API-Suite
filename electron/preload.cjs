'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Existing bridge
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});

// Settings / port management bridge
contextBridge.exposeInMainWorld('fluxApp', {
  /** Read the persisted config (port, dataDir, etc.) */
  getConfig:          ()          => ipcRenderer.invoke('flux:get-config'),
  /** Save a new port and relaunch the app */
  savePortAndRestart: (port)      => ipcRenderer.invoke('flux:save-port-restart', port),
  /** Relaunch without changing settings (after in-app config save) */
  restart:            ()          => ipcRenderer.invoke('flux:restart'),
  /** Open native folder picker, returns chosen path or null */
  pickFolder:         ()          => ipcRenderer.invoke('flux:pick-folder'),
  /** Save a new data directory and relaunch */
  saveDataDir:        (dataDir)   => ipcRenderer.invoke('flux:save-data-dir', dataDir),
  /** Reveal a folder/file in Finder / Explorer */
  revealInFinder:     (p)         => ipcRenderer.invoke('flux:reveal-in-finder', p),
});
