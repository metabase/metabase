---
title: "Advanced config logs"
summary: |
  /api/logs endpoints.
  
    These endpoints are meant to be used by admins to download logs before entries are auto-removed after the day limit.
  
    For example, the `query_execution` table will have entries removed after 30 days by default, and admins may wish to
    keep logs externally for longer than this retention period.
---

# Advanced config logs

/api/logs endpoints.

  These endpoints are meant to be used by admins to download logs before entries are auto-removed after the day limit.

  For example, the `query_execution` table will have entries removed after 30 days by default, and admins may wish to
  keep logs externally for longer than this retention period.

## `GET /api/ee/logs/query_execution/:yyyy-mm`

Fetch rows for the month specified by `:yyyy-mm` from the query_execution logs table.
  Must be a superuser.

### PARAMS:

-  **`yyyy-mm`** Must be a string like 2020-04 or 2222-11.

---

[<< Back to API index](../../api-documentation.md)