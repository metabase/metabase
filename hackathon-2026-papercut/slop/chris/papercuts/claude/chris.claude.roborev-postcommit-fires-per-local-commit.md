---
title: roborev's post-commit hook queues a review for every local commit, including commits later reset away, and --no-verify does not stop it
slug: roborev-postcommit-fires-per-local-commit
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: .husky/post-commit (roborev post-commit, installed by worktrunk; gitignored), roborev daemon queue
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 869-976
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.98, tool_misuse: 0.64, misleading_signal: 0.63, user_correction: 0.42, codebase_trap: 0.87, flailing: 0.63, env_friction: 0.70}
---
## Summary
Each `git commit` runs `.husky/post-commit`, which calls `roborev post-commit` and queues a codex review of that
SHA. The agent made one combined commit, reset it away, and re-split the changes into six commits with
`--no-verify`, meaning to skip hooks. `--no-verify` bypasses only pre-commit and commit-msg, so seven reviews were
queued. One was for an unreachable SHA. Each review took 2-10 minutes. The backlog the user had just compacted
fragmented again.

## Symptom
```
L934 [RESULT] ID    SHA      ...  Status
4878  2548228  queued
4877  7249011  queued
4876  ea5c9b3  queued
4875  85b8532  running
4874  7c40051  running
4873  8fe14ae  running
4872  51119dc  running
L938 [ASSISTANT] Yes — seven new ones. The post-commit hook fired on every commit; `--no-verify` only bypasses `pre-commit` and `commit-msg`, not `post-commit`, so my skipping the hook didn't suppress these.
**4872 is garbage.** It's reviewing `51119dc`, the squashed commit I reset before splitting. That SHA is unreachable from the branch now ...
**The other six will re-fragment the backlog** — exactly the per-commit pile-up we just spent the earlier part of this session compacting away
```

## Timeline
- L869-873: a combined `git add -A` commit `51119dc` is made, and the agent decides to split it.
- L874-889: `git reset --soft HEAD~1` is followed by six `git commit -q --no-verify` commits. L892: "I skipped the hook
  on the split commits to avoid re-running it five times".
- L933-938: `roborev list` shows seven new jobs.
- L941-954: the user says "close out resolve roborev reviews". The agent polls about 9 minutes for the queue to drain.
- L958: job 4881 (`d0ea069`) comes from another session. Because the queue is global, the agent has to work out
  which jobs belong to it.
- L976-978: the reviews did find real problems (4873 High), so the reviews were useful. The cost was the
  unreachable-SHA review and the wait.

## Root cause
The review trigger is a post-commit hook, so every local commit is treated as review-worthy, including throwaway
commits during a split or fixup. Agents think `--no-verify` means "no hooks". The hook file is local and gitignored,
so an agent reading the repo cannot see it.

## Why agents fall for it
`--no-verify` is widely described as "skip git hooks". The roborev integration is invisible: `.husky/post-commit` is
gitignored and was installed by worktrunk. `roborev cancel` leaves jobs in a state that `roborev close` cannot close
(the agent notes this at L938: "cancelling now would leave it in the same unclosable `canceled` state as the 76 from
earlier").

## Current state
`.husky/post-commit` in the main checkout: `"$ROBOREV" post-commit 2>/dev/null || true`, commented as "roborev
auto-review — installed by worktrunk pre-start; local, gitignored." Memory `reference_roborev_husky_double_trigger.md`
covers a double-trigger variant. No memory or CLAUDE.md note says that `--no-verify` does not stop roborev, or that
reset-away commits still get reviewed. The existing papercut `husky-precommit-needs-node-modules-in-worktree`
records a different agent that wrongly blamed `--no-verify` for *missing* reviews.

## Suggested fix
- Have roborev skip or auto-cancel jobs whose SHA is no longer reachable from any branch when the job starts, or
  provide `roborev close --unreachable`.
- Document an escape hatch (for example `ROBOREV_SKIP=1 git commit ...` checked in the hook) for split/fixup
  sequences, and add one line to memory saying that `--no-verify` does not skip post-commit.

## Detection signal
`git reset --soft HEAD~N` or `commit --amend` following a commit in the same session, when roborev is installed.
`roborev list` shows jobs for SHAs where `git merge-base --is-ancestor <sha> HEAD` fails.

## Raw excerpts
```
L882 git add src/metabase/app_db/connection.clj && git commit -q --no-verify -F - <<'EOF'
Do not poison the transaction tree when the savepoint is already gone
...
L889 [RESULT] 25482284aca Let a failed dataset pre-warm be heard
7249011d627 Commit the out-of-band lock row rather than assume autocommit
ea5c9b3016d Say something when a stored query is dropped
85b85320a63 Ask whether the app db can hold the index, not whether any engine can
7c40051d3de Keep the test request's session out of the login hooks
```
