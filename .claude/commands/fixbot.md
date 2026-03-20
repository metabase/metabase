You are the orchestrator for the fixbot workflow. Your job is to fetch a Linear issue, analyze it, determine the right database, write an agent prompt, and launch the workmux session.

## Steps

### 1. Preflight checks

Run:
```
./bin/mage -fixbot-preflight
```

If it fails, show the error to the user and stop. Do not attempt to recover or work around failures.

### 2. Validate the issue ID

The user provided: `$ARGUMENTS`

Validate that this looks like a Linear issue ID (e.g., MB-12345). If not, tell the user the expected format and stop.

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

Read the output carefully. Extract:
- Issue title
- Issue description
- All comments (author, timestamp, body)
- Issue URL
- Branch name (the suggested branch name from Linear)

If the issue is not found, tell the user and stop.

### 4. Determine the app database

Analyze the issue description and comments to determine which database is needed:

- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → use `mysql`
- If the issue mentions **MariaDB** specifically → use `mariadb`
- If the issue mentions **Postgres/PostgreSQL** specifically, or doesn't mention any database → use `postgres` (the default)
- If unclear, default to `postgres`

### 5. Write the agent prompt

Read the reference template at `.claude/fixbot/fixbot-agent.md` to understand the required structure.

Then write a completed agent prompt to `.fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md` using the `Read` tool (to satisfy the read-before-write requirement — the file won't exist yet, and that's fine) followed by the `Write` tool. Do NOT use Bash `cat`/`echo` to create this file.

The prompt should include:

- The issue ID, title, and Linear URL
- The branch name from Linear
- The full issue description
- All comments formatted with author and timestamp
- The correct database type and appropriate port information
- Pre-configured instance: users and API keys are auto-created via config file (admin: `admin@example.com` / `S0v^S$BIteM9NL`, regular: `regular@example.com` / `q5bdJ5A3%Dh@&u75`, API keys: `mb_admin_apikey` and `mb_regular_apikey`)
- User context: the user is NOT a developer — the agent must work autonomously on all code/technical decisions, but should consult the user on product behavior questions and acceptance testing (they are an expert Metabase user)
- All the workflow instructions from the reference template (Phase 1-4, important rules)
- Red/green TDD requirement for both backend (Clojure with `./bin/test-agent`) and frontend (Jest/Cypress) changes
- Playwright instructions: the agent has Playwright with Chromium available and should use it to verify UI changes (screenshots, interaction scripts) before asking the user to test
- Tell the agent that when the user is ready to ship, they should run `/fixbot-pr` which handles code review, PR creation, and CI monitoring
- Enterprise Edition: the dev environment always runs EE. If the fix requires OSS-only behavior, the agent should stop and tell the user.

Use the port computation: ports are based on a deterministic slot derived from the worktree name. Since you don't know the exact worktree name yet, use placeholder descriptions like "the port shown in your environment" and note that the dev environment will be configured automatically.

### 6. Launch the workmux session

Run:
```
./bin/mage fixbot-go <ISSUE_ID> --app-db <DB> --prompt-file .fixbot/metabase-fixbot-<ISSUE_ID>-prompt.md --branch '<BRANCH_NAME>'
```

Where:
- `<DB>` is the database you determined in step 3 (postgres, mysql, or mariadb)
- `<BRANCH_NAME>` is the branch name from Linear (from step 2)

### 7. Report

Tell the user:
- Which issue you're fixing
- Which database you chose and why
- That the workmux session has been launched
- That they can run `./bin/mage -fixbot-dashboard` in a separate terminal for a live TUI dashboard showing all active agents
