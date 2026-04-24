Launch a bot command in an isolated autobot session with its own worktree, backend, and frontend.

The user provided: `$ARGUMENTS`

## Steps

### 1. Parse arguments

Parse as: `<branch-name-or-pr-env-url> [from <base-branch>] <inner-command> [inner-args...]`

The first token can be either a branch name OR a PR preview environment URL:

- **Branch name** (e.g., `master`, `my-feature-branch`) — launches a local dev environment in a worktree (normal mode).
- **PR preview env URL** matching `https://pr<NUMBER>.coredev.metabase.com` — launches in **remote mode**. No local backend/frontend is booted; the bot talks to the deployed preview environment instead.

If the first token matches the PR-env URL pattern:
1. Extract the PR number with a regex (the digits after `pr`).
2. Resolve the branch name by running `./bin/mage -bot-git-readonly gh pr view <PR_NUMBER> --json headRefName` and reading `headRefName`.
3. Use that branch for the worktree (so the bot has access to the PR's source code).
4. Set `PR_ENV_URL` to the matched URL.
5. Pass `--pr-env-url <URL>` to `-autobot-go` in step 4.

**Note:** PR preview environments are reachable only from the Metabase Tailscale network. If `gh pr view`, the `-bot-git-readonly` call, or the preview URL itself hangs or times out, tell the user to check their Tailscale connection.

If the next two words after the branch/URL are `from <base>`: use `<base>` as the base branch for worktree creation (default: `origin/master`).
Next word starting with `/`: inner command (e.g., `/qabot`, `/fixbot`).
Remaining words: arguments to pass to the inner command.

Examples:
- `/autobot master /qabot` → branch=master, base=origin/master, command="/qabot"
- `/autobot new-branch from existing-branch /qabot` → branch=new-branch, base=existing-branch, command="/qabot"
- `/autobot my-branch /fixbot MB-12345` → branch=my-branch, base=origin/master, command="/fixbot MB-12345"
- `/autobot master /uxbot test the dashboard` → branch=master, base=origin/master, command="/uxbot test the dashboard"
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

Run the `/<bot-name>-discover` skill, passing the inner-args as its arguments. For example, if the command is `/fixbot MB-12345`, run `/fixbot-discover MB-12345`.

This will:
- Gather external context (Linear issues, PR descriptions, etc.)
- Determine the correct app database
- Write results to `.bot/<bot-name>/discover/result.env`

After the discover skill completes, read `.bot/<bot-name>/discover/result.env` and extract the `APP_DB` value. If the file doesn't exist or APP_DB is missing, default to `postgres`.

### 4. Launch the autobot session

Run (append `--pr-env-url <URL>` if in PR-env mode):
```
./bin/mage -autobot-go <BRANCH_NAME> --bot <BOT_NAME> --app-db <APP_DB> --base <BASE_BRANCH> --command "<INNER_COMMAND> <INNER_ARGS>" [--pr-env-url <PR_ENV_URL>]
```

Pass the base branch (default `origin/master`, or whatever was parsed from `from <base>`).

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
- How to remove: `/autobot-quit <session-name>`
