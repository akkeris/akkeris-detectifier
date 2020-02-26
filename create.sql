do $$
begin

create extension if not exists "uuid-ossp";

create table if not exists scan_profiles (
  scan_profile uuid not null primary key,
  release uuid not null,
  name text not null,
  endpoint text not null,
  scan_status text not null,
  scan_profile_token text not null,
  report_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists releases (
  release uuid not null primary key,
  app_name text not null,
  status_id uuid not null,
  token text not null,
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

end
$$;