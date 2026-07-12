---
name: native-sql
description: Write and parameterize native SQL for `execute_sql` and for `question_write`'s native source — template tags (text, number, date, dimension), field filters and their widget types, optional `[[...]]` clauses, snippet references, card references, and what the permission and kill-switch errors mean. Load when a query needs SQL that structured MBQL can't express, when a saved SQL question needs filters, or when a template tag is rejected. Triggers — "write SQL", "a window function", "parameterize this query", "add a date filter to the SQL question", "{{tag}} is not defined".
---

# Native SQL

`execute_sql(database_id, sql, template_tag_values?, validate_only?, row_limit?)` runs raw SQL as the
connected user. It needs native-query permission on that database, and an admin can turn it off
instance-wide — both failures say so, and neither is worked around by rewriting the SQL.

Reach for SQL when structured MBQL can't say it: window functions, recursive CTEs, engine-specific
syntax. Otherwise prefer `execute_query` — MBQL is portable across engines and validated before it
runs. Table and column names still come from `browse_data`, not from memory.

Like `execute_query`, `execute_sql` returns a `query_handle` — with `validate_only: true` it mints the
handle without executing (template tags and permissions are checked; the SQL itself is not). Pass that
handle to `question_write` or `visualize_query` instead of re-sending the SQL.

## Template tags

`{{tag}}` in the SQL is a parameter. `execute_sql` fills them from `template_tag_values` —
`{"status": "paid"}` — and these substitute through Metabase's template-tag mechanism, not the
driver's prepared statements. Never build a tag value out of user text you haven't constrained.

When you *save* the SQL with `question_write`, declare the tags so the saved question has real filter
widgets:

```json
{"method": "create",
 "name": "Orders by status",
 "native": {"database_id": 1,
            "sql": "SELECT * FROM orders WHERE status = {{status}} [[AND created_at > {{start}}]]",
            "template_tags": {
              "status": {"type": "text",   "name": "status", "display-name": "Status"},
              "start":  {"type": "date",   "name": "start",  "display-name": "Start date"}}}}
```

Every `{{tag}}` in the SQL needs an entry in `template_tags` and vice versa; a mismatch is rejected
with the name of the offending tag.

| `type` | The widget the user gets | Substitutes as |
| --- | --- | --- |
| `text` | a text box | a quoted string |
| `number` | a number box | a numeric literal |
| `date` | a date picker | a date literal |
| `dimension` | a **field filter** — the full Metabase filter widget for that column | a whole SQL condition |

## Field filters

A `dimension` tag is the one that behaves differently: it maps to a real column, and Metabase generates
the entire `WHERE` condition. Write it bare — no operator, no column name:

```sql
SELECT count(*) FROM orders WHERE {{created}}
```

```json
"created": {"type": "dimension",
            "name": "created",
            "display-name": "Created at",
            "dimension": ["field", {}, ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"]],
            "widget-type": "date/all-options"}
```

`widget-type` picks the UI: `date/all-options`, `date/range`, `date/month-year`, `string/=`,
`string/contains`, `number/=`, `number/between`, `id`, `category`. The column in `dimension` must be a
real column on a real table in the same database — this is where an unverified column name fails.

Field filters only work in a plain `WHERE`-style position. They cannot go inside a string literal, and
`WHERE {{filter}}` cannot be prefixed with a column or an operator.

## Optional clauses

`[[ ... ]]` wraps SQL that disappears when its tag has no value. Everything inside — including the
`AND` — is dropped:

```sql
SELECT * FROM orders WHERE 1=1 [[AND status = {{status}}]] [[AND total > {{min_total}}]]
```

Each bracketed block must contain exactly one tag. This is how one saved question serves "all orders"
and "paid orders over $100" without two cards.

## Snippets and card references

- `{{snippet: Active users}}` inlines a saved SQL snippet by name. Find snippets with
  `search(type: ["snippet"])`, read them with `get_content`, and maintain them with `snippet_write`
  (the `curation` skill). Reuse a snippet rather than pasting the same predicate into five questions.
- `{{#42-orders-by-month}}` inlines a saved question as a subquery — the numeric card id, then its
  slug. Prefer MBQL's `source-card` when the query is structured; use this only inside SQL.

## Common failures

- **"You do not have permission to run native queries"** — the user lacks native access to that
  database. Answer the question with `execute_query` instead, or say what's missing.
- **Native queries are disabled** — the instance kill switch is off. Nothing in the SQL will fix it.
- **A tag with no value** — a `{{tag}}` outside `[[...]]` with no value in `template_tag_values` is an
  error, not an empty string.
