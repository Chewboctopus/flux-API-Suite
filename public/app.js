/* ═══════════════════════════════════════════════════════════════════════════
   FLUX Studio — app.js
   Vanilla ES module SPA: all tab controllers + mask painter + uploader
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ───────────────────────────────────────────────────────────────────
let API_KEY = localStorage.getItem('flux_api_key') || '';
let TOPAZ_KEY = localStorage.getItem('topaz_api_key') || '';

// ─── Toast ───────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const safeMsg = String(msg).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${safeMsg}</span>`;
  const container = document.getElementById('toast-container');
  if (container.children.length >= 5) container.firstElementChild?.remove();
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── API Client ──────────────────────────────────────────────────────────────
async function apiFetch(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-key': API_KEY },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Server error ${res.status} — unexpected response format`); }
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

async function apiGet(path) {
  // Use either API_KEY or TOPAZ_KEY to authenticate local requests like history or paths
  const authKey = API_KEY || TOPAZ_KEY;
  const res = await fetch(path, { headers: { 'x-key': authKey } });
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Server error ${res.status} — unexpected response format`); }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function topazFetch(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-topaz-key': TOPAZ_KEY },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Server error ${res.status} — unexpected response format`); }
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

async function topazGet(path) {
  const res = await fetch(path, { headers: { 'x-topaz-key': TOPAZ_KEY } });
  let data;
  try { data = await res.json(); }
  catch { throw new Error(`Server error ${res.status} — unexpected response format`); }
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─── Status bar helpers ───────────────────────────────────────────────────────
function startTimer(elapsedEl) {
  let s = 0;
  const t = setInterval(() => { s++; elapsedEl.textContent = `${s}s`; }, 1000);
  return () => clearInterval(t);
}

function showStatus(barId, textId = null, msg = '') {
  const bar = document.getElementById(barId);
  bar.classList.remove('hidden');
  if (textId && msg) document.getElementById(textId).textContent = msg;
}

function hideStatus(barId) {
  document.getElementById(barId).classList.add('hidden');
}

// ─── Upload helper ────────────────────────────────────────────────────────────
async function uploadFile(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed');
  return res.json(); // { url, name }
}

// ─── UploadZone class ─────────────────────────────────────────────────────────
class UploadZone {
  constructor(zoneId, fileId, previewId) {
    this.zone    = document.getElementById(zoneId);
    this.input   = document.getElementById(fileId);
    this.preview = previewId ? document.getElementById(previewId) : null;
    this.url     = null; // server url after upload
    this.objUrl  = null; // local object URL for display
    this._setup();
  }

  _setup() {
    this.input.addEventListener('change', e => this._handleFile(e.target.files[0]));

    // Explicit click handler: clicking anywhere on the zone opens the file dialog.
    // This is the most reliable cross-browser approach — z-index alone isn't enough
    // because the preview <img> can steal pointer events in some browsers.
    this.zone.addEventListener('click', (e) => {
      // Don't double-fire if the click actually hit the input itself
      if (e.target === this.input) return;
      e.stopPropagation();
      this.input.click();
    });

    this.zone.addEventListener('dragover', e => { e.preventDefault(); this.zone.classList.add('drag-over'); });
    this.zone.addEventListener('dragleave', () => this.zone.classList.remove('drag-over'));
    this.zone.addEventListener('drop', e => {
      e.preventDefault();
      this.zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) this._handleFile(f);
    });
  }

  async _handleFile(file) {
    if (!file) return;
    if (this.objUrl) URL.revokeObjectURL(this.objUrl);
    this.objUrl = URL.createObjectURL(file);
    if (this.preview) {
      this.preview.src = this.objUrl;
      this.preview.style.display = 'block';
      this.zone.classList.add('has-image');
    }
    try {
      const data = await uploadFile(file);
      this.url = data.url;
      this.onChange?.(this.objUrl, this.url);
    } catch (e) {
      toast('Upload failed: ' + e.message, 'error');
    }
  }

  setFromUrl(serverUrl) {
    this.url = serverUrl;
    this.objUrl = null; // no blob for server-side images
    if (this.preview) {
      this.preview.src = serverUrl;
      this.preview.style.display = 'block';
      this.zone.classList.add('has-image');
    }
    this.onChange?.(null, serverUrl); // enable dependent buttons (Paint Mask etc.)
  }

  clear() {
    this.url = null;
    if (this.objUrl) { URL.revokeObjectURL(this.objUrl); this.objUrl = null; }
    if (this.preview) { this.preview.src = ''; this.preview.style.display = 'none'; }
    this.zone.classList.remove('has-image');
    this.input.value = '';
  }
}

// ─── FullscreenPainter ────────────────────────────────────────────────────────
// Singleton fullscreen modal painter shared by Inpaint and Erase tabs.
class FullscreenPainter {
  constructor() {
    this.modal      = document.getElementById('painter-modal');
    this.sourceImg  = document.getElementById('pm-source-img');
    this.canvas     = document.getElementById('pm-canvas');
    this.ctx        = this.canvas.getContext('2d');

    // Off-screen BW mask canvas — always at natural image resolution
    this.offCanvas  = document.createElement('canvas');
    this.offCtx     = this.offCanvas.getContext('2d');

    this.painting   = false;
    this.mode       = 'paint';   // 'paint' | 'erase'
    this.brushSize  = 50;        // display px; converted to natural px on draw
    this.showOverlay = true;
    this._tab       = null;      // 'inpaint' | 'erase'
    this._callback  = null;      // called with b64 mask on Apply
    this._masks     = {};        // { inpaint: b64|null, erase: b64|null } — API export (black bg + white)
    // Alpha-preserving restore copies (transparent where unpainted). The API
    // export flattens onto opaque black, which — if used to restore the painter —
    // makes every pixel opaque and reads as "whole image selected". Restore from
    // these instead so an existing mask reopens exactly as it was left.
    this._maskRestore = {};      // { inpaint: dataURL|null, erase: dataURL|null }

    // Per-stroke undo history (ImageData snapshots of offCanvas taken BEFORE each
    // stroke/clear/invert). Capped to bound memory; freed on open/close.
    this._undoStack = [];
    this.UNDO_LIMIT = 20;

    this._setupToolbar();
    this._setupPointer();
  }

  /* ── Toolbar ── */
  _setupToolbar() {
    const brushEl = document.getElementById('pm-brush-size');
    const brushVal = document.getElementById('pm-brush-val');
    brushEl.addEventListener('input', () => {
      this.brushSize = +brushEl.value;
      brushVal.textContent = this.brushSize;
    });

    document.querySelectorAll('.pm-mode-btn').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.pm-mode-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        this.mode = b.dataset.mode;
      })
    );

    document.getElementById('pm-undo-btn').addEventListener('click',   () => this._undo());
    document.getElementById('pm-clear-btn').addEventListener('click',  () => this._clearMask());
    document.getElementById('pm-invert-btn').addEventListener('click', () => this._invertMask());
    document.getElementById('pm-overlay-toggle').addEventListener('change', e => {
      this.showOverlay = e.target.checked;
      this._redrawOverlay();
    });
    document.getElementById('pm-cancel-btn').addEventListener('click', () => this._close(false));
    document.getElementById('pm-done-btn').addEventListener('click',   () => this._close(true));

    // Keyboard: Escape cancels, Ctrl/Cmd+Enter applies, Ctrl/Cmd+Z undoes last stroke
    document.addEventListener('keydown', e => {
      if (this.modal.classList.contains('hidden')) return;
      if (e.key === 'Escape') this._close(false);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this._close(true);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        this._undo();
      }
    });
  }

  /* ── Pointer ── */
  _setupPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => {
      this.painting = true;
      c.setPointerCapture(e.pointerId);
      this._pushUndo(); // snapshot the mask BEFORE this stroke so ⌘Z can revert it
      this._paint(e);
    });
    c.addEventListener('pointermove',  e => { if (this.painting) this._paint(e); });
    c.addEventListener('pointerup',    () => { this.painting = false; });
    c.addEventListener('pointercancel',() => { this.painting = false; });
  }

  /* ── Coordinate transform: display → natural ── */
  _getPos(e) {
    const r  = this.canvas.getBoundingClientRect();
    // Display canvas coords (for overlay drawing)
    const dx = (e.clientX - r.left) * (this.canvas.width  / r.width);
    const dy = (e.clientY - r.top)  * (this.canvas.height / r.height);
    const dr = this.brushSize; // brush radius in display canvas pixels

    // Natural (full-res) coords for the offscreen mask canvas
    const invScale = 1 / (this._displayScale || 1);
    return {
      // display canvas coords
      dx, dy, dr,
      // offscreen mask coords (natural resolution)
      x: dx * invScale,
      y: dy * invScale,
      r: dr * invScale,
    };
  }

  /* ── Core paint stroke ── */
  _paint(e) {
    const pos = this._getPos(e);
    // Display canvas coords (for overlay)
    const px = pos.dx, py = pos.dy, pr = pos.dr;
    // Natural resolution coords (for offscreen mask)
    const ox = pos.x,  oy = pos.y,  or_ = pos.r;

    if (this.mode === 'paint') {
      // Off-screen mask: add white at natural resolution
      const mg = this.offCtx.createRadialGradient(ox, oy, 0, ox, oy, or_);
      mg.addColorStop(0,   'rgba(255,255,255,1)');
      mg.addColorStop(0.6, 'rgba(255,255,255,0.9)');
      mg.addColorStop(1,   'rgba(255,255,255,0)');
      this.offCtx.globalCompositeOperation = 'source-over';
      this.offCtx.fillStyle = mg;
      this.offCtx.beginPath(); this.offCtx.arc(ox, oy, or_, 0, Math.PI * 2); this.offCtx.fill();

      // Display overlay: add red at display resolution
      if (this.showOverlay) {
        const dg = this.ctx.createRadialGradient(px, py, 0, px, py, pr);
        dg.addColorStop(0,   'rgba(255,60,60,0.6)');
        dg.addColorStop(0.6, 'rgba(255,60,60,0.45)');
        dg.addColorStop(1,   'rgba(255,60,60,0)');
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = dg;
        this.ctx.beginPath(); this.ctx.arc(px, py, pr, 0, Math.PI * 2); this.ctx.fill();
      }
    } else {
      // Off-screen mask: erase (destination-out)
      const mg = this.offCtx.createRadialGradient(ox, oy, 0, ox, oy, or_);
      mg.addColorStop(0,   'rgba(0,0,0,1)');
      mg.addColorStop(0.6, 'rgba(0,0,0,0.85)');
      mg.addColorStop(1,   'rgba(0,0,0,0)');
      this.offCtx.globalCompositeOperation = 'destination-out';
      this.offCtx.fillStyle = mg;
      this.offCtx.beginPath(); this.offCtx.arc(ox, oy, or_, 0, Math.PI * 2); this.offCtx.fill();
      this.offCtx.globalCompositeOperation = 'source-over';

      // Display overlay: punch out
      if (this.showOverlay) {
        const dg = this.ctx.createRadialGradient(px, py, 0, px, py, pr);
        dg.addColorStop(0,   'rgba(0,0,0,1)');
        dg.addColorStop(0.6, 'rgba(0,0,0,0.85)');
        dg.addColorStop(1,   'rgba(0,0,0,0)');
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.fillStyle = dg;
        this.ctx.beginPath(); this.ctx.arc(px, py, pr, 0, Math.PI * 2); this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ── Undo (per-stroke ImageData snapshots) ── */
  _pushUndo() {
    const w = this.offCanvas.width, h = this.offCanvas.height;
    if (!w || !h) return;
    this._undoStack.push(this.offCtx.getImageData(0, 0, w, h));
    if (this._undoStack.length > this.UNDO_LIMIT) this._undoStack.shift();
    this._updateUndoBtn();
  }

  _undo() {
    if (!this._undoStack.length) return;
    const snap = this._undoStack.pop();
    this.offCtx.putImageData(snap, 0, 0);
    this._redrawOverlay();
    this._updateUndoBtn();
  }

  _updateUndoBtn() {
    const btn = document.getElementById('pm-undo-btn');
    if (btn) btn.disabled = this._undoStack.length === 0;
  }

  _clearMask() {
    this._pushUndo(); // clearing is undoable
    this.offCtx.clearRect(0, 0, this.offCanvas.width, this.offCanvas.height);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _invertMask() {
    this._pushUndo(); // inverting is undoable
    // Pixel-flip: invert R/G/B of every pixel in the mask canvas
    const w = this.offCanvas.width, h = this.offCanvas.height;
    const id = this.offCtx.getImageData(0, 0, w, h);
    for (let i = 0; i < id.data.length; i += 4) {
      id.data[i]   = 255 - id.data[i];
      id.data[i+1] = 255 - id.data[i+1];
      id.data[i+2] = 255 - id.data[i+2];
    }
    this.offCtx.putImageData(id, 0, 0);
    this._redrawOverlay();
  }

  _redrawOverlay() {
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);
    if (!this.showOverlay) return;
    // Draw mask, then tint painted pixels red using source-in
    this.ctx.save();
    this.ctx.globalAlpha = 0.55;
    // offCanvas is at natural resolution; scale it down to the (possibly smaller)
    // display canvas so the overlay lines up on large images too.
    this.ctx.drawImage(this.offCanvas, 0, 0, w, h);
    this.ctx.globalCompositeOperation = 'source-in';
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = 'rgb(255,60,60)';
    this.ctx.fillRect(0, 0, w, h);
    this.ctx.restore();
  }

  /* ── Open modal ── */
  open(tab, imgSrc) {
    this._tab = tab;
    document.getElementById('pm-title').textContent =
      tab === 'inpaint' ? 'Mask Painter — Inpaint' : 'Mask Painter — Erase';

    // Reset mode buttons
    document.querySelectorAll('.pm-mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('pm-paint-btn').classList.add('active');
    this.mode = 'paint';

    this.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Load source image
    this.sourceImg.onload = () => this._initCanvas();
    this.sourceImg.src = imgSrc;
    // If already cached
    if (this.sourceImg.complete && this.sourceImg.naturalWidth) this._initCanvas();
  }

  _initCanvas() {
    const nw = this.sourceImg.naturalWidth;
    const nh = this.sourceImg.naturalHeight;
    if (!nw || !nh) return; // image not yet decoded

    document.getElementById('pm-dims-label').textContent = `${nw} × ${nh}`;

    // Off-screen mask canvas stays at FULL natural resolution for export quality
    this.offCanvas.width  = nw;
    this.offCanvas.height = nh;
    this.offCtx.clearRect(0, 0, nw, nh);

    // Display canvas: cap at 2048px on the long edge to avoid GPU pressure on large images.
    // Brush coordinates are scaled back to natural resolution when painting offCanvas.
    const MAX_DISPLAY = 2048;
    const scale = Math.min(1, MAX_DISPLAY / Math.max(nw, nh));
    const dw = Math.round(nw * scale);
    const dh = Math.round(nh * scale);
    this.canvas.width  = dw;
    this.canvas.height = dh;
    this._displayScale = scale; // store for coordinate transform
    this.ctx.clearRect(0, 0, dw, dh);

    // Fresh painter session → empty undo history
    this._undoStack = [];
    this._updateUndoBtn();

    // Restore previous mask for this tab if any. Use the alpha-preserving copy
    // (transparent where unpainted) — NOT the API export, which is flattened onto
    // opaque black and would make the whole image read as painted on reopen.
    const existing = this._maskRestore[this._tab];
    if (existing) {
      const m = new Image();
      m.onload = () => {
        this.offCtx.clearRect(0, 0, nw, nh);
        this.offCtx.drawImage(m, 0, 0, nw, nh);
        this._redrawOverlay();
      };
      m.src = existing;
    }
  }

  _close(apply) {
    if (apply) {
      const b64 = this._exportMask();
      this._masks[this._tab] = b64;
      // Persist an alpha-preserving copy so reopening restores the exact strokes
      // (transparent where unpainted) rather than a fully-opaque select-all.
      this._maskRestore[this._tab] = this.offCanvas.toDataURL('image/png');
      this._callback?.(b64, this._tab);
    }
    this._undoStack = []; // don't leak snapshots between sessions
    this.modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  _exportMask() {
    // Compose: black background + white painted areas
    const out = document.createElement('canvas');
    out.width = this.offCanvas.width; out.height = this.offCanvas.height;
    const oc = out.getContext('2d');
    oc.fillStyle = 'black';
    oc.fillRect(0, 0, out.width, out.height);
    oc.drawImage(this.offCanvas, 0, 0);
    return out.toDataURL('image/png').split(',')[1];
  }

  hasMask(tab) { return !!(this._masks[tab]); }
  getMask(tab) { return this._masks[tab]; }
  clearMaskFor(tab) { delete this._masks[tab]; delete this._maskRestore[tab]; }
}

const painter = new FullscreenPainter();

// Wire the Apply callback: show thumbnail in sidebar
painter._callback = (b64, tab) => {
  const thumb = document.getElementById(`${tab}-mask-thumb`);
  const hint  = document.getElementById(`${tab}-mask-empty-hint`);
  if (thumb) {
    const nw = painter.offCanvas.width;
    const nh = painter.offCanvas.height;
    if (!nw || !nh) { toast('Mask applied ✓', 'success'); return; }

    // Fit to sidebar width maintaining aspect ratio
    const TW = 280;
    const TH = Math.round(TW * nh / nw);
    thumb.width  = TW;
    thumb.height = TH;
    const tc = thumb.getContext('2d');

    // ① Source image as background so you can see context
    const srcImg = painter.sourceImg;
    if (srcImg && srcImg.naturalWidth) {
      tc.drawImage(srcImg, 0, 0, TW, TH);
    } else {
      tc.fillStyle = '#0d0d18';
      tc.fillRect(0, 0, TW, TH);
    }

    // ② Red overlay clipped to painted strokes only.
    //    offCanvas: transparent = not painted, white-opaque = painted.
    //    destination-in clips the fill to wherever offCanvas has opacity.
    const overlay = document.createElement('canvas');
    overlay.width = TW; overlay.height = TH;
    const oc = overlay.getContext('2d');
    oc.fillStyle = 'rgba(255,50,50,0.72)';
    oc.fillRect(0, 0, TW, TH);
    oc.globalCompositeOperation = 'destination-in';
    oc.drawImage(painter.offCanvas, 0, 0, TW, TH);

    // ③ Composite onto source image
    tc.drawImage(overlay, 0, 0);

    thumb.classList.remove('hidden');
    if (hint) hint.style.display = 'none';
  }
  toast('Mask applied ✓', 'success');
};

// Drop any stored/persisted mask for a tab and reset its sidebar UI. Called when a
// new source image is loaded so a mask painted on the previous image is never
// restored onto (or submitted against) a different image.
function resetMaskUI(tab) {
  painter.clearMaskFor(tab);
  const thumb = document.getElementById(`${tab}-mask-thumb`);
  const hint  = document.getElementById(`${tab}-mask-empty-hint`);
  if (thumb) thumb.classList.add('hidden');
  if (hint)  hint.style.display = '';
}


// ─── HTML escaping helper (prevents innerHTML corruption from user prompts) ────
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Decide which way a "Send to" dropdown opens. It's anchored above its trigger by
// default, but result/history cards sit at the top of the grid where there's no room
// above — the menu would clip into the top nav. Flip it below when above is too tight.
function placeSendToMenu(triggerBtn, menu) {
  menu.classList.remove('open-down');
  const btnRect = triggerBtn.getBoundingClientRect();
  const menuH   = menu.offsetHeight || 280; // measurable now that it's un-hidden
  const spaceAbove = btnRect.top;
  const spaceBelow = window.innerHeight - btnRect.bottom;
  if (spaceAbove < menuH + 16 && spaceBelow > spaceAbove) menu.classList.add('open-down');
}

// ─── Result card builder ──────────────────────────────────────────────────────
function buildResultCard(entry, onSendInpaint, onSendGenerate) {
  const card = document.createElement('div');
  card.className = 'result-card';
  const shortId = entry.id?.slice(-8) || '—';
  const cost = entry.cost != null ? `${entry.cost}cr` : '';
  const seed = entry.seed ? `seed:${entry.seed}` : '';
  const hasRef = Boolean(entry._refPreviewUrl);

  card.innerHTML = `
    <div class="rc-img-wrap" style="position:relative;">
      <img src="${escHtml(entry.image_url)}" alt="${escHtml(entry.prompt)}" loading="lazy">
      <span class="rc-ab-label" style="display:none;"></span>
    </div>
    <div class="result-card-body">
      <div class="result-meta">${[shortId, cost, seed].filter(Boolean).join(' · ')}</div>
      <div class="result-actions">
        <a class="btn btn-secondary" href="${escHtml(entry.image_url)}" download target="_blank">↓</a>
        <button class="btn btn-secondary" data-action="copy" title="Copy to clipboard">📋</button>
        ${hasRef ? '<button class="btn btn-secondary" data-action="ab" title="Toggle A/B compare with reference">A⇄B</button>' : ''}
        <div class="rc-sendto-wrap">
          <button class="btn btn-primary btn-sm" data-action="sendto">Send to ▾</button>
          <div class="lb-sendto-menu hidden rc-sendto-menu">
            <button data-sendto="generate">🎨 Generate <span class="lb-sendto-hint">as ref</span></button>
            <button data-sendto="inpaint">🖌 Inpaint</button>
            <button data-sendto="erase">🧹 Erase</button>
            <button data-sendto="outpaint">📐 Outpaint</button>
            <button data-sendto="vto">👕 Try-On</button>
            <button data-sendto="deblur">🔍 Deblur</button>
            <button data-sendto="upscale">🔬 Upscale <span class="lb-sendto-hint">Topaz</span></button>
          </div>
        </div>
      </div>
    </div>`;

  const cardImg   = card.querySelector('img');
  const abLabel   = card.querySelector('.rc-ab-label');
  let   abState   = 'generated';
  const rcMenu    = card.querySelector('.rc-sendto-menu');

  cardImg.addEventListener('click', () => openLightbox(entry));

  card.querySelector('[data-action=copy]').addEventListener('click', () => copyImageToClipboard(entry.image_url));

  card.querySelector('[data-action=sendto]').addEventListener('click', (e) => {
    e.stopPropagation();
    // Close all other open menus first
    document.querySelectorAll('.rc-sendto-menu').forEach(m => { if (m !== rcMenu) m.classList.add('hidden'); });
    rcMenu.classList.toggle('hidden');
    if (!rcMenu.classList.contains('hidden')) placeSendToMenu(e.currentTarget, rcMenu);
  });
  rcMenu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sendto]');
    if (!btn) return;
    rcMenu.classList.add('hidden');
    sendToTool(btn.dataset.sendto, entry.image_url, entry);
  });

  if (hasRef) {
    card.querySelector('[data-action=ab]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (abState === 'generated') {
        cardImg.src = entry._refPreviewUrl;
        abLabel.textContent = '📷 Reference';
        abLabel.style.display = 'block';
        abState = 'ref';
      } else {
        cardImg.src = entry.image_url;
        abLabel.textContent = '✨ Generated';
        abLabel.style.display = 'block';
        abState = 'generated';
        // Hide label after 1.5s when back to generated
        clearTimeout(card._abLabelTimer);
        card._abLabelTimer = setTimeout(() => { abLabel.style.display = 'none'; }, 1500);
      }
    });
  }

  return card;
}


