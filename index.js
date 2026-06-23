const express = require('express');
const multer  = require('multer');
const fetch   = require('node-fetch');
const FormData = require('form-data');
const cors    = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const WA_PHONE = process.env.WA_PHONE || '1199473816581188';
const WA_WABA  = process.env.WA_WABA  || '1495630418445197';
let   WA_TOKEN = process.env.WA_TOKEN || 'EAAOI3ZBZCZA6mQBR6v4xWn82kPwu8ObryiaJ89JawahO7yNVatilvsYZBKyyZBlCvS813RuuhBHP0yDZCKA3ZC9GfpebBKhdjGjgKzaM9tKhDnVKG24ZAInLmXIEvPP9Ao1Cszfz2DF2Lx6P4N2eNls9Aed3i9ZCE4KFzTbCtP7ZCioRN0pAf2zMX3EcEqopQulSGWBwZDZD';

app.get('/', (req, res) => res.json({ status: 'SGS Broadcast API running', phone: WA_PHONE }));

app.post('/upload-media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file received' });

    console.log(`Upload: ${req.file.originalname} | ${req.file.mimetype} | ${(req.file.size/1024/1024).toFixed(2)}MB`);

    // Determine correct MIME type
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const mimeMap = { mp4:'video/mp4', mov:'video/quicktime', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', pdf:'application/pdf', mp3:'audio/mpeg' };
    const mime = mimeMap[ext] || req.file.mimetype || 'video/mp4';
    console.log(`Using MIME: ${mime}`);

    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: mime });

    console.log('Sending to WhatsApp...');
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/media`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, ...form.getHeaders() },
      body:    form,
    });

    const data = await r.json();
    console.log('WhatsApp response:', JSON.stringify(data));

    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Upload failed', code: data.error?.code, details: data });
    res.json({ id: data.id });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/send-message', async (req, res) => {
  try {
    console.log('Send:', JSON.stringify(req.body));
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
    });
    const data = await r.json();
    console.log('Send response:', JSON.stringify(data));
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/templates', async (req, res) => {
  try {
    const r = await fetch(
      `https://graph.facebook.com/v20.0/${WA_WABA}/message_templates?fields=name,status,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
    );
    const data = await r.json();
    res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/update-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  WA_TOKEN = token;
  console.log('Token updated');
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SGS API running on port ${PORT}`));
