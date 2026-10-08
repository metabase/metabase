---
name: dashboard-layout
description: Dashboard layout with dashboard_write ops — the 24-column grid, per-display default sizes, explicit position vs autoplace, the KPI-row pattern, headings and text cards, tabs and the every-card-needs-a-tab rule. Triggers — "build a dashboard from these cards", "the dashboard is squished into half the width", "arrange the cards", "add a tab", "make a KPI row".
---

# Dashboard layout

Ordered `dashboard_write` ops apply as one atomic save — batch a whole rearrangement in one `ops` list. New dashcards and tabs get **negative ids you choose** (`-1, -2, …`), referenced by later ops in the same call; the server assigns real ids on save. `validate_only: true` returns the resulting layout without writing.

## The grid is 24 columns — not 12

A dashcard is `{row, col, size_x, size_y}`: `col` 0-indexed, `row` grows downward, `col + size_x ≤ 24`. **Full width is `size_x: 24`.** A layout authored on a 12-column assumption crams everything into the left half — if no card crosses column 12, double every width.

Omit `position` to autoplace (below/beside existing cards) and `size` for the display's default — right when appending a card or two. Compose whole layouts with explicit `position` + `size`; place a band wholly explicitly or let it all autoplace, never mixed. Sanity-check: rows fill to 24, at least one card ends at `col + size_x = 24`.

Default sizes (w×h): `scalar`/`smartscalar` 6×3 · `pie` 12×8 · `table`/`pivot` 12×9 · `waterfall` 14×6 · `sankey` 16×10 · `iframe` 12×8 · `heading` 24×1 · `text` 12×3 · `link` 8×1 · `action` 4×1 · other charts 12×6.

## The standard shape: KPI row, chart halves, full-width table

```
dashboard_write {"method": "create", "name": "Revenue overview",
 "ops": [
  {"op": "add_heading", "id": -1, "text": "Key numbers", "position": {"row": 0, "col": 0}},
  {"op": "add_card", "id": -2, "card_id": 101, "position": {"row": 1, "col": 0},  "size": {"size_x": 6, "size_y": 3}},
  {"op": "add_card", "id": -3, "card_id": 102, "position": {"row": 1, "col": 6},  "size": {"size_x": 6, "size_y": 3}},
  {"op": "add_card", "id": -4, "card_id": 103, "position": {"row": 1, "col": 12}, "size": {"size_x": 6, "size_y": 3}},
  {"op": "add_card", "id": -5, "card_id": 104, "position": {"row": 1, "col": 18}, "size": {"size_x": 6, "size_y": 3}},
  {"op": "add_card", "id": -6, "card_id": 105, "position": {"row": 4, "col": 0},  "size": {"size_x": 12, "size_y": 6}},
  {"op": "add_card", "id": -7, "card_id": 106, "position": {"row": 4, "col": 12}, "size": {"size_x": 12, "size_y": 6}},
  {"op": "add_card", "id": -8, "card_id": 107, "position": {"row": 10, "col": 0}, "size": {"size_x": 24, "size_y": 9}}]}
```

## Structure and prose

- `add_heading` — full-width section label (plain text, 24×1); one per band.
- `add_text` — markdown card for explanations and captions.
- `add_link` (URL or Metabase entity), `add_iframe` — external content.
- `add_action` — button running a saved action (`action_id`; optional `label`, `display`: `"button"`/`"form"`).
- `duplicate_card` copies a dashcard with its settings; `replace_card` swaps the card behind a slot, keeping the slot.

## Editing an existing layout

`move` (new `position` and/or `tab`), `resize` (`size`), `remove`, addressed by dashcard id from `get_content`. Layout keys never ride `patch_dashcard` (content merges only) — `move`/`resize`/`replace_card`/`set_series` own row, col, size, tab, card_id, series.

## Tabs

```
"ops": [{"op": "add_tab", "id": -1, "name": "Overview"},
        {"op": "add_tab", "id": -2, "name": "Details"},
        {"op": "add_card", "id": -3, "card_id": 101, "tab": -1},
        {"op": "move", "dashcard_id": 7, "tab": -2}]
```

- Existing cards are adopted automatically only when the save ends with exactly **one** tab; adding two or more in one call leaves them orphaned — `move` them onto a tab in the same call.
- **With more than one tab, every card must have a tab** (`tab` on each add op, or `move`); the save rejects orphans by id.
- `rename_tab`, `move_tab` (reorder), `duplicate_tab` (copies the tab and its cards), `remove_tab` (deletes its cards too).
- A header filter appears on a tab only where it is wired to a card on that tab — `learn("dashboard-filters")`.

## Don't

- Don't author 12-column widths — the dashboard fills half the screen, with no error.
- Don't mix explicit positions and autoplace within one band — the band misaligns.
- Don't spread a rearrangement over several calls — each autoplaces against a half-built layout.

## To confirm

`get_content {"type": "dashboard", "id": 40, "include": ["layout"]}` returns every dashcard's tab, position, and size — check bands fill to 24 and every card has a tab. `validate_only: true` previews the same without saving.
