/* Dashboard: Sales. Totals and history from the database, for one branch and a chosen period.
   Shows takeaway vs delivery, counter (POS) vs customer app, top items, daily totals and each order.
   Totals come from sales_summary, so the numbers match the reports everywhere. */
(function () {
  const BRANCH = (window.HB_CONFIG && window.HB_CONFIG.branch) || 'darman';
  const LABEL = { takeaway: 'Takeaway', delivery: 'Delivery', app: 'Customer app', pos: 'Counter (POS)' };
  const host = () => document.getElementById('sales');
  const PKT = 5 * 3600e3;
  const pktDay = (d) => new Date(d.getTime() + PKT).toISOString().slice(0, 10);   // YYYY-MM-DD in Pakistan
  const pktMidnight = (day) => new Date(`${day}T00:00:00+05:00`);
  const RANGES = {
    today: () => { const d = pktDay(new Date()); return [d, d]; },
    week:  () => { const e = pktDay(new Date()); const s = pktDay(new Date(Date.now() - 6 * 864e5)); return [s, e]; },
    month: () => { const e = pktDay(new Date()); return [`${e.slice(0, 8)}01`, e]; },
  };
  let range = 'today';

  function bounds(key) {
    const [from, to] = RANGES[key]();
    const start = pktMidnight(from);
    const end = new Date(pktMidnight(to).getTime() + 864e5);            // exclusive: start of next day
    return { p_from: start.toISOString(), p_to: end.toISOString(), start, end };
  }

  const kv = (name, value) => `<div class="kpi"><small>${HB.esc(name)}</small><b>${HB.money(value)}</b></div>`;
  const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

  async function load() {
    const c = await HB.sb();
    const b = bounds(range);
    const [sum, ord] = await Promise.all([
      c.rpc('sales_summary', { p_from: b.p_from, p_to: b.p_to, p_branch: BRANCH }),
      c.from('orders').select('id,created_at,type,source,status,total,customer,items')
        .eq('branch', BRANCH).gte('created_at', b.p_from).lt('created_at', b.p_to)
        .order('created_at', { ascending: false }).limit(200),
    ]);
    if (sum.error) throw Error(sum.error.message);
    if (ord.error) throw Error(ord.error.message);
    return { s: sum.data || {}, orders: ord.data || [] };
  }

  const time = (iso) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', hour12: true, day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit' });

  function table(head, rows) {
    return `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows || '<tr><td colspan="' + head.length + '">No sales in this period</td></tr>'}</table>`;
  }

  async function render(msg = '') {
    const h = host(); if (!h) return;
    h.innerHTML = `<div class="rangebar">
      ${Object.keys(RANGES).map((k) => `<button class="btn${k === range ? ' d' : ''}" data-range="${k}">${{ today: 'Today', week: 'Last 7 days', month: 'This month' }[k]}</button>`).join(' ')}
      <button class="btn" id="sales-refresh">Refresh</button> <small>${HB.esc(msg)}</small></div><div id="sales-body">Loading…</div>`;
    h.onclick = (e) => {
      const r = e.target.closest('button[data-range]');
      if (r) { range = r.dataset.range; render(); }
      if (e.target.closest('#sales-refresh')) render();
    };
    try {
      const { s, orders } = await load();
      const byType = s.by_type || {}, bySrc = s.by_source || {};
      const sp = (o) => (o ? `${HB.money(o.total)} <small>(${o.count} orders)</small>` : '—');
      const topRows = (s.top_items || []).map((t) => row([HB.esc(t.name), HB.esc(t.qty), HB.money(t.total)])).join('');
      const dayRows = (s.by_day || []).map((d) => row([HB.esc(d.d), HB.money(d.total), HB.esc(d.count)])).join('');
      const orderRows = orders.map((o) => row([HB.esc(time(o.created_at)), HB.esc(LABEL[o.type] || o.type), HB.esc(LABEL[o.source] || o.source),
        HB.esc(o.customer && o.customer.name || ''), HB.esc(o.status), HB.money(o.total)])).join('');
      document.getElementById('sales-body').innerHTML = `
        <div class="kpis">
          ${kv('Sales', s.total || 0)}
          ${kv('Orders', s.count || 0)}
          ${kv('Cancelled / rejected', s.cancelled || 0)}
          ${kv('Delivery fees', s.delivery || 0)}
        </div>
        <div class="split">
          <div><h4>By order type</h4><table><tr><td>${LABEL.takeaway}</td><td>${sp(byType.takeaway)}</td></tr><tr><td>${LABEL.delivery}</td><td>${sp(byType.delivery)}</td></tr></table></div>
          <div><h4>By where it was ordered</h4><table><tr><td>${LABEL.pos}</td><td>${sp(bySrc.pos)}</td></tr><tr><td>${LABEL.app}</td><td>${sp(bySrc.app)}</td></tr></table></div>
        </div>
        <h4>Top items</h4>${table(['Item', 'Qty', 'Sales'], topRows)}
        <h4>By day</h4>${table(['Day', 'Sales', 'Orders'], dayRows)}
        <h4>Orders</h4>${table(['Time', 'Type', 'From', 'Customer', 'Status', 'Total'], orderRows)}`;
    } catch (err) {
      document.getElementById('sales-body').innerHTML = `<p class="err">${HB.esc(err.message)}</p>`;
    }
  }

  window.HBSales = { mount: () => render() };
})();
