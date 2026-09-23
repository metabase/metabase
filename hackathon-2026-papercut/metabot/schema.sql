create table if not exists pa_events (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  website_id  text,
  hostname    text,
  tag         text,
  distinct_id text,
  event_name  text not null,
  event_data  jsonb not null default '{}',
  raw         jsonb not null
);

create index if not exists pa_events_event_name_created_at on pa_events (event_name, created_at);
create index if not exists pa_events_created_at on pa_events (created_at);

create table if not exists triage_groups (
  fingerprint    text primary key,
  event_name     text not null,
  tool           text,
  error_class    text,
  category       text,
  first_seen     timestamptz not null,
  last_seen      timestamptz not null,
  event_count    integer not null,
  status         text not null,
  verdict        jsonb,
  issue_markdown text,
  issue_ref      text,
  updated_at     timestamptz not null default now()
);

create index if not exists triage_groups_last_seen on triage_groups (last_seen);