// ─── Lightbox ─────────────────────────────────────────────────────────────────
let _lightboxEntry = null;
let _lbAbState = 'generated';

// ── Lightbox navigation context ──────────────────────────────────────────────
let _lbList  = [];   // ordered list of entries visible when lightbox was opened
let _lbIndex = -1;   // position of current entry in _lbList

// ─── Resize the lightbox panel to fit the OUTPUT image's aspect ratio ─────────
function _lbSizePanelToEntry(entry) {
  const inner = document.querySelector('.lightbox-inner');
  if (!inner) return;

  // Prefer stored metadata; fall back to the loaded img natural size
  const img = _lbImg();
  const nW = entry.width  || img?.naturalWidth  || 0;
  const nH = entry.height || img?.naturalHeight || 0;
  if (!nW || !nH) { inner.style.removeProperty('aspect-ratio'); return; }

  // Let CSS handle max-width/max-height (90vw × 90vh) — just set the ratio
  inner.style.aspectRatio = `${nW} / ${nH}`;
}

function openLightbox(entry, contextList, contextIndex) {

  _lightboxEntry = entry;
  _lbAbState = 'generated';

  // Set nav context — if provided use it, otherwise try to rebuild from current tab
  if (contextList && contextIndex != null) {
    _lbList  = contextList;
    _lbIndex = contextIndex;
  } else {
    // Auto-build from whatever is currently rendered in history or result grids
    _lbList  = [];
    _lbIndex = -1;
  }
  _lbUpdateNav();

  lbZoomReset(true); // reset pan/zoom for every new image
  document.getElementById('lb-sendto-menu')?.classList.add('hidden'); // always start closed

  const lbImg    = document.getElementById('lightbox-img');
  const lbLabel  = document.getElementById('lightbox-ab-label');
  const lbAbBtn  = document.getElementById('lightbox-ab');

  lbImg.src = entry.image_url;
  lbLabel.style.display = 'none';

  // Resize panel to OUTPUT image aspect ratio (portrait vs landscape)
  _lbSizePanelToEntry(entry);
  // Also update on load in case width/height not stored for old entries
  lbImg.onload = () => _lbSizePanelToEntry(entry);

  document.getElementById('lightbox-prompt').textContent = entry.prompt || '(no prompt)';
  const details = [entry.model, entry.output_format, entry.width && `${entry.width}×${entry.height}`, entry.seed && `seed:${entry.seed}`, entry.cost && `${entry.cost}cr`].filter(Boolean).join(' · ');
  document.getElementById('lightbox-detail').textContent = details;
  document.getElementById('lightbox-download').href = entry.image_url;
  document.getElementById('lightbox-download').download = entry.local_file || 'output';

  // A/B button — works for:
  //   • Generate results that have a _refPreviewUrl (reference image)
  //   • Tool results (erase/inpaint/outpaint/vto/deblur) that have an input_url (before image)
  const beforeUrl  = entry._refPreviewUrl || entry.input_url || null;
  const isToolAB   = !!entry.input_url && !entry._refPreviewUrl;
  const labelBefore = isToolAB ? '📷 Before' : '📷 Reference';
  const labelAfter  = isToolAB ? '✨ After'  : '✨ Generated';
  const isOutpaint  = entry.tool === 'outpaint' && !!entry.input_url;

  if (beforeUrl) {
    lbAbBtn.style.display = '';
    lbAbBtn.onclick = async () => {
      if (_lbAbState === 'generated') {
        // For outpaint: build an aligned composite so source aligns with the output
        if (isOutpaint) {
          lbLabel.textContent = '⏳ Aligning…';
          lbLabel.style.display = 'block';
          lbImg.src = await _compositeOutpaintBefore(entry);
          lbLabel.textContent = '📷 Before (aligned)';
        } else {
          lbImg.src = beforeUrl;
          lbLabel.textContent = labelBefore;
          lbLabel.style.display = 'block';
        }
        _lbAbState = 'ref';
      } else {
        lbImg.src = entry.image_url;
        lbLabel.textContent = labelAfter;
        lbLabel.style.display = 'block';
        _lbAbState = 'generated';
        setTimeout(() => { if (_lbAbState === 'generated') lbLabel.style.display = 'none'; }, 1500);
      }
    };
  } else {
    lbAbBtn.style.display = 'none';
    lbAbBtn.onclick = null;
  }


  // Reload Settings button — show only when entry has a known tool
  const reloadBtn = document.getElementById('lightbox-reload');
  if (entry.tool && entry.tool !== 'unknown') {
    reloadBtn.style.display = '';
    reloadBtn.onclick = () => { reloadEntrySettings(entry); document.getElementById('lightbox').classList.add('hidden'); };
  } else {
    reloadBtn.style.display = 'none';
    reloadBtn.onclick = null;
  }

  // Delete button — always show when we have a history id and local_file
  const delBtn = document.getElementById('lightbox-delete');
  if (entry.id && entry.local_file) {
    delBtn.style.display = '';
    delBtn.onclick = async () => {
      const prompt = entry.prompt || 'Untitled';
      const preview = prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt;
      if (!confirm(`Delete "${preview}"?`)) return;
      delBtn.textContent = '⏳ Deleting…';
      delBtn.disabled = true;
      const res = await fetch(`/api/history/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      delBtn.textContent = '🗑 Delete';
      delBtn.disabled = false;
      if (res.ok) {
        document.getElementById('lightbox').classList.add('hidden');
        _allHistory = _allHistory.filter(h => h.id !== entry.id);
        renderHistory();
        toast('Deleted', 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Delete failed', 'error');
      }
    };
  } else {
    delBtn.style.display = 'none';
    delBtn.onclick = null;
  }

  document.getElementById('lightbox').classList.remove('hidden');
}

// ─── Outpaint "Before" canvas composite ───────────────────────────────────────
// Draws the source image at the correct position within an output-sized canvas,
// so the Before/After views are spatially aligned — no jarring aspect-ratio swap.
function _compositeOutpaintBefore(entry) {
  return new Promise(resolve => {
    const src = new Image();

    src.onload = () => {
      const outW = entry.width  || src.naturalWidth;
      const outH = entry.height || src.naturalHeight;
      const srcW = src.naturalWidth;
      const srcH = src.naturalHeight;

      const canvas = document.createElement('canvas');
      canvas.width  = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');

      // Dark background to distinguish the expanded / new areas
      ctx.fillStyle = '#0d0d18';
      ctx.fillRect(0, 0, outW, outH);

      // Subtle checkerboard over the expanded region so it reads as "empty"
      const tileSize = 24;
      ctx.save();
      for (let ty = 0; ty < outH; ty += tileSize) {
        for (let tx = 0; tx < outW; tx += tileSize) {
          ctx.fillStyle = ((tx / tileSize + ty / tileSize) % 2 === 0)
            ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0)';
          ctx.fillRect(tx, ty, tileSize, tileSize);
        }
      }
      ctx.restore();

      // Position: use stored reference offsets; default to centering the source
      const ox = entry.reference_offset_x != null
        ? Math.round(entry.reference_offset_x)
        : Math.round((outW - srcW) / 2);
      const oy = entry.reference_offset_y != null
        ? Math.round(entry.reference_offset_y)
        : Math.round((outH - srcH) / 2);

      // Draw source image at correct position
      ctx.drawImage(src, ox, oy, srcW, srcH);

      // Gold dashed border to mark the original frame boundary
      ctx.strokeStyle = 'rgba(212,168,67,0.75)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(ox + 1, oy + 1, srcW - 2, srcH - 2);

      resolve(canvas.toDataURL('image/png'));
    };

    src.onerror = () => resolve(entry.input_url); // graceful fallback
    src.src = entry.input_url;
  });
}



function _lbUpdateNav() {
  const prev = document.getElementById('lightbox-prev');
  const next = document.getElementById('lightbox-next');
  if (!prev || !next) return;
  prev.style.display = _lbList.length > 1 ? '' : 'none';
  next.style.display = _lbList.length > 1 ? '' : 'none';
  prev.style.opacity = _lbIndex > 0                   ? '1' : '0.3';
  next.style.opacity = _lbIndex < _lbList.length - 1  ? '1' : '0.3';
}

function _lbNavigate(dir) {
  const ni = _lbIndex + dir;
  if (ni < 0 || ni >= _lbList.length) return;
  _lbIndex = ni;
  openLightbox(_lbList[ni], _lbList, ni);
}

document.getElementById('lightbox-prev').addEventListener('click', () => _lbNavigate(-1));
document.getElementById('lightbox-next').addEventListener('click', () => _lbNavigate(+1));

// ── Reload Settings from history entry ───────────────────────────────────────
function reloadEntrySettings(e) {
  const set = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
  const setCheck = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.checked = !!val; };

  switchTab(e.tool || 'generate');

  if (e.tool === 'generate' || !e.tool) {
    if (e.model)  set('gen-model', e.model);
    if (e.prompt) set('gen-prompt', e.prompt);
    if (e.width)  set('gen-width', e.width);
    if (e.height) set('gen-height', e.height);
    if (e.seed)   set('gen-seed', e.seed);
    if (e.output_format) set('gen-format', e.output_format);
    // Reload reference images
    if (e.ref_urls?.length) {
      const slots = Array.from(document.querySelectorAll('#gen-refs-grid .ref-slot'));
      e.ref_urls.forEach((url, i) => {
        if (slots[i]?.setFromUrl) setTimeout(() => slots[i].setFromUrl(url), 150 + i * 80);
      });
    }
  } else if (e.tool === 'inpaint') {
    if (e.prompt) set('inpaint-prompt', e.prompt);
    if (e.steps)  set('inpaint-steps', e.steps);
    if (e.guidance) set('inpaint-guidance', e.guidance);
    if (e.seed)   set('inpaint-seed', e.seed);
    if (e.output_format) set('inpaint-format', e.output_format);
    if (e.input_url) setTimeout(() => inpaintUZ.setFromUrl(e.input_url), 150);
  } else if (e.tool === 'erase') {
    if (e.output_format) set('erase-format', e.output_format);
    if (e.input_url) setTimeout(() => eraseUZ.setFromUrl(e.input_url), 150);
  } else if (e.tool === 'outpaint') {
    if (e.output_format) set('op-format', e.output_format);
    if (e.width)  set('op-width', e.width);
    if (e.height) set('op-height', e.height);
    if (e.input_url) setTimeout(() => outpaintUZ.setFromUrl(e.input_url), 150);
  } else if (e.tool === 'vto') {
    if (e.input_url)   setTimeout(() => vtoPersonUZ.setFromUrl(e.input_url),   150);
    if (e.garment_url) setTimeout(() => vtoGarmentUZ.setFromUrl(e.garment_url), 150);
  } else if (e.tool === 'deblur') {
    if (e.prompt) set('deblur-prompt', e.prompt);
    if (e.output_format) set('deblur-format', e.output_format);
    if (e.input_url) setTimeout(() => deblurUZ.setFromUrl(e.input_url), 150);
  }
  toast(`↺ Settings restored to ${e.tool} tab`, 'info');
}




document.getElementById('lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').classList.add('hidden');
  lbZoomReset(true);
});
document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox')) {
    document.getElementById('lightbox').classList.add('hidden');
    lbZoomReset(true);
  }
});

// ─── Zoom / Pan / Fullscreen ──────────────────────────────────────────────────
const LBZ = { scale: 1, x: 0, y: 0 };
const LBZ_MIN = 0.5, LBZ_MAX = 12;
let _lbDrag = null;
let _lbPinch = null;

const _lbImg  = () => document.getElementById('lightbox-img');
const _lbWrap = () => _lbImg()?.closest('.lightbox-img-wrap');

function lbZoomApply(animate = false) {
  const img = _lbImg(); if (!img) return;
  if (animate) { img.style.transition = 'transform .2s ease'; setTimeout(() => img.style.transition = '', 250); }
  img.style.transform = `translate(${LBZ.x}px,${LBZ.y}px) scale(${LBZ.scale})`;
  document.getElementById('lb-zoom-pct').textContent = Math.round(LBZ.scale * 100) + '%';
  const w = _lbWrap();
  w.classList.toggle('lb-pannable', LBZ.scale > 1.01);
  w.classList.toggle('lb-zoomable', LBZ.scale <= 1.01);
}

function lbZoomReset(skipAnim) {
  LBZ.scale = 1; LBZ.x = 0; LBZ.y = 0;
  lbZoomApply(!skipAnim);
}

function lbZoomTo1to1() {
  const img = _lbImg(); if (!img || !img.naturalWidth) return;
  const w = _lbWrap();
  const wW = w.clientWidth, wH = w.clientHeight;
  const nW = img.naturalWidth, nH = img.naturalHeight;
  const aspectImg = nW / nH, aspectWrap = wW / wH;
  let dW;
  if (aspectImg > aspectWrap) dW = wW; else dW = wH * aspectImg;
  LBZ.scale = Math.min(LBZ_MAX, nW / dW);
  LBZ.x = 0; LBZ.y = 0;
  lbZoomApply(true);
}

function lbZoomBy(factor, cx, cy) {
  const wrap = _lbWrap(); if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const originX = (cx ?? rect.left + rect.width  / 2) - rect.left - rect.width  / 2;
  const originY = (cy ?? rect.top  + rect.height / 2) - rect.top  - rect.height / 2;
  const oldScale = LBZ.scale;
  const newScale = Math.max(LBZ_MIN, Math.min(LBZ_MAX, oldScale * factor));
  const imgX = (originX - LBZ.x) / oldScale;
  const imgY = (originY - LBZ.y) / oldScale;
  LBZ.x = originX - newScale * imgX;
  LBZ.y = originY - newScale * imgY;
  LBZ.scale = newScale;
  lbZoomApply();
}

// Wheel zoom
_lbWrap() && (() => {}) (); // ensure wrap exists at page load (it does)
document.getElementById('lightbox').addEventListener('wheel', e => {
  if (!_lbImg().src) return;
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
  lbZoomBy(factor, e.clientX, e.clientY);
}, { passive: false });

// Mouse drag
document.getElementById('lightbox').addEventListener('mousedown', e => {
  if (e.target.closest('.lb-zoom-bar, .lightbox-footer, .lb-nav, .lb-sendto-menu')) return;
  if (LBZ.scale <= 1.01) return;
  _lbDrag = { sx: e.clientX, sy: e.clientY, ox: LBZ.x, oy: LBZ.y };
  _lbWrap()?.classList.add('lb-dragging');
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!_lbDrag) return;
  LBZ.x = _lbDrag.ox + (e.clientX - _lbDrag.sx);
  LBZ.y = _lbDrag.oy + (e.clientY - _lbDrag.sy);
  lbZoomApply();
});
document.addEventListener('mouseup', () => {
  if (!_lbDrag) return;
  _lbDrag = null;
  _lbWrap()?.classList.remove('lb-dragging');
});

// Double-click: toggle 1:1 ↔ fit
document.getElementById('lightbox').addEventListener('dblclick', e => {
  if (e.target.closest('.lightbox-footer, .lb-zoom-bar, .lb-nav')) return;
  if (LBZ.scale > 1.05) { lbZoomReset(); } else { lbZoomTo1to1(); }
});

// Touch: pinch-zoom + single-finger pan
document.getElementById('lightbox').addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    const [a, b] = e.touches;
    _lbPinch = {
      dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2,
      ox: LBZ.x, oy: LBZ.y, os: LBZ.scale
    };
    _lbDrag = null;
  } else if (e.touches.length === 1 && LBZ.scale > 1.01) {
    _lbDrag = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, ox: LBZ.x, oy: LBZ.y };
  }
}, { passive: true });
document.getElementById('lightbox').addEventListener('touchmove', e => {
  if (e.touches.length === 2 && _lbPinch) {
    const [a, b] = e.touches;
    const dist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const factor = dist / _lbPinch.dist;
    const wrap = _lbWrap();
    const rect = wrap.getBoundingClientRect();
    const cx = (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
    const cy = (a.clientY + b.clientY) / 2 - rect.top  - rect.height / 2;
    const imgX = (cx - _lbPinch.ox) / _lbPinch.os;
    const imgY = (cy - _lbPinch.oy) / _lbPinch.os;
    LBZ.scale = Math.max(LBZ_MIN, Math.min(LBZ_MAX, _lbPinch.os * factor));
    LBZ.x = cx - LBZ.scale * imgX;
    LBZ.y = cy - LBZ.scale * imgY;
    lbZoomApply();
    e.preventDefault();
  } else if (e.touches.length === 1 && _lbDrag) {
    LBZ.x = _lbDrag.ox + (e.touches[0].clientX - _lbDrag.sx);
    LBZ.y = _lbDrag.oy + (e.touches[0].clientY - _lbDrag.sy);
    lbZoomApply();
    e.preventDefault();
  }
}, { passive: false });
document.getElementById('lightbox').addEventListener('touchend', () => {
  _lbPinch = null; _lbDrag = null;
});

// Zoom toolbar buttons
document.getElementById('lb-zoom-out').addEventListener('click', () => lbZoomBy(1 / 1.4));
document.getElementById('lb-zoom-in' ).addEventListener('click', () => lbZoomBy(1.4));
document.getElementById('lb-zoom-fit').addEventListener('click', () => lbZoomReset());
document.getElementById('lb-zoom-1to1').addEventListener('click', lbZoomTo1to1);

// Fullscreen
const _lbFsBtn = document.getElementById('lb-fullscreen-btn');
_lbFsBtn.addEventListener('click', () => {
  const el = document.getElementById('lightbox');
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  }
});
document.addEventListener('fullscreenchange', () => {
  _lbFsBtn.textContent = document.fullscreenElement ? '⊡' : '⛶';
});
document.addEventListener('webkitfullscreenchange', () => {
  _lbFsBtn.textContent = document.webkitFullscreenElement ? '⊡' : '⛶';
});

// ─── Send-to helper (works from lightbox OR history card) ─────────────────────
function sendToTool(tool, imageUrl, entry) {
  const closeLightbox = () => document.getElementById('lightbox').classList.add('hidden');

  // Map tool → tab name + which upload zone / ref slot to fill
  const actions = {
    generate: () => {
      switchTab('generate');
      if (entry?.prompt) document.getElementById('gen-prompt').value = entry.prompt;
      // Load into first reference slot
      setTimeout(() => {
        const refSlots = document.querySelectorAll('#gen-refs-grid .ref-slot');
        if (refSlots[0]?.setFromUrl) refSlots[0].setFromUrl(imageUrl);
      }, 120);
    },
    inpaint:  () => { switchTab('inpaint');  setTimeout(() => inpaintUZ.setFromUrl(imageUrl), 120); },
    erase:    () => { switchTab('erase');    setTimeout(() => eraseUZ.setFromUrl(imageUrl),   120); },
    outpaint: () => { switchTab('outpaint'); setTimeout(() => outpaintUZ.setFromUrl(imageUrl), 120); },
    vto:      () => { switchTab('vto');      setTimeout(() => vtoPersonUZ.setFromUrl(imageUrl), 120); },
    deblur:   () => { switchTab('deblur');   setTimeout(() => deblurUZ.setFromUrl(imageUrl),  120); },
    upscale:  () => { switchTab('upscale');  setTimeout(() => upscaleUZ.setFromUrl(imageUrl), 120); },
  };

  if (actions[tool]) {
    actions[tool]();
    closeLightbox();
    toast(`↗ Sent to ${tool}`, 'info');
  }
}

// ─── Copy image to clipboard ───────────────────────────────────────────────────
async function copyImageToClipboard(url) {
  try {
    const res  = await fetch(url);
    const blob = await res.blob();
    const type = blob.type?.startsWith('image/') ? blob.type : 'image/png';
    await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
    toast('✓ Image copied to clipboard', 'success');
  } catch (e) {
    toast('Copy failed: ' + e.message, 'warn');
  }
}

document.getElementById('lightbox-copy').addEventListener('click', () => {
  if (_lightboxEntry) copyImageToClipboard(_lightboxEntry.image_url);
});

// ─── Send-to dropdown (lightbox) ──────────────────────────────────────────────
const _lbSendMenu = document.getElementById('lb-sendto-menu');

document.getElementById('lb-sendto-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  _lbSendMenu.classList.toggle('hidden');
  if (!_lbSendMenu.classList.contains('hidden')) placeSendToMenu(e.currentTarget, _lbSendMenu);
});

_lbSendMenu.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sendto]');
  if (!btn) return;
  _lbSendMenu.classList.add('hidden');
  if (_lightboxEntry) sendToTool(btn.dataset.sendto, _lightboxEntry.image_url, _lightboxEntry);
});

// Close ALL send-to dropdowns on any outside click
document.addEventListener('click', (e) => {
  // Lightbox menu
  if (!document.getElementById('lb-sendto-wrap')?.contains(e.target)) {
    _lbSendMenu?.classList.add('hidden');
  }
  // Gallery (history) card menus
  if (!e.target.closest('.hc-sendto-wrap')) {
    document.querySelectorAll('.hc-sendto-menu').forEach(m => m.classList.add('hidden'));
  }
  // Session result card menus
  if (!e.target.closest('.rc-sendto-wrap')) {
    document.querySelectorAll('.rc-sendto-menu').forEach(m => m.classList.add('hidden'));
  }
});


// ─── Tab Router ───────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'history') loadHistory();
}

document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ─── API Key Screen ───────────────────────────────────────────────────────────
async function loadCredits() {
  try {
    const data = await apiGet('/api/credits');
    const val = data.credits ?? data.balance ?? (typeof data === 'number' ? data : '—');
    document.getElementById('credit-val').textContent = typeof val === 'number' ? val.toFixed(2) : val;
  } catch { document.getElementById('credit-val').textContent = '—'; }
}

// ── Session + All-Time cost tracker ───────────────────────────────────────────
let _sessionCredits  = 0;   // accumulated today
let _allTimeCredits  = 0;   // accumulated all time (from full history)

function addSessionCost(credits) {
  if (!credits || isNaN(credits)) return;
  const n = Number(credits);
  _sessionCredits += n;
  _allTimeCredits += n;
  _renderSessionBadge();
  _renderAllTimeBadge();
}

function _renderSessionBadge() {
  const badge = document.getElementById('session-badge');
  const span  = document.getElementById('session-spend');
  if (!span) return;
  const cr  = _sessionCredits.toFixed(4).replace(/\.?0+$/, '');
  const usd = (_sessionCredits * 0.01).toFixed(4).replace(/\.?0+$/, '');
  span.textContent = `${cr} cr · $${usd}`;
  badge.classList.remove('bump');
  requestAnimationFrame(() => { badge.classList.add('bump'); });
}

function _renderAllTimeBadge() {
  const span = document.getElementById('alltime-spend');
  if (!span) return;
  const cr  = _allTimeCredits.toFixed(4).replace(/\.?0+$/, '');
  const usd = (_allTimeCredits * 0.01).toFixed(2);
  span.textContent = `${cr} cr · $${usd}`;
}

// Seed both today and all-time totals from full history on page load
async function seedSessionCostFromHistory() {
  try {
    const hist = await apiGet('/api/history');
    const todayPrefix = new Date().toISOString().slice(0, 10);  // "YYYY-MM-DD"

    let todayTotal   = 0;
    let allTimeTotal = 0;
    for (const e of hist) {
      if (e.cost == null) continue;
      const c = Number(e.cost);
      allTimeTotal += c;
      if (e.timestamp?.startsWith(todayPrefix)) todayTotal += c;
    }

    if (allTimeTotal > 0) {
      _allTimeCredits = allTimeTotal;
      _renderAllTimeBadge();
    }
    if (todayTotal > 0) {
      _sessionCredits = todayTotal;
      _renderSessionBadge();
    }
  } catch { /* silent */ }
}




function updateTabAvailability() {
  const upscaleSidebar = document.querySelector('#tab-upscale .tool-sidebar');
  const upscaleResults = document.querySelector('#tab-upscale .tool-main #upscale-results');
  const upscaleStatusBar = document.querySelector('#tab-upscale .tool-main .status-bar');
  const upscaleNoKey = document.getElementById('upscale-nokey');

  if (TOPAZ_KEY) {
    upscaleSidebar?.classList.remove('hidden');
    upscaleResults?.classList.remove('hidden');
    upscaleNoKey?.classList.add('hidden');
  } else {
    upscaleSidebar?.classList.add('hidden');
    upscaleResults?.classList.add('hidden');
    upscaleStatusBar?.classList.add('hidden');
    upscaleNoKey?.classList.remove('hidden');
  }

  // Check BFL tabs
  const bflTabs = ['generate', 'inpaint', 'erase', 'outpaint', 'vto', 'deblur'];
  bflTabs.forEach(tab => {
    const btn = document.getElementById(tab === 'vto' ? 'btn-vto' : (tab === 'generate' ? 'btn-generate' : `btn-${tab}`));
    if (btn) {
      if (API_KEY) {
        btn.disabled = false;
        btn.title = '';
      } else {
        btn.disabled = true;
        btn.title = 'BFL API Key is required for this tool';
      }
    }
  });

  // Show/hide credit badge depending on BFL key
  const creditBadge = document.getElementById('credit-badge');
  if (creditBadge) {
    creditBadge.style.display = API_KEY ? '' : 'none';
  }
}

document.getElementById('btn-connect').addEventListener('click', () => {
  const key = document.getElementById('input-apikey').value.trim();
  const topazKey = document.getElementById('input-topazkey').value.trim();
  if (!key && !topazKey) { toast('Enter at least one API key to connect', 'warn'); return; }
  
  API_KEY = key;
  TOPAZ_KEY = topazKey;
  
  if (key) localStorage.setItem('flux_api_key', key);
  else localStorage.removeItem('flux_api_key');
  
  if (topazKey) localStorage.setItem('topaz_api_key', topazKey);
  else localStorage.removeItem('topaz_api_key');
  
  document.getElementById('screen-apikey').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');
  
  if (API_KEY) {
    loadCredits();
  }
  seedSessionCostFromHistory();
  setTimeout(maybeShowWelcome, 700); // show welcome on first connect
  updateTabAvailability();
});

document.getElementById('input-apikey').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-connect').click();
});
document.getElementById('input-topazkey').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-connect').click();
});

document.getElementById('btn-changekey').addEventListener('click', () => {
  API_KEY = '';
  TOPAZ_KEY = '';
  localStorage.removeItem('flux_api_key');
  localStorage.removeItem('topaz_api_key');
  document.getElementById('screen-app').classList.remove('active');
  document.getElementById('screen-apikey').classList.add('active');
  document.getElementById('input-apikey').value = '';
  document.getElementById('input-topazkey').value = '';
});

// Auto-login if either key stored
if (API_KEY || TOPAZ_KEY) {
  document.getElementById('input-apikey').value = API_KEY;
  document.getElementById('input-topazkey').value = TOPAZ_KEY;
  document.getElementById('btn-connect').click();
}

// ─── Electron environment detection ──────────────────────────────────────────
if (window.electronAPI?.isElectron) document.body.classList.add('is-electron');

// ─── Settings Modal ───────────────────────────────────────────────────────────
(function initSettings() {
  const overlay   = document.getElementById('settings-modal');
  const closeBtn  = document.getElementById('settings-close-btn');
  const openBtn   = document.getElementById('btn-settings');

  // ── Open / Close ──────────────────────────────────────────────────────
  function openSettings() {
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    _populateSettings();
  }
  function closeSettings() {
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
    // Reset folder notice
    document.getElementById('settings-folder-notice').classList.add('hidden');
  }

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeSettings();
  });

  // ── Populate values ────────────────────────────────────────────────────
  async function _populateSettings() {
    // API key (masked)
    const keyInput = document.getElementById('settings-apikey');
    keyInput.value = API_KEY || '';

    // Port + data paths — only available in Electron
    if (window.fluxApp) {
      try {
        const config = await window.fluxApp.getConfig();
        const portInput = document.getElementById('settings-port');
        portInput.value = config.port || 4242;
        document.getElementById('settings-port-current').textContent = `(currently :${config.port || 4242})`;
      } catch { /* ignore */ }

      try {
        const paths = await apiGet('/api/paths');
        document.getElementById('settings-path-outputs').textContent = paths.outputs || '—';
        document.getElementById('settings-path-uploads').textContent = paths.uploads || '—';
        _outputsPath = paths.outputs;
        _uploadsPath = paths.uploads;
      } catch { /* ignore */ }
    }
  }

  let _outputsPath = null, _uploadsPath = null;

  // ── API Key reveal toggle ──────────────────────────────────────────────
  document.getElementById('settings-apikey-reveal').addEventListener('click', () => {
    const inp = document.getElementById('settings-apikey');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // ── Save API Key ───────────────────────────────────────────────────────
  document.getElementById('settings-apikey-save').addEventListener('click', () => {
    const val = document.getElementById('settings-apikey').value.trim();
    if (!val) { toast('API key cannot be empty', 'warn'); return; }
    API_KEY = val;
    localStorage.setItem('flux_api_key', val);
    toast('API key saved ✓', 'success');
    closeSettings();
    loadCredits();
  });

  // ── Save Port (Electron only) ──────────────────────────────────────────
  document.getElementById('settings-port-save')?.addEventListener('click', async () => {
    const p = parseInt(document.getElementById('settings-port').value, 10);
    if (!p || p < 1024 || p > 65535) { toast('Port must be 1024–65535', 'warn'); return; }
    if (!window.fluxApp) { toast('Port changes require the desktop app', 'warn'); return; }
    toast('Saving port and restarting…', 'info', 8000);
    await window.fluxApp.savePortAndRestart(p);
  });

  // ── Data Folder (Electron only) ────────────────────────────────────────
  let _chosenFolder = null;

  document.getElementById('settings-reveal-outputs')?.addEventListener('click', () => {
    if (_outputsPath && window.fluxApp) window.fluxApp.revealInFinder(_outputsPath);
  });
  document.getElementById('settings-reveal-uploads')?.addEventListener('click', () => {
    if (_uploadsPath && window.fluxApp) window.fluxApp.revealInFinder(_uploadsPath);
  });

  document.getElementById('settings-folder-browse')?.addEventListener('click', async () => {
    if (!window.fluxApp) { toast('Folder selection requires the desktop app', 'warn'); return; }
    const folder = await window.fluxApp.pickFolder();
    if (!folder) return;
    _chosenFolder = folder;
    document.getElementById('settings-folder-chosen').textContent = folder;
    document.getElementById('settings-folder-notice').classList.remove('hidden');
  });

  document.getElementById('settings-folder-apply')?.addEventListener('click', async () => {
    if (!_chosenFolder || !window.fluxApp) return;
    toast('Applying new data folder and restarting…', 'info', 8000);
    await window.fluxApp.saveDataDir(_chosenFolder);
  });

  document.getElementById('settings-folder-cancel')?.addEventListener('click', () => {
    _chosenFolder = null;
    document.getElementById('settings-folder-notice').classList.add('hidden');
  });

})();



// ─── Slider sync helper ───────────────────────────────────────────────────────
function syncSlider(sliderId, displayId) {
  const sl = document.getElementById(sliderId);
  const dp = document.getElementById(displayId);
  if (!sl || !dp) return;
  dp.textContent = sl.value;
  sl.addEventListener('input', () => dp.textContent = sl.value);
}

syncSlider('gen-safety',       'gen-safety-label');
syncSlider('inpaint-steps',    'inpaint-steps-val');
syncSlider('inpaint-guidance', 'inpaint-guidance-val');
syncSlider('inpaint-safety',   'inpaint-safety-val');
syncSlider('erase-dilate',     'erase-dilate-val');
syncSlider('erase-safety',     'erase-safety-val');
syncSlider('op-safety',        'op-safety-val');
syncSlider('vto-safety',       'vto-safety-val');
syncSlider('deblur-safety',    'deblur-safety-val');

// Advanced toggle
document.getElementById('gen-adv-toggle').addEventListener('click', () => {
  document.getElementById('gen-adv-body').classList.toggle('open');
});

// Seed randomize
['gen','inpaint','erase','vto'].forEach(tab => {
  const btn = document.getElementById(`${tab}-seed-rand`);
  const inp = document.getElementById(`${tab}-seed`);
  if (btn && inp) btn.addEventListener('click', () => inp.value = Math.floor(Math.random() * 999999999));
});

// ─── GENERATE tab ────────────────────────────────────────────────────────────
// Reference image slots (8 slots)
const GEN_REFS = [];
const refsGrid = document.getElementById('gen-refs-grid');

function createRefSlot(i) {
  const slot = document.createElement('div');
  slot.className = 'ref-slot upload-zone';
  // No min-height override — let CSS aspect-ratio drive the height
  slot.innerHTML = `
    <input type="file" accept="image/*" style="position:absolute;inset:0;opacity:0;cursor:pointer;z-index:20;width:100%;height:100%">
    <button class="ref-badge" title="Click to insert @image${i+1} in prompt" style="display:none">${i + 1}</button>
    <button class="ref-clear-btn" title="Remove image" style="display:none">✕</button>
    <span style="font-size:14px;opacity:0.35;pointer-events:none">+</span>
    <img style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:calc(var(--r-md) - 1px);pointer-events:none;z-index:1">
    <div class="uz-overlay" style="opacity:0;position:absolute;inset:0;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;gap:4px;transition:0.18s ease;pointer-events:none;z-index:2">
      <span style="font-size:10px;color:#fff;font-weight:500">Change</span>
    </div>`;


  const input    = slot.querySelector('input');
  const img      = slot.querySelector('img');
  const clearBtn = slot.querySelector('.ref-clear-btn');
  const state    = { url: null };
  GEN_REFS.push(state);

  function clearSlot() {
    img.src = '';
    img.style.display = 'none';
    clearBtn.style.display = 'none';
    badge.style.display = 'none';
    slot.classList.remove('has-image');
    input.value = '';
    state.url = null;
    if (refPopup) { refPopup.remove(); refPopup = null; }
  }

  async function handleFile(file) {
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    img.src = objUrl;
    img.style.display = 'block';
    clearBtn.style.display = 'block';
    badge.style.display = 'block';
    slot.classList.add('has-image');

    // Slot 1 only: auto-set output dimensions to exactly match the source image
    if (i === 0) {
      const dimImg = new Image();
      dimImg.onload = () => {
        const MAX_MP = 4_194_304; // FLUX.2 hard cap — 4MP, e.g. 2048×2048
        let w = dimImg.naturalWidth;
        let h = dimImg.naturalHeight;
        const origW = w, origH = h;
        const mp = w * h;

        if (mp > MAX_MP) {
          // Scale down proportionally to just fit under 4MP
          const scale = Math.sqrt(MAX_MP / mp);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          toast(
            `⚠️ Source is ${origW}×${origH} (${(mp/1e6).toFixed(1)}MP) — output clamped to ${w}×${h} to stay within FLUX.2's 4MP limit`,
            'warn'
          );
        }
        document.getElementById('gen-width').value  = w;
        document.getElementById('gen-height').value = h;
      };
      dimImg.src = objUrl;
    }

    try {
      const data = await uploadFile(file);
      state.url = data.url;

      // FLUX.2 rejects any reference image over 4MP outright (the error
      // surfaces later, mid-batch, as "Total pixels exceeds maximum...").
      // Auto-downsample minimally (aspect-ratio preserved) instead of
      // letting the whole generation fail on an oversized reference.
      const GEN_REF_MAX_PX = 4_194_304; // FLUX.2 hard cap — 2048×2048
      const { url, resized, origW, origH, newW, newH } =
        await resizeImageIfNeeded(objUrl, data.url, GEN_REF_MAX_PX);
      state.url = url;
      if (resized) {
        toast(
          `Reference image ${i + 1} was ${origW}×${origH} — downsampled to ${newW}×${newH} to stay within FLUX.2's 4MP limit`,
          'warn'
        );
      }
    } catch (e) { toast('Upload failed', 'error'); }
  }


  const badge = slot.querySelector('.ref-badge');

  input.addEventListener('change', e => handleFile(e.target.files[0]));
  clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clearSlot(); });

  // Badge click: insert @imageN at cursor in prompt (only when slot has image)
  badge.addEventListener('click', (e) => {
    if (!state.url) return; // empty slot → fall through to file dialog
    e.stopPropagation();
    const prompt = document.getElementById('gen-prompt');
    const tag = `@image${i + 1}`;
    const s = prompt.selectionStart ?? prompt.value.length;
    const en = prompt.selectionEnd ?? s;
    const before = prompt.value.slice(0, s);
    const after  = prompt.value.slice(en);
    const pre  = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const post = after.length  > 0 && !after.startsWith(' ')  ? ' ' : '';
    prompt.value = before + pre + tag + post + after;
    const cur = s + pre.length + tag.length;
    prompt.focus();
    prompt.setSelectionRange(cur, cur);
    toast(`Inserted ${tag} into prompt`, 'success');
  });

  slot.addEventListener('click', (e) => {
    if (e.target === input || e.target === clearBtn || e.target === badge) return;
    e.stopPropagation(); input.click();
  });
  slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', e => {
    e.preventDefault(); slot.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) handleFile(f);
  });

  // ── Hover: show overlay immediately, popup after 1 s ──────────────────────
  let hoverTimer = null;
  let refPopup   = null;

  slot.addEventListener('mouseenter', () => {
    if (state.url) slot.querySelector('.uz-overlay').style.opacity = '1';
    if (!img.src || !state.url) return;

    hoverTimer = setTimeout(() => {
      refPopup = document.createElement('div');
      refPopup.className = 'ref-hover-popup';
      const popImg = new Image();
      popImg.src = img.src;
      refPopup.appendChild(popImg);
      const lbl = document.createElement('div');
      lbl.className = 'ref-hover-popup-label';
      lbl.textContent = `Image ${i + 1}`;
      refPopup.appendChild(lbl);
      document.body.appendChild(refPopup);

      // Position: prefer below, fall back to above if no room
      const rect = slot.getBoundingClientRect();
      const popH = 180; // approximate popup height
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow > popH + 12
        ? rect.bottom + 8
        : rect.top - popH - 8;
      let left = rect.left;
      // Clamp to viewport right edge
      if (left + 264 > window.innerWidth) left = window.innerWidth - 268;
      refPopup.style.top  = `${top}px`;
      refPopup.style.left = `${left}px`;

      requestAnimationFrame(() => refPopup.classList.add('visible'));
    }, 1000);
  });

  slot.addEventListener('mouseleave', () => {
    slot.querySelector('.uz-overlay').style.opacity = '0';
    clearTimeout(hoverTimer); hoverTimer = null;
    if (refPopup) { refPopup.remove(); refPopup = null; }
  });

  // Public handles
  slot._handleFile = handleFile;
  slot._state = state;

  // setFromUrl: restore a server-side URL (e.g. /uploads/uuid.jpg) into this slot
  slot.setFromUrl = function(serverUrl) {
    if (!serverUrl) return;
    img.src = serverUrl;
    img.style.display = 'block';
    clearBtn.style.display = 'block';
    badge.style.display = 'block';
    slot.classList.add('has-image');
    state.url = serverUrl;
  };

  refsGrid.appendChild(slot);
}

