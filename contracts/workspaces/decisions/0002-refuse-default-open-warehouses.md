# 0002. Refuse warehouses that are open by default

- Status: proposed
- Lands with: #86588, #86798, #86799
- Date: 2026-11-10

## Context

Every engine checks at setup that the workspace login can't write or read outside its scratch area. Some stock setups fail that check: on Redshift and Postgres 14 and older, `public` lets every login create tables; on ClickHouse 23.3 to 24.3, every login can read `system.query_log`, including other users' query text.

## Decision

Workspace setup refuses such a warehouse with a 412 that says what to run and who runs it (`REVOKE CREATE ON SCHEMA public FROM PUBLIC;`, or the ClickHouse server setting). The docs list it as an admin prerequisite.

## Alternatives rejected

- Warn and allow: the workspace login could write (Redshift, Postgres) or read (ClickHouse) past its boundary, and a later `DROP USER` fails on tables it owns.
- A per-database opt-out: deferred; we may add it if admins hit this often.

## Consequences

On a stock Redshift, Postgres 14 or ClickHouse 23.3-24.3 warehouse, the first create fails until an admin runs one statement. Asked in Slack; no objections.

## Resources

- https://metaboat.slack.com/archives/C0BJK4WVBAN/p1794340430909769
- https://github.com/metabase/metabase/pull/86588
- https://github.com/metabase/metabase/pull/86798
- https://github.com/metabase/metabase/pull/86799
