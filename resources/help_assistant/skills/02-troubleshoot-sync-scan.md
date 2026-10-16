---
id: troubleshoot-sync-scan
title: Missing tables or columns (sync)
description: New tables, views or columns don't show up in Metabase, or renamed or deleted columns still show their old state.
references:
  - troubleshooting-guide/sync-fingerprint-scan.md
  - databases/sync-scan.md
  - troubleshooting-guide/cant-see-tables.md
---
If the problem is filter dropdown values that are missing or out of date, use the filters skill instead.

Ask one question at a time, and skip any the user has already answered.

First questions, in this order:
1. Is it missing for everyone, or only for some people? If only some people, it's more likely permissions; use the skill for people who can't see data.
2. Is it one table or column, or a whole database or schema?
3. Is it new in the database, or was it in Metabase before?

Causes to check, most common first:
- Metabase hasn't synced since the change. A manual re-sync of the table or database is the first fix. A brand new database connection also needs time for its first sync.
- The database user Metabase connects with can't see the schema, table or view. Check it by querying the table from the SQL editor.
- The table is hidden in Table Metadata.
- The sync is failing. Check the logs during a sync for errors.
- Self-hosted with a community database driver: the driver may be out of date.
