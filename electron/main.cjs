'use strict';
// ─── FLUX Studio — Electron Main Process ─────────────────────────────────────
// This file is intentionally CommonJS (.cjs) so it works in Electron's main
// process regardless of the project's "type": "module" setting.
// The Express server (server.js) is an ES module loaded via dynamic import().

const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require('electron');
const path   = require('path');
const http   = require('http');
const net    = require('net');
const fs     = require('fs');
const { pathToFileURL } = require('url');
const { autoUpdater } = require('electron-updater');

// ── Constants ─────────────────────────────────────────────────────────────────
const IS_DEV       = !app.isPackaged;
const APP_NAME     = 'FLUX Studio';
const DEFAULT_PORT = 4242;

// Data lives in ~/Documents/FLUX Studio/ by default; configurable via config.json
const DEFAULT_DATA_DIR = path.join(app.getPath('documents'), 'FLUX Studio', 'data');
// Config file always lives in the default location so we can bootstrap it
const CONFIG_FILE = path.join(DEFAULT_DATA_DIR, 'config.json');

let mainWindow = null;
let serverPort = null;

// ── Persistent config ─────────────────────────────────────────────────────────
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { port: DEFAULT_PORT }; }
}

function saveConfig(data) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error('Config save failed:', e.message); }
}

// Resolve the effective DATA_DIR (default or user-configured)
function getDataDir() {
  const config = loadConfig();
  return config.dataDir || DEFAULT_DATA_DIR;
}

// ── Port helpers ──────────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => { srv.close(() => resolve(true)); });
  });
}

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method: 'POST', timeout: 1500,
    };
    const req = http.request(opts, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ── Poll until server responds ────────────────────────────────────────────────
function waitForServer(port, retries = 40) {
  return new Promise((resolve, reject) => {
    const try_ = (n) => {
      const req = http.get(`http://127.0.0.1:${port}/api/ping`, (res) => { res.resume(); resolve(); });
      req.on('error', () => {
        if (n <= 0) { reject(new Error('Server failed to start')); return; }
        setTimeout(() => try_(n - 1), 250);
      });
      req.setTimeout(500, () => { req.destroy(); });
    };
    try_(retries);
  });
}


// ── Start the Express server in-process ──────────────────────────────────────
// Returns true if server started, false if port conflict (conflict UI shown).
async function startServer() {
  const config        = loadConfig();
  const preferredPort = config.port || DEFAULT_PORT;
  const free          = await isPortFree(preferredPort);

  if (!free) {
    // Is it our own app?
    let isOurApp = false;
    try {
      const ping = await httpGetJSON(`http://127.0.0.1:${preferredPort}/api/ping`);
      isOurApp = ping?.app === 'flux-studio';
    } catch { /* not reachable or not HTTP */ }

    if (isOurApp) {
      // Kill the old instance, wait up to 3 s for the port to free
      console.log(`[Electron] Stopping existing FLUX Studio on port ${preferredPort}…`);
      await httpPost(`http://127.0.0.1:${preferredPort}/api/quit`);
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 250));
        if (await isPortFree(preferredPort)) break;
      }
      if (!await isPortFree(preferredPort)) {
        showPortConflictUI(preferredPort); return false;
      }
    } else {
      showPortConflictUI(preferredPort); return false;
    }
  }

  serverPort = preferredPort;
  process.env.PORT     = String(serverPort);
  process.env.DATA_DIR = getDataDir();
  process.env.ELECTRON = '1';

  const serverFile = IS_DEV
    ? path.join(__dirname, '..', 'server.js')
    : path.join(process.resourcesPath, 'app', 'server.js');

  await import(pathToFileURL(serverFile).href);
  await waitForServer(serverPort);
  console.log(`[Electron] Server ready on port ${serverPort}`);
  return true;
}

// ── Create the main BrowserWindow ────────────────────────────────────────────
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 1024, minHeight: 640,
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

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(LOADING_HTML)}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.once('did-finish-load', async () => {
    const started = await startServer();
    if (started) mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
    // If !started, showPortConflictUI() already loaded the conflict page
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open http/https URLs externally — never file:// or javascript:
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });


  if (process.platform === 'darwin') app.setName(APP_NAME);
}

