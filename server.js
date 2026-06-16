const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================
// DB
// =========================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =========================
// EMAIL (UNCHANGED)
// =========================
const sendEmail = async (to, subject, text) => {
    try {
        const response = await fetch("https://api.resend.com/emails", {
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
        console.log(err.message);
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
const initDB = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS bookings (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT,
            service TEXT,
            bookingDate TEXT,
            bookingTime TEXT,
            status TEXT DEFAULT 'pending',
            adminNotes TEXT
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            name TEXT,
            email TEXT,
            message TEXT
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
};

initDB();

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await db.query(
        "INSERT INTO users (name, email, password) VALUES ($1,$2,$3)",
        [name, email, hash]
    );

    res.json({ message: "ok" });
});

// =========================
// LOGIN
// =========================
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query(
        "SELECT * FROM users WHERE email=$1",
        [email]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "Invalid" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid" });

    const token = jwt.sign({ email: user.email }, JWT_SECRET);

    res.json({
        name: user.name,
        email: user.email,
        token
    });
});

// =========================
// BOOKING (FIXED)
// =========================
app.post("/book", async (req, res) => {
    const { name, email, service, bookingDate, bookingTime } = req.body;

    if (!bookingDate || !bookingTime) {
        return res.status(400).send("Select date & time");
    }

    const existing = await db.query(
        "SELECT * FROM bookings WHERE bookingDate=$1 AND bookingTime=$2",
        [bookingDate, bookingTime]
    );

    if (existing.rows.length > 0) {
        return res.status(400).send("Slot taken");
    }

    await db.query(
        "INSERT INTO bookings (name,email,service,bookingDate,bookingTime) VALUES ($1,$2,$3,$4,$5)",
        [name, email, service, bookingDate, bookingTime]
    );

    res.send("Booked");
});

// =========================
// GET BOOKING (FIXED CLEAN OUTPUT)
// =========================
app.get("/booking/:email", async (req, res) => {
    const result = await db.query(
        "SELECT * FROM bookings WHERE email=$1 ORDER BY id DESC LIMIT 1",
        [req.params.email]
    );

    const row = result.rows[0];

    if (!row) return res.json(null);

    res.json({
        id: row.id,
        service: row.service || "",
        bookingDate: row.bookingDate || "",
        bookingTime: row.bookingTime || "",
        status: row.status || "pending"
        // ❌ adminNotes removed from USER VIEW
    });
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

    res.send("Sent");
});

// =========================
// DELETE ACCOUNT (FIXED)
// =========================
app.delete("/delete-account/:email", async (req, res) => {
    const email = req.params.email;

    await db.query("DELETE FROM bookings WHERE email=$1", [email]);
    await db.query("DELETE FROM messages WHERE email=$1", [email]);
    await db.query("DELETE FROM users WHERE email=$1", [email]);

    res.send("Deleted");
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
    if (!admin) return res.status(401).json({ message: "Invalid" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "Invalid" });

    const token = jwt.sign({ username }, JWT_SECRET);

    res.json({ token });
});

// =========================
// ADMIN DATA
// =========================
app.get("/admin/users", async (req, res) => {
    const result = await db.query("SELECT id,name,email FROM users");
    res.json(result.rows);
});

app.get("/admin/bookings", async (req, res) => {
    const result = await db.query("SELECT * FROM bookings ORDER BY id DESC");
    res.json(result.rows);
});

app.get("/admin/messages", async (req, res) => {
    const result = await db.query("SELECT * FROM messages ORDER BY id DESC");
    res.json(result.rows);
});

// =========================
// UPDATE BOOKING
// =========================
app.post("/admin/update-booking", async (req, res) => {
    const { id, status, adminNotes } = req.body;

    await db.query(
        "UPDATE bookings SET status=$1, adminNotes=$2 WHERE id=$3",
        [status, adminNotes, id]
    );

    res.send("Updated");
});

// =========================
app.listen(PORT, () => {
    console.log("Server running");
});