for (let i = 0; i < 8; i++) createRefSlot(i);

// Aspect ratio presets
// ─── Aspect ratio lock + size scale presets ───────────────────────────────────
const _gW   = () => document.getElementById('gen-width');
const _gH   = () => document.getElementById('gen-height');
const _lock = () => document.getElementById('gen-ar-lock');

let GEN_AR_LOCKED = false;
let GEN_AR_RATIO  = 1; // w / h

function _snap16(n) { return Math.max(64, Math.min(4096, Math.round(n / 16) * 16)); }

function _applyARLock(changed) {
  if (!GEN_AR_LOCKED) return;
  if (changed === 'w') {
    _gH().value = _snap16(parseInt(_gW().value) / GEN_AR_RATIO);
  } else {
    _gW().value = _snap16(parseInt(_gH().value) * GEN_AR_RATIO);
  }
}

_gW().addEventListener('input', () => _applyARLock('w'));
_gH().addEventListener('input', () => _applyARLock('h'));

_lock().addEventListener('click', () => {
  GEN_AR_LOCKED = !GEN_AR_LOCKED;
  const w = parseInt(_gW().value) || 1024;
  const h = parseInt(_gH().value) || 1024;
  GEN_AR_RATIO = w / h;
  _lock().textContent = GEN_AR_LOCKED ? '🔒' : '🔓';
  _lock().classList.toggle('locked', GEN_AR_LOCKED);
  if (GEN_AR_LOCKED) toast(`Ratio locked ${w}:${h}`, 'info');
});

