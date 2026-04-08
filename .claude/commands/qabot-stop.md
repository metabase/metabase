Stop a qabot workmux session (kill tmux and dev environment, but keep the worktree).

## Steps

The user provided: `$ARGUMENTS`

Parse as: `<name-or-id>` — the branch name or session identifier.

Run:
```
./bin/mage -qabot-stop $ARGUMENTS
```

If it succeeds, tell the user the session has been stopped and that the worktree is preserved.

If it fails, show the error.
