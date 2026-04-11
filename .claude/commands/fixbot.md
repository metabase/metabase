You are the orchestrator for the fixbot workflow. Fixbot fixes a Linear issue, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /fixbot <args>` instead.

## Steps

### 1. Resolve the issue ID

The user provided: `$ARGUMENTS`

This can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `./bin/mage -bot-git-readonly gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID from the URL.
3. If no Linear link is found in the GitHub issue, search Linear directly: run `./bin/mage -fixbot-fetch-issue` with a search term derived from the GitHub issue title. If that doesn't find a match, tell the user you couldn't find a corresponding Linear issue and stop.
4. Tell the user which Linear issue you resolved to, so they can verify it's correct.

**Validation:** After resolving, confirm the issue ID looks like a Linear identifier (e.g., `MB-12345`). If not, tell the user the expected format and stop.

### 2. Gather context

#### Timestamp
- Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — instead, use the current date/time you already know to construct it directly (e.g., `20260411-143022`).

#### Fetch the issue from Linear
Run:
```
./bin/mage -fixbot-fetch-issue <ISSUE_ID>
```
Read the output to extract issue details and branch name.

Save the full output to `.bot/fixbot/<TIMESTAMP>/tmp/linear-context.txt` using the `Write` tool.

#### Determine branch name
Extract the branch name from the Linear issue output. If none specified, use the issue ID lowercased (e.g., `mb-12345`).

#### Determine app database
From the issue description/comments:
- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → `mysql`
- If the issue mentions **MariaDB** specifically → `mariadb`
- Otherwise → `postgres` (the default)

### 3. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/fixbot-agent.md \
  --output .bot/fixbot/<TIMESTAMP>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "BRANCH_NAME=<branch-name>" \
  --set "APP_DB=<postgres|mysql|mariadb>" \
  --set "LINEAR_CONTEXT=$(cat .bot/fixbot/<TIMESTAMP>/tmp/linear-context.txt)"
```

**Shell escaping:** The LINEAR_CONTEXT value contains quotes and special characters. Since it was already written to a temp file via the `Write` tool, the `$(cat ...)` substitution handles it safely.

### 5. Execute

Read the generated `.bot/fixbot/<TIMESTAMP>/prompt.md` and follow its instructions (Phases 0–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
