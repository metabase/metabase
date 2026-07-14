---
name: native-sql
description: Run raw SQL with `execute_sql` — when SQL is the right reach rather than MBQL, how to give a query variables, how to save what you ran, the row cap on results, and what the permission and kill-switch errors mean. Load when a question needs SQL that structured MBQL can't express, or when a SQL call is refused. Triggers — "write SQL", "a window function", "run this query against the warehouse", "save this SQL as a question", "I don't have permission to run native queries".
---

# Native SQL

`execute_sql(database_id, sql)` runs raw SQL as the connected user and returns rows, column metadata, and a
`query_handle` naming the query that ran.

Reach for SQL only when structured MBQL can't say it: window functions, recursive CTEs, engine-specific
syntax. Otherwise prefer `execute_query` — MBQL is portable across engines, and it is validated against the
real schema before it runs, so a bad column name comes back as an error that names the column instead of a
database exception. Table and column names still come from `browse_data`, never from memory.

```json
{"database_id": 1,
 "sql": "SELECT status, count(*) AS orders FROM orders GROUP BY status ORDER BY orders DESC"}
```

## Variables

Write `{{name}}` in the SQL and pass the value in `template_tag_values`. Metabase substitutes it as the type
you send — a number as a number, a string as a string — so you do not paste values into the SQL yourself.

```json
{"database_id": 1,
 "sql": "SELECT id, total FROM orders WHERE status = {{status}} AND total > {{floor}} ORDER BY id",
 "template_tag_values": {"status": "paid", "floor": 100}}
```

`[[AND status = {{status}}]]` wraps a clause that is dropped entirely when the variable has no value.

A value is a string, a number, or a boolean. `{{snippet: name}}` and `{{#123}}` are references, not
variables: Metabase resolves them itself, and they take no value.

## Saving SQL as a question

Every `execute_sql` call returns a `query_handle`. Pass it to `create_question` — that saves the query you
just ran, variables and all, with no second copy of the SQL:

```json
{"query_handle": "<the handle>", "name": "Paid orders"}
```

Run the SQL and read the rows before you save it. Nothing validates SQL but the database, so a typo in a
query you never ran survives into the saved question. `validate_only: true` mints the handle without running
anything — reach for it to chart or save a query whose rows you don't need in front of you, not as a check
that the SQL is correct, which it is not.

`update_question` takes a handle in `query` too, so repointing a saved question at corrected SQL is an
`execute_sql` followed by an `update_question`.

Saving a native question requires native-query permission on the database, the same permission running one
does.

## Reading more rows

`row_limit` defaults to 100 (max 2000). A page that would not fit the response comes back smaller and says
so. To read further, pass the `query_handle` back with an `offset` — but paging re-reads the query, so it is
bounded by the instance's row cap, and it is only sound if the SQL has an `ORDER BY`.

To answer a question about many rows, aggregate in the SQL. Never page through them.

## When SQL is refused

- **"You do not have permission to run native queries"** — the user lacks native access to that database.
  Answer the question with `execute_query` instead, or say what's missing. Rewriting the SQL will not help.
- **"Raw SQL is disabled on this instance"** — an admin has turned `execute_sql` off. Nothing in the SQL will
  fix it; `execute_query` still works.

Neither is a transient failure. Do not retry either one.
