drop function if exists public.search_sponsors_limited(text, text, int, float, int);
drop function if exists public.rate_limit_check(text, int);

create or replace function public.rate_limit_check(
  p_client_key text,
  limit_per_hour int default 120
)
returns table(
  allowed boolean,
  remaining int,
  reset_at timestamptz
)
language plpgsql
volatile
security definer
as $$
declare
  now_ts timestamptz := now();
begin
  insert into public.api_rate_limits (client_key, window_start, count)
  values (p_client_key, now_ts, 1)
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
  where public.api_rate_limits.client_key = p_client_key;
end;
$$;

create or replace function public.search_sponsors_limited(
  query text,
  client_key text,
  limit_count int default 5,
  similarity_threshold float default 0.82,
  limit_per_hour int default 120
)
returns table(
  allowed boolean,
  remaining int,
  reset_at timestamptz,
  match_type text,
  score double precision,
  name_original text,
  town_city text,
  county text,
  sponsor_type text,
  route text,
  register_url text,
  last_updated date
)
language plpgsql
volatile
security definer
as $$
declare
  rate record;
begin
  select * into rate from public.rate_limit_check(client_key, limit_per_hour);
  if rate.allowed is not true then
    return query
    select rate.allowed, rate.remaining, rate.reset_at,
      null, null, null, null, null, null, null, null, null;
    return;
  end if;

  return query
  select
    rate.allowed,
    rate.remaining,
    rate.reset_at,
    s.match_type,
    s.score,
    s.name_original,
    s.town_city,
    s.county,
    s.sponsor_type,
    s.route,
    s.register_url,
    s.last_updated
  from public.search_sponsors(query, limit_count, similarity_threshold) s;
end;
$$;
