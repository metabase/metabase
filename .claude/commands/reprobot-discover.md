Discover context for reprobot. This is called by `/autobot` before launching the session to determine the app database and gather issue context.

The user provided: `$ARGUMENTS`

## Steps

### 1. Resolve the issue ID

This can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `./bin/mage -bot-git-readonly gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID.
3. If no Linear link found, search Linear directly: run `./bin/mage -bot-fetch-issue` with a search term derived from the GitHub issue title.

**Validation:** Confirm the issue ID looks like `[A-Z]+-[0-9]+`. If not, tell the user the expected format and stop.

### 2. Fetch the issue from Linear

Run:
```
./bin/mage -bot-fetch-issue <ISSUE_ID>
```
Read the output to extract issue details.

Save the full output to `.bot/reprobot/discover/linear-context.txt` using the `Write` tool.

### 3. Determine app database

From the issue description/comments:
- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → `mysql`
- If the issue mentions **MariaDB** specifically → `mariadb`
- Otherwise → `postgres` (the default)

### 4. Generate timestamp

Generate a timestamp in `YYYYMMDD-HHMMSS` format. If you know the current wall-clock time, construct it directly. Otherwise run `./bin/mage -bot-timestamp` — it prints exactly one line in the required format with no extra output. Do NOT use `date` directly.

### 5. Write result

Write the structured result to `.bot/reprobot/discover/result.env` using the `Write` tool:

```
APP_DB=<postgres|mysql|mariadb>
ISSUE_ID=<ISSUE_ID>
TIMESTAMP=<YYYYMMDD-HHMMSS>
```
