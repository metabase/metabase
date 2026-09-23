---
title: roborev review --since <baseline> reviews every master commit a merged-in base brought along; the pr-rereview skill says the opposite
slug: roborev-since-includes-merged-base-commits
kind: doc-gap
impact: wasted-time
severity: high
status: open
area: roborev CLI (`review --since`), ~/.claude/skills/pr-rereview/SKILL.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/1212e408-9c8b-4bb3-b9cd-ae892dec51bf.jsonl
    lines: 441-532
    date: 2026-09-17 (approx)
    jev: {self_inflicted_bug: 0.22, tool_misuse: 0.94, misleading_signal: 0.77, user_correction: 0.95, codebase_trap: 0.46, flailing: 0.73, env_friction: 0.94}
---
## Summary
During a /pr-rereview of #82165, the agent ran `roborev review --since dc2a737` as the skill instructs. The author had merged master into the branch (`0c9d495a47e`), so the `dc2a737..HEAD` range held ~450 files of unrelated master code (mcp/v2 and friends). The codex review ran 40+ minutes before the user asked for a check-in, and roborev's health output flagged it only as a "stalled job". The skill explicitly claims `--since` still scopes to the branch's own commits after a base merge, which is false: it is a plain `..` range and `roborev review` has no path filter or first-parent option.

## Symptom
User: "check in on the roborev review and make sure its making progress" (L441). `roborev list` showed job 6008 `running 40m34s...`; `roborev status` said `Health: DEGRADED ... 1 stalled job(s) running > 30 min`. `roborev show 6008` -> `Error: no review found for job 6008`. `roborev logs` doesn't exist (it's `roborev log`). The log showed codex grepping `test/metabase/mcp/v2/message_test.clj`, unrelated to the PR.

## Timeline
- L246-262: agent polls `roborev list`; a `sleep 150` is blocked by the harness, it switches to a background `until` loop parsing `awk 'NR==2{print $5}'`.
- L441-449: user asks for progress. `roborev status 6008` -> DEGRADED, stalled > 30 min.
- L453-454: `roborev show 6008` -> no review; `roborev logs` -> unknown command, "Did you mean log".
- L459-469: `roborev log 6008` (273KB) shows codex reading mcp/v2 tests.
- L477: "The `--since dc2a737` range swallowed the base merge (`0c9d495a47e`), so it's been chewing through ~450 files of `mcp/v2` and friends for 40 minutes."
- L478: `roborev cancel 6008` at 41m51s.
- L489-521: workaround: new detached worktree at the baseline, `git checkout <head> -- <16 files the branch's own commits touched>`, then `roborev review --dirty --wait`. Clean in a few minutes.
- L532: agent: "The skill's warning about `--since` scoping past a base merge turns out to be wrong: it's a plain git `..` range and `roborev review` has no path filter."
- L535-561: user asks to add a PR comment requesting rebase over merge, because "my usual flow is to directly pass the given range to an LLM ... with a merge this results in a huge amount of irrelevant code being brought in".

## Root cause
roborev's `--since X` reviews `X..HEAD`, which includes every commit reachable via the merge's second parent. The pr-rereview skill asserts otherwise.

## Why agents fall for it
The skill tells them to, and adds a reassuring (wrong) note. The job shows `running` with a growing timer and no progress indicator, so a runaway review looks like a slow one. The skill's suggested sanity check ("check the 'Reviewing N commits' line against the first-parent count") only helps if the agent reads the enqueue output, and the enqueue line was not surfaced.

## Current state
Still wrong. ~/.claude/skills/pr-rereview/SKILL.md:56:
> `roborev review --since <baseline> --wait --agent codex` ... If the author merged the base in, `--since` still scopes to the branch's own commits; check the "Reviewing N commits" line against the first-parent count.

Line 44 of the same skill correctly says to use `--first-parent` / `origin/$BASE...HEAD` for listing and diffing, so the skill is internally inconsistent. Memory `reference_rereview_across_rebase.md` recommends `roborev review --since <last-matching-sha>` without the merge caveat.

## Suggested fix
- Fix SKILL.md:56: "If the author merged the base in, `--since` includes the merged master commits. Build a scratch worktree at the baseline, check out HEAD's version of the files the first-parent commits touch, and run `roborev review --dirty`" (the recipe from L489-521), or ask roborev upstream for `--first-parent`/path filters.
- Add the same caveat to reference_rereview_across_rebase.md.
- Before enqueueing, compute `git rev-list --count <baseline>..HEAD` vs `--first-parent` and refuse `--since` when they differ.

## Detection signal
- `roborev status` reporting `stalled job(s) running > 30 min` for a job enqueued with `--since`.
- In a transcript: `roborev review --since` where `git log --merges <since>..HEAD` is non-empty.
- A hook in the skill: print both commit counts and stop if they differ.

## Raw excerpts
```
L449 Health: DEGRADED
       ! workers: 1 stalled job(s) running > 30 min
L454 Error: no review found for job 6008
     Error: unknown command "logs" for "roborev"  Did you mean this? log
L469 {"type":"item.completed","item":{... "command":"/bin/zsh -lc \"rg -n \\\"message/truncate|msg/truncate ...\" src enterprise/backend test ..."
     ... test/metabase/mcp/v2/message_test.clj:72: ...
L484 Job 6008 canceled   6008  dc2a737..c4e11a9  metabase  codex  canceled  41m51s
L509 16 files changed, 209 insertions(+), 127 deletions(-)
L532 The skill's warning about `--since` scoping past a base merge turns out to be wrong: it's a plain git `..` range and `roborev review` has no path filter.
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-review-bot-1997/ef637b05-28bd-40e5-a402-79a3e8b7d142.jsonl
  lines: 76-150
  date: 2026-09 (re-review of PR #80083)
  jev: {self_inflicted_bug: 0.72, tool_misuse: 0.97, misleading_signal: 0.78, user_correction: 0.05, codebase_trap: 0.73, flailing: 0.77, env_friction: 0.93}
- The PR author had merged master into the branch twice (`dd28fbfe94f`, `3c3e24b19b5`), and the local worktree was 678 commits behind the pushed branch. To get a reviewable range, the agent built synthetic commits in a scratch worktree: a baseline commit with the PR files as of the last review, then a commit with the files at the new head, all on top of current master's merge-base. That took four attempts (L99, L111, L116, L133-138). Failures came from zsh non-splitting and husky (see `zsh-and-bsd-shell-quirks`, `husky-precommit-needs-node-modules-in-worktree`). An attempted `git rebase --onto` of the old reviewed state hit conflicts (L133-134). It ended with a single "flattened" PR-diff commit `02b8a91` reviewed with `roborev review --repo "$WT" <sha>` (L143). roborev has no "review the PR's net diff against its merge-base" mode, so every re-review of a branch that merged master turns into this.
