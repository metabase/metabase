You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /qabot` instead.

## Steps

### 1. Gather context

If `.bot/qabot/discover/result.env` does NOT exist, run `/qabot-discover $ARGUMENTS` first.

Then read:
- `.bot/qabot/discover/result.env` — extract `LINEAR_ISSUE_ID`, `TIMESTAMP`
- `.bot/qabot/discover/linear-context.txt` — Linear issue content (may not exist if no issue found)
- `.bot/qabot/discover/pr-context.txt` — PR title and body (may not exist if no PR)

### 2. Generate agent prompt

Reference the discover-dir files directly via `--set-from-file` — no need to copy them into `{{OUTPUT_DIR}}/tmp/` or shell-escape them:

```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot-agent.md \
  --output .bot/qabot/<timestamp>/prompt.md \
  --set "TIMESTAMP=<timestamp>" \
  --set "OUTPUT_DIR=.bot/qabot/<timestamp>" \
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>" \
  --set-from-file "LINEAR_CONTEXT=.bot/qabot/discover/linear-context.txt" \
  --set-from-file "PR_CONTEXT=.bot/qabot/discover/pr-context.txt"
```

`--set-from-file KEY=PATH` reads the file and inlines its contents as the template variable value. If the file doesn't exist (e.g., the discover step didn't find a Linear issue or PR), the variable becomes an empty string — that's expected and fine.

### 3. Execute

Read the generated `.bot/qabot/<timestamp>/prompt.md` and follow its instructions (Phases 1–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
