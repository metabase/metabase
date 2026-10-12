---
name: dashboard-filters
description: Dashboard parameters via dashboard_write — add_parameter types and value sources, the wire_parameter target grammar (target_field vs target_tag vs raw target), autowire, linked filters, inline parameters, tab visibility. Read before your first add_parameter or wire_parameter. Triggers — "add a filter to this dashboard", "wire a filter to these cards", "make a filter cascade", "filter dropdown values", "why isn't my filter showing / doing anything".
---

# Dashboard filters

A filter is **a parameter plus a wire per card**: `add_parameter` creates the widget, and it filters nothing until `wire_parameter` connects it to a card — the most common "my filter does nothing" cause. Both are `dashboard_write` ops in one atomic call:

```
dashboard_write {"method": "update", "id": 40,
                 "ops": [{"op": "add_parameter", "parameter_id": "category", "name": "Category",
                          "type": "string/=", "sectionId": "string"},
                         {"op": "wire_parameter", "parameter_id": "category", "dashcard_id": 7,
                          "target_field": 18, "autowire": true}]}
```

`parameter_id` is a short slug you choose and reuse in later ops; the server derives the URL slug from `name`. `get_content` on the dashboard lists each parameter's id, type, and wired dashcard ids.

## Parameter types

`type`, closed vocabulary: `string/=` `string/!=` `string/contains` `string/does-not-contain` `string/starts-with` `string/ends-with`; `number/=` `number/!=` `number/between` `number/>=` `number/<=`; `date/all-options` (fullest) `date/single` `date/range` `date/relative` `date/month-year` `date/quarter-year`; `category`, `id`, `boolean/=`, `temporal-unit`, `location/city|state|zip_code|country`. `sectionId` groups the widget in the editor: `"string"`, `"number"`, `"date"`, `"id"`, `"location"`, `"temporal-unit"`.

Other `add_parameter`/`update_parameter` fields: `default` (scalar, or array for multi-select), `required` (only with a `default` — without one viewers are blocked until they pick), `isMultiSelect`, `temporal_units` (for `temporal-unit`), `values_query_type` (`"list"` dropdown / `"search"` box / `"none"` free text), `values_source_type` + `values_source_config`, `filteringParameters`. To unset a default or link, name it in `clear` (`"clear": ["default", "filteringParameters"]`) — a null reads as omitted.

## Wire targets

| Situation | Pass |
|---|---|
| Card exposes the column (MBQL card, or a native field-filter tag bound to that field) | `target_field: <field id>` — the usual choice; the server derives the mapping from the card's query |
| Native-SQL card, by tag name | `target_tag: "<tag name>"` — the server reads the tag's type (field filter vs variable) and emits the right mapping. Read tag names from the card's `template_tags` via `get_content`; a wrong name's error lists what exists |
| `{{placeholder}}` in a text, heading, or iframe card's own content | `target: ["text-tag", "<name>"]` — the name must appear as `{{name}}` in that card |
| Neither fits (advanced) | `target: ["dimension", ["template-tag", "category"]]` — the raw clause; hand-built targets are where wiring bugs live |

`autowire: true` (with `target_field`) also maps every other card exposing the same field, silently skipping those that don't; the named `dashcard_id` must expose it or the op fails. A target resolving to nothing on the card is rejected at compile time, on `validate_only` and real saves alike.

`unwire_parameter` disconnects one card (`dashcard_id`) or all (omit it). `remove_parameter` deletes the widget plus its mappings and linked-filter references.

## Value sources

Omit `values_source_type` for live distinct values from the wired column — usually right. Or:

- Fixed list: `"values_source_type": "static-list", "values_source_config": {"values": ["active", "churned", "trial"]}`
- From a card: `"values_source_type": "card", "values_source_config": {"card_id": 42, "value_field": ["field", 18, null]}`

Preview: `get_parameter_values {"target": "dashboard", "id": 40, "parameter_id": "category"}` — also takes `query` (search) and `constraints` (other filters' selections, chain filtering).

## Linked (cascading) filters

A child (City) shows only values consistent with a parent (State) when the child's `filteringParameters` lists the parent's id:

```
{"op": "update_parameter", "parameter_id": "city", "filteringParameters": ["state"]}
```

Two hard constraints: linked filters read **table-metadata foreign keys only** — joins inside a saved question or model don't count; and a linked child is **incompatible with a `static-list` or `card` source** (a custom source overrides the cascade) — leave it live.

## Placement and visibility

- Parameters live in the header. `move_parameter` with `index` reorders; with `dashcard_id` it renders the widget **on that card** (inline). `add_card`'s `inline_parameters` does this at add time.
- **Tabs:** a header filter appears on a tab only where it is wired to a card on *that* tab — a filter that "won't show" is usually wired only to another tab's cards.
- A `temporal-unit` parameter binds only to a datetime column in the card query's **last** stage — after a time-bucketed summary it can't attach.

## Don't

- Don't add a parameter without wiring it — the widget renders and filters nothing.
- Don't set `required: true` without a `default` — viewers are blocked until they pick a value.
- Don't link a child filter that has a static-list/card source, or across a question/model join — the cascade silently doesn't apply.
- Don't pass null to clear a default or link — it reads as omitted; use `clear`.
- Don't hand-build a raw `target` when `target_field` or `target_tag` fits.
- Don't report a default or link as set from the write response — read it back.

## To confirm

`get_content {"type": "dashboard", "id": 40, "include": ["parameters"]}` — the write response is a skeleton without `default`, `filteringParameters`, or value-source config; read them back before reporting a default or link as set. Dropdown contents: `get_parameter_values`.
