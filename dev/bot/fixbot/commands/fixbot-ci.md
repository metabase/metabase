Monitor CI for this branch's PR, fix failures you caused, and re-run flaky tests.

## Step 1: Find the PR

Run `gh pr view --json number,url,headRefName` to get the PR for the current branch. If no PR exists, tell the user and stop.

## Step 2: Monitor CI

Check CI status every 10 minutes until all checks pass or you've exhausted retries:

1. Run `gh pr checks` to see the current status of all checks
2. If all checks pass, tell the user "CI is green" and stop
3. If checks are still running, wait 10 minutes and check again
4. If checks have failed, proceed to Step 3
5. **Ignore** the "Decide whether to backport or not" check — that's a label added by the user/reviewer

## Step 3: Analyze failures

For each failed check:

1. Run `./bin/mage ci-report` to get a detailed failure report
2. Categorize each failure:
   - **Caused by your changes**: The test failure is in code you modified, or the error clearly relates to your changes
   - **Flaky test / pre-existing**: The failure is in unrelated code, is a known flaky test, or is an infrastructure issue (timeout, OOM, network)

**Flaky tests are common in this repo.** If a test failure looks unrelated to your changes, it's likely a flake.

## Step 4: Handle failures

**For failures caused by your changes:**
1. Fix the issue in your code
2. Run the failing test locally with `./bin/test-agent` to confirm the fix
3. Commit and push the fix — **you don't need to wait for the current CI run to finish.** Pushing new changes automatically cancels the old run and starts a new one.
4. Go back to Step 2 to monitor the new CI run

**For flaky / pre-existing failures:**
1. Re-run all failed jobs: `gh run rerun --failed`
2. Go back to Step 2 to monitor the re-run
3. **If the same test fails again on the 3rd run**, investigate more closely:
   - Read the test and the failure output carefully
   - Determine whether your changes could have caused it
   - If it's genuinely unrelated, re-run one more time
   - If your changes may be the cause, treat it as "caused by your changes" and fix it

**Hard limits:**
- **Never re-run more than 5 times without making code changes.** If tests keep failing after 5 re-runs, something is wrong — investigate or stop.
- **If you are not making progress** on getting CI to pass (e.g., stuck in a loop of re-runs, or fixes aren't helping), **STOP and tell the user.** They can work with the Metabase developers from there.

## Step 5: Report

After CI passes (or after exhausting retries), tell the user:
- CI status (green / still failing)
- What failures you fixed
- What failures you re-ran as flakes
- If anything still needs attention
