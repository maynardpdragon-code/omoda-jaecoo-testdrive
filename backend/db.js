// backend/db.js
// SQLite via sql.js (pure JavaScript — no native build required)
// The database is persisted to disk as queue.db on every write.

const fs        = require('fs');
const path      = require('path');
const initSqlJs = require('sql.js');

// On Render, set DB_PATH to a file inside your attached Disk's mount path
// (e.g. /var/data/queue.db) so the database survives restarts/redeploys —
// the default below is only safe for local dev, since Render's filesystem
// is otherwise wiped on every restart.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'queue.db');

let _db = null;
let _ready = false;
let _initPromise = null;
let _inTransaction = false;

// ── Core Helpers ─────────────────────────────────────────────────────────────

function persist() {
    if (_inTransaction) return; // defer until commit
    const data = _db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function rowToObj(columns, values) {
    const obj = {};
    columns.forEach((col, i) => { obj[col] = values[i]; });
    return obj;
}

// ── Public API ───────────────────────────────────────────────────────────────

function run(sql, ...params) {
    _db.run(sql, params.flat());

    // Immediately capture last inserted row id
    let id;
    try {
        const res = _db.exec('SELECT last_insert_rowid() AS id');
        id = res[0]?.values[0]?.[0];
    } catch {
        id = undefined;
    }

    persist();
    return id;
}

function get(sql, ...params) {
    const res = _db.exec(sql, params.flat());
    if (!res.length || !res[0].values.length) return undefined;
    return rowToObj(res[0].columns, res[0].values[0]);
}

function all(sql, ...params) {
    const res = _db.exec(sql, params.flat());
    if (!res.length) return [];
    return res[0].values.map(row => rowToObj(res[0].columns, row));
}

function exec(sql) {
    _db.run(sql);
    persist();
}

// ✅ REAL transaction support
function transaction(fn) {
    _db.run('BEGIN');
    _inTransaction = true;

    try {
        fn();
        _db.run('COMMIT');
    } catch (err) {
        _db.run('ROLLBACK');
        throw err;
    } finally {
        _inTransaction = false;
        persist(); // single write at end
    }
}

// (Optional) keep for compatibility, but no longer needed
function lastInsertRowid() {
    const res = _db.exec('SELECT last_insert_rowid() AS id');
    return res[0]?.values[0]?.[0];
}

// ── Init ─────────────────────────────────────────────────────────────────────

function getDB() {
    if (_ready) {
        return Promise.resolve({ run, get, all, exec, transaction, lastInsertRowid });
    }

    if (_initPromise) return _initPromise;

    _initPromise = initSqlJs().then(SQL => {
        _db = fs.existsSync(DB_PATH)
            ? new SQL.Database(fs.readFileSync(DB_PATH))
            : new SQL.Database();

        // ── Tables ────────────────────────────────────────────────────────────

        _db.run(`CREATE TABLE IF NOT EXISTS cars (
            id TEXT PRIMARY KEY,
            model TEXT NOT NULL,
            plate TEXT DEFAULT '',
            icon TEXT DEFAULT '🚗',
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )`);

        _db.run(`CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_number TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            address TEXT NOT NULL,
            contact TEXT NOT NULL,
            dealer TEXT NOT NULL DEFAULT '',
            sc_name TEXT NOT NULL DEFAULT '',
            car_id TEXT NOT NULL,
            car_display TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'waiting',
            timestamp INTEGER NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL
        )`);

        // Migrate existing databases created before dealer/sc_name existed.
        const regColumns = _db.exec('PRAGMA table_info(registrations)')[0]?.values.map(v => v[1]) || [];
        if (!regColumns.includes('dealer'))  _db.run(`ALTER TABLE registrations ADD COLUMN dealer TEXT NOT NULL DEFAULT ''`);
        if (!regColumns.includes('sc_name')) _db.run(`ALTER TABLE registrations ADD COLUMN sc_name TEXT NOT NULL DEFAULT ''`);

        _db.run(`CREATE TABLE IF NOT EXISTS car_status (
            car_id TEXT PRIMARY KEY,
            available INTEGER NOT NULL DEFAULT 1,
            current_serving_id INTEGER,
            calling INTEGER NOT NULL DEFAULT 0
        )`);

        _db.run(`CREATE TABLE IF NOT EXISTS ticket_counters (
            car_id TEXT PRIMARY KEY,
            counter INTEGER NOT NULL DEFAULT 0
        )`);

        // ── Seed Defaults ─────────────────────────────────────────────────────

        const count = _db.exec('SELECT COUNT(*) AS n FROM cars')[0].values[0][0];

        if (count === 0) {
            const defaults = [
                { id: 'OMODA_C5',    model: 'OMODA C5',    plate: '', icon: '🚙' },
                { id: 'OMODA_E5',    model: 'OMODA E5',    plate: '', icon: '🚙' },
                { id: 'JAECOO_J5',   model: 'JAECOO J5',   plate: '', icon: '🚗' },
                { id: 'JAECOO_J5EV', model: 'JAECOO J5 EV', plate: '', icon: '🚗' },
                { id: 'JAECOO_EJ6',  model: 'JAECOO EJ6',  plate: '', icon: '🚙' },
                { id: 'JAECOO_J7SHS',model: 'JAECOO J7 SHS', plate: '', icon: '🚙' },
            ];

            for (const c of defaults) {
                _db.run(
                    'INSERT INTO cars (id, model, plate, icon) VALUES (?, ?, ?, ?)',
                    [c.id, c.model, c.plate, c.icon]
                );

                _db.run('INSERT INTO car_status (car_id) VALUES (?)', [c.id]);
                _db.run('INSERT INTO ticket_counters (car_id) VALUES (?)', [c.id]);
            }

            console.log('✅ Seeded default cars.');
        }

        persist();

        _ready = true;
        console.log('✅ SQLite ready at', DB_PATH);

        return { run, get, all, exec, transaction, lastInsertRowid };
    });

    return _initPromise;
}

module.exports = { getDB };