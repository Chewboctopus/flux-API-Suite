#!/usr/bin/env node
// FLUX Studio — local web launcher.
// Starts the Express server on a free localhost port and opens your browser.
//
//   node scripts/web-launch.mjs [--port 3000] [--no-open] [--check]
//
//   --port N    first port to try (default 3000; tries the next 20 if busy)
//   --no-open   don't open a browser tab
//   --check     start, confirm the UI responds, then exit (used for testing)

import net from 'node:net';
import { homedir } from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const check = args.includes('--check');
const portIdx = args.indexOf('--port');
const startPort = Number(portIdx !== -1 ? args[portIdx + 1] : process.env.PORT) || 3000;

// The server only listens on 127.0.0.1, so test that exact address.
const isFree = (port) => new Promise((resolve) => {
  const s = net.createServer();
  s.once('error', () => resolve(false));
  s.once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});

const get = (port, path) => new Promise((resolve) => {
  const req = http.get({ host: '127.0.0.1', port, path, timeout: 1500 }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', () => resolve(null));
  req.on('timeout', () => { req.destroy(); resolve(null); });
});

// Is this port already serving FLUX Studio? (server.js exposes /api/ping)
async function isFluxStudio(port) {
  const r = await get(port, '/api/ping');
  if (!r || r.status !== 200) return false;
  try { return JSON.parse(r.body).app === 'flux-studio'; } catch { return false; }
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'darwin' ? ['open', [url]] :
    process.platform === 'win32'  ? ['cmd', ['/c', 'start', '', url]] :
                                    ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch { /* the URL is printed below; user can open it manually */ }
}

async function waitForServer(port, ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const r = await get(port, '/');
    if (r && r.status === 200) return true;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  return false;
}

// ── Pick a port ──────────────────────────────────────────────────────────────
let port = null;
for (let p = startPort; p < startPort + 20; p++) {
  if (await isFree(p)) { port = p; break; }
  if (await isFluxStudio(p)) {
    const url = `http://localhost:${p}`;
    console.log(`\n  FLUX Studio is already running at ${url}`);
    if (!noOpen && !check) openBrowser(url);
    process.exit(0);
  }
}
if (port === null) {
  console.error(`\n  [ERROR] No free port found between ${startPort} and ${startPort + 19}.`);
  process.exit(1);
}

// ── Start the server in-process (server.js reads PORT when imported) ────────
// Per-user data folder (settings, saved API keys, history) — lives outside the
// project folder so it survives re-downloading or deleting the code.
function defaultDataDir() {
  const home = homedir();
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'FLUX Studio Web');
  if (process.platform === 'win32')  return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'FLUX Studio Web');
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'flux-studio-web');
}
process.env.DATA_DIR = process.env.DATA_DIR || defaultDataDir();
process.env.FLUX_WEB = '1';   // enables first-run folder choice + local credential storage in server.js
process.env.PORT = String(port);
await import(pathToFileURL(join(root, 'server.js')).href);

if (!(await waitForServer(port))) {
  console.error('\n  [ERROR] The server did not start. See messages above.');
  process.exit(1);
}

const url = `http://localhost:${port}`;
console.log('  ────────────────────────────────────────────────');
console.log(`  FLUX Studio is running at  ${url}`);
console.log('  Close this window (or press Ctrl+C) to stop.');
console.log(`  Settings & saved keys: ${process.env.DATA_DIR}`);
console.log('  ────────────────────────────────────────────────\n');

if (check) { console.log('  CHECK OK'); process.exit(0); }
if (!noOpen) openBrowser(url);
