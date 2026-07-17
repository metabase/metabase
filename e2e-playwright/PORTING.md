# Porting playbook

The living process doc for porting Cypress specs. **Feedback loop rule:
every fix made while stabilizing a port gets classified and fed back:**

- *Known gotcha* (below) → the port should have avoided it; if an agent
  missed it, tighten the brief.
- *New gotcha* → add it to this file with the fix pattern.
- *Migration dividend* (bug found, test strengthened, Cypress-masked issue)
  → add it to FINDINGS.md in the same PR.

## The fidelity cross-check — do this before claiming anything

**Never `test.fixme` a test or claim a product bug without running the
original Cypress spec against the same backend** (`MB_JETTY_PORT=<slot port>`,
no port-4000 contact) and comparing:

- Same tests fail at the same assertions → the port is faithful and the
  behaviour is real. This is the strongest evidence we can produce.
- Different results → your port drifted. It's your bug, not the app's.

This rule exists because we published a product-bug finding that didn't
survive it. FINDINGS #24 claimed a card-tag rewrite "never fires"; re-checked
against the CI uberjar, it fires fine — a *different code path* (the question
loading dirty, so the QB runs `/api/dataset` instead of the card endpoint) had
masked the request we were watching for. The absence of a request you expected
is evidence about **your wait**, not about the app. Two claimed bugs, retracted.

Corollaries:
- An empty/odd field in an API response is not a bug until you can name the
  user-visible breakage or the contract it violates.
- Prefer instrumenting the actual code path over inferring from a missing
  network call.
- State what you did **not** verify. Scope caveats are part of the finding.

## Write findings as you notice them

Write each `findings-inbox/<spec>.md` entry the moment you spot it — never
batch them to the end of the port. Nine agents once died on a usage limit
mid-wave and every unbatched finding they'd seen was lost with them. The only
lead that survived did so because the agent happened to narrate it out loud.

## Port rules (mechanical)

1. `findByText`/`findByLabelText`/`findByRole(r, {name})` with **string**
   arguments are EXACT matches in testing-library → always `{ exact: true }`
   in Playwright (its string matching is case-insensitive substring).
   `cy.contains(str)` is case-sensitive substring → case-sensitive regex.
2. `cy.intercept().as("x")` + `cy.wait("@x")` → register
   `page.waitForResponse(predicate)` BEFORE the triggering action, await
   after. Match on `new URL(response.url()).pathname` + method. Drop
   never-awaited intercepts (note it in the spec header).
3. Strict-mode multi-match: prefer scoping; else `.first()` with a comment.
   Cypress first-match semantics (`.prop`, `.contains`) = `.first()`.
4. Elements that appear on hover (row ellipses, card actions): hover the
   container first. Mantine Switch: click the `role="switch"` input
   (`{ force: true }`), not the label. `findByDisplayValue` → value comes
   from placeholder? use `getByRole("textbox", { name })`, not `getByLabel`.
5. CodeMirror/keyboard: click to focus, then `page.keyboard.type()` /
   `pressSequentially` — no realPress machinery. Typeahead/search boxes
   need real keystrokes (`pressSequentially`), not `fill()`, when the test
   depends on debounce/dropdown behavior.
6. Snowplow helpers → no-op stubs with a TODO block. `@external`-tagged
   content (QA DBs) → `test.skip` gated on `QA_DB_ENABLED`.
7. EE/token: `mb.api.activateToken("pro-self-hosted")`;
   `test.skip(!resolveToken("pro-self-hosted"), ...)` for gated describes.
8. Full-app embedding (`visitFullAppEmbeddingUrl` in Cypress) → the iframe
   harness in `support/search.ts`; ALWAYS pass `mb.baseUrl` (never the
   static BASE_URL — it breaks under per-worker backends).
9. New helpers go in a domain module; check existing `support/*.ts` export
   lists first (notebook, dashboard, dashboard-cards, charts, native-editor,
   sharing, downloads, metrics, joins, permissions, organization, search,
   custom-column). Parallel agents: never edit shared files — new module
   per agent, consolidation pass afterwards.
10. `test`/`expect` from `../support/fixtures`; `import type` for Playwright
    types; specs run from `e2e-playwright/` only (running Playwright or tsc
    from the repo root OOMs).

## Environment facts

- `mb.restore()` handles snapshot restore + search-index readiness
  (poll + force-reindex). Don't add manual index waits.
- Auth: `mb.signIn*` uses snapshot-cached sessions; users outside the
  `USERS` map exist in the login cache (see `signInWithCachedSession`).
- Tokens come from repo-root `cypress.env.json` (NOT `.env` — stale).
- Local runs need the dev backend (`node e2e/runner/start-backend.js`) and
  the rspack hot server (`bun run build-hot:js`). If the whole UI goes
  blank / mass-fails: check `curl :8080/app/dist/app-main.hot.bundle.js`
  — rspack drops assets after failed rebuilds; restart it. Long-lived
  `--hot` backends degrade after hours; restart between big sessions.
- CI: jar backend + static assets; matrix runs workers [1, 2] with
  per-worker backends on the w2 leg.

## Batch process

1. Pick 6-8 specs sweeping different directories; check sizes; skip specs
   needing containers we don't run (maildev/snowplow/QA DBs) unless the
   batch is about adding that support.
