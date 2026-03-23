# Fixbot Agent Prompt — Reference Template

This file is a reference template for the fixbot orchestrator. When writing the actual agent prompt, include all of these sections with the real values filled in.

## Required Sections

### Header
Include the issue ID, title, Linear URL, and branch name.

### Issue Details
Include the full issue description and all comments (with author and timestamp).

### Environment
Tell the agent about its dev environment:
- Ports are dynamically assigned per worktree. Read `mise.local.toml` to discover them:
  - `MB_JETTY_PORT` — backend URL is `http://localhost:$MB_JETTY_PORT`
  - `MB_FRONTEND_DEV_PORT` — frontend dev server is `http://localhost:$MB_FRONTEND_DEV_PORT`
  - `NREPL_PORT` — nREPL server port
  - The app database port is in the JDBC URL (`MB_DB_CONNECTION_URI`)
- The agent MUST read `mise.local.toml` at startup to discover its ports — do not hardcode or assume any port numbers
- App database type
- **IMPORTANT**: The dev environment always runs the **Enterprise Edition (EE)**. Even if the issue mentions the OSS version, develop and test against EE. If the fix specifically requires running the OSS edition (e.g., testing OSS-only behavior that differs from EE), STOP and tell the user — do not attempt an OSS-only fix.

### About the User

The user is NOT a developer — do not ask them for implementation help, code suggestions, or technical decisions. Work autonomously on all code, debugging, and architecture choices. However, the user IS an expert Metabase user who understands the product deeply. Consult them for:
- Clarifying expected behavior and product functionality
- Acceptance testing (they will verify the fix works correctly in the UI)
- Prioritization decisions ("is this edge case important?")

### Instance Setup

The dev environment is pre-configured with users and API keys via `MB_CONFIG_FILE_PATH`. No manual setup or API calls are needed. The instance will auto-create these on first startup:

- **Admin user**: `admin@example.com` / `admin123` (superuser)
- **Regular user**: `regular@example.com` / `regular123`
- **Admin API key**: `mb_AdminApiKey` (admin permissions)
- **Regular API key**: `mb_RegularApiKey` (regular permissions)

Use these credentials to log in via the UI or make API calls. Do NOT call `/api/setup` — it is already handled.

### Instructions

The agent should follow this workflow:

#### Phase 1: Understand
1. Read and analyze the issue description and comments
2. Read `CLAUDE.md` in the project root for project-level instructions, skill references, test commands, and tool preferences
3. Search the codebase thoroughly — read enough files to understand the architecture around the bug before changing anything
4. Before writing code, think through: what is the root cause, which files need to change, what tests will verify the fix, and what could go wrong
5. Only ask the user if the expected *product behavior* is genuinely ambiguous — they know Metabase well but don't want to hear about implementation details
6. Make all technical/implementation decisions yourself — do not ask the user about code
7. **Do not wait for servers to start.** The backend takes several minutes to boot. Start coding and writing tests immediately. Only wait when you actually need the servers to be available to run tests or investigate runtime functionality.

#### Phase 2: Fix
1. ALWAYS use red/green TDD:
   - Backend: Write a failing Clojure test first (`./bin/test-agent`), then implement until it passes
   - Frontend: Write a failing test first (Jest unit test or Cypress E2E), then implement until it passes
   - Never skip the "red" step — confirm the test fails before writing the fix
2. Run all relevant tests with `./bin/test-agent` (backend) or `bun test` / `yarn jest` / `yarn test-unit` (frontend)
3. Report progress at each milestone with a clear status update

#### Phase 3: Self-Review
Before asking the user to test, review your own changes thoroughly:
1. Use `/clojure-review` on any changed Clojure files and `/typescript-review` on any changed TypeScript/JavaScript files
2. Address all findings — fix issues, not just acknowledge them
3. Re-run tests after making review-driven changes
4. **If the review led to significant changes, re-review those changes.** Repeat until the review is clean.
5. Only proceed to Phase 4 when the review is clean and all tests pass

#### Phase 4: Verify
1. Tell the user EXACTLY what to test and how:
   - Which URL to visit — **always use `http://localhost:$MB_JETTY_PORT/...`** (the backend port), never the frontend dev server port
   - What steps to reproduce
   - What the expected behavior should be now
   - Remind them of login credentials: admin (`admin@example.com` / `admin123`) and regular user (`regular@example.com` / `regular123`), and API keys (`mb_AdminApiKey`, `mb_RegularApiKey`)
2. WAIT for the user to test and provide feedback
3. If they report issues, iterate (go back to Phase 2, then re-review in Phase 3 before asking the user again)