document.getElementById('gen-presets').addEventListener('click', e => {
  const btn = e.target.closest('[data-w]');
  if (!btn) return;
  _gW().value = btn.dataset.w;
  _gH().value = btn.dataset.h;
  // Update locked ratio to match new preset
  if (GEN_AR_LOCKED) GEN_AR_RATIO = parseInt(btn.dataset.w) / parseInt(btn.dataset.h);
});

// Scale presets (1K / 2K / Max)
document.getElementById('gen-size-presets').addEventListener('click', e => {
  const btn = e.target.closest('[data-size]');
  if (!btn) return;

  const w = parseInt(_gW().value) || 1024;
  const h = parseInt(_gH().value) || 1024;
  const ratio = w / h; // current width-to-height ratio

  function applyLong(targetLong) {
    let newW, newH;
    if (ratio >= 1) { newW = targetLong; newH = targetLong / ratio; }
    else            { newH = targetLong; newW = targetLong * ratio; }
    // Clamp to 4MP (FLUX.2 hard cap — 4,194,304px², e.g. 2048×2048)
    const px = newW * newH;
    if (px > 4_194_304) {
      const s = Math.sqrt(4_194_304 / px);
      newW *= s; newH *= s;
    }
    _gW().value = _snap16(newW);
    _gH().value = _snap16(newH);
    if (GEN_AR_LOCKED) GEN_AR_RATIO = parseInt(_gW().value) / parseInt(_gH().value);
  }

  if (btn.dataset.size === 'max') {
    // Compute the long edge that fills exactly 4MP at current ratio
    const longRatio = ratio >= 1 ? ratio : 1 / ratio;
    const maxLong   = Math.sqrt(4_194_304 * longRatio);
    applyLong(maxLong);
  } else {
    applyLong(parseInt(btn.dataset.size));
  }
});

