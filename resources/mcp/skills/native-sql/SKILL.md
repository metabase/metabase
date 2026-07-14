---
name: native-sql
description: Run raw SQL with `execute_sql` and save it as a question with `construct_native_query` — when SQL is the right reach rather than MBQL, the two-tool save path, the row cap on results, and what the permission and kill-switch errors mean. Load when a question needs SQL that structured MBQL can't express, or when a SQL call is refused. Triggers — "write SQL", "a window function", "run this query against the warehouse", "save this SQL as a question", "I don't have permission to run native queries".
---

# Native SQL

`execute_sql(database_id, sql)` runs raw SQL as the connected user and streams back rows and column
metadata. That is the whole signature: a database and a complete SQL string. There are no parameter
values to pass, so write the constants into the SQL yourself.

Reach for SQL only when structured MBQL can't say it: window functions, recursive CTEs,
engine-specific syntax. Otherwise prefer `execute_query` — MBQL is portable across engines, and it is
validated against the real schema before it runs, so a bad column name comes back as an error that
names the column instead of a database exception. Table and column names still come from `browse_data`,
never from memory.

Results are capped at Metabase's standard row limit. To answer a question about many rows, aggregate in
the SQL — never page through them.

## Saving SQL as a question

`execute_sql` runs SQL but mints no handle, so it is not itself a save path. Saving takes two calls:

1. `construct_native_query(database_id, sql)` — returns a `query_handle`. It does not run the SQL.
2. `create_question(query: "<the handle>", name, display?)` — saves it.

```json
{"database_id": 1,
 "sql": "SELECT status, count(*) AS orders FROM orders GROUP BY status ORDER BY orders DESC"}
```

Run the SQL with `execute_sql` first and read the rows. A query you never ran is a query you are
guessing about, and `construct_native_query` validates nothing — a typo survives all the way into the
saved question.

Saving a native question requires native-query permission on the target database, the same permission
running one does. `update_question` also takes a handle in `query`, so repointing a saved question at
corrected SQL is a `construct_native_query` followed by an `update_question`.

## When SQL is refused

- **"You do not have permission to run native queries"** — the user lacks native access to that
  database. Answer the question with `execute_query` instead, or say what's missing. Rewriting the SQL
  will not help.
- **Native queries are disabled** — an admin has turned `execute_sql` off instance-wide. Nothing in the
  SQL will fix it; `execute_query` still works.

Neither is a transient failure. Do not retry either one.
