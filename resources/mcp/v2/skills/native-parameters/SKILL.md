---
name: native-parameters
description: Template tags for native SQL questions written through question_write's `native` — tag kinds, field-filter vs raw-variable, the template_tags shape, widget types, [[ ]] optional blocks, wiring tags to dashboards. Read before first passing template_tags. Triggers — "add a filter widget to my SQL", "parameterize this query", "field filter", "why does my variable return no rows", "wire a dashboard filter to a SQL card".
---

# Native SQL parameters (template tags)

Prefer MBQL (`execute_query` + `question_write` `query`, validated server-side). Use `native` only for what MBQL can't express (engine-specific functions, CTEs, window functions) or when the user asks for SQL: a raw-SQL card can't take a dashboard filter until that filter is a template tag, while an MBQL card wires as-is.

```
question_write {"method": "create", "name": "Orders by status",
                "native": {"database_id": 1,
                           "sql": "SELECT status, count(*) FROM orders WHERE {{category}} AND total > {{min_total}} GROUP BY status",
                           "template_tags": {
                             "category":  {"type": "dimension", "field_id": 18, "widget_type": "string/=", "display_name": "Category"},
                             "min_total": {"type": "number", "display_name": "Minimum total", "default": 0}}}}
```

Every `{{name}}` in the SQL is a tag. The server extracts them; `template_tags` configures them, keyed by the exact case-sensitive name — naming a tag absent from the SQL is an error. Never supply tag ids (the server mints them). Unconfigured tags are plain text variables.

## Field filter vs raw variable

Default to a **field filter** (`"type": "dimension"`) whenever the tag filters a real table column.

- **Field filter** — binds a column (`field_id`), gets a smart widget (`widget_type`: dropdown, date picker). Write it **bare**, `WHERE {{category}}`; Metabase expands it (`category IN (...)`, `BETWEEN` for dates). `WHERE category = {{category}}` breaks the expansion — the most common native bug.
- **Raw variable** (`text` | `number` | `date` | `boolean`) — literal splice, you write the operator: `WHERE total > {{min_total}}`, `LIMIT {{n}}`. Plain input box.
- A field filter needs a real, connected column — not an expression, aggregate, or subquery/CTE column (use a raw variable) — and **the real table name: never alias the filtered table**. The expansion emits `orders.status`; under `FROM orders o` that name is out of scope and the card errors at run time, on dashboards too. Keep `FROM orders`, or qualify `FROM public.orders`.

```sql
SELECT count(*) FROM orders WHERE {{status}}     -- works
SELECT count(*) FROM orders o WHERE {{status}}   -- fails: orders.status is hidden by the alias
```

- **Empty values** — a field filter with no value compiles to `1 = 1`; a raw variable with no value outside `[[ ]]` fails with "missing required parameters" even without `required`. Give every main-clause raw variable a `default` or wrap its clause in `[[ ]]`. A boolean's `default: false` reads as no default: pass it on every run, or use `[[ ]]`.
- **`temporal-unit`** tag (`field_id` of a datetime column) — the viewer picks the bucket (day/week/month).

## Tag shape

```
"tag_name": {"type": "dimension" | "temporal-unit" | "text" | "number" | "date" | "boolean",
             "field_id": <numeric id or 21-char entity_id>,   // required for dimension / temporal-unit
             "widget_type": "string/=",                        // required for dimension
             "display_name": "Label",                          // optional
             "required": true,                                 // optional; blocks the run until a value is given
             "default": "Gadget"}                              // optional
```

Field ids: `browse_data {"action": "get_fields", "table_ids": [<table id>]}`. `widget_type` by column type:

| Column type | widget_type |
|---|---|
| Text | `string/=` `string/!=` `string/contains` `string/does-not-contain` `string/starts-with` `string/ends-with` `category` |
| Number | `number/=` `number/!=` `number/between` `number/>=` `number/<=` |
| Date/datetime | `date/all-options` (fullest picker) `date/single` `date/range` `date/relative` `date/month-year` `date/quarter-year` |
| Boolean | `boolean/=` |
| PK/FK | `id` |
| Location semantic type | `location/city` `location/state` `location/zip_code` `location/country` |

Round-trip: `get_content` returns `template_tags` in the stored shape (`display-name`, `widget-type`, a `dimension` ref); `question_write` accepts it back verbatim. Don't author that shape or hand-mint ids — `field_id` is the write dialect.

## Optional blocks `[[ ... ]]`

Wrap any clause that should drop when its value is empty, keyword included: `WHERE true [[AND {{category}}]] [[AND total > {{min_total}}]]`. One nesting level; several optional `AND` blocks need a real `WHERE` first. A `required` tag or one with a `default` always has a value, so its clause never drops. `[[ ]]` doesn't fix a case/type mismatch: `WHERE plan = {{p}}` returns zero rows on a case-sensitive engine when the value's case is off.

## Snippet and card references

- `{{#42}}` (or `{{#42-slug}}`) inlines card 42 as a subquery: `SELECT * FROM {{#42}}`, `WITH x AS {{#42}} …`. It runs with its own saved defaults; its parameters can't be set from the parent.
- Its columns are the card's result columns. MBQL aggregations get machine names (`count`, `avg`, then `avg_2`) that collide with SQL keywords — quote them: `SELECT cs."avg", cs."count" FROM {{#42}} cs`. Run the card once to see the exact names.
- `{{snippet: Name}}` splices an existing shared snippet (find via `search` or `get_content` type `snippet`).
- Neither takes a value or wires to a dashboard parameter; nothing to configure in `template_tags` (entries `get_content` returns for them round-trip and are ignored).

## Running and wiring

**Run** — `run_saved_question` takes `{id | slug, value}` pairs (from `get_content`'s `parameters`); an equality field filter takes an array even for one value:

```
run_saved_question {"id": 522, "parameters": [{"slug": "category", "value": ["Gadget"]},
                                              {"slug": "min_total", "value": 100}]}
```

Date values use Metabase's date grammar, never a SQL fragment: `"2026-01-05"`, `"2026-01-01~2026-03-31"`, `"2026-01"`, `"past30days"`, `"thisyear"`.

**Wire** — `wire_parameter` with `target_tag`; the server derives the mapping from the tag type, so field filters and variables wire identically. The parameter `type` must fit the tag's widget_type (same vocabulary). Dashboard side: `learn("dashboard-filters")`.

```
dashboard_write {"method": "update", "id": 40,
                 "ops": [{"op": "add_parameter", "parameter_id": "category", "name": "Category", "type": "string/=", "sectionId": "string"},
                         {"op": "wire_parameter", "parameter_id": "category", "dashcard_id": 7, "target_tag": "category"}]}
```

**Ad hoc** — `execute_sql` binds `{{tag}}` values via `template_tag_values` as prepared-statement parameters: plain variables only; field filters exist only on saved questions. Single read statement — no DDL or `;`-chains.

## Don't

- Don't wrap a field filter in an operator, alias its table, or bind it to a non-column.
- Don't omit `widget_type` on a dimension tag or `field_id` on a dimension/temporal-unit tag.
- Don't leave a main-clause raw variable without a `default` or `[[ ]]`; don't trust `default: false`.
