Launch a bot command in an isolated autobot session with its own worktree, backend, and frontend.

The user provided: `$ARGUMENTS`

## Steps

### 1. Parse arguments

Parse as: `<branch-name> [from <base-branch>] <inner-command> [inner-args...] [--app-db postgres|mysql|mariadb]`

- First word: branch name (e.g., `master`, `my-feature-branch`)
- If the next two words are `from <base>`: use `<base>` as the base branch for worktree creation (default: `origin/master`)
- Next word starting with `/`: inner command (e.g., `/qabot`, `/fixbot`)
- Remaining words: arguments to pass to the inner command
- `--app-db`: optional database type (default: `postgres`)

Examples:
- `/autobot master /qabot` → branch=master, base=origin/master, command="/qabot"
- `/autobot new-branch from existing-branch /qabot` → branch=new-branch, base=existing-branch, command="/qabot"
- `/autobot my-branch /fixbot MB-12345` → branch=my-branch, base=origin/master, command="/fixbot MB-12345"
- `/autobot master /uxbot test the dashboard` → branch=master, base=origin/master, command="/uxbot test the dashboard"
- `/autobot master /reprobot MB-12345 --app-db mysql` → branch=master, base=origin/master, command="/reprobot MB-12345", app-db=mysql

Extract the bot name from the inner command by stripping the leading `/` (e.g., `/qabot` → `qabot`).

### 2. Preflight checks

#### Autobot infrastructure checks

Verify these are available (stop if any fail):
- `workmux --version` — workmux is installed (`cargo install workmux`)
- `docker info` — Docker is running
- Check `node_modules/` exists in the project root (run `bun install` if not)

#### Inner bot precheck

If a `/<bot-name>-precheck` skill exists (e.g., `/qabot-precheck` for `/qabot`), run it before launching. If the precheck reports failures, stop and show the results — do not launch the session.

If no precheck skill exists for the inner bot, skip this step.

### 3. Launch the autobot session

Run:
```
./bin/mage autobot-go <BRANCH_NAME> --bot <BOT_NAME> --app-db <APP_DB> --base <BASE_BRANCH> --command "<INNER_COMMAND> <INNER_ARGS>"
```

Pass the base branch (default `origin/master`, or whatever was parsed from `from <base>`).

This will:
- Create a worktree based on the branch (or reuse an existing one)
- Set up the bot environment (Docker DB, settings, Playwright, etc.)
- Start backend + frontend dev servers in tmux panes
- Launch Claude with the inner command as its prompt

If a session already exists for this bot+branch, it will tell you to stop it first.

### 4. Report

Tell the user:
- The session has been launched
- How to attach: `tmux attach -t <bot-name>-<branch-slug>`
- How to stop: `/autobot-stop <session-name>` (or `/autobot-stop` from inside the session)
- How to list all sessions: `/autobot-list`
- How to remove: `/autobot-quit <session-name>`
