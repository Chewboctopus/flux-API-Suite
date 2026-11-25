#!/usr/bin/env node
/**
 * Builds the standalone "FLUX Studio Web" download from this repo.
 *
 *   node web/build.mjs [--out <dir>] [--no-zip]
 *
 * The desktop app's files are NEVER modified. The build:
 *   1. copies server.js, public/, package.json and package-lock.json to a temp folder,
 *   2. applies the web layer (web/patches/web-layer.patch) to that COPY,
 *   3. adds the web-only files (web/overlay/*),
 *   4. wraps it all in a clean folder: launchers + START HERE.html + README at the top, everything else in ./app,
 *   5. zips it.
 *
 * Output (default ./dist-web, git-ignored):
 *   dist-web/FLUX Studio Web/            ← the clean folder
 *   dist-web/FLUX-Studio-Web-v<ver>.zip  ← the standalone download
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outRoot = resolve(outIdx !== -1 ? args[outIdx + 1] : join(repo, 'dist-web'));
const makeZip = !args.includes('--no-zip');
const NAME = 'FLUX Studio Web';

const die = (msg) => { console.error(`\n  ✖ ${msg}\n`); process.exit(1); };
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const version = pkg.version || '0.0.0';

// Work outside any git repository so `git apply` treats paths as plain relative paths.
const stage = mkdtempSync(join(tmpdir(), 'flux-web-build-'));
const app = join(stage, NAME, 'app');

try {
  mkdirSync(join(app, 'scripts'), { recursive: true });

  // 1. copy the sources the web app needs (read-only: nothing in the repo is changed)
  for (const f of ['server.js', 'package.json', 'package-lock.json']) cpSync(join(repo, f), join(app, f));
  cpSync(join(repo, 'public'), join(app, 'public'), { recursive: true });

  // 2. apply the web layer to the copy
  try {
    execFileSync('git', ['apply', '--whitespace=nowarn', join(here, 'patches', 'web-layer.patch')], { cwd: app, stdio: 'pipe' });
  } catch (e) {
    die('The web layer no longer applies cleanly to the current desktop code.\n\n' +
        String(e.stderr || e.message).trim() +
        '\n\n  The desktop files changed near one of the web layer\'s edit points. See web/README.md → "Updating the patch".');
  }

  // 3. web-only files
  cpSync(join(here, 'overlay', 'web-setup.js'), join(app, 'public', 'web-setup.js'));
  cpSync(join(here, 'overlay', 'web-launch.mjs'), join(app, 'scripts', 'web-launch.mjs'));

  // 4. launchers + readme at the top level
  const top = join(stage, NAME);
  cpSync(join(here, 'launchers', 'start.command'), join(top, 'Start FLUX Studio.command'));
  cpSync(join(here, 'launchers', 'start.bat'), join(top, 'Start FLUX Studio.bat'));
  chmodSync(join(top, 'Start FLUX Studio.command'), 0o755);
  const stamp = new Date().toISOString().slice(0, 10);
  writeFileSync(join(top, 'README.txt'), `FLUX STUDIO WEB  -  version ${version}  (built ${stamp})\n\n` + readFileSync(join(here, 'dist-readme.txt'), 'utf8'));
  writeFileSync(join(top, 'START HERE.html'), readFileSync(join(here, 'start-here.html'), 'utf8').replaceAll('{{VERSION}}', 'v' + version));

  // 5. move into the output folder
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, '.gitignore'), '*\n');
  rmSync(join(outRoot, NAME), { recursive: true, force: true });
  cpSync(top, join(outRoot, NAME), { recursive: true });
  chmodSync(join(outRoot, NAME, 'Start FLUX Studio.command'), 0o755);

  // 6. zip (zip -X keeps the launcher executable on macOS/Linux)
  const zipPath = join(outRoot, `FLUX-Studio-Web-v${version}.zip`);
  rmSync(zipPath, { force: true });
  let zipped = false;
  if (makeZip && process.platform !== 'win32') {
    try { execFileSync('zip', ['-r', '-X', '-q', zipPath, NAME], { cwd: outRoot }); zipped = true; }
    catch { console.warn('  ⚠ `zip` not found: skipped the zip (the folder is still built).'); }
  } else if (makeZip) {
    console.warn('  ⚠ Zipping is skipped on Windows; zip the folder yourself.');
  }

  console.log(`\n  ✔ Built ${NAME} v${version}`);
  console.log(`    folder: ${join(outRoot, NAME)}`);
  for (const f of readdirSync(join(outRoot, NAME)).sort()) console.log(`       ${f}${f === 'app' ? '/' : ''}`);
  if (zipped) console.log(`    zip:    ${zipPath}`);
  console.log('');
} finally {
  rmSync(stage, { recursive: true, force: true });
}
