You are the orchestrator for the qabot workmux workflow. This launches QABot in a background workmux session with its own worktree, backend, and frontend.

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

Parse as: `<branch-name> [linear-issue-id] [--app-db postgres|mysql|mariadb]`

The first word is the branch name. The second (optional) is a Linear issue ID. If `--app-db` is specified, use that database type; otherwise default to `postgres`.

If no Linear issue ID is provided, try to detect from the branch name (pattern: `*/mb-NNNNN-*`).

### 3. Generate the agent prompt

Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — construct it directly from the current date/time you already know.

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot/qabot-agent.md \
  --output .qabot/qabot-prompt.md \
  --set "BRANCH_NAME=<branch>" \
  --set "LINEAR_ISSUE_ID=<id-or-empty>"
```

### 4. Launch the workmux session

Run:
```
./bin/mage qabot-go <BRANCH_NAME> --app-db <APP_DB> --prompt-file .qabot/qabot-prompt.md
```

This will:
- If a worktree already exists for this branch, reuse it (fresh tooling + prompt copied in)
- If a tmux session is already running, it will refuse and tell you to stop it first
- If no worktree exists, create a fresh one

If it fails, show the error to the user and stop.

### 5. Report

Tell the user:
- The qabot session has been launched
- How to attach: `tmux attach -t qabot-<branch-slug>`
- The report will be generated automatically to `.qabot/<branch>/<timestamp>/report.pdf`
- How to stop: `/qabot-stop <branch>`
