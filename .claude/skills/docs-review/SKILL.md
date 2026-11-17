---
name: docs-review
description: Review documentation changes for compliance with the Metabase writing style guide. Use when reviewing pull requests, files, or diffs that touch `docs/`.
allowed-tools: Read, Grep, Bash, Glob
---

# Documentation review skill

@./../\_shared/metabase-style-guide.md

## The standard

If you haven't already, read `../_shared/metabase-style-guide.md` (relative to this skill's directory) before anything else.

Read the diff once for intent before flagging anything.

## Scope

This review covers clarity, style, and formatting. Accuracy is a separate check, so don't verify facts against the source code. If something looks wrong on its face, say so in one line at the end of the review, marked "Not checked," and move on. Reviewing a file, not a diff? Every line is in scope.

## Tiers

Broken things come first, then clarity, then style. One finding outranks any number of findings in a lower tier.

**Tier 0: Existential** Ask whether the page/section/sentence should exist at all. Be ruthless with cutting. A page or section nobody will read costs maintenance and clutters the content people actually need. If the info really is germane to people solving problems (in Metabase or with Metabase): look for opportunities to consolidate the info with another relevant section, trim the section, or wince and cut it completely if you don't think readers will care about it.

**Tier 1 — Broken.** Only in a diff.

- A moved or renamed page with no `redirect_from` entry for its old path, like `/docs/latest/old-section/old-page`. The old page's own `redirect_from` entries carry over too.
- A changed heading whose old anchor is still linked. Search for the anchor, without the `#`:

  ```sh
  grep -rn "cache-configuration" docs/ frontend/src enterprise/frontend/src src enterprise/backend/src
  ```

- A new page with no `title` or `summary` front matter.

**Tier 2 — Clarity.**

- Action buried under explanation.
- A heading naming a topic instead of a point.
- Commands out of the order they're run.
- A paragraph doing two jobs or none.
- A concept in bullets that should be prose.
- Pronouns that impair clarity.
- Full-page screenshot where a scoped one would do.

**Tier 3 — Style.**

- Tone
- Word choice
- Formatting

## What NOT to post

Only post findings. If a doc is clean, say so in one line and post nothing else.

## Output

Cut anything that won't materially help the reader, then number remaining issues from 1, organized by tier.

```markdown
## Issues

**Issue 1 (Clarity)** — Line 8
"Cache configuration" names the topic. State the point: "Turn on caching for slow questions."

**Issue 2 (Clarity)** — Lines 12–14
The command comes after two sentences of explanation. Lead with the command, then explain.

**Issue 3 (Style)** — Lines 15–22
"cannot" → "can't"; "users" → "people";

**Not checked** — Line 30
The page says caching is on by default, but the steps start by turning it on.
```
