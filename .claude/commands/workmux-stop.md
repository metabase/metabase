Stop a workmux session (kill tmux and dev environment, but keep the worktree).

The user provided: `$ARGUMENTS`

If arguments are provided, use them as the session name. If no arguments, this will detect and stop the current session (when run from inside a workmux worktree).

Run: `./bin/mage -workmux-stop $ARGUMENTS`

Show the user the output.
