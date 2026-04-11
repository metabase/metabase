Tear down and remove a autobot session (worktree, Docker containers, and tmux).

The user provided: `$ARGUMENTS`

If arguments are provided, use them as the session name.

If no arguments are provided, try to detect the current session. **Note:** session detection only works from inside an autobot worktree. If you're in the main repo and no arguments were given, run `./bin/mage -autobot-list` first to show available sessions, then ask the user which one to remove.

Run the command from the **current working directory** (not the main repo). `./bin/mage` works from any worktree:

```
./bin/mage -autobot-quit $ARGUMENTS
```

Show the user the output.
