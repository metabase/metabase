---
name: docs-write
description: Write documentation following Metabase's conversational, clear, and user-focused style. Use when creating or editing documentation files (markdown, MDX, etc.).
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
---

# Documentation writing skill

@./../_shared/metabase-style-guide.md

Read `../_shared/metabase-style-guide.md` (relative to this skill's directory) before anything else, unless its text already appears above. That guide is the standard. This skill is only the workflow around it.

## Scope

This skill covers clarity, style, and formatting. Accuracy is a separate check, so write from the material you're given, and look something up only when you need it to write the page. Don't audit the material against the source code. If something in it looks wrong on its face, keep it and say so in your reply.

## Writing a new page

- **Give the page `title` and `summary` front matter.** Read one or two neighboring pages in the same directory for anything else they carry.
- **Format the page when you're done.** Run `bunx prettier --write` on it.

## Editing an existing doc

- **Scope changes to the sections you were asked to change.** Fix style exceptions inside them. That's as far as the guide's "while I'm on this page, I might as well tidy up" goes for you. Mention problems elsewhere on the page instead of fixing them.
- **Check the formatting before you edit.** Run `bunx prettier --check` on the file. If it passes, run `bunx prettier --write` on it when you're done. If it doesn't, leave the formatting alone, or prettier rewrites lines you didn't touch.
- **If you rewrite a heading, fix the links to it.** Product code links to docs anchors too, and nothing checks those links. Before changing `## Cache configuration`, search for the anchor it generates, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

## Moving or replacing a page

- **Add the old path to `redirect_from:`**, and carry over the old page's own `redirect_from` entries.

  ```yaml
  redirect_from:
    - /docs/latest/old-section/old-page
  ```

- **Update the links to the old page.** A stale link in `docs/` fails the link check, and a stale `useDocsUrl("old-section/old-page")` in the frontend fails `bun run lint-docs-links`.

  ```sh
  grep -rn "old-section/old-page" docs/ frontend/src enterprise/frontend/src
  ```

## On any page

Leave the jokes you find. Don't add your own.

## Before you finish

Reread once and delete every sentence the reader could have skipped. The guide's "Cut the filler that writes itself" list is the checklist.
