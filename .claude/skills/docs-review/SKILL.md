---
name: docs-review
description: Review documentation changes for compliance with the Metabase writing style guide. Use when reviewing pull requests, files, or diffs containing documentation markdown files.
allowed-tools: Read, Grep, Bash, Glob, mcp__github__get_pull_request_diff, mcp__github__create_pending_pull_request_review, mcp__github__add_pull_request_review_comment_to_pending_review, mcp__github__submit_pending_pull_request_review
---

# Documentation review skill

@./../_shared/metabase-style-guide.md

## The standard

The guide above is the standard. Read the diff once for intent before flagging anything — half of what looks wrong is a deliberate choice. Don't invent rules beyond the guide, and never enforce one without its exception: flagging an exception is worse than missing a violation.

## Tiers

Tiers follow the guide's priority order: accurate, then clear, then on-style. One tier 1 finding outranks any number of tier 3.

**Tier 1 — Accuracy.** The guide's Accuracy section, actually checked: setting and environment variable names, UI labels, examples that run, numbers that go stale, screenshots showing a UI that has since moved, a gated section missing its plan blockquote. Run the `defsetting` grep on every `MB_*` in the diff, and the i18n grep on every bolded UI label. The only tier that costs a support ticket, and the one human reviewers skip.

**Tier 2 — Clarity.** Action buried under explanation; a heading naming a topic instead of a point; commands out of the order they're run; a paragraph doing two jobs or none; a concept in bullets that should be prose; pronouns taking over right after a new term; a full-page screenshot where a scoped one would do; a feature described without saying where it stops.

Plus one only a diff makes visible: **did this change push the reader's answer further down the page, or put a preamble in front of it?** Burial this diff introduced is yours. Burial that was already there is a nit on untouched lines; if it's bad enough to mention, mention it once as a move ("hoist the permission levels above the click path"), not a rewrite.

**Tier 3 — Style.** Tone and word choice. Real, but never the headline.

## What NOT to post

Only post findings — congratulation is noise that hides them. Also skip lateral rewrites, nits on untouched lines, and formatting nobody enforces. If a doc is clean, say so in one line and post nothing else.

## Output

Cut anything that won't materially help the reader, then number what's left from 1, leading with the tier.

```markdown
## Issues

**Issue 1 (Accuracy)** — Line 42
`MB_ENABLE_CACHING` has no `defsetting`; it's `enable-query-caching`, so the variable
is `MB_ENABLE_QUERY_CACHING`.

**Issue 2 (Clarity)** — Line 8
"Cache configuration" names the topic. State the point: "Turn on caching for slow
questions".

**Issue 3 (Style)** — Line 15 — "cannot" → "can't".
```

### Posting to a GitHub PR

Only with `mcp__github__*` tools; otherwise report in the conversation. Create a pending review, read line numbers from the diff, add every comment **in one response with parallel calls**, then submit with event `COMMENT` and no body. Start each with `**Issue N (Tier)**`; don't also print to the conversation.
