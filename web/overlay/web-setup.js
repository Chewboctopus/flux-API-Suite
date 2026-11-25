/* ═══════════════════════════════════════════════════════════════════════════
   FLUX Studio — web-setup.js
   Only does anything in the local web version (start-web launchers). In the
   desktop app / plain `npm start` the status probe says web:false and every
   function here is a no-op.

   • Restores saved API keys from the local server (so they survive port or
     browser changes) and saves them back whenever they change.
   • On first launch, asks where to save generated images and videos.
   ═══════════════════════════════════════════════════════════════════════════ */

const HEADERS = { 'Content-Type': 'application/json', 'x-flux-web': '1' };
let webMode = false;

async function call(path, body) {
  const res = await fetch(path, body === undefined
    ? { headers: HEADERS }
    : { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
  return data;
}

const $ = (id) => document.getElementById(id);
function setOrClear(key, val) { if (val) localStorage.setItem(key, val); else localStorage.removeItem(key); }

/** Save the keys currently in localStorage to the local server. Safe to call anywhere. */
export async function persistCredentials() {
  if (!webMode) return false;
  try {
    await call('/api/web/credentials', {
      bfl:   localStorage.getItem('flux_api_key')   || '',
      topaz: localStorage.getItem('topaz_api_key') || '',
    });
    return true;
  } catch (e) {
    console.warn('[FLUX Studio] Could not save API keys on this computer:', e.message);
    return false;
  }
}

function runOutputsStep(status) {
  return new Promise((resolve) => {
    const keyScreen = $('screen-apikey');
    const screen    = $('screen-setup');
    const input     = $('input-outputs-dir');
    const errEl     = $('setup-error');
    const btnGo     = $('btn-setup-continue');
    const btnPick   = $('btn-pick-folder');

    input.value = status.defaultOutputsDir;   // always offer ~/Downloads/FLUX Studio (outputsDir here is only an internal fallback)
    errEl.textContent = status.outputsProblem ? `${status.outputsProblem} Please choose a folder.` : '';

    keyScreen.classList.remove('active');
    screen.classList.add('active');
    input.focus();
    input.select();

    btnPick.onclick = async () => {
      errEl.textContent = '';
      btnPick.disabled = true;
      try {
        const r = await call('/api/web/pick-folder', { start: input.value });
        if (r.path) input.value = r.path;
      } catch (e) { errEl.textContent = e.message; }
      btnPick.disabled = false;
    };

    btnGo.onclick = async () => {
      errEl.textContent = '';
      btnGo.disabled = true;
      try {
        await call('/api/web/outputs', { dir: input.value });
        screen.classList.remove('active');
        keyScreen.classList.add('active');
        resolve();
      } catch (e) {
        errEl.textContent = e.message;
        btnGo.disabled = false;
      }
    };

    input.onkeydown = (e) => { if (e.key === 'Enter') btnGo.click(); };
  });
}

/** Called once, before the rest of the app starts. Resolves when setup is done. */
export async function webBootstrap() {
  let status;
  try { status = await call('/api/web/status'); } catch { return; }
  if (!status.web) return;
  webMode = true;
  document.body.classList.add('is-web');

  // Keys: the copy on this computer is the source of truth.
  try {
    const saved = await call('/api/web/credentials');
    if (saved.bfl || saved.topaz) {
      setOrClear('flux_api_key', saved.bfl);
      setOrClear('topaz_api_key', saved.topaz);
    } else if (localStorage.getItem('flux_api_key') || localStorage.getItem('topaz_api_key')) {
      await persistCredentials();   // keys saved in this browser before this version
    }
  } catch (e) { console.warn('[FLUX Studio] Could not read saved API keys:', e.message); }

  const note = $('apikey-storage-note');
  if (note) note.textContent = 'Your keys are saved on this computer only (in your FLUX Studio data folder) and are sent only to Black Forest Labs and Topaz.';

  // Settings → Storage: these controls were written for the desktop app; relabel for the web version.
  const changeBtn = $('settings-change-folder');
  if (changeBtn) changeBtn.textContent = '📁 Change Images Folder…';
  const help = $('settings-folder-help');
  if (help) help.textContent = 'Choose where new images and videos are saved. You can copy your existing files to the new folder. History and saved keys stay in the data folder shown above.';

  if (status.needsOutputs) await runOutputsStep(status);
}

export const isWebMode = () => webMode;

const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Settings → Storage ↗ buttons: open one of our folders in Finder / Explorer. */
export async function webReveal(which, toast = () => {}) {
  try { await call('/api/web/reveal', { which }); }
  catch (e) { toast(e.message, 'warn'); }
}

/** Settings → Storage "Change Images Folder…": pick, confirm (copy or not), apply. */
export async function webChangeOutputsFolder(toast = () => {}) {
  const notice = $('web-folder-notice'), chosenEl = $('web-folder-chosen'), countEl = $('web-folder-count'), statusEl = $('web-folder-status');
  const btnCopy = $('web-folder-copy'), btnNo = $('web-folder-nocopy'), btnCancel = $('web-folder-cancel');
  const setBusy = (b) => { btnCopy.disabled = btnNo.disabled = btnCancel.disabled = b; };

  let current;
  try { current = await call('/api/web/outputs-stats'); } catch (e) { toast(e.message, 'error'); return; }

  let picked;
  try {
    const r = await call('/api/web/pick-folder', { start: current.dir });
    if (!r.path) return;               // cancelled in the picker
    picked = r.path;
  } catch (e) { toast(e.message, 'warn'); return; }
  if (picked === current.dir) { toast('That is already your images folder.', 'info'); return; }

  chosenEl.textContent = picked;
  statusEl.textContent = '';
  const n = current.files;
  countEl.textContent = n
    ? `You have ${n} file${n === 1 ? '' : 's'} (${fmtBytes(current.bytes)}) in the current folder. Copy them so History keeps showing them? The originals stay where they are.`
    : 'Nothing to copy: your current folder is empty.';
  btnCopy.classList.toggle('hidden', !n);
  btnNo.textContent = n ? "Use it, don't copy" : 'Use this folder';
  setBusy(false);
  notice.classList.remove('hidden');

  const apply = async (copyExisting) => {
    setBusy(true);
    statusEl.textContent = copyExisting ? 'Copying files…' : 'Saving…';
    try {
      const r = await call('/api/web/outputs', { dir: picked, copyExisting });
      const spEl = $('sp-outputs'); if (spEl) spEl.textContent = r.outputsDir;
      statusEl.textContent = `✓ New images will be saved to ${r.outputsDir}` + (copyExisting ? ` (${r.copied} copied${r.skipped ? `, ${r.skipped} already there` : ''}).` : '.');
      toast('Images folder changed ✓', 'success');
      btnCopy.classList.add('hidden'); btnNo.classList.add('hidden');
      btnCancel.textContent = 'Close'; btnCancel.disabled = false;
    } catch (e) {
      statusEl.textContent = e.message;
      setBusy(false);
    }
  };
  btnCopy.onclick = () => apply(true);
  btnNo.onclick = () => apply(false);
  btnCancel.onclick = () => { notice.classList.add('hidden'); btnNo.classList.remove('hidden'); btnCancel.textContent = 'Cancel'; };
}
