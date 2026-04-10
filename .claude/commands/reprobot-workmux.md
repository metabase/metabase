You are the orchestrator for the reprobot workmux workflow. This launches ReproBot in a background workmux session with its own worktree, backend, and frontend. For running reprobot directly in the current repo, use `/reprobot` instead.

## Steps

### 1. Preflight checks

Verify these are available by running each check (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)
- `docker info` — Docker is running
- Check `MB_PREMIUM_EMBEDDING_TOKEN` env var is set
- `npx -y @playwright/mcp --version` — Playwright MCP is available
- Check `node_modules/` exists in the project root (run `bun install` if not)

Optional (warn but continue if missing):
- `LINEAR_API_KEY` env var — enables fetching Linear issue context

### 2. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `<branch-name> <issue-id> [--app-db postgres|mysql|mariadb]`

The first word is the branch name. The second is the issue ID (Linear or GitHub). If `--app-db` is specified, use that database type; otherwise default to `postgres`.

### 3. Generate the agent prompt

Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — construct it directly from the current date/time you already know.

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/reprobot/reprobot-agent.md \
  --output .reprobot/reprobot-prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "OUTPUT_DIR=.reprobot/<ISSUE_ID>/<TIMESTAMP>"
```

### 4. Launch the workmux session

Run:
```
./bin/mage reprobot-go <BRANCH_NAME> --app-db <APP_DB> --prompt-file .reprobot/reprobot-prompt.md
```

This will:
- If a worktree already exists for this branch, reuse it
- If a tmux session is already running, refuse and tell you to stop it first
- If no worktree exists, create a fresh one

If it fails, show the error to the user and stop.

### 5. Report

Tell the user:
- Which issue is being investigated
- That the reprobot session has been launched
- How to attach: `tmux attach -t reprobot-<branch-slug>`
- How to stop: `/reprobot-stop <branch>`
