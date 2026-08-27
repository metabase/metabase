Discover context for qabot. This is called by `/qabot` (or `/autobot` before launching the session) to determine the app database and gather issue context.

The user provided: `$ARGUMENTS`

`$ARGUMENTS` must include a `--output-dir <PATH>` flag — the caller (`/qabot` or `/autobot`) generates the per-run path. Discover never picks a directory itself, so nothing is ever written to a shared `.bot/qabot/...` location.

## Steps

### 1. Determine run directory

Parse `$ARGUMENTS` for `--output-dir <PATH>`. If absent, stop and tell the caller to pass `--output-dir`. Set `OUTPUT_DIR=<PATH>` and `TIMESTAMP=` the trailing timestamp portion of the path. All artifacts in subsequent steps go directly under `<OUTPUT_DIR>/`.

### 2. Detect Linear issue

Parse the remaining arguments as: `[linear-issue-id]`

- If a Linear issue ID is provided (e.g., `MB-12345`), validate it looks like `[A-Z]+-[0-9]+`.
- If not provided, try to detect from the current branch name:
  - Pattern: `*/<prefix>-NNNNN-*` (case-insensitive) where `<prefix>` is any 2-4 letter team prefix such as `MB`, `BOT`, `UXW`, `EMB`, `QB`, `DEV`, `GHY`, `GDGT` — Metabase uses multiple Linear projects, not just `MB`. Extract `<PREFIX>-NNNNN` in uppercase.
  - Also try the GitHub PR for this branch: `gh pr view --json title,url,body` and look for Linear links in the body
- If still not found, set LINEAR_ISSUE_ID to empty. Do NOT ask the user — this is a non-interactive discovery step.

### 3. Fetch context (if issue found)

If a Linear issue ID was resolved, fetch the issue details:
```
./bin/mage -bot-fetch-issue <ISSUE_ID>
```
Save the output to `<OUTPUT_DIR>/linear-context.txt` using the `Write` tool.

### 4. Fetch PR description

Try to fetch the PR description for the current branch:
```
gh pr view --json title,body
```
If a PR exists, save the output to `<OUTPUT_DIR>/pr-context.txt` using the `Write` tool.

### 5. Verify branch divergence

Check if the branch has commits beyond master:
```
git log --oneline origin/master..HEAD
```
If the log is empty (no commits beyond master), add `BRANCH_WARNING=no-local-commits` to config.env in step 6.

### 6. Write result

QABot always uses postgres — it tests the branch's changes, not database-specific bugs.

Write the structured result to `<OUTPUT_DIR>/config.env` using the `Write` tool:

```
APP_DB=postgres
LINEAR_ISSUE_ID=<resolved-id-or-empty>
TIMESTAMP=<TIMESTAMP>
OUTPUT_DIR=<OUTPUT_DIR>
```
