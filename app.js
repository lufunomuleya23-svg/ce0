
/* =========================
   MOBILE MENU
========================= */

function toggleMenu() {
    document.getElementById("nav").classList.toggle("active");
}

/* =========================
   REGISTER USER
========================= */

function registerUser() {

    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!username || !email || !password) {
        alert("Please fill all fields");
        return;
    }

    fetch("http://localhost:3000/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            email,
            password
        })
    })
    .then(res => res.json())
    .then(data => {

        if (data.success) {
            alert("Account created successfully");
            window.location.href = "login.html";
        } else {
            alert(data.message);
        }

    })
    .catch(err => {
        alert("Server error");
    });
}

/* =========================
   LOGIN USER
========================= */

function login() {

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!email || !password) {
        alert("Please fill all fields");
        return;
    }

    fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password
        })
    })
    .then(res => res.json())
    .then(data => {

        if (data.success) {

            localStorage.setItem("user", data.username);
            localStorage.setItem("email", data.email);

            window.location.href = "dashboard.html";

        } else {
            alert("Invalid login details");
        }

    })
    .catch(err => {
        alert("Server error");
    });
}

/* =========================
   DASHBOARD LOAD USER
========================= */

window.onload = function () {

    const user = localStorage.getItem("user");

    const welcome = document.getElementById("welcome");

    if (welcome && user) {
        welcome.innerText = "Welcome, " + user + " 👋";
    }

};

/* =========================
   LOGOUT
========================= */

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

/* =========================
   BOOKING SYSTEM
========================= */

function bookSession() {

    const username = localStorage.getItem("user");
    const email = localStorage.getItem("email");

    const service = document.getElementById("service").value;
    const date = document.getElementById("date").value;
    const time = document.getElementById("time").value;
    const description = document.getElementById("description").value;

    if (!service || !date || !time || !description) {
        alert("Please fill all fields");
        return;
    }

    fetch("http://localhost:3000/book", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            email,
            service,
            date,
            time,
            description
        })
    })
    .then(res => res.json())
    .then(data => {

        if (data.success) {
            alert("Booking confirmed ✔ Zoom link will be sent later");
            window.location.reload();
        } else {
            alert(data.message);
        }

    })
    .catch(err => {
        alert("Server error");
    });
}

/* =========================
   LOAD BOOKINGS (ADMIN)
========================= */

function loadBookings() {

    fetch("http://localhost:3000/bookings")
    .then(res => res.json())
    .then(data => {

        const container = document.getElementById("bookings");

        if (!container) return;

        container.innerHTML = "";

        data.forEach(b => {

            container.innerHTML += `
                <div class="card">
                    <h3>${b.username}</h3>
                    <p>${b.service}</p>
                    <p>${b.date} - ${b.time}</p>
                    <p>Status: ${b.status}</p>
                </div>
            `;
        });

    });

}