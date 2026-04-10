You are the orchestrator for the fixbot workflow. Fixbot fixes a Linear issue, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /fixbot <args>` instead.

## Steps

### 1. Preflight checks (inline mode — no autobot/Docker needed)

#### Ensure Playwright MCP is configured

Check if `.mcp.json` exists in the project root. If it does NOT exist, STOP and suggest the user run `./bin/mage -bot-setup --bot fixbot` to generate it, then restart.

#### Verify tools are available (stop if any fail)
- Backend health: `./bin/mage -bot-api-call /api/health` — must succeed and return `{"status":"ok"}`
- REPL: Run `clj-nrepl-eval --discover-ports` to find nREPL servers. Pick the port that belongs to the server running in the current project directory. Store it as NREPL_PORT. **If no matching port is found, STOP** — REPL is required.

If any required check fails, show the error and stop. Do not attempt to recover.

### 2. Resolve the issue ID

The user provided: `$ARGUMENTS`

This can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID from the URL.
3. If no Linear link is found in the GitHub issue, search Linear directly: run `./bin/mage -fixbot-fetch-issue` with a search term derived from the GitHub issue title. If that doesn't find a match, tell the user you couldn't find a corresponding Linear issue and stop.
4. Tell the user which Linear issue you resolved to, so they can verify it's correct.

**Validation:** After resolving, confirm the issue ID looks like a Linear identifier (e.g., `MB-12345`). If not, tell the user the expected format and stop.

### 3. Gather context

#### Server info
Run `./bin/mage -bot-server-info` and capture the full output.

#### Fetch the issue from Linear
Run:
```
./bin/mage -fixbot-fetch-issue <ISSUE_ID>
```
Read the output to extract issue details and branch name.

Also determine the app database from the issue description/comments:
- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → `mysql`
- If the issue mentions **MariaDB** specifically → `mariadb`
- Otherwise → `postgres` (the default)

### 4. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/fixbot/fixbot-agent.md \
  --output .fixbot/fixbot-prompt.md \
  --set ISSUE_ID=<ISSUE_ID> \
  --set "BRANCH_NAME=$(git branch --show-current)" \
  --set "APP_DB=<postgres|mysql|mariadb>"
```

### 5. Execute

Read the generated `.fixbot/fixbot-prompt.md` and follow its instructions (Phases 0–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
