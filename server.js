require('dotenv').config();
const express = require('express'), fs = require('fs'), path = require('path'), crypto = require('crypto'), nodemailer = require('nodemailer');
const E = process.env, PORT = E.PORT || 3000, BASE = (E.BASE_URL || 'http://localhost:' + PORT).replace(/\/$/, '');
const STORE = E.STORE_EMAIL || E.GMAIL_USER, PASS = E.ADMIN_PASSWORD || 'admin123';
const DB = path.join(__dirname, 'data.json'), UP = path.join(__dirname, 'uploads');
fs.mkdirSync(UP, { recursive: true });

const seedP = [['Classic black tee','men',1500,'#222'],['Oversized hoodie','men',3800,'#3b3b3b'],['Denim shirt','men',3200,'#2d4a73'],['Kurta shalwar','men',4500,'#d8d2c4'],['Floral lawn suit','women',4200,'#b5395e'],['Silk abaya','women',6500,'#111'],['Pastel kurti','women',2800,'#e7a9b8'],['Casual cardigan','women',3600,'#8a6f5a'],['Kids graphic tee','kids',1200,'#e8a317'],['Kids hoodie','kids',2400,'#2e8b6e'],['Little shalwar kameez','kids',2900,'#4a6fd0'],['Kids denim jacket','kids',3100,'#3d5a80']];
const seed = () => ({ products: seedP.map((a, i) => ({ id: i + 1, name: a[0], cat: a[1], price: a[2], color: a[3], img: '' })), heroes: [], catImgs: {}, reviews: [], orders: [] });
const load = () => { try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) { return seed(); } };
const save = d => fs.writeFileSync(DB, JSON.stringify(d, null, 1));
if (!fs.existsSync(DB)) save(seed());

const mailer = nodemailer.createTransport({ service: 'gmail', auth: { user: E.GMAIL_USER, pass: (E.GMAIL_APP_PASSWORD || '').replace(/\s/g, '') } });
const send = (to, subject, text) => mailer.sendMail({ from: `NOIR Wear <${E.GMAIL_USER}>`, to, subject, text });

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(UP));
app.use(express.static(path.join(__dirname, 'public')));

const tokens = new Map();
const auth = (req, res, next) => { const t = tokens.get(req.get('x-token')); if (t && t > Date.now()) return next(); res.status(401).json({ error: 'Please log in again' }); };
const bad = (res, m) => res.status(400).json({ error: m });
const clean = (s, n = 300) => String(s || '').trim().slice(0, n);

app.get('/api/public', (req, res) => { const d = load(); res.json({ products: d.products, heroes: d.heroes, catImgs: d.catImgs || {}, reviews: d.reviews }); });

app.post('/api/login', (req, res) => {
  if (clean(req.body.password) !== PASS) return res.status(401).json({ error: 'Wrong password' });
  const t = crypto.randomBytes(24).toString('hex'); tokens.set(t, Date.now() + 12 * 3600e3); res.json({ token: t });
});

app.post('/api/orders', async (req, res) => {
  const b = req.body, d = load();
  const name = clean(b.name, 80), phone = clean(b.phone, 20).replace(/[\s-]/g, ''), email = clean(b.email, 120), city = clean(b.city, 60), address = clean(b.address, 300);
  if (name.length < 2) return bad(res, 'Please enter your name.');
  if (!/^(\+92|0)3\d{9}$/.test(phone)) return bad(res, 'Phone number is wrong. Use a Pakistani mobile like 03001234567.');
  if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email)) return bad(res, 'Email is not valid.');
  if (city.length < 3) return bad(res, 'Please enter a valid city.');
  if (address.length < 10) return bad(res, 'Address is too short. Write house number, street and area.');
  const lines = [], items = Array.isArray(b.items) ? b.items : [];
  let total = 0;
  for (const it of items) {
    const p = d.products.find(x => x.id == it.pid), q = Math.max(1, Math.min(99, +it.qty || 1));
    if (!p) continue; total += p.price * q;
    lines.push(`${q} x ${p.name} (${clean(it.sz, 5)}${it.col ? ', ' + clean(it.col, 20) : ''})`);
  }
  if (!lines.length) return bad(res, 'Your bag is empty.');
  const id = crypto.randomBytes(5).toString('hex');
  const o = { id, no: '#' + (1001 + d.orders.length), date: new Date().toLocaleString('en-GB'), name, phone, city, email, addr: address + ' | Email: ' + email, pay: clean(b.pay, 40), items: lines.join('\n'), total, status: 'Pending', notified: false };
  d.orders.unshift(o); save(d);
  let emailed = false;
  try {
    await send(STORE, `New order from ${name}`, `Customer: ${name}\n\nProducts to deliver:\n${lines.join('\n')}\n\nOpen in admin dashboard:\n${BASE}/#order-${id}`);
    emailed = true;
  } catch (e) { console.error('Order email failed:', e.message); }
  res.json({ ok: true, no: o.no, name, emailed });
});

