---
name: documents
description: The Metabase-flavored Markdown grammar for document_write — the CommonMark subset, {% card %} embeds, {% entity %} links, ::: layout containers (flex / supporting / resize) and their nesting rules, plus how surgical `edits` and card cloning behave. Triggers — "create a document / report", "put prose beside a chart", "embed a question in a document", "edit a document".
---

# Documents

A document is a rich-text page mixing prose with embedded saved questions. `document_write` speaks **Metabase-flavored Markdown**: CommonMark plus a token vocabulary. Charts must exist first — build them with `question_write`, then embed by id.

```
document_write {"method": "create", "name": "Weekly report",
                "content_markdown": "# Weekly report\n\nOrders trended up this week.\n\n{% card id=118 %}\n"}
```

## The CommonMark subset

Headings, paragraphs, bold/italic/inline code, links, ordered/bulleted lists, blockquotes, fenced code blocks, horizontal rules, images. **No tables, no strikethrough, no task lists** — the document editor has no nodes for them; render tabular data by embedding a table-display question instead. Bare URLs autolink.

## Tokens

- **Card embed** (block, on its own line): `{% card id=118 %}` or `{% card id=118 name="Revenue by region" %}` — `name` overrides the displayed title. The id must be a saved question you can read; an id that doesn't resolve fails the write. The embed is given a sensible height for you.
- **Entity link** (inline, renders as a live chip): `{% entity id="42" model="dashboard" %}` — id quoted; `model` ∈ `card`, `dataset`, `metric`, `dashboard`, `collection`, `table`, `database`, `document`. (`user` also parses but renders without a working link — stick to these.)

## Layout containers (`:::` fences)

`::: <name> {attrs}` on its own line opens a container; a bare `:::` line closes the **innermost** open one — so every opener needs its own closer, and order matters.

- `::: flex {columns=[60,40]}` — a horizontal row of 1–3 cells; `columns` is the width split in percent. A cell is either a card embed or a `::: supporting` block.
- `::: supporting` — a prose cell inside a flex row (paragraphs, headings, lists).
- `::: resize {height=442 minHeight=280}` — wraps exactly one card embed or flex row to pin its height in pixels.

Prose beside a chart — the canonical composition:

```markdown
::: flex {columns=[60,40]}
::: supporting
### What happened
Revenue climbed through the quarter, led by the Gadget category.
:::
{% card id=118 %}
:::
```

(The first `:::` closes `supporting`, the last closes `flex`.) To pin the row's height, wrap the whole flex block in `::: resize {height=400}` … `:::`.

## Card cloning — why you re-read after writing

A card embedded that the document doesn't already own is **cloned into the document** on write and its id rewritten in the stored body. So the markdown you submitted is not the markdown that's stored — always take the returned `content_markdown` as the current text, especially before edits.

## Updating

Pass `id` and exactly **one** of:

- `content_markdown` — a deliberate full-body rewrite. Every block is re-created, so every comment thread anchored to the body is orphaned (the response lists `orphaned_comment_threads`). Reach for it only when restructuring wholesale.
- `edits: [{old_str, new_str, replace_all?}]` — surgical text edits, the default choice. Each `old_str` must match the **current server-side** markdown exactly once; 0 matches means the document changed since you read it (copy the snippet from the returned `content_markdown`), >1 means extend the snippet with surrounding context or set `replace_all: true`. Blocks keep their ids — and their comment anchors — through an edit to their text.
- `edits: []` — the metadata-only escape hatch: change `name`, `collection_id`, `collection_position`, or `archived` without touching the body.

Writes are last-write-wins; a stale `old_str` failing to match is the only staleness signal.

## Don't

- Don't write Markdown tables, strikethrough, or task lists — they have no document representation.
- Don't embed a card id you haven't verified you can read — the write fails on it.
- Don't nest `::: flex` inside `::: flex`, or put anything but one card embed / flex row inside `::: resize`.
- Don't close containers with names (`::: end`) — a bare `:::` closes the innermost open container.
- Don't resubmit your own earlier markdown as the base for edits — clone rewrites ids; edit against the `content_markdown` the server last returned.
- Don't use a full rewrite for a small change — it orphans every comment on the document.
