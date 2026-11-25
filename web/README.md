# FLUX Studio Web (standalone download)

A locally-run **web version** of FLUX Studio for people who can't install the desktop app
(no admin rights). Users unzip a folder, double-click a launcher, and FLUX Studio opens in
their browser. Everything stays on their computer.

## The rule: the desktop app is never modified

Nothing in `server.js`, `public/`, `electron/`, `package.json` or the existing release workflow is
changed by this folder. The web version is **built from them** at release time:

```
desktop sources (untouched) ──copy──▶ temp folder ──apply web/patches/web-layer.patch──▶
   + web/overlay/*  ──▶  "FLUX Studio Web/"  (launchers + README + app/)  ──▶  zip
```

| Path | What it is |
|---|---|
| `web/build.mjs` | The build. `node web/build.mjs` → `dist-web/` (git-ignored) |
| `web/patches/web-layer.patch` | The web-only edits to `server.js`, `public/app.js`, `index.html`, `index.css` (applied to the *copy*) |
| `web/overlay/web-setup.js` | Web-only front-end logic: first-run folder step, saved API keys, Settings → Storage buttons |
| `web/overlay/web-launch.mjs` | Starts the server on a free localhost port, opens the browser |
| `web/launchers/` | `start.command` (macOS/Linux) and `start.bat` (Windows); no admin rights, downloads a private checksum-verified Node if needed |
| `web/dist-readme.txt` | The `README.txt` users see in the download |
| `.github/workflows/web-release.yml` | Attaches the zip to each GitHub release |

## What the web version adds (all gated behind `FLUX_WEB=1`, set only by the launcher)

- **First launch:** asks where to save images/videos (default `~/Downloads/FLUX Studio`), native folder picker.
- **Remembers API keys** on the computer (`credentials.json`, mode 0600, in a per-user data folder outside
  the app folder), so they survive port changes, new browsers, and replacing the folder with a newer version.
- **Settings → Storage** works: change the images folder (optionally copying existing files), reveal folders.
- `/api/web/*` routes accept only localhost `Host`, same-origin `Origin`, and an `x-flux-web` header.

## Releases

On **Publish** of a GitHub release, `web-release.yml` builds the zip and uploads
`FLUX-Studio-Web-v<version>.zip` to that release. It is a separate workflow: if it fails, the desktop
release is unaffected. You can also run it by hand (Actions → *Web Release* → Run workflow → tag).
It needs the `web/` folder to exist at that tag, so it applies to releases made after this was added.

## Updating the patch

If the desktop code changes near one of the patch's edit points, `node web/build.mjs` fails and prints
the hunk that didn't apply. To fix it:

1. Copy the current `server.js`, `public/app.js`, `public/index.html`, `public/index.css` to a scratch folder
   and re-make the web edits there (the failing hunks show exactly where).
2. From a scratch git repo containing the *unmodified* desktop versions as the first commit, `git diff`
   the four files and save the result as `web/patches/web-layer.patch`.
3. Re-run `node web/build.mjs`.

## Known gaps

- `start.bat` (Windows) and the Windows folder picker have not been run on a real Windows machine.
- `web-release.yml` has not been run on GitHub yet; try *Run workflow* once after merging.
- A zip downloaded from the internet is quarantined by macOS: users must right-click → Open the
  launcher once (the bundled README says so).
- API keys are stored as plain text (owner-only permissions), not in the OS keychain.