// ── Show port conflict page (runs before server is up, uses IPC) ──────────────
function showPortConflictUI(blockedPort) {
  const html = CONFLICT_HTML
    .replace(/\{\{PORT\}\}/g, blockedPort)
    .replace(/\{\{SUGGEST\}\}/g, blockedPort + 1);
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// ── Loading HTML ──────────────────────────────────────────────────────────────
const LOADING_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d18;display:flex;flex-direction:column;align-items:center;
justify-content:center;height:100vh;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
color:#fff;gap:20px}
.logo{font-size:42px;font-weight:800;letter-spacing:-1px}
.logo span{color:#d4a843}
.sub{font-size:13px;color:rgba(255,255,255,0.4)}
.spinner{width:28px;height:28px;border:3px solid rgba(212,168,67,0.2);
border-top-color:#d4a843;border-radius:50%;animation:spin 0.8s linear infinite;margin-top:8px}
@keyframes spin{to{transform:rotate(360deg)}}
</style></head><body>
<div class="logo">FLUX <span>Studio</span></div>
<div class="sub">Starting local server…</div>
<div class="spinner"></div>
</body></html>`;

// ── Port conflict HTML (self-contained, uses window.fluxApp IPC) ──────────────
const CONFLICT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d0d18;display:flex;flex-direction:column;align-items:center;
justify-content:center;height:100vh;
font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
color:#fff;text-align:center;padding:40px;gap:0}
.logo{font-size:28px;font-weight:800;letter-spacing:-0.5px;margin-bottom:28px}
.logo span{color:#d4a843}
.card{background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
border-radius:16px;padding:36px 40px;max-width:520px;width:100%}
h2{font-size:17px;font-weight:700;margin-bottom:12px;color:#f59e0b}
p{font-size:13px;color:rgba(255,255,255,0.6);line-height:1.7;margin-bottom:18px}
.why{background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);
border-radius:10px;padding:14px 16px;font-size:12px;color:rgba(255,255,255,0.5);
line-height:1.65;text-align:left;margin-bottom:24px}
.why strong{color:#a5b4fc;display:block;margin-bottom:5px;font-size:11px;
text-transform:uppercase;letter-spacing:.06em}
label{display:block;font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:8px;text-align:left}
input[type=number]{width:100%;padding:10px 14px;
background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
border-radius:8px;color:#fff;font-size:15px;outline:none;margin-bottom:14px;
-moz-appearance:textfield}
input[type=number]:focus{border-color:#d4a843}
button{width:100%;padding:12px;background:#d4a843;color:#000;border:none;
border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
button:hover{background:#e8bc55}
.err{font-size:12px;color:#f87171;margin-top:10px;display:none}
</style></head><body>
<div class="logo">FLUX <span>Studio</span></div>
<div class="card">
  <h2>⚠ Port {{PORT}} is already in use</h2>
  <p>Another application (not FLUX Studio) is running on port <strong>{{PORT}}</strong>. Choose a different port to continue.</p>
  <div class="why">
    <strong>Why a fixed port matters</strong>
    FLUX Studio saves your API key and generation history using your browser's local storage, which is tied to the app's network port. If the port changes between launches, the app treats it as a fresh session — your API key and history appear gone. Pick a port you'll keep permanently.
  </div>
  <label for="pi">Port number (1024 – 65535)</label>
  <input type="number" id="pi" value="{{SUGGEST}}" min="1024" max="65535">
  <button onclick="save()">Use This Port &amp; Launch</button>
  <div class="err" id="err">Port must be between 1024 and 65535.</div>
</div>
<script>
function save(){
  const p=parseInt(document.getElementById('pi').value,10);
  if(!p||p<1024||p>65535){document.getElementById('err').style.display='block';return;}
  if(window.fluxApp) window.fluxApp.savePortAndRestart(p);
}
document.getElementById('pi').addEventListener('keydown',e=>{if(e.key==='Enter')save();});
</script>
</body></html>`;

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('flux:get-config', () => loadConfig());

ipcMain.handle('flux:save-port-restart', (_, port) => {
  const config = loadConfig();
  config.port  = parseInt(port, 10) || DEFAULT_PORT;
  saveConfig(config);
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('flux:restart', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('flux:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose FLUX Studio Data Folder',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Use This Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('flux:save-data-dir', (_, dataDir) => {
  const config = loadConfig();
  config.dataDir = dataDir;
  saveConfig(config);
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('flux:reveal-in-finder', (_, folderPath) => {
  shell.showItemInFolder(folderPath);
});

// ── macOS menu ────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
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

// ── Auto-update (GitHub Releases via electron-builder's publish config) ───────
// Note: macOS builds are currently unsigned (CSC_IDENTITY_AUTO_DISCOVERY is
// disabled in CI because there's no Apple Developer ID cert). Squirrel.Mac
// generally needs a signed, notarized app to apply updates reliably under
// Gatekeeper — so auto-update is expected to work on Windows/Linux now, but
// may silently fail to apply on macOS until the build is signed. It's safe to
// leave enabled either way: it just won't find/apply anything on mac.
function initAutoUpdate() {
  if (IS_DEV) return;
  autoUpdater.autoDownload = true;
  autoUpdater.on('error', (e) => console.error('[AutoUpdate] error:', e?.message || e));
  autoUpdater.on('update-available', (info) => console.log('[AutoUpdate] update available:', info?.version));
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdate] downloaded, will install on quit:', info?.version);
  });
  autoUpdater.checkForUpdatesAndNotify().catch((e) =>
    console.error('[AutoUpdate] check failed:', e?.message || e)
  );
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();
  initAutoUpdate();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

