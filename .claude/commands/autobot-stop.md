Stop an autobot session (kill tmux and dev environment, but keep the worktree).

The user provided: `$ARGUMENTS`

If arguments are provided, use them as the session name.

If no arguments are provided, try to detect the current session. **Note:** session detection only works from inside an autobot worktree. If you're in the main repo and no arguments were given, run `./bin/mage -autobot-list` first to show available sessions, then ask the user which one to stop.

Run the command from the **current working directory** (not the main repo). `./bin/mage` works from any worktree:

```
./bin/mage -autobot-stop $ARGUMENTS
```

Show the user the output.
