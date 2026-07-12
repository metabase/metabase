---
name: dashboard
description: The per-op reference for `dashboard_write` — building and editing dashboards through an ordered `ops` list that adds question cards, text, headings, links and iframes; tabs; moving, resizing, replacing and removing cards; the `patch_dashcard` escape hatch for visual overrides; and parameters (add, update, move, remove) with `wire_parameter` mapping them onto cards. Load before any dashboard build or edit. Triggers — "build a dashboard", "add this question to the dashboard", "put a date filter on it", "rearrange the cards", "add a tab".
---

# Dashboard

`dashboard_write` takes `method: "create" | "update"`, the dashboard-level fields (`name`,
`description`, `collection_id`, `width`, `auto_apply_filters`, `cache_ttl`, `archived`), and an
ordered `ops` list. Building and editing are the same call: create + ops, or update + ops.

Ops are validated in order and compiled into **one** dashboard write, so a call either applies whole or
not at all — there is no half-built layout to clean up, and re-sending a failed op list cannot
double-add cards. An error names the op's index and what was wrong with it. `validate_only: true`
dry-runs the list and returns the layout it would produce.

A dashboard shows cards that already exist. Create the question first with `question_write`, then add
it by id. Never inline a query into a dashboard op.

## The workflow

1. `search` / `get_content` for the questions that will go on it (you need their ids).
2. `dashboard_write(method: "create", name, collection_id, ops: [...])`.
3. Add parameters and wire them to the cards in the same call — a filter that isn't wired to anything
   is a widget that does nothing.
4. The response returns the resulting card list, so you don't need a follow-up read.

## Card ops

Every card-adding op takes optional `tab`, `position` (`{row, col, size_x, size_y}`), and `size`.
Omit `position` and the card autoplaces — do that unless the user asked for a specific layout. The grid
is 24 columns wide.

- `{op: "add_card", card_id, tab?, position?, size?, series?, inline_parameters?}` — a saved question.
  `series` is an ordered list of extra card ids to overlay (line/area/bar combos).
  `inline_parameters` puts filter widgets on the card itself instead of the dashboard header.
- `{op: "add_text", markdown, ...}` — a text card.
- `{op: "add_heading", text, inline_parameters?, ...}` — a section heading.
- `{op: "add_link", url | entity: {type, id}, ...}` — a link card, to a URL or another Metabase entity.
- `{op: "add_iframe", src, ...}` — an embedded iframe (the host must be on the instance's allowlist).
- `{op: "add_action", action_id, label?, display?: "button" | "form", ...}` — only where actions are on.
- `{op: "duplicate_card", dashcard_id, tab?, position?}` — clone a card, remapping its inline filters.
- `{op: "replace_card", dashcard_id, card_id}` — swap which question a card shows. Resets its series,
  parameter mappings, and visual overrides, exactly as the editor's replace does.
- `{op: "move", dashcard_id, tab?, position?}` · `{op: "resize", dashcard_id, size}` ·
  `{op: "remove", dashcard_id}`
- `{op: "set_series", dashcard_id, card_ids}` — ordered full replace of the overlaid series.
- `{op: "patch_dashcard", dashcard_id, patch}` — a merge over the card's `visualization_settings`:
  title override (`card.title`), `card.hide_empty`, background, text alignment, `column_settings`,
  `click_behavior`, link entities. Content only — layout and identity keys (`row`, `col`, `size_x`,
  `size_y`, `dashboard_tab_id`, `card_id`, `id`) are rejected, because `move` and `resize` own those.

Moving a card to another tab is `move` with `tab`.

## Tab ops

`{op: "add_tab", name}` · `{op: "rename_tab", tab_id, name}` · `{op: "move_tab", tab_id, index}` ·
`{op: "duplicate_tab", tab_id, name?}` · `{op: "remove_tab", tab_id}` (removing a tab removes its
cards; the response says how many).

## Parameter ops

A dashboard filter is two things: the parameter, and its mapping onto each card. Both are needed.

- `{op: "add_parameter", name, type, default?, required?, isMultiSelect?, temporal_units?,
   values_query_type?, values_source_type?, values_source_config?, filteringParameters?}`
  — `type` is the parameter type (`date/all-options`, `string/=`, `string/contains`, `number/between`,
  `id`, `category`, …). `filteringParameters` are the parameters that filter *this* one's value list —
  linked filters.
- `{op: "update_parameter", parameter_id, ...}` — the same fields; one op for every parameter edit.
- `{op: "remove_parameter", parameter_id}` — also strips its card mappings, linked-filter references,
  and inline placements, and names any subscription the removal breaks.
- `{op: "move_parameter", parameter_id, index?, dashcard_id?}` — reorder in the header, or move it onto
  a card as an inline filter (and back).
- `{op: "wire_parameter", parameter_id, dashcard_id, target_field | target_tag | target, autowire?}` —
  the mapping. `target_field` for a structured question's column, `target_tag` for a SQL question's
  template tag, `target` for a raw MBQL target when neither fits. `autowire: true` applies the
  equivalent mapping to every compatible card on the dashboard in one op — the usual case for
  "filter the whole dashboard by date".
- `{op: "unwire_parameter", parameter_id, dashcard_id?}` — clear one card's mapping, or all of them.

Use `get_parameter_values` to see what a filter can be set to before you set a default.

## Worked example

```json
{"method": "create",
 "name": "Revenue overview",
 "collection_id": 12,
 "ops": [
   {"op": "add_heading", "text": "This quarter"},
   {"op": "add_card", "card_id": 101},
   {"op": "add_card", "card_id": 102, "series": [103]},
   {"op": "add_parameter", "name": "Created at", "type": "date/all-options"},
   {"op": "wire_parameter", "parameter_id": "created_at", "dashcard_id": 1,
    "target_field": ["Sample Database", "PUBLIC", "ORDERS", "CREATED_AT"], "autowire": true}]}
```

## Not ops

Duplicating a whole dashboard is `duplicate_content`. Reverting is `revert_content`. Bookmarking is
`bookmark_content`. Subscriptions are `subscription_write`. A question saved *inside* a dashboard is
`question_write` with `dashboard_id` as the save target — then `add_card` it.
