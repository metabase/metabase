---
name: document
description: Write and edit Metabase documents through `document_write` — the Markdown dialect they speak (CommonMark plus `{% card %}` embeds and `{% entity %}` links), and the string-anchored `edits` contract that changes a paragraph without re-sending the document. Load before creating or editing a document, especially one that embeds saved questions. Triggers — "write up the findings", "add a section to the doc", "embed that chart in the document", "fix the second paragraph".
---

# Document

A Metabase document is prose that embeds live content: a written narrative with charts, questions, and
links to other Metabase entities rendered inline. `document_write` takes it as Markdown; the server
converts to and from the document's stored form.

`get_content(items: [{type: "document", id}])` returns the same Markdown, and that projection is what
your edits anchor against.

## Creating

```json
{"method": "create",
 "name": "Q3 revenue review",
 "collection_id": 12,
 "content_markdown": "## What happened\n\nRevenue grew 12% quarter over quarter, driven by the\nenterprise segment.\n\n{% card id=118 name=\"Revenue by month\" %}\n\nSee also {% entity id=42 model=\"dashboard\" %} for the weekly view.\n"}
```

The dialect is CommonMark — headings, lists, tables, code fences, links — plus two tokens:

- `{% card id=118 name="Revenue by month" %}` — a **block** embed of a saved question. It renders the
  live chart, so it re-runs whenever someone opens the document.
- `{% entity id=42 model="dashboard" %}` — an **inline** smart link to another entity (`question`,
  `model`, `metric`, `dashboard`, `document`, `collection`).

Both reference content that already exists. A chart the document needs but the instance doesn't have is
a `question_write` first, then an embed of the id it returns. Layout containers (side-by-side columns,
resized blocks) round-trip through their own tokens; write plain Markdown unless you're editing a
document that already has them.

## Editing

`method: "update"` takes exactly one of `edits` or `content_markdown` — never both.

**`edits` is the normal case.** Each entry is a string match-and-replace against the Markdown
projection you just read:

```json
{"method": "update",
 "id": 7,
 "edits": [{"old_str": "Revenue grew 12% quarter over quarter",
            "new_str": "Revenue grew 14% quarter over quarter"}]}
```

- `old_str` must match **exactly once**. Zero matches or several is an error naming the fix: extend the
  snippet with surrounding context until it's unique, or pass `replace_all: true` when you really mean
  every occurrence.
- Include enough context to be unambiguous, and no more.
- Append a section by anchoring on the end of the one before it, not by re-sending the document.

**`content_markdown` on an update is a deliberate rewrite.** It replaces the whole document. Only use
it when the user asked for a rewrite.

Why it matters: untouched blocks keep their identity, and comment threads anchored to them survive.
Blocks you edit are recreated, so their comment threads may be orphaned — the response tells you which.
A full rewrite recreates everything. Reproducing a document from memory to change one sentence is both
the expensive way and the way sentences silently change.

Documents have no optimistic locking. A stale `old_str` simply won't match, and the error tells you to
re-read — which is the intended behavior, not a failure.

## Other fields

`name`, `collection_id` (moves it), `collection_position` (pins it), `archived: true | false` (trash
and restore).
