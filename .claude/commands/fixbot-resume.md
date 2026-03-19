Resume a paused fixbot session, or create a new session from an existing branch or PR.

The user provided: `$ARGUMENTS`

This can be an issue ID (e.g., `MB-12345`), a branch name, or a GitHub PR URL (e.g., `https://github.com/metabase/metabase/pull/12345`).

## Steps

### 1. Try resuming via mage task

Run:
```
./bin/mage -fixbot-resume $ARGUMENTS
```

If this succeeds, the session is resumed — report success and stop.

### 2. If no existing session found (mage task exits non-zero), create from branch/PR

1. **Parse the argument:**
   - If it looks like a GitHub PR URL → extract the PR number, then run:
     ```
     gh pr view <NUM> --json headRefName --jq .headRefName
     ```
     to get the branch name. Save the PR number for later.
   - If it looks like an issue ID (e.g., `MB-12345`) → use as-is for matching
   - Otherwise → treat as a branch name

2. **Determine the issue ID** from the branch name by extracting the `MB-XXXXX` pattern (case-insensitive). If no issue ID can be found, ask the user for it.

3. **Fetch the issue from Linear:**
   ```
   ./bin/mage -fixbot-fetch-issue <ISSUE_ID>
   ```

4. **Determine the app database** — analyze the issue description and comments:
   - If it mentions MySQL problems or MySQL-specific syntax → use `mysql`
   - If it mentions MariaDB specifically → use `mariadb`
   - Otherwise → use `postgres` (default)

5. **If a PR URL was given**, also fetch the PR title and body for additional context:
   ```
   gh pr view <NUM> --json title,body
   ```

6. **Write the agent prompt** — read the reference template at `.claude/fixbot/fixbot-agent.md`, then write a completed prompt to `.fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md`. Include all the same content as `/fixbot` step 5 (issue details, comments, database info, credentials, workflow instructions, TDD requirements, etc.).

7. **Launch the session:**
   ```
   ./bin/mage -fixbot-auto-fix <ISSUE_ID> --app-db <DB> --prompt-file .fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md --branch '<BRANCH>'
   ```

8. Tell the user the session was created from the existing branch.
