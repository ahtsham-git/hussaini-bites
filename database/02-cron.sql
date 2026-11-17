-- Run this AFTER 01-schema.sql and AFTER enabling the pg_cron extension (Dashboard > Database > Extensions > pg_cron).
-- It makes app order statuses move on by themselves every minute (cashier accepts, then the timings you set in the dashboard apply).
create extension if not exists pg_cron;
do $$ begin perform cron.unschedule('advance-orders'); exception when others then null; end $$;
select cron.schedule('advance-orders','* * * * *','select public.advance_orders()');
-- To pause all automation without touching the schedule: set timing.auto=false in the dashboard (App Control > Order timing).
