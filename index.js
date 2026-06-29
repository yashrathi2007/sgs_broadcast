const path = require('path');
const express  = require('express');
const multer   = require('multer');
const fetch    = require('node-fetch');
const FormData = require('form-data');
const cors     = require('cors');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let WA_PHONE = process.env.WA_PHONE || '1199473816581188';
let WA_WABA  = process.env.WA_WABA  || '1495630418445197';
let WA_TOKEN = process.env.WA_TOKEN || 'EAAOI3ZBZCZA6mQBRzLSnqGdf8ZC2b8Pp3JLZA8l1StNAdbwPiR0ZBnuEWyidEeZAFPcXsOO2S6w99vltVbjR0qZAkRq0Xgmsh27kupVRMZAyGXdXSjhwIsOzQ8HDAgSoiyPwb0bojsCUgNkMyegmg1I8Ve4ZC6nqa1nmozaFYJzBIH7sx5fREZAy4eg3SbzRZBxXLSTUVwZDZD';
const VERIFY_TOKEN = 'sgs_webhook_2026';

// Store: which numbers should get auto video reply and which media ID
// { phone: { mediaId, templateName, sent: false } }
const pendingVideoReplies = {};


// ── Serve static pages ───────────────────────────────────────────────────────
app.get('/broadcast', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'broadcast.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/', (req, res) => res.json({ status: 'ok', phone: WA_PHONE, pendingReplies: Object.keys(pendingVideoReplies).length }));

