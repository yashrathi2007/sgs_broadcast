const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(cors());
app.use(express.json());

let WA_PHONE = process.env.WA_PHONE || '1199473816581188';
let WA_WABA  = process.env.WA_WABA  || '1495630418445197';
let WA_TOKEN = process.env.WA_TOKEN || 'EAAOI3ZBZCZA6mQBR6v4xWn82kPwu8ObryiaJ89JawahO7yNVatilvsYZBKyyZBlCvS813RuuhBHP0yDZCKA3ZC9GfpebBKhdjGjgKzaM9tKhDnVKG24ZAInLmXIEvPP9Ao1Cszfz2DF2Lx6P4N2eNls9Aed3i9ZCE4KFzTbCtP7ZCioRN0pAf2zMX3EcEqopQulSGWBwZDZD';

app.get('/', (req, res) => res.json({ status: 'ok', phone: WA_PHONE }));

// Test token permissions
app.get('/test-token', async (req, res) => {
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }
    });
    const data = await r.json();
    console.log('Token test:', JSON.stringify(data));
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/upload-media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  const ext  = (req.file.originalname.split('.').pop() || '').toLowerCase();
  const mime = { mp4:'video/mp4', mov:'video/quicktime', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', pdf:'application/pdf' }[ext] || req.file.mimetype;
  
  console.log(`File: ${req.file.originalname} | MIME: ${mime} | Size: ${(req.file.size/1024/1024).toFixed(2)}MB`);
  
  // Try with token from request header first (allows token override)
  const token = req.headers['x-wa-token'] || WA_TOKEN;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: mime });

  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() },
    body: form
  });

  const data = await r.json();
  console.log('WA response:', JSON.stringify(data));

  if (!r.ok) return res.status(r.status).json({ error: data.error?.message, code: data.error?.code, error_subcode: data.error?.error_subcode, fbtrace: data.error?.fbtrace_id });
  res.json({ id: data.id });
});

app.post('/send-message', async (req, res) => {
  const token = req.headers['x-wa-token'] || WA_TOKEN;
  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const data = await r.json();
  console.log('Send response:', JSON.stringify(data));
  res.status(r.ok ? 200 : r.status).json(data);
});

app.get('/templates', async (req, res) => {
  const r = await fetch(
    `https://graph.facebook.com/v20.0/${WA_WABA}/message_templates?fields=name,status,language,components&limit=100`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
  );
  const data = await r.json();
  res.status(r.ok ? 200 : r.status).json(data);
});

app.post('/update-token', (req, res) => {
  if (req.body.token) WA_TOKEN = req.body.token;
  if (req.body.phone) WA_PHONE = req.body.phone;
  res.json({ status: 'updated' });
});

app.listen(process.env.PORT || 3000, () => console.log('SGS API running on port ' + (process.env.PORT || 3000)));
