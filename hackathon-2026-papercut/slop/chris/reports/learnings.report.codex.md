# What the two papercut collections teach us about the record format

2026-09-23. Compared [Claude's index](../papercuts/claude/chris.claude.INDEX.md), [calibration notes](../pipeline/calibration.claude.md), and representative case files with [Codex's index](../papercuts/codex/chris.codex.index.md), case files, and [Jev screening output](../papercuts/codex/chris.codex.jev-screen.jsonl). This report recommends a format for the *next* collection; it does not rewrite either existing collection.

## Recommendation

Use **one canonical file per underlying trap**, with a short readable summary followed by structured metadata, a few decisive evidence anchors, the mechanism, current state, and a detection or reproduction recipe. Let one file contain several occurrences across agents and sessions. Keep classifier scores in the screening ledger, not as the case's truth label. Add a separate, equally deliberate set of negative and ambiguous examples.

Keep the original target boundary explicit. A code or tool trap that causes an agent mistake is a *core papercut*. A recurring agent habit with no demonstrated environmental cause is valuable, but belongs in an *adjacent workflow-risk* set. Claude's 21 `agent-behaviour` records should be reviewed against that boundary rather than automatically counted as 21 core papercuts. For example, `git add -A` sweeping concurrent edits may have a concrete shared-worktree affordance worth testing, while generic overconfident prose is mainly an agent-behavior failure.

Claude's records are the stronger starting point for a case format. All 118 have metadata for kind, impact, severity, status, area, and occurrences; all have a suggested fix and detection signal. Codex's 17 positive cases are shorter (median 162 words versus 737), put clickable transcript pointers next to claims, and include two negative controls. The collections are not directly comparable as a measure of recall: Claude classified 914 long chunks, including subagent material, using seven Jev questions, then drilled the top 110 chunks; Codex classified 696 extracted interactive sessions from compact excerpts using one Jev question, then combined that with manual and parallel-agent review. Several confirmed Codex cases scored below 0.5 because the excerpts omitted the decisive turn. Neither score is a gold label.

## What to keep and what to change

| Dimension | What worked | Change for a shared format |
| --- | --- | --- |
| Unit of record | Claude groups repeated occurrences by mechanism; Codex cases usually describe one concrete failure. | Keep one mechanism per case and list multiple occurrences. Split a file when its proposed fixes or owners differ. |
| Scanability | Codex cases lead with the observed failure and cause; Claude's index exposes kind, severity, occurrence count, and status. | Make the first paragraph a two-sentence trap and consequence; keep the index fields sortable. Use short titles, not paragraph-length titles. |
| Evidence | Claude preserves timeline and short raw excerpts; Codex places source-line links beside individual claims. | Require 2–5 decisive anchors with absolute transcript path, exact line(s), speaker/tool role, and what each proves. Keep a short quote only when it is needed to understand the finding. |
| Mechanism | Claude usually explains “why agents fall for it” and gives a detection signal; Codex identifies the hidden contract in less prose. | State the causal mechanism separately from the symptom, then name the misleading affordance or missing signal. |
| Verification | Claude often checks current code and records status; Codex explicitly treats historical fixes as historical evidence. | Separate *observed in transcript*, *reproduced*, and *current code checked*. Every current-status claim needs a date, repo revision, and evidence. Otherwise use `unknown`. |
| Actionability | Claude suggests fixes and detection signals on every case. | Keep those fields, but mark suggestions as proposals. Give a minimal regression probe or static detection rule when possible. |
| Calibration | Claude records false-positive classes and unanswered 403 chunks; Codex has two negative controls and exposes all 696 scores. | Keep positives, hard negatives, and ambiguous near misses together in a labeled evaluation set. Track corpus coverage and refused/unread material separately from case truth. |

The overlap already shows why identity should follow the trap, not the agent or mining pass. [Codex's CI helper case](chris.codex.ci-repository-default.md) and its later added Claude occurrence describe the same repository-default bug. [Codex's merge-preview case](chris.codex.merge-preview-compile.md) mentions lost comments, but [Claude's comment-loss case](chris.claude.comments-dropped-when-moving-code.md) is a separate mechanism and should remain its own record. [Codex's cluster-lock case](chris.codex.cluster-lock-transaction.md) touches both a transaction-guard near miss and a wrong local app-DB diagnosis; Claude's [ambient-DDL case](chris.claude.search-temp-index-ddl-commits-enclosing-with-temp.md) and [local app-DB case](chris.claude.local-test-appdb-differs-per-worktree-lein-env.md) give those different mechanisms better homes. Neither collection's filename prefix reliably identifies the transcript provider: some `chris.codex.*` cases came from Claude sessions.

