// frontend/js/auth.js
// Access control. Display and Register are open to everyone — no sign-in.
// Only the Admin dashboard is protected by a username/password.
//
//   guest    - default for every visitor: Display, Register, My Ticket (+ an Admin button that asks for sign-in)
//   admin    - after signing in: every tab including the Admin dashboard
//   display  - kiosk mode, open  /?mode=display   -> Display only (TV/projector)
//   register - kiosk mode, open  /?mode=register  -> Register only (auto-prints ticket)
//
// Only the admin session is cached in localStorage, so the admin stays signed in across refreshes.

let currentRole = null;

const ROLE_PAGES = {
    admin:    ['display', 'register', 'ticket', 'admin'],
    guest:    ['display', 'register', 'ticket', 'admin'],
    display:  ['display'],
    register: ['register'],
};
const ROLE_DEFAULT_PAGE = { admin: 'admin', guest: 'register', display: 'display', register: 'register' };

function applyRole(role) {
    currentRole = role;
    if (role === 'admin') localStorage.setItem('authRole', 'admin');

    document.getElementById('page-login').classList.remove('active');
    document.getElementById('main-nav').style.display = 'flex';

    const allowed = ROLE_PAGES[role] || [];
    ['display', 'register', 'ticket', 'admin'].forEach(p => {
        document.getElementById(`nav-${p}`).style.display = allowed.includes(p) ? '' : 'none';
    });
    // Single-page kiosk modes have nothing to switch between, so hide the nav row.
    document.getElementById('nav-links').style.display = allowed.length > 1 ? '' : 'none';
    // Only an admin session has anything to log out of.
    document.getElementById('nav-logout').style.display = role === 'admin' ? '' : 'none';

    if (typeof startApp === 'function') startApp();
    showPage(ROLE_DEFAULT_PAGE[role] || allowed[0]);
}

// Admin tab: straight in if already signed in, otherwise show the sign-in form.
function openAdmin() {
    if (currentRole === 'admin') return showPage('admin');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-admin').classList.add('active');
    document.getElementById('page-login').classList.add('active');
}

function logout() {
    localStorage.removeItem('authRole');
    document.getElementById('auth-login-form').reset();
    applyRole('guest');
}

document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    try {
        await AuthAPI.login({ username, password });
        applyRole('admin');
        document.getElementById('auth-login-form').reset();
        showNotification('Login successful!');
    } catch (err) {
        // Only a real 401 means wrong credentials; anything else is a connection problem.
        showNotification(
            err.message === 'Invalid credentials'
                ? 'Invalid credentials'
                : 'Could not reach the server. Make sure the backend is running.',
            'error'
        );
    }
});

// Pick the starting role: kiosk URL mode > cached admin session > open guest access.
(function init() {
    const mode = new URLSearchParams(location.search).get('mode');
    if (mode === 'display' || mode === 'register') return applyRole(mode);
    applyRole(localStorage.getItem('authRole') === 'admin' ? 'admin' : 'guest');
})();
