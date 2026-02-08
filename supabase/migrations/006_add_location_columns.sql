alter table public.sponsors
  add column if not exists town_city text,
  add column if not exists county text;
