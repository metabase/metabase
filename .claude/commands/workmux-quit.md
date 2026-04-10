Tear down and remove a workmux session (worktree, Docker containers, and tmux).

The user provided: `$ARGUMENTS`

If arguments are provided, use them as the session name. If no arguments, this will detect and remove the current session (when run from inside a workmux worktree).

Run: `./bin/mage -workmux-quit $ARGUMENTS`

Show the user the output.