app.get('/test-token', async (req, res) => {
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` }
    });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Register numbers for auto video reply ──────────────────────────────────
// Called after broadcast sends text template — tells backend to watch for replies
app.post('/register-video-reply', (req, res) => {
  const { phones, mediaId, templateName } = req.body;
  if (!phones || !mediaId) return res.status(400).json({ error: 'phones and mediaId required' });
  phones.forEach(phone => {
    const clean = phone.replace(/\D/g,'');
    const num = clean.length === 10 ? '91' + clean : clean;
    pendingVideoReplies[num] = { mediaId, templateName: templateName || 'video', sent: false };
  });
  console.log(`Registered ${phones.length} numbers for auto video reply. Media ID: ${mediaId}`);
  res.json({ registered: phones.length, mediaId });
});

// ── WhatsApp Webhook verification ──────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ── Receive incoming messages & auto-reply with video ──────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond 200 immediately

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || !messages.length) return;

    for (const msg of messages) {
      const from = msg.from; // sender's phone number
      console.log(`Incoming message from ${from}: ${msg.type}`);

      // Check if this number is registered for auto video reply
      if (pendingVideoReplies[from] && !pendingVideoReplies[from].sent) {
        const { mediaId } = pendingVideoReplies[from];
        console.log(`Auto-sending video to ${from} with media ID ${mediaId}`);

        // Send video as free-form message (works because they just replied)
        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: from,
          type: 'video',
          video: { id: mediaId, caption: '🌴 SGS Pariwar — Trivandrum 2026 🎊' }
        };

        const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await r.json();
        console.log(`Video sent to ${from}:`, JSON.stringify(data));

        if (r.ok) {
          pendingVideoReplies[from].sent = true; // mark as sent so we don't send again
        }
      }
    }
  } catch(e) {
    console.error('Webhook error:', e.message);
  }
});

app.post('/upload-media', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext  = (req.file.originalname.split('.').pop() || '').toLowerCase();
  const mime = { mp4:'video/mp4', mov:'video/quicktime', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', pdf:'application/pdf' }[ext] || req.file.mimetype;
  console.log(`File: ${req.file.originalname} | MIME: ${mime} | Size: ${(req.file.size/1024/1024).toFixed(2)}MB`);
  const token = req.headers['x-wa-token'] || WA_TOKEN;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: mime });
  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, ...form.getHeaders() }, body: form
  });
  const data = await r.json();
  console.log('WA response:', JSON.stringify(data));
  if (!r.ok) return res.status(r.status).json({ error: data.error?.message, code: data.error?.code });
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

app.get('/contacts', async (req, res) => {
  const SB_URL = 'https://oapgtrotlfgrjefanyss.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGd0cm90bGZncmplZmFueXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzk5NzIsImV4cCI6MjA5NjkxNTk3Mn0.thvxozgAtmhHjUGIufdqf1naYB8mOR-0sY09eGTyOTk';
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', Prefer: 'count=none' };
  try {
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
    let forms = [], from2 = 0;
    while (true) {
      const r = await fetch(`${SB_URL}/rest/v1/retailer_forms?select=firm_name,wholesaler_firm,mobile,retailer_name&order=wholesaler_firm.asc`, {
        headers: { ...headers, Range: `${from2}-${from2+999}` }
      });
      const b = await r.json();
      forms = forms.concat(b);
      if (b.length < 1000) break;
      from2 += 1000;
    }
    res.json({ master, forms });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Check if phone has pending video reply ────────────────────────────────────
app.post('/check-video-reply', (req, res) => {
  const phone = (req.body.phone || '').replace(/[^0-9]/g, '');
  const entry = pendingVideoReplies[phone];
  if (entry && !entry.sent) {
    res.json({ mediaId: entry.mediaId, templateName: entry.templateName });
  } else {
    res.json({ mediaId: null });
  }
});

// ── Send video reply (called by TESINI chatbot after checking) ────────────────
app.post('/send-video-reply', async (req, res) => {
  const phone   = (req.body.phone || '').replace(/[^0-9]/g, '');
  const mediaId = req.body.mediaId;
  if (!phone || !mediaId) return res.status(400).json({ error: 'phone and mediaId required' });

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'video',
      video: { id: mediaId, caption: '🎊 With warm regards, SGS Pariwar' }
    };
    const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json();
    if (r.ok) {
      if (pendingVideoReplies[phone]) pendingVideoReplies[phone].sent = true;
      console.log(`Auto video sent to ${phone}`);
      res.json({ success: true, messageId: data.messages?.[0]?.id });
    } else {
      res.status(r.status).json({ error: data.error?.message });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// ── BIRTHDAY & ANNIVERSARY CRON JOB ──────────────────────────────────────────
const SB_URL_SGS = 'https://oapgtrotlfgrjefanyss.supabase.co';
const SB_KEY_SGS = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hcGd0cm90bGZncmplZmFueXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMzk5NzIsImV4cCI6MjA5NjkxNTk3Mn0.thvxozgAtmhHjUGIufdqf1naYB8mOR-0sY09eGTyOTk';
const SB_HDR     = { apikey: SB_KEY_SGS, Authorization: `Bearer ${SB_KEY_SGS}` };

const TEMPLATE_IMAGE_LINKS = {
  'birthday':    'https://ancbckzvoliipitfhnii.supabase.co/storage/v1/object/public/product-images/birthday.jpeg',
  'anniversary': 'https://ancbckzvoliipitfhnii.supabase.co/storage/v1/object/public/product-images/wedding.jpeg'
};

async function sendTemplate(to, templateName) {
  const num = to.replace(/[^0-9]/g, '');
  const phone = num.length === 10 ? '91' + num : num;

  const imageLink = TEMPLATE_IMAGE_LINKS[templateName];
  const components = imageLink ? [{
    type: 'header',
    parameters: [{ type: 'image', image: { link: imageLink } }]
  }] : [];

  const tmpl = { name: templateName, language: { code: 'en' } };
  if (components.length > 0) tmpl.components = components;

  const r = await fetch(`https://graph.facebook.com/v20.0/${WA_PHONE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: tmpl
    })
  });
  const data = await r.json();
  console.log(`Template ${templateName} to ${phone}:`, JSON.stringify(data));
  return { ok: r.ok, data };
}

