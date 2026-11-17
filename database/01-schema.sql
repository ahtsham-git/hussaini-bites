-- =====================================================================
-- Hussaini Bites: database v3 (Supabase / Postgres).  Run ONCE in the SQL editor.
-- One database for: customer app, POS, owner dashboard.
-- All security lives here (Row Level Security + functions), never in the apps.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- branches ----------
create table branches(
  id text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  name text not null check (char_length(name)<=40), name_ur text check (char_length(name_ur)<=40),
  location text check (char_length(location)<=120),
  address text check (char_length(address)<=160), address_ur text check (char_length(address_ur)<=160),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  is_active boolean not null default true, sort_order int not null default 0);
insert into branches(id,name,name_ur,location,address,address_ur,phone,sort_order) values
 ('darman','Darman',null,'Darman, Narowal','Zafarwal Road, Near Abbas Autos, Darman',null,'03255447894',1);

-- ---------- staff (POS + dashboard users). NO write policy: changed only through the owner-only functions below ----------
create table staff(
  user_id uuid primary key references auth.users on delete cascade,
  role text not null default 'cashier' check (role in ('owner','manager','cashier','rider')),
  branch text references branches(id),                    -- null = all branches
  display_name text check (char_length(display_name)<=60),
  is_active boolean not null default true, created_at timestamptz not null default now());

create function is_staff() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from staff where user_id=(select auth.uid()) and is_active) $$;
create function is_manager() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from staff where user_id=(select auth.uid()) and is_active and role in ('owner','manager')) $$;
create function is_owner() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from staff where user_id=(select auth.uid()) and is_active and role='owner') $$;
create function can_branch(b text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from staff where user_id=(select auth.uid()) and is_active and (branch is null or branch=b)) $$;

-- ---------- app control (ONE row the dashboard edits; read publicly by the customer app, so never put secrets in it) ----------
create table app_config(id int primary key default 1 check (id=1),
  config jsonb not null default '{}' check (jsonb_typeof(config)='object' and pg_column_size(config)<60000), updated_at timestamptz not null default now());
insert into app_config(id) values(1);

-- ---------- menu ----------
create table categories(id uuid primary key default gen_random_uuid(), name text not null check (char_length(name)<=40), name_ur text check (char_length(name_ur)<=40),
  photo_url text check (char_length(photo_url)<=2000), sort_order int not null default 0, is_active boolean not null default true);
create table menu_items(id uuid primary key default gen_random_uuid(), category_id uuid not null references categories on delete cascade,
  name text not null check (char_length(name)<=80), name_ur text check (char_length(name_ur)<=80),
  description text check (char_length(description)<=300), description_ur text check (char_length(description_ur)<=300),
  photo_url text check (char_length(photo_url)<=2000), rating numeric(2,1) not null default 4.8,
  sizes jsonb not null default '[{"name":"Regular","price":0}]' check (jsonb_typeof(sizes)='array' and jsonb_array_length(sizes) between 1 and 8),
  discount int not null default 0 check (discount between 0 and 90),
  is_available boolean not null default true, is_popular boolean not null default false,
  hidden_in text[] not null default '{}',                    -- branch ids where this item is NOT sold
  sort_order int not null default 0, updated_at timestamptz not null default now());
create table deals(id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title)<=60),        -- "Flame-Grilled|Perfection": text after | is the accent-colour second line
  title_ur text check (char_length(title_ur)<=60), tag text check (char_length(tag)<=30), tag_ur text check (char_length(tag_ur)<=30),
  description text check (char_length(description)<=200), description_ur text check (char_length(description_ur)<=200),
  price int not null check (price between 0 and 100000), discount int not null default 0 check (discount between 0 and 90),
  note text check (char_length(note)<=60), note_ur text check (char_length(note_ur)<=60), photo_url text check (char_length(photo_url)<=2000),
  branches text[],                                           -- null = every branch
  sort_order int not null default 0, is_active boolean not null default true, starts_at timestamptz, ends_at timestamptz);

