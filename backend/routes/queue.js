// backend/routes/queue.js
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');
const { sendSms } = require('../sms');

function mapReg(r) {
    return { id:r.id, ticketNumber:r.ticket_number, name:r.name, address:r.address,
             contact:r.contact, carId:r.car_id, carDisplay:r.car_display,
             status:r.status, timestamp:r.timestamp, date:r.date, time:r.time };
}

router.get('/:carId', async (req, res) => {
    try {
        const db = await getDB();
        const rows = db.all("SELECT * FROM registrations WHERE car_id = ? AND status = 'waiting' ORDER BY timestamp ASC", req.params.carId);
        res.json(rows.map(mapReg));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:carId/call-next', async (req, res) => {
    try {
        const db    = await getDB();
        const carId = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });

        let nextReg = null;
        db.transaction(() => {
            if (status.current_serving_id)
                db.run("UPDATE registrations SET status = 'completed' WHERE id = ?", status.current_serving_id);
            const next = db.get("SELECT * FROM registrations WHERE car_id = ? AND status = 'waiting' ORDER BY timestamp ASC LIMIT 1", carId);
            if (next) {
                db.run("UPDATE registrations SET status = 'serving' WHERE id = ?", next.id);
                db.run('UPDATE car_status SET current_serving_id = ?, available = 0, calling = 1 WHERE car_id = ?', next.id, carId);
                nextReg = next;
            } else {
                db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
            }
        });

        // Notify the customer by SMS that their ticket is being called. This
        // never blocks or fails the queue transition itself — a gateway that's
        // unreachable or unconfigured just reports back through `sms.reason`.
        let sms = null;
        if (nextReg) {
            const message = `Hi ${nextReg.name}! Your ${nextReg.car_display} is now ready for test drive. Please proceed to the registration area. Thank you!`;
            sms = await sendSms(nextReg.contact, message);
        }

        res.json({ next: nextReg ? mapReg(nextReg) : null, sms });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:carId/complete', async (req, res) => {
    try {
        const db     = await getDB();
        const carId  = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });
        if (!status.current_serving_id) return res.status(400).json({ error: 'No active service' });
        db.transaction(() => {
            db.run("UPDATE registrations SET status = 'completed' WHERE id = ?", status.current_serving_id);
            db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
        });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:carId/skip', async (req, res) => {
    try {
        const db     = await getDB();
        const carId  = req.params.carId;
        const status = db.get('SELECT * FROM car_status WHERE car_id = ?', carId);
        if (!status) return res.status(404).json({ error: 'Car not found' });
        if (!status.current_serving_id) return res.status(400).json({ error: 'No active service' });
        db.transaction(() => {
            const skippedId = status.current_serving_id;
            const skippedReg = db.get('SELECT * FROM registrations WHERE id = ?', skippedId);
            const waiting = db.all("SELECT * FROM registrations WHERE car_id = ? AND status = 'waiting' ORDER BY timestamp ASC", carId);

            // Put the skipped customer back in the queue, one slot behind
            // whoever is now first in line, so they're still called next
            // after that person instead of being dropped entirely.
            const reordered = waiting.length > 0
                ? [waiting[0], skippedReg, ...waiting.slice(1)]
                : [skippedReg];
            const base = reordered[0].timestamp;
            reordered.forEach((r, i) => {
                db.run('UPDATE registrations SET timestamp = ? WHERE id = ?', base + i, r.id);
            });

            db.run("UPDATE registrations SET status = 'waiting' WHERE id = ?", skippedId);
            db.run('UPDATE car_status SET current_serving_id = NULL, available = 1, calling = 0 WHERE car_id = ?', carId);
        });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/:carId/clear-calling', async (req, res) => {
    try {
        const db = await getDB();
        db.run('UPDATE car_status SET calling = 0 WHERE car_id = ?', req.params.carId);
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
