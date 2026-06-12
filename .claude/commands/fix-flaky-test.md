---
description: Diagnose and fix a flaky Cypress e2e test, then verify the fix with CI stress runs in a bounded loop
---

Fix flaky e2e test: $ARGUMENTS

You are orchestrating a **bounded flake-fix loop** with a real CI feedback signal. The
only integration tool for the loop is `gh` (trigger the stress workflow + read results).
The Linear issue is the input. Everything else is reasoning over files.

**Hard rules — do not deviate:**
- **Max 3 attempts.** One attempt = diagnose → fix → push → 2 stress runs → interpret.
  After 3 failed attempts, stop and hand back.
- **One upfront approval authorizes the whole run's pushes.** Ask once (Phase 3), before
  the first push. That single OK covers every push/trigger for the rest of this run on
  this branch. Never push before that OK.
- **Each attempt triggers TWO stress runs in parallel** — `enable_network_throttling=true`
  and `=false` — on the same branch/commit. The fix is verified only if **both** pass.
- **CI is the source of truth.** No local Cypress runs, no `bin/` stress scripts.
- **Branch names use `-` only, never `/`.**
- **Persist state** to a scratch file so the loop survives `ScheduleWakeup` and context
  summarization.

---

## Phase 0 — Resolve the target

1. Parse `$ARGUMENTS`:
   - If it's a Linear ref (`DEV-####` or a Linear URL) → `mcp__linear__get_issue`. Trunk
     titles these `Quarantined Test: <suite> > <test name>`. Extract the **exact test
     name** (the part after `> ` — this is the grep string) and the **suite**. Read the
     body for failure detail / screenshots / stack, and capture the **ranked failure
     reasons** (Trunk lists them "most common" first) — #1 is what you fix first (Phase 1).
   - Otherwise treat it as a spec path or fuzzy test name (fallback; no Linear context).
2. **Resolve the spec file** from the exact test name:
   ```bash
   grep -rl "<exact test name>" e2e/test/scenarios
   ```
   Require **exactly one** match. If 0 or >1, stop and ask the user to disambiguate. (Try
   a shorter unique substring of the test name if the literal has special characters.)
3. **Decide `qa_db`:** scan the spec / its `describe` for external-DB helpers
   (postgres/mysql/mongo-writable) or an `@external` tag → `true`, else `false`.
4. **Write the state file** `local/claude/flake-fix/<DEV-id-or-slug>.md`:
   ```markdown
   # Flake fix: <test name>
   - linear: <DEV-#### or n/a>
   - spec: <spec path>
   - test_name (grep): <exact test name>
   - qa_db: <true|false>
   - edition: ee
   - branch: <fix-flake-...>
   - attempt: 0 / 3
   - pushes_authorized: no

   ## Failure reasons (Trunk, ranked — fix #1 first)
   1. <dominant / most common>
   2. <rarer>
   ...

   ## Attempts
   ```
   This file is the durable record. Re-read it on every `ScheduleWakeup` wake.

## Phase 1 — Diagnose (run at the start of every attempt)