-- ---------- people ----------
create table customers(id uuid primary key references auth.users on delete cascade, name text check (char_length(name)<=60),
  phone text check (phone is null or phone ~ '^\+?[0-9]{10,13}$'),
  addresses jsonb not null default '[]' check (jsonb_typeof(addresses)='array' and pg_column_size(addresses)<4000), created_at timestamptz not null default now());
create table riders(id uuid primary key default gen_random_uuid(), branch text not null references branches(id), name text not null check (char_length(name)<=60),
  phone text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'), is_active boolean not null default true, created_at timestamptz not null default now());

-- ---------- sales ----------
create table orders(id bigint generated always as identity primary key,
  branch text not null default 'darman' references branches(id),
  source text not null default 'app' check (source in ('app','pos')),
  bill_no text check (char_length(bill_no)<=20), client_ref text unique check (char_length(client_ref)<=60),
  customer_id uuid references auth.users on delete set null, customer jsonb not null,            -- {name, phone, address}
  type text not null check (type in ('delivery','takeaway')), payment_method text not null default 'cod', note text check (char_length(note)<=200),
  items jsonb not null,                                                                          -- [{id,name,size,price,qty,deal}] prices are set by the server
  subtotal int not null check (subtotal>=0), discount int not null default 0 check (discount>=0), tax int not null default 0 check (tax>=0),
  delivery_fee int not null default 0 check (delivery_fee>=0), total int not null check (total>=0),
  status text not null default 'pending' check (status in ('pending','accepted','preparing','ready','picked_up','delivered','rejected','cancelled')),
  status_history jsonb not null default '[]', rider_id uuid references riders on delete set null, created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index orders_branch_time on orders(branch, created_at desc);
create index orders_customer on orders(customer_id, created_at desc);
create index orders_active on orders(status) where status in ('pending','accepted','preparing','ready','picked_up');

create table expenses(id uuid primary key default gen_random_uuid(), branch text not null references branches(id),
  category text not null check (char_length(category)<=40), name text not null check (char_length(name)<=120),
  amount int not null check (amount>=0 and amount<=100000000), spent_on date not null default current_date,
  note text check (char_length(note)<=300), client_ref text unique check (char_length(client_ref)<=60),
  created_by uuid references auth.users on delete set null, created_at timestamptz not null default now());
create index expenses_branch_date on expenses(branch, spent_on desc);
create table stock_items(id uuid primary key default gen_random_uuid(), branch text not null references branches(id),
  name text not null check (char_length(name)<=80), category text check (char_length(category)<=40), unit text check (char_length(unit)<=12),
  qty numeric(10,2) not null default 0 check (qty>=0), min_qty numeric(10,2) not null default 0 check (min_qty>=0), updated_at timestamptz not null default now());
create table audit_log(id bigint generated always as identity primary key, at timestamptz not null default now(), actor uuid, tbl text, op text, old_row jsonb, new_row jsonb);

-- ---------- triggers ----------
-- status history and updated_at are written by the database; apps only change `status`
create function orders_hist() returns trigger language plpgsql as $$
begin
  if tg_op='INSERT' then new.status_history:=jsonb_build_array(jsonb_build_object('status',new.status,'at',now()));
  elsif new.status is distinct from old.status then
    new.status_history:=coalesce(old.status_history,'[]'::jsonb)||jsonb_build_object('status',new.status,'at',now()); new.updated_at:=now(); end if;
  return new; end $$;
create trigger orders_hist_t before insert or update on orders for each row execute function orders_hist();

-- only managers can change what was ordered, who ordered or what it costs
create function orders_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.items is distinct from old.items or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount or new.tax is distinct from old.tax
      or new.delivery_fee is distinct from old.delivery_fee or new.total is distinct from old.total or new.customer_id is distinct from old.customer_id
      or new.customer is distinct from old.customer or new.type is distinct from old.type or new.source is distinct from old.source or new.branch is distinct from old.branch
      or new.created_at is distinct from old.created_at) and not is_manager() then raise exception 'not allowed'; end if;
  return new; end $$;
create trigger orders_guard_t before update on orders for each row execute function orders_guard();

-- status can only move forward (cashiers, customers, and the timer). Owners/managers may correct any status.
create function orders_flow() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status and not is_manager() then
    if not ((old.status='pending' and new.status in ('accepted','rejected','cancelled'))
         or (old.status='accepted' and new.status in ('preparing','rejected','cancelled'))
         or (old.status='preparing' and new.status in ('ready','cancelled'))
         or (old.status='ready' and new.status in ('picked_up','delivered','cancelled'))
         or (old.status='picked_up' and new.status='delivered')) then raise exception 'not allowed'; end if;
  end if;
  return new; end $$;
create trigger orders_flow_t before update on orders for each row execute function orders_flow();

create function stamp_updated() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end $$;
create trigger menu_items_upd before update on menu_items for each row execute function stamp_updated();
create trigger app_config_upd before update on app_config for each row execute function stamp_updated();
create trigger stock_items_upd before update on stock_items for each row execute function stamp_updated();

-- every change to config, menu, deals, categories, branches and staff is recorded (who, what, before, after)
create function audit() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into audit_log(actor,tbl,op,old_row,new_row) values((select auth.uid()),tg_table_name,tg_op,
    case when tg_op<>'INSERT' then to_jsonb(old) end, case when tg_op<>'DELETE' then to_jsonb(new) end);
  return null; end $$;
create trigger audit_cfg after insert or update or delete on app_config for each row execute function audit();
create trigger audit_cat after insert or update or delete on categories for each row execute function audit();
create trigger audit_mi after insert or update or delete on menu_items for each row execute function audit();
create trigger audit_deal after insert or update or delete on deals for each row execute function audit();
create trigger audit_branch after insert or update or delete on branches for each row execute function audit();
create trigger audit_staff after insert or update or delete on staff for each row execute function audit();

-- ---------- row level security ----------
alter table branches enable row level security; alter table staff enable row level security; alter table app_config enable row level security;
alter table categories enable row level security; alter table menu_items enable row level security; alter table deals enable row level security;
alter table customers enable row level security; alter table riders enable row level security; alter table orders enable row level security;
alter table expenses enable row level security; alter table stock_items enable row level security; alter table audit_log enable row level security;

create policy br_read on branches for select using (is_active or is_staff());
create policy br_write on branches for all using (is_manager()) with check (is_manager());
create policy staff_read on staff for select using (user_id=(select auth.uid()) or is_owner());
create policy cfg_read on app_config for select using (true);
create policy cfg_write on app_config for all using (is_manager()) with check (is_manager());
create policy cat_read on categories for select using (is_active or is_staff());
create policy cat_write on categories for all using (is_manager()) with check (is_manager());
create policy mi_read on menu_items for select using (true);
create policy mi_write on menu_items for all using (is_manager()) with check (is_manager());
create policy deal_read on deals for select using (is_active or is_staff());
create policy deal_write on deals for all using (is_manager()) with check (is_manager());
create policy cust_own on customers for all using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy cust_staff on customers for select using (is_staff());
create policy rider_read on riders for select using (is_staff() and can_branch(branch));
create policy rider_write on riders for all using (is_manager() and can_branch(branch)) with check (is_manager() and can_branch(branch));
create policy ord_read on orders for select using (customer_id=(select auth.uid()) or (is_staff() and can_branch(branch)));
create policy ord_update on orders for update using (is_staff() and can_branch(branch)) with check (is_staff() and can_branch(branch));
-- orders are created ONLY by place_order (customers) or pos_sale (staff): there is no insert policy on purpose
create policy exp_read on expenses for select using (is_staff() and can_branch(branch));
create policy exp_add on expenses for insert with check (is_staff() and can_branch(branch));
create policy exp_manage on expenses for update using (is_manager() and can_branch(branch)) with check (is_manager() and can_branch(branch));
create policy exp_del on expenses for delete using (is_manager() and can_branch(branch));
create policy stock_all on stock_items for all using (is_staff() and can_branch(branch)) with check (is_manager() and can_branch(branch));
create policy audit_read on audit_log for select using (is_owner());
revoke all on orders, customers, staff, audit_log, expenses, stock_items, riders from anon;   -- logged-out visitors can only read the public catalog

-- ---------- customer actions (the SERVER decides prices, fees, limits and which buttons are allowed) ----------
create function place_order(p_items jsonb,p_type text,p_address text,p_payment text,p_note text,p_name text,p_phone text,p_branch text default 'darman',p_ref text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare e jsonb; v_sub int:=0; v_fee int:=0; v_out jsonb:='[]'::jsonb; v_price int; v_name text; v_qty int; v_cfg jsonb; v_id bigint; z record; v_uid uuid:=(select auth.uid());
begin
  if v_uid is null then raise exception 'login required'; end if;
  -- same ref sent twice (retry after bad signal) returns the first order, never a second one
  if p_ref is not null then select id into v_id from orders where client_ref=left(p_ref,60) and customer_id=v_uid; if found then return v_id; end if; end if;
  if not exists(select 1 from branches where id=p_branch and is_active) then raise exception 'bad branch'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 40 then raise exception 'bad items'; end if;
  if p_type not in ('delivery','takeaway') then raise exception 'bad type'; end if;
  if length(coalesce(p_name,'')) not between 2 and 60 or coalesce(p_phone,'') !~ '^\+?[0-9]{10,13}$' then raise exception 'bad contact'; end if;
  if p_type='delivery' and length(coalesce(p_address,'')) not between 8 and 200 then raise exception 'bad address'; end if;
  select config into v_cfg from app_config where id=1;
  if coalesce((v_cfg->'features'->>'ordering')::boolean,true)=false then raise exception 'ordering closed'; end if;
  if coalesce((v_cfg->'buttons'->>p_type)::boolean,true)=false then raise exception 'not allowed'; end if;
  if (select count(*) from orders where customer_id=v_uid and created_at>now()-interval '10 minutes')>=5 then raise exception 'too many orders'; end if;
  if (select count(*) from orders where customer_id=v_uid and status not in ('delivered','cancelled','rejected'))>=3 then raise exception 'too many orders'; end if;
  for e in select x from jsonb_array_elements(p_items) as t(x) loop
    v_qty:=(e->>'qty')::int; v_price:=null; v_name:=null;
    if v_qty is null or v_qty<1 or v_qty>50 then raise exception 'bad qty'; end if;
    if coalesce((e->>'deal')::boolean,false) then
      select replace(d.title,'|',' '),d.price into v_name,v_price from deals d where d.id=(e->>'id')::uuid and d.is_active
        and (d.branches is null or p_branch=any(d.branches)) and (d.starts_at is null or d.starts_at<=now()) and (d.ends_at is null or d.ends_at>=now());
    else
      select m.name||case when jsonb_array_length(m.sizes)>1 then ' ('||(s.sz->>'name')||')' else '' end,(s.sz->>'price')::int into v_name,v_price
      from menu_items m, jsonb_array_elements(m.sizes) as s(sz) where m.id=(e->>'id')::uuid and m.is_available and not (p_branch=any(m.hidden_in)) and s.sz->>'name'=e->>'size';
    end if;
    if v_price is null then raise exception 'item unavailable'; end if;
    v_sub:=v_sub+v_price*v_qty;
    v_out:=v_out||jsonb_build_object('id',e->>'id','name',v_name,'size',e->>'size','price',v_price,'qty',v_qty,'deal',coalesce((e->>'deal')::boolean,false));
  end loop;
  if p_type='delivery' then
    v_fee:=coalesce((v_cfg->'delivery'->>'default')::int,150);
    for z in select key,value from jsonb_each_text(coalesce(v_cfg->'delivery'->'zones','{}'::jsonb)) loop
      if position(lower(z.key) in lower(p_address))>0 then v_fee:=z.value::int; exit; end if; end loop;
  end if;
  insert into orders(branch,source,customer_id,customer,type,payment_method,note,items,subtotal,delivery_fee,total,created_by,client_ref)
  values(p_branch,'app',v_uid,jsonb_build_object('name',p_name,'phone',p_phone,'address',coalesce(p_address,'')),p_type,'cod',left(coalesce(p_note,''),200),v_out,v_sub,v_fee,v_sub+v_fee,v_uid,left(p_ref,60))
  returning id into v_id;
  return v_id;
end $$;

create function cancel_order(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce((select (config->'buttons'->>'cancel_order')::boolean from app_config where id=1),true)=false then raise exception 'not allowed'; end if;
  update orders set status='cancelled' where id=p_id and customer_id=(select auth.uid()) and status='pending';
  if not found then raise exception 'cannot cancel'; end if;
end $$;

create function complete_order(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
begin
  if coalesce((select (config->'buttons'->>'complete_order')::boolean from app_config where id=1),true)=false then raise exception 'not allowed'; end if;
  update orders set status='delivered' where id=p_id and customer_id=(select auth.uid())
    and ((type='delivery' and status='picked_up') or (type='takeaway' and status='ready'));
  if not found then raise exception 'cannot complete'; end if;
end $$;

-- customer deletes their own account and personal data (orders stay as anonymous sales records)
create function delete_my_account() returns void language plpgsql security definer set search_path=public,auth as $$
declare v uuid:=(select auth.uid());
begin
  if v is null then raise exception 'login required'; end if;
  if exists(select 1 from staff where user_id=v) then raise exception 'not allowed'; end if;
  update orders set customer=jsonb_build_object('name','Deleted customer','phone','','address',''),customer_id=null where customer_id=v;
  delete from customers where id=v;
  delete from auth.users where id=v;
end $$;

-- ---------- POS sale: the cashier's bill is stored as a completed order (idempotent: the same p_ref never saves twice) ----------
create function pos_sale(p_branch text,p_type text,p_customer jsonb,p_items jsonb,p_discount int,p_tax int,p_delivery int,p_note text,p_bill_no text,p_ref text,p_at timestamptz default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare e jsonb; v_sub int:=0; v_out jsonb:='[]'::jsonb; v_id bigint; v_price int; v_qty int; v_disc int; v_tax int; v_del int; v_at timestamptz;
begin
  if not (is_staff() and can_branch(p_branch)) or (select role from staff where user_id=(select auth.uid()))='rider' then raise exception 'not allowed'; end if;
  if not exists(select 1 from branches where id=p_branch and is_active) then raise exception 'bad branch'; end if;
  if p_type not in ('delivery','takeaway') then raise exception 'bad type'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 80 then raise exception 'bad items'; end if;
  if coalesce(length(p_ref),0) not between 6 and 60 then raise exception 'bad ref'; end if;
  select id into v_id from orders where client_ref=p_ref; if v_id is not null then return v_id; end if;   -- already saved
  for e in select x from jsonb_array_elements(p_items) as t(x) loop
    v_price:=(e->>'price')::int; v_qty:=(e->>'qty')::int;
    if v_price is null or v_price<0 or v_price>1000000 or v_qty is null or v_qty<1 or v_qty>99 then raise exception 'bad item'; end if;
    v_sub:=v_sub+v_price*v_qty;
    v_out:=v_out||jsonb_build_object('id',left(coalesce(e->>'id',''),40),'name',left(coalesce(e->>'name','Item'),80),'size',left(coalesce(e->>'size',''),20),'price',v_price,'qty',v_qty,'deal',coalesce((e->>'deal')::boolean,false));
  end loop;
  v_disc:=greatest(0,least(coalesce(p_discount,0),v_sub)); v_tax:=greatest(0,coalesce(p_tax,0)); v_del:=case when p_type='delivery' then greatest(0,least(coalesce(p_delivery,0),20000)) else 0 end;
  v_at:=case when p_at is null then now() else least(now(),greatest(p_at,now()-interval '48 hours')) end;
  insert into orders(branch,source,bill_no,client_ref,customer,type,payment_method,note,items,subtotal,discount,tax,delivery_fee,total,status,created_by,created_at,updated_at)
  values(p_branch,'pos',left(p_bill_no,20),p_ref,jsonb_build_object('name',left(coalesce(p_customer->>'name',''),60),'phone',left(coalesce(p_customer->>'phone',''),20),'address',left(coalesce(p_customer->>'address',''),200)),
    p_type,'cash',left(coalesce(p_note,''),200),v_out,v_sub,v_disc,v_tax,v_del,v_sub-v_disc+v_tax+v_del,'delivered',(select auth.uid()),v_at,v_at)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- automatic status timing (runs every minute via supabase-cron / 02-cron.sql) ----------
-- The cashier accepts. Then orders move on by themselves using app_config.config.timing (minutes, 0 = manual only):
--   accepted -> preparing (1) -> ready (3) -> out for delivery (3) -> delivered (10, unless the customer or cashier completes it first). timing.auto=false stops it.
create function advance_orders() returns int language plpgsql security definer set search_path=public as $$
declare t jsonb; n int;
begin
  select coalesce(config->'timing','{}'::jsonb) into t from app_config where id=1;
  if coalesce((t->>'auto')::boolean,true)=false then return 0; end if;
  with x as (
    select o.id, o.updated_at,
      case o.status when 'accepted' then 'preparing' when 'preparing' then 'ready'
        when 'ready' then (case when o.type='delivery' then 'picked_up' else 'delivered' end) else 'delivered' end as nxt,
      case o.status when 'accepted' then coalesce((t->>'accepted')::numeric,1) when 'preparing' then coalesce((t->>'preparing')::numeric,3)
        when 'ready' then (case when o.type='delivery' then coalesce((t->>'ready')::numeric,3) else coalesce((t->>'takeaway_ready')::numeric,10) end)
        else coalesce((t->>'picked_up')::numeric,10) end as m
    from orders o where o.status in ('accepted','preparing','ready','picked_up') and o.source='app')
  update orders o set status=x.nxt from x where o.id=x.id and x.m>0 and x.updated_at <= now()-(x.m::float8*interval '1 minute');
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- one call that loads everything the customer app needs (fast start, easy to cache) ----------
create function get_catalog(p_branch text default null) returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object(
    'config',coalesce((select config from app_config where id=1),'{}'::jsonb),
    'branches',coalesce((select jsonb_agg(to_jsonb(b) order by b.sort_order) from branches b where b.is_active),'[]'::jsonb),
    'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order) from categories c where c.is_active),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(m) order by m.sort_order) from menu_items m where p_branch is null or not (p_branch=any(m.hidden_in))),'[]'::jsonb),
    'deals',coalesce((select jsonb_agg(to_jsonb(d) order by d.sort_order) from deals d where d.is_active and (p_branch is null or d.branches is null or p_branch=any(d.branches))),'[]'::jsonb)) $$;

-- ---------- sales summary: the dashboard asks for TOTALS, not thousands of rows (small download, fast) ----------
create function sales_summary(p_from timestamptz,p_to timestamptz,p_branch text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r jsonb;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  with o as (select * from orders where created_at>=p_from and created_at<p_to and (p_branch is null or branch=p_branch) and can_branch(branch)),
       ok as (select * from o where status not in ('cancelled','rejected'))
  select jsonb_build_object(
    'total',coalesce((select sum(total) from ok),0),'count',(select count(*) from ok),'cancelled',(select count(*) from o where status in ('cancelled','rejected')),
    'discount',coalesce((select sum(discount) from ok),0),'tax',coalesce((select sum(tax) from ok),0),'delivery',coalesce((select sum(delivery_fee) from ok),0),
    'by_day',coalesce((select jsonb_agg(jsonb_build_object('d',d,'total',t,'count',c) order by d) from (select (created_at at time zone 'Asia/Karachi')::date d,sum(total) t,count(*) c from ok group by 1) x),'[]'::jsonb),
    'by_hour',coalesce((select jsonb_agg(jsonb_build_object('h',h,'total',t,'count',c) order by h) from (select extract(hour from created_at at time zone 'Asia/Karachi')::int h,sum(total) t,count(*) c from ok group by 1) x),'[]'::jsonb),
    'by_type',coalesce((select jsonb_object_agg(type,jsonb_build_object('total',t,'count',c)) from (select type,sum(total) t,count(*) c from ok group by 1) x),'{}'::jsonb),
    'by_source',coalesce((select jsonb_object_agg(source,jsonb_build_object('total',t,'count',c)) from (select source,sum(total) t,count(*) c from ok group by 1) x),'{}'::jsonb),
    'by_branch',coalesce((select jsonb_agg(jsonb_build_object('branch',branch,'total',t,'count',c) order by branch) from (select branch,sum(total) t,count(*) c from ok group by 1) x),'[]'::jsonb),
    'top_items',coalesce((select jsonb_agg(jsonb_build_object('name',n,'qty',q,'total',t) order by t desc) from (
        select it->>'name' n,sum((it->>'qty')::int) q,sum((it->>'qty')::int*(it->>'price')::int) t from ok, jsonb_array_elements(ok.items) it group by 1 order by 3 desc limit 10) y),'[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------- staff management (owner only). Create the login in Supabase Auth first, then link it here by email ----------
create function add_staff_by_email(p_email text,p_role text,p_branch text,p_name text) returns void language plpgsql security definer set search_path=public,auth as $$
declare v_id uuid;
begin
  if p_role not in ('manager','cashier','rider') then raise exception 'bad role'; end if;
  -- owner: anyone. manager: only cashiers/riders for their own branch.
  if not (is_owner() or (is_manager() and p_role in ('cashier','rider') and nullif(p_branch,'') is not null and can_branch(p_branch))) then
    raise exception 'not allowed';
  end if;
  if nullif(p_branch,'') is not null and not exists(select 1 from branches where id=p_branch) then raise exception 'bad branch'; end if;
  select id into v_id from auth.users where lower(email)=lower(p_email) and is_anonymous is not true;
  if v_id is null then raise exception 'user not found'; end if;
  insert into staff(user_id,role,branch,display_name) values(v_id,p_role,nullif(p_branch,''),left(p_name,60))
  on conflict (user_id) do update set role=excluded.role,branch=excluded.branch,display_name=excluded.display_name,is_active=true where staff.role<>'owner';
end $$;
create function can_manage_staff(p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select is_owner() or (is_manager() and exists(select 1 from staff t where t.user_id=p_user and t.role in ('cashier','rider') and can_branch(t.branch)));
$$;
create function set_staff_active(p_user uuid,p_active boolean) returns void language plpgsql security definer set search_path=public as $$
begin
  -- owner: anyone except owners. manager: cashiers/riders of their own branch only. Data is never deleted.
  if not (is_owner() or (is_manager() and exists(select 1 from staff t where t.user_id=p_user and t.role in ('cashier','rider') and can_branch(t.branch)))) then
    raise exception 'not allowed';
  end if;
  update staff set is_active=p_active where user_id=p_user and role<>'owner';
end $$;
create function list_staff() returns table(user_id uuid,email text,role text,branch text,display_name text,is_active boolean) language plpgsql stable security definer set search_path=public,auth as $$
begin
  if not is_owner() then raise exception 'not allowed'; end if;
  return query select s.user_id,u.email::text,s.role,s.branch,s.display_name,s.is_active from staff s join auth.users u on u.id=s.user_id order by s.role,s.display_name;
end $$;

-- ---------- who may call what ----------
revoke all on function place_order, cancel_order, complete_order, delete_my_account, pos_sale, advance_orders, sales_summary, add_staff_by_email, set_staff_active, list_staff from public, anon;
grant execute on function place_order, cancel_order, complete_order, delete_my_account to authenticated;   -- guests are anonymous-auth users, so they have this role too
grant execute on function pos_sale, sales_summary, add_staff_by_email, set_staff_active, list_staff to authenticated;   -- each one checks the staff role inside
grant execute on function get_catalog to anon, authenticated;

-- ---------- realtime + storage ----------
do $$ begin alter publication supabase_realtime add table app_config, categories, menu_items, deals, branches, orders, expenses, stock_items, riders; exception when duplicate_object then null; end $$;
insert into storage.buckets(id,name,public) values('media','media',true) on conflict do nothing;
create policy media_read on storage.objects for select using (bucket_id='media');
create policy media_write on storage.objects for all using (bucket_id='media' and is_manager()) with check (bucket_id='media' and is_manager());
