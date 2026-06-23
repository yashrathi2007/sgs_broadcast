# SGS Broadcast API

Backend for SGS WhatsApp broadcast system.

## Deploy to Railway
1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Set environment variables (optional — defaults are hardcoded):
   - WA_PHONE = 1199473816581188
   - WA_TOKEN = your token
   - WA_WABA  = 1495630418445197
4. Railway auto-detects Node.js and deploys

## Endpoints
- GET  /           → health check
- POST /upload-media → upload file, returns { id }
- POST /send-message → proxy WA message send
- GET  /templates   → fetch approved templates
- POST /update-token → update token at runtime
