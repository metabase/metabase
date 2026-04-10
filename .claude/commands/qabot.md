You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server. For an isolated worktree version, use `/workmux <branch> /qabot` instead.

## Steps

### 1. Preflight checks (inline mode — no workmux/Docker needed)

#### Ensure Playwright MCP is configured

Check if `.mcp.json` exists in the project root. If it does NOT exist, STOP and suggest the user run `./bin/mage -bot-setup --bot qabot` to generate it, then restart.

#### Verify tools are available (stop if any fail)
- Playwright MCP: `npx -y @playwright/mcp --version` — available via npx
- Backend health: `./bin/mage -bot-api-call /api/health` — must succeed and return `{"status":"ok"}`
- REPL: Run `clj-nrepl-eval --discover-ports` to find nREPL servers. Pick the port that belongs to the server running in the current project directory (the output indicates which directory each server is in). Store it as NREPL_PORT. Do NOT rely on the `NREPL_PORT` env var — always discover dynamically. **If no matching port is found, STOP** — REPL testing is required for qabot.

If any required check fails, show the error and stop. Do not attempt to recover.

### 2. Gather context

#### Server info
Run `./bin/mage -bot-server-info` and capture the full output. This will be passed to the agent.

#### Branch and timestamp
- Get current branch: `./bin/mage -bot-git-readonly git branch --show-current`
- Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — instead, use the current date/time you already know to construct it directly (e.g., `20260409-143022`).

#### Create output directory
Once you have the branch name and timestamp, create the output directory by writing a placeholder file using the `Write` tool:
- Write an empty `.gitkeep` file to `.qabot/<BRANCH_NAME>/<TIMESTAMP>/output/.gitkeep`
- This creates the full directory tree without needing `mkdir -p` in bash.

#### Linear issue
The user provided: `$ARGUMENTS`

Parse as: `[linear-issue-id]`

- If a Linear issue ID is provided (e.g., `MB-12345`), validate it looks like `[A-Z]+-[0-9]+`.
- If not provided, try to detect from the current branch name:
  - Pattern: `*/mb-NNNNN-*` or `*/MB-NNNNN-*` → extract `MB-NNNNN`
  - Also try the GitHub PR for this branch: `./bin/mage -bot-git-readonly gh pr view --json title,url,body` and look for Linear links in the body
- If still not found, ask the user: "I couldn't determine a Linear issue from the branch name. Do you have one? (Reply 'no' to skip)"
- "No issue" is a valid answer — proceed without Linear context.

If a Linear issue ID was resolved, fetch the issue details:
```
./bin/mage -bot-fetch-issue <ISSUE_ID>
```
Capture the output as LINEAR_CONTEXT.

#### PR description
Try to fetch the PR description for the current branch:
```
./bin/mage -bot-git-readonly gh pr view --json title,body
```
If a PR exists, capture the title and body as PR_CONTEXT. This is often the best source of intended behavior to test against. If no PR exists, set PR_CONTEXT to empty.

### 3. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot/qabot-agent.md \
  --output .qabot/qabot-prompt.md \
  --set "BRANCH_NAME=<branch>" \
  --set "TIMESTAMP=<timestamp>" \
  --set "OUTPUT_DIR=.qabot/<branch>/<timestamp>" \
  --set "NREPL_PORT=<discovered-port>" \
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>" \
  --set "SERVER_INFO=<output from -bot-server-info>" \
  --set "LINEAR_CONTEXT=<output from -bot-fetch-issue, or empty>" \
  --set "PR_CONTEXT=<PR title and body, or empty>"
```

**Shell escaping:** The `--set` values may contain quotes, newlines, and special characters. Use the `Write` tool to save multi-line values to temp files under `.qabot/tmp/` (e.g., `.qabot/tmp/server-info.txt`), then reference them with command substitution: `--set "SERVER_INFO=$(cat .qabot/tmp/server-info.txt)"`. Do NOT use `cat` with heredoc or `echo` to create the temp files — always use the `Write` tool, which doesn't require Bash permissions. Do NOT write to `/tmp` — use `.qabot/tmp/` so everything stays within the project directory and matches the `Write(./**)` permission.

### 4. Execute

Read the generated `.qabot/qabot-prompt.md` and follow its instructions (Phases 1–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
