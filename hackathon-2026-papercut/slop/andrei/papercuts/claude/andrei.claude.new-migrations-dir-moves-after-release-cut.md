---
title: New Liquibase migrations must live in `resources/migrations/0<CURRENT_VERSION+1>/` with matching `v<N>.` IDs, which changes the day a release branch is cut; only CI's `check-migration-versions` knows, the local migration lints pass, and `CURRENT_VERSION` is a repo variable agents cannot read
slug: new-migrations-dir-moves-after-release-cut
kind: doc-gap
impact: wasted-time
severity: medium
status: open # no developer doc on master describes the directory rule; bin/check-migration-versions is the only source
area: resources/migrations/0NN/; bin/check-migration-versions; .github/workflows/migrations.yml (check-migration-versions, vars.CURRENT_VERSION); ./bin/mage lint-migrations; bin/lint-migrations-file
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a6fd99bcc709d6e88.jsonl
    lines: 373-466
    date: 2026-09-17
    jev: {any_papercut: 0.86, env_toolchain: 0.58, stale_state: 0.31, verify_mismatch: 0.41, misleading_code: 0.41, hidden_coupling: 0.85, stale_docs: 0.32, tool_footgun: 0.80, flaky: 0.36, agent_bug: 0.94, wasted_effort: 0.74, user_correction: 0.11}
---
## Summary
A PR written before `release-x.64.x` was cut had its migration in `resources/migrations/064/` with `v64.*` changeset IDs. After the cut, master expects new migrations in `065/` with `v65.*` IDs. `./bin/mage lint-migrations` and `./bin/lint-migrations-file.sh` both passed with the file in 064, and the PR's last CI run (before the cut) had passed `check-migration-versions`. The agent noticed only because it looked at release branches; it then had to download another PR's CI job log to learn `CURRENT_VERSION: 64` and `Expected directory: = 065`, since the value lives in a GitHub Actions variable (`gh variable get CURRENT_VERSION` returns 'not found', agent-af57 L717-L718).

## Symptom
L373-L374: local migration lints report 'Validating 064/20260910_ai_usage_log_provider.yaml ... Ok.'; L393-L400: no doc under docs/developers-guide or resources/migrations mentions the directory rule; L429: another PR's job log prints `CURRENT_VERSION: 64` and `Expected directory: = 065`.

## Timeline
- L378-L383: agent lists release branches and sees `release-x.64.x` cut on 2026-09-16 without this PR.
- L386-L400: reads the migrations workflow and lint code and searches docs; nothing documents the rule.
- L403-L408: checks where earlier releases' late migrations landed.
- L415-L429: reads `bin/check-migration-versions` and pulls another PR's job log for the CI-only values.
- L450-L466: `git mv` to 065, rewrites the changeset IDs to `v65.*`, reruns the script with `CURRENT_VERSION=64` plus both migration lints.
- Cost: about 3 minutes and 15 tool calls; skipping it would have failed `check-migration-versions` after the push and cost another CI round.

## Root cause
The expected directory is computed in CI from `vars.CURRENT_VERSION`, which is bumped when a release branch is cut. The local lints check syntax and ID ordering, not placement. `bin/check-migration-versions` runs locally but needs `BASE_REF` and `CURRENT_VERSION`, and nothing in the repo exposes the current value.

## Why agents fall for it
A branch that was green goes stale with no change of its own, merging master is clean, both local migration lints pass, and the one number that decides the directory is invisible from a normal checkout.

## Current state
Checked origin/master: `bin/check-migration-versions` still reads `CURRENT_VERSION` from the environment; no file under docs/developers-guide mentions migration directories or `check-migration-versions`.

## Suggested fix
- Have `./bin/mage lint-migrations` run `bin/check-migration-versions`, deriving `CURRENT_VERSION` from the newest `release-x.NN.x` branch on origin when unset.
- Document the rule beside the migrations (README in resources/migrations or the developers guide): new files go in `0<next>/` with `v<next>.` IDs, and move when a release is cut before merge.
- Make `mage new-migration` choose the directory with the same logic.

## Detection signal
A branch adding files under `resources/migrations/0NN/` while `release-x.NN.x` exists on origin; CI log `Expected directory: = 0..` that differs from the added path; `gh variable get CURRENT_VERSION` answering 'variable CURRENT_VERSION was not found'.

## Raw excerpts
```
L374 [RESULT] 1462:Ran 28 tests in 7.239 seconds
    Validating 064/20260910_ai_usage_log_provider.yaml ...
    Validating 064/20260911_table_user_settings.yaml ...
    Ok.
L378 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git ls-remote --heads origin 'release-x.6*' | awk '{print $2}' | tail -5; git log origin/master --diff-filter=A --format='%h %ci %s' -- resources/migrations/065 | head; git log origin
L393 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git grep -n -i "migrations/06\|new migration\|migration.*directory\|release branch.*migration\|migration.*release branch" -- 'docs/developers-guide/*' 'resources/migrations/*.md' '*.m
L394 [RESULT] (Bash completed with no output)
L418 [CALL] Bash: cd ~/src/mb/wt/<worktree> && sed -n 20,70p .github/workflows/migrations.yml; cat bin/check-migration-versions | head -80
L428 [CALL] Bash: cd ~/src/mb/wt/<worktree> && curl -sL -H "Authorization: token $(gh auth token)" https://api.github.com/repos/metabase/metabase/actions/jobs/105018506212/logs | /usr/bin/grep -a "CURRENT_VERSION\|Expected directo
L429 [RESULT] 2026-09-16T23:39:45.2853472Z   CURRENT_VERSION: 64
    2026-09-16T23:39:45.2937378Z CURRENT_VERSION: 64
    2026-09-16T23:39:45.2941695Z Expected directory: = 065
L450 [CALL] Bash: cd ~/src/mb/wt/<worktree> && git mv resources/migrations/064/20260910_ai_usage_log_provider.yaml resources/migrations/065/20260910_ai_usage_log_provider.yaml && sed -i 's/id: v64\.2026-09-10T12:00:0/id: v65.2026-
L458 [RESULT] 4beeb4e26bd Move the ai_usage_log provider migration to version 65
    BASE_REF: master
    CURRENT_VERSION: 64
    Expected directory: = 065
    All new migration files are in the correct directory.
```
