alter table public.sponsors
  add column if not exists route text;

create unique index if not exists sponsors_name_route_unique_idx
  on public.sponsors (name_original, sponsor_type, route);
