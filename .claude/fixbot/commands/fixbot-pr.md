Review all changes, then create a PR for the current fixbot branch.

## Step 1: Code Review

Run `git diff main...HEAD` to see all changes on this branch. Review every changed line and check for:

- Unrelated changes or leftover debugging code
- Code quality issues (naming, structure, duplication)
- Missing or inadequate test coverage
- Style violations (formatting, conventions)

Fix all issues found. Re-run tests after any fixes:
- Backend: `./bin/test-agent`
- Frontend: `yarn jest` / `yarn test-unit` (if frontend files were changed)

Do NOT proceed until all issues are addressed and tests pass.

## Step 2: Create the PR

1. Stage and commit any review fixes. When staging files:
   - **NEVER commit changes under `.claude/`** — the worktree setup copies fixbot commands there, and those must not be committed
   - Stage files individually by name (`git add path/to/file.clj`) — do NOT use `git add .` or `git add -A`
   - Only stage files that are part of the actual fix
2. Push the branch to origin
3. Create the PR with `gh pr create`:
   - Title: concise description of the fix
   - Body should include:
     - **Summary**: what was wrong and what the fix does
     - **How to verify**: step-by-step reproduction and expected behavior
     - **Closes**: link to the Linear issue
   - Do NOT add any labels, it's up to the user to do that

## Step 3: Report

Tell the user:
- The PR URL
- A summary of what was fixed
- Any review issues you found and addressed

Then tell the user you'll now monitor CI, and run `/fixbot-ci` to watch for CI results and handle failures.
