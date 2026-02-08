drop index if exists public.sponsors_name_unique_idx;
drop index if exists public.sponsors_name_route_unique_idx;

create unique index if not exists sponsors_name_route_location_unique_idx
  on public.sponsors (name_original, sponsor_type, route, town_city, county);
