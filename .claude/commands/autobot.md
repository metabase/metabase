Launch a bot command in an isolated autobot session with its own worktree, backend, and frontend.

The user provided: `$ARGUMENTS`

## Steps

### 1. Parse arguments

Parse as: `<branch-name-or-pr-env-url> [from <base-branch>] <inner-command> [inner-args...]`

The first token can be either a branch name OR a PR preview environment URL:

- **Branch name** (e.g., `master`, `my-feature-branch`) — launches a local dev environment in a worktree (normal mode).
- **PR preview env URL** matching the exact pattern `https://pr<NUMBER>.coredev.metabase.com` (with optional trailing `/`) — launches in **remote mode**. No local backend/frontend is booted; the bot talks to the deployed preview environment instead. The URL must match the anchored regex `^https://pr(\d+)\.coredev\.metabase\.com/?$`; reject anything else (e.g., extra subdomains, different hosts, or paths) — do not pass it to `-autobot-go`.

If the first token matches the PR-env URL pattern:
1. Extract the PR number from the anchored regex above (the digits after `pr`).
2. Resolve the branch name by running `gh pr view <PR_NUMBER> --json headRefName` and reading `headRefName`.
3. Use that branch for the worktree (so the bot has access to the PR's source code).
4. Set `PR_ENV_URL` to the matched URL.
5. Pass `--pr-env-url <URL>` to `-autobot-go` in step 4.

**Note:** PR preview environments are reachable only from the Metabase Tailscale network. If `gh pr view` or the preview URL itself hangs or times out, tell the user to check their Tailscale connection.

If the next two words after the branch/URL are `from <base>`: use `<base>` as the base branch. The `from <base>` clause is the signal that autobot should **create the branch** from `<base>` if it doesn't exist. If the branch already exists, passing `from <base>` is an error (the base would be silently ignored otherwise). Pass `--base <base>` to `-autobot-go` in step 4.

Without `from`, the branch must already exist locally or on origin.

Next word starting with `/`: inner command (e.g., `/qabot`, `/fixbot`).
Remaining words: arguments to pass to the inner command.

Examples:
- `/autobot master /qabot` → branch=master (must exist), command="/qabot"
- `/autobot my-new-branch from origin/master /qabot` → **create** branch=my-new-branch from origin/master, command="/qabot"
- `/autobot my-new-branch from existing-branch /qabot` → **create** branch=my-new-branch from existing-branch, command="/qabot"
- `/autobot my-branch /fixbot MB-12345` → branch=my-branch (must exist), command="/fixbot MB-12345"
- `/autobot https://pr383713.coredev.metabase.com /qabot` → **PR-env mode**: PR=383713, branch=(resolved from PR), command="/qabot", pr-env-url=https://pr383713.coredev.metabase.com

Extract the bot name from the inner command by stripping the leading `/` (e.g., `/qabot` → `qabot`).

### 2. Preflight checks

#### Autobot infrastructure checks

Verify these are available (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)

#### Inner bot precheck

If a `/<bot-name>-precheck` skill exists (e.g., `/qabot-precheck` for `/qabot`), run it before launching. If the precheck reports failures, stop and show the results — do not launch the session.

If no precheck skill exists for the inner bot, skip this step.

### 3. Discover context

Generate a timestamp in `YYYYMMDD-HHMMSS` format (use the current wall-clock time if known; otherwise run `./bin/mage -bot-timestamp` — do NOT use `date` directly). Set:

- `TIMESTAMP=<YYYYMMDD-HHMMSS>`
- `OUTPUT_DIR=.bot/<BOT_NAME>/<TIMESTAMP>`

Run the `/<bot-name>-discover` skill, passing the inner-args plus `--output-dir <OUTPUT_DIR>`. For example, if the command is `/fixbot MB-12345`, run `/fixbot-discover MB-12345 --output-dir <OUTPUT_DIR>`.

This will:
- Gather external context (Linear issues, PR descriptions, etc.)
- Determine the correct app database
- Write results to `<OUTPUT_DIR>/config.env` (per-run, not in any shared location)

After the discover skill completes, read `<OUTPUT_DIR>/config.env` and extract the `APP_DB` value. If the file doesn't exist or APP_DB is missing, default to `postgres`.

### 4. Launch the autobot session

Run (append `--pr-env-url <URL>` if in PR-env mode, `--base <base>` only if the user supplied `from <base>`):
```
./bin/mage -autobot-go <BRANCH_NAME> --bot <BOT_NAME> --app-db <APP_DB> --command "<INNER_COMMAND> <INNER_ARGS>" [--base <BASE_BRANCH>] [--pr-env-url <PR_ENV_URL>]
```

Only pass `--base` when the user explicitly wrote `from <base>`. Omitting it means "branch must already exist."

This will:
- Create a worktree based on the branch (or reuse an existing one)
- Set up the dev environment with the correct database
- Start backend + frontend dev servers in tmux panes
- Launch Claude with the inner command as its prompt

If a session already exists for this bot+branch, it will tell you to stop it first.

### 5. Report

Tell the user:
- The session has been launched
- How to attach: `tmux attach -t <session-name>`
- How to stop: `/autobot-stop <session-name>` (or `/autobot-stop` from inside the session)
- How to list all sessions: `/autobot-list`
- How to remove: `/autobot-kill <session-name>`
