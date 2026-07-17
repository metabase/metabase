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
no port-4000 contact) **with `--browser chrome`**, and comparing:

- Same tests fail at the same assertions → **the port is faithful**. That is
  all this proves. It does **not** show the behaviour is real (see below).
- Different results → your port drifted. It's your bug, not the app's. But
  first check the two harnesses really are on the same backend *state* — see
  the sample-DB re-point gotcha below, which silently pointed Cypress at a
  different database and made a faithful port look drifted.

This rule exists because we published a product-bug finding that didn't
survive it. FINDINGS #24 claimed a card-tag rewrite "never fires"; re-checked
against the CI uberjar, it fires fine — a *different code path* (the question
loading dirty, so the QB runs `/api/dataset` instead of the card endpoint) had
masked the request we were watching for. The absence of a request you expected
is evidence about **your wait**, not about the app. Two claimed bugs, retracted.

### The cross-check alone CANNOT tell you a behaviour is real

Both harnesses run against **one backend and one FE bundle**. A shared
environmental cause makes both fail identically while the app is fine — so
"Cypress fails the same way" is *not* evidence about the app.

This is not hypothetical. `dashboard-parameters` "should handle mismatch
between filter types" failed in **both** harnesses, at the same assertion, on a
**freshly booted** backend — and **passes on the CI uberjar**, with byte-equivalent
backend payloads. Identical FE source, opposite behaviour: the local rspack hot
bundle was the differing variable. Had we stopped at "Cypress agrees", we would
have shipped a second bogus product-bug claim.

**The decider for real-vs-environmental is a different ARTIFACT, not a second
harness on the same one.** Run it against the CI uberjar:

**A CI EE uberjar is already installed at `target/uberjar/metabase.jar`**
(from run 29569211972; `target/uberjar/COMMIT-ID` = `751c2a98`). It is gitignored.
So usually just:

```bash
JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar \
  PW_PER_WORKER_BACKEND=1 PW_SLOT_OFFSET=<slot> … bunx playwright test <spec>
```

To fetch a newer one (e.g. after master moves):

```bash
gh api repos/metabase/metabase/actions/runs/<run>/artifacts   # find the -uberjar artifact
gh api <archive_download_url> > jar.zip && unzip jar.zip      # target/uberjar/metabase.jar
```

