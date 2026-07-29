---
name: dashboard-layout
description: Laying out dashboards with dashboard_write ops — the 24-column grid, per-display default sizes, explicit position vs autoplace, the KPI-row pattern, headings and text cards, tabs and the every-card-needs-a-tab rule. Triggers — "build a dashboard from these cards", "the dashboard is squished into half the width", "arrange the cards", "add a tab", "make a KPI row".
---

# Dashboard layout

Dashboards are edited with ordered `dashboard_write` ops applied as one atomic save. New dashcards and tabs get **negative ids you choose** (`-1, -2, …`); later ops in the same call reference them by those ids, and the server assigns real ids on save. `validate_only: true` returns the layout the ops would produce without writing.

## The grid is 24 columns — not 12

Every dashcard occupies `{row, col, size_x, size_y}` in grid units: `col` is 0-indexed from the left, `row` grows downward, `col + size_x ≤ 24`. **Full-width is `size_x: 24`.** A layout authored on a 12-column assumption crams the dashboard into the left half of the viewport — if no card crosses column 12, double every width.

**Omit `position` to autoplace** (below/beside existing cards) and `size` to take the display's default — the right call when appending a card or two. Pass explicit `position` + `size` when composing a whole layout, and then sanity-check: rows should fill to 24, and at least one card must end at `col + size_x = 24`.

Default sizes (w×h) by display: `scalar`/`smartscalar` 6×3 · `pie` 12×8 · `table`/`pivot` 12×9 · `waterfall` 14×6 · `sankey` 16×10 · `iframe` 12×8 · `heading` 24×1 · `text` 12×3 · `link` 8×1 · `action` 4×1 · every other chart 12×6.

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

Four 6-wide scalars fill the 24-column KPI row; two 12-wide charts split the next band; a wide table takes the full 24.

## Structure and prose

- `add_heading` — a full-width section label (plain text, 24×1 by default). Use one per band to give the dashboard a scannable outline.
- `add_text` — a markdown card for explanations and captions.
- `add_link` (a URL or a Metabase entity) and `add_iframe` for external content.
- `add_action` — a button that runs a saved action (`action_id`; optional `label` and `display`: `"button"` or `"form"`).
- `duplicate_card` copies a dashcard with its settings; `replace_card` swaps the card behind a slot, keeping the slot.

## Editing an existing layout

`move` (new `position` and/or `tab`), `resize` (`size`), `remove`. Read the current layout first — `get_content` on the dashboard returns each dashcard's id, position, and size — and address dashcards by those ids. Layout keys can't ride `patch_dashcard` (it merges content settings only); `move`/`resize` own them.

## Tabs

```
"ops": [{"op": "add_tab", "id": -1, "name": "Overview"},
        {"op": "add_tab", "id": -2, "name": "Details"},
        {"op": "add_card", "id": -3, "card_id": 101, "tab": -1},
        {"op": "move", "dashcard_id": 7, "tab": -2}]
```

- Cards already on the dashboard are adopted automatically only when the save ends with exactly **one** tab total — adding two or more tabs in one call leaves existing cards orphaned, so `move` them onto a tab in the same call.
- **Once a dashboard has more than one tab, every card must belong to a tab** — pass `tab` on each add op, or `move` existing cards onto one; the save rejects orphans by id.
- `rename_tab`, `move_tab` (reorder), `duplicate_tab` (copies the tab and every card on it), `remove_tab` (deletes its cards too).
- A header filter appears on a tab only if it's wired to at least one card on that tab — see `learn("dashboard-filters")`.

## Don't

- Don't author 12-column layouts — full-width is 24; nothing crossing column 12 means every width is half what you meant.
- Don't mix explicit positions and autoplace within one band and expect alignment — place a band wholly explicitly, or let the whole band autoplace.
- Don't leave cards tab-less on a multi-tab dashboard — the save fails, naming the orphans.
- Don't use `patch_dashcard` for row/col/size/tab/card_id — those belong to `move`, `resize`, and `replace_card`.
- Don't hand-compute overlap fixes one op at a time across several calls — batch the whole rearrangement in one `ops` list; it applies atomically or not at all.
