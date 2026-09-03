// frontend/js/app.js
// Bootstrap: init, registration form, polling
// Nothing here runs until auth.js calls startApp() after a successful login
// (or a restored session), since none of it is useful pre-login.

let appStarted = false;

async function startApp() {
    if (appStarted) return;
    appStarted = true;

    await renderRegistrationCars();
    await renderDisplayCards();
    checkCurrentTicket();

    // Polling (every 4 s) — keeps the Display and Ticket pages live without a WebSocket
    setInterval(() => {
        if (document.getElementById('page-display').classList.contains('active')) {
            renderDisplayCards();
        }
        if (document.getElementById('page-ticket').classList.contains('active')) {
            checkCurrentTicket();
        }
    }, 4000);
}

// ── Registration Form ─────────────────────────────────────────────────────────
document.getElementById('registration-form').addEventListener('submit', async function (e) {
    e.preventDefault();

    const name    = document.getElementById('reg-name').value.trim();
    const address = document.getElementById('reg-address').value.trim();
    const contact = document.getElementById('reg-contact').value.trim();
    const dealer  = document.getElementById('reg-dealer').value.trim();
    const scName  = document.getElementById('reg-scname').value.trim();
    const carInput = document.querySelector('input[name="car"]:checked');

    if (!carInput) return showNotification('Please select a car model', 'error');

    try {
        const reg = await RegistrationsAPI.create({ name, address, contact, dealer, scName, carId: carInput.value });
        localStorage.setItem('currentTicketId', reg.id);

        this.reset();
        document.querySelectorAll('.car-option').forEach(opt => opt.classList.remove('selected'));
        renderDisplayCards();

        if (currentRole === 'register') {
            // Kiosk flow: print immediately, then reset for the next person
            // in line — no manual "My Ticket" step, like a bank queue kiosk.
            printKioskTicket();
        } else {
            showNotification('Registration successful! Redirecting to your ticket…');
            setTimeout(() => showPage('ticket'), 1500);
            if (currentRole === 'admin') {
                updateResponseTable();
                renderCalloutDashboard();
            }
        }
    } catch (err) {
        showNotification(err.message, 'error');
    }
});

// ── Kiosk auto-print (Register role) ─────────────────────────────────────────
// Reuses the "My Ticket" page's printable ticket markup: fills it in, briefly
// switches to it so it's actually rendered (print styles need a laid-out
// element, not display:none), prints, then returns to the register page.
async function printKioskTicket() {
    await checkCurrentTicket();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-ticket').classList.add('active');

    // `handled` guards against running twice — afterprint can fire
    // synchronously inside window.print() itself (before resetTimer would
    // even be assigned), so clearTimeout() alone can't be trusted to
    // prevent the fallback from also firing later.
    let handled = false;
    let resetTimer;
    const resetToKiosk = () => {
        if (handled) return;
        handled = true;
        window.removeEventListener('afterprint', resetToKiosk);
        clearTimeout(resetTimer);
        localStorage.removeItem('currentTicketId');
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-register').classList.add('active');
        showNotification('Ticket printed! Ready for the next guest.');
    };
    window.addEventListener('afterprint', resetToKiosk);
    // Fallback in case the browser doesn't fire afterprint (some kiosk/webview setups don't)
    resetTimer = setTimeout(resetToKiosk, 8000);

    window.print();
}
