Launch a bot command in an isolated autobot session with its own worktree, backend, and frontend.

The user provided: `$ARGUMENTS`

## Steps

### 1. Parse arguments

Parse as: `<branch-name> [from <base-branch>] <inner-command> [inner-args...]`

- First word: branch name (e.g., `master`, `my-feature-branch`)
- If the next two words are `from <base>`: use `<base>` as the base branch for worktree creation (default: `origin/master`)
- Next word starting with `/`: inner command (e.g., `/qabot`, `/fixbot`)
- Remaining words: arguments to pass to the inner command

Examples:
- `/autobot master /qabot` → branch=master, base=origin/master, command="/qabot"
- `/autobot new-branch from existing-branch /qabot` → branch=new-branch, base=existing-branch, command="/qabot"
- `/autobot my-branch /fixbot MB-12345` → branch=my-branch, base=origin/master, command="/fixbot MB-12345"
- `/autobot master /uxbot test the dashboard` → branch=master, base=origin/master, command="/uxbot test the dashboard"

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

Run:
```
./bin/mage -autobot-go <BRANCH_NAME> --bot <BOT_NAME> --app-db <APP_DB> --base <BASE_BRANCH> --command "<INNER_COMMAND> <INNER_ARGS>"
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
