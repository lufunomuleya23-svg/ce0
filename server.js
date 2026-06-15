const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// ENV VARIABLES
// =========================
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================
// RESEND EMAIL FUNCTION
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
                to,
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
// DATABASE
// =========================
const db = new sqlite3.Database("./database.db", (err) => {
    if (err) console.log(err.message);
    else console.log("SQLite connected");
});

// =========================
// TABLES
// =========================
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    resetToken TEXT,
    resetExpires INTEGER
)`);

db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    service TEXT,
    bookingDate TEXT,
    bookingTime TEXT,
    status TEXT DEFAULT 'pending',
    adminNotes TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    message TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)`);

// =========================
// REGISTER
// =========================
app.post("/register", async (req, res) => {

    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);

    db.run(
        "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
        [name, email, hash],
        (err) => {
            if (err) return res.status(400).json({ message: "Email already exists" });
            res.json({ message: "User registered successfully" });
        }
    );
});

// =========================
// LOGIN
// =========================
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {

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
});

// =========================
// BOOKING
// =========================
app.post("/book", (req, res) => {

    const { name, email, service, bookingDate, bookingTime } = req.body;

    db.get(
        "SELECT * FROM bookings WHERE bookingDate = ? AND bookingTime = ?",
        [bookingDate, bookingTime],
        (err, existing) => {

            if (err) return res.status(500).send("Server error");

            if (existing) return res.status(400).send("Time slot not available");

            db.run(
                "INSERT INTO bookings (name, email, service, bookingDate, bookingTime) VALUES (?, ?, ?, ?, ?)",
                [name, email, service, bookingDate, bookingTime],
                async (err) => {

                    if (err) return res.status(500).send("Booking failed");

                    // =========================
                    // USER EMAIL (FULL)
                    // =========================
                    await sendEmail(
                        email,
                        "✅ Booking Confirmed - GoldWeb Studio",
                        `
Hello ${name},

Thank you for booking with GoldWeb Studio.

We are pleased to confirm your booking.

--------------------------------------------------
BOOKING DETAILS
--------------------------------------------------
Service: ${service}
Date: ${bookingDate}
Time: ${bookingTime}
--------------------------------------------------

NEXT STEPS
--------------------------------------------------
• Your booking will be reviewed
• A Zoom link will be sent before the session
• Please be available at the scheduled time

If you do not see this email, check Spam/Junk folder.

Kind regards,
GoldWeb Studio
                        `
                    );

                    // =========================
                    // ADMIN EMAIL
                    // =========================
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
                }
            );
        }
    );
});

// =========================
// GET BOOKING
// =========================
app.get("/booking/:email", (req, res) => {

    db.get(
        "SELECT * FROM bookings WHERE email = ? ORDER BY id DESC LIMIT 1",
        [req.params.email],
        (err, row) => {
            if (err) return res.status(500).send("Server error");
            res.json(row || null);
        }
    );
});

// =========================
// MESSAGE
// =========================
app.post("/message", (req, res) => {

    const { name, email, message } = req.body;

    db.run(
        "INSERT INTO messages (name, email, message) VALUES (?, ?, ?)",
        [name, email, message]
    );

    sendEmail(
        "lufunomuleya23@gmail.com",
        `New Message from ${name}`,
        `
Name: ${name}
Email: ${email}

Message:
${message}
        `
    );

    res.send("Message sent");
});

// =========================
// DELETE ACCOUNT
// =========================
app.delete("/delete-account/:email", (req, res) => {

    const email = req.params.email;

    db.run("DELETE FROM bookings WHERE email = ?", [email]);
    db.run("DELETE FROM users WHERE email = ?", [email], (err) => {

        if (err) return res.status(500).send("Delete failed");

        res.send("Account deleted");
    });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
