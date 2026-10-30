# LegalGuide AI (local)

Beige and white legal help chat. HTML, CSS, JavaScript frontend plus a tiny Node server that talks to the Groq API.

## Run
1. Install Node.js 18 or newer (nodejs.org)
2. Copy `.env.example` to `.env` and put your Groq key (starts with `gsk_`) in it
3. In this folder run: `node server.js`
4. Open http://localhost:3000

No `npm install` needed. Stop the server with Ctrl + C.

## Files
- `index.html`, `style.css`, `script.js`: the website
- `server.js`: serves the site and calls Groq (your key stays on the server)
- `.env`: your secret key (never share or upload it)