- **Anchor on the #1 / most-common failure reason first.** Trunk lists the issue's failure
  reasons ranked by frequency ("The N most common failure reasons…"). Fix the **dominant**
  one and ignore the rarer reasons (#2, #3, …) unless the dominant one is fixed and they
  still surface in CI. Do **not** rabbit-hole on a lower-frequency reason — that is the most
  common way this loop wastes its 3 attempts. (Capture the ranked reasons in the state file
  during Phase 0 so each attempt re-grounds on #1.)
- Read the spec, focused on the failing test, its `describe`, and any `before*`/`after*`
  hooks. Read shared helpers it calls.
- Apply the flake anti-pattern checklist (from the `e2e-test-review` skill, as a mental
  model — don't invoke it):
  - numeric `cy.wait(<ms>)` instead of waiting on an alias
  - `cy.intercept` registered **after** the action that triggers the request
  - `.should("not.exist")` / negative assertions without a positive anchor first
  - unscoped text selectors that can match more than one element
  - off-by-one `.last()` / `.eq(-1)` without a length assertion
  - JS conditionals on `cy` chains (no retry semantics)
  - shared state / ordering assumptions between tests
- Fold in any failure detail from the Linear issue (and, on attempts 2–3, the downloaded
  CI artifacts from the previous attempt).
- Write a **concrete hypothesis** to the state file's Attempts log before editing code.

## Phase 2 — Fix on a branch

- On **attempt 1 only**, create the branch (dashes only, no `/`):
  ```bash
  git switch -c fix-flake-<DEV-id-or-test-slug>
  ```
  Record it in the state file. On later attempts, keep committing to the same branch.
- Apply a **minimal** fix:
  - **Default:** test-scoped (deterministic waits via `cy.intercept` + `cy.wait("@alias")`
    before asserting; positive anchor before a negative assertion; scoped selectors).
  - **Source code is allowed** only when you have **high conviction** the root cause is a
    real product defect the test merely surfaces (e.g. a genuine race or non-deterministic
    ordering). When you do, write the evidence for that conviction in the state file and
    keep the **blast radius minimal**.

## Phase 2.5 — Share the diagnosis on Linear (offer before pushing)

- Once you have a confirmed root cause and a fix in hand, **before** the push/CI gate,
  offer to post the **debugging story** as a comment on the Linear issue. Draft it and
  show it to the user; post via `mcp__linear__save_comment` only if they accept (let them
  edit first). Keep it a tight narrative: the observed failure, the root cause (why the
  request never fires), and the fix. Skip silently if there's no Linear issue (spec/test
  fallback path).
- This is a separate, earlier offer from the Phase 5 PR/closeout comment — the value here
  is capturing the *why* while it's fresh, independent of whether CI later confirms.

## Phase 3 — Push + stress (burn_in=50, fail_fast=true)

**One run, `fail_fast=true`, does both jobs.** A bad fix fails on the **first** iteration
and stops immediately (fast red + artifacts) — no need for a separate cheap sanity stage.
A good fix runs all 50 to green (full confirmation). So every attempt is a single pair of
runs at `burn_in=50` with `fail_fast=true` (throttle on + off).

- **Approval gate (once per run).** If `pushes_authorized: no`, ask the user now, showing:
  branch name, spec, test name (grep), `qa_db`, edition, and the plan (≤3 attempts; each =
  a pair of `burn_in=50, fail_fast=true` runs, throttle on + off). On approval, set
  `pushes_authorized: yes` in the state file. This OK covers all later pushes/triggers this
  run — do not re-ask.
- Commit and push (first attempt only creates the branch; later attempts push the revised
  fix), then trigger.

### Trigger helper
**Always `git push` and confirm the remote branch is at your new commit BEFORE triggering.**
`gh workflow run --ref <branch>` resolves the ref on GitHub's side at dispatch time, so a
trigger that races an in-flight push will run the *previous* commit. After triggering,
verify with `gh run view <id> --json headSha` and re-trigger if it's stale.
```bash
git add -A && git commit -m "Fix flaky test: <test name>"
git push -u origin <branch>          # PUSH FIRST — then trigger
TRIGGERED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
for throttle in true false; do
  gh workflow run e2e-stress-test-flake-fix.yml --ref <branch> \
    -f spec="<spec path>" \
    -f grep="<exact test name>" \
    -f burn_in="50" \
    -f mb_edition="ee" \
    -f qa_db="<true|false>" \
    -f enable_network_throttling="$throttle" \
    -f fail_fast="true"
done
```
- **Capture both run IDs**, then **verify each `headSha` matches your pushed commit**:
  ```bash
  gh run list --workflow=e2e-stress-test-flake-fix.yml --branch <branch> \
    --json databaseId,status,createdAt,event,headSha --limit 10
  ```
  Save both run IDs + URLs to the state file, tagged `throttled` / `unthrottled`.

## Phase 4 — Wait + interpret (gh only)

- **Auto-poll** with `ScheduleWakeup` (~1200s cadence; setup alone is ~15–20 min) until
  **both** runs leave `queued`/`in_progress`. Pass the same `/fix-flaky-test $ARGUMENTS`
  back so the loop resumes; re-read the state file on each wake (a manual wake must also
  work). Don't poll faster than ~1200s.
- When both finish, read each conclusion:
  ```bash
  gh run view <id> --json status,conclusion
  ```
  - **Either `cancelled`** → assume a **human cancelled** it. Stop the whole task
    immediately — do **not** retry, do **not** open a PR. Note it in the state file and
    hand back. (A `cancelled` conclusion means manual cancellation; a `timed_out`
    conclusion does **not** — treat `timed_out` like a failure below.)
  - **Either `failure` / `timed_out`** → fix is not holding (`fail_fast` stopped at the
    first bad iteration, so the artifact is fresh and minimal):
    ```bash
    gh run download <failed-id> --dir local/claude/flake-fix/<id>-artifacts
    ```
    The Cypress error lives in the GitHub step log (`gh run view <id> --log-failed`) and the
    screenshots/video — **not** in `logs/test.log` (that's only the backend health log).
    Read the failure screenshot(s) (vision) and the step-log error; append findings to the
    state file; increment `attempt`. If `attempt < 3` → loop back to **Phase 1** with the
    new evidence. If `attempt == 3` → Phase 5 (exhausted).
  - **Both `success`** (all 50 iterations passed, both throttle modes) → fixed → Phase 5.
- Don't worry about CI cost.

## Phase 5 — Conclude

- **Fixed** — open a PR (the upfront OK already authorized the push; don't re-gate):
  ```bash
  gh pr create --title "Fix flaky test: <test name>" --body "<body>"
  ```
  **The PR can NEVER auto-merge** — it always requires at least one human approval, no
  matter how green the stress runs are, and never enable auto-merge. A passing stress run is
  *necessary but not sufficient*: it proves the test is stable, not that the root cause was
  fixed rather than masked. The human owns the merge decision.
  The PR description **must follow this exact order**: (1) the **first line is ALWAYS
  `Resolves <DEV-####>`**, then (2) the root cause / fix / stress-test sections. The PR body
  **must always include both stress-test runs** as links with their pass results:
  ```markdown
  Resolves <DEV-####>

  ## Root cause
  <one paragraph>

  ## Fix
  <what changed and why; note if source code was touched and the blast radius>

  ## Stress test (burn_in=50, single test via grep)
  - ✅ network throttling ON:  <run URL>
  - ✅ network throttling OFF: <run URL>
  ```
  That `Resolves <ID>` reference (in the **PR description only — NEVER in a commit message
  or body**, which would reopen the issue) closes the Linear issue **on merge**, via
  Linear's GitHub integration. **NEVER close the Linear issue or change its status yourself**
  (no status edits via the Linear MCP — only comments). Linear moves it to *In Progress* when
  the PR links and to *Done* when the PR merges. Comment the outcome on the issue (link the
  PR), and leave a copy-pasteable summary inline AND in `local/claude/`.
- **Exhausted (3 attempts)** — do **not** guess further. Report each hypothesis tried, the
  fixes attempted, all 6 stress-run links, and where the artifacts are. Hand back for human
  judgment.

- **Always — attach the run log to Linear (regardless of outcome).** As the final step on
  both the fixed and exhausted paths, post the full state file
  `local/claude/flake-fix/<id>.md` to the Linear issue as a comment titled
  **"🤖 Flake-fix run log (audit trail)"** (fence it so it renders verbatim). This is the
  end-to-end audit trail — every hypothesis, fix, commit, run URL, and verdict — kept for a
  human reviewer and as a learning artifact even when the fix didn't land. Skip only on the
  no-Linear fallback path. (Posting the markdown as a comment is sufficient; a file
  attachment via `mcp__linear__create_attachment_from_upload` is optional if the user wants
  a downloadable file.)
