---
title: metabase still ships `.coderabbit.yaml` with a `coderabbit` label trigger and keeps a `Claude Code Review` label, but neither review bot runs any more, so applying either label silently does nothing
slug: stale-coderabbit-config-and-review-labels
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: `.coderabbit.yaml`, repo labels `coderabbit` and `Claude Code Review`, deleted `.github/workflows/claude-code-review.yaml`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/e5aa197a-2c3b-410a-88ba-2e3f3de005dc.jsonl
    lines: 6-182
    date: 2026-09-05
    jev: {any_papercut: 0.77, env_toolchain: 0.37, stale_state: 0.10, verify_mismatch: 0.09, misleading_code: 0.21, hidden_coupling: 0.39, stale_docs: 0.43, tool_footgun: 0.61, flaky: 0.28, agent_bug: 0.67, wasted_effort: 0.67, user_correction: 0.97}
---
## Summary
The user labelled PRs `coderabbit` and `Claude Code Review` to get a machine review, as before, and nothing happened. The agent spent about 25 tool calls (repo config, git history, GitHub search, announcement search) establishing that the Claude review workflow was deleted in July 2026 and the review app no longer responds, while the config file and both labels stayed in place and looked live. Explicit `@coderabbitai review` comments from other people also went unanswered.

## Symptom
- L6: the user reports that applying the `coderabbit` or `Claude Code Review` label started no review.
- L47-L48: `.coderabbit.yaml` still has `auto_review: labels: - "coderabbit"`.
- L56-L57: git history shows the Claude review workflows deleted ('Remove claude-based workflows').
- L173-L174: recent `@coderabbitai` comments have zero reactions.
- L182: the agent concludes that neither integration runs any more.

## Timeline
- L6: question.
- L32-L60: workflow list, config, history, GitHub search.
- L61-L170: searches for an announcement; none found.
- L173-L182: comment reactions confirm the app is silent; summary.
- Cost: about 25 tool calls of research, after the user's own failed attempts.

## Root cause
Removing a review integration left its trigger points behind: `.coderabbit.yaml` (unchanged since 2026-07-06) and the two labels. Nothing in the repo records that the integrations are gone.

## Why agents fall for it
A config file in the repo is strong evidence that a feature is live. An agent asked to get a bot review would apply the label, see no error, and wait.

## Current state
Checked origin/master: `.coderabbit.yaml` still exists with `auto_review.labels: ["coderabbit"]`; no Claude review workflow remains in `.github/workflows/`. The repo label list was not checked.

## Suggested fix
- Delete `.coderabbit.yaml`, or add a comment that the app is not installed, and remove or rename the dead labels.
- Add a short 'machine review' line to the contributor docs saying what currently works.

## Detection signal
PRs carrying `coderabbit` or `Claude Code Review` labels with no bot comment after an hour; `@coderabbitai` comments with zero reactions.

## Raw excerpts
```
L47 [CALL] cat .coderabbit.yaml
L48 [RESULT] # yaml-language-server: $schema=https://coderabbit.ai/integrations/schema.v2.json | reviews: |   high_level_summary: false |   review_status: false |   auto_review: |     enabled: false |     drafts: true |     labels: |       - "coderabbit" | ...
L56 [CALL] git log --oneline --diff-filter=D -5 -- '.github/workflows/*claude*'; echo "=== files ==="; git log --all --oneline --name-status -3 -- '.github/workflows/*claude*' | head -30
L57 [RESULT] ... | === files === | cd5fac215c4 Remove claude-based workflows | D	.github/workflows/claude-code-bug-fix.yml | D	.github/workflows/claude-code-review.yaml | ...
L174 [RESULT] id=5539001528 2026-09-04T10:14:13Z reactions=0 | id=5540911283 2026-09-04T13:10:38Z reactions=0 | ...
```
