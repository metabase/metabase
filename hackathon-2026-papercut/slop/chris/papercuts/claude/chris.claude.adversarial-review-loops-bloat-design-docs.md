---
title: Repeated adversarial review-and-fix rounds on a design doc grow it monotonically (1,200 lines) and each round's fixes introduce the next round's HIGHs; user had to redirect to "converge on good enough"
slug: adversarial-review-loops-bloat-design-docs
kind: agent-behaviour
impact: both
severity: medium
status: open
area: agent workflow -- design docs with review subagents (Codex/Fable), ~/planning/evals/clickhouse-schema.md + HTML artifact
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/55e589b9-fa19-477f-abc9-90a776975bfc.jsonl
    lines: 403-796
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.83, misleading_signal: 0.49, user_correction: 0.23, codebase_trap: 0.87, flailing: 0.62, env_friction: 0.50}
---
## Summary
The agent ran five review rounds on a ClickHouse schema design. Every round found new HIGH issues, several created by
the previous round's fixes ("Round two found a HIGH that my own round-one fix created", L502; "Round three: one HIGH
-- my allocation fix was wrong", L582). Round four (a "build it" lens) declared the doc "not buildable" with six HIGHs
after three reading rounds had called it ready. Material was only ever added: the doc reached ~1,215 lines, mirrored
by hand into a separate HTML artifact. The user stopped it: "rather than proceeding being adversarial, let's try to
converge on something that's good enough and intuitive" (L792). Agent: "five rounds added material monotonically and
nothing ever came out. The doc is 1,200 lines and the *idea* fits on a page."

## Symptom
Growing doc, per-round "new class of problem" reports, and fix scripts failing (Python `assert old in s` string-
replace patches failed at L424, L504, L523, L545, L671, L708, L761 because the doc had drifted).

## Timeline
L329 Codex review -> L394 Fable review -> L502 round 2 -> L582 round 3 ("stopping the loop") -> L604 user "keep
looping" -> L632 round 4 "not buildable" -> L746 round 5 operations -> L792 user redirect -> L797 backup + simplify.

## Root cause
Review agents are asked to find problems, so they always find some; fixes are appended rather than simplifying; two
copies (markdown + HTML artifact) double the surface for drift. No stopping criterion or size budget.

## Why agents fall for it
Each finding is individually valid, and accepting findings looks diligent.

## Current state
Open behaviour pattern. Not in memory/CLAUDE.md.

## Suggested fix
Give review loops an explicit exit (budget of rounds, "only blocking findings", require each fix to delete or
simplify something); keep one canonical doc and generate the artifact from it.

## Detection signal
Consecutive review rounds each reporting HIGHs attributed to the previous round's fix; doc line count strictly
increasing across rounds; repeated failing `assert old in s` patch scripts.

## Raw excerpts
```
L502 [ASSISTANT] Round two found a HIGH that my own round-one fix created. Applying everything.
L582 [ASSISTANT] Round three: one HIGH -- my allocation fix was wrong.
L632 [ASSISTANT] ... verdict is **not buildable**, six HIGHs, and the cost pipeline (my centerpiece) has three mutually contradictory rules.
L792 [USER] rather than proceeding being adversarial, let's try to converge on something that's good enough and intuitive
```
