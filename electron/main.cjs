'use strict';
// ─── FLUX Studio — Electron Main Process ─────────────────────────────────────
// This file is intentionally CommonJS (.cjs) so it works in Electron's main
// process regardless of the project's "type": "module" setting.
// The Express server (server.js) is an ES module loaded via dynamic import().

const { app, BrowserWindow, shell, Menu, nativeImage } = require('electron');
const path   = require('path');
const http   = require('http');
const net    = require('net');
const { pathToFileURL } = require('url');

// ── Config ────────────────────────────────────────────────────────────────────
const IS_DEV   = !app.isPackaged;
const APP_NAME = 'FLUX Studio';

// Data lives in ~/Documents/FLUX Studio/ — easy for users to find outputs
const DATA_DIR = path.join(
  app.getPath('documents'),
  'FLUX Studio',
  'data'
);

let mainWindow = null;
let serverPort = null;

// ── Find a free port ──────────────────────────────────────────────────────────
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Poll until server responds ─────────────────────────────────────────────────
function waitForServer(port, retries = 40) {
  return new Promise((resolve, reject) => {
    const try_ = (n) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (n <= 0) { reject(new Error('Server failed to start')); return; }
        setTimeout(() => try_(n - 1), 250);
      });
      req.setTimeout(500, () => { req.destroy(); });
    };
    try_(retries);
  });
}

// ── Start the Express server in-process ───────────────────────────────────────
async function startServer() {
  serverPort = await findFreePort();

  // Set env vars BEFORE importing server.js so its top-level code picks them up
  process.env.PORT     = String(serverPort);
  process.env.DATA_DIR = DATA_DIR;
  process.env.ELECTRON = '1';

  const serverFile = IS_DEV
    ? path.join(__dirname, '..', 'server.js')
    : path.join(process.resourcesPath, 'app', 'server.js');

  await import(pathToFileURL(serverFile).href);
  await waitForServer(serverPort);
  console.log(`[Electron] Server ready on port ${serverPort}`);
}

// ── Create the main BrowserWindow ────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1440,
    height:   900,
    minWidth: 1024,
    minHeight: 640,
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#0d0d18',
    show: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Show a loading page immediately while the server boots
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOADING_HTML)}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Once server is ready, navigate to the app
  mainWindow.webContents.once('did-finish-load', async () => {
    await startServer();
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
  });

  // Open external links in the system browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // On macOS, show in dock with a proper name
  if (process.platform === 'darwin') {
    app.setName(APP_NAME);
  }
}

// ── Minimal loading page ──────────────────────────────────────────────────────
const LOADING_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    background: #0d0d18;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #fff;
    gap: 20px;
  }
  .logo { font-size: 42px; font-weight: 800; letter-spacing: -1px; }
  .logo span { color: #d4a843; }
  .sub { font-size: 13px; color: rgba(255,255,255,0.4); }
  .spinner {
    width: 28px; height: 28px;
    border: 3px solid rgba(212,168,67,0.2);
    border-top-color: #d4a843;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-top: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="logo">FLUX <span>Studio</span></div>
  <div class="sub">Starting local server…</div>
  <div class="spinner"></div>
</body>
</html>`;

// ── macOS menu (minimal) ──────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(IS_DEV ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
