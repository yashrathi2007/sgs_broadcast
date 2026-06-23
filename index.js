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
let WA_TOKEN = process.env.WA_TOKEN || 'EAAOI3ZBZCZA6mQBRzLSnqGdf8ZC2b8Pp3JLZA8l1StNAdbwPiR0ZBnuEWyidEeZAFPcXsOO2S6w99vltVbjR0qZAkRq0Xgmsh27kupVRMZAyGXdXSjhwIsOzQ8HDAgSoiyPwb0bojsCUgNkMyegmg1I8Ve4ZC6nqa1nmozaFYJzBIH7sx5fREZAy4eg3SbzRZBxXLSTUVwZDZD';

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

// Proxy Supabase requests to avoid CORS issues when running from file://
app.get('/contacts', async (req, res) => {
  const SB_URL = 'https://oapgtrotlfgrjefanyss.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGd0cm90bGZncmplZmFueXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzk5NzIsImV4cCI6MjA5NjkxNTk3Mn0.thvxozgAtmhHjUGIufdqf1naYB8mOR-0sY09eGTyOTk';
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', Prefer: 'count=none' };

  try {
    // Fetch all master rows paginated
    let master = [], from = 0;
    while (true) {
      const r = await fetch(`${SB_URL}/rest/v1/retailer_master?select=retailer,wholesaler,mobile,w_mobile,conference&order=wholesaler.asc,retailer.asc`, {
        headers: { ...headers, Range: `${from}-${from+999}` }
      });
      const b = await r.json();
      master = master.concat(b);
      if (b.length < 1000) break;
      from += 1000;
    }

    // Fetch form submissions
    let forms = [], from2 = 0;
    while (true) {
      const r = await fetch(`${SB_URL}/rest/v1/retailer_forms?select=firm_name,wholesaler_firm,mobile&order=wholesaler_firm.asc`, {
        headers: { ...headers, Range: `${from2}-${from2+999}` }
      });
      const b = await r.json();
      forms = forms.concat(b);
      if (b.length < 1000) break;
      from2 += 1000;
    }

    console.log(`Contacts: ${master.length} master, ${forms.length} forms`);
    res.json({ master, forms });
  } catch(e) {
    console.error('Contacts error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
