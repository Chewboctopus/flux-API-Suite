#!/usr/bin/env bash
# FLUX Studio — local web version launcher (macOS / Linux).
# Double-click on macOS, or run:  bash "Start FLUX Studio.command"
# No admin rights needed: if Node.js 18+ isn't installed, a private copy is
# downloaded into ./app/.runtime (verified against nodejs.org's published checksums).
set -u

cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
APP="$ROOT/app"            # everything except this launcher lives in ./app
RUNTIME="$APP/.runtime"
MIN_NODE=18
NODE_LINE="${FLUX_NODE_LINE:-v24.x}"   # which Node release line to download if needed

[ -f "$APP/server.js" ] || { echo ""; echo "  [ERROR] The 'app' folder is missing next to this launcher. Re-extract the zip."; echo ""; read -r -p "  Press Enter to close..." _ || true; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║      FLUX Studio — Web Launcher      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

fail() {
  echo ""
  echo "  [ERROR] $1"
  echo ""
  read -r -p "  Press Enter to close..." _ || true
  exit 1
}

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# ── 1. Find a usable Node.js ─────────────────────────────────────────────────
NODE_BIN=""
if [ -z "${FLUX_FORCE_PORTABLE_NODE:-}" ] && command -v node >/dev/null 2>&1; then
  if [ "$(node_major node)" -ge "$MIN_NODE" ]; then NODE_BIN="$(command -v node)"; fi
fi

if [ -z "$NODE_BIN" ] && [ -x "$RUNTIME/node/bin/node" ]; then
  if [ "$(node_major "$RUNTIME/node/bin/node")" -ge "$MIN_NODE" ]; then
    NODE_BIN="$RUNTIME/node/bin/node"
  fi
fi

# ── 2. Otherwise download a private copy (no admin needed) ───────────────────
if [ -z "$NODE_BIN" ]; then
  echo "  Node.js $MIN_NODE+ not found — downloading a private copy (one time, ~40 MB)..."
  echo ""
  command -v curl >/dev/null 2>&1 || fail "curl is required to download Node.js."

  case "$(uname -s)" in
    Darwin) OS=darwin; EXT=tar.gz ;;
    Linux)  OS=linux;  EXT=tar.xz ;;
    *) fail "Unsupported OS: $(uname -s)" ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) ARCH=arm64 ;;
    x86_64|amd64)  ARCH=x64 ;;
    *) fail "Unsupported CPU: $(uname -m)" ;;
  esac

  BASE="https://nodejs.org/dist/latest-$NODE_LINE"
  TMP="$(mktemp -d "${TMPDIR:-/tmp}/flux-node.XXXXXX")"
  trap 'rm -rf "$TMP"' EXIT

  curl -fsSL "$BASE/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt" \
    || fail "Couldn't reach nodejs.org. Check your internet / proxy settings."
  LINE="$(grep -E " node-v[0-9.]+-$OS-$ARCH\.$EXT\$" "$TMP/SHASUMS256.txt" | head -1)"
  [ -n "$LINE" ] || fail "No Node.js build found for $OS-$ARCH."
  WANT_HASH="${LINE%% *}"
  FILE="${LINE##* }"

  curl -fL --progress-bar "$BASE/$FILE" -o "$TMP/$FILE" \
    || fail "Download failed."

  if command -v shasum >/dev/null 2>&1; then GOT_HASH="$(shasum -a 256 "$TMP/$FILE" | cut -d' ' -f1)"
  else GOT_HASH="$(sha256sum "$TMP/$FILE" | cut -d' ' -f1)"; fi
  [ "$GOT_HASH" = "$WANT_HASH" ] || fail "Checksum mismatch on the Node.js download — aborting."

  rm -rf "$RUNTIME/node"
  mkdir -p "$RUNTIME/node"
  tar -xf "$TMP/$FILE" -C "$RUNTIME/node" --strip-components=1 || fail "Couldn't unpack Node.js."
  NODE_BIN="$RUNTIME/node/bin/node"
  echo "  [OK] Private Node.js ready: $("$NODE_BIN" -v)"
fi

# npm and its scripts need `node` on PATH (they use #!/usr/bin/env node)
export PATH="$(dirname "$NODE_BIN"):$PATH"
echo "  [OK] Using Node.js $("$NODE_BIN" -v)"

# ── 3. Install web dependencies (express, multer — no Electron needed) ───────
STAMP="$APP/node_modules/.web-install-stamp"
CURRENT="$(cksum < "$APP/package-lock.json" 2>/dev/null || echo none)"
NEED_INSTALL=0
if [ ! -d "$APP/node_modules/express" ] || [ ! -d "$APP/node_modules/multer" ]; then
  NEED_INSTALL=1
elif [ -f "$STAMP" ] && [ "$(cat "$STAMP")" != "$CURRENT" ]; then
  NEED_INSTALL=1   # dependencies changed since our last install
fi

if [ "$NEED_INSTALL" = 1 ]; then
  echo ""
  echo "  Installing dependencies (first run, or after an update)..."
  echo ""
  (cd "$APP" && npm install --omit=dev --no-audit --no-fund) || fail "npm install failed. See messages above."
  echo "$CURRENT" > "$STAMP"
  echo ""
  echo "  [OK] Dependencies installed."
fi

# ── 4. Launch ────────────────────────────────────────────────────────────────
echo ""
echo "  Starting FLUX Studio..."
"$NODE_BIN" "$APP/scripts/web-launch.mjs" "$@"
STATUS=$?
if [ "$STATUS" -ne 0 ]; then fail "FLUX Studio exited with an error (code $STATUS)."; fi
