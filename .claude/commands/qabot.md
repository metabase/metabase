You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /qabot` instead.

## Steps

### 1. Gather context

If `.bot/qabot/discover/result.env` does NOT exist, run `/qabot-discover $ARGUMENTS` first.

Then read:
- `.bot/qabot/discover/result.env` — extract `LINEAR_ISSUE_ID`, `TIMESTAMP`
- `.bot/qabot/discover/linear-context.txt` — Linear issue content (may not exist if no issue found)
- `.bot/qabot/discover/pr-context.txt` — PR title and body (may not exist if no PR)

### 2. Generate agent prompt

Save multi-line context values to temp files under `.bot/qabot/<timestamp>/tmp/` using the `Write` tool, then reference them with `$(cat ...)`.

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot-agent.md \
  --output .bot/qabot/<timestamp>/prompt.md \
  --set "TIMESTAMP=<timestamp>" \
  --set "OUTPUT_DIR=.bot/qabot/<timestamp>" \
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>" \
  --set "LINEAR_CONTEXT=$(cat .bot/qabot/<timestamp>/tmp/linear-context.txt)" \
  --set "PR_CONTEXT=$(cat .bot/qabot/<timestamp>/tmp/pr-context.txt)"
```

**Shell escaping:** Do NOT use `cat` with heredoc or `echo` to create the temp files — always use the `Write` tool, which doesn't require Bash permissions. Do NOT write to `/tmp` — use `.bot/qabot/<timestamp>/tmp/` so everything stays within the project directory and matches the `Write(./**)` permission.

### 3. Execute

Read the generated `.bot/qabot/<timestamp>/prompt.md` and follow its instructions (Phases 1–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
