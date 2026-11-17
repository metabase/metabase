---
name: docs-write
description: Write documentation following Metabase's conversational, clear, and reader-focused style. Use when creating or editing pages in `docs/`.
allowed-tools: Read, Write, Edit, Grep, Bash, Glob
---

# Documentation writing skill

@./../_shared/metabase-style-guide.md

If you haven't already, read `../_shared/metabase-style-guide.md` (relative to this skill's directory) before anything else.

## Write from the material you're given

This skill covers clarity, style, and formatting. Accuracy is a separate check, so look something up only when you need it to write the page, and leave auditing the material against the source code to that check. If the material looks wrong on its face, or doesn't say where the feature stops, keep what the material says and flag the problem in your reply instead of guessing.

## Give a new page front matter, then format it

Give a new page `title` and `summary` front matter. When you're done, run `bunx prettier --write` on the file.

## Change only the sections you were asked to change

- **Fix anything in those sections that breaks the guide.** That's as far as the guide's "while I'm on this page, I might as well tidy up" goes for you. Mention problems elsewhere on the page instead of fixing them.
- **Check the formatting before you edit.** Run `bunx prettier --check` on the file. If the check passes, run `bunx prettier --write` on the file when you're done. If the check fails, skip `bunx prettier --write`, or Prettier rewrites lines you didn't touch.
- **If you rewrite a heading, fix the links to it.** Product code links to docs anchors too, and nothing checks those links. Before you change `## Cache configuration`, search for the anchor it generates, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

## Redirect a moved or replaced page, and fix links to it

- **Add the old path to `redirect_from`.** Carry over the old page's own `redirect_from` entries too.

  ```yaml
  redirect_from:
    - /docs/latest/old-section/old-page
  ```

- **Update the links to the old page.** Search for the old page name:

  ```sh
  grep -rn "old-page" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

  A stale link in `docs/` fails the link check, and a stale `useDocsUrl("old-section/old-page")` in the frontend fails `bun run lint-docs-links`.

## Leave the jokes to the humans

Keep the jokes you find on a page. Writing new ones is a job for human writers.

## Reread and cut before you finish

Reread once and delete every sentence the reader could have skipped. The guide's "Cut filler" list is the checklist.
