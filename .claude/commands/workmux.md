Launch a bot command in an isolated workmux session with its own worktree, backend, and frontend.

The user provided: `$ARGUMENTS`

## Steps

### 1. Parse arguments

Parse as: `<branch-name> <inner-command> [inner-args...] [--app-db postgres|mysql|mariadb]`

- First word: branch name (e.g., `master`, `my-feature-branch`)
- Second word: inner command with leading `/` (e.g., `/qabot`, `/fixbot`)
- Remaining words: arguments to pass to the inner command
- `--app-db`: optional database type (default: `postgres`)

Examples:
- `/workmux master /qabot` → branch=master, command="/qabot", app-db=postgres
- `/workmux my-branch /fixbot MB-12345` → branch=my-branch, command="/fixbot MB-12345"
- `/workmux master /uxbot test the dashboard` → branch=master, command="/uxbot test the dashboard"
- `/workmux master /reprobot MB-12345 --app-db mysql` → branch=master, command="/reprobot MB-12345", app-db=mysql

Extract the bot name from the inner command by stripping the leading `/` (e.g., `/qabot` → `qabot`).

### 2. Preflight checks

Verify these are available (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)
- `docker info` — Docker is running
- Check `MB_PREMIUM_EMBEDDING_TOKEN` env var is set
- Check `node_modules/` exists in the project root (run `bun install` if not)

### 3. Launch the workmux session

Run:
```
./bin/mage workmux-go <BRANCH_NAME> --bot <BOT_NAME> --app-db <APP_DB> --command "<INNER_COMMAND> <INNER_ARGS>"
```

This will:
- Create a worktree based on the branch (or reuse an existing one)
- Set up the bot environment (Docker DB, settings, Playwright, etc.)
- Start backend + frontend dev servers in tmux panes
- Launch Claude with the inner command as its prompt

If a session already exists for this bot+branch, it will tell you to stop it first.

### 4. Report

Tell the user:
- The session has been launched
- How to attach: `tmux attach -t <bot-name>-<branch-slug>`
- How to stop: `/workmux-stop <session-name>` (or `/workmux-stop` from inside the session)
- How to list all sessions: `/workmux-list`
- How to remove: `/workmux-quit <session-name>`