document.getElementById('btn-generate').addEventListener('click', async () => {
  const prompt = document.getElementById('gen-prompt').value.trim();
  if (!prompt) { toast('Enter a prompt', 'warn'); return; }

  // FLUX.2 output canvas has the same 4MP hard cap as reference images.
  // gen-width/gen-height are each independently clamped to 4096px by _snap16,
  // but their product isn't checked — AR-lock or manual entry can still
  // combine two in-range values into an out-of-range canvas (this is the exact
  // "Total pixels exceeds maximum of 4194304" error). Clamp the pair before sending.
  const GEN_OUT_MAX_PX = 4_194_304;
  const rawGenW = Number(document.getElementById('gen-width').value);
  const rawGenH = Number(document.getElementById('gen-height').value);
  if (rawGenW && rawGenH && rawGenW * rawGenH > GEN_OUT_MAX_PX) {
    const s = Math.sqrt(GEN_OUT_MAX_PX / (rawGenW * rawGenH));
    const newGenW = Math.max(64, Math.floor((rawGenW * s) / 16) * 16);
    const newGenH = Math.max(64, Math.floor((rawGenH * s) / 16) * 16);
    document.getElementById('gen-width').value  = newGenW;
    document.getElementById('gen-height').value = newGenH;
    toast(`Output size ${rawGenW}×${rawGenH} exceeded the 4MP limit — scaled to ${newGenW}×${newGenH}`, 'warn');
  }

  const batchCount = Number(document.getElementById('gen-batch').value) || 1;
  const pinnedSeed = document.getElementById('gen-seed').value;
  const btn        = document.getElementById('btn-generate');
  btn.disabled = true;

  const statusText = document.getElementById('gen-status-text');
  showStatus('gen-status', 'gen-status-text',
    batchCount > 1 ? `Batch 0 / ${batchCount}…` : 'Submitting…');
  const stopTimer = startTimer(document.getElementById('gen-elapsed'));

  const ref_urls = GEN_REFS.map(s => s.url).filter(Boolean);

  // Snapshot ref slot 1 preview URL once for A/B on all cards
  const refSlot0 = document.querySelector('.refs-grid .ref-slot');
  const refImg0  = refSlot0?.querySelector('img');
  const refPreviewUrl = (refImg0?.src && GEN_REFS[0]?.url) ? refImg0.src : null;

  // Build N payloads — each gets its own random seed unless user pinned one
  const payloads = Array.from({ length: batchCount }, (_, idx) => ({
    model:             document.getElementById('gen-model').value,
    prompt,
    ref_urls,
    width:             Number(document.getElementById('gen-width').value) || undefined,
    height:            Number(document.getElementById('gen-height').value) || undefined,
    seed:              pinnedSeed ? String(Number(pinnedSeed) + idx) : String(Math.floor(Math.random() * 999999999)),
    output_format:     document.getElementById('gen-format').value,
    safety_tolerance:  5,
    prompt_upsampling: document.getElementById('gen-upsampling').checked,
    webhook_url:       document.getElementById('gen-webhook').value || undefined,
    webhook_secret:    document.getElementById('gen-webhook-secret').value || undefined,
  }));

  // Ensure results grid exists
  const placeholder = document.querySelector('#gen-results .results-placeholder');
  if (placeholder) placeholder.remove();
  let grid = document.querySelector('#gen-results .result-grid');
  if (!grid) { grid = document.createElement('div'); grid.className = 'result-grid'; document.getElementById('gen-results').prepend(grid); }

  let doneCount = 0;
  let anySuccess = false;

  // Fire all in parallel; insert each card as it resolves
  const promises = payloads.map(payload =>
    apiFetch('/api/generate', payload).then(entry => {
      if (refPreviewUrl) entry._refPreviewUrl = refPreviewUrl;
      const card = buildResultCard(entry,
        e => { switchTab('inpaint'); setTimeout(() => inpaintUZ.setFromUrl(e.image_url), 100); },
        e => { if (e.prompt) document.getElementById('gen-prompt').value = e.prompt; }
      );
      grid.prepend(card);
      doneCount++;
      anySuccess = true;
      if (batchCount > 1) statusText.textContent = `Batch ${doneCount} / ${batchCount}…`;
      addSessionCost(entry.cost);
      loadCredits();
    }).catch(err => {
      doneCount++;
      toast(`Batch item failed: ${err.message}`, 'error');
    })
  );

  await Promise.allSettled(promises);

  stopTimer();
  hideStatus('gen-status');
  btn.disabled = false;
  if (anySuccess) toast(batchCount > 1 ? `Batch of ${batchCount} done!` : 'Generated!', 'success');
});

// ─── INPAINT tab ─────────────────────────────────────────────────────────────

const inpaintUZ = new UploadZone('inpaint-upload', 'inpaint-file', 'inpaint-img-preview');

// FLUX.1 Fill hard cap — 2048×2048 / 4MP. Above this the API either rejects the
// request or silently downscales it server-side (losing quality + risking a
// mask/image size mismatch, since the mask painter sizes itself off whatever
// image it's given). Resize client-side BEFORE the painter opens so the mask
// the user draws always matches the resolution actually submitted.
const INPAINT_MAX_PX = 2048 * 2048;

inpaintUZ.onChange = async (objUrl, serverUrl) => {
  resetMaskUI('inpaint'); // new image → discard any mask from the previous one
  if (objUrl) {
    try {
      const { resized, url, origW, origH, newW, newH } =
        await resizeImageIfNeeded(objUrl, serverUrl, INPAINT_MAX_PX);
      if (resized) {
        inpaintUZ.url = url;
        inpaintUZ.objUrl = null; // use the resized server copy for preview + painter
        if (inpaintUZ.preview) inpaintUZ.preview.src = url;
        toast(
          `Image ${origW}×${origH} exceeded Inpaint's 4MP limit — downsampled to ${newW}×${newH}`,
          'warn'
        );
      }
    } catch (e) { /* fall back to original image if the resize check fails */ }
  }
  // Enable the Open Painter button once we have an image
  document.getElementById('inpaint-open-painter').disabled = false;
};

document.getElementById('inpaint-open-painter').addEventListener('click', () => {
  if (!inpaintUZ.objUrl && !inpaintUZ.url) { toast('Upload an image first', 'warn'); return; }
  painter.open('inpaint', inpaintUZ.objUrl || inpaintUZ.url);
});

document.getElementById('btn-inpaint').addEventListener('click', async () => {
  if (!inpaintUZ.url) { toast('Upload an image first', 'warn'); return; }
  if (!painter.hasMask('inpaint')) { toast('Open the Mask Painter and paint the area to fill', 'warn'); return; }

  const btn = document.getElementById('btn-inpaint');
  btn.disabled = true;
  showStatus('inpaint-status', 'inpaint-status-text', 'Inpainting…');
  const stopTimer = startTimer(document.getElementById('inpaint-elapsed'));

  try {
    const entry = await apiFetch('/api/inpaint', {
      image_url:        inpaintUZ.url,
      mask_b64:         painter.getMask('inpaint'),
      prompt:           document.getElementById('inpaint-prompt').value,
      steps:            Number(document.getElementById('inpaint-steps').value),
      guidance:         Number(document.getElementById('inpaint-guidance').value),
      prompt_upsampling:document.getElementById('inpaint-upsampling').checked,
      seed:             document.getElementById('inpaint-seed').value || undefined,
      output_format:    document.getElementById('inpaint-format').value,
      safety_tolerance: 5,
    });

    // Attach source image URL for A/B comparison (before vs after inpaint)
    if (inpaintUZ.objUrl) entry._refPreviewUrl = inpaintUZ.objUrl;

    renderSingleResult('inpaint-results', entry);
    toast('Inpainted!', 'success');

    addSessionCost(entry.cost);
    loadCredits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('inpaint-status');
    btn.disabled = false;
  }
});

// ─── ERASE tab ────────────────────────────────────────────────────────────────
const eraseUZ = new UploadZone('erase-upload', 'erase-file', 'erase-img-preview');

// Confirmed via live API error: Erase enforces the same 2048×2048 / 4MP hard cap
// as Deblur/Generate ("exceeds maximum of 4194304 pixels (2048x2048)"). Resize
// before the painter opens so the mask always matches the submitted resolution.
const ERASE_MAX_PX = 2048 * 2048;

eraseUZ.onChange = async (objUrl, serverUrl) => {
  resetMaskUI('erase'); // new image → discard any mask from the previous one
  if (objUrl) {
    try {
      const { resized, url, origW, origH, newW, newH } =
        await resizeImageIfNeeded(objUrl, serverUrl, ERASE_MAX_PX);
      if (resized) {
        eraseUZ.url = url;
        eraseUZ.objUrl = null;
        if (eraseUZ.preview) eraseUZ.preview.src = url;
        toast(
          `Image ${origW}×${origH} exceeded Erase's 4MP limit — downsampled to ${newW}×${newH}`,
          'warn'
        );
      }
    } catch (e) { /* fall back to original image if the resize check fails */ }
  }
  document.getElementById('erase-open-painter').disabled = false;
};

document.getElementById('erase-open-painter').addEventListener('click', () => {
  if (!eraseUZ.objUrl && !eraseUZ.url) { toast('Upload an image first', 'warn'); return; }
  painter.open('erase', eraseUZ.objUrl || eraseUZ.url);
});

document.getElementById('btn-erase').addEventListener('click', async () => {
  if (!eraseUZ.url) { toast('Upload an image first', 'warn'); return; }
  if (!painter.hasMask('erase')) { toast('Open the Mask Painter and paint the object to remove', 'warn'); return; }

  const btn = document.getElementById('btn-erase');
  btn.disabled = true;
  showStatus('erase-status');
  const stopTimer = startTimer(document.getElementById('erase-elapsed'));

  try {
    const entry = await apiFetch('/api/erase', {
      image_url:        eraseUZ.url,
      mask_b64:         painter.getMask('erase'),
      dilate_pixels:    Number(document.getElementById('erase-dilate').value),
      seed:             document.getElementById('erase-seed').value || undefined,
      output_format:    document.getElementById('erase-format').value,
      safety_tolerance: 5,
    });

    // A/B: compare result against original source
    if (eraseUZ.objUrl) entry._refPreviewUrl = eraseUZ.objUrl;

    renderSingleResult('erase-results', entry);
    toast('Object erased!', 'success');
    addSessionCost(entry.cost);
    loadCredits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('erase-status');
    btn.disabled = false;
  }
});

// ─── OUTPAINT tab ─────────────────────────────────────────────────────────────
const outpaintUZ = new UploadZone('outpaint-upload', 'outpaint-file', 'outpaint-img-preview');
let _outpaintImgNW = 0, _outpaintImgNH = 0;
let _opArLocked = false;
let _opLockedRatio = null; // W/H

// Interactive placement state (normalized so it survives frame/size changes):
//   _opSizePct  — source size as a % of "fit to frame" (100% = touches frame edges)
//   _opPosFracX/Y — source top-left position within the free space, 0..1 (0.5 = centered)
//   _opSrcImg   — the loaded source <img> for drawing the live preview
let _opSizePct  = 100;
let _opPosFracX = 0.5, _opPosFracY = 0.5;
let _opSrcImg   = null;
// Drag state for the placement canvas
let _opDragging = false, _opDragDX = 0, _opDragDY = 0;

// Given the current frame (W×H) and slider %, compute the source's output-pixel
// box {sw, sh, ox, oy} placed inside the frame. Everything downstream (preview,
// submit) derives from this single source of truth.
function _opComputeBox() {
  const W = Number(_opWEl().value) || 1;
  const H = Number(_opHEl().value) || 1;
  const srcW = _outpaintImgNW || Math.round(W * 0.6);
  const srcH = _outpaintImgNH || Math.round(H * 0.6);
  const fit  = Math.min(W / srcW, H / srcH);         // scale that fits source in frame
  const k    = fit * (_opSizePct / 100);
  
  // Snap source size to 16px grid (BFL API requires 16px alignment for outpainting)
  const rawSw = Math.max(16, Math.round(srcW * k));
  const rawSh = Math.max(16, Math.round(srcH * k));
  const sw = Math.round(rawSw / 16) * 16;
  const sh = Math.round(rawSh / 16) * 16;

  const freeX = Math.max(0, W - sw);
  const freeY = Math.max(0, H - sh);

  // Snap offsets to 16px grid to ensure perfect alignment in the model tensor
  const rawOx = Math.round(freeX * _opPosFracX);
  const rawOy = Math.round(freeY * _opPosFracY);
  const ox = Math.round(rawOx / 16) * 16;
  const oy = Math.round(rawOy / 16) * 16;

  return { W, H, sw, sh, ox, oy, freeX, freeY };
}

const _opWEl = () => document.getElementById('op-width');
const _opHEl = () => document.getElementById('op-height');

function _opClamp(v) { return Math.max(64, Math.min(4096, Math.round(v / 16) * 16)); }

function _opSetWH(w, h, updatePreview = true) {
  _opWEl().value = _opClamp(w);
  _opHEl().value = _opClamp(h);
  _updateOpArButtons();
  if (updatePreview) updateOutpaintPreview();
}

function _opSetRatio(ratio) {
  // Expand the canvas to exactly this AR while keeping it >= source on both axes.
  // ratio = W/H (decimal)
  const srcW = _outpaintImgNW || 1;
  const srcH = _outpaintImgNH || 1;
  // Try height-driven first: H = srcH, W = srcH * ratio
  let newW = Math.ceil(srcH * ratio);
  let newH = srcH;
  if (newW < srcW) {
    // Width would be smaller than source — flip to width-driven
    newW = srcW;
    newH = Math.ceil(srcW / ratio);
  }
  _opSetWH(newW, newH);
  if (_opArLocked) _opLockedRatio = ratio;
}

function _updateOpArButtons() {
  const w = Number(_opWEl().value) || 1;
  const h = Number(_opHEl().value) || 1;
  const currentRatio = w / h;
  document.querySelectorAll('.op-ar-btn').forEach(btn => {
    const ar = btn.dataset.ar;
    let btnRatio;
    if (ar === 'src') {
      btnRatio = _outpaintImgNW && _outpaintImgNH ? _outpaintImgNW / _outpaintImgNH : null;
    } else {
      const [a, b] = ar.split(':').map(Number);
      btnRatio = a / b;
    }
    const match = btnRatio && Math.abs(currentRatio - btnRatio) < 0.02;
    btn.classList.toggle('active', match);
  });
}

// AR lock button
const _opArLockBtn = document.getElementById('op-ar-lock');
_opArLockBtn.addEventListener('click', () => {
  _opArLocked = !_opArLocked;
  _opArLockBtn.classList.toggle('locked', _opArLocked);
  _opArLockBtn.textContent = _opArLocked ? '🔒' : '🔓';
  if (_opArLocked) {
    const w = Number(_opWEl().value) || 1;
    const h = Number(_opHEl().value) || 1;
    _opLockedRatio = w / h;
  }
});

// Width/Height inputs — enforce AR lock
_opWEl().addEventListener('input', () => {
  if (_opArLocked && _opLockedRatio) {
    _opHEl().value = _opClamp(Number(_opWEl().value) / _opLockedRatio);
  }
  _updateOpArButtons();
  updateOutpaintPreview();
});
_opHEl().addEventListener('input', () => {
  if (_opArLocked && _opLockedRatio) {
    _opWEl().value = _opClamp(Number(_opHEl().value) * _opLockedRatio);
  }
  _updateOpArButtons();
  updateOutpaintPreview();
});

// AR preset pills
document.querySelectorAll('.op-ar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const ar = btn.dataset.ar;
    if (ar === 'src') {
      if (_outpaintImgNW && _outpaintImgNH) _opSetRatio(_outpaintImgNW / _outpaintImgNH);
    } else {
      const [a, b] = ar.split(':').map(Number);
      _opSetRatio(a / b);
    }
    if (_opArLocked) {
      // update locked ratio to the new preset
      const w = Number(_opWEl().value) || 1, h = Number(_opHEl().value) || 1;
      _opLockedRatio = w / h;
    }
  });
});

// Source-match quick buttons
document.getElementById('op-match-w').addEventListener('click', () => {
  if (!_outpaintImgNW) return;
  const h = Number(_opHEl().value) || _outpaintImgNH;
  _opSetWH(_outpaintImgNW, h);
});
document.getElementById('op-match-h').addEventListener('click', () => {
  if (!_outpaintImgNH) return;
  const w = Number(_opWEl().value) || _outpaintImgNW;
  _opSetWH(w, _outpaintImgNH);
});
document.getElementById('op-match-both').addEventListener('click', () => {
  if (!_outpaintImgNW || !_outpaintImgNH) return;
  _opSetWH(_outpaintImgNW, _outpaintImgNH);
});

outpaintUZ.onChange = (objUrl, serverUrl) => {
  const img = new Image();
  img.onload = () => {
    _outpaintImgNW = img.naturalWidth;
    _outpaintImgNH = img.naturalHeight;
    _opSrcImg   = img;              // keep for live preview drawing
    _opSizePct  = 100;             // reset placement for the new image
    _opPosFracX = 0.5; _opPosFracY = 0.5;
    const slider = document.getElementById('op-size-slider');
    if (slider) slider.value = 100;
    document.getElementById('op-size-val').textContent = '100%';
    // Default: expand width by 50%, keep height
    _opSetWH(Math.round(_outpaintImgNW * 1.5), _outpaintImgNH);
    // Show source-match quick buttons
    document.getElementById('op-quick-row').classList.remove('hidden');
    // Update Src AR button label with actual ratio
    const srcBtn = document.getElementById('op-ar-src');
    const r = _outpaintImgNW / _outpaintImgNH;
    srcBtn.textContent = r >= 1
      ? `Src ${(_outpaintImgNW / _outpaintImgNH).toFixed(2)}:1`
      : `Src 1:${(_outpaintImgNH / _outpaintImgNW).toFixed(2)}`;
  };
  img.src = objUrl || serverUrl;
};

const _opCanvas = document.getElementById('op-preview-canvas');

function updateOutpaintPreview() {
  const { W, H, sw, sh, ox, oy } = _opComputeBox();

  // Display canvas sized to the frame's aspect ratio (fit within a fixed width).
  const displayW = 300, displayH = Math.max(1, Math.round(displayW * H / W));
  _opCanvas.width = displayW; _opCanvas.height = displayH;
  const ctx = _opCanvas.getContext('2d');
  const s = displayW / W; // output px → display px
  const dx = ox * s, dy = oy * s, dw = sw * s, dh = sh * s;

  ctx.clearRect(0, 0, displayW, displayH);
  // Frame background = the outpaint region
  ctx.fillStyle = 'rgba(120,140,200,0.10)';
  ctx.fillRect(0, 0, displayW, displayH);

  // The source, drawn to scale at its placement
  if (_opSrcImg && _opSrcImg.naturalWidth) {
    ctx.drawImage(_opSrcImg, dx, dy, dw, dh);
  } else {
    ctx.fillStyle = 'rgba(232,160,32,0.30)';
    ctx.fillRect(dx, dy, dw, dh);
  }
  // Outline the source so its edges are clear against the fill
  ctx.strokeStyle = 'rgba(232,160,32,0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(dx + 0.75, dy + 0.75, dw - 1.5, dh - 1.5);

  // Mirror the computed absolute offsets into the (advanced) number fields
  document.getElementById('op-offset-x').value = ox;
  document.getElementById('op-offset-y').value = oy;
}

