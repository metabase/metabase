---
title: metabase/metabase rejects a push that updates more than 5 branches (GH013 ruleset), and rejects the whole push
slug: github-push-five-ref-limit
kind: env-friction
impact: wasted-time
severity: low
status: open
area: GitHub repository rulesets on metabase/metabase; pushing restacked stacks (git-spice, restack-branches)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 1694-1724
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.95, misleading_signal: 0.81, user_correction: 0.66, codebase_trap: 0.63, flailing: 0.33, env_friction: 0.93}
---
## Summary
After restacking a seven-branch stack, the agent pushed all seven in one `git push --force-with-lease
origin b1 ... b7`. GitHub rejected every ref with `GH013: Repository rule violations ... Pushes can not
update more than 5 branches or tags.` The push is atomic from the ruleset's point of view: nothing landed.
The agent split the push into 4 + 3 and it went through.

## Symptom
```
L1701 [RESULT] remote: error: GH013: Repository rule violations found for refs/heads/codeowners-from-modules.
remote: - Pushes can not update more than 5 branches or tags.
...
 ! [remote rejected]         owner-approval-audit -> owner-approval-audit (push declined due to repository rule violations)
error: failed to push some refs to 'github.com:metabase/metabase.git'
L1705 [ASSISTANT] The repo caps a push at 5 branches. Splitting.
```

## Timeline
- L1694 agent proposes a single 7-branch push command; L1696 user: "push".
- L1700-1701 rejected.
- L1706-1718 two pushes (4, then 3) succeed; L1721-1722 verification "in sync" for all seven.

## Root cause
A repository ruleset on metabase/metabase limits refs per push. Neither git nor the stack tools
(`restack-branches` prints one `git push --force-with-lease` per branch; the agent combined them) know
about it.

## Why agents fall for it
Combining pushes is a natural optimisation. The limit is invisible until the push is rejected.

## Current state
Not documented in CLAUDE.md, the git-spice skill, or memory. The rule is server-side and presumably still active.

## Suggested fix
One line in the git-spice / stack-topology-rework skill or the global CLAUDE.md: "metabase/metabase caps
a push at 5 refs; batch pushes ≤5." Optionally, have `restack-branches` print batched push commands.

## Detection signal
`GH013` / "Pushes can not update more than 5 branches" in a push result; a `git push` command naming more than 5 refs.

## Raw excerpts
```
L1700 [TOOL Bash] git push --force-with-lease origin \
  nested-modules-metrics nested-modules-infrastructure-master nested-modules-config-carve \
  codeowners-from-modules untangle-util-knots modules-tree-html owner-approval-audit 2>&1 | tail -25
L1724 [ASSISTANT] All seven pushed and in sync. The repo caps a push at five branches, so it went in two batches — the first attempt was rejected wholesale, nothing partial landed.
```
