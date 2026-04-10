You are the orchestrator for the uxbot workflow. UXBot acts as a regular Metabase user trying to accomplish tasks, running directly against the locally running server. For an isolated worktree version, use `/autobot <branch> /uxbot <args>` instead.

## Steps

### 1. Preflight checks (inline mode — no autobot/Docker needed)

#### Ensure Playwright MCP is configured

Check if `.mcp.json` exists in the project root. If it does NOT exist, STOP and suggest the user run `./bin/mage -bot-setup --bot uxbot` to generate it, then restart.

#### Verify tools are available (stop if any fail)
- Playwright MCP: `npx -y @playwright/mcp --version` — available via npx
- Backend health: `./bin/mage -bot-api-call /api/health` — must succeed and return `{"status":"ok"}`

If any required check fails, show the error and stop. Do not attempt to recover.

### 2. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `[task description...]`

Everything provided is the initial task description (optional). If no task was provided, the agent will wait for instructions.

### 3. Gather context

#### Server info
Read `mise.local.toml` to discover `MB_JETTY_PORT` for the backend URL.

#### Branch name
Get current branch: `git branch --show-current`

### 4. Generate agent prompt

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

**Shell escaping:** If the task description contains quotes or special characters, write it to a temp file using the `Write` tool first: write to `.uxbot/tmp/task.txt`, then use `--set "INITIAL_TASK=$(cat .uxbot/tmp/task.txt)"`.

### 5. Execute

Read the generated `.uxbot/uxbot-prompt.md` and follow its instructions. Act as a regular user navigating the browser. Execute tasks as they come — the first task (if any) is embedded in the prompt.