// ── Size slider ──
const _opSizeSlider = document.getElementById('op-size-slider');
_opSizeSlider.addEventListener('input', () => {
  _opSizePct = Number(_opSizeSlider.value) || 100;
  document.getElementById('op-size-val').textContent = `${_opSizePct}%`;
  updateOutpaintPreview();
});

// ── Drag to reposition the source inside the frame ──
function _opCanvasPos(e) {
  const r = _opCanvas.getBoundingClientRect();
  const s = _opCanvas.width / r.width;                 // display px per CSS px
  return { x: (e.clientX - r.left) * s, y: (e.clientY - r.top) * s };
}
function _opBoxInDisplay() {
  const { W, sw, sh, ox, oy } = _opComputeBox();
  const s = _opCanvas.width / W;
  return { dx: ox * s, dy: oy * s, dw: sw * s, dh: sh * s };
}
_opCanvas.addEventListener('pointerdown', (e) => {
  const p = _opCanvasPos(e);
  const b = _opBoxInDisplay();
  // Start a drag whether or not you grab exactly on the source — clicking the
  // frame jumps the source under the cursor, which feels natural for placement.
  const insideX = p.x >= b.dx && p.x <= b.dx + b.dw;
  const insideY = p.y >= b.dy && p.y <= b.dy + b.dh;
  _opDragDX = (insideX ? p.x - b.dx : b.dw / 2);
  _opDragDY = (insideY ? p.y - b.dy : b.dh / 2);
  _opDragging = true;
  _opCanvas.setPointerCapture(e.pointerId);
  _opCanvas.style.cursor = 'grabbing';
  _opApplyDrag(p);
});
_opCanvas.addEventListener('pointermove', (e) => { if (_opDragging) _opApplyDrag(_opCanvasPos(e)); });
_opCanvas.addEventListener('pointerup',   () => { _opDragging = false; _opCanvas.style.cursor = 'grab'; });
_opCanvas.addEventListener('pointercancel', () => { _opDragging = false; _opCanvas.style.cursor = 'grab'; });

function _opApplyDrag(p) {
  const { W, H, sw, sh, freeX, freeY } = _opComputeBox();
  const s = _opCanvas.width / W;
  // Desired top-left in output px = cursor − grab offset, converted from display px
  const ox = (p.x - _opDragDX) / s;
  const oy = (p.y - _opDragDY) / s;
  _opPosFracX = freeX > 0 ? Math.min(1, Math.max(0, ox / freeX)) : 0.5;
  _opPosFracY = freeY > 0 ? Math.min(1, Math.max(0, oy / freeY)) : 0.5;
  updateOutpaintPreview();
}

// Manual offset entry (advanced) → convert absolute px back to a position fraction
['op-offset-x','op-offset-y'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    const { freeX, freeY } = _opComputeBox();
    const vx = Number(document.getElementById('op-offset-x').value);
    const vy = Number(document.getElementById('op-offset-y').value);
    if (!Number.isNaN(vx)) _opPosFracX = freeX > 0 ? Math.min(1, Math.max(0, vx / freeX)) : 0.5;
    if (!Number.isNaN(vy)) _opPosFracY = freeY > 0 ? Math.min(1, Math.max(0, vy / freeY)) : 0.5;
    updateOutpaintPreview();
  });
});

document.getElementById('op-center-btn').addEventListener('click', () => {
  _opPosFracX = 0.5; _opPosFracY = 0.5;
  updateOutpaintPreview();
});

// Scale the source to exactly sw×sh output pixels and upload it, so the API
// places it at that size at our offset. If no scaling is needed, reuse the
// already-uploaded original.
async function _opScaleSourceUpload(sw, sh) {
  if (sw === _outpaintImgNW && sh === _outpaintImgNH) return outpaintUZ.url;
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(_opSrcImg, 0, 0, sw, sh);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const fd = new FormData(); fd.append('image', blob, 'op-src.png');
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error('Failed to upload resized source image');
  return data.url;
}

document.getElementById('btn-outpaint').addEventListener('click', async () => {
  if (!outpaintUZ.url || !_opSrcImg) { toast('Upload a source image first', 'warn'); return; }
  let w = Number(document.getElementById('op-width').value);
  let h = Number(document.getElementById('op-height').value);
  if (!w || !h) { toast('Set output width and height', 'warn'); return; }

  // Outpainting canvas has a 4MP hard cap (same limit as Generate) — the width/height
  // inputs and AR-lock logic only clamp each side to 4096px individually, so a large
  // canvas can still exceed 4MP in total. Scale down proportionally before sending.
  const OUTPAINT_MAX_PX = 4_194_304; // 4MP, e.g. 2048×2048
  if (w * h > OUTPAINT_MAX_PX) {
    const s = Math.sqrt(OUTPAINT_MAX_PX / (w * h));
    const origW = w, origH = h;
    // Floor (not round) the 16px snap — rounding up can push the area back over
    // the cap (e.g. 3000x2000 rounds to 4,220,160px, still over the 4,194,304 limit).
    w = Math.max(64, Math.floor((w * s) / 16) * 16);
    h = Math.max(64, Math.floor((h * s) / 16) * 16);
    document.getElementById('op-width').value = w;
    document.getElementById('op-height').value = h;
    updateOutpaintPreview();
    toast(`Canvas ${origW}×${origH} exceeded the 4MP outpaint limit — scaled to ${w}×${h}`, 'warn');
  }

  // Derive the source's placed size + offset from the (now-clamped) frame.
  const { W, H, sw, sh, ox, oy } = _opComputeBox();

  const btn = document.getElementById('btn-outpaint');
  btn.disabled = true;
  showStatus('outpaint-status');
  const stopTimer = startTimer(document.getElementById('outpaint-elapsed'));

  try {
    const srcUrl = await _opScaleSourceUpload(sw, sh);
    const entry = await apiFetch('/api/outpaint', {
      image_url:        srcUrl,
      width: W, height: H,
      prompt:           document.getElementById('op-prompt').value || undefined,
      mode:             document.getElementById('op-mode').value,
      reference_offset_x: ox,
      reference_offset_y: oy,
      auto_crop:        document.getElementById('op-autocrop').checked,
      output_format:    document.getElementById('op-format').value,
      safety_tolerance: 5,
    });

    // A/B: compare result against original source
    if (outpaintUZ.objUrl) entry._refPreviewUrl = outpaintUZ.objUrl;

    renderSingleResult('outpaint-results', entry);
    toast('Outpainted!', 'success');
    addSessionCost(entry.cost);
    loadCredits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('outpaint-status');
    btn.disabled = false;
  }
});

updateOutpaintPreview();

// ─── VTO tab ──────────────────────────────────────────────────────────────────
const vtoPersonUZ  = new UploadZone('vto-person-upload',  'vto-person-file',  'vto-person-preview');
const vtoGarmentUZ = new UploadZone('vto-garment-upload', 'vto-garment-file', 'vto-garment-preview');

// Track which VTO zone was last clicked so paste knows where to go when both are full
let _vtoLastFocus = 'person';

function _vtoUpdatePasteTarget() {
  // Only show the indicator when the VTO tab is active
  const isVto = document.querySelector('.tab-btn.active')?.dataset.tab === 'vto';
  const personEl  = document.getElementById('vto-person-upload');
  const garmentEl = document.getElementById('vto-garment-upload');
  if (!personEl || !garmentEl) return;

  // Determine next-paste target
  let nextTarget;
  if (!vtoPersonUZ.url)       nextTarget = 'person';
  else if (!vtoGarmentUZ.url) nextTarget = 'garment';
  else                        nextTarget = _vtoLastFocus;

  personEl.classList.toggle('vto-paste-target',  isVto && nextTarget === 'person');
  garmentEl.classList.toggle('vto-paste-target', isVto && nextTarget === 'garment');
}

document.getElementById('vto-person-upload').addEventListener('mousedown',  () => { _vtoLastFocus = 'person';  _vtoUpdatePasteTarget(); });
document.getElementById('vto-garment-upload').addEventListener('mousedown', () => { _vtoLastFocus = 'garment'; _vtoUpdatePasteTarget(); });

// Update indicator whenever the VTO tab becomes active
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setTimeout(_vtoUpdatePasteTarget, 50));
});

// Update after each paste completes (handled by _routePasteFile)
vtoPersonUZ.onChange  = () => _vtoUpdatePasteTarget();
vtoGarmentUZ.onChange = () => _vtoUpdatePasteTarget();

document.getElementById('btn-vto').addEventListener('click', async () => {
  if (!vtoPersonUZ.url)  { toast('Upload a person image', 'warn'); return; }
  if (!vtoGarmentUZ.url) { toast('Upload a garment image', 'warn'); return; }

  const btn = document.getElementById('btn-vto');
  btn.disabled = true;
  showStatus('vto-status');
  const stopTimer = startTimer(document.getElementById('vto-elapsed'));

  try {
    const entry = await apiFetch('/api/vto', {
      person_url:       vtoPersonUZ.url,
      garment_url:      vtoGarmentUZ.url,
      prompt:           document.getElementById('vto-prompt').value,
      seed:             document.getElementById('vto-seed').value || undefined,
      output_format:    document.getElementById('vto-format').value,
      safety_tolerance: 5,
    });

    // A/B: compare try-on result against original person image
    if (vtoPersonUZ.objUrl) entry._refPreviewUrl = vtoPersonUZ.objUrl;

    renderSingleResult('vto-results', entry);
    toast('Try-on complete!', 'success');

    addSessionCost(entry.cost);
    loadCredits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('vto-status');
    btn.disabled = false;
  }
});

// ─── Image resize helper (client-side canvas) ─────────────────────────────────
// Returns a new server URL if resize was needed, or the original URL if not.
// maxPixels: e.g. 4_194_304 for 2048×2048 (Deblur cap).
async function resizeImageIfNeeded(objUrl, serverUrl, maxPixels) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w * h <= maxPixels) { resolve({ url: serverUrl, resized: false }); return; }

      // Scale down preserving aspect ratio
      const scale = Math.sqrt(maxPixels / (w * h));
      const nw    = Math.floor(w * scale);
      const nh    = Math.floor(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = nw;
      canvas.height = nh;
      canvas.getContext('2d').drawImage(img, 0, 0, nw, nh);

      canvas.toBlob(async blob => {
        try {
          const fd = new FormData();
          fd.append('image', blob, 'resized.png');
          const r   = await fetch('/api/upload', { method: 'POST', body: fd });
          const dat = await r.json();
          resolve({ url: dat.url, resized: true, origW: w, origH: h, newW: nw, newH: nh });
        } catch (e) { reject(e); }
      }, 'image/png');
    };
    img.onerror = () => reject(new Error('Could not load image for resize check'));
    img.src = objUrl;
  });
}

// ─── DEBLUR tab ───────────────────────────────────────────────────────────────
const deblurUZ = new UploadZone('deblur-upload', 'deblur-file', 'deblur-img-preview');

document.getElementById('btn-deblur').addEventListener('click', async () => {
  if (!deblurUZ.url) { toast('Upload an image first', 'warn'); return; }

  const btn = document.getElementById('btn-deblur');
  btn.disabled = true;
  showStatus('deblur-status');
  const stopTimer = startTimer(document.getElementById('deblur-elapsed'));

  try {
    // Deblur API cap: 2048×2048 = 4,194,304 px — auto-resize if needed
    const DEBLUR_MAX_PX = 2048 * 2048;
    let imageUrl = deblurUZ.url;

    if (deblurUZ.objUrl) {
      const { url, resized, origW, origH, newW, newH } =
        await resizeImageIfNeeded(deblurUZ.objUrl, deblurUZ.url, DEBLUR_MAX_PX);
      if (resized) {
        imageUrl = url;
        toast(
          `⚠️ Image too large for Deblur (${origW}×${origH} = ${(origW*origH/1e6).toFixed(1)}MP). Auto-resized to ${newW}×${newH} before sending.`,
          'warn'
        );
      }
    }

    const entry = await apiFetch('/api/deblur', {
      image_url:        imageUrl,
      prompt:           document.getElementById('deblur-prompt').value || undefined,
      output_format:    document.getElementById('deblur-format').value,
      safety_tolerance: 5,
    });

    renderSingleResult('deblur-results', entry);
    if (entry._refPreviewUrl == null && deblurUZ.objUrl) entry._refPreviewUrl = deblurUZ.objUrl;
    toast('Deblur complete!', 'success');
    addSessionCost(entry.cost);
    loadCredits();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('deblur-status');
    btn.disabled = false;
  }
});



// ─── UPSCALE (Topaz) tab ──────────────────────────────────────────────────────
const upscaleUZ = new UploadZone('upscale-upload', 'upscale-file', 'upscale-img-preview');

// Which parameter groups are relevant for each model tier.
// precision   = Gigapixel models (enhance/async)
// generative  = Wonder models (enhance-gen/async)
// creative    = Bloom models (enhance-gen/async)
// faces       = Recover Faces (restore-gen/async) — its own tiny param set
// transparent = Transparent Image Upscale (tool/async) — PNG only, no face/sharpen/denoise
const UPSCALE_TIER_VISIBILITY = {
  precision:   ['format', 'scale', 'crop', 'subject', 'face', 'sharpen', 'denoise'],
  generative:  ['format', 'scale', 'crop', 'subject', 'face', 'sharpen', 'denoise', 'gen'],
  creative:    ['format', 'scale', 'crop', 'subject', 'face', 'sharpen', 'denoise', 'gen'],
  faces:       ['format', 'faces'],
  transparent: ['scale', 'crop'],
};

const UPSCALE_WRAP_IDS = {
  format: 'upscale-format-wrap', scale: 'upscale-scale-wrap',
  width: 'upscale-width-wrap', height: 'upscale-height-wrap',
  crop: 'upscale-crop-wrap', subject: 'upscale-subject-wrap', face: 'upscale-face-wrap',
  sharpen: 'upscale-sharpen-wrap', denoise: 'upscale-denoise-wrap', gen: 'upscale-gen-section',
  faces: 'upscale-faces-section',
};

// Detected natural size of whatever's currently loaded into the Upscale
// source image — used to compute 2x/4x/8x output sizes instead of making
// the user guess numbers.
let _upscaleImgNW = null;
let _upscaleImgNH = null;
const UPSCALE_MAX_DIM = 32000; // Topaz's hard per-side cap, all models

