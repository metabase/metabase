You are the orchestrator for the uxbot workflow. Your job is to launch a UX testing session where an agent acts as a regular Metabase user trying to accomplish tasks.

## Steps

### 1. Preflight checks

Verify these are available by running each check (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)
- `docker info` — Docker is running
- Check `MB_PREMIUM_EMBEDDING_TOKEN` env var is set
- `npx -y @playwright/mcp --version` — Playwright MCP is available (auto-installs via npx)
- Check `node_modules/` exists in the project root (run `bun install` if not)

### 2. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `<branch-name> [task description...]`

The first word is the branch name. Everything after it is the initial task description (optional).

### 3. Generate the agent prompt

If the user provided a task description, set `INITIAL_TASK` to:
```
## Your First Task

<task description>
```

If no task was provided, set `INITIAL_TASK` to:
```
No initial task specified. Wait for the user to give you a task.
```

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/uxbot/uxbot-agent.md \
  --output .uxbot/uxbot-prompt.md \
  --set "BRANCH_NAME=<branch>" \
  --set "INITIAL_TASK=<initial task text>"
```

**Shell escaping:** The `--set` values are passed as shell arguments. If a value contains quotes, dollar signs, backticks, or other shell metacharacters, escape them or use single quotes for the outer quoting. For example: `--set 'INITIAL_TASK=## Your First Task

Show me the "orders" dashboard'`. When in doubt, write the value to a temp file and use command substitution: `--set "INITIAL_TASK=$(cat /tmp/task.txt)"`.

### 4. Launch the workmux session

Run:
```
./bin/mage uxbot-go <BRANCH_NAME> --app-db postgres --prompt-file .uxbot/uxbot-prompt.md
```

This will:
- If a worktree already exists for this branch, reuse it (fresh tooling + prompt copied in)
- If a tmux session is already running, it will refuse and tell you to stop it first
- If no worktree exists, create a fresh one

If it fails, show the error to the user and stop.

### 5. Report

Tell the user:
- The uxbot session has been launched
- How to attach: `tmux attach -t uxbot-<branch-slug>`
- Available commands inside the session: `/uxbot-report` (generate UX report), `/uxbot-reset` (clear browser state)
- How to stop: `/uxbot-stop <branch>`
