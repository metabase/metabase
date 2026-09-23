---
title: Agent's `git add -A` in a worktree the user was editing concurrently committed the user's edits under the agent's commit message (and pushed)
slug: git-add-all-sweeps-concurrent-user-edits
kind: agent-behaviour
impact: introduced-bug
severity: medium
status: open
area: git workflow in shared worktrees; branch moved under the agent
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/6da9d86f-a923-4553-b05f-b4e4e363b231.jsonl
    lines: 995-1500
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.47, user_correction: 0.92, codebase_trap: 0.86, flailing: 0.55, env_friction: 0.40}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/58ea02b2-4677-4a04-ac01-d6ef1c7624e4.jsonl
    lines: 341-355
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.86, tool_misuse: 0.93, misleading_signal: 0.64, user_correction: 0.70, codebase_trap: 0.53, flailing: 0.39, env_friction: 0.83}
---
## Summary
Chris edits the same worktree/branch while an agent works in it (he pushed four commits to the agent's branch mid-session, and later reworded strings in files the agent was also editing). The agent commits with `git add -A`, so his uncommitted edits land in the agent's commit with a misleading message, and it gets pushed. The same session also showed the agent operating on a stale model of the branch (describing "my 1 commit" when there were 5).

## Symptom
- L997: review subagent cites "5 commits and 38a913aa676 'Prime the ratchet shrink workflow' that isn't mine" -> L1002 "The branch has moved — you've added four commits on top of mine and pushed. My model was stale".
- L1382 agent: `git add -A && git commit ... "Break the ratchets header on its sentences"`, pushed as ad370bb3a95.
- L1462-1466: that commit "touched four files and 24 lines of kondo_ratchet.clj — far more than a header re-break. My `git add -A` swept up your concurrent edits (the warning rewording, the docstring, CLAUDE.md) under my commit message ... it's pushed."
- Related (session 58ea02b2, L341-350): a `set -e` script chained `git add -A src bin/src ... && git commit`; the `git add` failed on a pathspec that no longer existed, but the `git mv` rename was already staged, so it rode along in the *next* commit ("Track search-benchmark-capture script"). `set -e` does not stop on a failing command inside an `&&` list.

## Root cause
Agent habit of `git add -A` / broad pathspecs, plus no check of `git diff --cached --stat` against the files it intended to touch. The environment makes it worse: Chris works in the same trees concurrently, and file-change notices don't make it obvious which edits are his.

## Why agents fall for it
`git add -A` is the common idiom; the pre-commit hooks pass; the agent's summary is written from memory of its own edits, not from the staged diff.

## Current state
Open. Nothing in CLAUDE.md/skills says "stage explicit paths" or "verify the staged stat before commit". The agent self-corrected mid-session ("I'll stage explicit paths from here").

## Suggested fix
- Global CLAUDE.md: "Stage explicit paths. Before committing, compare `git diff --cached --stat` against the files you edited; if other files or hunks appear, stop and ask (the user may be editing concurrently)."
- Before summarising a branch, re-read `git log origin/<branch>..` and `@{u}` rather than relying on session memory.

## Detection signal
`git add -A` / `git add .` followed by a commit whose `--stat` includes files the agent never edited in the session; commit message scope much narrower than the diff; `git log` showing commits by the user interleaved on the agent's branch.

## Raw excerpts
```
L1466 [ASSISTANT] `ad370bb3a95` touched four files and 24 lines of `kondo_ratchet.clj` — far more than a header re-break. My `git add -A` swept up your concurrent edits (the warning rewording, the docstring, CLAUDE.md) under my commit message. Nothing is lost or wrong, but that message is misleading and it's pushed. Flagging it now; I'll stage explicit paths from here.
58ea02b2 L342 [RESULT] fatal: pathspec 'bin/src' did not match any files
L347 Track search-benchmark-capture script
 bin/.stow-local-ignore | 19 --
 {bin/src => src}/review-requests-2.lis | 0
```


## Additional occurrence
(merged from a parallel drill, batch b0; originally drafted as chris.claude.git-add-all-sweeps-concurrent-worktree-edits. This one committed a Liquibase migration edit and broke local test runs.)

```yaml
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-preliminary-cleanups/584db19f-a406-43a1-b9f1-5db9a68c5e28.jsonl
    lines: 3435-3600
    date: 2026-09-08..09
    jev: {self_inflicted_bug: 0.93, tool_misuse: 0.84, misleading_signal: 0.70, user_correction: 0.30, codebase_trap: 0.45, flailing: 0.62, env_friction: 0.94}
```

### Summary
The agent's habit throughout the session was `git add -A && git commit ...` (dozens of times). Late in
the session, while it did a docstring pass on four files, something else (another agent or the user)
was concurrently rewriting prose in the same worktree. `git add -A` committed six files the agent never
touched into "Move the lease rationale out of the docstrings", including
`resources/migrations/064/20260818_search_index_lease.yaml`. The edited migration changed its
Liquibase checksum, so the next test runs failed at app-db init
(`ValidationFailedException ... changesets check sum ... was: 9:d95e... but is now: 9:97cf...`),
and a test JVM from that run was left running for ~7h48m (see
`test-jvm-orphaned-after-liquibase-checksum-failure`). The agent only noticed via the checksum error.
It also drops rationale from comments it didn't write (e.g. prometheus.clj c3p0 lock-ordering comment).

### Symptom
```
L3515 [RESULT] liquibase.exception.ValidationFailedException: Validation Failed:
L3519      1 changesets check sum
          migrations/064/20260818_search_index_lease.yaml::v64.2026-08-18T13:57:56::crisptrutski was: 9:d95e8ef266e8dc08683733995e860001 but is now: 9:97cfc7b113e905f3b6b83eed30232daa
L3544 [RESULT] 1 2 enterprise/.../semantic_search/pgvector_api.clj
10 11 resources/migrations/064/20260818_search_index_lease.yaml
3 9 src/metabase/analytics/prometheus.clj
5 11 src/metabase/app_db/connection.clj
...
```

### Timeline
- L3435-3436: `git diff --name-only` already shows `search/core.clj`? (4 files the agent expected).
- L3485: `git add -A && git commit -q -m "Move the lease rationale out of the docstrings"` -> 8986bde8dd1 (11 files).
- L3486: restack of upstack branch FAILED (conflict with the foreign edits).
- L3511-3519: test-agent fails on Liquibase checksum.
- L3529-3544: agent finds the migration changed in its own commit; six untouched files in the commit.
- L3560 ASSISTANT: "They were sitting modified in the worktree and my `git add -A` swept them into a commit ... I should have staged explicit paths in a shared checkout."
- L3558: seven more files currently modified in the worktree by the other writer.
- L3613: reflog shows someone else squashed the whole stack at 02:47 while this was going on.

### Root cause
Two writers in one worktree with no lock or signal; `git add -A` stages everything. Migration files
look like ordinary YAML prose to a docstring/comment-tightening pass, but any byte change alters the
Liquibase checksum.

### Why agents fall for it
`git add -A` is the default idiom and is safe when the agent is the sole writer, which it assumes.
Nothing tells it another session shares the worktree. `git status` before commit was checked only
once early in the session.

### Current state
Open. No hook prevents committing edits to already-applied changesets on an unreleased branch; the
checksum reset is documented in memory `reference_local_test_appdb_migration_reset.md`. Nothing
documents "stage explicit paths" or detects concurrent writers. `feedback_fixup_commits.md` covers
amend habits, not staging.

### Suggested fix
- Agent guidance (CLAUDE.md): stage explicit paths (`git add <files you edited>`), and diff
  `git diff --cached --stat` against the files you touched before committing.
- A PreToolUse hook: warn on `git add -A`/`git add .` when `git status` shows paths the session never
  edited (the harness knows which files the agent Edit/Wrote).
- Lint: a comment/doc pass should exclude `resources/migrations/**`; a pre-commit check could warn when a
  staged diff touches a changeset that exists on the merge-base.

### Detection signal
- `git add -A` immediately followed by a commit whose `--stat` includes files never referenced in the
  session's Edit/Write calls.
- `ValidationFailedException ... check sum` after a commit that touched `resources/migrations/`.

### Raw excerpts
```
L3560 [ASSISTANT] My commit `8986bde8dd1` contains edits to six files I never touched:
enterprise/.../semantic_search/pgvector_api.clj
resources/migrations/064/20260818_search_index_lease.yaml
src/metabase/analytics/prometheus.clj
src/metabase/app_db/connection.clj
src/metabase/app_db/connection_pool_setup.clj
src/metabase/search/core.clj
They're the same kind of prose-tightening I was doing, on files outside my pass -- for instance `prometheus.clj`'s c3p0 comment was condensed, dropping the specific lock-ordering detail and the "Hopefully". I didn't write that.
```

### Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-data-stack-bot-2089-start-ingesting-eval-results-into-clickhouse/8ca32d6f-c22b-4954-a66c-c4ae6aaa2fd7.jsonl
  lines: 1549-1706
  date: 2026-09-01
  jev: {self_inflicted_bug: 0.96, tool_misuse: 0.92, misleading_signal: 0.71, user_correction: 0.16, codebase_trap: 0.76, flailing: 0.46, env_friction: 0.89}
  flagged: 1435-1800
  repo: metabase/data-stack (not the metabase repo), PR #94, worktree data-stack.bot-2089-start-ingesting-eval-results-into-clickhouse

Same pattern in a different repo, plus a destructive recovery:
- L1549 user runs `/code-review`; L1553 the review subagent (82 tool uses, ~13 min, same worktree) reports four findings. During this window something else rewrote comments across the worktree (condensed/"de-slopped" versions of long why-comments in `source.yml`, `raw_evals.sql`, `ci.yml`, `compose.ci.yml`, the terraform test, README, CLAUDE.md). The transcript does not show who; candidates are the review subagent or the user editing concurrently.
- L1636: `git add -A && git status --short && git commit -q -F - <<'MSG' ... MSG && git push` -- status printed 13 modified files (L1637) but the chain committed and pushed without pausing. Commit message claimed only the four review fixes.
- L1652: `13 files changed, 105 insertions(+), 147 deletions(-)`; L1656/L1664 show long comments replaced, e.g. the raw_evals.sql JSON comment reduced to `-- Native JSON requires ClickHouse 25.3 or newer.`
- L1659: "Something went wrong with that commit — it rolled back earlier work."
- L1678: `git reset --hard b7935b2` then re-applied the four fixes via a python heredoc (L1681) and `git push --force-with-lease=...:5b56ab5...` (L1701). If the foreign edits were the user's in-progress de-slop, `reset --hard` destroyed them without asking; the agent never asked who made them.
- L1764 agent's own summary: "My first attempt at those fixes was committed with `git add -A` without reading the diff, and it swept in edits I hadn't made — condensed rewrites of comments across `source.yml`, the DDL, `compose.ci.yml`, the terraform test and others ... I reset to the last good commit, re-applied the four fixes cleanly, and force-pushed over it".
- Extra wrinkle: `git status --short` output was in the same `&&` chain as the commit, so the agent "looked" at the file list only after the push had already happened.
- Suggested addition to the fix: when unexpected hunks appear, stash them to a named ref (`git stash push -m foreign-edits -- <paths>`) or ask, rather than `reset --hard`; never put `git status` inside the same `&&` chain as `commit && push`.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
  lines: 387-602
  date: 2026-09-10
  jev: {self_inflicted_bug: 0.95, tool_misuse: 0.93, misleading_signal: 0.58, user_correction: 0.95, codebase_trap: 0.74, flailing: 0.70, env_friction: 0.93}

Here the concurrent editor was a **codex** session (pid 41307, `codex-code-mode-host`) running in the same worktree
(`metabase.module-resolver`), not Chris. The Claude agent noticed foreign edits (L387 THINKING: "Someone else is
editing this worktree in parallel"; L433: "another actor edited modules_config.clj, bb.edn, db_ns.clj and db_ns_test.clj
beyond my changes"), judged them "just prose tightening", and **folded them into its own commit** (L453: "the other
edits are just prose tightening, so I'll fold them into the commit"), then pushed (L454-472, `1a2e2bdcbe7`). The user
then objected that the diff was "inflated by places where we inserted docstrings where there were none" (L482), which
was largely codex's rewording. Codex kept editing after the commit: at L515 the agent found "11 files modified since
my commit". The agent's attempted cleanup `git checkout -- .` (L560) was blocked by the auto-mode classifier as
"Irreversible Local Destruction" (L563), which was correct: it would have discarded codex's uncommitted work.
It saved `git diff > codex-uncommitted.patch` instead.

Detection: `lsof -a -d cwd` / `ps` shows another agent process (codex, claude) with cwd in the same worktree; a
file-change notice for a file the agent did not edit; `git diff --stat` before commit containing files outside the
agent's edit list. The agent did run `lsof` (L496) but only after committing.

## Additional occurrence (sweeps the agent's own unrelated edits into one commit)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
  lines: 869-889
  date: 2026-08-25
  jev: {self_inflicted_bug: 0.98, tool_misuse: 0.64, misleading_signal: 0.63, user_correction: 0.42, codebase_trap: 0.87, flailing: 0.63, env_friction: 0.70}

The agent had fixed 8 review findings across 8 files, then ran `git add -A && git commit -q -F - <<'EOF' Do not poison the transaction tree when the savepoint is already gone ...`. The message described only connection.clj.
L873: "That staged everything into one commit whose message only covers the `connection.clj` change. Splitting it properly — it isn't pushed yet."
It then ran `git reset --soft HEAD~1 && git reset -q` and made six `git commit --no-verify` commits. The discarded combined commit had already fired the roborev post-commit hook, so a review of an unreachable SHA was queued (see `roborev-postcommit-fires-per-local-commit`).

## Additional occurrence
Two more instances of two actors sharing one worktree, both near-misses rather than bad commits:

- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2001-audit-appdb-and-dwh-dumps-for-stats-lane-evals/7ad9c402-a811-43c6-b9fe-5e4803b3d6a2.jsonl
  lines: 1600-1642
  date: 2026-08-26
  jev: {self_inflicted_bug: 0.91, tool_misuse: 0.84, misleading_signal: 0.61, user_correction: 0.76, codebase_trap: 0.78, flailing: 0.34, env_friction: 0.82}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
  lines: 1389-1397
  date: 2026-08-24
  jev: {self_inflicted_bug: 0.94, tool_misuse: 0.48, misleading_signal: 0.59, user_correction: 0.09, codebase_trap: 0.87, flailing: 0.75, env_friction: 0.64}

In the first, the user (via another agent) checked out a new branch `mbql-ids-verify-db-id` *in this agent's worktree* and
committed, while the agent had an uncommitted rewrite of `scripts/configure-local-metabase` in the tree. The
edit rode across the branch switch. The agent noticed only because HEAD moved (L1620 "Hold on -- HEAD has moved.
There's a commit here I didn't make"), checked reflog, and verified its identifiers (`CatalogueEntry`) were not
in the user's commit. L1642: "If you'd used `git commit -a` or `git add -A`, my half-finished rewrite would have
gone into your commit".

In the second, a parent agent and a background subagent worked in the same worktree. The subagent's uncommitted cljfmt fix
"vanished from status" -- the parent had absorbed it into its own commit `4c1bccc3f87`. L1393 "The coordinator
has been committing under me (my cljfmt fix absorbed)." The parent in turn noted (main transcript L2710-2743)
"The agent's search-test work is still uncommitted in the tree -- I've kept my commits strictly to my own files".
Detection: an agent that launches a subagent with repo write access in its own cwd, without `isolation: worktree`.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
  lines: 1105-1116, 1207
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}

A milder variant, where the agent's own pending changes (not the user's) got swept together. The user approved two separate changes on #81341 (non-keyword linter rejection, and test consolidation plus the EDN reader). The agent ran `git add -A && git commit -q -m "Reject non-keyword linter names ..."`, which put both into one commit (L1107-1108; the output was mostly lint-staged noise, and the agent read `git log` to see what happened). L1111: "Both changes landed in one commit — my first `git add -A` swept everything. Splitting them before push". It ran `git reset --soft HEAD~1 && git restore --staged .` and made two commits with explicit paths. The post-commit roborev hook had already queued a review on the orphaned combined commit (job 5308), which then had to be closed by hand as orphaned (L1207).
Also in this batch: `git add -A && git rebase --continue` committed conflict markers (slackbot-uploads-cleanup L202; see `bsd-tools-silent-failure-commits-conflict-markers`).

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-aee7cc11cc58331de.jsonl (deleted; reconstructed from redacted chunks)
  lines: 8-82
  date: 2026-08-21
  jev: {subagent of flagged session b31b1fd7 lines 6-430; scores not in batch}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a8d86a710d897ba09.jsonl (deleted; reconstructed from redacted chunks)
  lines: 5-6
  date: 2026-08-21
  jev: {subagents; scores not in batch}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a13d4dbcc131e3ace.jsonl (deleted; reconstructed from redacted chunks)
  lines: 27
  date: 2026-08-21
  jev: {subagents; scores not in batch}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a78c6410c75364840.jsonl (deleted; reconstructed from redacted chunks)
  lines: 29-33
  date: 2026-08-21
  jev: {subagents; scores not in batch}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09/subagents/agent-a4d2f969a8f51a83f.jsonl (deleted; reconstructed from redacted chunks)
  lines: 48-49
  date: 2026-08-21
  jev: {subagents; scores not in batch}

A variant with a reviewer instead of a committer. The /code-review orchestrator snapshotted `git diff 72b3d9c2712...HEAD > review.diff` (L8) and
gave finders/verifiers paths from it. Meanwhile the user kept committing on the same branch in the same worktree:
"Move the tenant-permission migration to 063 for the single backport" (b40268a), then "... to 061 so it backports to every affected release"
(8a95e39). The file moved `064/` -> `063/` -> `061/` and the changeset id `v64.*` -> `v63.*` -> `v61.2026-08-21T10:00:00` during the review.
Effects: verifier a8d86 L6 `cat: resources/migrations/063/...: No such file or directory`; finder A (L33) reported "Stale diff: file moved
064 -> 063" as a *finding*; verifier a13d4 L27 "the diff you fed me is stale"; the orchestrator re-snapshotted twice (L34, L73) and re-anchored
the findings (L70, L76). A review needs a pinned SHA, or a detached worktree at that SHA, when the user is still working on the branch.