## Proposed case file

Use this as a *shape*, not a demand that every case have a long narrative. The metadata supports indexing; the body lets a reviewer verify the judgment without replaying a whole conversation.

```markdown
---
id: papercut-0001
slug: ci-helper-defaults-to-wrong-repo
title: "Numeric PR lookup uses the wrong repository"
label: positive                 # positive | negative | ambiguous
scope: core                     # core | adjacent-workflow-risk
kind: tool-quirk                # codebase-trap | test-harness | misleading-signal |
                                # doc-gap | tool-quirk | env-friction | agent-behaviour
owner: personal-tool            # repo-code | repo-tool | personal-tool |
                                # third-party | harness | agent-practice
impact: wasted-time             # introduced-bug | wasted-time | both | near-miss
severity: medium
status: open                    # open | fixed | documented-still-hit | unknown
status_checked_at: 2026-09-23
status_revision: null           # commit/hash or version; null if not checked
verification: source-reviewed   # transcript-only | source-reviewed | reproduced
related: []
occurrences:
  - provider: codex
    session: 01a0ac63-6602-7cf0-94da-3480c08d5ba4
    transcript: /absolute/path/to/session.jsonl
    lines: [6414, 6445, 6457]
    date: 2026-09-16
---

## Trap
The helper silently assumes metabase/metabase for a bare PR number. In an evals
checkout, PR 155 therefore resolves to an unrelated project.

## Observed sequence
1. Agent runs helper for evals#155; it returns metabase/metabase#155. [Source line]
2. User asks whether the result is a helper bug. [Source line]
3. Setting CI_REPO=metabase/evals yields the intended checks. [Source line]

## Mechanism and agent affordance
PR numbers are repository-local; the helper's default is hidden from the caller.

## Evidence and limits
- [Tool result or user correction]: proves the wrong-repo lookup.
- [Source/code check]: proves the default. This case does not claim the helper
  has since been fixed.

## Detection / reproduction
Run the helper on a bare PR number from a non-metabase repo and compare its
resolved repository to git remote. A regression test must assert the repo,
not just the presence of checks.

## Fix candidate
Infer the repo from the current checkout or require an explicit repo when
ambiguous. This is a proposal until implemented.
```

Two rules matter more than the exact headings:

1. **Do not turn a symptom into a root cause by wording alone.** Store which observation established each step. A user's diagnosis, an agent's theory, a tool result, and a source check are different evidence types. For instance, the apparent H2 result in the [cluster-lock case](chris.codex.cluster-lock-transaction.md) was actually a Postgres run until the environment was checked.
2. **Treat screening as a queue.** A Jev probability, severity, and verification level answer different questions. Claude's calibration found `tool_misuse` and `env_friction` near-saturated, while Codex's compact one-question pass assigned 0.41 to a source-verified indexing bug. Neither pipeline should label by threshold alone.

## Index and evaluation set

Generate the index from metadata instead of hand-maintaining a long table. The default view should show: short title, kind, owner, impact, status, severity, occurrence count, and last verification date. Add filters for “confirmed introduced bug,” “near miss,” and “still open.” Keep related cases linked rather than duplicating their timelines.

Build a small hand-reviewed evaluation set from this corpus before adjusting Jev prompts. Include:

- Clear positives: [MCP scope tests that never reached authorization](chris.codex.mcp-session-tests.md), [nested fields silently deduplicated](chris.codex.nested-field-paths.md), and [git-spice dropping 17 commits while exiting 0](chris.claude.git-spice-stale-base-hash-silently-drops-commits.md).
- Hard negatives: style corrections, normal review iterations, an ordinary bug caught by the agent's own test without a misleading code/tool contract, and the two [Codex negative controls](chris.codex.negative-controls.md).
- Ambiguous cases: a rejected fix, a user-supplied root-cause theory not independently checked, and a documentation-only warning with no demonstrated rework. These should remain `ambiguous` until evidence resolves them.

Score the classifier at the **occurrence** level first, then deduplicate occurrences into cases. That preserves the ability to ask both “did we notice the incident?” and “did we discover the underlying reusable papercut?” Record false negatives as carefully as false positives; the current Codex pass's compact excerpts are a known source of missed context. Claude's 27 refused chunks and its undrilled ranked tail are explicit coverage gaps, not negatives.

## Immediate consolidation

Keep the present `chris.claude.*` and `chris.codex.*` files as source artifacts. For the next pass, create canonical `papercut.<slug>.md` files or a validated case manifest that points back to them. Start with the overlaps above, normalize their statuses against one current checkout, and carry every transcript occurrence forward. Do not bulk-rename the existing files: their names currently preserve which mining pass produced them, which helps audit disagreements.
