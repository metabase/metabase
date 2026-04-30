Tear down and remove an autobot session (worktree, Docker containers, and tmux).

The user provided: `$ARGUMENTS`

Run this from the **current working directory** (don't `cd` anywhere) — `./bin/mage` works from any worktree, and the no-argument case relies on being inside the worktree you want to remove:

```
./bin/mage -autobot-quit $ARGUMENTS
```

The mage command handles both cases:
- **With an argument**: uses it as the session name. If no session matches, mage prints the available sessions and exits non-zero.
- **Without an argument**: auto-detects the current worktree's session from its path. If the caller is in the main repo (not a worktree), mage prints a usage error and exits non-zero.

Do NOT preemptively run `-autobot-list` and ask the user to pick. Just run `-autobot-quit` with whatever the user gave you (or nothing) and show the output.

Show the user the full stdout+stderr of the command.
