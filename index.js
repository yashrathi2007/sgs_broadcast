const express    = require('express');
const multer     = require('multer');
const fetch      = require('node-fetch');
const FormData   = require('form-data');
const cors       = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const WA_PHONE = process.env.WA_PHONE || '1199473816581188';
const WA_TOKEN = process.env.WA_TOKEN || 'EAAOI3ZBZCZA6mQBR6v4xWn82kPwu8ObryiaJ89JawahO7yNVatilvsYZBKyyZBlCvS813RuuhBHP0yDZCKA3ZC9GfpebBKhdjGjgKzaM9tKhDnVKG24ZAInLmXIEvPP9Ao1Cszfz2DF2Lx6P4N2eNls9Aed3i9ZCE4KFzTbCtP7ZCioRN0pAf2zMX3EcEqopQulSGWBwZDZD';
const WA_WABA  = process.env.WA_WABA  || '1495630418445197';

// Health check
app.get('/', (req, res) => res.json({ status: 'SGS Broadcast API running' }));

// Upload media → returns media ID
app.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', req.file.buffer, {
      filename:    req.file.originalname,
      contentType: req.file.mimetype,
    });

    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/media`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, ...form.getHeaders() },
      body:    form,
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Upload failed', details: data });
    res.json({ id: data.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a single WA message (proxy to avoid CORS)
app.post('/send-message', async (req, res) => {
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch approved templates
app.get('/templates', async (req, res) => {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${WA_WABA}/message_templates?fields=name,status,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message, details: data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update token
app.post('/update-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  process.env.WA_TOKEN = token;
  res.json({ status: 'Token updated for this session' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGS API running on port ${PORT}`));
