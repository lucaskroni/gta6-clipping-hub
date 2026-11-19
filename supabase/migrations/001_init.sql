-- GTA 6 Clipping Hub: tables, team-only security, live updates.

-- ---------- who is on the team ----------
create table public.allowed_emails (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
-- no policies: the browser can never read or change this list.

create or replace function public.is_team()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_team() from public;
grant execute on function public.is_team() to authenticated;

-- Refuse to create a login for anyone not on the list.
create or replace function public.only_team_can_sign_up()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.allowed_emails where email = lower(new.email)) then
    raise exception 'This app is only for the team.';
  end if;
  return new;
end;
$$;
revoke all on function public.only_team_can_sign_up() from public, anon, authenticated;
create trigger only_team_can_sign_up
  before insert on auth.users
  for each row execute function public.only_team_can_sign_up();

-- ---------- app data ----------
create table public.settings (
  id int primary key default 1 check (id = 1),
  name_a text not null default 'Lucas' check (char_length(name_a) <= 16),
  name_b text not null default 'Leo' check (char_length(name_b) <= 16),
  updated_at timestamptz not null default now()
);

create table public.progress (
  task_id text primary key check (char_length(task_id) <= 64),
  done boolean not null default false,
  count int not null default 0 check (count >= 0 and count <= 10000),
  updated_at timestamptz not null default now()
);

create table public.custom_tasks (
  id uuid primary key default gen_random_uuid(),
  step int not null check (step between 0 and 3),
  title text not null check (char_length(title) between 1 and 80),
  how text not null default '' check (char_length(how) <= 200),
  owner text not null default 'both' check (owner in ('a', 'b', 'both')),
  created timestamptz not null default now()
);

create table public.campaigns (
  id text primary key default gen_random_uuid()::text,
  name text not null check (char_length(name) between 1 and 120),
  org text not null default '',
  site text not null default '',
  link text not null default '',
  rate numeric not null default 0,
  rate_up_to boolean not null default false,
  max_per_clip numeric not null default 0,
  budget_used numeric not null default 0,
  budget_total numeric not null default 0,
  budget text not null default '',
  category text not null default 'other' check (category in ('gta6', 'gaming', 'other')),
  live boolean not null default true,
  platforms jsonb not null default '{"yt": false, "tt": false, "ig": false}',
  note text not null default '' check (char_length(note) <= 400),
  found_by text not null default 'team' check (found_by in ('claude', 'team')),
  found_at timestamptz,
  checked_at timestamptz,
  status text not null default 'considering' check (status in ('considering', 'joined', 'dropped')),
  pick_a boolean not null default false,
  pick_b boolean not null default false,
  created timestamptz not null default now()
);

create table public.clip_jobs (
  id text primary key default gen_random_uuid()::text,
  url text not null,
  tool text not null default 'OpusClip' check (tool in ('OpusClip', 'Everygen')),
  length int not null default 20 check (length between 10 and 90),
  count int not null default 6 check (count between 1 and 10),
  who text not null default 'a' check (who in ('a', 'b')),
  owner_id uuid references auth.users (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'starting', 'processing', 'done', 'error')),
  project_id text not null default '',
  job_id text not null default '',
  share_url text not null default '',
  title text not null default '',
  error text not null default '',
  clips jsonb not null default '[]',
  created timestamptz not null default now(),
  finished timestamptz
);

create table public.meta (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  target text not null check (char_length(target) <= 100),  -- e.g. task:yt, campaign:abc, job:xyz
  author_email text not null default lower(coalesce(auth.jwt() ->> 'email', '')),
  body text not null check (char_length(body) between 1 and 1000),
  created timestamptz not null default now()
);
create index comments_target_idx on public.comments (target, created);

-- ---------- security: only the team, for every table ----------
do $$
declare t text;
begin
  foreach t in array array['settings', 'progress', 'custom_tasks', 'campaigns', 'clip_jobs', 'meta', 'comments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "team can read" on public.%I for select to authenticated using ((select public.is_team()))', t);
    execute format('create policy "team can add" on public.%I for insert to authenticated with check ((select public.is_team()))', t);
    execute format('create policy "team can change" on public.%I for update to authenticated using ((select public.is_team())) with check ((select public.is_team()))', t);
    execute format('create policy "team can delete" on public.%I for delete to authenticated using ((select public.is_team()))', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;

insert into public.settings (id) values (1) on conflict do nothing;