function applyUpscaleTier() {
  const sel = document.getElementById('upscale-model');
  const tier = sel.options[sel.selectedIndex].dataset.tier || 'precision';
  const visible = new Set(UPSCALE_TIER_VISIBILITY[tier] || []);

  for (const [key, id] of Object.entries(UPSCALE_WRAP_IDS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.toggle('hidden', !visible.has(key));
  }

  // Face enhancement sub-fields follow both the tier AND the checkbox state
  const faceOptsWrap = document.getElementById('upscale-face-opts-wrap');
  if (visible.has('face') && document.getElementById('upscale-face').checked) {
    faceOptsWrap.classList.remove('hidden');
  } else {
    faceOptsWrap.classList.add('hidden');
  }

  // Transparent Image Upscale is PNG-only
  if (tier === 'transparent') {
    document.getElementById('upscale-format').value = 'png';
  }

  applyUpscaleScaleMode();
}

// Compute/display the effective output size for the current scale-mode
// selection, and show/hide the manual width/height fields (only shown for
// "Custom"). Mirrors the DaVinci Resolve Topaz script's approach: default to
// a multiple of the detected source resolution instead of raw numbers.
function applyUpscaleScaleMode() {
  const scaleWrap = document.getElementById('upscale-scale-wrap');
  const widthWrap = document.getElementById('upscale-width-wrap');
  const heightWrap = document.getElementById('upscale-height-wrap');
  const hint = document.getElementById('upscale-scale-hint');
  const scaleMode = document.getElementById('upscale-scale').value;
  const scaleControlVisible = !scaleWrap.classList.contains('hidden');

  if (!scaleControlVisible) {
    widthWrap.classList.add('hidden');
    heightWrap.classList.add('hidden');
    return;
  }

  if (scaleMode === 'custom') {
    widthWrap.classList.remove('hidden');
    heightWrap.classList.remove('hidden');
    hint.textContent = '';
    return;
  }

  // Auto / 1x / 2x / 4x / 8x — manual fields stay hidden, computed here instead
  widthWrap.classList.add('hidden');
  heightWrap.classList.add('hidden');

  if (scaleMode === 'auto') {
    document.getElementById('upscale-width').value = '';
    document.getElementById('upscale-height').value = '';
    hint.textContent = 'Topaz will choose the best output size for this model.';
    return;
  }

  if (!_upscaleImgNW || !_upscaleImgNH) {
    hint.textContent = 'Upload an image to see computed size';
    return;
  }

  const mult = Number(scaleMode);
  let outW = Math.round(_upscaleImgNW * mult);
  let outH = Math.round(_upscaleImgNH * mult);
  if (outW > UPSCALE_MAX_DIM || outH > UPSCALE_MAX_DIM) {
    const clampRatio = UPSCALE_MAX_DIM / Math.max(outW, outH);
    outW = Math.round(outW * clampRatio);
    outH = Math.round(outH * clampRatio);
    hint.textContent = `${outW} × ${outH} (clamped to Topaz's ${UPSCALE_MAX_DIM}px max)`;
  } else {
    hint.textContent = `${outW} × ${outH}`;
  }
  document.getElementById('upscale-width').value = outW;
  document.getElementById('upscale-height').value = outH;
}

document.getElementById('upscale-model').addEventListener('change', applyUpscaleTier);
document.getElementById('upscale-scale').addEventListener('change', applyUpscaleScaleMode);

upscaleUZ.onChange = () => {
  const img = new Image();
  img.onload = () => {
    _upscaleImgNW = img.naturalWidth;
    _upscaleImgNH = img.naturalHeight;
    applyUpscaleScaleMode();
  };
  img.src = upscaleUZ.objUrl || upscaleUZ.url;
};

applyUpscaleTier();

// Show/hide face strength+creativity sliders based on face enhancement checkbox
document.getElementById('upscale-face').addEventListener('change', applyUpscaleTier);

// Show/hide detail-strength slider based on the extra-detail-pass checkbox
document.getElementById('upscale-detail').addEventListener('change', (e) => {
  document.getElementById('upscale-detail-strength-wrap').classList.toggle('hidden', !e.target.checked);
});

// Live-update labels next to every slider
const upscaleSliderLabels = [
  ['upscale-face-strength', 'upscale-face-strength-val'],
  ['upscale-face-creativity', 'upscale-face-val'],
  ['upscale-sharpen', 'upscale-sharpen-val', v => v === '0' ? 'auto' : v],
  ['upscale-denoise', 'upscale-denoise-val', v => v === '0' ? 'auto' : v],
  ['upscale-creativity', 'upscale-creativity-val'],
  ['upscale-texture', 'upscale-texture-val'],
  ['upscale-detail-strength', 'upscale-detail-val'],
  ['upscale-faces-strength', 'upscale-faces-strength-val'],
];
upscaleSliderLabels.forEach(([inputId, labelId, fmt]) => {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (!input || !label) return;
  input.addEventListener('input', (e) => {
    label.textContent = fmt ? fmt(e.target.value) : e.target.value;
  });
});

document.getElementById('btn-upscale').addEventListener('click', async () => {
  if (!upscaleUZ.url) { toast('Upload an image first', 'warn'); return; }

  const btn = document.getElementById('btn-upscale');
  btn.disabled = true;
  showStatus('upscale-status', 'upscale-status-text', 'Submitting to Topaz...');
  const stopTimer = startTimer(document.getElementById('upscale-elapsed'));

  try {
    const sel = document.getElementById('upscale-model');
    const model = sel.value;
    const tier = sel.options[sel.selectedIndex].dataset.tier || 'precision';
    const format = document.getElementById('upscale-format').value;

    const payload = {
      image_url: upscaleUZ.url,
      model,
      output_format: format,
    };

    const isVisible = (id) => !document.getElementById(id).classList.contains('hidden');

    // Width/height inputs are hidden for every scale mode except "Custom" —
    // for the preset multipliers, applyUpscaleScaleMode() already computed
    // and stored the values in these same inputs, so reading .value works
    // regardless of whether the wrap div is currently shown.
    if (isVisible('upscale-scale-wrap')) {
      const width = document.getElementById('upscale-width').value.trim();
      const height = document.getElementById('upscale-height').value.trim();
      if (width)  payload.output_width = Number(width);
      if (height) payload.output_height = Number(height);
    }
    if (isVisible('upscale-crop-wrap') && document.getElementById('upscale-crop').checked) {
      payload.crop_to_fill = true;
    }
    if (isVisible('upscale-subject-wrap')) {
      const subject = document.getElementById('upscale-subject').value;
      if (subject) payload.subject_detection = subject;
    }
    if (isVisible('upscale-face-wrap') && document.getElementById('upscale-face').checked) {
      payload.face_enhancement = true;
      payload.face_enhancement_strength = Number(document.getElementById('upscale-face-strength').value);
      payload.face_enhancement_creativity = Number(document.getElementById('upscale-face-creativity').value);
    }
    if (isVisible('upscale-sharpen-wrap')) {
      const sharpen = document.getElementById('upscale-sharpen').value;
      if (Number(sharpen) > 0) payload.sharpen = Number(sharpen);
    }
    if (isVisible('upscale-denoise-wrap')) {
      const denoise = document.getElementById('upscale-denoise').value;
      if (Number(denoise) > 0) payload.denoise = Number(denoise);
    }
    if (!document.getElementById('upscale-gen-section').classList.contains('hidden')) {
      const prompt = document.getElementById('upscale-prompt').value.trim();
      const autoprompt = document.getElementById('upscale-autoprompt').checked;
      if (autoprompt) payload.autoprompt = true;
      else if (prompt) payload.prompt = prompt;
      payload.creativity = Number(document.getElementById('upscale-creativity').value);
      payload.texture = Number(document.getElementById('upscale-texture').value);
      if (document.getElementById('upscale-detail').checked) {
        payload.detail = true;
        payload.detail_strength = Number(document.getElementById('upscale-detail-strength').value);
      }
    }
    if (tier === 'faces') {
      payload.strength = Number(document.getElementById('upscale-faces-strength').value);
    }

    // Submit async job
    const resSubmit = await topazFetch('/api/topaz/enhance', payload);
    const processId = resSubmit.process_id;
    if (!processId) throw new Error('Topaz did not return a process_id');

    // Poll for status. A single flaky network blip here used to kill the
    // whole job (Topaz would still be processing fine on their end) — now we
    // tolerate a few consecutive failed poll attempts before giving up, and
    // give up cleanly after a stall timeout instead of polling forever.
    let status = 'Pending';
    let progress = 0;
    let consecutiveErrors = 0;
    let lastProgress = -1;
    let pollsSinceProgress = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    const STALL_TIMEOUT_POLLS = 150; // 150 * 2s = 5 minutes with no progress change

    while (status !== 'Completed') {
      await new Promise(r => setTimeout(r, 2000));

      let resStatus;
      try {
        resStatus = await topazGet(`/api/topaz/status/${processId}`);
        consecutiveErrors = 0;
      } catch (e) {
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          throw new Error(`Lost connection to Topaz while checking job status (process ID: ${processId}): ${e.message}`);
        }
        document.getElementById('upscale-status-text').textContent = `Connection hiccup, retrying... (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`;
        continue;
      }

      status = resStatus.status;
      progress = resStatus.progress ?? 0;

      const pct = progress ? ` (${Math.round(progress)}%)` : '';
      document.getElementById('upscale-status-text').textContent = `Processing...${pct}`;

      if (status === 'Failed' || status === 'Cancelled') {
        throw new Error(`Topaz job ended with status: ${status}`);
      }

      if (progress !== lastProgress) {
        lastProgress = progress;
        pollsSinceProgress = 0;
      } else {
        pollsSinceProgress++;
        if (pollsSinceProgress >= STALL_TIMEOUT_POLLS) {
          throw new Error(`Topaz job stalled at ${Math.round(progress)}% for 5+ minutes (process ID: ${processId}). It may still finish — check your Topaz account, or try again.`);
        }
      }
    }

    // Download the completed result
    document.getElementById('upscale-status-text').textContent = 'Saving result...';
    const params = new URLSearchParams({
      fmt: format,
      model,
      input_url: upscaleUZ.url
    });
    const entry = await topazGet(`/api/topaz/download/${processId}?${params.toString()}`);

    renderSingleResult('upscale-results', entry);
    if (entry._refPreviewUrl == null && upscaleUZ.objUrl) entry._refPreviewUrl = upscaleUZ.objUrl;
    toast('Upscale complete!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    stopTimer();
    hideStatus('upscale-status');
    btn.disabled = false;
  }
});



// ─── Single-result renderer ───────────────────────────────────────────────────
function renderSingleResult(containerId, entry) {
  const container = document.getElementById(containerId);
  const placeholder = container.querySelector('.results-placeholder');
  if (placeholder) placeholder.remove();

  let grid = container.querySelector('.result-grid');
  if (!grid) { grid = document.createElement('div'); grid.className = 'result-grid'; container.prepend(grid); }

  const card = buildResultCard(entry,
    e => { switchTab('inpaint'); setTimeout(() => inpaintUZ.setFromUrl(e.image_url), 100); },
    e => { switchTab('generate'); if (e.prompt) document.getElementById('gen-prompt').value = e.prompt; }
  );
  grid.prepend(card);
}

// ─── HISTORY tab ─────────────────────────────────────────────────────────────
let _allHistory = [];

async function loadHistory() {
  try {
    _allHistory = await apiGet('/api/history');
    renderHistory();
  } catch (e) {
    toast('Could not load history: ' + e.message, 'error');
  }
}

function renderHistory() {
  const filterTool = document.getElementById('hist-filter-tool').value;
  const search     = (document.getElementById('hist-search')?.value || '').toLowerCase();
  let items = filterTool ? _allHistory.filter(e => e.tool === filterTool) : _allHistory;
  if (search) items = items.filter(e => (e.prompt || '').toLowerCase().includes(search));

  if (typeof getSortedHistory === 'function') items = getSortedHistory(items);

  // Render only the active view
  if (_histView === 'log') {
    if (typeof renderHistoryList === 'function') renderHistoryList(items);
    return;
  }

  // — Gallery view —
  const grid  = document.getElementById('history-grid');
  const empty = document.getElementById('history-empty');
  grid.innerHTML = '';

  if (!items.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  items.forEach((entry, idx) => {
    if (!entry.image_url) return; // skip malformed entries

    // A/B compare source: use the entry's stored input_url or first ref_url
    const refPreview = entry.input_url || entry.ref_urls?.[0] || null;

    const card = document.createElement('div');
    card.className = 'history-card';
    const ts   = new Date(entry.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const cost = entry.cost != null ? `${entry.cost}cr` : '';

    card.innerHTML = `
      <div style="position:relative;overflow:hidden">
        <img src="${escHtml(entry.image_url)}" alt="${escHtml(entry.prompt)}" loading="lazy" style="width:100%;display:block">
        <span class="hc-ab-label" style="display:none;position:absolute;bottom:6px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.72);color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:10px;pointer-events:none;white-space:nowrap"></span>
      </div>
      <div class="history-card-body">
        <div class="history-card-prompt">${escHtml(entry.prompt) || '(no prompt)'}</div>
        <div class="history-meta-row">
          <span class="tool-badge ${escHtml(entry.tool)}">${escHtml(entry.tool)}</span>
          <span class="history-ts">${ts} ${cost}</span>
        </div>
        <div class="history-actions">
          <a class="btn btn-secondary btn-sm" href="${escHtml(entry.image_url)}" download>↓</a>
          <button class="btn btn-secondary btn-sm" data-action="copy" title="Copy to clipboard">📋</button>
          ${refPreview ? '<button class="btn btn-secondary btn-sm hc-ab-btn">A⇄B</button>' : ''}
          <div class="rc-sendto-wrap">
            <button class="btn btn-primary btn-sm" data-action="hc-sendto">Send to ▾</button>
            <div class="lb-sendto-menu hidden hc-sendto-menu">
              <button data-sendto="generate">🎨 Generate <span class="lb-sendto-hint">as ref</span></button>
              <button data-sendto="inpaint">🖌 Inpaint</button>
              <button data-sendto="erase">🧹 Erase</button>
              <button data-sendto="outpaint">📐 Outpaint</button>
              <button data-sendto="vto">👕 Try-On</button>
              <button data-sendto="deblur">🔍 Deblur</button>
              <button data-sendto="upscale">🔬 Upscale <span class="lb-sendto-hint">Topaz</span></button>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" data-action="hc-delete" title="Delete from history">🗑</button>
        </div>
      </div>`;

    const cardImg = card.querySelector('img');
    const abLabel = card.querySelector('.hc-ab-label');
    let abState   = 'generated';
    const hcMenu  = card.querySelector('.hc-sendto-menu');


    card.querySelector('[data-action="copy"]')?.addEventListener('click', () => copyImageToClipboard(entry.image_url));
    card.querySelector('[data-action="hc-delete"]')?.addEventListener('click', async () => {
      const prompt = entry.prompt || 'Untitled';
      const preview = prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt;
      if (!confirm(`Delete "${preview}"?`)) return;
      const res = await fetch(`/api/history/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      if (res.ok) {
        _allHistory = _allHistory.filter(h => h.id !== entry.id);
        renderHistory();
        toast('Deleted', 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        toast(err.error || 'Delete failed', 'error');
      }
    });
    card.querySelector('[data-action="hc-sendto"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.hc-sendto-menu').forEach(m => { if (m !== hcMenu) m.classList.add('hidden'); });
      hcMenu?.classList.toggle('hidden');
      if (hcMenu && !hcMenu.classList.contains('hidden')) placeSendToMenu(e.currentTarget, hcMenu);
    });
    hcMenu?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-sendto]');
      if (!btn) return;
      hcMenu.classList.add('hidden');
      sendToTool(btn.dataset.sendto, entry.image_url, entry);
    });

    const abBtn = card.querySelector('.hc-ab-btn');
    if (abBtn) {
      abBtn.addEventListener('click', () => {
        if (abState === 'generated') {
          cardImg.src = refPreview;
          abLabel.textContent = '📷 Reference';
          abLabel.style.display = 'block';
          abState = 'ref';
        } else {
          cardImg.src = entry.image_url;
          abLabel.textContent = '✨ Generated';
          abLabel.style.display = 'block';
          abState = 'generated';
          setTimeout(() => { if (abState === 'generated') abLabel.style.display = 'none'; }, 1500);
        }
      });
    }

    // Hide 🗑 on small cards — it only makes sense in the fullscreen lightbox
    const delBtn = card.querySelector('[data-action="hc-delete"]');
    if (delBtn) delBtn.style.display = card.clientWidth > 280 ? '' : 'none';

    // Highlight card if it's selected for comparison
    if (_compareMode) {
      if (_abA && _abA.id === entry.id) card.classList.add('hist-compare-a');
      if (_abB && _abB.id === entry.id) card.classList.add('hist-compare-b');
    }

    cardImg?.addEventListener('click', () => {
      if (_compareMode) { selectForCompare(entry); return; }
      if (refPreview) entry._refPreviewUrl = refPreview;
      openLightbox(entry, items, idx);
    });
    grid.appendChild(card);
  });
}


// ── History view & sort state ─────────────────────────────────────────────────
let _histView    = 'gallery';
let _histSortCol = 'timestamp';
let _histSortDir = 'desc';

function getSortedHistory(rawItems) {
  return [...rawItems].sort((a, b) => {
    let av = a[_histSortCol] ?? '', bv = b[_histSortCol] ?? '';
    if (_histSortCol === 'timestamp') { av = new Date(av); bv = new Date(bv); }
    else if (_histSortCol === 'cost' || _histSortCol === 'seed') { av = Number(av) || 0; bv = Number(bv) || 0; }
    else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
    return _histSortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
}

function renderHistoryList(items) {
  const body  = document.getElementById('hist-log-body');
  const empty = document.getElementById('hist-log-empty');
  body.innerHTML = '';
  if (!items.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  items.forEach((e, idx) => {
    const ts   = new Date(e.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const row  = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border)';
    row.style.cursor = 'pointer';
    row.innerHTML = `
      <td style="padding:8px 14px;white-space:nowrap;color:var(--text-secondary);font-size:11px">${ts}</td>
      <td style="padding:8px 14px"><span class="tool-badge ${escHtml(e.tool)}" style="font-size:10px">${escHtml(e.tool)}</span></td>
      <td style="padding:8px 14px;font-size:11px;color:var(--text-secondary)">${escHtml(e.model) || '—'}</td>
      <td style="padding:8px 14px;font-size:12px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(e.prompt)}">${escHtml(e.prompt) || '(none)'}</td>
      <td style="padding:8px 14px;font-size:11px;color:var(--text-secondary)">${e.width && e.height ? e.width+'×'+e.height : '—'}</td>
      <td style="padding:8px 14px;font-size:11px;color:var(--text-muted);font-family:'JetBrains Mono',monospace">${e.seed || '—'}</td>
      <td style="padding:8px 14px;font-size:11px;color:var(--text-secondary)">${e.cost != null ? e.cost+'cr' : '—'}</td>
      <td style="padding:8px 14px"><img src="${escHtml(e.image_url)}" style="height:40px;width:auto;border-radius:4px;cursor:pointer" loading="lazy"></td>`;
    row.querySelector('img').addEventListener('click', () => openLightbox(e, items, idx));
    row.addEventListener('click', ev => { if (ev.target.tagName !== 'IMG') openLightbox(e, items, idx); });
    row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-hover)');
    row.addEventListener('mouseleave', () => row.style.background = '');
    body.appendChild(row);
  });
}

// View toggle
document.querySelectorAll('#hist-view-toggle [data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    _histView = btn.dataset.view;
    document.querySelectorAll('#hist-view-toggle [data-view]').forEach(b =>
      b.classList.toggle('active', b === btn));
    document.getElementById('hist-gallery-wrap').classList.toggle('hidden', _histView !== 'gallery');
    document.getElementById('hist-log-wrap').classList.toggle('hidden',     _histView !== 'log');
    document.getElementById('hist-size-wrap').style.display = _histView === 'gallery' ? '' : 'none';
    renderHistory();
  });
});

// Size slider → CSS variable on the grid
document.getElementById('hist-size').addEventListener('input', function() {
  document.getElementById('history-grid').style.setProperty('--hist-col-w', this.value + 'px');
});

// Sortable column headers
document.querySelectorAll('#hist-log-table .sortable-col').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    _histSortDir = (_histSortCol === col && _histSortDir === 'asc') ? 'desc' : 'asc';
    if (_histSortCol !== col) { _histSortDir = col === 'timestamp' ? 'desc' : 'asc'; }
    _histSortCol = col;
    document.querySelectorAll('#hist-log-table .sort-ind').forEach(s => s.textContent = '');
    th.querySelector('.sort-ind').textContent = _histSortDir === 'asc' ? '↑' : '↓';
    renderHistory();
  });
});

document.getElementById('hist-filter-tool').addEventListener('change', renderHistory);
document.getElementById('hist-search').addEventListener('input', renderHistory);
document.getElementById('hist-refresh').addEventListener('click', loadHistory);

document.getElementById('hist-clear').addEventListener('click', async () => {
  if (!confirm('Clear all history? This cannot be undone.')) return;
  await fetch('/api/history', { method: 'DELETE' });
  _allHistory = [];
  renderHistory();
  toast('History cleared', 'info');
});


// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function openShortcuts() { document.getElementById('shortcuts-modal').classList.remove('hidden'); }
function closeShortcuts() { document.getElementById('shortcuts-modal').classList.add('hidden'); }
document.getElementById('btn-shortcuts').addEventListener('click', openShortcuts);
document.getElementById('shortcuts-close').addEventListener('click', closeShortcuts);
document.getElementById('shortcuts-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('shortcuts-modal')) closeShortcuts();
});

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  const sc = document.getElementById('shortcuts-modal');
  const pm = document.getElementById('painter-modal');

  if (e.key === 'Escape') {
    const sm = document.getElementById('settings-modal');
    const cm = document.getElementById('compare-modal');
    if (!sc.classList.contains('hidden'))  { closeShortcuts(); return; }
    if (!sm.classList.contains('hidden'))  { closeSettings();  return; }
    if (!cm.classList.contains('hidden'))  { cm.classList.add('hidden'); return; }
    if (!lb.classList.contains('hidden'))  { lb.classList.add('hidden'); return; }
    if (!pm.classList.contains('hidden'))  { pm.classList.add('hidden'); return; }
  }

  // Arrow keys navigate lightbox when it is open
  if (!lb.classList.contains('hidden') && pm.classList.contains('hidden')) {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); _lbNavigate(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); _lbNavigate(+1); return; }
  }

  // ? opens shortcuts (but not when typing)
  if (e.key === '?' && document.activeElement?.tagName?.toLowerCase() !== 'textarea'
      && document.activeElement?.tagName?.toLowerCase() !== 'input') {
    openShortcuts(); return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    const btnMap = {
      generate: 'btn-generate', inpaint: 'btn-inpaint', erase: 'btn-erase',
      outpaint: 'btn-outpaint', vto: 'btn-vto', deblur: 'btn-deblur',
    };
    if (btnMap[activeTab]) document.getElementById(btnMap[activeTab])?.click();
  }
});


// ─── Global clipboard paste (Cmd/Ctrl+V) ─────────────────────────────────────
// Routes to the active tab's primary upload zone.
// Hover is SEPARATE — it's only for previewing already-loaded images.

async function _routePasteFile(file) {
  const tab = document.querySelector('.tab-btn.active')?.dataset.tab;

  if (tab === 'generate') {
    const slots = Array.from(document.querySelectorAll('.refs-grid .ref-slot'));
    const empty = slots.find(s => !s._state?.url);
    if (empty?._handleFile) {
      await empty._handleFile(file);
      toast('📋 Pasted into reference slot', 'success');
    } else {
      toast('All reference slots are full — clear one first', 'warn');
    }
    return;
  }

  // VTO has two zones — smart routing:
  // → person if empty, otherwise garment if empty, otherwise last-clicked zone
  if (tab === 'vto') {
    let target;
    if (!vtoPersonUZ.url)       target = vtoPersonUZ;   // person empty → fill person
    else if (!vtoGarmentUZ.url) target = vtoGarmentUZ;  // garment empty → fill garment
    else                        target = _vtoLastFocus === 'garment' ? vtoGarmentUZ : vtoPersonUZ; // both full → last-clicked
    await target._handleFile(file);
    toast(`📋 Pasted into ${target === vtoPersonUZ ? 'person' : 'garment'} slot`, 'success');
    return;
  }

  const uzMap = {
    inpaint:  inpaintUZ,
    erase:    eraseUZ,
    outpaint: outpaintUZ,
    deblur:   deblurUZ,
    upscale:  upscaleUZ,
  };
  const uz = uzMap[tab];
  if (uz) {
    await uz._handleFile(file);
    toast('📋 Image pasted', 'success');
  } else {
    toast('Switch to a tab first, then paste', 'warn');
  }
}


window.addEventListener('paste', async (e) => {
  // Only skip if user is actively typing in the prompt textarea
  if (document.activeElement?.tagName?.toLowerCase() === 'textarea') return;

  // Don't intercept if fullscreen painter is open
  if (!document.getElementById('painter-modal')?.classList.contains('hidden')) return;


  // ── Attempt 1: standard paste event clipboardData ─────────────────────────
  // Works for images copied from web browsers / other web sources.
  const items = Array.from(e.clipboardData?.items || []);
  const imgItem = items.find(it => it.type.startsWith('image/'));
  if (imgItem) {
    const file = imgItem.getAsFile();
    if (file) { e.preventDefault(); await _routePasteFile(file); return; }
  }

  // ── Attempt 2: navigator.clipboard.read() ────────────────────────────────
  // Required for images copied from native macOS apps (video players,
  // Preview, Finder, screenshot tools) where clipboardData.items is empty.
  // The paste event counts as a user gesture so clipboard.read() is allowed.
  try {
    const clipItems = await navigator.clipboard.read();
    for (const ci of clipItems) {
      const imgType = ci.types.find(t => t.startsWith('image/'));
      if (imgType) {
        e.preventDefault();
        const blob = await ci.getType(imgType);
        const file = new File([blob], 'paste.png', { type: blob.type || 'image/png' });
        await _routePasteFile(file);
        return;
      }
    }
  } catch (_) {
    // clipboard.read() blocked or not available — silently ignore
  }
});


// ─── A/B Compare mode ────────────────────────────────────────────────────────
let _compareMode = false;
let _abA = null;  // entry selected as A
let _abB = null;  // entry selected as B

document.getElementById('hist-compare-btn').addEventListener('click', () => {
  _compareMode = !_compareMode;
  _abA = null;
  _abB = null;
  document.getElementById('hist-compare-btn').classList.toggle('active', _compareMode);
  document.getElementById('history-grid').classList.toggle('compare-mode', _compareMode);
  renderHistory();
  if (_compareMode) toast('⚖ Click two images to compare them side-by-side', 'info', 3000);
});

function selectForCompare(entry) {
  // Clicking the same card twice deselects it
  if (_abA && _abA.id === entry.id) { _abA = null; renderHistory(); return; }
  if (_abB && _abB.id === entry.id) { _abB = null; renderHistory(); return; }

  if (!_abA) {
    _abA = entry;
    renderHistory();
    toast('A selected — now click a second image for B', 'info', 2500);
  } else if (!_abB) {
    _abB = entry;
    renderHistory();
    openCompareModal(_abA, _abB);
  }
}

function openCompareModal(a, b) {
  const fmt = (e) => [
    e.model, e.output_format,
    e.width && `${e.width}×${e.height}`,
    e.seed  && `seed:${e.seed}`,
    e.cost  && `${e.cost}cr`,
    e.timestamp && new Date(e.timestamp).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
  ].filter(Boolean).join(' · ');

  document.getElementById('compare-img-a').src = a.image_url;
  document.getElementById('compare-img-b').src = b.image_url;
  document.getElementById('compare-meta-a').innerHTML =
    `<strong>${escHtml(a.prompt) || '(no prompt)'}</strong><br>${escHtml(fmt(a))}`;
  document.getElementById('compare-meta-b').innerHTML =
    `<strong>${escHtml(b.prompt) || '(no prompt)'}</strong><br>${escHtml(fmt(b))}`;
  document.getElementById('compare-modal').classList.remove('hidden');
}

document.getElementById('compare-close').addEventListener('click', () => {
  document.getElementById('compare-modal').classList.add('hidden');
});
document.getElementById('compare-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('compare-modal'))
    document.getElementById('compare-modal').classList.add('hidden');
});
document.getElementById('compare-swap').addEventListener('click', () => {
  const tmp = _abA; _abA = _abB; _abB = tmp;
  renderHistory();
  openCompareModal(_abA, _abB);
});


// ─── Settings Modal ───────────────────────────────────────────────────────────
// Cache paths when settings open so reveal buttons can use them
let _settingsPaths = {};

async function openSettings() {
  const modal      = document.getElementById('settings-modal');
  const portInput  = document.getElementById('settings-port');
  const portCurrent = document.getElementById('settings-port-current');
  const status     = document.getElementById('settings-status');
  const keyInput   = document.getElementById('settings-apikey');

  // Populate API key field
  keyInput.value = localStorage.getItem('flux_api_key') || '';
  keyInput.type  = 'password';
  document.getElementById('settings-apikey-reveal').textContent = '👁';

  const topazKeyInput = document.getElementById('settings-topazkey');
  if (topazKeyInput) {
    topazKeyInput.value = localStorage.getItem('topaz_api_key') || '';
    topazKeyInput.type  = 'password';
    document.getElementById('settings-topazkey-reveal').textContent = '👁';
  }

  // Load current port config
  try {
    const cfg = await apiGet('/api/config');
    portInput.value       = cfg.port || 4242;
    portCurrent.textContent = `Current: ${cfg.port || 4242}`;
  } catch {
    portInput.value = 4242;
    portCurrent.textContent = '';
  }

  // Load storage paths
  try {
    _settingsPaths = await apiGet('/api/paths');
    document.getElementById('sp-outputs').textContent = _settingsPaths.outputs || '…';
    document.getElementById('sp-uploads').textContent = _settingsPaths.uploads || '…';
    document.getElementById('sp-data').textContent    = _settingsPaths.data    || '…';
  } catch {
    document.getElementById('sp-outputs').textContent = '—';
    document.getElementById('sp-uploads').textContent = '—';
    document.getElementById('sp-data').textContent    = '—';
  }

  status.textContent = '';
  modal.classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

async function saveSettings() {
  const portInput = document.getElementById('settings-port');
  const status    = document.getElementById('settings-status');
  const port = parseInt(portInput.value, 10);

  if (!port || port < 1024 || port > 65535) {
    status.textContent = '⚠ Port must be between 1024 and 65535';
    status.style.color = '#f87171';
    return;
  }

  try {
    status.textContent = 'Saving…';
    status.style.color = 'var(--text-muted)';
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    status.textContent = 'Restarting…';
    if (window.fluxApp?.restart) {
      setTimeout(() => window.fluxApp.restart(), 400);
    } else {
      status.textContent = 'Saved. Restart the app to apply the new port.';
    }
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    status.style.color = '#f87171';
  }
}

// API key save
document.getElementById('settings-apikey-save').addEventListener('click', () => {
  const keyInput = document.getElementById('settings-apikey');
  const key = keyInput.value.trim();
  API_KEY = key;
  if (key) localStorage.setItem('flux_api_key', key);
  else localStorage.removeItem('flux_api_key');
  loadCredits();
  toast('✓ BFL API key updated', 'success');
  updateTabAvailability();
});

// API key reveal toggle
document.getElementById('settings-apikey-reveal').addEventListener('click', () => {
  const inp = document.getElementById('settings-apikey');
  const btn = document.getElementById('settings-apikey-reveal');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
});

// Topaz key save
document.getElementById('settings-topazkey-save')?.addEventListener('click', () => {
  const keyInput = document.getElementById('settings-topazkey');
  const key = keyInput.value.trim();
  TOPAZ_KEY = key;
  if (key) localStorage.setItem('topaz_api_key', key);
  else localStorage.removeItem('topaz_api_key');
  toast('✓ Topaz API key updated', 'success');
  updateTabAvailability();
});

// Topaz key reveal toggle
document.getElementById('settings-topazkey-reveal')?.addEventListener('click', () => {
  const inp = document.getElementById('settings-topazkey');
  const btn = document.getElementById('settings-topazkey-reveal');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
});

// Reveal in Finder buttons
document.querySelectorAll('[data-reveal]').forEach(btn => {
  btn.addEventListener('click', () => {
    const which = btn.dataset.reveal;
    const folder = _settingsPaths[which === 'outputs' ? 'outputs'
                                 : which === 'uploads' ? 'uploads'
                                 : 'data'];
    if (!folder) { toast('Path not available', 'warn'); return; }
    if (window.fluxApp?.revealInFinder) window.fluxApp.revealInFinder(folder);
    else toast('Reveal in Finder is only available in the desktop app', 'info');
  });
});

// Change data folder
document.getElementById('settings-change-folder').addEventListener('click', async () => {
  if (!window.fluxApp?.pickFolder) {
    toast('Folder picker is only available in the desktop app', 'info'); return;
  }
  const chosen = await window.fluxApp.pickFolder();
  if (!chosen) return;
  const status = document.getElementById('settings-status');
  status.textContent = `Saving… will restart`;
  status.style.color = 'var(--text-muted)';
  await window.fluxApp.saveDataDir(chosen);
});

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-close-2').addEventListener('click', closeSettings);
document.getElementById('settings-save').addEventListener('click', saveSettings);
document.getElementById('settings-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('settings-modal')) closeSettings();
});


// ─── Bug Report ───────────────────────────────────────────────────────────────
document.getElementById('btn-bug-report').addEventListener('click', async () => {
  let version = '2.0.0';
  try { const v = await apiGet('/api/version'); version = v.version || version; } catch {}
  const platform = navigator.platform || navigator.userAgentData?.platform || 'unknown';
  const body = encodeURIComponent(
`**App version:** ${version}
**Platform:** ${platform}

**What happened?**
<!-- Describe the bug clearly. What did you do, and what went wrong? -->

**Expected behavior**
<!-- What did you expect to happen? -->

**Steps to reproduce**
1. 
2. 
3. 

**Screenshots / additional context**
<!-- Attach screenshots or any other context here -->
`);
  const url = `https://github.com/Chewboctopus/flux-API-Suite/issues/new?labels=bug&title=Bug%3A+&body=${body}`;
  window.open(url, '_blank');
});


// ─── First-launch Welcome ─────────────────────────────────────────────────────
const WELCOME_KEY = 'fluxStudio_welcomed_v1';

async function maybeShowWelcome() {
  if (localStorage.getItem(WELCOME_KEY)) return; // already seen

  // Fetch real paths from server
  try {
    const paths = await apiGet('/api/paths');
    document.getElementById('wlc-outputs').textContent = paths.outputs || '…';
    document.getElementById('wlc-uploads').textContent = paths.uploads || '…';
    document.getElementById('wlc-data').textContent    = paths.data    || '…';
  } catch {
    document.getElementById('wlc-outputs').textContent = '~/Documents/FLUX Studio/data/outputs';
    document.getElementById('wlc-uploads').textContent = '~/Documents/FLUX Studio/data/uploads';
    document.getElementById('wlc-data').textContent    = '~/Documents/FLUX Studio/data';
  }

  document.getElementById('welcome-modal').classList.remove('hidden');
}

document.getElementById('welcome-ok').addEventListener('click', () => {
  localStorage.setItem(WELCOME_KEY, '1');
  document.getElementById('welcome-modal').classList.add('hidden');
});

// Also fire if already on the app screen on page load (existing key saved)
if (document.getElementById('screen-app')?.classList.contains('active')) {
  setTimeout(maybeShowWelcome, 900);
}
