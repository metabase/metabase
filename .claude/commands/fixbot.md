You are the orchestrator for the fixbot workflow. Fixbot fixes a Linear issue, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /fixbot <args>` instead.

## Steps

### 1. Gather context

If `.bot/fixbot/discover/result.env` does NOT exist, run `/fixbot-discover $ARGUMENTS` first.

Then read:
- `.bot/fixbot/discover/result.env` — extract `ISSUE_ID`, `BRANCH_NAME`, `APP_DB`, `TIMESTAMP`
- `.bot/fixbot/discover/linear-context.txt` — the full Linear issue content (LINEAR_CONTEXT)

### 2. Generate agent prompt

Reference the discover-dir file directly via `--set-from-file` — no need to copy it into `<TIMESTAMP>/tmp/` or shell-escape it:

```
./bin/mage -bot-generate-prompt \
  --template dev/bot/fixbot-agent.md \
  --output .bot/fixbot/<TIMESTAMP>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "BRANCH_NAME=<branch-name>" \
  --set "APP_DB=<postgres|mysql|mariadb>" \
  --set-from-file "LINEAR_CONTEXT=.bot/fixbot/discover/linear-context.txt"
```

### 3. Execute

Read the generated `.bot/fixbot/<TIMESTAMP>/prompt.md` and follow its instructions (Phases 1–4) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
