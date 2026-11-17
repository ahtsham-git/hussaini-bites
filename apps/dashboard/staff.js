/* Dashboard: Staff. Owner and managers create cashier/rider logins with a username and password,
   reset passwords, and deactivate people. Deactivating keeps all their past sales and orders.
   The secret key is never here: creating/resetting logins goes through the staff-admin server function. */
(function () {
  const host = () => document.getElementById('staff');
  const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', cashier: 'Cashier', rider: 'Rider' };

  async function fnCall(body) {
    const c = await HB.sb();
    const { data: s } = await c.auth.getSession();
    const token = s && s.session && s.session.access_token;
    if (!token) throw Error('Please sign in again');
    const r = await fetch(`${HB.config.supabase.url}/functions/v1/staff-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: HB.config.supabase.anonKey },
      body: JSON.stringify(body),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(out.error || 'Something went wrong');
    return out;
  }

  async function list() {
    const c = await HB.sb();
    const { data, error } = await c.rpc('list_staff');
    if (error) return `<p class="err">${HB.esc(error.message)}</p>`;
    return `<table><tr><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr>
      ${(data || []).map((p) => {
        const username = p.email.replace(/@staff\.hb\.local$/, '');
        const staffLogin = p.email.endsWith('@staff.hb.local');
        const canChange = p.role !== 'owner';
        return `<tr>
          <td>${HB.esc(p.display_name || '')}</td><td>${staffLogin ? HB.esc(username) : HB.esc(p.email)}</td>
          <td>${HB.esc(ROLE_LABEL[p.role] || p.role)}</td><td>${HB.esc(p.branch || 'All')}</td>
          <td>${p.is_active ? 'Active' : 'Off'}</td>
          <td>${canChange ? `
            <button class="btn" data-reset="${HB.esc(p.user_id)}">Reset password</button>
            <button class="btn" data-toggle="${HB.esc(p.user_id)}" data-on="${p.is_active ? '0' : '1'}">${p.is_active ? 'Deactivate' : 'Reactivate'}</button>` : ''}</td>
        </tr>`;
      }).join('')}</table>`;
  }

  async function render(msg = '') {
    const h = host(); if (!h) return;
    h.innerHTML = `
      <form id="st-add" class="exp-form">
        <input name="name" placeholder="Full name" maxlength="60" required>
        <input name="username" placeholder="Username (a-z, 0-9, . _ -)" maxlength="30" required autocapitalize="off">
        <input name="password" type="password" placeholder="Password (min 8)" minlength="8" required>
        <select name="role"><option value="cashier">Cashier</option><option value="rider">Rider</option></select>
        <select name="branch"><option value="darman">Darman</option></select>
        <button class="btn d" type="submit">Create login</button>
        <p class="err" id="st-err">${HB.esc(msg)}</p>
      </form>
      <div id="st-list">${await list()}</div>`;

    document.getElementById('st-add').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try {
        await fnCall({ action: 'create', name: f.name.value, username: f.username.value,
          password: f.password.value, role: f.role.value, branch: f.branch.value });
        render('Login created');
      } catch (err) { document.getElementById('st-err').textContent = err.message; }
    };
    h.onclick = async (e) => {
      const r = e.target.closest('button[data-reset]');
      const t = e.target.closest('button[data-toggle]');
      try {
        if (r) {
          const pw = prompt('New password (at least 8 characters)'); if (!pw) return;
          await fnCall({ action: 'reset_password', user_id: r.dataset.reset, password: pw });
          render('Password changed');
        } else if (t) {
          const c = await HB.sb();
          const { error } = await c.rpc('set_staff_active', { p_user: t.dataset.toggle, p_active: t.dataset.on === '1' });
          if (error) throw Error(error.message);
          render(t.dataset.on === '1' ? 'Reactivated' : 'Deactivated. Their past records are kept.');
        }
      } catch (err) { render(err.message); }
    };
  }

  window.HBStaff = { mount: () => render() };
})();
