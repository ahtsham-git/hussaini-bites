# Hussaini Bites: setup guide (Darman branch)

## Part A: Set up the database (Supabase)

1. Open https://supabase.com/dashboard and open the project **hussaini-bites Project**.
2. Go to **Database → Extensions**, search for **pg_cron**, and turn it on.
3. Go to **SQL Editor → New query**.
4. Open `database/01-schema.sql` from this folder, copy everything, paste it in, and click **Run**.
   - It should finish with "Success". If you see an error, copy the red message and send it to me. Do not guess.
5. Make a new query, paste `database/02-cron.sql`, and click **Run**. This makes order statuses move on by themselves.
6. Go to **Authentication → Providers** and turn on **Anonymous sign-ins** (guests can order without an account).

## Part B: Connect the apps

1. Open `shared/config.js`. The URL and publishable key are already filled in for your project.
2. Keep `backend: 'supabase'` and `branch: 'darman'`.
3. Never add the **secret key** or the **database password** to any file.

## Part C: Create your owner account

1. In Supabase go to **Authentication → Users → Add user**. Enter your email and a strong password, and tick **Auto Confirm User**.
2. Go to **SQL Editor** and run (replace the email):
   ```sql
   select public.add_staff_by_email('your@email.com','owner',null,'Owner');
   ```
   This makes you the owner. Owner can see everything.

## Part D: Cashiers (username and password)

Cashier logins are created from the dashboard by the manager. The dashboard calls a small
server function (Supabase Edge Function) that holds the secret key safely on the server.
That function is **not built yet**. Until it is, add cashiers with the SQL below, using a
hidden email made from the username:

```sql
select public.add_staff_by_email('ali.darman@hb.local','cashier','darman','Ali');
```

Then set the password in **Authentication → Users**. Removing a cashier uses
`select public.set_staff_active('<user id>', false);`. This keeps all their past sales,
orders and expenses. Do not delete the user.

## Part E: Test on the Android phone

1. Put the `dist` folder on a host you can open (for example GitHub Pages from a **private** repo, or a local server on your computer).
2. Open the ordering app on the phone in Chrome, then turn on airplane mode and reload. It should still open because the menu is saved on the phone (after one normal visit).
3. Turn data back on. Offline orders are sent automatically.

## Safety checklist
- [ ] Repo is **private**.
- [ ] `config.js` has only the URL and publishable key.
- [ ] Secret key was regenerated (it was visible in screenshots).
- [ ] Anonymous sign-ins are on only if you want guest ordering.

## Part F: Deploy the cashier login function (one time)

1. Install the Supabase CLI on your computer (https://supabase.com/docs/guides/cli).
2. In a terminal, from the `dist` folder: `supabase login`, then `supabase link --project-ref hrimempocwunsmtvtfnl`.
3. Deploy: `supabase functions deploy staff-admin`. The secret key is set by Supabase on the server; you never type it.
4. Open the dashboard as owner or manager, and create cashiers with a username and password. Their old sales and orders stay when they are deactivated.

## Part G: Customer app (Android, works offline)

1. Supabase > Authentication > Providers: turn ON **Anonymous sign-ins** (guest ordering).
2. Supabase > Authentication > Providers > Email: turn OFF **Confirm email**. Customers sign up with
   their phone number, and the app turns it into an internal address. Without this, sign-up will not work.
3. Download the four library files listed in `apps/vendor/README.txt` into the `apps/vendor` folder (one time, with internet).
4. Open `apps/customer-app-index.html` on the phone (through your https address).
   Menu and orders are saved on the phone, so the app opens without internet. Orders placed offline are sent when internet returns.
5. Test: sign up, add to cart, place an order, then turn on airplane mode, reopen the app, and check that the menu still shows.

Notes
- The Urdu language option is switched off. The Urdu text is still stored in the file, but it is not shown.
- The original file has a built-in demo account used for offline testing only. Remove it before you publish the app to customers.

## Part H: POS (cashier counter)

1. A cashier signs in once at the start of the shift: open the **Incoming** tab and enter username and password.
   A yellow bar stays at the top of the POS until someone signs in.
2. Every counter bill is saved to the database when it is printed. Bills from the last 48 hours that were made before this update are sent once, automatically.
3. Bills made while there is no internet are kept on the device and sent when the connection returns.
4. Print a customer-app order with **Print bill** on the Incoming tab. It prints but is not counted twice.
5. Sales History has been removed from the POS. Use the **Sales** page in the dashboard.

Known limit: editing a bill after it was printed is not sent to the database yet. Tell the manager to make corrections in the dashboard until this is added.
