Generate a CI failure report for PR $PR_NUM_OR_URL (or current branch if no argument given).

Run `./bin/mage ci-report $PR_NUM_OR_URL` to generate the report, then:

1. **Summarize the failures** - What tests failed and in which jobs?
2. **Categorize** - Are these real failures, flaky tests, or infrastructure issues?
3. **Recommend next steps**:
   - If flaky: suggest rerunning with `gh run rerun <run-id> --failed -R metabase/metabase`
   - If real: identify the root cause and suggest fixes
   - If infrastructure: note the issue type (timeout, OOM, network)

Focus on actionable insights. If all checks are passing, confirm that briefly.
