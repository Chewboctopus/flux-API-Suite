#!/usr/bin/env bash
set -e

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║          FLUX Studio Launcher        ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── Check for Node.js ────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo "  [ERROR] Node.js is not installed."
    echo ""
    echo "  FLUX Studio requires Node.js 18 or newer to run from source."
    echo ""
    echo "  Install it:"
    echo "    • macOS:  brew install node   (or download from https://nodejs.org)"
    echo "    • Linux:  sudo apt install nodejs npm   (or see https://nodejs.org)"
    echo ""
    exit 1
fi

# ── Check Node.js version ────────────────────────────────────────────────────
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "  [ERROR] Node.js version is too old."
    echo "  Found: $(node -v)"
    echo "  Required: v18.0.0 or newer"
    echo ""
    echo "  Download the latest LTS from https://nodejs.org"
    exit 1
fi

echo "  [OK] Node.js found: $(node -v)"

# ── Change to script directory ───────────────────────────────────────────────
cd "$(dirname "$0")"

# ── Install dependencies if needed ───────────────────────────────────────────
if [ ! -d "node_modules" ]; then
    echo ""
    echo "  Installing dependencies (first run only)..."
    echo ""
    npm install
    echo ""
    echo "  [OK] Dependencies installed."
fi

# ── Start the server ─────────────────────────────────────────────────────────
echo ""
echo "  Starting FLUX Studio..."
echo "  Open your browser to: http://localhost:3000"
echo ""
echo "  (Press Ctrl+C to stop the server)"
echo ""
node server.js
