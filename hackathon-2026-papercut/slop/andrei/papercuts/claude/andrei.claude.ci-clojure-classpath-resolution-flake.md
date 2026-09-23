---
title: A one-line frontend dependency bump went red on nine checks (classpath resolution, backend start timeouts, an H2 export test), and it took an hour, a user push-back and 36-run base rates to show they were infra flakes
slug: ci-clojure-classpath-resolution-flake
kind: misleading-signal
impact: wasted-time
severity: medium
status: unknown # flakes; a rerun of the identical commit went green
area: Run tests workflow (e2e groups, SDK backward-compat, driver H2), prepare-backend, ci-conductor quarantine
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/367ade68-abaa-469f-ad27-a55947196cd0.jsonl
    lines: 336-849
    date: 2026-09-10
    jev: {any_papercut: 0.78, env_toolchain: 0.89, stale_state: 0.26, verify_mismatch: 0.93, misleading_code: 0.21, hidden_coupling: 0.32, stale_docs: 0.19, tool_footgun: 0.74, flaky: 0.88, agent_bug: 0.26, wasted_effort: 0.38, user_correction: 0.16}
---
## Summary
The PR changed package.json, bun.lock and one type argument. CI failed H2 (a pivot export assertion), three e2e groups and SDK backward compatibility; one e2e group died with "Error building classpath. Unable to resolve org.clojure/clojure version". The agent first called them unrelated, the user pushed back, the agent then compared check buckets across five other PRs and concluded the failures were unique to this PR, found that comparison invalid, built a local production build (first with a missing cljs step), sampled 36 completed runs for base rates, and finally reran: all green.

## Symptom
- L343: H2 (OSS) and e2e-group-27-ee fail within 12 minutes; more groups follow.
- L441: e2e-group-27 died at `Error building classpath. Unable to resolve org.clojure/clojure version: [1.2.1],[1.3.0]`.
- L614: the user asks the agent to confirm the failures are not just flakes.
- L670: the agent reads five other PRs passing the same five jobs as proof the failures are specific to this PR and drops the infra explanation.

## Timeline
- L336-L441: triage of H2 and g27; H2 test passes locally (L419-L420); declared unrelated; monitor armed.
- L614: user rejects the conclusion.
- L642-L701: local `build-release:js` fails with 82 errors because `build-release:cljs` was not run first; the agent treats it as the lead, then retracts.
- L657-L670: cross-PR table shows the five jobs passing elsewhere; conclusion reversed.
- L717-L722: the agent finds its control invalid: those PRs have no Run tests run at their head sha.
- L770-L797: base rates over 36 runs; two other runs had 4 of the same 5 jobs fail.
- L808-L849: rerun of failed jobs, CI green, PR approved.
- Cost: about 55 minutes and 45 tool calls for a 4-line dependency bump.

## Root cause
Flaky CI infrastructure clustered in time on 2026-09-10 (classpath resolution, backend start timeouts, test-order sensitive H2 export). Why the other PRs showed green for those jobs is not established: the agent's explanation (no run at their head sha) came from a single unpaginated `actions/runs?head_sha=` query, and timing alone could explain the difference.

## Why agents fall for it
A red required check on a small diff demands an explanation, and cross-PR comparisons look like a control even when the runs happened at different times.

## Current state
origin/master: no change to prepare-backend dependency resolution since 2026-09-01; ci-conductor quarantine only covers known test flakes.

## Suggested fix
- Classify infrastructure failures (classpath resolution, runner network) in the ci-conductor verdict so the summary says "infra, rerun".
- Publish per-job failure base rates for the last day, so agents do not have to sample runs by hand.
- Use a rerun of the identical sha as the flake control, not other PRs' checks.

## Detection signal
Many failing jobs on a PR whose diff touches none of their paths; `Unable to resolve org.clojure/clojure`; a user asking to rule out flakes.

