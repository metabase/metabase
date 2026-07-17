# Porting playbook

The living process doc for porting Cypress specs. **Feedback loop rule:
every fix made while stabilizing a port gets classified and fed back:**

- *Known gotcha* (below) → the port should have avoided it; if an agent
  missed it, tighten the brief.
- *New gotcha* → add it to this file with the fix pattern.
- *Migration dividend* (bug found, test strengthened, Cypress-masked issue)
  → add it to FINDINGS.md in the same PR.

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
