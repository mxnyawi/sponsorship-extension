create or replace function public.bulk_upsert_sponsors(payload jsonb)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.sponsors (
    name_original,
    name_normalized,
    town_city,
    county,
    sponsor_type,
    route,
    register_url,
    last_updated
  )
  select
    (item->>'name_original')::text,
    (item->>'name_normalized')::text,
    (item->>'town_city')::text,
    (item->>'county')::text,
    (item->>'sponsor_type')::text,
    (item->>'route')::text,
    (item->>'register_url')::text,
    (item->>'last_updated')::date
  from jsonb_array_elements(payload) as item
  on conflict (name_original, sponsor_type, route, town_city, county)
  do update set
    name_normalized = excluded.name_normalized,
    town_city = excluded.town_city,
    county = excluded.county,
    register_url = excluded.register_url,
    last_updated = excluded.last_updated;
end;
$$;
