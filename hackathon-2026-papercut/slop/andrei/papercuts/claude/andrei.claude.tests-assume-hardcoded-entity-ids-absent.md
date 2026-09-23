---
title: A `^:parallel` metabot viewing-context test used a hardcoded card id (789) expecting "not found", so whenever another test owned that id it got a 403 path instead and failed on unrelated PRs across several drivers
slug: tests-assume-hardcoded-entity-ids-absent
kind: test-harness
impact: wasted-time
severity: medium
status: fixed # "Stop the metabot viewing-context tests from depending on absent entity ids" merged 2026-09-11
area: test/metabase/metabot/agent/user_context_test.clj (format-viewing-context-test-2c)
merged_from: viewing-context-tests-assume-absent-entity-ids
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7e19d6c9-cfc3-46a6-b6db-e21f76a54bfd.jsonl
    lines: 434-753
    date: 2026-09-10
    jev: {any_papercut: 0.72, env_toolchain: 0.74, stale_state: 0.71, verify_mismatch: 0.42, misleading_code: 0.20, hidden_coupling: 0.24, stale_docs: 0.23, tool_footgun: 0.66, flaky: 0.93, agent_bug: 0.19, wasted_effort: 0.52, user_correction: 0.17}
---
## Summary
The same test failed on four of the user's PRs, on MariaDB, MySQL and Java 25 OSS while passing on Postgres EE and Java 25 EE for the identical commit. The agent traced it to a hardcoded card id in a parallel test that assumes the id does not exist; when another test created it, the permission check returned 403 and the formatted context came back empty.

## Symptom
- L434: "The three backend jobs are the same `format-viewing-context-test-2c` flake ... it passed on Postgres EE and Java 25 EE while failing on MariaDB, MySQL and Java 25 OSS."

## Timeline
- L434: flake identified across matrix cells of one sha and on another PR sharing no files.
- L666 and L708-L722: reruns until the PRs go green.
- L753: root cause summarised; a master-wide fix PR already open.
- Cost: blocked merges and reruns on four PRs over a morning.

## Root cause
The test picks literal entity ids for "absent" entities; app-DB ids are shared across parallel tests in one JVM, so absence is not guaranteed.

## Why agents fall for it
Failures appear only on some matrix cells and look like driver-specific bugs in the PR under review.

## Current state
origin/master: commit "Stop the metabot viewing-context tests from depending on absent entity ids" (2026-09-11) touched user_context_test.clj; the literal 789 is gone.

## Suggested fix
- Lint or review rule: tests must not assume a literal id is absent; derive a missing id from max(id)+n or use a non-numeric sentinel.
- Keep such tests out of `^:parallel`.

## Detection signal
A test failing on some DB matrix cells but not others for the same sha, with a 403/empty result where a 404 fallback was expected.

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/21ad940c-c551-4b95-84ed-c73a3ac86c8a.jsonl
  lines: 2329-2429
  date: 2026-08-24
  jev: {any_papercut: 0.75, env_toolchain: 0.34, stale_state: 0.30, verify_mismatch: 0.38, misleading_code: 0.27, hidden_coupling: 0.48, stale_docs: 0.21, tool_footgun: 0.44, flaky: 0.82, agent_bug: 0.91, wasted_effort: 0.38, user_correction: 0.38}

- L2353: `FAIL in metabase.metabot.agent.user-context-test/format-viewing-context-test-2h (user_context_test.clj:222)`; expected `Top Users` in the output, got `table: users (ID: 321)` only.
- L2416: the same failure with `git stash push -- src test`.
- L2424: still failing in the final batch; committed with the failure noted.

- L2329-2351 (18:42): first wide batch; output clipped, rerun with full capture.
- L2352-2353 (18:43): the 2h failure plus the agent's own transform test failures.
- L2370-2409: reads the tests, fixes its own failures.
- L2414-2416 (18:47): stash A/B; 2h still fails.
- L2422-2429 (18:48): diagnosis and commit.
- Cost: 3 wide batch runs and about 5 minutes, partly shared with real failures.

```
L2353 [RESULT] 10:FAIL in metabase.metabot.agent.user-context-test/format-viewing-context-test-2h (user_context_test.clj:222)
handles multiple viewing items
expected: (re-find #"Top Users" result)
  actual: (not (re-find #"Top Users" "table: users (ID: 321)\n\n\n"))
L2415 [CALL] Bash: git stash push -q -- src test && ./bin/test-agent :only '[metabase.metabot.tools.resources-test metabase.metabot.agent.user-context-test ...]' 2>&1 | grep -aE "FAIL in|ERROR in|assertions"; git stash pop -q; git status --short | wc -l
L2416 [RESULT] FAIL in metabase.metabot.agent.user-context-test/format-viewing-context-test-2h (user_context_test.clj:222)
```
