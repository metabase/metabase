---
id: write-dashboard
title: Creating and editing dashboards
description: Building, laying out, filtering, renaming, moving and trashing dashboards with write_dashboard — load before your first write_dashboard call.
tools: [write_dashboard]
priority: 50
---
`write_dashboard` saves each call at once, trash included. Don't ask the user to confirm a change first. If a call fails, nothing is saved, and you can fix the call and retry.

**Which dashboard**
- "This dashboard" and "here" mean the one the user is viewing. Put new cards on the tab they have open, shown as `<open_tab>`, unless they name another one.
- To change another dashboard, find it with your search or discovery tool and use a result with `can_write=true`. Ask the user only when several results fit.
- Read `metabase://dashboard/{id}/items` with `read_resource` to get the dashcard ids of an existing dashboard before you move, resize, replace or remove its cards.

**Creating a dashboard**
- Omit `dashboard_id` and pass `name`: the user's name for it, or a short one that says what it shows. It goes to the user's personal collection unless the user names a collection; then pass its `collection_id`, or `"root"` for the top level.
- For a dashboard about a topic, build the charts that answer the main questions about it, then create the dashboard with all of them in one call. Don't ask the user which charts to include.
- Each chart becomes a question saved on the dashboard. Pass its `chart_id` and a `name` on `add_card`.

**Layout**
The grid is 24 columns wide. Full width is `size_x: 24`. A card is placed at `position` `{row, col}` with `size` `{size_x, size_y}`, and `col + size_x` must not pass 24.
- Omit `position` and `size` to add a card or two below the existing ones.
- Lay out a whole dashboard with explicit `position` and `size` on every card. Don't mix explicit and automatic placement in one row.
- A common shape: a row of number cards (6×3 each), then charts in halves (12×6), then a full-width table (24×9).
- Default sizes: number 6×3, pie 12×8, table 12×9, heading 24×1, text 12×3, other charts 12×6.
- `add_heading` adds a section label and `add_text` a markdown note.

```
{"name": "Revenue overview",
 "ops": [{"op": "add_card", "id": -1, "chart_id": "A", "name": "Total revenue",
          "position": {"row": 0, "col": 0}, "size": {"size_x": 6, "size_y": 3}},
         {"op": "add_card", "id": -2, "chart_id": "B", "name": "Revenue by month",
          "position": {"row": 3, "col": 0}, "size": {"size_x": 12, "size_y": 6}},
         {"op": "add_card", "id": -3, "chart_id": "C", "name": "Revenue by product",
          "position": {"row": 3, "col": 12}, "size": {"size_x": 12, "size_y": 6}}]}
```

**Editing cards**
- New cards and tabs take negative ids you choose (-1, -2, …), which later ops in the same call can use. The result gives the real ids.
- `move` changes a card's `position` or `tab`, `resize` its `size`, and `remove` deletes it from the dashboard.
- `replace_card` shows another question or chart in the same slot. It resets that card's filter connections, so connect the filters again in the same call.

**Tabs**
- `add_tab`, `rename_tab`, `move_tab`, `duplicate_tab` and `remove_tab` edit tabs. Removing a tab removes its cards.
- When a dashboard has more than one tab, every card needs a `tab`.

**Filters**
A filter is a parameter connected to cards. `add_parameter` adds it, and it filters nothing until `wire_parameter` connects it.
- Pass `target_field` with the field id the card filters on. `autowire: true` also connects every other card that has that field.
- For a SQL question, pass `target_tag` with the name of its variable.
- Types: `string/=`, `string/contains`, `number/=`, `number/between`, `date/all-options`, `date/relative`, `category`, `id`, `temporal-unit`. Set `sectionId` to `"string"`, `"number"`, `"date"` or `"id"` to match.
- Connect a filter to every card it applies to. A filter shows on a tab only where it is connected to a card on that tab.

```
{"dashboard_id": 42,
 "ops": [{"op": "add_parameter", "parameter_id": "category", "name": "Category",
          "type": "string/=", "sectionId": "string"},
         {"op": "wire_parameter", "parameter_id": "category", "dashcard_id": 501,
          "target_field": 18, "autowire": true}]}
```

**Details, trash and restore**
- Rename with `name`, change the description with `description`, and remove it with `"clear": ["description"]`.
- Move a dashboard with `collection_id`.
- Trash with `"archived": true` and restore with `"archived": false`, without `ops`. Tell the user it can be restored from the trash.

**After a call**
Tell the user what changed and where the dashboard is saved, and link it as the result shows. If a call fails, tell the user why.
