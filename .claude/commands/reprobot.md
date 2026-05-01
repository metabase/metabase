You are the orchestrator for the reprobot workflow. ReproBot attempts to reproduce a reported bug against the locally running server, classifies the result, and optionally writes a failing test. For an isolated worktree version, use `/autobot <branch> /reprobot <args>` instead.

## Steps

### 1. Generate per-run directory

Generate a timestamp in `YYYYMMDD-HHMMSS` format. If you know the current wall-clock time, construct it directly. Otherwise run `./bin/mage -bot-timestamp`. Do NOT use `date` directly.

Set:
- `TIMESTAMP=<YYYYMMDD-HHMMSS>`
- `OUTPUT_DIR=.bot/reprobot/<TIMESTAMP>`

Every file this run writes — including discover artifacts — lives under `<OUTPUT_DIR>/`. There must be **no shared paths across runs**, so multiple `/reprobot` invocations in the same repo do not collide.

### 2. Gather context

If `<OUTPUT_DIR>/config.env` does NOT exist, run `/reprobot-discover $ARGUMENTS --output-dir <OUTPUT_DIR>` first. (Discover writes its artifacts directly into `<OUTPUT_DIR>/`, never in a shared location.)

Then read:
- `<OUTPUT_DIR>/config.env` — extract `ISSUE_ID`, `APP_DB`
- `<OUTPUT_DIR>/linear-context.txt` — the full Linear issue content

### 3. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/reprobot-agent.md \
  --output <OUTPUT_DIR>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "OUTPUT_DIR=<OUTPUT_DIR>"
```

### 4. Execute

Read the generated `<OUTPUT_DIR>/prompt.md` and follow its instructions (Phases 0–4) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
