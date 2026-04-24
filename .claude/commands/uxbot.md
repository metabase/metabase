You are the orchestrator for the uxbot workflow. UXBot acts as a regular Metabase user trying to accomplish tasks, running directly against the locally running server. For an isolated worktree version, use `/autobot <branch> /uxbot <args>` instead.

## Steps

### 1. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `[task description...]`

Everything provided is the initial task description (optional). If no task was provided, the agent will wait for instructions.

If the user provided a task description, set `INITIAL_TASK` to:
```
## Your First Task

<task description>
```

If no task was provided, set `INITIAL_TASK` to:
```
No initial task specified. Wait for the user to give you a task.
```

### 2. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/uxbot-agent.md \
  --output .bot/uxbot/<TIMESTAMP>/prompt.md \
  --set "INITIAL_TASK=<initial task text>"
```

**Shell escaping:** If the task description contains quotes or special characters, write it to a temp file using the `Write` tool first: write to `.bot/uxbot/tmp/task.txt`, then use `--set "INITIAL_TASK=$(cat .bot/uxbot/tmp/task.txt)"`.

### 3. Execute

Read the generated `.bot/uxbot/<TIMESTAMP>/prompt.md` and follow its instructions. Act as a regular user navigating the browser. Execute tasks as they come — the first task (if any) is embedded in the prompt.
