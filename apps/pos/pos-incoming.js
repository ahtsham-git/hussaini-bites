/* POS "Incoming" tab: shows orders placed in the customer app for this branch, live.
   Cashier signs in with username + password (created by the manager).
   Status moves forward only, and the database enforces that. Each change goes through
   the offline outbox, so it is kept on the device and sent when internet returns. */
(function () {
  const BRANCH = (window.HB_CONFIG && window.HB_CONFIG.branch) || 'darman';
  const NEXT = {               // what a cashier may do next, per current status
    pending:   [['accepted', 'Accept'], ['rejected', 'Reject']],
    accepted:  [['preparing', 'Preparing']],
    preparing: [['ready', 'Ready']],
    ready:     [['picked_up', 'Picked up'], ['delivered', 'Delivered']],
  };
  const ACTIVE = ['pending', 'accepted', 'preparing', 'ready', 'picked_up'];
  const box = () => document.getElementById('v-inc');

  /* Turns an app order into the bill shape the POS receipt already prints.
     Items from the app already include the size in their name, so no separate size line is shown. */
  function toBill(o) {
    const c = o.customer || {};
    return {
      no: 'APP-' + o.id,
      ts: new Date(o.created_at).getTime(),
      type: o.type === 'delivery' ? 'Delivery' : 'Takeaway',
      cn: c.name || '', cph: c.phone || '', cad: c.address || '', note: o.note || '',
      lines: (o.items || []).map((i) => ({ n: String(i.name || ''), vl: '', p: Number(i.price) || 0, q: Number(i.qty) || 1 })),
      sub: Number(o.subtotal) || 0, disc: 0, dl: Number(o.delivery_fee) || 0, tax: 0, tp: 0, dv: 0,
      tot: Number(o.total) || 0,
    };
  }
  let orders = [];
  let live = false;

  // Username -> hidden login email. Staff never see the email.
  const emailFor = (u) => String(u).trim().toLowerCase() + '@staff.hb.local';

  const outbox = HB.outbox('incoming', async (job) => {          // job: {id, status}
    const c = await HB.sb();                       // RLS: staff of this branch only; trigger: forward moves only
    const { error } = await c.from('orders').update({ status: job.status }).eq('id', job.id);
    if (error) throw HB.fail(error);
  });

  async function load() {
    const c = await HB.sb();
    const { data, error } = await c.from('orders').select('*')
      .eq('branch', BRANCH).in('status', ACTIVE).order('created_at', { ascending: true });
    if (error) { show(`<p class="err">Could not load orders: ${HB.esc(error.message)}</p>`); return; }
    orders = data || [];
    render();
  }

  function render() {
    const rows = orders.map((o) => {
      const items = (o.items || []).map((i) => `${HB.esc(i.qty)} × ${HB.esc(i.name)}${i.size ? ' (' + HB.esc(i.size) + ')' : ''}`).join('<br>');
      const acts = (NEXT[o.status] || []).map(([s, label]) =>
        `<button class="btn" data-id="${HB.esc(o.id)}" data-status="${s}">${label}</button>`).join(' ');
      return `<article class="ord">
        <header><strong>#${HB.esc(o.id)}</strong> · ${HB.esc(o.type)} · <span class="st">${HB.esc(o.status)}</span></header>
        <div>${HB.esc(o.customer && o.customer.name || '')} ${HB.esc(o.customer && o.customer.phone || '')}</div>
        ${o.type === 'delivery' ? `<div>${HB.esc(o.customer && o.customer.address || '')}</div>` : ''}
        <div class="items">${items}</div>
        ${o.note ? `<div class="note">${HB.esc(o.note)}</div>` : ''}
        <footer>${HB.money(o.total)} · ${HB.esc(o.payment_method)} <button class="btn" data-print="${HB.esc(o.id)}">Print bill</button> ${acts}</footer>
      </article>`;
    }).join('');
    show(rows || '<p>No incoming orders.</p>');
  }

  function show(html) {
    const b = box();
    if (b) b.querySelector('.inc-list').innerHTML = html;
  }

  function loginView() {
    box().querySelector('.inc-list').innerHTML = `
      <form class="inc-login" autocomplete="on">
        <input name="u" placeholder="Username" autocapitalize="off" required>
        <input name="p" type="password" placeholder="Password" required>
        <button class="btn d" type="submit">Sign in</button>
        <p class="err" id="inc-err"></p>
      </form>`;
    box().querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await HB.signIn(emailFor(f.u.value), f.p.value);
        boot();
      } catch (err) {
        document.getElementById('inc-err').textContent = err.message;
      }
    };
  }

  /* Warning bar on the whole POS: counter sales only reach the dashboard when a cashier is signed in. */
  function banner(show) {
    let b = document.getElementById('pos-signin');
    if (!show) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement('div');
    b.id = 'pos-signin';
    b.style.cssText = 'background:#fff3cd;color:#664d03;padding:8px 12px;font:14px sans-serif;display:flex;gap:8px;align-items:center';
    b.innerHTML = 'Not signed in: counter sales stay on this device until a cashier signs in. <button type="button" style="margin-left:auto">Sign in</button>';
    b.querySelector('button').onclick = () => { const n = document.querySelector('nav button[data-v="inc"]'); if (n) n.click(); };
    document.body.prepend(b);
  }

  async function boot() {
    const me = await HB.staff();
    banner(!me);
    if (!me) { loginView(); return; }
    if (window.HBPosSync) { HBPosSync.backfill(); HBPosSync.flush(); }   // send counter sales waiting on this device
    await load();
    if (!live) { live = true; HB.rt(['orders'], `branch=eq.${BRANCH}`, load); }   // live updates, once only
  }

  box().addEventListener('click', (e) => {
    const pr = e.target.closest('button[data-print]');
    if (pr) {
      const o = orders.find((x) => String(x.id) === pr.dataset.print);
      if (o && typeof window.preview === 'function') window.preview(toBill(o), false);   // false = print only, not saved as a POS bill
      return;
    }
    const b = e.target.closest('button[data-status]');
    if (!b) return;
    outbox.push({ id: Number(b.dataset.id), status: b.dataset.status });   // kept if offline
    orders = orders.map((o) => (String(o.id) === b.dataset.id ? { ...o, status: b.dataset.status } : o));
    render();
  });

  window.addEventListener('DOMContentLoaded', () => { if (box()) boot(); });
})();
