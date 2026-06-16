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
// EMAIL
// =========================
const sendEmail = async (to, subject, text) => {
    try {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: "GoldWeb <onboarding@resend.dev>",
                to: [to],
                subject,
                text
            })
        });
    } catch (err) {
        console.log("Email error:", err.message);
    }
};

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// =========================
// INIT DB
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

    console.log("DB ready");
})();

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await db.query(
        "INSERT INTO users (name,email,password) VALUES ($1,$2,$3)",
        [name, email, hash]
    );

    res.json({ message: "registered" });
});

// =========================
// LOGIN
// =========================
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query("SELECT * FROM users WHERE email=$1", [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ message: "invalid" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "invalid" });

    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "2h" });

    res.json({
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        token
    });
});

// =========================
// USER REQUEST
// =========================
app.post("/request", async (req, res) => {
    const { name, email, service, date, time, message } = req.body;

    await db.query(
        `INSERT INTO requests (name,email,service,date,time,message)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [name, email, service, date, time, message]
    );

    await sendEmail(
        "lufunomuleya23@gmail.com",
        "New Client Request",
        `Name: ${name}
Email: ${email}
Service: ${service}
Date: ${date}
Time: ${time}
Message: ${message}`
    );

    res.send("Request sent successfully");
});

// =========================
// GET REQUEST
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
// DELETE USER ACCOUNT (FIXED)
// =========================
app.delete("/user/:email", async (req, res) => {
    const email = req.params.email;

    await db.query("DELETE FROM requests WHERE email=$1", [email]);
    await db.query("DELETE FROM users WHERE email=$1", [email]);

    res.send("Account deleted");
});

// =========================
// DELETE REQUEST (FIXED)
// =========================
app.delete("/request/:id", async (req, res) => {
    await db.query("DELETE FROM requests WHERE id=$1", [req.params.id]);
    res.send("Request deleted");
});

// =========================
// MESSAGE
// =========================
app.post("/message", async (req, res) => {
    const { name, email, message } = req.body;

    await db.query(
        "INSERT INTO messages (name,email,message) VALUES ($1,$2,$3)",
        [name, email, message]
    );

    res.send("Message sent");
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
    if (!admin) return res.status(401).json({ message: "invalid" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "invalid" });

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
// UPDATE REQUEST (FIXED)
// =========================
app.post("/admin/update-request", async (req, res) => {
    const { id, status, adminNotes } = req.body;

    await db.query(
        `UPDATE requests
         SET status=$1,
             adminNotes=$2
         WHERE id=$3`,
        [status, adminNotes, id]
    );

    res.send("updated");
});

// =========================
// START
// =========================
app.listen(PORT, () => console.log("Server running on port", PORT));