2. If the batch clusters in one domain, port the shared helper surface
   FIRST (like `support/notebook.ts`), then fan out agents.
3. Agents write ports + typecheck only (shared backend — the orchestrator
   runs tests serially and applies fixes). Exception: an agent reworking
   its own spec can get exclusive backend use.
4. Per spec, record in README's metrics table: size, tests, fixes needed.
   Classify every fix per the feedback-loop rule at the top.
5. Batch green locally (each file + one full-suite run) → commit → push
   (never while a CI run we care about is still going) → watch matrix.

## Gotchas added in wave 5

- **EditableText fields** (question title, description): `fill()` doesn't
  mark them dirty — click + `pressSequentially` + blur, and anchor on the
  PUT response. Accessible name may come from placeholder → `getByRole`,
  not `getByLabel`.
- **HTML5 dnd**: use `collections.ts dragAndDrop` (dragstart → dragenter →
  dragover → drop → dragend with real coordinates). Never port the bare
  Cypress 3-event sequence.
- **@OSS-tagged specs**: gate with `isOssBackend(mb.api)` skip (see
  embedding-smoketests / admin-authentication) — the spike backend is EE.
- **Pinned-card icons appear twice** (item icon + type icon) — `.first()`.
- **cy.wait after non-triggering clicks**: check what actually fires the
  request (cy.wait consumes past responses; waitForResponse doesn't).
  Register at the true trigger.
- Hash/URL assertions that Cypress retried (`location().should`) must be
  `expect.poll` in Playwright — one-shot checks catch transient states.
- **Native parameter widgets duplicate their accessible name** on the wrapper
  div and inner textbox — `getByLabel` can resolve the div; use
  `getByRole("textbox", { name })` for widget inputs.
- **React-flow canvas nodes** can legitimately sit outside the window (the
  camera decides placement). Cypress fires events regardless; the faithful
  equivalent for node clicks is `dispatchEvent("click")`.
- **One test-runner at a time on the shared backend** — including the
  orchestrator's own runs. Concurrent playwright invocations both restore()
  and corrupt each other. Kill/finish any background run before starting
  another (the coordinator has now made this mistake twice).
- **Porting agents must run verification in the FOREGROUND.** A backgrounded
  run leaves the agent waiting on a notification that never arrives, so it
  ends its turn silently and the slot stalls until the orchestrator resumes
  it. Two agents lost ~30 minutes each this way.
- **dnd-kit drags of elements clipped by a scroll container**: real mouse
  can't press on clipped coordinates — use the synthetic MouseEvent
  sequence (`moveDnDKitElementSynthetic` in question-settings.ts; fold into
  dashboard-cards.ts at consolidation). Real-mouse `moveDnDKitElementOnto`
  stays the default for visible targets.
- **Editor autocomplete on slow CI**: fixed debounce sleeps aren't enough —
  wrap the completion assertion in a toPass loop that re-nudges by retyping
  the last character (see native-subquery.spec.ts).
- **Mixed-content text nodes**: testing-library exact `findByText` matches an
  element's direct text nodes; Playwright exact getByText compares full
  element text. When the target text has inline element siblings ("Slack is
  not configured. <a>Set up Slack</a>"), exact → case-sensitive substring
  regex instead.
- **Snapshots go stale after schema migrations**: restore only auto-migrates
  under is-dev?, which e2e-mode backends never set — after pulling a
  migration, regenerate e2e/snapshots (`node e2e/runner/run_cypress_ci.js
  snapshot --expose grepTags="-@external"`) or restores silently serve the
  old schema (Cypress fails identically).
- **Rename-collapses-navbar applies to ANY EditableText title** (dashboards
  too, not just questions) — use the toPass open+assert loop.

## Continuous dispatch (supersedes the wave model)

- The orchestrator dispatches from QUEUE.md (largest-first); a freed slot
  immediately gets the next spec. Push checkpoints every ~10 landed specs.
- Read support/INDEX.md first instead of grepping support modules; if you
  add helpers, run `node scripts/build-helper-index.mjs`.
- Write FINDINGS-worthy items to findings-inbox/<spec>.md (own file, no
  shared-file contention); the orchestrator merges at checkpoints.
- Add your source spec's path to PORTED.txt when green (relative to
  e2e/test/scenarios/), then regenerate QUEUE.md.
- When target/uberjar/metabase.jar exists locally, slot backends boot from
  it automatically if you export JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar
  in your run env — ~25s boots instead of ~90s, and behavior matches CI.
# TODO: local jar build fails in :translations step (NPE, interactive prompt) — investigate later; slot backends stay source-mode meanwhile
- **Saved native questions run via /api/card/:id/query, ad-hoc via
  /api/dataset** — after saveQuestion the dataset wait never resolves; use
  the either-endpoint wait (native-filters-extras runNativeQueryEitherEndpoint).
- **Stale kept slot backends**: PW_KEEP_SLOT_BACKENDS persists backends
  across sessions; a "(reused)" line followed by mass-fails means restart
  that slot's backend before debugging specs.
- **Gate naming**: QA_DB_ENABLED leaks in from cypress.env.json (always true
  on dev machines); PW_QA_DB_ENABLED is deliberate. TODO: unify on
  PW_QA_DB_ENABLED once container specs are consolidated.
