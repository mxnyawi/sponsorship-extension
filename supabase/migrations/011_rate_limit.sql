create table if not exists public.api_rate_limits (
  client_key text primary key,
  window_start timestamptz not null,
  count int not null
);

alter table public.api_rate_limits enable row level security;

create or replace function public.rate_limit_check(
  client_key text,
  limit_per_hour int default 120
)
returns table(
  allowed boolean,
  remaining int,
  reset_at timestamptz
)
language plpgsql
security definer
as $$
declare
  now_ts timestamptz := now();
begin
  insert into public.api_rate_limits (client_key, window_start, count)
  values (client_key, now_ts, 1)
  on conflict (client_key)
  do update set
    count = case
      when public.api_rate_limits.window_start < (now_ts - interval '1 hour') then 1
      else public.api_rate_limits.count + 1
    end,
    window_start = case
      when public.api_rate_limits.window_start < (now_ts - interval '1 hour') then now_ts
      else public.api_rate_limits.window_start
    end;

  return query
  select
    (case
      when public.api_rate_limits.window_start < (now_ts - interval '1 hour') then true
      when public.api_rate_limits.count <= limit_per_hour then true
      else false
    end) as allowed,
    greatest(limit_per_hour - public.api_rate_limits.count, 0) as remaining,
    public.api_rate_limits.window_start + interval '1 hour' as reset_at
  from public.api_rate_limits
  where public.api_rate_limits.client_key = client_key;
end;
$$;
