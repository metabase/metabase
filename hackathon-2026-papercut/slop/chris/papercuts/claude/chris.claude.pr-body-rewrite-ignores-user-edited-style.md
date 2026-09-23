---
title: Agent rewrites a PR description wholesale in its own long style instead of treating the user's hand-edited body (and sibling PR) as the template
slug: pr-body-rewrite-ignores-user-edited-style
kind: agent-behaviour
impact: wasted-time
severity: low
status: documented-still-hit
area: PR descriptions (gh pr edit --body), pr-writing / sound-less-like-an-ai skills
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2001-audit-appdb-and-dwh-dumps-for-stats-lane-evals/7ad9c402-a811-43c6-b9fe-5e4803b3d6a2.jsonl
    lines: 1832-1876
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.84, misleading_signal: 0.61, user_correction: 0.76, codebase_trap: 0.78, flailing: 0.34, env_friction: 0.82}
---
## Summary
Updating evals PR #104's stale description, the agent replaced the body with long prose, a code block, an unbulleted
Testing section and lowercase `id`. The user had previously rewritten the sibling PR #103 body (written by the
agent) into a terse house style, and #104's old body followed that style. User: "did you maintain the same style and
format as the previous pr description?" Agent: "Clear miss ... I matched the body I'd originally written for #103,
not the one you'd corrected it to." Rewritten at a third of the length.

## Symptom
User correction after the body had been posted.

## Timeline
- L1832-1846 agent rewrites and posts #104 body.
- L1848 user question. L1861-1868 agent diffs against #103's body; admits the miss.
- L1869-1876 restyled; memory `pr-description-house-style.md` written in the evals project.

## Root cause
The user's edits to an agent-written artifact are the strongest style signal, but nothing prompts the agent to diff
its original draft against the current published version before writing the next one. The general memory
`feedback_reread_pr_desc_before_edit.md` (metabase project) says re-fetch before editing, but it lives in a
different project's memory directory from the evals sessions.

## Why agents fall for it
The agent remembers its own earlier draft and reuses that voice; project-scoped memories do not carry across repos.

## Current state
Documented in two places: metabase memory `feedback_reread_pr_desc_before_edit.md` and (after this session) evals memory
`pr-description-house-style.md`. The `pr-writing` skill exists globally.

## Suggested fix
Put "re-read the current body and the user's recent PR bodies; match their structure" into the global `pr-writing`
skill rather than per-project memories.

## Detection signal
`gh pr edit --body` followed by a user message mentioning "style", "format", "previous description".

## Raw excerpts
```
L1848 [USER] did you maintain the same style and format as the previous pr description?
L1868 [ASSISTANT] Clear miss on my part ... You'd rewritten **#103's** description into a terser house style -- short paragraphs
under `## What changed`, a bulleted `## Testing`, `IDs` capitalised. #104's previous body followed exactly that shape.
I replaced it with long prose, a code block, and an unbulleted Testing section using lowercase `id`.
```