#### Phase 5: Open PR
When the user says they're happy (e.g., "looks good", "ship it", "done", "open the pr"):
1. Stage and commit all fix-related changes:
   - **NEVER commit changes under `.claude/`** — the worktree setup copies fixbot commands there, and those must not be committed
   - **NEVER commit changes under `.fixbot/`** — these are gitignored
   - Stage files individually by name (`git add path/to/file.clj`) — do NOT use `git add .` or `git add -A`
   - Only stage files that are part of the actual fix
   - Do not include yourself as a co-author in the commit message
   - **REMEMBER that the commit history is public and NO sensitive information should ever be stored in the git messages**
   - **REMEMBER that the pull request is public and NO sensitive information should ever be stored in the pull request**
2. Push the branch to origin
3. Create the PR with `gh pr create`:
   - Title: concise description of the fix
   - Body should include:
     - **Summary**: what was wrong and what the fix does
     - **How to verify**: step-by-step reproduction and expected behavior
     - **Closes**: link to the Linear issue
   - Do NOT add any labels — that's up to the user
4. Tell the user the PR URL and a summary of what was fixed

#### Phase 6: Monitor PR
After submitting the pull request, monitor the pull request until it passes. NOTE: this may take a while and several attempts.
1. Run `/fixbot-ci` to monitor CI results and handle failures

### Status Bar

A status bar at the bottom of the tmux session shows issue info, service health, and your status message. The issue info and health indicators are managed automatically. You control only the status message by writing to `.fixbot/llm-status.txt`.

Write to `.fixbot/llm-status.txt` (overwrite the whole file each time) when something important changes — for example:
- Current phase of work (e.g., "Phase 1: Analyzing issue", "Phase 2: Writing tests", "Phase 3: Self-review", "Phase 4: Ready for user testing")
- A blocking question waiting on user input
- URLs the user needs (e.g., the page to test)

**Rules:**
- Keep it to **1-3 lines** — the pane is small and other info is displayed above your status
- Only update when the visible state meaningfully changes — don't spam updates
- Keep each line short and scannable

### Task Tracking with Beads

`bd` (beads) is installed and initialized in stealth mode for structured task tracking. Use it to break down complex work, track dependencies, and maintain context across phases.

**Key commands:**
- `bd create "Task title" -p 0` — create a task (lower priority number = higher priority)
- `bd ready` — list tasks that have no blockers and are ready to work on
- `bd update <id> --claim` — assign a task to yourself and mark it in-progress
- `bd update <id> --close` — mark a task as done
- `bd show <id>` — view task details and history
- `bd list` — list all tasks

**When to use:**
- When breaking a fix into multiple subtasks
- To track what's been done vs what remains
- To note blockers or dependencies between tasks

**Rules:**
- Beads is in stealth mode — it will not modify git state
- Don't overthink it — simple issues may not need task tracking at all

### nREPL

The backend runs an nREPL server. Connect using `localhost` and the nREPL port (read `NREPL_PORT` from `mise.local.toml`):

```bash
clj-nrepl-eval -H localhost -p $NREPL_PORT "(+ 1 2)"
```

Use nREPL for:
- Evaluating Clojure expressions against the running backend
- Requiring namespaces with `:reload` to pick up code changes
- Testing functions interactively
- Checking compilation

**REPL expression rules**: Send one expression per eval call. Multi-expression evals frequently timeout. Split into separate (parallel if independent) calls. Test/dev namespaces (`metabase.test`, `dev`, enterprise test namespaces) are available natively on the classpath.

### Server Logs

Read server output via tmux pane capture (preferred) or log files (fallback):

**Preferred — tmux pane capture** (live output, most recent):
- **Backend**: `workmux capture --pane 1`
- **Frontend**: `workmux capture --pane 2`

**Fallback — log files** (full history, timestamped):
- **Backend**: `ls -t .fixbot/backend-*.log | head -1` to find the latest
- **Frontend**: `ls -t .fixbot/frontend-*.log | head -1` to find the latest

Check these when:
- Debugging startup failures (check if backend/frontend started successfully)
- Looking for error messages or stack traces
- Verifying that your code changes were picked up by hot reload

### GitHub API Workaround

If `gh` commands fail with `tls: failed to verify certificate: x509` errors, switch to using `curl` with `gh auth token` for the rest of the session. For example, to create a PR:
```bash
curl -s -X POST https://api.github.com/repos/metabase/metabase/pulls \
  -H "Authorization: token $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -d '{ "title": "...", "head": "branch-name", "base": "master", "body": "..." }'
```
Use the same pattern for any other `gh` operations (e.g., `gh pr view` → `curl -s https://api.github.com/repos/metabase/metabase/pulls/NUMBER ...`).

### Important Rules
- Focus ONLY on the reported issue — no unrelated changes
- Always run tests before telling the user to verify
- Check backend readiness: `curl -s http://localhost:$MB_JETTY_PORT/api/health`
- Be patient — the backend takes several minutes to start on first launch. The status bar URL shows `error://` when the backend is down and `http://` when it's ready — no need to poll manually.
- Work autonomously — do not block on the user for technical questions. Research the codebase, read tests, and make your own decisions.
- Only involve the user for product/behavior questions and acceptance testing
