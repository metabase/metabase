You are the orchestrator for the fixbot workmux workflow. This launches fixbot in a background workmux session with its own worktree, backend, and frontend. For running fixbot directly in the current repo, use `/fixbot` instead.

## Steps

### 1. Preflight checks

Run:
```
./bin/mage -fixbot-preflight
```

If it fails, show the error to the user and stop. Do not attempt to recover or work around failures.

### 2. Resolve the issue ID

The user provided: `$ARGUMENTS`

This can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID from the URL.
3. If no Linear link is found in the GitHub issue, search Linear directly: run `./bin/mage -fixbot-fetch-issue` with a search term derived from the GitHub issue title. If that doesn't find a match, tell the user you couldn't find a corresponding Linear issue and stop.
4. Tell the user which Linear issue you resolved to, so they can verify it's correct.

**Validation:** After resolving, confirm the issue ID looks like a Linear identifier (e.g., `MB-12345`). If not, tell the user the expected format and stop.

Run `./bin/mage -fixbot-list` and check if a session already exists for this issue (look for the issue ID in the branch name or session name). If one exists:
- Tell the user the session already exists
- Show them how to connect: `tmux attach -t <session-name>`
- Show them how to stop it: `/fixbot-quit <issue-id>`
- **STOP** — do not proceed with the remaining steps. Do not attempt to shut it down or clean it up.

### 3. Fetch the issue from Linear

Run:
```
./bin/mage -fixbot-fetch-issue <ISSUE_ID>
```

Read the output to extract:
- Branch name (the suggested branch name from Linear)

Also determine the app database from the issue description/comments:
- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → `mysql`
- If the issue mentions **MariaDB** specifically → `mariadb`
- Otherwise → `postgres` (the default)

If the issue is not found, tell the user and stop.

### 4. Generate the agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/fixbot/fixbot-agent.md \
  --output .fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md \
  --set ISSUE_ID=<ISSUE_ID> \
  --set "BRANCH_NAME=<branch>" \
  --set "APP_DB=<Postgres|Mysql|Mariadb>"
```

The worktree agent will fetch the issue details itself during Phase 1.

### 5. Launch the workmux session

Run:
```
./bin/mage fixbot-go <ISSUE_ID> --app-db <DB> --prompt-file .fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md --branch '<BRANCH_NAME>'
```

Using the values from step 3.

### 6. Report

Tell the user:
- Which issue you're fixing
- Which database was chosen and why
- That the workmux session has been launched
- That they can run `./bin/mage -fixbot-dashboard` in a separate terminal for a live TUI dashboard showing all active agents
