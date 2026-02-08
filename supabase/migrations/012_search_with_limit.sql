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
stable
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
