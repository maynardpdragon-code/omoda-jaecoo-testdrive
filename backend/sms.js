// backend/sms.js
// Sends ticket-called SMS notifications through the Semaphore SMS API
// (https://semaphore.co/ — a Philippine SMS gateway, no phone/SIM needed).
//
// Setup:
//   1. Create an account at https://semaphore.co/ and load it with credits
//      (each SMS costs 1 credit).
//   2. Grab your API key from the Semaphore dashboard.
//   3. Set these environment variables on the server:
//        SEMAPHORE_SMS_ENABLED = true
//        SEMAPHORE_API_KEY     = <your API key>
//        SEMAPHORE_SENDER_NAME = <optional — a registered sender name; if
//                                 omitted, Semaphore uses your account's
//                                 default sender name>
//
// SMS is fully optional — with SEMAPHORE_SMS_ENABLED unset (or not "true"),
// call-next simply skips it.
//
// API docs: https://www.semaphore.co/docs

const ENABLED     = String(process.env.SEMAPHORE_SMS_ENABLED || '').toLowerCase() === 'true';
const API_KEY      = process.env.SEMAPHORE_API_KEY || '';
const SENDER_NAME  = process.env.SEMAPHORE_SENDER_NAME || '';
const API_URL       = 'https://api.semaphore.co/api/v4/messages';
const TIMEOUT_MS    = 10000;

/**
 * Sends one SMS via the Semaphore API. Semaphore accepts PH mobile numbers
 * in local format (e.g. "09171234567"), which is exactly the format enforced
 * by routes/registrations.js — no conversion needed.
 *
 * Never throws — always resolves to a status object so a flaky gateway, an
 * out-of-credits account, or a missing config can never break the
 * queue-calling flow that triggers it.
 *
 * @returns {Promise<{sent: boolean, skipped: boolean, reason?: string}>}
 */
async function sendSms(toNumber, message) {
    if (!ENABLED) {
        return { sent: false, skipped: true, reason: 'SMS notifications are turned off (SEMAPHORE_SMS_ENABLED is not "true").' };
    }
    if (!API_KEY) {
        return { sent: false, skipped: true, reason: 'SEMAPHORE_API_KEY is not set.' };
    }

    const params = new URLSearchParams({
        apikey: API_KEY,
        number: String(toNumber || '').trim(),
        message,
    });
    if (SENDER_NAME) params.set('sendername', SENDER_NAME);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
            signal: controller.signal,
        });
        clearTimeout(timer);

        const body = await response.json().catch(() => null);

        if (!response.ok) {
            const reason = body?.message || (body ? JSON.stringify(body).slice(0, 200) : '');
            return { sent: false, skipped: false, reason: `Semaphore responded ${response.status}${reason ? ': ' + reason : ''}` };
        }

        // Semaphore returns an array with one entry per recipient; a failed
        // send still comes back with HTTP 200 but an error message instead
        // of an array, so check the shape before declaring success.
        if (!Array.isArray(body) || !body[0]?.message_id) {
            const reason = body?.message || (body ? JSON.stringify(body).slice(0, 200) : 'Unexpected response from Semaphore.');
            return { sent: false, skipped: false, reason };
        }

        return { sent: true, skipped: false };
    } catch (err) {
        clearTimeout(timer);
        const reason = err.name === 'AbortError'
            ? 'Timed out waiting for Semaphore.'
            : (err.message || 'Unknown error contacting Semaphore.');
        return { sent: false, skipped: false, reason };
    }
}

module.exports = { sendSms };
