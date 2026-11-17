// Supabase Edge Function: create cashier/rider logins with USERNAME + PASSWORD,
// and reset passwords. The secret key lives ONLY on the server (Supabase sets
// SUPABASE_SERVICE_ROLE_KEY automatically). It is never in the apps or repo.
//
// Callers must be signed in as owner or manager. Every permission check is also
// enforced again by the database (add_staff_by_email / set_staff_active).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*', // tighten to your dashboard domain before going live
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/; // lowercase, 3-30 chars
const ROLES = ['cashier', 'rider'];
const BRANCHES = ['darman']; // add 'bimber' here later when that branch is opened

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token) return json({ error: 'not signed in' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Who is calling? Use their own token so the database checks their role.
  const caller = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: me, error: meErr } = await caller.auth.getUser(token);
  if (meErr || !me?.user) return json({ error: 'not signed in' }, 401);

  let input: any;
  try { input = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const action = input.action;

  const admin = createClient(url, service, { auth: { persistSession: false } });

  if (action === 'create') {
    const username = String(input.username || '').trim().toLowerCase();
    const password = String(input.password || '');
    const name = String(input.name || '').trim().slice(0, 60);
    const role = String(input.role || '');
    const branch = String(input.branch || '');
    if (!USERNAME.test(username)) return json({ error: 'username: 3-30 letters, numbers, dot, dash or underscore' }, 400);
    if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
    if (!ROLES.includes(role)) return json({ error: 'role must be cashier or rider' }, 400);
    if (!BRANCHES.includes(branch)) return json({ error: 'unknown branch' }, 400);
    if (!name) return json({ error: 'name is required' }, 400);

    // Hidden login email built from the username. Staff never see it.
    const email = `${username}@staff.hb.local`;

    // Create the login. If the username already exists, stop: never overwrite.
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { username, kind: 'staff' },
    });
    if (cErr || !created?.user) return json({ error: cErr?.message?.includes('already') ? 'username already taken' : 'could not create login' }, 400);

    // Link to staff role and branch. The DB checks the caller is owner, or a manager of this branch.
    const { error: sErr } = await caller.rpc('add_staff_by_email', { p_email: email, p_role: role, p_branch: branch, p_name: name });
    if (sErr) {
      // Roll back the new login so nothing half-created stays behind.
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: 'not allowed or invalid details' }, 403);
    }
    return json({ ok: true, username, role, branch });
  }

  if (action === 'reset_password') {
    const userId = String(input.user_id || '');
    const password = String(input.password || '');
    if (password.length < 8) return json({ error: 'password must be at least 8 characters' }, 400);
    // Check the caller may manage this person (DB rule), before using the secret key.
    const { data: allowed, error: tErr } = await caller.rpc('can_manage_staff', { p_user: userId });
    if (tErr || allowed !== true) return json({ error: 'not allowed' }, 403);
    const { error: pErr } = await admin.auth.admin.updateUserById(userId, { password });
    if (pErr) return json({ error: 'could not reset' }, 400);
    return json({ ok: true });
  }

  return json({ error: 'unknown action' }, 400);
});
