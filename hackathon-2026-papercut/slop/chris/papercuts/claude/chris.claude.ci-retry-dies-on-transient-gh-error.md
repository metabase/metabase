---
title: ~/bin/ci-retry exits on the first transient GitHub API error mid-poll, and piping it to tail reports exit 0, so CI goes unwatched while the task reads "completed"
slug: ci-retry-dies-on-transient-gh-error
kind: tool-quirk
impact: wasted-time
severity: low
status: open
area: ~/bin/ci-retry (poll-until-done), background Bash tasks piped through tail
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1359-1411
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.69, misleading_signal: 0.88, user_correction: 0.84, codebase_trap: 0.77, flailing: 0.62, env_friction: 0.84}
---
## Summary
The user asked for `ci-retry`. The agent ran it in the background as `~/bin/ci-retry 80065 ... | tail ...`. A single
`error connecting to api.github.com` made `poll-until-done` log "Failed to fetch checks" and `System/exit 3`, with
no retry. The notification said `completed (exit code 0)` because of the pipe, so the failure looked like success.
The agent caught it only because it knew the exit code was tail's. Later watchers in the same session were also
killed (L1699-1702), so CI went unwatched.

## Symptom
```
L1392 <summary>Background command "Run ci-retry on PR 80065" completed (exit code 0)</summary>
L1395 [ASSISTANT] `ci-retry` finished — though that exit code is `tail`'s, not the script's, since I piped it.
L1397 [RESULT] → Waiting... 0 queued, 80 running, 0 pending, 0 failed, 31 passed
Shell error: error connecting to api.github.com
check your internet connection or https://githubstatus.com
✗ Failed to fetch checks
L1400 [ASSISTANT] It died on a transient `api.github.com` connection error mid-poll, not on a CI result — CI is still running unwatched. Relaunching, this time preserving the real exit code.
```

## Root cause
`~/bin/ci-retry:43-47`: `(when-not checks (ci/log-err "Failed to fetch checks") (System/exit 3))`. One failed poll ends
a watcher that can run for an hour or more. Agents also pipe long-running commands through `tail` out of habit, and
that hides the exit status.

## Why agents fall for it
A "completed (exit code 0)" notification reads as success. Exit code 3 (fetch failure) is not in the ci-retry skill's
list of meanings.

## Current state
Unchanged in `~/bin/ci-retry` (checked 2026-09-23, lines 37-47).

## Suggested fix
In `poll-until-done`, retry `ci/pr-checks` with backoff (for example 5 attempts) before exiting 3. Add a note to the
skill: run ci-retry without a pipe, or use `set -o pipefail`, so the background task carries the real exit status.

## Detection signal
A background task notification with exit 0 whose output ends in "Failed to fetch checks". Any `ci-retry ... | tail`
command line.

## Raw excerpts
(see Symptom)
