You are the orchestrator for the cibot workflow. CIBot monitors CI for the current branch's PR, fixes failures, and re-runs flaky tests until CI is green. For an isolated worktree version, use `/cibot-workmux` instead.

## Steps

### 1. Preflight checks (inline mode — no workmux/Docker needed)

#### Verify tools are available (stop if any fail)
- `gh auth status` — GitHub CLI is authenticated
- Backend health: `./bin/mage -bot-api-call /api/health` — must succeed (needed for running tests locally)
- REPL: Run `clj-nrepl-eval --discover-ports` to find nREPL servers. Store as NREPL_PORT. **If no matching port is found, warn but continue** — REPL is helpful but not required for CI monitoring.

If GitHub CLI is not authenticated, show the error and stop.

### 2. Gather context

- Get current branch: `git branch --show-current`
- Verify a PR exists: `gh pr view --json number,url`

If no PR exists, tell the user and stop.

### 3. Generate agent prompt

Run:
```
./bin/mage -bot-generate-prompt \
  --template dev/bot/cibot/cibot-agent.md \
  --output .cibot/cibot-prompt.md \
  --set "BRANCH_NAME=$(git branch --show-current)"
```

### 4. Execute

Read the generated `.cibot/cibot-prompt.md` and follow its instructions (Phases 0–5) in sequence. Monitor CI, fix failures, and report results.
