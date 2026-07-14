---
name: dashboard
description: Assemble saved questions into a dashboard with `create_dashboard`, and edit one with `update_dashboard` — populating it at creation, adding, removing and moving cards afterwards, sizing them, renaming and moving the dashboard, and what dashboard editing over MCP does not reach. Load before any dashboard build or edit. Triggers — "build a dashboard", "add this question to the dashboard", "rearrange the cards", "put these on one page".
---

# Dashboard

A dashboard shows questions that already exist. It has no queries of its own, so every build is the
same two beats: get the questions saved, then assemble them by id.

## The workflow

1. `search` for questions that already cover the topic. Reuse beats rewriting — an existing "Revenue by
   month" is the one people already trust.
2. For each gap: `browse_data` for the columns, `execute_query` to write and run the query, then
   `create_question` with the handle it returned. Give each one a name someone could find by searching.
3. `create_dashboard(name, collection_id, question_ids: [...])` — one call, cards auto-positioned by
   their display type.
4. Report what you built: the name, where you saved it, and what each card shows.

## Creating

```json
{"name": "Revenue overview",
 "description": "Orders and revenue for the current quarter",
 "collection_id": 12,
 "question_ids": [101, 102, 103]}
```

`question_ids` are saved questions, in the order you want them laid out. Omit `collection_id` and the
dashboard lands in the user's personal collection; pass an explicit `null` for the root collection. The
response carries the dashboard's url, its `collection_path`, and the `dashcard_ids` of the cards that
landed — read the path back to the user rather than guessing where it went.

## Editing

`update_dashboard` patches: only what you pass changes. `name`, `description`, `collection_id` (moves
it), and `archived` (trash and restore) are the metadata fields.

Cards are edited through `dashcards`, a list of mutations applied in order:

```json
{"dashcards": [{"action": "add", "card_id": 104, "display_size": "wide"},
               {"action": "remove", "dashcard_id": 12},
               {"action": "move", "dashcard_id": 9, "position": "top"}]}
```

- `add` takes a `card_id` and auto-positions it. `display_size` is `wide`, `tall`, or `full`.
- `remove` and `move` take a `dashcard_id` — a *dashcard* id, the card's placement on this dashboard,
  not the question's `card_id`. The two are different numbers and mixing them up removes the wrong
  card.
- `move` takes a `position` of `top` or `bottom`.

Read the current `dashcard_id`s with `get_content` before you mutate: ask for the dashboard with the
`layout` section, which returns its cards with their ids. The response returns the resulting
`dashcard_ids` in layout order, so no follow-up read is needed to confirm what landed.

## What these tools don't reach

Dashboard filters, tabs, text and heading cards, per-card visualization overrides, and pixel-exact
layout are not part of these tools. If the user asks for a date filter across the dashboard, build and
save the dashboard, then say plainly that the filter has to be added in Metabase. Do not fabricate a
call for it, and do not fake a filter by hard-coding the constraint into every card's query — that
answers a different question and looks like it worked.
