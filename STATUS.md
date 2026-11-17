# Build status (honest)

DONE in this package
- Database v3 schema, Bimber branch removed (Darman only)
- Cron job file
- config.js with the real project URL and publishable key
- Shared connection library (hb-core.js) and demo backend (hb-demo.js)
- Setup guide

NOT YET BUILT (next steps, in order)
1. DONE: Edge Function staff-admin (cashier usernames and passwords). Deploy with Part F of the guide.
2. Customer app: remove Urdu, wire to the database, offline menu and offline order queue
3. POS: bills saved to the database and offline bill queue (Incoming tab for app orders is BUILT, see apps/pos/pos-incoming.js; sales history is still in the POS until the dashboard is done)
4. Dashboard: owner's theme, sales history, expenses (with categories for pizza, burger, fries etc.), staff, App Control, text editor, live preview
5. Test on the real Supabase project and on an Android phone

Each step is large. Tell me which one to do first, and send the matching original file if asked.

UPDATE (this round)
- apps/pos/pos.html: original POS plus an "Incoming" tab. Original code is otherwise unchanged.
- apps/pos/pos-incoming.js: live list of app orders for Darman, cashier sign-in with username, Accept/Preparing/Ready/Delivered moves, offline outbox for status changes.
- Tests: the existing 49 demo checks pass (PASS 49 FAIL 0). The Incoming tab has NOT been opened in a real browser yet.
- SQL change: managers can add and deactivate cashiers and riders for their own branch only (database-enforced). Not yet run on the real Supabase project.

ROUND 3
- AUDIT FIXES: demo backend (fake logins, Bimber data) moved to dev-tests/ and never shipped to the app; app now defaults to backend 'supabase' (no silent demo fallback); Incoming tab no longer opens duplicate live subscriptions; double "Rs." prefix removed.
- apps/dashboard/expenses.js: expense entry with categories for pizza, burger, fries, chicken, cheese, bread, sauces, drinks, oil, packaging, gas, electricity, rent, salaries, repairs and other. Monthly totals by category. Duplicate-proof and offline-safe. Validation tested (7/7 pass). Not yet opened in a browser.
- Not yet verified: the Edge Function (no Deno in this sandbox); all SQL (no Postgres here).

ROUND 4
- apps/dashboard/dashboard.html: the owner's original dashboard (its layout and theme are unchanged), with:
  - Riders, Branches and the old Users page hidden (no rider app; one branch).
  - New Expenses and Staff pages (nav and rail).
  - Sign-in gate: only owner or manager can open it (checked on the server by the database).
- apps/dashboard/staff.js: create cashier logins (username + password), reset passwords, deactivate or reactivate (records kept). Staff list needs the owner account (database rule).
- KNOWN LEFTOVER: 18 mentions of "Bimber" remain in the original dashboard's demo text and sample data (on Overview, Apps, Branches and Riders pages). They are hidden or sample text. They will be removed when those pages are connected to the database. Not removed yet.
- KNOWN LIMIT: Overview, Orders, Sales, Stock and Menu still show the original local sample data, not the database. Only the sign-in gate, Expenses and Staff are connected so far.
- Not browser-tested. Not run on real Supabase.

ROUND 5
- Bimber removed from the dashboard (sample data, charts, apps page, operational controls). The only remaining mentions are in dev-tests (not shipped) and the comment in the staff function.
- apps/dashboard/sales.js: Sales page now reads the database (sales_summary + orders). Shows totals, takeaway vs delivery, counter (POS) vs customer app, top items, daily totals, and order history for Today, Last 7 days and This month. Pakistan time boundaries checked.
- Dashboard pages now connected: Sales, Expenses, Staff (plus sign-in). Still local sample data: Overview, Orders, Menu, Stock, Settings, Reports.

ROUND 6: CUSTOMER APP
- apps/customer-app-index.html: connected to the real Supabase project (publishable key only). Urdu off (English only, no Urdu font, no language switch). Local-first libraries (apps/vendor) with internet fallback. Menu saved on the phone so it opens offline. Orders placed offline are queued and sent when online, with an ID so they are never saved twice.
- database/01-schema.sql: place_order now takes an optional ref (p_ref) for safe retries. Fresh install only (the schema has not been run on Supabase yet).
- Checked: the app's menu and order fields match the database tables and functions. Scripts pass syntax checks.
- NOT tested in a browser or on a phone. NOT run on the real backend.
- Left in the file on purpose, to remove before release: the mock demo account (mockApi) and the unused Urdu text.
- Known limits: an order queued offline shows as "queued" until sent; if the server rejects it later (for example, ordering closed), it is dropped silently. This needs a message to the customer.

ROUND 7: POS
- Print bill from the Incoming tab, using the POS receipt. Print-only: it does NOT add a second POS sale.
- NEW pos-sync.js: every counter bill is saved to the database (pos_sale), so the dashboard Sales page includes counter sales. Offline bills wait on the device. Each bill has a unique ref, so it is never saved twice. Totals match the bill exactly (tested). Bills from the last 48 hours are back-filled once.
- Yellow warning bar on the POS until a cashier signs in.
- Sales History removed from the POS navigation (the dashboard Sales page replaces it).
- Known limits: edits to a printed bill are not synced yet; bills older than 48 hours cannot be sent with the right date (database rule); a bill rejected for bad data is stored on the device under hb_pos_rejected for review, not shown to staff yet.
- NOT tested in a browser or on a phone. NOT run on the real backend.
