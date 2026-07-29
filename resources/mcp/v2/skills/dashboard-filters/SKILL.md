---
name: dashboard-filters
description: Dashboard parameters end to end for dashboard_write — add_parameter types and value sources, the wire_parameter target grammar (target_field vs target_tag vs raw target), autowire, linked (cascading) filters, inline parameters, and the tab-visibility rule. Read before your first add_parameter or wire_parameter. Triggers — "add a filter to this dashboard", "wire a filter to these cards", "make a filter cascade", "filter dropdown values", "why isn't my filter showing / doing anything".
---

# Dashboard filters

A dashboard filter is **a parameter plus a wire per card**. `add_parameter` creates the widget; it does nothing until `wire_parameter` connects it to at least one card — an unwired parameter is the most common "my filter does nothing" cause. Both are `dashboard_write` ops, applied atomically in one call:

```
dashboard_write {"method": "update", "id": 40,
                 "ops": [{"op": "add_parameter", "parameter_id": "category", "name": "Category",
                          "type": "string/=", "sectionId": "string"},
                         {"op": "wire_parameter", "parameter_id": "category", "dashcard_id": 7,
                          "target_field": 18, "autowire": true}]}
```

`parameter_id` is a short string you choose and reuse in later ops (slug-like: `"category"`, `"date_range"`). The server derives the URL slug from `name`. Inspect existing wiring with `get_content` — a dashboard's `parameters` list each parameter's id, type, and the dashcard ids it is wired to.

## Parameter types

`type` is a closed vocabulary — string ops `string/=` `string/!=` `string/contains` `string/does-not-contain` `string/starts-with` `string/ends-with`; number ops `number/=` `number/!=` `number/between` `number/>=` `number/<=`; dates `date/all-options` (fullest) `date/single` `date/range` `date/relative` `date/month-year` `date/quarter-year`; plus `category`, `id`, `boolean/=`, `temporal-unit`, `location/city|state|zip_code|country`. `sectionId` groups the widget in the editor: `"string"`, `"number"`, `"date"`, `"id"`, `"location"`, `"temporal-unit"`.

Other `add_parameter`/`update_parameter` fields: `default` (scalar, or array for multi-select), `required` (pair with a `default` — a required parameter without one blocks the dashboard), `isMultiSelect`, `temporal_units` (for `temporal-unit`), `values_query_type` (`"list"` dropdown / `"search"` box / `"none"` free text), `values_source_type` + `values_source_config`, `filteringParameters`.

## The wire grammar — one of three targets

| Situation | Pass |
|---|---|
| The card exposes the column (MBQL card, or a native field-filter tag bound to that field) | `target_field: <numeric field id>` — the usual choice; the server derives the exact mapping from the card's query |
| Native-SQL card, wire a specific tag by name | `target_tag: "<tag name>"` — the server reads the tag's type and emits the right mapping (field filter vs raw variable — you never distinguish them) |
| A `{{placeholder}}` in a text, heading, or iframe card's own content | `target: ["text-tag", "<name>"]` — the name must appear as `{{name}}` in that card's text or embed |
| Neither fits (advanced) | `target: ["dimension", ["template-tag", "category"]]` — the raw mapping clause |

`autowire: true` (with `target_field`) also maps every **other** card exposing the same field; cards that don't expose it are skipped silently, but the named `dashcard_id` must expose it or the op fails. Wires that would resolve to nothing on the card are rejected at compile time — including under `validate_only` — rather than saved as a broken mapping.

`unwire_parameter` disconnects one card (`dashcard_id`) or everywhere (omit it). `remove_parameter` deletes the widget plus all its mappings and linked-filter references.

## Value sources (what the dropdown offers)

Omit `values_source_type` to pull live distinct values from the wired column — the default and usually right. Or:

- Fixed list: `"values_source_type": "static-list", "values_source_config": {"values": ["active", "churned", "trial"]}`
- From a card: `"values_source_type": "card", "values_source_config": {"card_id": 42, "value_field": ["field", 18, null]}`

Preview what a widget offers with `get_parameter_values {"target": "dashboard", "id": 40, "parameter_id": "category"}` — it also takes `query` (search) and `constraints` (the other filters' current selections, for chain filtering).

## Linked (cascading) filters

A child filter (City) shows only values consistent with a parent (State) when the child's `filteringParameters` lists the parent's id:

```
{"op": "update_parameter", "parameter_id": "city", "filteringParameters": ["state"]}
```

Two hard constraints, same root: **linked filters read table-metadata foreign keys only.** They ignore joins made inside a saved question or model — the parent and child columns must be connected by an FK in metadata. And a linked child is **incompatible with a `static-list` or `card` value source** — a custom source overrides the cascade; leave the child's source live (omit it).

## Placement and visibility

- Parameters live in the dashboard header by default. `move_parameter` with `index` reorders the header; with `dashcard_id` it renders the widget **on that card** instead (an inline parameter). `add_card`'s `inline_parameters` places them at add time.
- **Tabs:** a header filter only appears on a tab where it is wired to at least one card on *that* tab. A filter that "won't show" is usually wired only to cards on another tab.
- A `temporal-unit` parameter binds only to a datetime column in the card query's **last** stage — after a time-bucketed summary stage it can't attach.

## Don't

- Don't add a parameter and forget to wire it — the widget renders but filters nothing.
- Don't guess `target_tag` names — read the card's tags first (`get_content` on the question returns `template_tags`); the error on a wrong name lists the tags that exist.
- Don't wire a raw `target` when `target_field` or `target_tag` fits — the server derives correct mappings; hand-built clauses are where wiring bugs live.
- Don't expect a linked filter to work across a model/question join or with a static/card value source — it needs a metadata FK and a live source.
- Don't set `required: true` without a `default` on expensive dashboards — every viewer is blocked until they pick a value.
- Don't try to clear a parameter's `default` or links by passing null to `update_parameter` — null reads as omitted; remove and re-add the parameter instead.
