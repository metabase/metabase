---
title: The agent inferred that PR #125 belonged to someone else from its `codex/` branch prefix, and built a stacking recommendation on that; the branch was the user's own, created through the codex CLI
slug: codex-branch-prefix-misread-as-other-author
kind: agent-behaviour
impact: wasted-time
severity: low
status: open
area: metabase/evals PRs #125/#126; codex CLI branch naming (`codex/<slug>`)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-andreis-fix-result-metadata-contracts/ac10dbfc-43e6-404f-9d15-bc71dbd4bc09.jsonl
    lines: 800-857
    date: 2026-09-07 (approx; #125 created 2026-09-07T16:51Z)
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.50, misleading_signal: 0.49, user_correction: 0.89, codebase_trap: 0.83, flailing: 0.40, env_friction: 0.50}
---
## Summary
Asked "should we stack 126 on 125?", the agent argued against: "#125 isn't your branch. Stacking makes #126's
mergeability depend on a branch someone else force-pushes" (L829). The only evidence was the head ref
`codex/capture-degradation-diagnostics`. The user asked "are you sure 125 isn't mine?". `gh pr view 125 --json author`
and `git log --format=%an` showed crisptrutski / Chris Truter (L845). The agent also withdrew a second claim it
had made twice before, that the `RunWriter.close()` signature change would force a fixup on whichever PR merged
second: #125 adds no `close()` calls (L816-829). The final recommendation (fold #125 into #126) came only after both
claims were checked.

## Symptom
```
L829 [ASSISTANT] ... #125 isn't your branch. Stacking makes #126's mergeability depend on a branch someone else force-pushes
L833 [USER] are you sture 125 isn't mine?
L847 [ASSISTANT] No, you're right — it is yours. ... the `codex/` prefix is just the tool that made the branch, not a different person. I inferred an owner from a branch name, which was sloppy.
```

## Root cause
Agent behaviour: it inferred ownership from a naming convention instead of from `gh pr view --json author`. The
`codex/` prefix is produced by the user's own tooling (see memory `reference_codex_cli_second_opinion.md`), and
reads like a bot or another agent's branch.

## Suggested fix
Memory line: "`codex/*` branches are Chris's (created via codex CLI); check `gh pr view --json author` before
reasoning about PR ownership."

## Detection signal
Claims like "isn't your branch" / "someone else's PR" with no preceding `gh pr view ... author` call.
