const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getDB } = require('./db');

const carsRouter          = require('./routes/cars');
const registrationsRouter = require('./routes/registrations');
const queueRouter         = require('./routes/queue');

const app  = express();
const PORT = process.env.PORT || 3000;

// safety logs
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

app.use(cors());
app.use(express.json());

// frontend static
app.use(express.static(path.join(__dirname, '../frontend')));
console.log("Serving frontend from:", path.join(__dirname, '../frontend'));
// API routes
app.use('/api/cars', carsRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/queue', queueRouter);

// auth
// Three roles share one login endpoint, distinguished by which credential
// pair matches. Each role unlocks a different slice of the frontend:
//   admin    - full dashboard + every tab (falls back to admin/Dragonai2026!
//              if unset, matching this app's pre-existing default)
//   display  - the public queue-status screen only (for a TV/projector)
//   register - the self-service registration kiosk only (for a tablet)
// DISPLAY_* / REGISTER_* have no hardcoded fallback: leave them unset to
// keep those roles disabled entirely.
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    const ADMIN_USER = process.env.ADMIN_USER || 'admin';
    const ADMIN_PASS = process.env.ADMIN_PASS || 'Dragonai2026!';
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return res.json({ success: true, role: 'admin' });
    }

    const DISPLAY_USER = process.env.DISPLAY_USER;
    const DISPLAY_PASS = process.env.DISPLAY_PASS;
    if (DISPLAY_USER && DISPLAY_PASS && username === DISPLAY_USER && password === DISPLAY_PASS) {
        return res.json({ success: true, role: 'display' });
    }

    const REGISTER_USER = process.env.REGISTER_USER;
    const REGISTER_PASS = process.env.REGISTER_PASS;
    if (REGISTER_USER && REGISTER_PASS && username === REGISTER_USER && password === REGISTER_PASS) {
        return res.json({ success: true, role: 'register' });
    }

    res.status(401).json({ error: 'Invalid credentials' });
});

// frontend fallback (SAFE VERSION)
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// error handler
app.use((err, req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// start AFTER DB ready
getDB()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`🚗 Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('DB init failed:', err);
        process.exit(1);
    });