# Lint-Fixer Bot — Design

**Date:** 2026-05-19
**Status:** Approved, pending implementation plan

## Problem

Trivial lint failures on PRs (clj-kondo warnings, Eastwood, eslint, formatting,
type errors) currently require a human to check out the branch, run the fixer,
and push. This babysitting is annoying and disproportionate to the value of the
fix. We want an agent that auto-fixes lint failures on PRs so the author never
has to touch them.

## Goals

- Auto-fix lint failures on internal/team PRs with no human intervention.
- Opt-in per PR — no surprise commits on PRs that didn't ask for it.
- Cover everything the lint CI gates on, including judgment-call failures
  (kondo/Eastwood warnings, non-auto-fixable eslint rules, type errors).

## Non-Goals

- External-contributor / fork PRs (force-push to forks is fragile; out of scope).
- Fixing non-lint CI failures (test failures, build failures).
- Retrying indefinitely until green — one attempt per failure.

## Architecture

A single new GitHub Actions workflow, `.github/workflows/auto-fix-lint.yml`,
forked in shape from the proven `resolve-backport-conflicts.yml`. Pure-Claude:
Claude runs the linters and fixes the failures directly; there is no separate
deterministic auto-fix phase (Claude may still invoke `eslint --fix`, `oxfmt`,
`cljfmt`, `fix-unused-requires` as tools when convenient).

### Trigger

`on: check_run: types: [completed]`.

The job runs only if **both** conditions hold:

1. The completed check's `conclusion == 'failure'` and its name is one of the
   in-scope lint checks (see below).
2. The PR associated with the check head SHA carries the `auto-fix-lint` label.

Effect: the PR author opts in **once** by adding the `auto-fix-lint` label.
After that, the bot fires automatically whenever a lint check fails on that PR.
No manual re-trigger.

A `workflow_dispatch` trigger (input: PR number) is also provided for manual
runs and debugging.

### In-scope lint checks

| Area     | Linter         | Command                              |
|----------|----------------|--------------------------------------|
| Backend  | clj-kondo      | `./bin/mage kondo`                   |
| Backend  | Eastwood       | (as run by `backend.yml`)            |
| Frontend | eslint         | `bun run lint-eslint`                |
| Frontend | oxfmt format   | `bun run lint-format`                |
| Frontend | stylelint      | `bun run lint-css`                   |
| Frontend | yamllint       | `bun run lint-yaml`                  |
| Frontend | tsc type-check | `bun run type-check`                 |

The exact GitHub check-run names (e.g. `Clj-Kondo`, the Eastwood job names, the
frontend lint job name) must be enumerated during implementation by inspecting
`backend.yml` and `frontend.yml`; the workflow matches `check_run.name` against
that explicit set.

### Run scope

Once triggered, the bot runs **all** in-scope linters (not just the one that
failed) and fixes everything, so multiple failing checks are resolved in a
single push. This accepts the slower Eastwood run (~5-10 min, full classpath
compile) as the cost of one-push completeness.

### Flow

1. `check_run` completed event arrives. Guard step resolves the PR for the head
   SHA, checks the failing check is in-scope and the PR has the `auto-fix-lint`
   label. If not, the job exits early (no-op).
2. **Loop guard:** if the PR's current HEAD commit is already a bot commit
   (`Fix lint` by `Metabase bot`), skip. The bot gets one attempt per failure;
   it never retries its own commits. This prevents runaway loops.
3. Checkout the PR head branch using the automation user token
   (`METABASE_AUTOMATION_USER_TOKEN`). Branches live on `metabase/metabase`
   (internal PRs only), so a normal push works.
4. `prepare-backend` + `prepare-frontend` actions; build CLJS
   (`bun run build-pure:cljs`) — required for kondo, eslint, and tsc.
5. Generate the bot GitHub App token (`METABASE_BOT_APP_ID` /
   `METABASE_BOT_APP_PRIVATE_KEY`).
6. Run `claude-code-base-action@beta` with:
   - A tight prompt instructing Claude to run all in-scope linters, fix every
     failure, re-run to verify clean, then stage and commit as `Fix lint`.
   - An allowlist of tools: `Read,Edit,Write,Glob,Grep` plus scoped `Bash` for
     `git`, the linter commands, and the auto-fixers.
   - A `--disallowedTools` entry blocking `git push --force` and `rm -rf`.
   - `max_turns` ~50.
7. The **workflow** (not Claude) does the `git push` — a regular push, never a
   force-push, to avoid clobbering the author's unpushed work.
8. Comment on the PR:
   - **Success:** "Lint fixed and pushed" + commit link + changed-files list.
   - **Partial/failure:** "Couldn't fully fix lint" + what linters are still
     failing, so a human can take over.

### Concurrency

A `concurrency` group keyed on the PR number, so two lint failures landing
close together don't race two pushes; the later run cancels/queues behind the
earlier.

## Error handling

- Claude cannot get linters green → workflow pushes nothing, posts a "still
  failing" comment listing the unresolved linters.
- `max_turns` exceeded → treated as partial failure; same "still failing"
  comment, mentioning the turn cap.
- Guard conditions not met → silent no-op (job exits early, no comment).
- Claude crashes / action fails → "auto-fix failed" comment, manual resolution.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Runaway trigger loop (bot push → CI re-runs lint → re-trigger) | Loop guard: skip if HEAD is already a bot commit. One attempt per failure. |
| Force-push clobbers author's unpushed work | Workflow does a regular push only; `--force` is in the disallowed-tools list. |
| Bot acts on PRs that didn't opt in | Hard label gate (`auto-fix-lint`) on every run. |
| Concurrent runs racing pushes | `concurrency` group keyed on PR number. |
| Bot makes a bad "judgment-call" fix | Author reviews the `Fix lint` commit like any other; comment links it explicitly. |
| External-contributor forks | Out of scope; internal PRs only (branches on `metabase/metabase`). |

## Files

- **New:** `.github/workflows/auto-fix-lint.yml` — the entire feature.
- No other files. Bot app token, automation user token, and the `prepare-*`
  composite actions already exist and are reused.

## Open implementation details (resolve while writing the plan)

- Exact `check_run.name` strings for each in-scope lint job.
- Whether the frontend lint is one combined check or several.
- Which `secrets.ANTHROPIC_API_KEY_*` to use (reuse an existing one or request
  a dedicated key, as `resolve-backport-conflicts.yml` did).
