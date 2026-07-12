---
name: curation
description: Keep the Metabase library trustworthy — when to save a model instead of a question, the difference between metrics and measures, defining segments and snippets, organizing content into collections (moving, pinning, archiving), bookmarking, reverting a bad edit through revision history, and annotating charts with timeline events. Load when asked to clean up, standardize, or organize content, or when deciding what kind of thing to save. Triggers — "should this be a model", "define a metric for revenue", "clean up this collection", "undo that change", "mark the launch on the chart".
---

# Curation

Saving an answer is easy; saving it in the right *shape* is what stops a Metabase from filling with
near-duplicate questions. This skill is the shape decision, plus the tools that keep the library tidy.

## What to save it as

| The thing | Save it as | Tool |
| --- | --- | --- |
| An answer someone asked for | a **question** | `question_write` (`card_type: "question"`) |
| A cleaned-up table others will build on | a **model** | `question_write` (`card_type: "model"`) |
| A number the business agrees on ("Revenue") | a **metric** | `metric_write` |
| An aggregation that belongs to one table | a **measure** | `measure_write` |
| A reusable filter ("Active customers") | a **segment** | `segment_write` |
| A reusable chunk of SQL | a **snippet** | `snippet_write` |

**Model vs question.** A model is the starting point for other people's questions: joined, filtered,
renamed, with the junk columns dropped. Save one when the query exists to be built on rather than to be
read. It is the same `question_write` call with `card_type: "model"`, and its columns can be curated —
`column_metadata: [{name, display_name, description, semantic_type, visibility_type}]` on an update is
how a raw `USR_CRTD_AT` becomes "Signed up".

**Metric vs measure.** A metric is a standalone saved definition anyone can group and filter; a measure
attaches to a table and is used from queries on that table. If someone says "we should all be counting
revenue the same way", that is a metric. Both are single-aggregation definitions; a metric takes at most
one temporal grouping.

Before defining any of them, `search` for it. A second "Revenue" metric is worse than no metric.

## Organizing

Moving and pinning ride the entity's own `_write` tool — there is no separate "organize" tool:

- **Move**: `collection_id` on an update (`parent_id` for a collection). `null` or `"root"` is the root
  collection.
- **Pin**: `collection_position` — an integer pins the item at the top of its collection, `null` unpins.
- **Archive / restore**: `archived: true | false` on an update. This is Metabase's trash: reversible,
  and the correct answer to "delete this". There is no permanent delete; don't look for one.
- **New folder**: `collection_write(method: "create", name, parent_id)`.

`bookmark_content(type, id, bookmarked)` is a personal favorite, not an organizational change — it
affects only the connected user's sidebar.

## Undo

`get_content(items: [...], include: ["revisions"])` returns the revision history: who changed what and
when. `revert_content(type, id, revision_id)` puts it back. That pairing is the undo path for a bad
edit — including one you just made. It is the reason a write grant is safe to hand an agent, so know it
before you need it.

## Timeline events

`add_timeline_event(name, timestamp, description?, icon?, time_matters?, collection_id | timeline_id)`
annotates time-series charts with what happened: a launch, a price change, an outage. `collection_id`
resolves to that collection's default timeline, creating it if there isn't one. When someone explains a
spike, offer to mark it — a chart that carries its own explanation is worth more than the Slack thread
that explained it once.