app.post('/api/reviews', (req, res) => {
  const b = req.body, d = load(), r = { n: clean(b.n, 60), e: clean(b.e, 120), r: Math.min(5, Math.max(1, +b.r || 5)), m: clean(b.m, 600), d: new Date().toLocaleDateString('en-GB') };
  if (r.n.length < 2 || r.m.length < 6) return bad(res, 'Please write your name and a longer review.');
  d.reviews.unshift(r); save(d); res.json({ reviews: d.reviews });
});

app.post('/api/contact', async (req, res) => {
  const n = clean(req.body.n, 80), e = clean(req.body.e, 120), m = clean(req.body.m, 1000);
  if (n.length < 2 || m.length < 6) return bad(res, 'Please fill the form properly.');
  try { await send(STORE, `Message from ${n}`, `${m}\n\n${n} / ${e}`); res.json({ ok: true }); }
  catch (err) { console.error(err.message); res.status(500).json({ error: 'Could not send the message.' }); }
});

app.get('/api/admin/orders', auth, (req, res) => res.json(load().orders));

app.patch('/api/admin/orders/:id', auth, async (req, res) => {
  const d = load(), o = d.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  o.status = req.body.status === 'Delivered' ? 'Delivered' : 'Pending';
  let emailed = false, error = '';
  if (o.status === 'Delivered' && (!o.notified || req.body.resend)) {
    try {
      await send(o.email, 'Your parcel has been delivered', `Hi ${o.name},\n\nYour parcel has been delivered.\n\n${o.items}\n\nThank you for shopping with NOIR Wear!`);
      o.notified = true; emailed = true;
    } catch (e) { error = e.message; console.error('Delivery email failed:', e.message); }
  }
  save(d); res.json({ order: o, emailed, error });
});

app.delete('/api/admin/orders/:id', auth, (req, res) => { const d = load(); d.orders = d.orders.filter(x => x.id !== req.params.id); save(d); res.json({ ok: true }); });

const toFile = v => {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(v || '');
  if (!m) return v;
  const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UP, name), Buffer.from(m[2], 'base64')); return '/uploads/' + name;
};
app.put('/api/admin/data', auth, (req, res) => {
  const b = req.body, d = load();
  d.products = (b.products || []).map(p => ({ ...p, img: toFile(p.img) }));
  d.heroes = (b.heroes || []).slice(0, 6).map(h => ({ img: toFile(h.img) }));
  d.catImgs = Object.fromEntries(Object.entries(b.catImgs || {}).map(([k, v]) => [k, toFile(v)]));
  d.reviews = b.reviews || [];
  save(d); res.json({ products: d.products, heroes: d.heroes, catImgs: d.catImgs, reviews: d.reviews });
});

app.listen(PORT, () => {
  console.log('NOIR Wear running at ' + BASE);
  if (!E.GMAIL_USER || !E.GMAIL_APP_PASSWORD) console.log('WARNING: set GMAIL_USER and GMAIL_APP_PASSWORD in .env or emails will fail.');
});
