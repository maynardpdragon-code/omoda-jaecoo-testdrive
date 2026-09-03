// backend/routes/registrations.js
const express = require('express');
const router  = express.Router();
const { getDB } = require('../db');

function mapReg(r) {
    return { id:r.id, ticketNumber:r.ticket_number, name:r.name, address:r.address,
             contact:r.contact, dealer:r.dealer, scName:r.sc_name, carId:r.car_id, carDisplay:r.car_display,
             status:r.status, timestamp:r.timestamp, date:r.date, time:r.time };
}

router.get('/', async (req, res) => {
    try {
        const db = await getDB();
        const { carId, status } = req.query;
        let sql = 'SELECT * FROM registrations WHERE 1=1';
        const args = [];
        if (carId)  { sql += ' AND car_id = ?'; args.push(carId); }
        if (status) { sql += ' AND status  = ?'; args.push(status); }
        sql += ' ORDER BY timestamp ASC';
        res.json(db.all(sql, ...args).map(mapReg));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const db  = await getDB();
        const row = db.get('SELECT * FROM registrations WHERE id = ?', req.params.id);
        if (!row) return res.status(404).json({ error: 'Registration not found' });
        res.json(mapReg(row));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
    try {
        const db = await getDB();
        const { name, address, contact, dealer = '', scName = '', carId } = req.body;
        if (!name?.trim() || !address?.trim() || !contact?.trim() || !carId)
            return res.status(400).json({ error: 'Name, address, contact, and carId are required.' });
        if (!/^09\d{9}$/.test(contact.trim()))
            return res.status(400).json({ error: 'Contact must be an 11-digit PH mobile number (e.g. 09171234567).' });
        const car = db.get('SELECT * FROM cars WHERE id = ?', carId);
        if (!car) return res.status(404).json({ error: 'Car not found.' });

        let newReg;
        db.transaction(() => {
            db.run('UPDATE ticket_counters SET counter = counter + 1 WHERE car_id = ?', carId);
            const counter = db.get('SELECT counter FROM ticket_counters WHERE car_id = ?', carId).counter;
            const prefix  = car.model.split(' ').map(w => w[0]).join('').toUpperCase().substring(0,2) || 'TK';
            const ticketNumber = `${prefix}-${String(counter).padStart(3,'0')}`;
            const now = new Date();
            const carDisplay = `${car.model}${car.plate ? ` (${car.plate})` : ''}`;
            // Format explicitly in Philippine time (UTC+8) so the ticket shows the
            // correct local time no matter what timezone the server itself runs in
            // (Render's containers default to UTC, which was causing the mismatch).
            const phDate = now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
            const phTime = now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' });
            db.run(`INSERT INTO registrations (ticket_number,name,address,contact,dealer,sc_name,car_id,car_display,status,timestamp,date,time)
                    VALUES (?,?,?,?,?,?,?,?,'waiting',?,?,?)`,
                ticketNumber, name.trim(), address.trim(), contact.trim(),
                dealer.trim(), scName.trim(),
                carId, carDisplay, now.getTime(),
                phDate, phTime);
            const id = db.lastInsertRowid();
            newReg = db.get('SELECT * FROM registrations WHERE id = ?', id);
        });
        res.status(201).json(mapReg(newReg));
    } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const db  = await getDB();
        const reg = db.get('SELECT * FROM registrations WHERE id = ?', req.params.id);
        if (!reg) return res.status(404).json({ error: 'Registration not found' });
        db.transaction(() => {
            if (reg.status === 'serving')
                db.run('UPDATE car_status SET current_serving_id = NULL, available = 1 WHERE car_id = ? AND current_serving_id = ?', reg.car_id, reg.id);
            db.run('DELETE FROM registrations WHERE id = ?', reg.id);
        });
        res.json({ success: true });
    } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
