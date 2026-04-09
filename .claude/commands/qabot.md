You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server.

## Steps

### 1. Preflight checks (inline mode — no workmux/Docker needed)

#### Ensure Playwright MCP is configured

Check if `.mcp.json` exists in the project root. If it does NOT exist, STOP and suggest the user add it to their primary repo and restart:
```bash
echo '{"mcpServers":{"playwright":{"command":"npx","args":["-y","@playwright/mcp@0.0.68","--headless","--browser","chrome","--viewport-size","1440x900","--snapshot-mode","full","--block-service-workers","--isolated","--timeout-action","10000"]}}}' > .mcp.json
```

#### Verify tools are available (stop if any fail)
- Playwright MCP: `npx -y @playwright/mcp@0.0.68 --version` — available via npx
- Backend health: `./bin/mage -bot-api-call /api/health` — must succeed and return `{"status":"ok"}`

Optional (warn but continue if missing):
- `LINEAR_API_KEY` env var — enables fetching Linear issue context

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
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>" \
  --set "SERVER_INFO=<output from -bot-server-info>" \
  --set "LINEAR_CONTEXT=<output from -bot-fetch-issue, or empty>" \
  --set "PR_CONTEXT=<PR title and body, or empty>"
```

**Shell escaping:** The `--set` values may contain quotes, newlines, and special characters. Write multi-line values to temp files and use command substitution: `--set "SERVER_INFO=$(cat /tmp/server-info.txt)"`.

### 4. Execute

Read the generated `.qabot/qabot-prompt.md` and follow its instructions (Phases 1–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
