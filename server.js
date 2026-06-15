const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = "super_secret_key_change_this";

// =========================
// EMAIL SETUP
// =========================
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: "lufunomuleya23@gmail.com",
        pass: "tnpz bqzw vbrp myhu"
    }
});



// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // IMPORTANT for admin.html, login.html

// =========================
// DATABASE
// =========================
const db = new sqlite3.Database("./database.db", (err) => {
    if (err) console.log(err.message);
    else console.log("SQLite connected");
});


app.delete("/delete-account", (req, res) => {

    const { email } = req.body;

    if (!email) {
        return res.status(400).send("Email required");
    }

    // delete user
    db.run("DELETE FROM users WHERE email = ?", [email], function(err) {
        if (err) {
            return res.status(500).send("Failed to delete account");
        }

        // optional: also delete bookings
        db.run("DELETE FROM bookings WHERE email = ?");

        res.send("Account deleted successfully");
    });
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

// Default admin
db.get("SELECT * FROM admin WHERE username = ?", ["admin"], async (err, row) => {
    if (!row) {

        const strongPassword = "GoldWeb@2026Secure!";

        const hash = await bcrypt.hash(strongPassword, 12);

        db.run(
            "INSERT INTO admin (username, password) VALUES (?, ?)",
            ["admin", hash]
        );
    }
});

// =========================
// HOME
// =========================
app.get("/", (req, res) => {
    res.send("Server running");
});

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
            if (err) return res.status(400).json({ message: "Email exists" });
            res.json({ message: "User registered" });
        }
    );
});

// =========================
// LOGIN (FIXED)
// =========================
app.post("/login", (req, res) => {

    const { email, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        async (err, user) => {

            if (err) return res.status(500).json({ message: "Server error" });

            if (!user) {
                return res.status(401).json({ message: "Invalid login" });
            }

            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.status(401).json({ message: "Invalid login" });
            }

            res.json({
                name: user.name,
                email: user.email
            });
        }
    );
});

// =========================
// BOOKING
// =========================
app.post("/book", (req, res) => {

    const { name, email, service, bookingDate, bookingTime } = req.body;

    // =========================
    // 1. CHECK IF TIME SLOT IS TAKEN
    // =========================
    db.get(
        "SELECT * FROM bookings WHERE bookingDate = ? AND bookingTime = ?",
        [bookingDate, bookingTime],
        (err, existing) => {

            if (err) return res.status(500).send("Server error");

            if (existing) {
                return res.status(400).send("❌ Time slot not available");
            }

            // =========================
            // 2. SAVE BOOKING
            // =========================
            db.run(
                "INSERT INTO bookings (name, email, service, bookingDate, bookingTime) VALUES (?, ?, ?, ?, ?)",
                [name, email, service, bookingDate, bookingTime],
                (err) => {

                    if (err) return res.status(500).send("Booking failed");

                    // =========================
                    // 🧑 ADMIN EMAIL
                    // =========================
                    const adminMail = {
                        from: "lufunomuleya23@gmail.com",
                        to: "lufunomuleya23@gmail.com",
                        subject: "📅 New Booking Received",
                        text: `
A new booking has been made:

Client Email: ${email}
Service: ${service}
Date: ${bookingDate}
Time: ${bookingTime}

Action Required:
Create a Zoom meeting manually and send the link to the client.
                        `
                    };

                    transporter.sendMail(adminMail, (err) => {
                        if (err) console.log("Admin email failed:", err);
                    });

                    // =========================
                    // 👤 USER EMAIL (PROFESSIONAL)
                    // =========================
                    const userMail = {
                        from: "lufunomuleya23@gmail.com",
                        to: email,
                        subject: "✅ Booking Confirmed - GoldWeb Studio",
                        text: `
Hello,

Thank you for booking a consultation with GoldWeb Studio.

We are pleased to confirm that your booking has been successfully received.

--------------------------------------------------
BOOKING DETAILS
--------------------------------------------------
Service: ${service}
Date: ${bookingDate}
Time: ${bookingTime}
--------------------------------------------------

WHAT HAPPENS NEXT
--------------------------------------------------
• Your booking will be reviewed shortly.
• A Zoom meeting link will be sent to you before your session.
• Please ensure you are available at the scheduled time.

IMPORTANT
--------------------------------------------------
If you do not see our emails, please check your Spam or Junk folder and mark us as safe.

We appreciate your trust in GoldWeb Studio.

Kind regards,  
GoldWeb Studio Team
Web Design & Development
`
                    };

                    transporter.sendMail(userMail, (err) => {
                        if (err) {
                            console.log("User email failed:", err);
                            return res.send("Booking saved but email failed");
                        }

                        res.send("Booking successful + emails sent");
                    });

                }
            );

        }
    );
});

