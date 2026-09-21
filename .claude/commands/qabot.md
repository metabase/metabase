You are the orchestrator for the qabot workflow. QABot performs pre-merge QA analysis on the current branch, running directly in this project against the locally running server. For an isolated worktree version, use `/autobot <branch> /qabot` instead.

## Steps

### 1. Generate per-run directory

Generate a timestamp in `YYYYMMDD-HHMMSS` format. If you know the current wall-clock time, construct it directly. Otherwise run `./bin/mage -bot-timestamp`. Do NOT use `date` directly.

Set:
- `TIMESTAMP=<YYYYMMDD-HHMMSS>`
- `OUTPUT_DIR=.bot/qabot/<TIMESTAMP>`

Every file this run writes — including discover artifacts — lives under `<OUTPUT_DIR>/`. There must be **no shared paths across runs**, so multiple `/qabot` invocations in the same repo do not collide.

### 2. Gather context

If `<OUTPUT_DIR>/config.env` does NOT exist, run `/qabot-discover $ARGUMENTS --output-dir <OUTPUT_DIR>` first. (Discover writes its artifacts directly into `<OUTPUT_DIR>/`, never in a shared location.)

Then read:
- `<OUTPUT_DIR>/config.env` — extract `LINEAR_ISSUE_ID`, `TIMESTAMP`
- `<OUTPUT_DIR>/linear-context.txt` — Linear issue content (may not exist if no issue found)
- `<OUTPUT_DIR>/pr-context.txt` — PR title and body (may not exist if no PR)

### 3. Generate agent prompt

Reference the discover-dir files directly via `--set-from-file` — no need to copy them or shell-escape them:

```
./bin/mage -bot-generate-prompt \
  --template dev/bot/qabot-agent.md \
  --output <OUTPUT_DIR>/prompt.md \
  --set "TIMESTAMP=<TIMESTAMP>" \
  --set "OUTPUT_DIR=<OUTPUT_DIR>" \
  --set "LINEAR_ISSUE_ID=<resolved-id-or-empty>" \
  --set-from-file "LINEAR_CONTEXT=<OUTPUT_DIR>/linear-context.txt" \
  --set-from-file "PR_CONTEXT=<OUTPUT_DIR>/pr-context.txt"
```

`--set-from-file KEY=PATH` reads the file and inlines its contents as the template variable value. If the file doesn't exist (e.g., the discover step didn't find a Linear issue or PR), the variable becomes an empty string — that's expected and fine.

### 4. Execute

Read the generated `<OUTPUT_DIR>/prompt.md` and follow its instructions (Phases 1–6) in sequence. Execute all phases in a single turn — do not stop between phases unless a STOP condition is triggered.
