---
name: native-parameters
description: Template tags for native SQL — question_write's `native` and execute_sql's `template_tags` — tag kinds, field-filter vs raw-variable, the template_tags shape, widget types, [[ ]] optional blocks, {{#id}} card references and their column aliases, wiring tags to dashboards. Read before first passing template_tags. Triggers — "add a filter widget to my SQL", "parameterize this query", "field filter", "why does my variable return no rows", "wire a dashboard filter to a SQL card".
---

# Native SQL parameters (template tags)

**Prefer MBQL** (`execute_query` + `question_write`'s `query` — validated server-side); use `native` only when MBQL can't express it (engine-specific functions, CTEs, hand-tuned SQL) or the user asks for SQL.

```
question_write {"method": "create", "name": "Orders by status",
                "native": {"database_id": 1,
                           "sql": "SELECT status, count(*) FROM orders WHERE {{category}} AND total > {{min_total}} GROUP BY status",
                           "template_tags": {
                             "category":  {"type": "dimension", "field_id": 18, "widget_type": "string/=", "display_name": "Category"},
                             "min_total": {"type": "number", "display_name": "Minimum total", "default": 0}}}}
```

Every `{{name}}` in the SQL is a template tag. The server extracts them from the SQL; `template_tags` entries **configure** the extracted tags, keyed by the exact `{{name}}` (case-sensitive). Naming a tag absent from the SQL is an error. The server mints tag ids — never supply one. Unconfigured tags default to plain text variables.

## The decision that matters: field filter vs raw variable

Default to a **field filter** (`"type": "dimension"`) whenever the tag filters a real table column.

- A **field filter** binds a column (`field_id`) and gets a smart widget (`widget_type`): value dropdown, date picker. Write it **bare** — `WHERE {{category}}` — and Metabase expands the right SQL (`category IN (...)`, `BETWEEN` for dates). `WHERE category = {{category}}` around a field filter **breaks the expansion** — the most common native-SQL bug.
- A **raw variable** (`"type": "text" | "number" | "date" | "boolean"`) is a literal splice; you write the operator: `WHERE total > {{min_total}}`, `LIMIT {{n}}`. Plain input box.
- Field filters bind only a **real, connected database column** — not an expression, aggregate, or subquery/CTE column; anything else must be a raw variable.
- **Empty values degrade differently.** A field filter with no value compiles to `1 = 1`, so the query still runs. A raw variable with no value does not — outside `[[ ]]` it fails the run with "missing required parameters" even when the tag isn't marked `required`. Give every main-clause raw variable a `default`, or wrap its clause in `[[ ]]`. Caveat: a boolean tag's `false` default is treated as unset — for a main-clause boolean, pass the value explicitly on every run, or keep its clause in `[[ ]]`.
- A **temporal-unit** tag (`"type": "temporal-unit", "field_id": …`) gives the viewer a time-bucket picker (day/week/month) for a datetime column.

## The tag shape

```
"tag_name": {"type": "dimension" | "temporal-unit" | "text" | "number" | "date" | "boolean",
             "field_id": <numeric id or 21-char entity_id>,   // required for dimension / temporal-unit
             "widget_type": "string/=",                        // required for dimension
             "display_name": "Label",                          // optional
             "required": true,                                 // optional; blocks the run until a value is given
             "default": "Gadget"}                              // optional
```

Field ids: `browse_data {"action": "get_fields", "table_ids": [<table id>]}`. `widget_type` must suit the column's type:

| Column type | widget_type |
|---|---|
| Text | `string/=` `string/!=` `string/contains` `string/does-not-contain` `string/starts-with` `string/ends-with` `category` |
| Number | `number/=` `number/!=` `number/between` `number/>=` `number/<=` |
| Date/datetime | `date/all-options` (fullest picker) `date/single` `date/range` `date/relative` `date/month-year` `date/quarter-year` |
| Boolean | `boolean/=` |
| PK/FK | `id` |
| Location semantic type | `location/city` `location/state` `location/zip_code` `location/country` |

**Round-trip:** `get_content` returns a question's `template_tags` in the stored shape (`display-name`, `widget-type`, a `dimension` ref) — `question_write` accepts it back verbatim; copy, edit, resend.

## Optional blocks: `[[ ... ]]`

Wrap any clause that should drop when its value is empty, keyword included: `WHERE true [[AND {{category}}]] [[AND total > {{min_total}}]]`. One nesting level; several optional `AND` blocks need a real `WHERE` first. A `required: true` tag or one with a `default` always has a value, so its clause never drops.

**An unbound `[[ ]]` block hides broken SQL.** The block is deleted before the SQL is parsed, so a typo'd column or table name inside it never errors on a run that leaves the tag empty — the query "passes" with the defect intact. Always test every optional block at least once with its value bound (via `execute_sql`'s `template_tag_values` or `run_saved_question`'s `parameters`).

## Snippet and card references

- `{{#42}}` (or `{{#42-slug}}`) inlines saved card 42 as a subquery: `SELECT * FROM {{#42}}`, `WITH x AS {{#42}} …`. It runs with its own saved defaults — its parameters can't be set from the parent.
- **The subquery's column names are compile-time SQL aliases, not the card's displayed names.** For an MBQL card: an aggregation is its machine name (`count`, `avg`, `avg_2` for the second average); a column from an explicit join is `<JoinAlias>__<COL>` (`Products__CATEGORY`); a column reached through an implicit FK is `<TABLE>__via__<FK>__<COL>` (`PEOPLE__via__USER_ID__STATE`); a collision appends `_2` (`TITLE_2`). Don't derive these by hand — read them with `get_content` `include: ["fields"]`, whose `native_reference` section lists the exact aliases for the `{{#id}}` reference. Machine names collide with SQL keywords, so quote them: `SELECT cs."avg", cs."count" FROM {{#42}} cs`.
- `{{snippet: Name}}` splices a shared SQL snippet by name — it must already exist (find via `search` or `get_content` type `snippet`).
- Neither takes a value or wires to a dashboard parameter — only field filters and raw variables are user-fillable. Nothing to configure in `template_tags`; entries for them (as `get_content` returns) are accepted on round-trip and ignored.

## Running and wiring

**Run with values** — `run_saved_question` takes `{id, value}` pairs; `id` is the parameter's id **or slug** from `get_content`'s `parameters`. An equality field filter takes an array even for one value:

```
run_saved_question {"id": 522, "parameters": [{"slug": "category", "value": ["Gadget"]},
                                              {"slug": "min_total", "value": 100}]}
```

Date parameters (a `date` variable or a date field filter) take Metabase's date-string grammar, never a SQL fragment: `"2026-01-05"` (day), `"2026-01-01~2026-03-31"` (range), `"2026-01"` (month), `"past30days"`, `"thisyear"`.

**Wire to a dashboard filter** — `dashboard_write`'s `wire_parameter` names the tag; the server derives the mapping from the tag's type, so field filters and variables wire identically:

```
dashboard_write {"method": "update", "id": 40,
                 "ops": [{"op": "add_parameter", "parameter_id": "category", "name": "Category", "type": "string/=", "sectionId": "string"},
                         {"op": "wire_parameter", "parameter_id": "category", "dashcard_id": 7, "target_tag": "category"}]}
```

The dashboard parameter's `type` must be compatible with the tag's widget_type (same vocabulary). Dashboard-side detail: `learn("dashboard-filters")`.

**Ad-hoc SQL** (no saved card): `execute_sql` binds `{{tag}}` values via `template_tag_values` — plain variables bind as prepared-statement parameters from the value's JSON type alone. To exercise a **field filter or temporal-unit tag before saving**, declare it in `execute_sql`'s `template_tags` (same shape as above) and bind its value in `template_tag_values` using the widget's value shape: a list for equality/containment (`["Gadget"]`; a bare scalar is wrapped for you), the date grammar string for date widgets, `[min, max]` for `number/between`. Test the SQL this way first, then save the exact query via `question_write` with the returned `query_handle` — never loosen the card (e.g. wrapping a required filter in `[[ ]]`) just to make it testable.

## Don't

- Don't wrap a field filter in an operator (`WHERE col = {{ff}}`) — write it bare (`WHERE {{ff}}`).
- Don't pass `dimension`, `id`, or hand-minted UUIDs when authoring — `field_id` is the write dialect; the server builds the ref and mints ids. (Read-shape keys are accepted on round-trip, not required.)
- Don't omit `widget_type` on a dimension tag, or `field_id` on a dimension/temporal-unit tag — required.
- Don't use native SQL for DDL or `;`-chained statements — single read statement only.
- Don't expect `[[ ]]` to fix a case/type mismatch — `WHERE plan = {{p}}` returns zero rows on a case-sensitive engine when the value's case is off.
- Don't trust a run where every `[[ ]]` block dropped — deleted blocks are never parsed, so broken SQL inside them passes silently; bind each one at least once.
- Don't guess a `{{#id}}` subquery's column aliases — read them from `get_content` `include: ["fields"]` (`native_reference`).
- Don't name a tag in `template_tags` with no `{{tag}}` in the SQL — an error, not a no-op.
- Don't rely on `default: false` on a boolean tag — a false default reads as no default, and a run that omits the value fails with "missing required parameters". Pass the boolean on every run, or wrap its clause in `[[ ]]`.
