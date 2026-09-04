---
name: documents
description: The Metabase-flavored Markdown grammar for document_write — the CommonMark subset, {% card %} embeds, {% entity %} links, ::: layout containers (flex / supporting / resize) and nesting rules, surgical `edits` and their limits, card clones, comments. Triggers — "create a document / report", "put prose beside a chart", "embed a question in a document", "edit a document", "document comments".
---

# Documents

A document is a rich-text page mixing prose with embedded saved questions. `document_write` takes **Metabase-flavored Markdown**: CommonMark plus tokens. Charts must exist first (`question_write`), embedded by id.

```
document_write {"method": "create", "name": "Weekly report",
                "content_markdown": "# Weekly report\n\nOrders trended up this week.\n\n{% card id=118 %}\n"}
```

**CommonMark subset:** headings, paragraphs, bold/italic/inline code, links (bare URLs autolink), lists, blockquotes, fenced code, horizontal rules, images. **No tables, strikethrough, or task lists** — the editor has no nodes for them; show tabular data by embedding a table-display question.

## Tokens

- **Card embed** (block, own line): `{% card id=118 %}` or `{% card id=118 name="Revenue by region" %}` (`name` overrides the title). The id must be a saved question you can read; an unresolvable id fails the write. Height is assigned for you.
- **Entity link** (inline chip): `{% entity id="42" model="dashboard" %}` — id quoted; `model` ∈ `card`, `dataset`, `metric`, `dashboard`, `collection`, `table`, `database`, `document` (`user` parses but renders without a working link).

## Layout containers (`:::` fences)

`::: <name> {attrs}` on its own line opens a container; a bare `:::` closes the **innermost** open one (never `::: end`) — every opener needs its own closer, in order.

- `::: flex {columns=[60,40]}` — a row of 1–3 cells (percent widths); a cell is a card embed or a `::: supporting` block. Never nest `flex` in `flex`.
- `::: supporting` — a prose cell (paragraphs, headings, lists) inside a flex row.
- `::: resize {height=442 minHeight=280}` — wraps exactly one card embed or flex row to pin its pixel height.

Prose beside a chart:

```markdown
::: flex {columns=[60,40]}
::: supporting
### What happened
Revenue climbed through the quarter, led by the Gadget category.
:::
{% card id=118 %}
:::
```

(First `:::` closes `supporting`, last closes `flex`.) To pin the row's height, wrap it in `::: resize {height=400}` … `:::`.

## Card clones

A card the document doesn't already own is **cloned into it** on write and its id rewritten in the stored body — the markdown stored is not the markdown you sent, so always take the returned `content_markdown` as current, and edit against that, never your own earlier text. The clone is what renders: to change an embedded chart (display, settings, query), `question_write` the **clone id** shown in `content_markdown`; the master card does nothing for the document. E.g. you embedded 148, the body now reads `{% card id=155 %}` — `question_write {"method": "update", "id": 155, "display": "row"}` changes the document, updating 148 does not.

## Updating

Pass `id` and exactly **one** of:

- `edits: [{old_str, new_str, replace_all?}]` — the default. Each `old_str` must match the **current server-side** markdown exactly once: 0 matches = the document changed since you read it (copy from the returned `content_markdown`); >1 = extend the snippet or set `replace_all: true`. Blocks keep their ids, so comment anchors survive.
- `content_markdown` — full rewrite; every block is re-created, so **every comment thread on the body is orphaned** (listed in the response's `orphaned_comment_threads`). Only for restructuring; tell the user first.
- `edits: []` — metadata only (`name`, `collection_id`, `collection_position`, `archived`), body untouched.

Writes are last-write-wins; a stale `old_str` failing to match is the only staleness signal.

**What `edits` can do:** `new_str` is plain text, stored literally — `**bold**`, `` `code` ``, `- item`, `## Heading`, fences, and `{% card %}` inside it appear as those characters, not formatting. A blank line (`\n\n`) does split a paragraph. So edits cover rewording any paragraph, heading, or list item, and adding a plain paragraph; a new heading, bullet, code block, embed, or container needs `content_markdown`.

Add a paragraph — extend the end of the block before it:

```
"edits": [{"old_str": "led by the Gadget category.",
           "new_str": "led by the Gadget category.\n\nGizmos were flat for the third quarter running."}]
```

Edit one bullet — match its text only, never the `- ` marker (a marker in `new_str` is escaped and merges two items into one):

```
"edits": [{"old_str": "Churn fell to 4%", "new_str": "Churn fell to 3.8%"}]
```

## Comments

`get_content {"type": "document", "id": 12, "include": ["comments"]}` returns threads grouped by anchored block, each with `anchor: {start, end, text}` — the exact character slice of the returned `content_markdown` — and `thread` messages (`id`, `creator`, `text`, `is_resolved`, `created_at`). A thread whose block was rewritten or deleted appears under `orphaned_comments`: the discussion still exists but points at no text, and only the UI can re-anchor it. MCP can read comments but not reply, resolve, or re-anchor — tell the user when a thread needs that.

## Don't

- Don't `question_write` the master card to change an embedded chart — a no-op for the document; edit the clone id.
- Don't put Markdown in `new_str` expecting formatting — stored as literal characters, no error.
- Don't include the `- ` marker in a bullet edit — it merges two items into one.
- Don't full-rewrite for a small change — every comment thread is orphaned, irreversibly.
- Don't write tables, strikethrough, or task lists — no document representation.

## To confirm

`get_content {"type": "document", "id": 12}` returns the stored `content_markdown` (clone ids included); add `"include": ["layout"]` for the block outline, `["comments"]` for anchors. Rendering in the editor has no API check.
