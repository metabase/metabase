---
name: documents
description: The Metabase-flavored Markdown grammar for document_write — the CommonMark subset, {% card %} embeds, {% entity %} links, ::: layout containers (flex / supporting / resize) and nesting rules, surgical `edits`, card cloning. Triggers — "create a document / report", "put prose beside a chart", "embed a question in a document", "edit a document".
---

# Documents

A document is a rich-text page mixing prose with embedded saved questions. `document_write` speaks **Metabase-flavored Markdown**: CommonMark plus a token vocabulary. Charts must exist first — build with `question_write`, embed by id.

```
document_write {"method": "create", "name": "Weekly report",
                "content_markdown": "# Weekly report\n\nOrders trended up this week.\n\n{% card id=118 %}\n"}
```

## The CommonMark subset

Headings, paragraphs, bold/italic/inline code, links (bare URLs autolink), lists, blockquotes, fenced code blocks, horizontal rules, images. **No tables, strikethrough, or task lists** — the editor has no nodes for them; render tabular data by embedding a table-display question.

## Tokens

- **Card embed** (block, own line): `{% card id=118 %}` or `{% card id=118 name="Revenue by region" %}` (`name` overrides the title). The id must be a saved question you can read — an unresolvable id fails the write. The embed is given a sensible height.
- **Entity link** (inline, live chip): `{% entity id="42" model="dashboard" %}` — id quoted; `model` ∈ `card`, `dataset`, `metric`, `dashboard`, `collection`, `table`, `database`, `document`. (`user` also parses but renders without a working link — stick to these.)

## Layout containers (`:::` fences)

`::: <name> {attrs}` on its own line opens a container; a bare `:::` closes the **innermost** open one — every opener needs its own closer, order matters.

- `::: flex {columns=[60,40]}` — a row of 1–3 cells (percent widths); a cell is a card embed or a `::: supporting` block.
- `::: supporting` — a prose cell (paragraphs, headings, lists) inside a flex row.
- `::: resize {height=442 minHeight=280}` — wraps exactly one card embed or flex row to pin its pixel height.

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

(First `:::` closes `supporting`, last closes `flex`.) To pin the row's height, wrap the flex block in `::: resize {height=400}` … `:::`.

## Card cloning — why you re-read after writing

An embedded card the document doesn't already own is **cloned into the document** on write and its id rewritten in the stored body — the markdown you submitted is not the markdown stored. Always take the returned `content_markdown` as the current text, especially before edits.

## Updating

Pass `id` and exactly **one** of:

- `content_markdown` — full-body rewrite. Every block is re-created, so every comment thread anchored to the body is orphaned (the response lists `orphaned_comment_threads`). Only for wholesale restructuring.
- `edits: [{old_str, new_str, replace_all?}]` — surgical edits, the default. Each `old_str` must match the **current server-side** markdown exactly once: 0 matches means the document changed since you read it (copy from the returned `content_markdown`); >1 means extend the snippet or set `replace_all: true`. Blocks keep their ids — and comment anchors — through text edits.
- `edits: []` — metadata only: `name`, `collection_id`, `collection_position`, `archived`, body untouched.

Writes are last-write-wins; a stale `old_str` failing to match is the only staleness signal.

## Don't

- Don't write Markdown tables, strikethrough, or task lists — no document representation.
- Don't embed a card id you can't read — the write fails on it.
- Don't nest `::: flex` inside `::: flex`, or put anything but one card embed / flex row inside `::: resize`.
- Don't close containers with names (`::: end`) — a bare `:::` closes the innermost.
- Don't edit against your own earlier markdown — cloning rewrites ids; edit against the `content_markdown` the server last returned.
- Don't full-rewrite for a small change — it orphans every comment on the document.
