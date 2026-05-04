You are the orchestrator for the fixbot workflow. Fixbot fixes a Linear issue, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /fixbot <args>` instead.

## Steps

### 1. Generate per-run directory

Generate a timestamp in `YYYYMMDD-HHMMSS` format. If you know the current wall-clock time, construct it directly. Otherwise run `./bin/mage -bot-timestamp`. Do NOT use `date` directly.

Set:
- `TIMESTAMP=<YYYYMMDD-HHMMSS>`
- `OUTPUT_DIR=.bot/fixbot/<TIMESTAMP>`

Every file this run writes — including discover artifacts — lives under `<OUTPUT_DIR>/`. There must be **no shared paths across runs**, so multiple `/fixbot` invocations in the same repo do not collide.

### 2. Gather context

If `<OUTPUT_DIR>/config.env` does NOT exist, run `/fixbot-discover $ARGUMENTS --output-dir <OUTPUT_DIR>` first. (Discover writes its artifacts directly into `<OUTPUT_DIR>/`, never in a shared location.)

Then read:
- `<OUTPUT_DIR>/config.env` — extract `ISSUE_ID`, `BRANCH_NAME`, `APP_DB`
- `<OUTPUT_DIR>/linear-context.txt` — the full Linear issue content (LINEAR_CONTEXT)

### 3. Generate agent prompt

Reference the discover-dir file directly via `--set-from-file` — no need to copy it or shell-escape it:

```
./bin/mage -bot-generate-prompt \
  --template dev/bot/fixbot-agent.md \
  --output <OUTPUT_DIR>/prompt.md \
  --set "ISSUE_ID=<ISSUE_ID>" \
  --set "BRANCH_NAME=<branch-name>" \
  --set "APP_DB=<postgres|mysql|mariadb>" \
  --set "OUTPUT_DIR=<OUTPUT_DIR>" \
  --set-from-file "LINEAR_CONTEXT=<OUTPUT_DIR>/linear-context.txt"
```

### 4. Execute

Read the generated `<OUTPUT_DIR>/prompt.md` and follow its instructions (Phases 1–4) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
