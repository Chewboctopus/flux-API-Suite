# FLUX Studio

A full-featured local desktop app and web UI for the [Black Forest Labs FLUX API](https://bfl.ai). Enter your BFL API key and get instant access to every FLUX model — Generate, Inpaint, Erase, Outpaint, Virtual Try-On, and Deblur.

All images are saved locally. No cloud account needed.

---

## Download & Install

Go to the [**Releases**](../../releases) page and download the installer for your platform:

| Platform | File | Notes |
|---|---|---|
| **macOS** | `FLUX.Studio-x.x.x.dmg` | Universal (Apple Silicon + Intel) |
| **Windows** | `FLUX.Studio-Setup-x.x.x.exe` | One-click silent installer |
| **Linux** | `FLUX.Studio-x.x.x.AppImage` | Run directly, no install needed |

### Windows — SmartScreen Warning

When you first run the installer, Windows may show:

> *"Windows protected your PC"*

This appears because the app is not code-signed (signing costs ~$400/yr). To proceed:
1. Click **"More info"**
2. Click **"Run anyway"**

### macOS — "App is damaged" Warning

Because the macOS builds are unsigned, Gatekeeper flags downloads from the web with a quarantine attribute. If you see:

> *"FLUX Studio is damaged and can't be opened. You should move it to the Trash."*

You can fix this in 5 seconds:
1. Drag **FLUX Studio** to your **Applications** folder.
2. Open your terminal app (Terminal, iTerm, etc.).
3. Run the following command to remove the quarantine flag:
   ```bash
   xattr -cr /Applications/FLUX\ Studio.app
   ```

The app is open source — you can review every line of code in this repo.

---

## Tools

| Tool | Model | What it does |
|---|---|---|
| **Generate** | FLUX.2 [pro/max/flex/klein], FLUX.1 legacy | Text-to-image with optional reference images (up to 8) |
| **Inpaint** | FLUX.1 Fill [pro] | Paint a mask and reprompt that region |
| **Erase** | FLUX Tools / Erase | Remove objects cleanly |
| **Outpaint** | FLUX Tools / Outpainting | Expand the canvas in any direction |
| **Try-On** | FLUX Tools / VTO | Virtual garment try-on |
| **Deblur** | FLUX Tools / Deblur | Restore sharp details from blurry images |

---

## Run from Source

If you prefer not to use the installer, you can run the app directly from the source code.

### Prerequisites

- [**Node.js 18+**](https://nodejs.org) — download the **LTS** installer for your platform and run it. This gives you the `node` and `npm` commands.

### Quick Start

Once Node.js is installed, just double-click the launcher for your platform:

| Platform | File | What it does |
|---|---|---|
| **Windows** | `start.bat` | Checks for Node.js → installs dependencies → starts the server |
| **macOS / Linux** | `start.sh` | Same as above (run `chmod +x start.sh` first on Linux) |

The launcher will tell you exactly what's wrong if anything is missing.

> [!WARNING]
> **Windows users:** Do **not** double-click `server.js` in File Explorer — that opens it in Windows Script Host, which cannot run this app. Use `start.bat` instead.

### Setup

1. **Clone or download** the repository:
   ```bash
   git clone https://github.com/your-username/flux-studio.git
   cd flux-studio
   ```

2. **Open a terminal in the project folder:**
   - **Windows:** Open the folder in File Explorer → click the address bar → type `cmd` → press Enter
   - **macOS:** Right-click the folder → *Open Terminal Here* (or drag it onto the Terminal icon)
   - **Linux:** Right-click → *Open in Terminal*

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **(Optional) Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to change the default port if needed. The API key is entered in the browser UI, not here.

### Running

| Command | What it does |
|---|---|
| `npm start` | Starts the Express server — open [http://localhost:3000](http://localhost:3000) in your browser |
| `npm run dev` | Same as above but auto-restarts on file changes (for development) |
| `npm run electron` | Launches the full desktop app (Electron window + embedded server) |

---

## How It Works

1. Enter your **BFL API key** → stored in your browser's `localStorage` only
2. Choose a tool and generate
3. Images are auto-saved to `data/outputs/` and logged to `data/generations.csv`

Your API key is never written to disk on the server — it's sent from your browser to the local Express server, which proxies it to `api.bfl.ai`.

---

## Architecture

```
Browser (SPA)
└── POST /api/generate  ─┐
    POST /api/inpaint    │
    POST /api/erase      ├──▶ Express (server.js) ──▶ api.bfl.ai
    POST /api/outpaint   │
    POST /api/vto        │
    POST /api/deblur    ─┘

Local storage: data/outputs/  data/uploads/  history.json  generations.csv
```

The Express backend exists solely to proxy BFL API calls (BFL doesn't support browser CORS). Everything else runs in the browser.

---

## Publishing a New Release

1. Bump the version in `package.json`
2. Commit and tag:
   ```bash
   git tag v1.2.3
   git push origin v1.2.3
   ```
3. GitHub Actions automatically builds macOS DMG, Windows EXE, and Linux AppImage and attaches them to a new GitHub Release.

---

## API Key Security

- Keys are stored in `localStorage`, keyed per browser session
- Keys are only sent to your own local server, which proxies to BFL
- Keys are never written to `data/` or any log file
