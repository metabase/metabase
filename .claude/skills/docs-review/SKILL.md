---
name: docs-review
description: Review documentation changes for compliance with the Metabase writing style guide. Use when reviewing pull requests, files, or diffs containing documentation markdown files.
allowed-tools: Read, Grep, Bash, Glob
---

# Documentation review skill

@./../_shared/metabase-style-guide.md

## The standard

Read `../_shared/metabase-style-guide.md` (relative to this skill's directory) before anything else, unless its text already appears above. That guide is the standard.

Read the diff once for intent before flagging anything — half of what looks wrong is a deliberate choice. Don't invent rules beyond the guide, and never enforce one without its exception: flagging an exception is worse than missing a violation.

## Scope

This review covers clarity, style, and formatting. Accuracy is a separate check, so don't verify facts against the source code. If something looks wrong on its face, say so in one line at the end of the review, marked "Not checked", and move on.

## Tiers

Clarity comes before style. One clarity finding outranks any number of style findings.

**Tier 1 — Clarity.** Action buried under explanation; a heading naming a topic instead of a point; commands out of the order they're run; a paragraph doing two jobs or none; a concept in bullets that should be prose; pronouns taking over right after a new term; a full-page screenshot where a scoped one would do; a feature described without saying where it stops.

Plus one only a diff makes visible: **did this change push the reader's answer further down the page, or put a preamble in front of it?** Burial this diff introduced is yours. Burial that was already there is a nit on untouched lines; if it's bad enough to mention, mention it once as a move ("hoist the permission levels above the click path"), not a rewrite.

**Tier 2 — Style.** Tone, word choice, and formatting. Real, but never the headline. Group findings from the same section into one issue.

## What NOT to post

Only post findings — congratulation is noise that hides them. Also skip lateral rewrites, nits on untouched lines, and formatting the guide doesn't ask for. If a doc is clean, say so in one line and post nothing else.

## Output

Cut anything that won't materially help the reader, then number what's left from 1, leading with the tier.

```markdown
## Issues

**Issue 1 (Clarity)** — Line 8
"Cache configuration" names the topic. State the point: "Turn on caching for slow questions".

**Issue 2 (Clarity)** — Lines 12–14
The command comes after two sentences of explanation. Lead with the command, then explain.

**Issue 3 (Style)** — Lines 15–22
"cannot" → "can't"; "users" → "people"; `bash` → `sh`.

**Not checked** — Line 30
The page says caching is on by default, but the steps start by turning it on.
```

### Posting to a GitHub PR

Only with `mcp__github__*` tools; otherwise report in the conversation. If there's nothing to post, don't open a review; say so in the conversation. Otherwise, create a pending review, read line numbers from the diff, add every comment **in one response with parallel calls**, then submit with event `COMMENT` and no body. Start each with `**Issue N (Tier)**` or `**Not checked**`; don't also print to the conversation.
