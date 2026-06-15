const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// =========================
// RESEND EMAIL FUNCTION (FIXED)
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
                to: [to],   // ✅ FIX: always array
                subject,
                text
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.log("Email failed:", data);
        } else {
            console.log("Email sent to:", to);
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
                    // USER EMAIL (FIXED)
                    // =========================
                    await sendEmail(
                        email,
                        "✅ Booking Confirmed - GoldWeb Studio",
                        `
Hello ${name},

Thank you for booking with GoldWeb Studio.

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
New Booking Received:

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
// DELETE ACCOUNt
// =========================
app.delete("/delete-account/:email", (req, res) => {

    const email = req.params.email;

    db.run("DELETE FROM bookings WHERE email = ?", [email]);
    db.run("DELETE FROM users WHERE email = ?", [email], (err) => {

        if (err) return res.status(500).send("Delete failed");

        res.send("Account deleted");
    });
});

app.get("/reset-admin", async (req, res) => {
    const hash = await bcrypt.hash("GoldWeb@2026Secure!", 12);

    db.run(
        "INSERT INTO admin (username, password) VALUES (?, ?)",
        ["admin", hash],
        (err) => {
            if (err) {
                console.log(err.message);
                return res.send("Failed to create admin");
            }

            res.send("Admin created successfully");
        }
    );
});

app.get("/check-admin", (req, res) => {
    db.all("SELECT * FROM admin", [], (err, rows) => {
        res.json(rows);
    });
});

app.post("/admin/login", (req, res) => {

    const { username, password } = req.body;

    db.get(
        "SELECT * FROM admin WHERE username = ?",
        [username],
        async (err, admin) => {

            if (err) return res.status(500).json({ message: "Server error" });

            if (!admin) {
                return res.status(401).json({ message: "Invalid admin" });
            }

            const match = await bcrypt.compare(password, admin.password);

            if (!match) {
                return res.status(401).json({ message: "Invalid admin" });
            }

            const token = jwt.sign(
                { username: admin.username },
                JWT_SECRET,
                { expiresIn: "2h" }
            );

            res.json({ token });
        }
    );
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
