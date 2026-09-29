---
name: docs-write
description: Write documentation following Metabase's conversational, clear, and user-focused style. Use when creating or editing documentation files (markdown, MDX, etc.).
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
---

# Documentation writing skill

@./../_shared/metabase-style-guide.md

The guide above is the standard. This skill is only the workflow around it.

## Writing a new page

- **Name the reader first.** Match the complexity to them: don't oversimplify a hard thing or overcomplicate a simple one.
- **Read one or two neighboring pages** in the same directory and copy their front matter shape. `title:` is always present; add `summary:` where the siblings have it.
- **Run the guide's Accuracy checks** on every setting name, UI label, and example before you save. Whatever tripped you up when learning the topic will trip the reader too, so address it.

## Editing an existing doc

- **Scope changes to the relevant sections**. Leave the rest alone. Use `Edit`, not `Write`. A diff touching forty lines to fix two buries the actual change. Mention unrelated problems rather than fixing them here.
- **If you rewrite a heading, fix links to the heading (if any)**. For example, before changing `## Cache configuration`, search for inbound links to the anchor it generates:

```
grep -rn "#cache-configuration" docs/
```

Moving a page? Add the old path to `redirect_from:` in the front matter.

## Before you finish

Reread once and delete every sentence the reader could have skipped. The guide's "Cut the filler that writes itself" list is the checklist.
