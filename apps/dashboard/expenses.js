/* Dashboard: Expenses. Enter stock purchases and running costs, see each month by category.
   Each entry gets a client_ref so a retry (or an offline resend) can never save it twice. */
(function () {
  const BRANCH = (window.HB_CONFIG && window.HB_CONFIG.branch) || 'darman';
  const CATEGORIES = [
    'Pizza ingredients', 'Burger ingredients', 'Fries & potatoes', 'Chicken & meat',
    'Cheese & dairy', 'Bread & buns', 'Sauces & spices', 'Drinks', 'Oil & cooking',
    'Packaging', 'Gas & fuel', 'Electricity & water', 'Rent', 'Salaries', 'Repairs', 'Other',
  ];
  const MAX_AMOUNT = 100000000;                 // matches the database limit
  const host = () => document.getElementById('expenses');
  const pad = (n) => String(n).padStart(2, '0');
  const monthStart = (ym) => `${ym}-01`;
  const nextMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`; };
  const pkt = () => new Date(Date.now() + 5 * 3600e3);          // Pakistan time (UTC+5, no daylight saving)
  const today = () => pkt().toISOString().slice(0, 10);
  const thisMonth = () => today().slice(0, 7);
  let month = thisMonth();

  // Failed sends wait on the phone; a duplicate (23505) means it already saved, so it is not an error.
  const outbox = HB.outbox('expenses', async (row) => {
    const c = await HB.sb();
    const { error } = await c.from('expenses').insert(row);
    if (error && error.code !== '23505') throw HB.fail(error);
  });

  function validate(f) {
    const category = f.category.value;
    const name = f.name.value.trim();
    const amount = Math.round(Number(f.amount.value));
    const spent_on = f.spent_on.value;
    const note = f.note.value.trim();
    if (!CATEGORIES.includes(category)) return 'Choose a category';
    if (!name || name.length > 120) return 'Enter a name (up to 120 characters)';
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) return 'Enter an amount in rupees';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spent_on)) return 'Choose a date';
    if (note.length > 300) return 'Note is too long';
    return { branch: BRANCH, category, name, amount, spent_on, note: note || null, client_ref: crypto.randomUUID() };
  }

  async function loadMonth() {
    const c = await HB.sb();
    const { data, error } = await c.from('expenses').select('*')
      .eq('branch', BRANCH).gte('spent_on', monthStart(month)).lt('spent_on', nextMonth(month))
      .order('spent_on', { ascending: false });
    if (error) return `<p class="err">Could not load: ${HB.esc(error.message)}</p>`;
    const byCat = {}; let total = 0;
    (data || []).forEach((r) => { byCat[r.category] = (byCat[r.category] || 0) + r.amount; total += r.amount; });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td>${HB.esc(k)}</td><td class="num">${HB.money(v)}</td></tr>`).join('');
    const rows = (data || []).map((r) => `<tr><td>${HB.esc(r.spent_on)}</td><td>${HB.esc(r.category)}</td>
      <td>${HB.esc(r.name)}${r.note ? ' <small>(' + HB.esc(r.note) + ')</small>' : ''}</td><td class="num">${HB.money(r.amount)}</td></tr>`).join('');
    return `<h3>${HB.esc(month)} total: ${HB.money(total)}</h3>
      <h4>By category</h4><table>${cats || '<tr><td>No expenses this month</td></tr>'}</table>
      <h4>Entries</h4><table>${rows || ''}</table>`;
  }

  async function render() {
    const h = host(); if (!h) return;
    h.innerHTML = `
      <form id="exp-form" class="exp-form">
        <select name="category">${CATEGORIES.map((c) => `<option>${HB.esc(c)}</option>`).join('')}</select>
        <input name="name" placeholder="What (e.g. Mozzarella 10 kg)" maxlength="120" required>
        <input name="amount" type="number" min="0" step="1" placeholder="Rs." required>
        <input name="spent_on" type="date" value="${today()}" required>
        <input name="note" placeholder="Note (optional)" maxlength="300">
        <button class="btn d" type="submit">Save expense</button>
        <p class="err" id="exp-err"></p>
      </form>
      <label>Month <input type="month" id="exp-month" value="${month}"></label>
      <div id="exp-body">${await loadMonth()}</div>`;
    document.getElementById('exp-form').onsubmit = (e) => {
      e.preventDefault();
      const v = validate(e.target);
      const err = document.getElementById('exp-err');
      if (typeof v === 'string') { err.textContent = v; return; }
      outbox.push(v);                       // saved on the phone first, sent right away if online
      e.target.reset(); err.textContent = 'Saved'; setTimeout(render, 400);
    };
    document.getElementById('exp-month').onchange = (e) => { month = e.target.value || thisMonth(); render(); };
  }

  window.HBExpenses = { mount: render, categories: CATEGORIES, validate };
})();
