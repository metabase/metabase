Discover context for qabot. This is called by `/autobot` before launching the session to determine the app database and gather issue context.

The user provided: `$ARGUMENTS`

## Steps

### 1. Detect Linear issue

Parse as: `[linear-issue-id]`

- If a Linear issue ID is provided (e.g., `MB-12345`), validate it looks like `[A-Z]+-[0-9]+`.
- If not provided, try to detect from the current branch name:
  - Pattern: `*/mb-NNNNN-*` or `*/MB-NNNNN-*` → extract `MB-NNNNN`
  - Also try the GitHub PR for this branch: `./bin/mage -bot-git-readonly gh pr view --json title,url,body` and look for Linear links in the body
- If still not found, set LINEAR_ISSUE_ID to empty. Do NOT ask the user — this is a non-interactive discovery step.

### 2. Fetch context (if issue found)

If a Linear issue ID was resolved, fetch the issue details:
```
./bin/mage -bot-fetch-issue <ISSUE_ID>
```
Save the output to `.bot/qabot/discover/linear-context.txt` using the `Write` tool.

### 3. Fetch PR description

Try to fetch the PR description for the current branch:
```
./bin/mage -bot-git-readonly gh pr view --json title,body
```
If a PR exists, save the output to `.bot/qabot/discover/pr-context.txt` using the `Write` tool.

### 3b. Verify branch divergence

Check if the branch has commits beyond master:
```
./bin/mage -bot-git-readonly git log --oneline origin/master..HEAD
```
If the log is empty (no commits beyond master), add `BRANCH_WARNING=no-local-commits` to result.env in step 5.

### 4. Generate timestamp

Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — use the current date/time you already know to construct it directly.

### 5. Write result

QABot always uses postgres — it tests the branch's changes, not database-specific bugs.

Write the structured result to `.bot/qabot/discover/result.env` using the `Write` tool:

```
APP_DB=postgres
LINEAR_ISSUE_ID=<resolved-id-or-empty>
TIMESTAMP=<YYYYMMDD-HHMMSS>
```
