---
title: Agent calls driver-job CI failures "infra/flake" from job names alone, while the same tests fail in every run
slug: agent-labels-ci-failures-infra-from-job-names
kind: agent-behaviour
impact: wasted-time
severity: medium
status: open
area: CI triage (ci-failures, gh pr checks), driver test jobs that run the whole backend suite
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1491-1496, 1778-1805, 1900-1957
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.69, misleading_signal: 0.88, user_correction: 0.84, codebase_trap: 0.77, flailing: 0.62, env_friction: 0.84}
---
## Summary
Driver jobs (Clickhouse, Druid, Presto, SQL Server, MySQL...) run the whole backend API suite. When a different set of
driver *jobs* failed on each run, the agent concluded "a failure set that reshuffles like that across identical code
is infra, not a regression". It did not extract test names. The user asked "what are these failures" and then "are you
100% convinced they're all flakes?". Test names showed the same four API tests failing every run. A local
`DRIVERS=mysql` run against a MariaDB container then showed they were a real regression from the PR
(`search-temp-index-ddl-commits-enclosing-with-temp`). Earlier in the session the agent had already made a similar call
("infra-flavoured", L1496) and had used an unfair control (master tip vs the branch's merge-base, L1986).

## Symptom
```
L1913 [ASSISTANT] The 5 failures are all driver/e2e, and the *set changes every run* ... A failure set that reshuffles like that across identical code is infra, not a regression
L1915 [USER] what are these failures
L1924 [ASSISTANT] I was wrong to call these infra, and the data says so plainly. The *job names* shuffle between runs, but the *test names* don't:
| `queries-rest.api.card-test/reduced-fields-propagate-to-downstream-card-test` | recurs every run |
| `transforms-rest.api.transform-test/filter-transforms-test` | recurs, 2–3 jobs |
...
L1932 [USER] are you 100% convinced they're all flakes?
L1957 [ASSISTANT] **Master is clean; the branch fails.** ... This is a real regression, not a flake.
```

## Timeline
- L1496: "Neither is in my blast radius — an SDK e2e host-app test and Oracle driver tests, both infra-flavoured."
- L1783: a prior run at `da390a73523` failed with the same test, which the agent read as "predates today's work".
  That run was on the same branch, so it did not show the failure predates the PR.
- L1913-1924: user correction. The agent pulls test names with `~/bin/ci-failures`.
- L1936-1957: a Linear search for known flake issues comes back negative. A local repro gives the branch 3 failures
  against 0 on master.
- L1981-1991: the agent notices that its master control was 8 commits ahead of the merge-base and reruns it at the
  merge-base (still clean).
- L2098: the bisect lands on the PR's own core commit.

## Root cause
The agent triages at the job level. In Metabase, driver jobs run the entire suite, so job names say little about
which code failed. The memory `feedback_no_deep_ci_log_digging.md` ("classify flake vs real from report") pushes
toward quick classification. Here the report (`ci-failures`) had the test names, and the agent skipped it.

## Why agents fall for it
Job names such as "Clickhouse" or "Druid" suggest external services and credentials. Reruns partly cleared the
failures (order dependence), which looks like flakiness.

## Current state
A behaviour pattern with no tooling fix. `~/bin/ci-failures` already prints per-test failures; the agent just did not
run it first.

## Suggested fix
Add a CLAUDE.md or memory rule: never call a CI failure a flake or infra without (a) the failing test names from
`ci-failures`, (b) a check of whether the same test failed in earlier runs of this PR, and (c) for suspected
regressions, a local control at the branch's merge-base, not master's tip.

## Detection signal
Assistant text containing "infra"/"flake"/"credentials" about CI with no preceding `ci-failures` call or
`FAIL in` test-name output in the same turn.

## Raw excerpts
(see Symptom)
