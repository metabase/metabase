---
title: gh CI inspection traps - `gh run list --commit <short sha>` returns nothing silently; `gh run view --log`/`--log-failed` refuses (or, with `2>/dev/null`, prints nothing) while any job in the run is still going, and ci-failures then says "No test failure details found"
slug: gh-ci-inspection-silent-empty-and-in-progress-logs
kind: tool-quirk
impact: wasted-time
severity: low
status: open
merged_from: [gh-run-view-log-empty-while-run-in-progress]
area: gh CLI (run list / run view --log), ~/bin/ci-failures (dotfiles ci_common.clj), metabase CI job logs
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 899-900, 1020-1037
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.75, user_correction: 0.70, codebase_trap: 0.71, flailing: 0.34, env_friction: 0.79}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/40cd8c33-43d3-4e2e-8088-d99acee7a38f.jsonl
    lines: 684-695, 929-953, 1075-1081
    date: 2026-09-08
    jev: {self_inflicted_bug: 0.61, tool_misuse: 0.60, misleading_signal: 0.81, user_correction: 0.89, codebase_trap: 0.52, flailing: 0.45, env_friction: 0.92}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a2d41fab-dd88-43ad-bebe-2e6c63b8a7d4.jsonl
    lines: 1229-1256
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.80, misleading_signal: 0.82, user_correction: 0.91, codebase_trap: 0.83, flailing: 0.20, env_friction: 0.65}
---
## Summary
Two gh behaviours make "is CI done / why did this job fail" slow to answer:
1. `gh run list --commit <sha>` matches only a full 40-char SHA. An abbreviated SHA returns an empty list with exit 0, indistinguishable from "no runs".
2. `gh run view --job <id> --log-failed` (and `--log`) refuses with "run <id> is still in progress; logs will be available when it is complete" whenever any other job in the same workflow run is still going, even though the failed job finished long ago. Metabase's run-tests workflow has 100+ jobs, so a failed early job's log is unreadable for tens of minutes. With the habitual `2>/dev/null`, the refusal disappears and the command just prints nothing. Also seen: `failed to get run log: stream error: stream ID 1; CANCEL` on a large log.

On top of that, `~/bin/ci-failures` printed "No test failure details found in job logs" for a job that had clearly failed, and step display names ("Run backend checks") do not appear in the raw log, so a `sed` range keyed on them matches nothing. Only `gh api repos/metabase/metabase/actions/jobs/<id>/logs` reliably returns a finished job's log inside a running run.