## Raw excerpts
```
L343 [RESULT] driver-tests / H2 (OSS)	fail	11m41s	... | e2e-tests / e2e-group-27-ee / e2e-tests-e2e-group-27-ee	fail	2m19s	...
L663 [RESULT] PR       H2-OSS     g06      g18      g27      SDK-BC | 82266    fail       fail     fail     fail     fail | 82265    pass       pass     pass     pass     pass | ...
L697 [RESULT] exit=1 | ERROR in ./viz-core/lib/utils.ts 3:1-76 |   × Cannot find module 'cljs/metabase.util.markdown.image' for matched aliased key 'cljs' | ...
L797 [RESULT] run  #of-the-5-jobs-failed | 34492163968  4 | 34486516290  4 | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/cc241e7a-e140-4ab6-94cb-4cd826d04ab6.jsonl
  lines: 428-501
  date: 2026-09-10
  jev: {any_papercut: 0.72, env_toolchain: 0.87, stale_state: 0.28, verify_mismatch: 0.59, misleading_code: 0.18, hidden_coupling: 0.53, stale_docs: 0.28, tool_footgun: 0.68, flaky: 0.63, agent_bug: 0.49, wasted_effort: 0.41, user_correction: 0.10}

- L492: `Error building classpath. Unable to resolve org.clojure/clojure version: [1.2.1],[1.3.0]` then `##[error]Process completed with exit code 1.`

- L428-L448: two PRs have driver and e2e failures; step names show "Test SQL Server 2022" and "Prepare back-end environment".
- L461-L492: log retrieval (escape-sequence refusal first) and reading around the error.
- L501: reported as infrastructure, no rerun requested yet.
- Cost: about 10 calls of log triage.

```
L447 [CALL] Bash: gh api repos/metabase/metabase/actions/jobs/102907560335 -q '"\(.name) | \(.conclusion) | steps: ..."' ...
L448 [RESULT] driver-tests / SQL Server 2022 Transforms Python Tests | failure | steps: Test SQL Server 2022 | e2e-tests / e2e-group-31-ee / e2e-tests-e2e-group-31-ee | failure | steps: Prepare back-end environment, Publish Summary ...
L492 [RESULT] ... building classpath. Unable to resolve org.clojure/clojure version: [1.2.1],[1.3.0] | 2026-09-10T14:20:16.4066748Z ##[error]Process completed with exit code 1.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7e19d6c9-cfc3-46a6-b6db-e21f76a54bfd.jsonl
  lines: 474-753
  date: 2026-09-10
  jev: {any_papercut: 0.72, env_toolchain: 0.74, stale_state: 0.71, verify_mismatch: 0.42, misleading_code: 0.20, hidden_coupling: 0.24, stale_docs: 0.23, tool_footgun: 0.66, flaky: 0.93, agent_bug: 0.19, wasted_effort: 0.52, user_correction: 0.17}

- L745: `Error building classpath. Unable to resolve org.clojure/clojure version: [1.2.1],[1.3.0]` then `error: script "build-pure:cljs" exited with code 1`.

- L474-L482: Postgres transforms job dies on a uv fetch.
- L735-L736: fe-lint red on one PR; L740-L745: its log shows the classpath failure inside build-pure:cljs.
- L746: rerun requested.
- L753: summary lists runner network failures on four jobs where zero tests ran.
- Cost: several reruns and about an hour of monitor events.

```
L736 [RESULT] ### 82026 ### | Decide whether to backport or not	fail ... | ### 81872 ### | frontend-tests / fe-lint	fail	51s ... | frontend-tests / fe-tests-result	fail ...
L745 [RESULT] ... Error building classpath. Unable to resolve org.clojure/clojure version: [1.2.1],[1.3.0] | 2026-09-10T10:21:11.8174198Z error: script "build-pure:cljs" exited with code 1
L746 [CALL] Bash: gh run rerun 34465443230 --failed 2>&1 | head -3; echo "81872 rerun requested"
```
