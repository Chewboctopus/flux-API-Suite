import express from 'express';
import multer from 'multer';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const BFL_BASE = 'https://api.bfl.ai/v1';
// DATA_DIR: in Electron builds, set via process.env.DATA_DIR to a writable
// location (~/Documents/FLUX Studio/data). Falls back to ./data for npm start.
const DATA_DIR  = process.env.DATA_DIR || join(__dirname, 'data');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const OUTPUTS_DIR = join(DATA_DIR, 'outputs');
const HISTORY_FILE = join(DATA_DIR, 'history.json');
const CSV_FILE     = join(DATA_DIR, 'generations.csv');

mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(OUTPUTS_DIR, { recursive: true });
if (!existsSync(HISTORY_FILE)) writeFileSync(HISTORY_FILE, '[]');
if (!existsSync(CSV_FILE))     writeFileSync(CSV_FILE, 'id,timestamp,tool,model,prompt,width,height,seed,output_format,cost_credits,image_url\n');
const CONFIG_FILE  = join(DATA_DIR, 'config.json');
if (!existsSync(CONFIG_FILE)) writeFileSync(CONFIG_FILE, JSON.stringify({ port: 4242 }, null, 2));


// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname) || '.jpg'}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use('/outputs', express.static(OUTPUTS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getKey = (req) => req.headers['x-key'];

function stripDataUri(s) {
  if (s && s.includes(',')) return s.split(',')[1];
  return s;
}

function fileToB64(filePath) {
  return readFileSync(filePath).toString('base64');
}



