You are the orchestrator for the reprobot workflow. ReproBot attempts to reproduce a reported bug against the locally running server, classifies the result, and optionally writes a failing test. For an isolated worktree version, use `/autobot <branch> /reprobot <args>` instead.

## Steps

### 1. Resolve the issue ID

The user provided: `$ARGUMENTS`

This can be one of three formats:
- **Linear issue ID** (e.g., `MB-12345`, `UXW-3155`) — use directly
- **GitHub issue number** (e.g., `12345`) — resolve to Linear first
- **GitHub issue URL** (e.g., `https://github.com/metabase/metabase/issues/12345`) — extract the number, then resolve to Linear

**If the input is a GitHub issue number or URL:**
1. Fetch the GitHub issue with `./bin/mage -bot-git-readonly gh issue view <NUMBER> --repo metabase/metabase --json body,comments,title`
2. Search the issue body and comments for a Linear issue link (pattern: `https://linear.app/metabase/issue/[A-Z]+-[0-9]+`). Extract the Linear issue ID.
3. If no Linear link found, search Linear directly: run `./bin/mage -bot-fetch-issue` with a search term derived from the GitHub issue title.
4. Tell the user which Linear issue you resolved to.

**Validation:** Confirm the issue ID looks like `[A-Z]+-[0-9]+`. If not, tell the user the expected format and stop.

### 2. Gather context

#### Timestamp
- Generate a timestamp in `YYYYMMDD-HHMMSS` format (construct directly, don't use `date` command).

### 3. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/reprobot-agent.md \
  --output .bot/reprobot/<TIMESTAMP>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "OUTPUT_DIR=.bot/reprobot/<TIMESTAMP>"
```

### 4. Execute

Read the generated `.bot/reprobot/<TIMESTAMP>/prompt.md` and follow its instructions (Phases 0–4) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
