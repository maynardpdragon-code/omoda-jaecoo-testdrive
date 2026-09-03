// backend/sms.js
// Sends ticket-called SMS notifications through a Traccar SMS Gateway endpoint
// (https://github.com/traccar/traccar-sms-gateway — an Android app that turns a
// phone with a SIM into a simple HTTP-triggered SMS sender).
//
// Two ways to point this at a gateway, both use the same request shape:
//
//   1. Traccar's cloud relay (recommended for a cloud-hosted backend like Render):
//        TRACCAR_SMS_URL   = https://www.traccar.org/sms/
//        TRACCAR_SMS_TOKEN = the "Cloud" key shown in the app's Cloud tab
//      Render's servers never need to reach your phone directly — Traccar's
//      relay forwards the request to the app over push notification.
//
//   2. The app's own local HTTP API (only reachable if the backend and the
//      phone are on the same network, or the phone is tunneled/port-forwarded):
//        TRACCAR_SMS_URL   = http://<phone-local-ip>:8082/
//        TRACCAR_SMS_TOKEN = the "Local" key shown in the app's Local tab
//
// See the deployment guide for how to obtain each key. SMS is fully optional —
// with TRACCAR_SMS_ENABLED unset (or not "true"), call-next simply skips it.

const ENABLED      = String(process.env.TRACCAR_SMS_ENABLED || '').toLowerCase() === 'true';
const GATEWAY_URL   = process.env.TRACCAR_SMS_URL || 'https://www.traccar.org/sms/';
const GATEWAY_TOKEN = process.env.TRACCAR_SMS_TOKEN || '';
const COUNTRY_CODE  = process.env.TRACCAR_SMS_COUNTRY_CODE || '+63';
const SIM_SLOT      = process.env.TRACCAR_SMS_SIM_SLOT; // optional: "0" or "1" for dual-SIM phones
const TIMEOUT_MS    = 10000;

/**
 * Converts a local PH mobile number (e.g. "09171234567", the format enforced
 * by routes/registrations.js) into international format ("+639171234567") —
 * the format Android's SmsManager (used internally by the gateway app) expects
 * most reliably regardless of the phone's own region settings.
 */
function toInternational(localNumber) {
    const digits = String(localNumber || '').trim();
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('0'))  return COUNTRY_CODE + digits.slice(1);
    return COUNTRY_CODE + digits;
}

/**
 * Sends one SMS via the configured Traccar SMS Gateway endpoint.
 * Never throws — always resolves to a status object so a flaky gateway or a
 * missing config can never break the queue-calling flow that triggers it.
 *
 * @returns {Promise<{sent: boolean, skipped: boolean, reason?: string}>}
 */
async function sendSms(toNumber, message) {
    if (!ENABLED) {
        return { sent: false, skipped: true, reason: 'SMS notifications are turned off (TRACCAR_SMS_ENABLED is not "true").' };
    }
    if (!GATEWAY_TOKEN) {
        return { sent: false, skipped: true, reason: 'TRACCAR_SMS_TOKEN is not set.' };
    }

    const payload = { to: toInternational(toNumber), message };
    if (SIM_SLOT !== undefined && SIM_SLOT !== '') payload.slot = Number(SIM_SLOT);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': GATEWAY_TOKEN,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            return {
                sent: false,
                skipped: false,
                reason: `Gateway responded ${response.status}${body ? ': ' + body.slice(0, 200) : ''}`,
            };
        }
        return { sent: true, skipped: false };
    } catch (err) {
        clearTimeout(timer);
        const reason = err.name === 'AbortError'
            ? 'Timed out waiting for the SMS gateway.'
            : (err.message || 'Unknown error contacting the SMS gateway.');
        return { sent: false, skipped: false, reason };
    }
}

module.exports = { sendSms, toInternational };
