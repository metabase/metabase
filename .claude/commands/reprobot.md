You are the orchestrator for the reprobot workflow. ReproBot attempts to reproduce a reported bug against the locally running server, classifies the result, and optionally writes a failing test. For an isolated worktree version, use `/autobot <branch> /reprobot <args>` instead.

## Steps

### 1. Gather context

If `.bot/reprobot/discover/result.env` does NOT exist, run `/reprobot-discover $ARGUMENTS` first.

Then read:
- `.bot/reprobot/discover/result.env` — extract `ISSUE_ID`, `APP_DB`, `TIMESTAMP`
- `.bot/reprobot/discover/linear-context.txt` — the full Linear issue content

### 2. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/reprobot-agent.md \
  --output .bot/reprobot/<TIMESTAMP>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "OUTPUT_DIR=.bot/reprobot/<TIMESTAMP>"
```

### 3. Execute

Read the generated `.bot/reprobot/<TIMESTAMP>/prompt.md` and follow its instructions (Phases 0–4) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
