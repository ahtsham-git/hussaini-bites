/* POS -> database. Every counter bill is saved to the database with pos_sale, so the dashboard
   sees counter sales (not only app orders). Bills are kept on the device first. If there is no
   internet or no cashier sign-in, they wait and are sent later. Each bill has a unique ref, so it is
   never saved twice. Bills older than 48 hours cannot be sent with their true date (the database
   limits back-dating), so only the last 48 hours are back-filled automatically. */
(function () {
  const BRANCH = (window.HB_CONFIG && window.HB_CONFIG.branch) || 'darman';
  const QKEY = 'hb_outbox_pos', SKEY = 'hb_pos_synced', RKEY = 'hb_pos_rejected', DKEY = 'hb_pos_device';
  const HOUR48 = 48 * 3600e3;
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const device = () => {
    let d = localStorage.getItem(DKEY);
    if (!d) { d = Math.random().toString(36).slice(2, 10); try { localStorage.setItem(DKEY, d); } catch {} }
    return d;
  };
  // Waiting problems (retry later) vs. data problems (keep for review, never retry forever).
  const waits = (e) => !navigator.onLine || /fetch|network|failed to|timeout|load failed|not allowed|login|JWT|signed/i.test(String((e && e.message) || e));

  function toJob(b) {
    const items = (b.lines || []).map((l) => ({
      id: String(l.id || ''),
      name: String(l.n || l.name || 'Item') + (l.vl ? ' (' + l.vl + ')' : ''),
      size: String(l.vl || ''),
      price: Math.max(0, Math.round(Number(l.p) || 0)),
      qty: Math.max(1, Math.round(Number(l.q) || 1)),
      deal: !!l.dl,
    }));
    const disc = Math.max(0, Math.round(Number(b.disc) || 0));
    const del = Math.max(0, Math.round(Number(b.dl) || 0));
    const sub = items.reduce((a, i) => a + i.price * i.qty, 0);
    const tax = Math.round((Number(b.tot) || 0) - (sub - disc + del));   // database total = bill total, exactly
    return {
      p_branch: BRANCH,
      p_type: b.type === 'Delivery' ? 'delivery' : 'takeaway',
      p_customer: { name: b.cn || '', phone: b.cph || '', address: b.cad || '' },
      p_items: items, p_discount: disc, p_tax: tax, p_delivery: del, p_note: b.note || '',
      p_bill_no: String(b.no), p_ref: device() + '-' + String(b.no),
      p_at: new Date(Number(b.ts) || Date.now()).toISOString(),
    };
  }

  let busy = false;
  async function flush() {
    if (busy) return; busy = true;
    try {
      const q = load(QKEY, []);
      if (!q.length) return;
      const done = new Set(load(SKEY, []));
      const keep = [], rejected = load(RKEY, []);
      for (const job of q) {
        if (done.has(job.p_ref)) continue;
        try {
          const c = await HB.sb();
          const { error } = await c.rpc('pos_sale', job);
          if (!error) { done.add(job.p_ref); continue; }
          if (waits(error)) keep.push(job);
          else rejected.push({ ...job, why: error.message, at: Date.now() });
        } catch (e) { keep.push(job); }
      }
      put(QKEY, keep.slice(-500));
      put(SKEY, [...done].slice(-5000));
      put(RKEY, rejected.slice(-200));
    } finally { busy = false; }
  }

  function saveSale(b) {
    const job = toJob(b);
    const q = load(QKEY, []);
    if (!q.some((j) => j.p_ref === job.p_ref)) q.push(job);
    put(QKEY, q.slice(-500));
    flush();
  }

  // Back-fill bills from the last 48 hours that were made before this update, once.
  function backfill() {
    if ((typeof DEMO_ON !== 'undefined' && DEMO_ON) || typeof S === 'undefined' || !S || !Array.isArray(S.bills)) return;
    const done = new Set(load(SKEY, []));
    const queued = new Set(load(QKEY, []).map((j) => j.p_ref));
    const now = Date.now();
    S.bills.forEach((b) => {
      const ref = device() + '-' + String(b.no);
      if (done.has(ref) || queued.has(ref) || now - (Number(b.ts) || 0) > HOUR48) return;
      saveSale(b);
    });
  }

  window.addEventListener('online', () => flush());
  window.HBPosSync = { saveSale, flush, backfill, status: () => ({ waiting: load(QKEY, []).length, rejected: load(RKEY, []).length }) };
  backfill();
})();
