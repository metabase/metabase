Stop an autobot session (kill tmux and dev environment, but keep the worktree).

The user provided: `$ARGUMENTS`

If arguments are provided, use them as the session name.

If no arguments are provided, try to detect the current session. **Note:** session detection only works from inside an autobot worktree. If you're in the main repo and no arguments were given, run `./bin/mage -autobot-list` first to show available sessions, then ask the user which one to stop.

Run: `./bin/mage -autobot-stop $ARGUMENTS`

Show the user the output.
