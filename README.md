# 🚗 OMODA & JAECOO — Test Drive Queue System

A full-stack queue management system with a SQLite database, Node.js/Express REST API, and a clean multi-file frontend — rebuilt in OMODA & JAECOO's monochrome black/white brand theme.

---

## Project Structure

```
testdrive/
├── backend/
│   ├── server.js          # Express entry point
│   ├── db.js              # SQLite init, schema, seed
│   ├── package.json
│   ├── sms.js              # Traccar SMS Gateway integration (server-side only)
│   └── routes/
│       ├── cars.js        # CRUD for vehicles
│       ├── registrations.js  # CRUD for queue entries
│       └── queue.js       # call-next, complete, skip actions
└── frontend/
    ├── index.html         # Clean HTML, no inline JS/CSS
    ├── logo.svg            # OMODA & JAECOO-styled wordmark (vector, editable)
    ├── favicon.svg
    ├── css/
    │   └── style.css      # All styles (OMODA & JAECOO black/white theme)
    └── js/
        ├── api.js         # All fetch() calls (API layer)
        ├── ui.js          # Rendering helpers (display, ticket, modals)
        ├── admin.js       # Admin dashboard, car manager, exports
        └── app.js         # Bootstrap + registration form + polling
```

---

## Setup & Running

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Start the server

```bash
npm start
# or for auto-reload during development:
npm run dev
```

### 3. Open the app

Visit **http://localhost:3000** in your browser.

The database file (`queue.db`) is created automatically in the `backend/` folder on first run, pre-seeded with six OMODA & JAECOO models (OMODA C5, OMODA E5, JAECOO J5, JAECOO J5 EV, JAECOO EJ6, JAECOO J7 SHS). Add, edit, or remove vehicles anytime from **Admin → Manage Vehicles**.

---

## Configuration

### Login roles

The site is gated behind a single sign-in screen. Which credentials you enter decides what you see next — each role is meant for a different device:

| Role | Unlocks | Typical device |
|------|---------|----------------|
| **Admin** | Every tab: Display, Register, My Ticket, Admin dashboard | Staff laptop/phone |
| **Display** | Only the Display tab (live queue status) | TV/projector for public viewing |
| **Register** | Only the Register tab — submitting auto-prints the ticket and resets the form for the next guest, kiosk-style | Tablet for self-service registration |

A device stays signed in across refreshes/restarts (cached in the browser's local storage) — use the Logout button in the corner to switch roles on that device.

**Admin** — default: `admin` / `Dragonai2026!`. **Change this before going live.** Override with environment variables:

```bash
ADMIN_USER=myuser ADMIN_PASS=mypassword npm start
```

**Display** and **Register** have no default — each is disabled until you set both its username and password:

```bash
DISPLAY_USER=tvscreen   DISPLAY_PASS=mypassword
REGISTER_USER=kiosk     REGISTER_PASS=mypassword
```

### SMS notifications (Traccar SMS Gateway)

Ticket-called SMS alerts are sent server-side, from `backend/sms.js`, through the free [Traccar SMS Gateway](https://github.com/traccar/traccar-sms-gateway) Android app — no third-party SMS billing account needed, it sends through a phone's own SIM. Nothing is sent, and no key is ever exposed to the browser, until you turn it on with environment variables:

```bash
TRACCAR_SMS_ENABLED=true
TRACCAR_SMS_URL=https://www.traccar.org/sms/     # or http://<phone-ip>:8082/ for the local API
TRACCAR_SMS_TOKEN=<the Cloud or Local key from the app>
TRACCAR_SMS_COUNTRY_CODE=+63                     # optional, defaults to +63
```

Full walkthrough — installing the app, getting the key, and choosing cloud vs. local mode — is in the deployment guide. Leaving `TRACCAR_SMS_ENABLED` unset runs the app exactly as before, just without SMS.

---

## Branding

The `logo.svg` and `favicon.svg` in `frontend/` are custom vector wordmarks styled after OMODA & JAECOO's black/white identity (not the official OMODA & JAECOO logo asset). Swap them for the official logo file provided by your brand/marketing team when available — just keep the filenames the same, or update the `<img src>` / `<link>` references in `index.html`.

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/cars` | List all cars (with live status) |
| POST   | `/api/cars` | Add a car `{ model, plate }` |
| PUT    | `/api/cars/:id` | Update a car |
| DELETE | `/api/cars/:id` | Delete a car (blocks if queue active) |
| GET    | `/api/registrations` | List all registrations (filter: `?carId=&status=`) |
| GET    | `/api/registrations/:id` | Get one registration |
| POST   | `/api/registrations` | Register `{ name, address, contact, carId }` |
| DELETE | `/api/registrations/:id` | Delete a registration |
| GET    | `/api/queue/:carId` | Get waiting queue for a car |
| POST   | `/api/queue/:carId/call-next` | Call next customer |
| POST   | `/api/queue/:carId/complete` | Complete current service |
| POST   | `/api/queue/:carId/skip` | Skip current customer |
| POST   | `/api/auth/login` | Admin login `{ username, password }` |

---

## Deploying to Render.com

See the accompanying step-by-step deployment guide for full instructions, including the important note about persistent storage for `queue.db` on Render's free tier.

Render's filesystem is ephemeral by default — `queue.db` (and everything in it: cars, registrations, queue state) is wiped on every restart, redeploy, or free-tier spin-down. To persist it, attach a [Render Disk](https://render.com/docs/disks) (requires a paid instance type) mounted at a path outside the app's source folder, e.g. `/var/data`, then set:

```bash
DB_PATH=/var/data/queue.db
```

Leaving `DB_PATH` unset keeps the previous behavior (`backend/queue.db`), which is fine for local dev but not for a Render deploy you want to persist.
