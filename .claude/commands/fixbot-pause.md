Pause a fixbot worktree session — stops Docker containers and dev servers, closes tmux window, but preserves the worktree and branch for later resuming. Pass `all` to pause all running fixbot sessions.

The user provided: `$ARGUMENTS`

## Steps

1. Run the mage task to pause the session:
   ```
   ./bin/mage -fixbot-pause $ARGUMENTS
   ```

2. Report the result to the user.
