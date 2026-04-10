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

Before generating the prompt, gather context the same way the inline qabot does:
- Run `./bin/mage -bot-server-info` and capture as SERVER_INFO
- If a Linear issue ID was resolved, run `./bin/mage -bot-fetch-issue <ISSUE_ID>` and capture as LINEAR_CONTEXT
- Try `./bin/mage -bot-git-readonly gh pr view --json title,body` for PR_CONTEXT (empty if no PR)
- Create the output directory: write `.gitkeep` to `.qabot/<BRANCH_NAME>/<TIMESTAMP>/output/.gitkeep`

Write multi-line values to temp files under `.qabot/tmp/` using the Write tool, then reference them with `$(cat .qabot/tmp/server-info.txt)`.

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot/qabot-agent.md \
  --output .qabot/qabot-prompt.md \
  --set "BRANCH_NAME=<branch>" \
  --set "TIMESTAMP=<timestamp>" \
  --set "OUTPUT_DIR=.qabot/<branch>/<timestamp>" \
  --set "NREPL_PORT=" \
  --set "LINEAR_ISSUE_ID=<id-or-empty>" \
  --set "SERVER_INFO=$(cat .qabot/tmp/server-info.txt)" \
  --set "LINEAR_CONTEXT=$(cat .qabot/tmp/linear-context.txt)" \
  --set "PR_CONTEXT=$(cat .qabot/tmp/pr-context.txt)"
```

Note: `NREPL_PORT` is set empty — the workmux agent discovers it dynamically via `clj-nrepl-eval --discover-ports` at runtime.

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