async function runBirthdayAnniversaryCron() {
  // Get today's date in DD/MM format (matches Indian date format in DB)
  const now     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day     = String(now.getDate()).padStart(2, '0');
  const month   = String(now.getMonth() + 1).padStart(2, '0');
  const todayDM = `${day}/${month}`; // e.g. "26/06"
  console.log(`[CRON] Running birthday/anniversary check for ${todayDM}`);

  try {
    // Fetch from retailer_master
    let rows = [], from = 0;
    while (true) {
      const r = await fetch(
        `${SB_URL_SGS}/rest/v1/retailer_master?select=retailer,mobile,birthday,anniversary&limit=1000&offset=${from}`,
        { headers: { ...SB_HDR, Range: `${from}-${from+999}`, 'Range-Unit': 'items', Prefer: 'count=none' } }
      );
      const b = await r.json();
      rows = rows.concat(b);
      if (b.length < 1000) break;
      from += 1000;
    }

    // Also fetch from retailer_forms (has date_of_birth and anniversary)
    let formRows = [], from2 = 0;
    while (true) {
      const r = await fetch(
        `${SB_URL_SGS}/rest/v1/retailer_forms?select=firm_name,mobile,date_of_birth,anniversary&limit=1000&offset=${from2}`,
        { headers: { ...SB_HDR, Range: `${from2}-${from2+999}`, 'Range-Unit': 'items', Prefer: 'count=none' } }
      );
      const b = await r.json();
      formRows = formRows.concat(b);
      if (b.length < 1000) break;
      from2 += 1000;
    }
    // Normalize form rows to same format
    formRows.forEach(f => {
      rows.push({ retailer: f.firm_name, mobile: f.mobile, birthday: f.date_of_birth, anniversary: f.anniversary });
    });

    let birthdayCount = 0, anniversaryCount = 0;

    for (const row of rows) {
      if (!row.mobile) continue;

      // Check birthday
      if (row.birthday) {
        const bday = row.birthday.toString().trim();
        const bdayDM = extractDayMonth(bday);
        console.log(`[DEBUG] ${row.retailer} birthday: "${bday}" → "${bdayDM}" vs "${todayDM}"`);
        if (bdayDM === todayDM) {
          const result = await sendTemplate(row.mobile, 'birthday');
          console.log(`[BIRTHDAY] ${row.retailer} (${row.mobile}): ${result.ok ? '✓' : '✗'}`);
          if (result.ok) birthdayCount++;
          await sleep(500);
        }
      }

      // Check anniversary
      if (row.anniversary) {
        const ann = row.anniversary.toString().trim();
        const annDM = extractDayMonth(ann);
        if (annDM === todayDM) {
          const result = await sendTemplate(row.mobile, 'anniversary');
          console.log(`[ANNIVERSARY] ${row.retailer} (${row.mobile}): ${result.ok ? '✓' : '✗'}`);
          if (result.ok) anniversaryCount++;
          await sleep(500);
        }
      }
    }

    console.log(`[CRON] Done — ${birthdayCount} birthday msgs, ${anniversaryCount} anniversary msgs sent`);
  } catch(e) {
    console.error('[CRON] Error:', e.message);
  }
}

function extractDayMonth(dateStr) {
  if (!dateStr) return null;
  dateStr = dateStr.toString().trim();
  let day, month;

  // Detect separator
  const sep = dateStr.includes('.') ? '.' : dateStr.includes('/') ? '/' : dateStr.includes('-') ? '-' : null;
  if (!sep) return null;

  const parts = dateStr.split(sep);
  if (parts.length < 3) return null;

  if (parts[0].length === 4) {
    // YYYY-MM-DD or YYYY.MM.DD
    month = parts[1]; day = parts[2].substring(0, 2);
  } else {
    // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY (Indian format)
    day = parts[0]; month = parts[1];
  }

  const d = parseInt(day);
  const m = parseInt(month);
  if (isNaN(d) || isNaN(m) || d < 1 || d > 31 || m < 1 || m > 12) return null;
  return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Schedule cron — runs every day at 9:00 AM IST (3:30 AM UTC)
function scheduleCron() {
  const now      = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const target   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  target.setHours(12, 45, 0, 0);
  // If 9 AM already passed today, schedule for tomorrow
  if (now >= target) target.setDate(target.getDate() + 1);
  const msUntil = target - now;
  console.log(`[CRON] Next birthday/anniversary check in ${Math.round(msUntil/1000/60)} minutes`);
  setTimeout(() => {
    runBirthdayAnniversaryCron();
    // Then repeat every 24 hours
    setInterval(runBirthdayAnniversaryCron, 24 * 60 * 60 * 1000);
  }, msUntil);
}

scheduleCron();


// Manual trigger for birthday/anniversary cron (for testing)
app.get('/run-cron', async (req, res) => {
  res.json({ status: 'Cron triggered, check logs' });
  await runBirthdayAnniversaryCron();
});

app.listen(process.env.PORT || 3000, () => console.log('SGS API running on port ' + (process.env.PORT || 3000)));
