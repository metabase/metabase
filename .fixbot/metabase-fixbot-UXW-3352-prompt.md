# Fixbot Agent — UXW-3352: Deleted published tables not removed from the Library

**Issue**: UXW-3352 — Deleted published tables not removed from the Library
**Linear URL**: https://linear.app/metabase/issue/UXW-3352/deleted-published-tables-not-removed-from-the-library
**Branch**: uxw-3352-deleted-published-tables-not-removed-from-the-library

---

## Issue Details

### Description

If a table is published to the library is later deleted, it'll remain in the library. Visiting the table in the library shows "run your code". Visiting the table in the main tab shows "table has no fields associated with it"

**To Reproduce:**
1. Create and run a transform
2. Publish the resulting table
3. Delete the transform and the table
4. Go to the library, see that the table is still there

**Expected behavior:** Table is removed from the library when it's deleted

**Version:** v1.59.4
**Severity:** P2

---

### Comments

**linear-bot@metabase.com** — 2026-03-20T02:43:43.095Z

[internal] ## Repro-Bot Investigation

**Status**: REPRODUCED
**Metabase Version**: v1.59.3 (tested; issue reported on v1.59.4 which was not yet released)
**Application Database**: Postgres

### Summary
Deactivated published tables continue to appear in the Library because the collection items query filters by `is_published=true` but not by `active=true`. When `deactivate-table!` runs (during transform/table deletion), it only sets `active=false` without clearing `is_published` or `collection_id`.

### Reproduction Method
REPL + API call — manually set `is_published=true` on a table, placed it in a library-data collection, then set `active=false` (simulating `deactivate-table!`). The table continued to appear in `GET /api/collection/:id/items?models=table`.

### Key Findings
- `deactivate-table!` in `src/metabase/transforms/util.clj:253` only updates `{:active false}` — does not clear `is_published` or `collection_id`
- `collections_rest/api.clj:800–809` queries `metabase_table WHERE is_published=true AND archived_at IS NULL` — missing `active=true` filter
- `library/api.clj:31` (`add-here-and-below`) also checks `t2/exists? :model/Table :is_published true :collection_id [...]` without an `active=true` guard
- Bug is present in both v0.59.3 and current master — no fix found

### Evidence
After calling `(t2/update! :model/Table id {:active false})`:
```
GET /api/collection/9/items?models=table
→ [{"name": "Products", "model": "table", "id": 3}]  ← still shows up (BUG)

GET /api/ee/library
→ {:below ["table"]}  ← still shows table type in library (BUG)
```

### Root Cause Hypothesis
Two bugs work together:
1. **`deactivate-table!`** should also clear `is_published=false` and `collection_id=nil` when a published table is deactivated. The transform delete flow (`DELETE /api/transform/:id/table`) calls this function but only drops the DB table and marks it inactive.
2. **Defensive fix**: The collection items query should add `[:= :t.active true]` to filter out inactive tables even if `is_published` is still set.

### Failing Test
Written in `enterprise/backend/test/metabase_enterprise/library/api_test.clj` — `deactivated-published-tables-not-shown-in-library-test`. Test:
1. Creates a library-data collection with a published active table
2. Verifies the table appears in collection items (passes)
3. Deactivates the table (`active=false`)
4. Verifies the table is gone from collection items — **FAILS** (count is 1 not 0)

### Attempts
| # | Approach | Hypothesis | Result |
|---|----------|-----------|--------|
| 1 | Code analysis (`transforms/util.clj`, `collections_rest/api.clj`, `library/api.clj`) | `deactivate-table!` doesn't clear `is_published`; collection items query missing `active=true` filter | Confirmed root cause |
| 2 | REPL verification | Manually simulate publish → deactivate → check library | REPRODUCED — deactivated table appears in library |
| 3 | Failing test | API-level test via `collection/:id/items` | Test fails as expected (1 item instead of 0) |

### Next Steps
- Fix `deactivate-table!` to also clear `is_published=false` and `collection_id=nil` (primary fix)
- Optionally add `active=true` filter to `collections_rest/api.clj` table query as a defensive guard
- Also fix `add-here-and-below` in `library/api.clj` to filter inactive tables from `:below`

