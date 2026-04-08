You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server.

## Steps

### 1. Preflight checks (inline mode — no workmux/Docker needed)

Verify these are available by running each check (stop if any fail):
- `pandoc --version` — pandoc is installed (`brew install pandoc`)
- `weasyprint --version` — weasyprint is installed (`pip3 install weasyprint`)
- Playwright MCP: `npx -y @playwright/mcp --version` — available via npx
- Backend health: Read `mise.local.toml` for `MB_JETTY_PORT` (fall back to env var, then 3000), then `curl -s http://localhost:$PORT/api/health` must return `{"status":"ok"}`

Optional (warn but continue if missing):
- `LINEAR_API_KEY` env var — enables fetching Linear issue context

If any required check fails, show the error and stop. Do not attempt to recover.

### 2. Parse arguments

The user provided: `$ARGUMENTS`

Parse as: `[linear-issue-id]`

- If a Linear issue ID is provided (e.g., `MB-12345`), validate it looks like `[A-Z]+-[0-9]+`.
- If not provided, try to detect from the current branch name:
  - Pattern: `*/mb-NNNNN-*` or `*/MB-NNNNN-*` → extract `MB-NNNNN`
  - Also try the GitHub PR for this branch: `gh pr view --json title,url,body 2>/dev/null` and look for Linear links in the body
- If still not found, ask the user: "I couldn't determine a Linear issue from the branch name. Do you have one? (Reply 'no' to skip)"
- "No issue" is a valid answer — proceed without Linear context.

### 3. Determine environment

- Read `mise.local.toml` if it exists, otherwise use defaults
- Get current branch: `git branch --show-current`
- Generate timestamp: `date +%Y%m%d-%H%M%S`

### 4. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot/qabot-agent.md \
  --output .qabot/qabot-prompt.md \
  --set "BRANCH_NAME=$(git branch --show-current)" \
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>"
```

### 5. Execute

Read the generated `.qabot/qabot-prompt.md` and follow its instructions (Phases 0–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