Jar mode boots in ~2 min and serves the jar's **static** FE assets, so it tests
BE *and* FE free of the local dev build. Kill the slot's backend and `rm -rf
$TMPDIR/mb-pw-slot-<slot>` first so it doesn't reuse the source-mode one.

Note the jar is CI's **PR merge commit** (check `COMMIT-ID` in the artifact),
i.e. your branch merged into master-at-that-time — not your HEAD. Diff
`git log <merge-base>..origin/master -- frontend/ src/metabase/lib/` before
concluding a difference is environmental rather than an upstream change.

So: **fixme/bug claims need the jar.** The Cypress cross-check establishes
fidelity; the jar establishes reality. Both, in that order.

`--browser chrome` is not optional. Nothing in the runner or config picks a
browser, so `cypress.run()` defaults to **Electron** — comparing Electron
against Playwright's Chromium bakes an engine mismatch into our strongest
evidence. This repo has a documented class of bugs that reproduce only in
Chrome headless (hit-testing on Mantine tooltips via `realHover`, CDP keyboard
dispatch), so the engine is a live suspect whenever a cross-check disagrees
with CI. Chrome 150 is installed locally; CI's Cypress leg runs Chrome too.

### Cypress on a slot backend needs the sample-DB re-point, or it's invalid

Slot backends share **one H2 sample-database file** (`e2e/tmp/sample-database.db.mv.db`)
with every other JVM on the box (`:4000` included), and H2 embedded lets exactly
one hold it. The Playwright harness quietly works around this: `mb.restore()`
re-points database 1 at the slot's private copy (`support/fixtures.ts:104-116`).
**Cypress's `H.restore()` does not** — it leaves DB 1 on the shared file, and
every sample-DB query 500s with `Database may be already in use … [90020-214]`
("There was a problem displaying this chart").

The failure looks like the port drifted — Cypress dies *earlier and differently*
— when in fact the harnesses were pointed at different databases. Neutralise it
with a scratch support file that wraps `cy.H.restore` (`cy.H = {...H}` in
`e2e/support/commands.js`, so the spec's destructured `H` sees the wrapper) to
re-issue `PUT /api/database/1 {details:{db: <slot private url>}}` after each
restore — re-authenticate first, restore wipes the session. Slot private URL:
`file:$TMPDIR/mb-pw-slot-<slot>/sample-database.db;USER=GUEST;PASSWORD=guest`.
`Cypress.env()` is disabled in this repo (`allowCypressEnv: false`) — pass values
via `Cypress.expose()` / the config's `expose` map instead.

Corollaries:
- An empty/odd field in an API response is not a bug until you can name the
  user-visible breakage or the contract it violates. `card.parameters: []` on a
  dimension-template-tag card is **normal** — the jar returns it too, and the
  mapper works. Anything resting on that observation alone needs a new argument.
- Prefer instrumenting the actual code path over inferring from a missing
  network call.
- Read the code before believing a shape-mismatch story. "The BE returns MBQL5
  `["field",{opts},61]` and the FE reads `dimension[1]`" is superficially airtight
  (`Dimension.ts:25` really does read `[1]`) but **false**: `Lib.templateTags`
  converts dimensions back to legacy refs first (`lib/js.cljs`, `ref->legacy-ref`).
  This exact story has now been invented twice and retracted twice.
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
- **Anchor `saveDashboard()` on the change it saves** (the inverse of the
  above: the request is never fired *at all*). Adding a dashcard via the
  questions sidebar is async; Cypress's command queue paces the click and the
  next command apart, Playwright fires them back-to-back. Save can land before
  the card-add is applied → dashboard isn't dirty → Save exits edit mode
  **without the PUT** → `saveDashboard`'s waitForResponse burns 30s. Its own
  `expect(editBar).toBeVisible()` doesn't help (already visible → returns
  instantly). Fix: `await expect(getDashboardCards(page)).toHaveCount(n)`
  between the click and the save. Symptom is misleading — it throws inside the
  *shared, correct* helper, and sibling tests fail at unrelated assertions
  (e.g. a native editor that never renders) from the same root cause. Passes in
  isolation, fails in sequence — do not write it off as flake
  (dashboard-core: 2 tests, 1.7m → 34.9s once anchored).
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
- **Parallel agents share one scratchpad AND one worktree.** "Session-specific"
  is not "agent-specific". Two agents both redirecting to the obvious
  `scratchpad/run1.log` → the second's `>` truncates it while the first still
  holds an open handle, interleaving both runs into an unreadable file.
  Signature: the log suddenly shows *a different spec on a different port*, and
  the `✘` count **goes down** between polls (reads as flakiness — it isn't).
  Runs themselves are unaffected (separate slots = separate backends), but
  Playwright's shared `test-results/` gets wiped by a sibling, so traces and
  `error-context.md` vanish before you read them. Use
  `scratchpad/run-<spec>-slot<N>.log`, and `--output` when artifacts matter.
  Also: `git status` will show sibling agents' files — only touch your own.
- **Don't poll for a marker you never wrote to the log.**
  `cmd > run.log; echo "EXIT: $?"` sends the marker to the *task output*, not
  into `run.log` — so a `until grep -q "EXIT:" run.log` gate never fires. It
  looks like the run is hanging, and every such gate becomes an immortal
  `sleep` loop. One agent left **30** of them spinning and repeatedly
  mis-read "task completed, output file empty" as a harness quirk. Either put
  the marker in the log (`{ cmd; echo "EXIT: $?"; } > run.log 2>&1`) or gate on
  something Playwright itself writes (`^\s+[0-9]+ (passed|failed)`). Before
  finishing, `pgrep -f "until grep"` and reap your own — matching on *your*
  log filenames, since siblings' pollers look identical.
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

## Gotchas added in wave 9 (documents-comments)

- **A parked real cursor opens a tooltip that eats the next Escape.**
  Cypress's `.click()`/`.type()` are *synthetic*: the OS cursor stays where
  the last `realHover()` left it. Playwright's `.click()` moves the real
  cursor and leaves it parked, so content that renders under it opens a
  Mantine tooltip — and floating-ui's `useDismiss` calls
  `event.stopPropagation()` on Escape while any floating element is open
  (`escapeKeyBubbles` defaults false). The Escape dismisses the tooltip and
  **never reaches window-level handlers**; the second Escape works, which is
  what makes it look like an app bug. Before a keyboard Escape that must
  reach the app, park the mouse (`parkMouseAwayFromTooltips` in
  documents.ts). Applies to any window-level key handler, not just Escape.
- **Pace repeated key presses.** Every `cy.realPress` is its own Cypress
  command, so the original always had queue latency between presses;
  `page.keyboard.press` in a loop has none. ProseMirror then drops/coalesces
  selection updates and formatting marks land on the wrong words. Use a
  ~25ms cadence (the same one `realType` → `keyboard.type({delay})` uses).
- **Async-filtered suggestion lists: gate on the element the handler reads.**
  The emoji picker's Enter handler reads
  `[data-active] || [frimousse-row][aria-rowindex="0"] [data-emoji]` from the
  live DOM while frimousse filters asynchronously — so `:eggplant`+Enter
  picked a leftover match. Asserting the target is *somewhere* in the popup
  is NOT a gate (it can be present while row 0 lags). Find what the app's
  handler actually queries and gate on that exact element.
- **Some widget state has no DOM signal — re-nudge instead.** The emoji
  picker's first arrow key may be spent initialising navigation rather than
  moving (EmojiSuggestionExtension says so in a comment); nothing in the DOM
  distinguishes the two. Press-until-arrived in a `toPass` loop
  (`pressArrowUntilActive`), the same re-nudge pattern used for editor
  autocomplete.
- **Late `replace()` with a stale location can undo a navigation.** After
  creating a comment, `deleteNewParamFromURLIfNeeded` strips `?new=true`
  using the location captured at submit time — so leaving the route before
  the mutation resolves gets undone. Cypress's latency always covered the
  window. Gate on the *state the race corrupts* (the URL), not on the POST
  response: the dispatch lands a tick after the response.
- **Running the original Cypress spec for a cross-check needs snowplow-micro**
  if its `beforeEach` calls `H.resetSnowplow()` — otherwise the whole spec
  dies in `before each hook` in ~1s and looks unrelated to your change.
  `docker compose -f snowplow/docker-compose.yml up -d` (left running).
  Also, concurrent Cypress runs from other slots race the shared
  `example_custom_viz` tarball that `e2e/support/config.js` builds in
  `setupNodeEvents`; the config throws and the log interleaves another
  agent's spec name. Retry.
- **Cross-check invocation** (the fidelity rule's command shape):
  `MB_JETTY_PORT=410N GREP="<test name>" CYPRESS_RETRIES=0 bunx cypress run
  --browser chrome --config-file e2e/support/cypress.config.js --spec
  e2e/test/scenarios/<path>` — `@cypress/grep` is wired up, so you can run
  the single test rather than the whole file.
- **`have.attr` on a BOOLEAN attribute asserts presence, not value.** jQuery
  special-cases `disabled`/`checked`/`selected`/…: the getter returns the
  lowercased attribute *name* when present, so upstream's
  `should("have.attr", "disabled", "disabled")` passes against
  `<a disabled>` whose real DOM value is `""`. Playwright reads
  `getAttribute` and sees `""` → port as one-arg `toHaveAttribute("disabled")`
  (presence). Porting the pair literally yields a false failure.
- **`findByDisplayValue` matches input, textarea AND select.** Metabase's
  EditableText (question/dashboard titles) renders a **textarea**, so a
  port that scans only `input` finds nothing on exactly the titles this
  query is usually aimed at — and the empty result looks like "the page
  didn't load" rather than "wrong selector". See `expectInputWithValue` in
  support/interactive-embedding.ts.
- **`cy.icon(name).should("be.visible")` is an ANY-match, not an all-match.**
  chai-jquery's `visible` delegates to jQuery `.is(":visible")`, which is
  true if *any* element in the set matches. So a multi-match `cy.icon` +
  `be.visible` is satisfied by one visible icon → port with `.first()`
  (rule 3), not by scoping until the set is unique, which can tighten the
  assertion beyond upstream. (`.Icon-refresh` matches the QB header run
  button *and* the run-button-overlay.)
- **"The Cypress original fails identically" is only evidence on a QUIESCED
  box.** This cross-check is our main fidelity/product-bug test, and it has now
  produced three false product-bug claims (FINDINGS #2, #22, #24, all
  retracted). Two independent mechanisms make Cypress fail against a *slot*
  backend for reasons that have nothing to do with the app:
  1. **Shared sample DB.** Snapshots pin database 1 to the repo-shared
     `e2e/tmp/sample-database.db.mv.db`, and only one JVM can hold that H2
     file. `fixtures.ts` restore() re-points database 1 to the worker's private
     copy after **every** restore; **Cypress does not** — it never needed to.
     So with sibling slot backends (or dev :4000) up, Cypress gets
     `POST 500 /api/card/:id/query` → `Database may be already in use`. The
     page renders "We're experiencing server issues"; the *filter widgets
     render fine*, so it reads as "the query is broken".
  2. **Shared `site-url`.** Snapshots pin `site-url` to `http://localhost:4000`
     and nothing re-points it. Anything that round-trips through it — public
     download links (`/public/question/:uuid.xlsx` 302s to site-url), embed
     preview iframes — silently reaches for the **dev backend**, which 404s.
  Before believing a cross-check: check `GET /api/database` `details.db` and
  `GET /api/setting/site-url` on the backend under test, and `lsof` the shared
  H2 file. Run Cypress with `--browser chrome` (`cypress.run()` defaults to
  **Electron**, and this repo has a documented class of Chrome-headless-only
  bugs) and `MB_JETTY_PORT=<slot port>` (that env var is what sets Cypress's
  baseUrl — see `e2e/runner/constants/backend-port.js`).
- **`parameters: []` on an e2e-created card is NORMAL — never report it as a
  bug.** The Cypress `question()` helper passes `parameters` straight through
  to `POST /api/card` and never derives it, so any fixture that omits it stores
  `[]` by construction. Both sides derive from template-tags on purpose:
  `getParametersFromCard` falls back to `getTemplateTagParametersFromCard`, and
  the backend mirrors it in `queries/models/card.clj template-tag-parameters`,
  whose docstring says e2e tests are "sloppy about this so this is included as
  a convenience". `queries/card.clj` and `embedding_rest/api/common.clj` use
  the same fallback.
- **`download.url()` is a `blob:` URL.** The FE fetches the export and hands
  the browser a blob, so `download.url()` is `blob:http://host/<guid>` — never
  the API path. Assert `suggestedFilename()`, the *request* URL
  (`page.waitForRequest`), or the parsed file. A
  `toContain("/api/.../query/xlsx")` on `download.url()` can never pass.
