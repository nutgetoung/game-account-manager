const crypto = require("crypto");
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const PgSession = require("connect-pg-simple")(session);

const app = express();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the persistent PostgreSQL database.");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || `http://localhost:${port}`;
const encryptionKey = process.env.ENCRYPTION_KEY
  ? crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY).digest()
  : crypto.createHash("sha256").update("development-only-key").digest();
const mailer = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  ? nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } })
  : null;
const appUrl = process.env.APP_URL || `http://localhost:${port}`;

function encryptPassword(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `enc:v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptPassword(value) {
  if (!String(value).startsWith("enc:v1:")) return String(value);
  const [, , ivText, tagText, encryptedText] = String(value).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
}

app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "50kb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === frontendUrl || (!isProduction && origin === "http://localhost:3000")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.get("/health", (_req, res) => res.json({ ok: true }));
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." },
});
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-session-secret",
  store: new PgSession({ pool: db, tableName: "user_sessions", createTableIfMissing: true }),
  resave: false,
  saveUninitialized: false,
  name: "game-vault.sid",
  cookie: { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(express.static(__dirname));

const schemaReady = db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token TEXT,
    reset_token TEXT,
    reset_expires BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    user_id_value TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    password TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function sendMail(to, subject, text) {
  if (!mailer) throw new Error("Email is not configured");
  await mailer.sendMail({ from: process.env.GMAIL_USER, to, subject, text });
}

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
};

app.post("/api/auth/register", authRateLimit, async (req, res) => {
  await schemaReady;
  const username = String(req.body.username || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[a-z0-9_]{3,24}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: "Enter a valid email, a username with 3–24 letters/numbers/underscores, and a password of 8–128 characters." });
  }
  if (!mailer) return res.status(503).json({ error: "Email service is not configured yet." });
  let userId;
  try {
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const result = await db.query("INSERT INTO users (username, email, password_hash, verification_token) VALUES ($1, $2, $3, $4) RETURNING id", [username, email, await bcrypt.hash(password, 12), tokenHash(verificationToken)]);
    userId = result.rows[0].id;
    await sendMail(email, "Verify your Game Account Manager email", `Welcome! Verify your email here:\n\n${appUrl}/api/auth/verify-email?token=${verificationToken}\n\nThis link can be used once.`);
    res.status(201).json({ message: "Check your email to verify your account." });
  } catch (error) {
    if (userId) await db.query("DELETE FROM users WHERE id = $1", [userId]);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Username is already registered" });
    }
    console.error("Registration failed:", error);
    res.status(502).json({ error: "We could not send the verification email. Please check the email address or try again later." });
  }
});

app.get("/api/auth/verify-email", (req, res) => {
  const user = db.query("SELECT id FROM users WHERE verification_token = $1", [tokenHash(String(req.query.token || ""))]).then((result) => result.rows[0]);
  return user.then((row) => {
  if (!row) return res.status(400).send("This verification link is invalid or has already been used.");
  return db.query("UPDATE users SET email_verified = TRUE, verification_token = NULL WHERE id = $1", [row.id]).then(() => res.send("Email verified successfully. You can now return to the app and sign in."));
  });
});

app.post("/api/auth/login", authRateLimit, async (req, res) => {
  await schemaReady;
  const username = String(req.body.username || "").trim().toLowerCase();
  const user = (await db.query("SELECT id, username, password_hash, email, email_verified FROM users WHERE username = $1", [username])).rows[0];
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.password_hash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  if (user.email && !user.email_verified) return res.status(403).json({ error: "Please verify your email before signing in." });
  req.session.regenerate((sessionError) => {
    if (sessionError) return res.status(500).json({ error: "Unable to start your session." });
    req.session.user = { id: user.id, username: user.username };
    req.session.save(() => res.json(req.session.user));
  });
});

app.post("/api/auth/forgot-password", authRateLimit, async (req, res) => {
  await schemaReady;
  const username = String(req.body.username || "").trim().toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = (await db.query("SELECT id FROM users WHERE username = $1 AND email = $2", [username, email])).rows[0];
  if (user && mailer) {
    const token = crypto.randomBytes(32).toString("hex");
    await db.query("UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3", [tokenHash(token), Date.now() + 15 * 60 * 1000, user.id]);
    try {
      await sendMail(email, "Reset your Game Account Manager password", `Reset your password here:\n\n${appUrl}/?reset=${token}\n\nThis link expires in 15 minutes.`);
    } catch (error) {
      await db.query("UPDATE users SET reset_token = NULL, reset_expires = NULL WHERE id = $1", [user.id]);
      console.error("Password reset email failed:", error);
      return res.status(502).json({ error: "Unable to send the password reset email. Please try again later." });
    }
  }
  res.json({ message: "If that email exists, a reset link has been sent." });
});

app.post("/api/auth/reset-password", authRateLimit, async (req, res) => {
  await schemaReady;
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "New password must be 8–128 characters." });
  if (password !== confirmPassword) return res.status(400).json({ error: "New passwords do not match." });
  const user = (await db.query("SELECT id FROM users WHERE reset_token = $1 AND reset_expires > $2", [tokenHash(token), Date.now()])).rows[0];
  if (!user) return res.status(400).json({ error: "This reset link is invalid or expired." });
  const result = await db.query("UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2 AND reset_token = $3", [await bcrypt.hash(password, 12), user.id, tokenHash(token)]);
  if (!result.rowCount) return res.status(409).json({ error: "This reset link has already been used." });
  res.json({ message: "Password reset successfully. You can now sign in." });
});

app.post("/api/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/auth/me", (req, res) => res.json(req.session.user || null));

app.get("/api/accounts", requireAuth, (req, res) => {
  db.query("SELECT id, game, user_id_value AS \"userId\", email, password, notes FROM accounts WHERE user_id = $1 ORDER BY id DESC", [req.session.user.id])
    .then((result) => res.json(result.rows.map((account) => ({ ...account, password: decryptPassword(account.password) }))));
});

app.post("/api/accounts", requireAuth, (req, res) => {
  const account = req.body;
  if (!account.game || !account.userId || !account.password) return res.status(400).json({ error: "Game, user ID, and password are required" });
  db.query("INSERT INTO accounts (user_id, game, user_id_value, email, password, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [req.session.user.id, account.game, account.userId, account.email || "", encryptPassword(account.password), account.notes || ""])
    .then((result) => res.status(201).json({ id: result.rows[0].id, ...account }));
});

app.put("/api/accounts", requireAuth, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "Invalid accounts data" });
  db.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM accounts WHERE user_id = $1", [req.session.user.id]);
      for (const account of req.body.filter((item) => item && item.game && item.userId && item.password)) {
        await client.query("INSERT INTO accounts (user_id, game, user_id_value, email, password, notes) VALUES ($1, $2, $3, $4, $5, $6)", [req.session.user.id, account.game, account.userId, account.email || "", encryptPassword(account.password), account.notes || ""]);
      }
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (error) { await client.query("ROLLBACK"); res.status(500).json({ error: "Unable to save accounts" }); }
    finally { client.release(); }
  });
});

app.put("/api/accounts/:id", requireAuth, (req, res) => {
  const account = req.body;
  db.query("UPDATE accounts SET game = $1, user_id_value = $2, email = $3, password = $4, notes = $5 WHERE id = $6 AND user_id = $7", [account.game, account.userId, account.email || "", encryptPassword(account.password), account.notes || "", req.params.id, req.session.user.id])
    .then((result) => result.rowCount ? res.json({ id: Number(req.params.id), ...account }) : res.status(404).json({ error: "Account not found" }));
});

app.delete("/api/accounts/:id", requireAuth, (req, res) => {
  db.query("DELETE FROM accounts WHERE id = $1 AND user_id = $2", [req.params.id, req.session.user.id]).then(() => res.json({ ok: true }));
});

app.listen(port, () => console.log(`Game Account Manager running at http://localhost:${port}`));
