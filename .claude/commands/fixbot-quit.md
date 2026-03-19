Tear down and remove a fixbot worktree session.

The user provided: `$ARGUMENTS`

This can be either a Linear issue ID (e.g., `MB-12345`) or a branch name (e.g., `nvoxland/mb-12345-fix-thing`).

## Steps

1. Run `workmux list` to find the matching worktree. Match by:
   - If the argument looks like an issue ID (e.g., `MB-12345`): find a worktree whose name or branch contains the issue ID (case-insensitive)
   - If the argument looks like a branch name: match directly

   If no match is found, show the user the list of active worktrees and stop.

2. Remove the worktree (this automatically cleans up everything via the `pre_remove` hook):
   ```
   workmux remove -f <NAME>
   ```

3. Kill the tmux session if one exists with the same name:
   ```
   tmux kill-session -t <NAME>
   ```
   If this fails (e.g., no such session), continue anyway.

4. Tell the user what was removed.
