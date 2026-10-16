---
id: troubleshoot-sync-scan
title: Missing tables, columns or filter values (sync and scan)
description: New tables or columns don't show up, or filter dropdowns are missing values or out of date.
references:
  - troubleshooting-guide/sync-fingerprint-scan.md
  - databases/sync-scan.md
  - troubleshooting-guide/cant-see-tables.md
---
1. Figure out which it is: a table or column that's missing entirely (sync), or filter values that are missing or stale (scan).
2. For sync: explain how to trigger a manual sync from the database's admin page, and check that the database user Metabase connects with can see that schema or table.
3. For scan: explain the scan schedule and how to re-scan field values. Mention that fields with very many distinct values may get a search box instead of a dropdown.
4. If a manual sync doesn't help, ask them to look at the server logs during the sync for errors.
