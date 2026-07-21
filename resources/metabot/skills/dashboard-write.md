---
id: dashboard-write
title: Building dashboards
description: Composing dashboard layouts with dashboard_write's ordered ops — load before creating or editing a dashboard, for the negative-id convention, the read-before-edit loop, parameter wiring, and dry runs.
tools: [dashboard_write]
priority: 50
---
You edit a dashboard by sending an ordered list of **ops**, not by sending a whole dashboard back.

The ops in one call apply as a single save: nothing is written unless every op succeeds. So a call that fails leaves the layout exactly as it was, and retrying it cannot double-add a card. When an op is invalid, the error names its index (`op 2 (...)`) — fix that op and resend the whole list.

## Give each new card and tab a negative id

A card or tab you are creating has no id yet, so you pick one: any negative integer, unique within the call. Later ops in the same call refer to it by that id, and the server assigns the real id when it saves.

```json
{"method": "update", "id": 12, "ops": [
  {"op": "add_tab", "id": -1, "name": "Q3"},
  {"op": "add_heading", "id": -2, "text": "Revenue", "tab": -1},
  {"op": "add_card", "id": -3, "card_id": 118, "tab": -1},
  {"op": "add_card", "id": -4, "card_id": 119, "tab": -1,
   "position": {"row": 1, "col": 12}, "size": {"size_x": 12, "size_y": 6}}
]}
```

Omit `position` and the card is autoplaced below what's already on that tab. Omit `size` and it gets the default size for its display type. Omit `tab` only on a dashboard that has no tabs — once there are two or more, every card must name one.

`method: "create"` takes the same `ops`, so you can build a whole dashboard in one call. Pair it with `name` (and usually `collection_id`).

## Read before you edit

Every editing op takes a `dashcard_id`, and you only learn those by reading:

```json
{"items": [{"type": "dashboard", "id": 12}]}
```

`get_content` returns the editing skeleton: the tabs, the parameters with the dashcards they're wired to, and one row per dashcard with its id, position, and size. Add `"include": ["layout"]` when you also need the per-dashcard visualization settings that `patch_dashcard` merges into.

Reach for the op that owns what you're changing: `move` for position and tab, `resize` for size, `replace_card` to point a dashcard at a different card, `set_series` for overlays. `patch_dashcard` merges content settings only and rejects those keys rather than silently dropping them.

## Parameters

A parameter's id is a string you choose. Add it, then wire it to a card — until it's wired it filters nothing.

```json
{"method": "update", "id": 12, "ops": [
  {"op": "add_parameter", "parameter_id": "p_date", "name": "Date",
   "type": "date/all-options", "sectionId": "date"},
  {"op": "wire_parameter", "parameter_id": "p_date", "dashcard_id": 44,
   "target_field": 187, "autowire": true}
]}
```

`autowire: true` also maps every other card on the dashboard that exposes that same field, skipping the ones that don't. For a native-SQL card, wire to its template tag with `target_tag` instead of `target_field`.

## Dry-run when you're unsure

`validate_only: true` runs the ops and returns the layout they would produce, writing nothing. Use it when you're placing many cards at once, or when you're not certain a field is wireable.

One caveat: a dry run checks the ops and the resulting layout, but the per-field permission checks on parameter mappings run only on a real save. A clean dry run can still be rejected when you write it.

## What this tool doesn't do

Creating the questions themselves is `question_write` — including questions that live inside a dashboard, via its `dashboard_id`. Public links and embedding are admin settings, not ops.
