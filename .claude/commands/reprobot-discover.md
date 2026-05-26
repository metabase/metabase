Discover context for reprobot. This is called by `/reprobot` (or `/autobot` before launching the session) to determine the app database and gather issue context.

The user provided: `$ARGUMENTS`

`$ARGUMENTS` must include a `--output-dir <PATH>` flag — the caller (`/reprobot` or `/autobot`) generates the per-run path. Discover never picks a directory itself, so nothing is ever written to a shared `.bot/reprobot/...` location.

## Steps

### 1. Resolve the issue ID

The positional argument can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID.
3. If no Linear link found, search Linear directly: run `./bin/mage -bot-fetch-issue` with a search term derived from the GitHub issue title.

**Validation:** Confirm the issue ID looks like `[A-Z]+-[0-9]+`. If not, tell the user the expected format and stop.

Set `ISSUE_ID=<LINEAR_ID>`.

### 2. Determine run directory

Parse `$ARGUMENTS` for `--output-dir <PATH>`. If absent, stop and tell the caller to pass `--output-dir`. Set `OUTPUT_DIR=<PATH>` and `TIMESTAMP=` the trailing timestamp portion of the path. All artifacts in subsequent steps go directly under `<OUTPUT_DIR>/`.

### 3. Fetch the issue from Linear

Run:
```
./bin/mage -bot-fetch-issue <ISSUE_ID>
```
Read the output to extract issue details.

Save the full output to `<OUTPUT_DIR>/linear-context.txt` using the `Write` tool.

### 4. Determine app database

From the issue description/comments:
- If the issue mentions **MySQL** problems, MySQL-specific SQL syntax, or MySQL error messages → `mysql`
- If the issue mentions **MariaDB** specifically → `mariadb`
- Otherwise → `postgres` (the default)

### 5. Write result

Write the structured result to `<OUTPUT_DIR>/config.env` using the `Write` tool:

```
APP_DB=<postgres|mysql|mariadb>
ISSUE_ID=<ISSUE_ID>
TIMESTAMP=<TIMESTAMP>
OUTPUT_DIR=<OUTPUT_DIR>
```

