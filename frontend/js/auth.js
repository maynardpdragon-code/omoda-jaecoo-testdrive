// frontend/js/auth.js
// Site-wide login gate. One login endpoint, three possible roles — which
// credentials were entered decides what the visitor can see:
//   admin    - every tab (Display, Register, My Ticket, Admin dashboard)
//   display  - only the Display tab, for a TV/projector
//   register - only the Register tab, for a self-service kiosk
// The role is cached in localStorage so a kiosk device (TV, tablet) stays
// logged in across refreshes/restarts instead of needing re-entry each time.

let currentRole = null;

const ROLE_PAGES = {
    admin:    ['display', 'register', 'ticket', 'admin'],
    display:  ['display'],
    register: ['register'],
};
const ROLE_DEFAULT_PAGE = { admin: 'admin', display: 'display', register: 'register' };

function applyRole(role) {
    currentRole = role;
    localStorage.setItem('authRole', role);

    document.getElementById('page-login').classList.remove('active');
    document.getElementById('main-nav').style.display = 'flex';

    const allowed = ROLE_PAGES[role] || [];
    ['display', 'register', 'ticket', 'admin'].forEach(p => {
        document.getElementById(`nav-${p}`).style.display = allowed.includes(p) ? '' : 'none';
    });
    // Single-page roles (Display/Register kiosks) have nothing to switch
    // between, so the nav links row would just be one pointless button —
    // hide the whole row for a cleaner kiosk/TV look.
    document.getElementById('nav-links').style.display = allowed.length > 1 ? '' : 'none';

    if (typeof startApp === 'function') startApp();
    showPage(ROLE_DEFAULT_PAGE[role] || allowed[0]);
}

function logout() {
    currentRole = null;
    localStorage.removeItem('authRole');
    localStorage.removeItem('currentTicketId');

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-login').classList.add('active');
    document.getElementById('main-nav').style.display = 'none';
    document.getElementById('auth-login-form').reset();
}

document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('auth-username').value;
    const password = document.getElementById('auth-password').value;
    try {
        const result = await AuthAPI.login({ username, password });
        applyRole(result.role);
        showNotification('Login successful!');
    } catch {
        showNotification('Invalid credentials', 'error');
    }
});

// Restore a cached role on load, so kiosk devices skip the login screen.
(function restoreSession() {
    const savedRole = localStorage.getItem('authRole');
    if (savedRole && ROLE_PAGES[savedRole]) applyRole(savedRole);
})();
