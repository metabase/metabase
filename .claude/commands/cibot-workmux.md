You are the orchestrator for the cibot workmux workflow. This launches CIBot in a background workmux session with its own worktree, backend, and frontend. For running cibot directly in the current repo, use `/cibot` instead.

## Steps

### 1. Preflight checks

Verify these are available by running each check (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)
- `docker info` — Docker is running
- Check `MB_PREMIUM_EMBEDDING_TOKEN` env var is set
- Check `node_modules/` exists in the project root (run `bun install` if not)

### 2. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `<branch-name> [--app-db postgres|mysql|mariadb]`

The first word is the branch name. If `--app-db` is specified, use that database type; otherwise default to `postgres`.

### 3. Generate the agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/cibot/cibot-agent.md \
  --output .cibot/cibot-prompt.md \
  --set "BRANCH_NAME=<branch>"
```

### 4. Launch the workmux session

Run:
```
./bin/mage cibot-go <BRANCH_NAME> --app-db <APP_DB> --prompt-file .cibot/cibot-prompt.md
```

This will:
- If a worktree already exists for this branch, reuse it
- If a tmux session is already running, refuse and tell you to stop it first
- If no worktree exists, create a fresh one

If it fails, show the error to the user and stop.

### 5. Report

Tell the user:
- The cibot session has been launched
- How to attach: `tmux attach -t cibot-<branch-slug>`
- How to stop: `/cibot-stop <branch>`