async function getB64(pathOrUrl, b64) {
  if (pathOrUrl) {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      // External URL — fetch and convert to base64
      const r = await fetch(pathOrUrl);
      if (!r.ok) return null;
      return Buffer.from(await r.arrayBuffer()).toString('base64');
    }
    // Local path — resolve to absolute file path
    let absPath;
    if (pathOrUrl.startsWith('/uploads/') || pathOrUrl.includes('/uploads/')) {
      absPath = join(UPLOADS_DIR, pathOrUrl.replace(/^.*\/uploads\//, ''));
    } else if (pathOrUrl.startsWith('/outputs/') || pathOrUrl.includes('/outputs/')) {
      absPath = join(OUTPUTS_DIR, pathOrUrl.replace(/^.*\/outputs\//, ''));
    } else {
      // Unknown path format — try uploads first, then outputs
      absPath = join(UPLOADS_DIR, pathOrUrl.replace(/^\//, ''));
    }
    return fileToB64(absPath);
  }
  if (b64) return stripDataUri(b64);
  return null;
}

async function bflSubmit(endpoint, payload, apiKey) {
  const url = `${BFL_BASE}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-key': apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.detail?.[0]?.msg || err.detail || err.message || `BFL ${res.status}`;
    const e = new Error(msg); e.status = res.status; e.details = err; throw e;
  }
  return res.json();
}

async function bflPoll(pollingUrl, apiKey, maxTries = 180) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(pollingUrl, { headers: { Accept: 'application/json', 'x-key': apiKey } });
    // Permanent auth/permission errors — stop immediately
    if (res.status === 401 || res.status === 403) {
      const err = new Error(`Auth error from BFL (${res.status})`); err.status = res.status; throw err;
    }
    if (!res.ok) continue; // transient 5xx / 429 — keep polling
    const data = await res.json();
    if (data.status === 'Ready') return data;
    if (data.status === 'Error' || data.status === 'Failed') {
      const e = new Error('Generation failed'); e.status = 500; e.details = data; throw e;
    }
  }
  const e = new Error('Timed out after 3 minutes'); e.status = 504; throw e;
}

async function runJob(endpoint, payload, apiKey) {
  const submit = await bflSubmit(endpoint, payload, apiKey);
  const result = await bflPoll(submit.polling_url, apiKey);
  return { taskId: submit.id, cost: submit.cost, result };
}

async function saveOutput(imageUrl, genId, fmt) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const ext = fmt === 'jpeg' ? 'jpg' : (fmt || 'jpg');
    const filename = `${genId}.${ext}`;
    writeFileSync(join(OUTPUTS_DIR, filename), Buffer.from(await res.arrayBuffer()));
    return filename;
  } catch (e) {
    console.error('Save output failed:', e.message);
    return null;
  }
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function appendCsv(entry) {
  try {
    const row = [
      entry.id, entry.timestamp, entry.tool, entry.model,
      entry.prompt || '', entry.width || '', entry.height || '',
      entry.seed || '', entry.output_format || '',
      entry.cost ?? '', entry.image_url || '',
    ].map(csvEscape).join(',') + '\n';
    appendFileSync(CSV_FILE, row);
  } catch (e) { console.error('CSV write failed:', e.message); }
}

// ─── In-memory history cache (avoid blocking re-read on every generation) ──────
let _historyCache = null;

function loadHistoryCache() {
  if (_historyCache) return _historyCache;
  try { _historyCache = JSON.parse(readFileSync(HISTORY_FILE, 'utf8')); }
  catch { _historyCache = []; }
  return _historyCache;
}

function appendHistory(entry) {
  try {
    const h = loadHistoryCache();
    h.unshift(entry);
    if (h.length > 10000) h.splice(10000);
    // Write asynchronously to avoid blocking the event loop
    import('fs').then(({ promises: fsp }) =>
      fsp.writeFile(HISTORY_FILE, JSON.stringify(h, null, 2)).catch(e =>
        console.error('History write failed:', e.message)
      )
    );
    appendCsv(entry);
  } catch (e) { console.error('History append failed:', e.message); }
}


function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
}

function finalImageUrl(localFile, fallbackUrl) {
  return localFile ? `/outputs/${localFile}` : fallbackUrl;
}

function handleError(res, err) {
  console.error(err.message, err.details || '');
  res.status(err.status || 500).json({ error: err.message, details: err.details });
}

// ─── File Upload ──────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// ─── Credits ──────────────────────────────────────────────────────────────────
app.get('/api/credits', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });
  try {
    const r = await fetch(`${BFL_BASE}/user`, { headers: { 'x-key': apiKey, Accept: 'application/json' } });
    const data = await r.json();
    res.json(data);
  } catch (e) { handleError(res, e); }
});

// ─── Generate (FLUX.2 + legacy models) ───────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const {
    model = 'flux-2-pro', prompt,
    ref_urls = [],        // Array of /uploads/xxx paths
    ref_b64s  = [],       // Array of base64 data-URIs (fallback)
    width, height, seed, output_format = 'png',
    safety_tolerance = 2, prompt_upsampling,
    webhook_url, webhook_secret,
  } = req.body;

  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const payload = { prompt, safety_tolerance: Number(safety_tolerance), output_format };
  if (width)  payload.width  = Number(width);
  if (height) payload.height = Number(height);
  if (seed != null && seed !== '') payload.seed = Number(seed);
  if (prompt_upsampling != null) payload.prompt_upsampling = Boolean(prompt_upsampling);
  if (webhook_url) { payload.webhook_url = webhook_url; if (webhook_secret) payload.webhook_secret = webhook_secret; }

  // Attach reference images — getB64 is async so resolve all in parallel
  const refs = (await Promise.all([
    ...ref_urls.map(u => getB64(u, null).catch(() => null)),
    ...ref_b64s.map(b => getB64(null, b).catch(() => null)),
  ])).filter(Boolean);
  if (ref_urls.length > 0 && refs.length === 0) {
    console.warn('[generate] All reference images failed to load');
  }
  refs.forEach((b64, i) => {
    payload[i === 0 ? 'input_image' : `input_image_${i + 1}`] = b64;
  });

  try {
    const { taskId, cost, result } = await runJob(model, payload, apiKey);
    const genId = makeId('gen');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'generate', model, prompt,
      width: payload.width, height: payload.height,
      seed: result.result?.seed ?? (seed || null), cost: cost ?? null,
      output_format, local_file: localFile,
      image_url: finalImageUrl(localFile, imageUrl),
      ref_urls: ref_urls.filter(Boolean),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── Inpaint (FLUX.1 Fill [pro]) ─────────────────────────────────────────────
app.post('/api/inpaint', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const {
    image_url: imgUrl, image_b64,
    mask_b64,
    prompt = '', steps = 50, guidance = 60,
    prompt_upsampling = false, seed,
    output_format = 'png', safety_tolerance = 2,
  } = req.body;

  let imageB64;
  try { imageB64 = await getB64(imgUrl, image_b64); } catch (e) { return res.status(400).json({ error: 'Could not load source image: ' + e.message }); }
  if (!imageB64) return res.status(400).json({ error: 'No image provided' });
  if (!mask_b64)  return res.status(400).json({ error: 'No mask provided' });

  const payload = {
    image: imageB64,
    mask: stripDataUri(mask_b64),
    prompt,
    steps: Math.max(15, Math.min(50, Number(steps))),
    guidance: Math.max(1.5, Math.min(100, Number(guidance))),
    prompt_upsampling: Boolean(prompt_upsampling),
    safety_tolerance: Number(safety_tolerance),
    output_format,
  };
  if (seed != null && seed !== '') payload.seed = Number(seed);

  try {
    const { cost, result } = await runJob('flux-pro-1.0-fill', payload, apiKey);
    const genId = makeId('inpaint');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'inpaint', model: 'flux-pro-1.0-fill', prompt,
      seed: result.result?.seed ?? (seed || null), cost, output_format,
      input_url: imgUrl || null,
      local_file: localFile, image_url: finalImageUrl(localFile, imageUrl),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── Erase ────────────────────────────────────────────────────────────────────
app.post('/api/erase', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const {
    image_url: imgUrl, image_b64, mask_b64,
    dilate_pixels = 10, seed,
    output_format = 'png', safety_tolerance = 2,
  } = req.body;

  let imageB64;
  try { imageB64 = await getB64(imgUrl, image_b64); } catch (e) { return res.status(400).json({ error: 'Could not load source image: ' + e.message }); }
  if (!imageB64) return res.status(400).json({ error: 'No image provided' });
  if (!mask_b64)  return res.status(400).json({ error: 'No mask provided' });

  const payload = {
    image: imageB64,
    mask: stripDataUri(mask_b64),
    dilate_pixels: Math.max(0, Math.min(25, Number(dilate_pixels))),
    safety_tolerance: Number(safety_tolerance),
    output_format,
  };
  if (seed != null && seed !== '') payload.seed = Number(seed);

  try {
    const { cost, result } = await runJob('flux-tools/erase-v1', payload, apiKey);
    const genId = makeId('erase');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'erase', model: 'flux-tools/erase-v1',
      seed: result.result?.seed ?? (seed || null), cost, output_format,
      input_url: imgUrl || null,
      local_file: localFile, image_url: finalImageUrl(localFile, imageUrl),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── Outpaint ─────────────────────────────────────────────────────────────────
app.post('/api/outpaint', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const {
    image_url: imgUrl, image_b64,
    width, height,
    prompt, mode = 'high',
    reference_offset_x, reference_offset_y,
    auto_crop = false,
    output_format = 'png', safety_tolerance = 2,
  } = req.body;

  let imageB64;
  try { imageB64 = await getB64(imgUrl, image_b64); } catch (e) { return res.status(400).json({ error: 'Could not load source image: ' + e.message }); }
  if (!imageB64) return res.status(400).json({ error: 'No image provided' });
  if (!width || !height) return res.status(400).json({ error: 'Width and height are required' });

  const payload = {
    input_image: imageB64,
    width: Number(width), height: Number(height),
    mode, auto_crop: Boolean(auto_crop),
    safety_tolerance: Number(safety_tolerance),
    output_format,
  };
  if (prompt) payload.prompt = prompt;
  if (reference_offset_x != null) payload.reference_offset_x = Number(reference_offset_x);
  if (reference_offset_y != null) payload.reference_offset_y = Number(reference_offset_y);

  try {
    const { cost, result } = await runJob('flux-tools/outpainting-v1', payload, apiKey);
    const genId = makeId('outpaint');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'outpaint', model: 'flux-tools/outpainting-v1',
      width: Number(width), height: Number(height),
      // Store source offset so client can align the before/after composite
      reference_offset_x: reference_offset_x != null ? Number(reference_offset_x) : null,
      reference_offset_y: reference_offset_y != null ? Number(reference_offset_y) : null,
      cost, output_format,
      input_url: imgUrl || null,
      local_file: localFile,
      image_url: finalImageUrl(localFile, imageUrl),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);

  } catch (e) { handleError(res, e); }
});

// ─── VTO ──────────────────────────────────────────────────────────────────────
app.post('/api/vto', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const {
    person_url, person_b64,
    garment_url, garment_b64,
    prompt, seed,
    output_format = 'png', safety_tolerance = 2,
  } = req.body;

  let personB64, garmentB64;
  try { personB64  = await getB64(person_url,  person_b64);  } catch (e) { return res.status(400).json({ error: 'Could not load person image: '  + e.message }); }
  try { garmentB64 = await getB64(garment_url, garment_b64); } catch (e) { return res.status(400).json({ error: 'Could not load garment image: ' + e.message }); }
  if (!personB64)  return res.status(400).json({ error: 'No person image provided' });
  if (!garmentB64) return res.status(400).json({ error: 'No garment image provided' });

  const payload = {
    prompt: prompt || 'TRY-ON: The person of image 1 wearing the garments of image 2.',
    person: personB64, garment: garmentB64,
    safety_tolerance: Number(safety_tolerance), output_format,
  };
  if (seed != null && seed !== '') payload.seed = Number(seed);

  try {
    const { cost, result } = await runJob('flux-tools/vto-v1', payload, apiKey);
    const genId = makeId('vto');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'vto', model: 'flux-tools/vto-v1', prompt,
      seed: result.result?.seed ?? (seed || null), cost, output_format,
      input_url: person_url || null,
      garment_url: garment_url || null,
      local_file: localFile, image_url: finalImageUrl(localFile, imageUrl),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── Deblur ───────────────────────────────────────────────────────────────────
app.post('/api/deblur', async (req, res) => {
  const apiKey = getKey(req);
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const { image_url: imgUrl, image_b64, prompt, output_format = 'png', safety_tolerance = 2 } = req.body;

  let imageB64;
  try { imageB64 = await getB64(imgUrl, image_b64); } catch (e) { return res.status(400).json({ error: 'Could not load source image: ' + e.message }); }
  if (!imageB64) return res.status(400).json({ error: 'No image provided' });


  const payload = { image: imageB64, output_format, safety_tolerance: Number(safety_tolerance) };
  if (prompt) payload.prompt = prompt;


  try {
    const { cost, result } = await runJob('flux-tools/deblur-v1', payload, apiKey);
    const genId = makeId('deblur');
    const imageUrl = result.result?.sample;
    const localFile = await saveOutput(imageUrl, genId, output_format);
    const entry = {
      id: genId, tool: 'deblur', model: 'flux-tools/deblur-v1',
      cost, output_format,
      input_url: imgUrl || null,
      local_file: localFile,
      image_url: finalImageUrl(localFile, imageUrl),
      timestamp: new Date().toISOString(),
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── Topaz — Upscale / Enhance ───────────────────────────────────────────────
const TOPAZ_BASE = 'https://api.topazlabs.com/image/v1';
const getTopazKey = (req) => req.headers['x-topaz-key'];

// Submit async enhance job
app.post('/api/topaz/enhance', upload.single('image'), async (req, res) => {
  const topazKey = getTopazKey(req);
  if (!topazKey) return res.status(401).json({ error: 'Missing Topaz API key' });

  try {
    let fileBuffer;
    let filename = 'image.jpg';

    if (req.file) {
      fileBuffer = readFileSync(req.file.path);
      filename = req.file.originalname || 'image.jpg';
    } else if (req.body.image_url) {
      const imgUrl = req.body.image_url;
      const b64 = await getB64(imgUrl);
      if (!b64) return res.status(400).json({ error: 'Could not load image from URL' });
      fileBuffer = Buffer.from(b64, 'base64');
      filename = imgUrl.split('/').pop() || 'image.jpg';
    } else {
      return res.status(400).json({ error: 'No image provided (send file as "image" or JSON with "image_url")' });
    }

    // Build multipart form for Topaz
    const { Blob } = await import('buffer');
    const formData = new FormData();
    formData.append('image', new Blob([fileBuffer]), filename);
    
    // Support body params from either JSON req.body or form req.body
    const model = req.body.model || 'Standard V2';
    const output_format = req.body.output_format || 'png';
    const output_width = req.body.output_width;
    const output_height = req.body.output_height;
    const face_enhancement = String(req.body.face_enhancement) === 'true';
    const face_enhancement_creativity = req.body.face_enhancement_creativity;

    formData.append('model', model);
    formData.append('output_format', output_format);
    if (output_width)  formData.append('output_width', output_width);
    if (output_height) formData.append('output_height', output_height);
    if (face_enhancement) {
      formData.append('face_enhancement', 'true');
      if (face_enhancement_creativity) {
        formData.append('face_enhancement_creativity', face_enhancement_creativity);
      }
    }

    const r = await fetch(`${TOPAZ_BASE}/enhance/async`, {
      method: 'POST',
      headers: { 'X-API-KEY': topazKey },
      body: formData,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || err.detail || `Topaz error ${r.status}`, details: err });
    }
    const data = await r.json();
    res.json(data); // { process_id, eta }
  } catch (e) { handleError(res, e); }
});

// Poll job status
app.get('/api/topaz/status/:id', async (req, res) => {
  const topazKey = getTopazKey(req);
  if (!topazKey) return res.status(401).json({ error: 'Missing Topaz API key' });
  try {
    const r = await fetch(`${TOPAZ_BASE}/status/${req.params.id}`, {
      headers: { 'X-API-KEY': topazKey },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || `Topaz status error ${r.status}`, details: err });
    }
    res.json(await r.json());
  } catch (e) { handleError(res, e); }
});

// Download result + save locally
app.get('/api/topaz/download/:id', async (req, res) => {
  const topazKey = getTopazKey(req);
  if (!topazKey) return res.status(401).json({ error: 'Missing Topaz API key' });
  try {
    const r = await fetch(`${TOPAZ_BASE}/download/${req.params.id}`, {
      headers: { 'X-API-KEY': topazKey },
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.message || `Topaz download error ${r.status}`, details: err });
    }
    const data = await r.json();
    const genId = makeId('upscale');
    const localFile = await saveOutput(data.url, genId, req.query.fmt || 'png');
    
    const entry = {
      id: genId,
      tool: 'upscale',
      model: req.query.model || 'Standard V2',
      cost: 0,
      output_format: req.query.fmt || 'png',
      input_url: req.query.input_url || null,
      local_file: localFile,
      image_url: finalImageUrl(localFile, data.url),
      timestamp: new Date().toISOString()
    };
    appendHistory(entry);
    res.json(entry);
  } catch (e) { handleError(res, e); }
});

// ─── App Config ───────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  try { res.json(JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))); }
  catch { res.json({ port: 4242 }); }
});

app.post('/api/config', (req, res) => {
  try {
    let current = {};
    try { current = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); } catch {}
    const updated = { ...current, ...req.body };
    writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
    res.json({ ok: true });
  } catch (e) { handleError(res, e); }
});

// ─── Ping — identity probe so a new instance can detect us ────────────────────
app.get('/api/ping', (_req, res) => {
  res.json({ app: 'flux-studio', version: '2.0.0' });
});

// ─── Version — current app version for update checks and bug reports ────────────
app.get('/api/version', (_req, res) => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
    res.json({ version: pkg.version || '2.0.0' });
  } catch { res.json({ version: '2.0.0' }); }
});

// ─── Paths — real filesystem locations for first-launch info ─────────────────
app.get('/api/paths', (_req, res) => {
  res.json({ outputs: OUTPUTS_DIR, uploads: UPLOADS_DIR, data: DATA_DIR });
});

// ─── Quit — new-instance takeover (localhost only) ────────────────────────────
app.post('/api/quit', (req, res) => {
  const addr = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 300);
});

// ─── History ──────────────────────────────────────────────────────────────────
app.get('/api/history', (_req, res) => {
  res.json(loadHistoryCache());
});

app.delete('/api/history', (_req, res) => {
  _historyCache = [];
  writeFileSync(HISTORY_FILE, '[]');
  writeFileSync(CSV_FILE, 'id,timestamp,tool,model,prompt,width,height,seed,output_format,cost_credits,image_url\n');
  res.json({ ok: true });
});

// ─── CSV Download ──────────────────────────────────────────────────────────────
app.get('/api/log', (_req, res) => {
  if (!existsSync(CSV_FILE)) return res.status(404).send('No log yet');
  res.setHeader('Content-Disposition', 'attachment; filename="flux_prompt_log.csv"');
  res.setHeader('Content-Type', 'text/csv');
  res.send(readFileSync(CSV_FILE));
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
// Bind explicitly to loopback — several routes below (upload, history, config,
// paths) have no auth check beyond the BFL x-key, so this must not be reachable
// from the LAN.
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🎨 FLUX Studio  →  http://localhost:${PORT}\n`);
});
