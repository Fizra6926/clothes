NOIR Wear - store with backend (Node.js)

1) Install Node.js (v18+) from nodejs.org
2) In this folder run:   npm install
3) Copy .env.example to .env and fill in:
   GMAIL_APP_PASSWORD  (Google Account > Security > 2-Step Verification ON > App passwords > create one)
   ADMIN_PASSWORD      (your admin password)
4) Run:   npm start
5) Open:  http://localhost:3000     (do NOT use VS Code Live Server any more)
   Admin: click the gear icon, or open http://localhost:3000/#admin

When deployed, set BASE_URL in .env to your real website address,
so the admin link in the order email opens the live site.
