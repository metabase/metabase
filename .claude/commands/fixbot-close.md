Close a fixbot worktree's tmux window but keep the worktree and branch for later.

The user provided: `$ARGUMENTS`

This can be either a Linear issue ID (e.g., `MB-12345`) or a branch name (e.g., `nvoxland/mb-12345-fix-thing`).

## Steps

1. Run `workmux list` to find the matching worktree. Match by:
   - If the argument looks like an issue ID (e.g., `MB-12345`): find a worktree whose name or branch contains the issue ID (case-insensitive)
   - If the argument looks like a branch name: match directly

   If no match is found, show the user the list of active worktrees and stop.

2. Close the tmux window (keeps worktree and branch intact):
   ```
   workmux close <NAME>
   ```

3. Tell the user the session was closed and they can reopen it later with `workmux open <NAME>`.
