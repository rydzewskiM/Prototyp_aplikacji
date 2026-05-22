
import express from "express";
import session from "express-session";
import pgSessionInit from "connect-pg-simple";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 8080;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER || "bookflow",
  password: process.env.POSTGRES_PASSWORD || "bookflow",
  database: process.env.POSTGRES_DB || "bookflow",
});

const PgSession = pgSessionInit(session);

app.use(express.json({ limit: "10mb" }));
app.use(session({
  store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "bookflow-dev-session",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 12,
  }
}));

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function makeEmbedding(text, dims = 64) {
  const vec = new Array(dims).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    for (let i = 0; i < token.length - 2; i++) {
      const tri = token.slice(i, i + 3);
      let h = 2166136261;
      for (let j = 0; j < tri.length; j++) {
        h ^= tri.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dims;
      vec[idx] += 1;
    }
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map(v => Number((v / norm).toFixed(6)));
}

function vecLiteral(arr) {
  return `[${arr.join(",")}]`;
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ ok: false, error: "Brak aktywnej sesji." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ ok: false, error: "Brak uprawnień administratora." });
  }
  next();
}

async function initDb() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      street TEXT DEFAULT '',
      apartment TEXT DEFAULT '',
      city TEXT DEFAULT '',
      postal_code TEXT DEFAULT '',
      phone TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      author TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      ean TEXT NOT NULL,
      vat INTEGER NOT NULL,
      available BOOLEAN NOT NULL,
      stock INTEGER NOT NULL,
      sales INTEGER NOT NULL DEFAULT 0,
      embedding vector(64)
    );

    CREATE TABLE IF NOT EXISTS rag_chunks (
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      author TEXT NOT NULL,
      summary TEXT NOT NULL,
      reviewer TEXT NOT NULL,
      review TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      rag_text TEXT NOT NULL,
      metadata_json JSONB,
      embedding vector(64)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      receipt_no TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      buyer_email TEXT NOT NULL,
      buyer_nip TEXT DEFAULT '',
      payment_method TEXT NOT NULL,
      status_index INTEGER NOT NULL DEFAULT 0,
      totals JSONB NOT NULL,
      items JSONB NOT NULL
    );
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS street TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS apartment TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT '';`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';`);
  const usersCount = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM users`)).rows[0].c);
  if (usersCount === 0) {
    await pool.query(
      `INSERT INTO users (id, email, password, role, name, street, apartment, city, postal_code, phone) VALUES
      ('USR-0001', 'admin@bookflow.pl', 'admin123', 'admin', 'Administrator', '', '', '', '', ''),
      ('USR-0002', 'klient@bookflow.pl', 'klient123', 'customer', 'Klient demo', 'ul. Książkowa 10', '5', 'Warszawa', '00-001', '500600700')`
    );
  }

  const booksCount = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM books`)).rows[0].c);
  if (booksCount === 0) {
    const books = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-books.json"), "utf-8"));
    for (const book of books) {
      const emb = vecLiteral(makeEmbedding(`${book.title} ${book.author} ${book.genre}`));
      await pool.query(
        `INSERT INTO books (id, title, genre, author, author_id, price, ean, vat, available, stock, sales, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector)`,
        [book.id, book.title, book.genre, book.author, book.authorId, book.price, book.ean, book.vat, book.available, book.stock, book.sales, emb]
      );
    }
  }

  const ragCount = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM rag_chunks`)).rows[0].c);
  if (ragCount === 0) {
    const chunks = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-rag.json"), "utf-8"));
    for (const chunk of chunks) {
      const emb = vecLiteral(makeEmbedding(`${chunk.title} ${chunk.author} ${chunk.genre} ${chunk.rag_text}`));
      await pool.query(
        `INSERT INTO rag_chunks (chunk_id, document_id, title, genre, author, summary, reviewer, review, sentiment, rag_text, metadata_json, embedding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::vector)`,
        [chunk.chunk_id, chunk.document_id, chunk.title, chunk.genre, chunk.author, chunk.summary, chunk.reviewer, chunk.review, chunk.sentiment, chunk.rag_text, chunk.metadata_json || "{}", emb]
      );
    }
  }
}

app.get("/api/health", async (_req, res) => {
  const books = await pool.query(`SELECT COUNT(*)::int AS c FROM books`);
  const rag = await pool.query(`SELECT COUNT(*)::int AS c FROM rag_chunks`);
  res.json({ ok: true, service: "bookflow-vector", books: books.rows[0].c, ragChunks: rag.rows[0].c });
});


app.post("/api/register", async (req, res) => {
  const { name, email, password, street, apartment = "", city, postalCode, phone } = req.body || {};
  if (!name || !email || !password || !street || !city || !postalCode || !phone) {
    return res.status(400).json({ ok: false, error: "Uzupełnij wszystkie pola rejestracji i dane wysyłkowe." });
  }
  const exists = await pool.query(`SELECT 1 FROM users WHERE lower(email)=lower($1)`, [email]);
  if (exists.rows.length) {
    return res.status(409).json({ ok: false, error: "Użytkownik z takim adresem email już istnieje." });
  }
  const next = await pool.query(`SELECT COUNT(*)::int AS c FROM users`);
  const id = `USR-${String(Number(next.rows[0].c) + 1).padStart(4, "0")}`;
  await pool.query(
    `INSERT INTO users (id, email, password, role, name, street, apartment, city, postal_code, phone)
     VALUES ($1,$2,$3,'customer',$4,$5,$6,$7,$8,$9)`,
    [id, email, password, name, street, apartment, city, postalCode, phone]
  );
  res.status(201).json({ ok: true, user: { id, email, role: "customer", name, street, apartment, city, postalCode, phone } });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const result = await pool.query(
    `SELECT id, email, role, name, street, apartment, city, postal_code AS "postalCode", phone
     FROM users WHERE email=$1 AND password=$2`,
    [email, password]
  );
  if (!result.rows.length) return res.status(401).json({ ok: false, error: "Nieprawidłowy login lub hasło." });
  req.session.user = result.rows[0];
  res.json({ ok: true, user: result.rows[0] });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  res.json({ ok: true, user: req.session.user || null });
});

app.get("/api/books", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const genre = String(req.query.genre || "").trim();
  let rows;
  if (!q) {
    const query = genre
      ? `SELECT id, title, genre, author, author_id as "authorId", price::float, ean, vat, available, stock, sales
         FROM books WHERE genre=$1 ORDER BY sales DESC, title ASC LIMIT 100`
      : `SELECT id, title, genre, author, author_id as "authorId", price::float, ean, vat, available, stock, sales
         FROM books ORDER BY sales DESC, title ASC LIMIT 100`;
    rows = (await pool.query(query, genre ? [genre] : [])).rows;
  } else {
    const emb = vecLiteral(makeEmbedding(q));
    const params = genre ? [genre, q, emb] : [q, emb];
    const query = genre
      ? `SELECT id, title, genre, author, author_id as "authorId", price::float, ean, vat, available, stock, sales,
            (1 - (embedding <=> $3::vector)) AS score
         FROM books
         WHERE genre=$1 AND (title ILIKE '%'||$2||'%' OR author ILIKE '%'||$2||'%' OR genre ILIKE '%'||$2||'%' OR embedding IS NOT NULL)
         ORDER BY score DESC, sales DESC
         LIMIT 40`
      : `SELECT id, title, genre, author, author_id as "authorId", price::float, ean, vat, available, stock, sales,
            (1 - (embedding <=> $2::vector)) AS score
         FROM books
         WHERE title ILIKE '%'||$1||'%' OR author ILIKE '%'||$1||'%' OR genre ILIKE '%'||$1||'%' OR embedding IS NOT NULL
         ORDER BY score DESC, sales DESC
         LIMIT 40`;
    rows = (await pool.query(query, params)).rows;
  }
  res.json(rows);
});

app.get("/api/books/:id", async (req, res) => {
  const bookRes = await pool.query(`SELECT id, title, genre, author, author_id as "authorId", price::float, ean, vat, available, stock, sales FROM books WHERE id=$1`, [req.params.id]);
  if (!bookRes.rows.length) return res.status(404).json({ ok: false, error: "Nie znaleziono książki." });
  const book = bookRes.rows[0];
  const ragRes = await pool.query(`SELECT summary, reviewer, review, sentiment FROM rag_chunks WHERE document_id=$1 ORDER BY chunk_id LIMIT 1`, [req.params.id]);
  const recs = await pool.query(
    `SELECT id, title, author, genre, price::float, available, stock, sales FROM books
     WHERE id <> $1 AND genre = $2 ORDER BY sales DESC LIMIT 4`,
    [req.params.id, book.genre]
  );
  res.json({ ...book, rag: ragRes.rows[0] || null, recommendations: recs.rows });
});

app.get("/api/bestsellers", async (_req, res) => {
  const rows = (await pool.query(`SELECT id, title, genre, author, price::float, available, stock, sales FROM books ORDER BY sales DESC LIMIT 8`)).rows;
  res.json(rows);
});

app.post("/api/chat", async (req, res) => {
  const question = String(req.body.question || "").trim();
  if (!question) return res.status(400).json({ ok: false, error: "Brak pytania." });
  const emb = vecLiteral(makeEmbedding(question));
  const hits = (await pool.query(
    `SELECT chunk_id, document_id, title, author, genre, summary, reviewer, review, sentiment,
            (1 - (embedding <=> $1::vector)) AS score
     FROM rag_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT 3`,
    [emb]
  )).rows;
  const reply = hits.length
    ? `Najbardziej pasujące pozycje: ${hits.map(h => `„${h.title}” (${h.author})`).join(", ")}. Najtrafniejsza odpowiedź: ${hits[0].summary} Opinia: ${hits[0].reviewer} — ${hits[0].review}`
    : "Nie znalazłem dopasowania w bazie RAG.";
  res.json({ ok: true, answer: reply, hits });
});


app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  const rows = (await pool.query(
    `SELECT id, email, role, name, street, apartment, city, postal_code AS "postalCode", phone
     FROM users ORDER BY role DESC, name ASC, email ASC`
  )).rows;
  res.json(rows);
});

app.get("/api/admin/sales-report", requireAdmin, async (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!date) return res.status(400).json({ ok: false, error: "Wybierz datę sprzedaży." });
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return res.status(400).json({ ok: false, error: "Nieprawidłowy format daty." });
  const plDate = `${day}.${month}.${year}`;
  const rows = (await pool.query(
    `SELECT * FROM orders WHERE created_at LIKE $1 ORDER BY id DESC`,
    [`${plDate}%`]
  )).rows;
  const grossTotal = rows.reduce((sum, row) => sum + Number(row.totals?.gross || 0), 0);
  const itemsCount = rows.reduce((sum, row) => sum + (row.items || []).reduce((s, i) => s + Number(i.qty || 0), 0), 0);
  res.json({
    ok: true,
    date,
    dateLabel: plDate,
    ordersCount: rows.length,
    itemsCount,
    grossTotal,
    orders: rows
  });
});

app.get("/api/orders", requireLogin, async (req, res) => {
  if (req.session.user.role === "admin") {
    const rows = (await pool.query(`SELECT * FROM orders ORDER BY id DESC LIMIT 100`)).rows;
    return res.json(rows);
  }
  const rows = (await pool.query(`SELECT * FROM orders WHERE buyer_email=$1 ORDER BY id DESC LIMIT 100`, [req.session.user.email])).rows;
  res.json(rows);
});

app.post("/api/orders", requireLogin, async (req, res) => {
  const o = req.body || {};
  const result = await pool.query(
    `INSERT INTO orders (order_no, receipt_no, created_at, customer_name, buyer_email, buyer_nip, payment_method, status_index, totals, items)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *`,
    [o.orderNo, o.receiptNo, o.createdAt, o.customerName, o.buyerEmail, o.buyerNip || "", o.paymentMethod, o.statusIndex || 0, JSON.stringify(o.totals || {}), JSON.stringify(o.items || [])]
  );
  for (const item of (o.items || [])) {
    await pool.query(`UPDATE books SET stock = GREATEST(stock - $2, 0), available = (GREATEST(stock - $2, 0) > 0), sales = sales + $2 WHERE id=$1`, [item.id, item.qty]);
  }
  res.status(201).json({ ok: true, order: result.rows[0] });
});

app.put("/api/orders/:orderNo/status", requireAdmin, async (req, res) => {
  const nextStatus = Number(req.body.statusIndex || 0);
  const result = await pool.query(`UPDATE orders SET status_index=$2 WHERE order_no=$1 RETURNING *`, [req.params.orderNo, nextStatus]);
  if (!result.rows.length) return res.status(404).json({ ok: false, error: "Nie znaleziono zamówienia." });
  res.json({ ok: true, order: result.rows[0] });
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`BookFlow Vector działa na http://localhost:${PORT}`)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
