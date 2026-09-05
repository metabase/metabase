# admin/remote-sync.cy.spec.ts → tests/remote-sync.spec.ts

Source: `e2e/test/scenarios/admin/remote-sync.cy.spec.ts` (1022 lines).
New helper module: `support/remote-sync.ts`.

## Result

- 26 tests ported, issue numbers kept exact (#65653, metabase#72752, plus the
  GHY-3747 close-modal note).
- **16 run for real on the jar (slot 4): 32/32 pass under `--repeat-each=2`.**
  Those are the admin-settings (5), read-only (2), and shared-tenant (9)
  describes — default snapshot + a LOCAL file:// git repo + the EE token.
- **10 gated on `PW_QA_DB_ENABLED` and skip on the jar** (20 skipped under
  `--repeat-each=2`): the "read-write Mode" describe (8) and "initial pull
  conflict handling" (2), because both restore the `postgres-writable`
  snapshot. Verified that snapshot is **gitignored / not generated in CI**
  (`git check-ignore e2e/snapshots/postgres_writable.sql` → IGNORED), so
  `restore("postgres-writable")` would 404 in CI even though it returns 204 on
  my machine — the gate is the correct call.
- tsc clean.

## Git-sync is NOT infra-gated (local file:// repo, in-process)

Same pattern as `support/snippets.ts`: `setupGitSync()` builds a throwaway git
repo under `$TMPDIR` with `node:child_process`, the backend clones
`file://…/.git`. No external git server. The remote-sync endpoints turned out
to be gated by a **premium feature** (PUT `/api/ee/remote-sync/settings` 402s
without a token — the brief's ":feature :none" is slightly off), but the
`pro-self-hosted` token the jar activates covers it, so no infra gate is needed.

## Opportunistic local verification of the gated read-write describe

Because `postgres-writable` restores fine locally and the read-write tests only
touch the sample DB + git (never the writable postgres), I ran that describe
with `PW_QA_DB_ENABLED=1`: **8/8 pass locally.** This exercises the git
**push/pull** path end-to-end (create branch, push, switch branch, force-push,
stash-to-branch, discard) — the exact surface `snippets.ts` never covered (it
only did read-only import). It won't run in CI (snapshot absent) but the port +
helper logic are proven sound. The "initial pull conflict handling" describe
stays runtime-unverified: it drives the writable QA postgres (`queryWritableDB`
CREATE TABLE, `resyncDatabase`) and that container is down (:5404). Faithful
by construction, like transforms-codegen.

## CI-robustness fix vs support/snippets.ts (its read-only git-sync just failed CI)

**Likely snippets.ts CI failure cause + the fix I applied here:** snippets.ts
does a bare `execFileSync("git", ["init", repoPath])`. On a CI runner with no
global `init.defaultBranch`, `git init` creates branch **`master`**, but the
sync settings configure `remote-sync-branch: "main"` — so the import finds no
`main` ref and fails. My `setupGitSync()` forces the branch with
`git branch -M main` **after** the first commit (works on every git version,
unlike `git init -b main`, which git < 2.28 rejects), and additionally sets
`commit.gpgsign=false` so an inherited signing config can't break the commit on
a signing-less runner. **Recommend applying the same two lines to
`support/snippets.ts setupGitSync` to fix its CI failure.**

## Fixes classified (feedback loop)

- **Known gotcha (harness auth model):** the admin-settings `beforeEach`
  faithfully mirrored Cypress's activate-token-**before**-signIn order. Cypress's
  `cy.request` rode an implicit cookie session; the Playwright `api` client only
  sends `X-Metabase-Session` after `signIn`, so the token PUT ran session-less,
  silently failed (`failOnStatusCode:false`), the feature stayed off, and every
  admin-settings call 402'd. Fix: sign in first (same effective state). Worth a
  brief line: **when porting a `beforeEach` that activates a token / hits an
  admin API before `cy.signInAs*`, reorder the signIn first** — the Cypress
  ordering only works because of implicit cookies.
- **Known gotcha (rule 3 / strict mode):** `getByLabel("Sync branch")` also
  matched the "Auto-sync with git" switch (substring label match). Used
  `getByRole("textbox", { name })` — `findByLabelText` was exact upstream.
- **Port bug (mine):** `getPushOption`/`getPullOption` must OPEN the git-sync
  menu first (Cypress's `ensureGitSyncMenuOpen`). I'd returned the bare option
  locator, so the post-push `data-combobox-disabled` assertion found nothing
  once the menu had closed. Made both helpers `async` and menu-opening.

## Migration dividends

None — no product bug surfaced; the git push/pull path (previously untested by
the Playwright spike) now has passing local coverage, and the snippets.ts CI
git-init bug was diagnosed with a concrete fix.
