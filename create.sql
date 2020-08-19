do $$
begin

create extension if not exists "uuid-ossp";

create table if not exists scan_profiles (
  scan_profile uuid not null primary key,
  release uuid,
  name text not null,
  endpoint text not null,
  akkeris_app text not null,
  scan_status text not null,
  scan_profile_token text not null,
  report_filename text,
  success_threshold integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists releases (
  release uuid not null primary key,
  app_name text not null,
  status_id uuid not null,
  payload text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists errors (
  error uuid not null primary key,
  description text,
  release uuid,
  scan_profile uuid,
  created_at timestamptz not null default now()
);

create table if not exists sites (
  akkeris_app text not null primary key,
  site text not null
);

-- Changed release column to be optional
alter table scan_profiles alter column release drop not null;

-- Add "akkeris_app" column, set to releases.app_name, then make the column "not null"
if not exists(select 1 from information_schema.columns where table_name = 'scan_profiles' and column_name = 'akkeris_app') then
  alter table scan_profiles add column if not exists akkeris_app text;
  update scan_profiles as s set akkeris_app = releases.app_name from releases where releases.release = s.release;
  alter table scan_profiles alter column akkeris_app set not null;
end if;

-- Removed short lived token from releases column
alter table releases drop column if exists token;

-- Add success threshold column
alter table scan_profiles add column if not exists success_threshold integer;

end
$$;