// Get latest booking
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
// ADMIN LOGIN
// =========================
app.post("/admin/login", (req, res) => {

    const { username, password } = req.body;

    db.get(
        "SELECT * FROM admin WHERE username = ?",
        [username],
        async (err, admin) => {

            if (!admin) return res.status(401).json({ message: "Invalid admin" });

            const match = await bcrypt.compare(password, admin.password);

            if (!match) return res.status(401).json({ message: "Invalid admin" });

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
// ADMIN MIDDLEWARE
// =========================
function verifyAdmin(req, res, next) {

    const token = req.headers.authorization;

    if (!token) return res.status(401).send("No token");

    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(403).send("Invalid token");
    }
}

app.post("/admin/update-booking", verifyAdmin, (req, res) => {

    const { id, status, adminNotes } = req.body;

    db.run(
        "UPDATE bookings SET status = ?, adminNotes = ? WHERE id = ?",
        [status, adminNotes, id],
        (err) => {
            if (err) return res.status(500).send("Update failed");
            res.send("Updated");
        }
    );
});

// =========================
// ADMIN ROUTES
// =========================
app.get("/admin/users", verifyAdmin, (req, res) => {
    db.all("SELECT id, name, email FROM users", [], (err, rows) => {
        if (err) return res.status(500).send("Server error");
        res.json(rows);
    });
});

app.get("/admin/bookings", verifyAdmin, (req, res) => {
    db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).send("Server error");
        res.json(rows);
    });
});

app.get("/admin/messages", verifyAdmin, (req, res) => {
    db.all("SELECT * FROM messages ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).send("Server error");
        res.json(rows);
    });
});

// =========================
// MESSAGE + EMAIL
// =========================
app.post("/message", (req, res) => {

    const { name, email, message } = req.body;

    db.run(
        "INSERT INTO messages (name, email, message) VALUES (?, ?, ?)",
        [name, email, message]
    );

    const mailOptions = {
        from: "YOUR_EMAIL@gmail.com",
        to: "lufunomuleya23@gmail.com",
        subject: `New Message from ${name}`,
        text: `${name} (${email}):\n\n${message}`
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) return res.status(500).send("Saved but email failed");
        res.send("Message sent");
    });
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
    console.log(`Running on port ${PORT}`);
});

app.post("/forgot-password", (req, res) => {

    const { email } = req.body;

    const token = Math.random().toString(36).substring(2) + Date.now();
    const expires = Date.now() + 1000 * 60 * 15; // 15 minutes

    db.run(
        "UPDATE users SET resetToken = ?, resetExpires = ? WHERE email = ?",
        [token, expires, email],
        function(err) {

            if (err) {
    console.log("RESET PASSWORD DB ERROR:", err.message);
    return res.status(500).send("Database error");
}

            if (this.changes === 0) {
                return res.status(404).send("Email not found");
            }

            const link = `https://ce0-2.onrender.com/reset-password.html?token=${token}`;

            const mailOptions = {
                from: "lufunomuleya23@gmail.com",
                to: email,
                subject: "Password Reset",
                text: `Click this link to reset your password: ${link}`
            };

            transporter.sendMail(mailOptions, (err) => {
                if (err) return res.status(500).send("Email failed");

                res.send("Reset link sent to email");
            });
        }
    );
});

app.post("/reset-password", (req, res) => {

    const { token, newPassword } = req.body;

    db.get(
        "SELECT * FROM users WHERE resetToken = ? AND resetExpires > ?",
        [token, Date.now()],
        (err, user) => {

            if (err || !user) {
                return res.status(400).send("Invalid or expired token");
            }

            db.run(
                "UPDATE users SET password = ?, resetToken = NULL, resetExpires = NULL WHERE id = ?",
                [newPassword, user.id],
                (err) => {

                    if (err) return res.status(500).send("Error updating password");

                    res.send("Password updated successfully");
                }
            );
        }
    );
});