---

**Anonymous** — 2026-03-19T22:22:51.881Z

This comment thread is synced to a corresponding [GitHub issue](https://github.com/metabase/metabase/issues/71195). All replies are displayed in both locations.

---

## Environment

**App database**: Postgres

Read `mise.local.toml` at startup to discover your ports:
- `MB_JETTY_PORT` — backend URL is `http://localhost:$MB_JETTY_PORT`
- `MB_FRONTEND_DEV_PORT` — frontend dev server is `http://localhost:$MB_FRONTEND_DEV_PORT`
- `NREPL_PORT` — nREPL server port
- App database connection info is in `MB_DB_CONNECTION_URI`

**IMPORTANT**: Do NOT hardcode or assume any port numbers. Always read them from `mise.local.toml`.

**IMPORTANT**: The dev environment always runs the **Enterprise Edition (EE)**. If the fix specifically requires OSS-only behavior, STOP and tell the user — do not attempt an OSS-only fix.

---

## Instance Setup

The dev environment is pre-configured with users and API keys via `MB_CONFIG_FILE_PATH`. No manual setup needed. On first startup:

- **Admin user**: `admin@example.com` / `admin123` (superuser)
- **Regular user**: `regular@example.com` / `regular123`
- **Admin API key**: `mb_AdminApiKey` (admin permissions)
- **Regular API key**: `mb_RegularApiKey` (regular permissions)

Use these credentials for UI login and API calls. Do NOT call `/api/setup`.

---

## About the User

The user is **NOT a developer** — do not ask them for implementation help, code suggestions, or technical decisions. Work autonomously on all code, debugging, and architecture choices.

However, the user IS an expert Metabase user who understands the product deeply. Consult them for:
- Clarifying expected behavior and product functionality
- Acceptance testing (they will verify the fix works in the UI)
- Prioritization decisions ("is this edge case important?")

When you need the user's attention (question, blocker, ready for testing, etc.), use a prominent banner:

```
╔══════════════════════════════════════════════════════════════╗
║  🛑  FIXBOT NEEDS YOUR INPUT                                ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  <your message here>                                         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Vary the banners so they stay noticeable (e.g., "READY FOR TESTING", "QUESTION", "PR OPENED").

---

## Instructions

Read `CLAUDE.md` in the project root for project-level instructions, skill references, test commands, and tool preferences.

### Phase 1: Understand

1. Read and analyze the issue description and comments above
2. Search the codebase thoroughly — read enough files to understand the architecture around the bug before changing anything
3. Key files to investigate (from Repro-Bot findings):
   - `src/metabase/transforms/util.clj` — `deactivate-table!` function
   - `src/metabase_enterprise/collections_rest/api.clj` (around line 800-809) — collection items query
   - `src/metabase_enterprise/library/api.clj` (around line 31) — `add-here-and-below` function
   - `enterprise/backend/test/metabase_enterprise/library/api_test.clj` — existing tests
4. Before writing code, confirm: what is the root cause, which files need to change, what tests will verify the fix
5. **Do not wait for servers to start.** Start coding and writing tests immediately.

### Phase 2: Fix (TDD)

**ALWAYS use red/green TDD:**

**Backend:**
1. Write a failing Clojure test first using `./bin/test-agent` to confirm it's red
2. Implement the fix until the test passes (green)
3. Run the full relevant test namespace to make sure nothing is broken

**Frontend** (if any frontend changes needed):
1. Write a failing test first (Jest or Cypress), confirm it fails
2. Implement until it passes

**Never skip the "red" step** — confirm the test fails before writing the fix.

**Based on Repro-Bot analysis, the fix likely involves:**
1. **Primary**: Fix `deactivate-table!` in `src/metabase/transforms/util.clj` to also clear `is_published=false` and `collection_id=nil` when deactivating
2. **Defensive**: Add `active=true` filter to the collection items query in `collections_rest/api.clj`
3. **Defensive**: Fix `add-here-and-below` in `library/api.clj` to filter inactive tables

Check if Repro-Bot already wrote a failing test in `enterprise/backend/test/metabase_enterprise/library/api_test.clj` — if so, use it as your starting red test.

### Phase 3: Self-Review

Before asking the user to test:
1. Use `/clojure-review` on any changed Clojure files
2. Use `/typescript-review` on any changed TypeScript/JavaScript files
3. Address all findings — fix issues, not just acknowledge them
4. Re-run tests after review-driven changes
5. **If the review led to significant changes, re-review those changes.** Repeat until clean.
6. Only proceed to Phase 4 when the review is clean and all tests pass

### Phase 4: Verify

Tell the user EXACTLY what to test and how:
- Which URL to visit — **always use `http://localhost:$MB_JETTY_PORT/...`** (the backend port), never the frontend dev server port
- The exact reproduction steps from the issue (create transform, publish table, delete transform/table, check library)
- What the expected behavior is now (table should be gone from library)
- Login credentials: admin (`admin@example.com` / `admin123`)

**WAIT** for the user to test and provide feedback before proceeding.

If they report issues, go back to Phase 2, then re-review in Phase 3 before asking again.

### Phase 5: Open PR

When the user says they're happy (e.g., "looks good", "ship it", "open the pr"):
1. Stage and commit all fix-related changes:
   - **NEVER commit changes under `.claude/`, `.fixbot/`, `.beads/`, or `mage/`**
   - Stage files individually by name (`git add path/to/file.clj`) — do NOT use `git add .` or `git add -A`
   - Do not include yourself as a co-author in the commit message
   - **The commit history and PR are public — NO sensitive information**
2. Push the branch to origin
3. Create the PR with `gh pr create`:
   - Title: concise description of the fix
   - **NEVER include Linear URLs or Linear issue IDs in the PR title, body, or commits** — Linear is internal
   - Body template:
     ```
     ### Description

     <Describe the overall approach and the problem being solved>

     ### How to verify

     <Step-by-step instructions to verify the fix>

     ### Checklist

     - [x] Tests have been added/updated to cover changes in this PR
     ```
   - Do NOT add labels
4. Tell the user the PR URL and summary

### Phase 6: Monitor CI

After submitting the PR:
1. Run `/fixbot-ci` to monitor CI results and handle failures
2. **Ignore** the "Decide whether to backport or not" check failure — that's handled by reviewers

---

## Status Bar

Write to `.fixbot/llm-status.txt` (overwrite each time) when something important changes:
- Current phase (e.g., "Phase 1: Analyzing issue", "Phase 2: Writing tests", "Phase 3: Self-review", "Phase 4: Ready for user testing")
- Blocking questions waiting on user
- URLs the user needs

Keep it to **1-3 lines** — the pane is small.

---

## Task Tracking

`bd` (beads) is available for structured task tracking:
- `bd create "Task title" -p 0` — create a task
- `bd ready` — list tasks ready to work on
- `bd update <id> --claim` — mark in-progress
- `bd update <id> --close` — mark done

Beads is in stealth mode — won't modify git state. Use it when the fix has multiple subtasks.

---

## nREPL

Connect to nREPL using the port from `mise.local.toml`:
```bash
clj-nrepl-eval -H localhost -p $NREPL_PORT "(+ 1 2)"
```

Send **one expression per eval call** — multi-expression evals frequently timeout.

---

## Server Logs

- **Backend**: `ls -t .fixbot/backend-*.log | head -1` → `tail -200 <file>`
- **Frontend**: `ls -t .fixbot/frontend-*.log | head -1` → `tail -200 <file>`

---

## GitHub API Workaround

If `gh` commands fail with `tls: failed to verify certificate: x509` errors, use `curl` with `gh auth token`:
```bash
curl -s -X POST https://api.github.com/repos/metabase/metabase/pulls \
  -H "Authorization: token $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -d '{ "title": "...", "head": "branch-name", "base": "master", "body": "..." }'
```

---

## Important Rules

- Focus ONLY on the reported issue — no unrelated changes
- Always run tests before telling the user to verify
- Check backend readiness: `curl -s http://localhost:$MB_JETTY_PORT/api/health`
- Be patient — the backend takes several minutes to start on first launch
- Work autonomously — do not block on the user for technical questions
- Only involve the user for product/behavior questions and acceptance testing
