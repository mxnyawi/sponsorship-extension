drop function if exists public.search_sponsors(text, int, float);

create or replace function public.search_sponsors(
  query text,
  limit_count int default 5,
  similarity_threshold float default 0.82
)
returns table(
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
  q text := public.normalize_company_name(query);
begin
  if q = '' then
    return;
  end if;

  return query
  select
    case
      when s.name_normalized = q then 'exact'
      else 'fuzzy'
    end as match_type,
    case
      when s.name_normalized = q then 1.0::double precision
      else similarity(s.name_normalized, q)::double precision
    end as score,
    s.name_original,
    s.town_city,
    s.county,
    s.sponsor_type,
    s.route,
    s.register_url,
    s.last_updated
  from public.sponsors s
  where s.last_updated = (select max(s2.last_updated) from public.sponsors s2)
    and (s.name_normalized = q
     or similarity(s.name_normalized, q) >= similarity_threshold)
  order by
    (s.name_normalized = q) desc,
    similarity(s.name_normalized, q) desc
  limit limit_count;
end;
$$;
