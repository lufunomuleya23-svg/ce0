const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================
// DATABASE
// =========================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// =========================
// INIT DATABASE
// =========================
(async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS requests (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT,
            service TEXT,
            date TEXT,
            time TEXT,
            message TEXT,
            status TEXT DEFAULT 'pending',
            adminNotes TEXT DEFAULT '',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT,
            message TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS admin (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT
        )
    `);

    console.log("Database ready");
})();

// =========================
// REGISTER USER
// =========================
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await db.query(
        "INSERT INTO users (name,email,password) VALUES ($1,$2,$3)",
        [name, email, hash]
    );

    res.json({ success: true });
});

// =========================
// LOGIN USER
// =========================
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ error: "invalid" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "invalid" });

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "2h" });

    res.json({
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        token
    });
});

// =========================
// CREATE REQUEST
// =========================
app.post("/request", async (req, res) => {
    const { name, email, service, date, time, message } = req.body;

    await db.query(
        `INSERT INTO requests (name,email,service,date,time,message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [name, email, service, date, time, message]
    );

    res.json({ success: true });
});

// =========================
// GET LAST REQUEST
// =========================
app.get("/request/:email", async (req, res) => {
    const result = await db.query(
        `SELECT * FROM requests
         WHERE email=$1
         ORDER BY id DESC
         LIMIT 1`,
        [req.params.email]
    );

    res.json(result.rows[0] || null);
});

// =========================
// DELETE USER ACCOUNT
// =========================
app.delete("/user/:email", async (req, res) => {
    const email = req.params.email;

    await db.query("DELETE FROM requests WHERE email=$1", [email]);
    await db.query("DELETE FROM users WHERE email=$1", [email]);

    res.json({ success: true });
});

// =========================
// DELETE REQUEST (ADMIN)
// =========================
app.delete("/admin/delete-request/:id", async (req, res) => {
    const { id } = req.params;

    const result = await db.query(
        "DELETE FROM requests WHERE id=$1 RETURNING *",
        [id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: "Request not found" });
    }

    res.json({ success: true });
});

// =========================
// UPDATE REQUEST (STATUS + NOTES)
// =========================
app.post("/admin/update-request", async (req, res) => {
    const { id, status, adminNotes } = req.body;

    const result = await db.query(
        `UPDATE requests
         SET status=$1,
             adminNotes=$2
         WHERE id=$3
         RETURNING *`,
        [
            status || "pending",
            adminNotes || "",
            id
        ]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: "Not found" });
    }

    res.json({ success: true, data: result.rows[0] });
});

// =========================
// ADMIN LOGIN
// =========================
app.post("/admin/login", async (req, res) => {
    const { username, password } = req.body;

    const result = await db.query(
        "SELECT * FROM admin WHERE username=$1",
        [username]
    );

    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ error: "invalid" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: "invalid" });

    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "2h" });

    res.json({ token });
});

// =========================
// ADMIN DATA
// =========================
app.get("/admin/users", async (req, res) => {
    const result = await db.query("SELECT * FROM users ORDER BY id DESC");
    res.json(result.rows);
});

app.get("/admin/requests", async (req, res) => {
    const result = await db.query("SELECT * FROM requests ORDER BY id DESC");
    res.json(result.rows);
});

app.get("/admin/messages", async (req, res) => {
    const result = await db.query("SELECT * FROM messages ORDER BY id DESC");
    res.json(result.rows);
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
