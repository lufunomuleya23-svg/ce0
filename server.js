const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================
// NEON DATABASE
// =========================
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// =========================
// EMAIL FUNCTION (UNCHANGED)
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

        const data = await response.json();

        if (!response.ok) {
            console.log("Email failed:", data);
        } else {
            console.log("Email sent:", to);
        }

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

    console.log("Neon DB ready");
};

initDB();

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    await db.query(
        "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
        [name, email, hash]
    );

    res.json({ message: "User registered successfully" });
});

// =========================
// LOGIN
// =========================
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const result = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
    );

    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: "Invalid login" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid login" });

    const token = jwt.sign(
        { email: user.email },
        JWT_SECRET,
        { expiresIn: "2h" }
    );

    res.json({
        name: user.name,
        email: user.email,
        token
    });
});

// =========================
// BOOKING
// =========================
app.post("/book", async (req, res) => {
    const { name, email, service, bookingDate, bookingTime } = req.body;

    try {
        if (!bookingDate || !bookingTime) {
            return res.status(400).send("Please select date and time");
        }

        const existing = await db.query(
            "SELECT * FROM bookings WHERE bookingDate = $1 AND bookingTime = $2",
            [bookingDate, bookingTime]
        );

        if (existing.rows.length > 0) {
            return res.status(400).send("Time slot not available");
        }

        await db.query(
            "INSERT INTO bookings (name, email, service, bookingDate, bookingTime) VALUES ($1,$2,$3,$4,$5)",
            [name, email, service, bookingDate, bookingTime]
        );

        // EMAILS (UNCHANGED)
        await sendEmail(
            email,
            "Booking Confirmed - GoldWeb Studio",
            `
Hello ${name},

Your booking has been confirmed successfully.

----------------------------------
BOOKING DETAILS
----------------------------------
Service: ${service}
Date: ${bookingDate}
Time: ${bookingTime}
----------------------------------

WHAT HAPPENS NEXT
----------------------------------
• We will review your booking
• You will receive a Zoom/meeting link before the session
• Please be available at the selected time

Regards,
GoldWeb Team
            `
        );

        await sendEmail(
            "lufunomuleya23@gmail.com",
            "📅 New Booking Received",
            `
New Booking:

Name: ${name}
Email: ${email}
Service: ${service}
Date: ${bookingDate}
Time: ${bookingTime}
            `
        );

        res.send("Booking successful");

    } catch (err) {
        console.log(err.message);
        res.status(500).send("Server error");
    }
});

// =========================
// USER BOOKING (SAFE)
// =========================
app.get("/booking/:email", async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM bookings
             WHERE email = $1
             ORDER BY id DESC
             LIMIT 1`,
            [req.params.email]
        );

        const row = result.rows[0];

        if (!row) return res.json(null);

        res.json({
            id: row.id,
            name: row.name || "",
            email: row.email || "",
            service: row.service || "",
            bookingDate: row.bookingDate || "",
            bookingTime: row.bookingTime || "",
            status: row.status || "pending",
            adminNotes: row.adminNotes || ""
        });

    } catch (err) {
        console.log(err.message);
        res.status(500).json(null);
    }
});

// =========================
// MESSAGE
// =========================
app.post("/message", async (req, res) => {
    const { name, email, message } = req.body;

    await db.query(
        "INSERT INTO messages (name, email, message) VALUES ($1,$2,$3)",
        [name, email, message]
    );

    await sendEmail(
        "lufunomuleya23@gmail.com",
        "New Message",
        message
    );

    res.send("Message sent");
});

// =========================
// ADMIN LOGIN
// =========================
app.post("/admin/login", async (req, res) => {
    const { username, password } = req.body;

    const result = await db.query(
        "SELECT * FROM admin WHERE username = $1",
        [username]
    );

    const admin = result.rows[0];
    if (!admin) return res.status(401).json({ message: "Invalid admin" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "Invalid admin" });

    const token = jwt.sign(
        { username: admin.username },
        JWT_SECRET,
        { expiresIn: "2h" }
    );

    res.json({ token });
});

// =========================
// ADMIN USERS
// =========================
app.get("/admin/users", async (req, res) => {
    const result = await db.query("SELECT id, name, email FROM users ORDER BY id DESC");
    res.json(result.rows);
});

// =========================
// ADMIN BOOKINGS (FIXED SAFE)
// =========================
app.get("/admin/bookings", async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM bookings ORDER BY id DESC");

        const safe = result.rows.map(row => ({
            id: row.id,
            name: row.name || "",
            email: row.email || "",
            service: row.service || "",
            bookingDate: row.bookingDate || "",
            bookingTime: row.bookingTime || "",
            status: row.status || "pending",
            adminNotes: row.adminNotes || ""
        }));

        res.json(safe);

    } catch (err) {
        console.log(err.message);
        res.status(500).json([]);
    }
});

// =========================
// ADMIN MESSAGES
// =========================
app.get("/admin/messages", async (req, res) => {
    const result = await db.query("SELECT * FROM messages ORDER BY id DESC");
    res.json(result.rows);
});

// =========================
// UPDATE BOOKING (FIXED)
// =========================
app.post("/admin/update-booking", async (req, res) => {
    try {
        const { id, status, adminNotes } = req.body;

        if (!id) {
            return res.status(400).json({ message: "Missing ID" });
        }

        await db.query(
            `UPDATE bookings 
             SET status = $1, adminNotes = $2 
             WHERE id = $3`,
            [
                status || "pending",
                adminNotes || "",
                id
            ]
        );

        res.json({ message: "Booking updated" });

    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: "Update failed" });
    }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
