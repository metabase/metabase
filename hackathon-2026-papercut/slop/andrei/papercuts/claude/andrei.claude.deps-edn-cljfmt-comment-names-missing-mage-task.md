---
title: A comment in Metabase's deps.edn tells readers to run `./bin/mage cljfmt-file`, a task that does not exist (it is `cljfmt-files`), and mage answers the unknown task by printing its task list with no error line
slug: deps-edn-cljfmt-comment-names-missing-mage-task
kind: doc-gap
impact: wasted-time
severity: low
status: open
area: deps.edn comment block near the old :cljfmt alias, bb.edn mage tasks, mage unknown-task handling
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
    lines: 1838-1850
    date: 2026-09-11
    jev: {any_papercut: 0.80, env_toolchain: 0.64, stale_state: 0.21, verify_mismatch: 0.86, misleading_code: 0.21, hidden_coupling: 0.59, stale_docs: 0.40, tool_footgun: 0.82, flaky: 0.81, agent_bug: 0.95, wasted_effort: 0.84, user_correction: 0.93}
---
## Summary
Looking for the local equivalent of CI's cljfmt job, the agent grepped the workflow and deps.edn. deps.edn still carries a comment left from when cljfmt was a deps alias: it says `./bin/mage cljfmt-file file1.clj file2.clj` fixes specific files and that `./bin/mage cljfmt-all` checks without fixing. The task name is wrong, and the check-only advice contradicts CI (`cljfmt-all --force-check`). Running `cljfmt-file` printed mage's task list with no error, so the agent had to list tasks to find `cljfmt-files` and `cljfmt-updated`.

## Symptom
L1840 grep hit `793:  ;;     ./bin/mage cljfmt-file file1.clj file2.clj`; L1843-L1844 `./bin/mage cljfmt-file src/...` printed the task table (`nrepl ... lint-migrations ... new-migration ...`); L1849-L1850 `./bin/mage ls | grep fmt` showed `cljfmt-all`, `cljfmt-files`, `cljfmt-staged`.

## Timeline
- 09:43 L1838-L1840 greps backend.yml and deps.edn for cljfmt.
- 09:43:43 L1843-L1844 runs the documented `cljfmt-file`; gets the help listing.
- L1849-L1850 lists tasks; L1858 uses `cljfmt-updated`.
- Cost: two calls; an agent following the comment's 'check without fixing' line would run the fixer instead of a check.

## Root cause
The comment was kept on purpose when the alias moved to bb.edn ('leaving these dox here in case anyone comes looking for it'), and the task was later renamed to `cljfmt-files`.

## Why agents fall for it
deps.edn is where Clojure developers look for aliases, and grep for 'cljfmt' lands on this comment next to the CI workflow hit.

## Current state
Checked origin/master deps.edn lines 787-805: still `./bin/mage cljfmt-file file1.clj file2.clj`, `./bin/mage cljfmt-file test file1.clj`, and 'to check for errors without fixing them: ./bin/mage cljfmt-all'. bb.edn defines `cljfmt-files` with examples.

## Suggested fix
- Replace the comment with pointers to `./bin/mage cljfmt-files`, `cljfmt-updated` and `cljfmt-all --force-check`, or delete it.
- Make mage print 'unknown task: <name>' (with a did-you-mean) before the task list.

## Detection signal
Command `./bin/mage cljfmt-file ` (singular), or any mage call whose output is the task table.

## Raw excerpts
```
L1838 [CALL] grep -n "cljfmt" ~/src/mb/metabase/.github/workflows/backend.yml | head -5; grep -n "cljfmt" ~/src/mb/metabase/deps.edn | head -5
L1840 [RESULT] 466:  be-cljfmt: 475:      - name: Run cljfmt 476:        run: ./bin/mage cljfmt-all --force-check 485:      - be-cljfmt 789:  ;;     ./bin/mage cljfmt-all 793:  ;;     ./bin/mage cljfmt-file file1.clj file2.clj 797:  ;;     ./bin/mage cljfmt-file test file1.clj ...
L1843 [CALL] cd ~/src/mb/wt/<branch> && ./bin/mage cljfmt-file src/metabase/metabot/tools/shared/llm_shape.clj src/metabase/metabot/tools/shared/content_store.clj ... 2>&1 | tail -25
L1844 [RESULT] nrepl                       Starts the babashka nrepl: helpful for mage development lint-migrations             Lint migrations files new-migration               Create a new directory-based migration file (v60+) ...
L1849 [CALL] ./bin/mage ls 2>&1 | grep -i "fmt\|format" ; ...
L1850 [RESULT] │ cljfmt-all                  ╎ Runs cljfmt on all (clojure) files │ │ cljfmt-files                ╎ Runs cljfmt on the given files/directories │ │ cljfmt-staged ...
```