## Symptom
- a0ba828b L1023-1024: user asked "is ci still running on any?"; `gh run list --commit 26aac55d7ff ...` for four short SHAs printed four blank lines. The agent re-ran with `git rev-parse` full SHAs (L1027) -> `completed=20` etc. L1037: "`gh run list --commit` needs the full SHA and silently matches nothing on an abbreviated one. Empty output there means 'bad filter', not 'no runs'".
- a0ba828b L899-900: diagnosing a new fe-type-check failure it had caused: `--log-failed` -> "run 33371204233 is still in progress". The agent had to reproduce locally with tsc instead.
- 40cd8c33 L942-943: Snowflake driver test failure on #79464: same refusal; the agent reasoned about the failure without its log, and the run was superseded by a push before the log was ever read (L1077-1081).
- 40cd8c33 L684-692: `--log-failed` -> `stream error: stream ID 1; CANCEL; received from peer`; fell back to the jobs API steps (`Quarantine gate`).
- a2d41fab L1229-1256: a job in a still-running run failed (`Project tests: Backend checks` on #81319, with 84 other checks still running). Four attempts to read its log came back empty or unhelpful:
  1. `~/bin/ci-failures 81319` -> "No test failure details found in job logs."
  2. `gh run view --job 99308796312 --log 2>/dev/null | grep -v ... | tail -40` -> no output.
  3. `gh run view --job 99308796312 --log 2>&1 | sed -n '/Run backend checks/,$p' | tail -45` -> no output.
  4. `gh api repos/metabase/metabase/actions/jobs/99308796312/logs > /tmp/job.log` -> 511 lines, with the failure in it.
  A later `sed` range (L1252) also found nothing, because the step name appears in the log as `##[group]Run ./bin/mage project-tests …`, not as the display name "Run backend checks". Only after dumping raw line ranges (L1255) did the agent find `:fail 1`.

## Timeline
a0ba828b (2026-08-31) and 40cd8c33 (2026-09-08): see Symptom.

a2d41fab (2026-08-30):
- L1230: `~/bin/ci-failures 81319` -> `⚠ 84 check(s) still running ... ✗ backend-tests / Project tests: Backend checks ... ⚠ No test failure details found in job logs.`
- L1233-1234: `gh run view --job 99308796312 --log 2>/dev/null | ...` -> "(Bash completed with no output)"
- L1236-1237: `gh api .../jobs/99308796312 -q '.steps[]...'` -> `failure  Run backend checks`
- L1239-1240: `gh run view --job ... --log 2>&1 | sed -n '/Run backend checks/,$p' | tail -45` -> no output
- L1242-1243: `gh api repos/metabase/metabase/actions/jobs/99308796312/logs > /tmp/job.log` -> 511 lines
- L1252-1256: grepping by step display name finds nothing; a raw `sed -n '380,470p'` shows `{:test 69, :pass 4494, :fail 1 ...} Tests failed.`

## Root cause
- gh CLI design: `--commit` does exact matching on `head_sha`.
- `run view --log` / `--log-failed` downloads the run-level log archive, which GitHub only produces once the whole run completes; `--job` does not change that. The per-job endpoint (`gh api repos/{owner}/{repo}/actions/jobs/{job_id}/logs`) works for a finished job inside an in-progress run.
- In a2d41fab the first attempt threw the refusal away with `2>/dev/null`. The second probably failed the same way, but its output went into a `sed` range filter that matched nothing, so it printed nothing too. (Inferred: that transcript never shows the stderr text; a0ba828b L900 shows the message itself.)
- ci-failures' `parse-failure-messages` expects `FAIL in (test) (loc)` blocks and trunk report sections. Why it found nothing in a2d41fab is unclear. Possibly the project-tests output was truncated by `tail-lines logs 2000`, or its `FAIL in` lines sit above that window. Not verified.
- Step display names (`name:` in the workflow) don't appear in the raw log. The log shows `##[group]Run <command>`.

## Why agents fall for it
- Short SHAs work almost everywhere else in git/gh.
- `gh run view --job X --log` looks like it is scoped to a job. The in-progress message reads as "the thing I'm asking about isn't finished".
- Habitual `2>/dev/null` hides the one line that explains the empty output.
- ci-failures prints "No test failure details found in job logs" in the same situation (40cd8c33 L681, a2d41fab L1230), which looks like a flake verdict. Memory `feedback_no_deep_ci_log_digging.md` pushes toward the wrapper, and here the wrapper came back empty.

## Current state
- gh behaviour unchanged (not re-verified; needs an in-progress run). No memory note documents the run-level restriction; `reference_gh_pr_checks_parsing.md` exists but covers `gh pr checks`.
- `~/dotfiles/bin/bin/ci_common.clj:71-79` `job-logs-raw` already uses `gh api repos/%s/actions/jobs/%s/logs` (checked 2026-09-23), so ci-failures fetches the right thing and the gap is in parsing (the duplicate write-up cited `parse-failure-messages` :142 and `render-failure-details` :225-233; those definitions were not found by name in ci_common.clj on 2026-09-23, so the parser may have moved).

## Suggested fix
- Memory/CLAUDE.md note: "Use full SHAs with `gh run list --commit`. For a failed job in a still-running run, fetch `gh api repos/metabase/metabase/actions/jobs/<job_id>/logs`, not `gh run view --log`."
- ci-failures: say "run still in progress" instead of "No test failure details found"; when parsing finds nothing, print the last ~30 lines before `##[error]Process completed with exit code`. Also recognise the hawk summary map `{:test N, :pass N, :fail N ...}`.

## Detection signal
- `gh run list --commit [0-9a-f]{7,39}\b` (not 40 chars) in a command.
- Result text "is still in progress; logs will be available when it is complete".
- `gh run view ... --log` with `2>/dev/null` whose result is empty.
- ci-failures printing "No test failure details found" next to a failing check whose name contains "tests".

## Raw excerpts
```
a0ba828b L1023 for sha in 26aac55d7ff a1ca613afcc 500e92444a5 904a52793ff; do printf '%s ' "$sha"; gh run list --repo metabase/metabase --commit "$sha" --limit 100 --json status ...
L1024 [RESULT] 26aac55d7ff \n a1ca613afcc \n 500e92444a5 \n 904a52793ff
L1035 [RESULT] kondo-ratchets-master-only completed=20 ...
a0ba828b L900 run 33371204233 is still in progress; logs will be available when it is complete
40cd8c33 L692 failed to get run log: stream error: stream ID 1; CANCEL; received from peer
```
```
a2d41fab L1231 [RESULT] → Fetching CI status for PR #81319...
⚠ 84 check(s) still running
→ 102 passed, 2 failed
✗ 2 check(s) failing:
✗   backend-tests / Project tests → https://github.com/metabase/metabase/actions/runs/33330654857/job/99308979517
✗   backend-tests / Project tests: Backend checks → https://github.com/metabase/metabase/actions/runs/33330654857/job/99308796312
→ Fetching failure details from job logs...
⚠ No test failure details found in job logs.
L1233 [TOOL Bash] gh run view --job 99308796312 --log 2>/dev/null | grep -viE "^\S+\s+\S+\s+(##\[group|##\[endgroup)" | tail -40
L1234 [RESULT] (Bash completed with no output)
L1242 [TOOL Bash] cd /private/tmp && gh api repos/metabase/metabase/actions/jobs/99308796312/logs > /tmp/job.log 2>/dev/null; wc -l /tmp/job.log; echo "=== tail ==="; tail -40 /tmp/job.log
L1243 [RESULT]      511 /tmp/job.log
```
