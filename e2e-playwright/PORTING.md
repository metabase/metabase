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

Running the original (two traps that cost a session ~40 min):

- **Grep the run to the single test.** `--env grep="…"` does **nothing** —
  `config.js` reads `config.expose.grep ??= process.env.GREP`, so use the
  `GREP` env var. An *un-grepped* full-file Cypress run is not a usable
  baseline: metrics-explorer mass-failed 17+ tests on one attempt and passed
  those same tests on the next, on a shared dev backend.
  ```bash
  MB_JETTY_PORT=410N GREP="the exact test title" bunx cypress run \
    --browser chrome --config-file e2e/support/cypress.config.js --spec <spec>
  ```
- **Snowplow-tagged specs need `snowplow-micro` up** (`snowplow/docker-compose.yml`,
  `:9090`) — it is *not* in "Local services the ports assume" because the ports
  stub snowplow to no-ops (rule 6), but the **original** `cy.request()`s
  `/micro/reset` in a `beforeEach` and `/micro/bad` in an `afterEach`. With the
  container down the entire describe dies in the before-each hook and looks
  catastrophic. Only the cross-check needs it.
- Don't leave the run unattended in a way that can be killed: a foreground
  poll loop that hits its own timeout takes the Cypress process down with it.
  Poll in short increments.

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

It has now happened **twice on unrelated specs**. `dashboard-filters-reproductions-1`
carried 6 `test.fixme`s on this same argument; all 6 pass on the jar (12/12 under
`--repeat-each=2`) and fail only on a local source-mode backend + hot bundle —
verified as a same-slot, same-box control, so the artifact is the only variable.
Four claims of this shape have now been retracted (#2, #22, #24, and those 6).
**Treat "the Cypress original fails identically" as a fidelity check and nothing
else — it is the single most reliable way we have found to fool ourselves.**

The cheap control that settles it: run the failing test on **both artifacts on
one slot** — jar (`JAR_PATH=…`), then kill it, `rm -rf $TMPDIR/mb-pw-slot-<N>`,
and re-run source-mode. Same box, same spec, one variable. And **verify the
backend you think you booted**: `ps` the port's PID, check
`/api/session/properties` → `version.hash` against `target/uberjar/COMMIT-ID`,
and check whether `/` serves hashed static assets or `:8080/*.hot.bundle.js`.
"I exported JAR_PATH" is not evidence when the artifact *is* the claim.

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

### Jar mode is the DEFAULT verification loop — not just the tiebreak

Verify every port against the jar from the start. Source mode (`--hot` rspack
bundle) is for debugging with source maps, not for deciding whether a test
passes.

Why, in order of weight:

1. **It's what CI runs.** A green source-mode run is not evidence about CI.
2. **Source mode manufactures false failures that look exactly like product
   bugs.** Five claims of this shape have now died — #2, #22, #24,
   `dashboard-parameters`' field-61, `dashboard-reproductions`' 12926 — across
   four independent specs. Each was real as an *observation* and wrong as an
   *inference*. In every case the Cypress cross-check agreed, because both
   harnesses share the one hot bundle.
3. **It's faster**: 1–3s per test vs 5–10s.

Consequence to accept knowingly: a handful of tests now pass in CI and fail on
a local `--hot` run. That's the right side of the trade — CI is the contract.

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
   **But `should("be.visible"|"be.hidden"|"be.checked"|"be.disabled")` on a
   multi-element subject is an ANY-of-set assertion, NOT first-match**:
   chai-jquery resolves it to `$el.is(":visible")` and jQuery's `.is()` is true
   when *any* element matches (Cypress swaps in its own visibility logic via
   `$.expr.filters.visible`, but keeps `.is()`'s any-semantics). Porting those
   with `.first()` silently *strengthens* the assertion and fails on innocent
   DOM. Port as "at least one match satisfies it" —
   `.filter({ visible: true }).first()`. Real case: ECharts renders two paths
   per series (line + symbol marker); a single-point series has a zero-extent
   line path (`d="M480.31 68.1"`) that Playwright rightly calls hidden, so
   `.first()` failed where upstream passed on the marker.
4. Elements that appear on hover (row ellipses, card actions): hover the
   container first. Mantine Switch: click the `role="switch"` input
   (`{ force: true }`), not the label. `findByDisplayValue` → value comes
   from placeholder? use `getByRole("textbox", { name })`, not `getByLabel`.
5. CodeMirror/keyboard: click to focus, then `page.keyboard.type()` /
   `pressSequentially` — no realPress machinery. Typeahead/search boxes
   need real keystrokes (`pressSequentially`), not `fill()`, when the test
   depends on debounce/dropdown behavior.
   **After the click, assert the editor actually took focus before typing** —
   `expect(editor.locator(".cm-content")).toBeFocused()` (or the `cm-focused`
   class check in `focusNativeEditor`). `page.keyboard.*` types at
   `document.activeElement` with no retry, unlike `cy.type()` which
   re-resolves its subject. Critical where the editor is **mounted lazily on
   focus** (MetricSearchInput renders collapsed pills until clicked, then
   mounts CodeMirror with `autoFocus` in an effect): `click()` resolves before
   the mount, the first keystrokes go to `<body>`, and the damage surfaces far
   from the cause — a dropped `+` became "2 pills, expected 1" and an
   unrelated mini-picker timeout.
6. Snowplow helpers → no-op stubs with a TODO block — **but ONLY where snowplow
   is incidental to the spec. If the events ARE the subject, capture them at the
   browser boundary instead (see "Capturing snowplow without micro" below);
   stubbing there makes every test a no-op.** `@external`-tagged content (QA DBs)
   → `test.skip` gated on `QA_DB_ENABLED`.
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
- **Never `git commit -a` / `git add -A` in a shared worktree — you will commit
  other agents' half-finished work under your message.** This has happened:
  commit `c9105405ada` *"land documents-comments"* also carries
  `dashboard-filters-reproductions-1.spec.ts | 12 ++++------` — another agent's
  in-progress `test.fixme` flips, swept up mid-investigation and committed under
  an unrelated message. It landed 6 un-fixme'd tests that, at that moment, no
  evidence yet supported. Signature from the *victim's* side, which is genuinely
  disorienting: `git diff` on your own file returns **empty** and `git status` is
  clean, while the file on disk plainly contains your edits — it reads as "my
  edit vanished" or "the tool is lying", when in fact someone committed it for
  you. Stage explicit paths, always.
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
- **Pace repeated key presses** — **but NOT with `press(k, { delay })`; that
  option does not do what this rule used to say.** Every `cy.realPress` is its
  own Cypress command, so the original always had queue latency between presses;
  `page.keyboard.press` in a loop has none. ProseMirror then drops/coalesces
  selection updates and formatting marks land on the wrong words.

  ⚠️ **CORRECTED 2026-07-20:** `keyboard.press(key, { delay })` is the
  **keydown→keyup hold duration**, not a gap *between* presses. Measured: five
  `ArrowDown`s with a delay advanced a completions selection by **2**. You need
  a real `waitForTimeout` after each press (or `keyboard.type({delay})`, where
  the option genuinely does pace successive characters). An earlier version of
  this bullet had the mechanism wrong.
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
- **`cy.icon(name).should("be.visible")` is an ANY-match** — another instance
  of rule 3's `.filter({ visible: true }).first()` case. `.Icon-refresh`
  matches the QB header run button *and* the run-button-overlay.
- **Playwright does NOT route the follow-up request of a redirect.** Verified
  with a control: a `page.goto` straight to a mocked origin hits the handler;
  the same URL reached via a 302 skips every handler (including a
  `() => true` catch-all) and goes to the real network. Cypress's proxy sits
  in front of every hop, so `cy.intercept` survives redirect chains and ours
  doesn't. Breaks any port that mocks a redirect-based external flow (JWT
  SSO, SAML, OAuth callbacks — anything using `req.redirect()`). Fix:
  `mockRedirectResponse` (support/interactive-embedding.ts) fulfils a 3xx as a
  document doing `location.replace(...)`, making the next hop a fresh, routable
  navigation. **In a port, `route.fulfill({ status: 3xx, headers: { location } })`
  is almost always a latent bug.** Failure mode is evil: the test that only
  waits for the *request* still passes (the mock never ran), and the others
  fail far downstream on a fully-rendered page.
- **`should("not.be.visible")` on a scrolled-away element ≠ `not.toBeVisible()`.**
  Cypress treats content clipped by an ancestor's overflow as invisible;
  Playwright's toBeVisible only checks box + `visibility`, so a scrolled-out
  element is still "visible" to it. Use **`not.toBeInViewport()`** whenever the
  mechanism is scrolling/clipping rather than `display:none`.
- **`cy.scrollTo(…, { duration })` is not `scrollTo({ behavior: "smooth" })`.**
  Cypress's is jQuery `.animate()` on `scrollTop` (plain JS). Ours sets
  `contextOptions.reducedMotion: "reduce"`, under which Chromium **skips the
  programmatic smooth scroll entirely** — `scrollTop` stays 0, nothing errors,
  and a later assertion takes the blame. Animate `scrollTop` across
  `requestAnimationFrame`s when the test depends on the scroll not being
  instant; otherwise assign `scrollTop` directly.
- **A list that re-renders under a resolved locator clicks the WRONG ROW.**
  React reconciliation *reuses* row nodes and swaps their text, so a locator
  resolved against a partially-loaded list points at a node that is still
  attached, still stable, still in place — and now says something else.
  Playwright's actionability checks catch elements that move or detach, not
  ones that *become a different thing*; Cypress's command queue paces clicks
  past the settle. Observed: clicking "Products" in the data picker selected
  People (`/api/table/6`, not `/7`). **Anchor on the response that populates
  the list** before resolving the row (never a sleep) — it's also faster
  (group: 3.6m → 1.9m). Suspect this for any picker/menu/search-result click.
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

## Gotchas added while porting click-behavior (wave 9, slot 1)

- **Snapshot `site-url` vs per-worker backends — read this before blaming the
  app.** Snapshots bake `site-url: http://localhost:4000`; slot backends run on
  :4101+. Metabase builds some navigations as ABSOLUTE urls from site-url
  (dashboard/question click-behavior destinations at least), so a click on a
  :4101 dashboard lands the browser on **:4000** — a different instance.
  `restore()` now re-points site-url at the worker's own origin (support/
  fixtures.ts), next to the sample-db re-point that solves the same class of
  problem. Symptoms: the pathname looks right and only the origin is wrong, so
  any assertion comparing pathname/search alone (e.g. an `expectLocation`
  helper) passes and the failure surfaces later as "the target page didn't
  render". **It reproduces identically under Cypress**, so the Cypress
  cross-check does NOT clear it.
  This is a **named, now-fixed instance of the shared-environmental-cause class**
  described under "The cross-check alone CANNOT tell you a behaviour is real" —
  the first one that is a *backend setting* rather than the FE bundle, and it
  fooled the cross-check on 11 tests at once. Worth knowing concretely, because
  unlike the bundle cases it is cheap to spot: check the origin, not just the
  pathname.
  **The fix has a cost — know it before you debug a mystery.** Slot backends now
  boot with `MB_SITE_URL` (`worker-backend.ts`), and env **beats the app DB**, so
  any test that *writes* `site-url` through the API or admin UI is silently
  defeated: the write "succeeds", the setting doesn't change, and the assertion
  fails somewhere unrelated. That's the sole fixme in `click-behavior.spec.ts`
  (33379) and it will bite any other spec that sets site-url. If you hit it,
  the test isn't wrong and the app isn't broken — the harness is overriding you.
- **Cypress's `create*` API helpers are not thin wrappers.** `H.createDashboard`
  holds `enable_embedding`, `embedding_type`, `embedding_params`,
  `auto_apply_filters` and `dashcards` back from `POST /api/dashboard` (which
  ignores them) and applies them with a follow-up PUT. Spreading `{...details}`
  into the POST looks fine — nothing errors — and only shows up much later as
  "Embedding is not enabled for this object". Read the helper's body before
  porting its signature.
- **`waitForResponse` resolves on ANY status, including 4xx/5xx.** A wait
  satisfied by a 400 makes the *next* wait time out, so the error blames the
  wrong step. When a response wait was the last thing that "worked" before a
  timeout, check the status of what it matched.
- **A `cy.wait` that follows a no-op action may be enforcing nothing.** Saving a
  dashboard with nothing dirty fires neither `PUT /api/dashboard/:id` nor
  query_metadata. Upstream calls `H.saveDashboard({ awaitRequest: false })` and
  then waits for query_metadata anyway — that wait is satisfied *retroactively*
  by an earlier response (cy.wait consumes past ones). Ported literally it
  hangs. `saveDashboard(page, { awaitRequest: false })` now skips both waits.
- **Callback-scoped assertions don't enforce.** `H.onNextAnchorClick(cb)`
  monkey-patches `HTMLAnchorElement.prototype.click` and asserts inside `cb`; if
  the callback never runs (or its throw is swallowed in app code) the test is
  green regardless. Port the hook but assert **outside** it — record the value
  and check it in the test body, so a never-invoked hook fails loudly. Doing so
  caught two upstream tests asserting an href the app never produces.
- **Rule 1 is about `findByText`, not `cy.contains`.** `cy.contains(str)` is a
  case-sensitive substring returning the first DOM hit; porting it as an exact
  match breaks as soon as a label shares an element with its value (a parameter
  widget reads "Text filter64", which no exact match hits). Upstream often
  disambiguates positionally — mirror that with `.first()`.
- **`findByDisplayValue` must include `textarea`** (and select). EditableText
  titles — question *and* dashboard — render a `<textarea>`, so an input-only
  scan finds nothing and burns the whole timeout. `dashboard-cards.ts
  inputWithValue` is input-only and is wrong for those fields (7 specs import
  it — consolidation candidate); `filters-repros.ts findByDisplayValue` is
  correct.
- **Stale chart-click coordinates**: the spec-local `clickLineChartPoint` clicks
  a circle's top-left *corner* to dodge d3's `g.voronoi`/`circle.dot` double
  click. Post-ECharts neither exists, the corner is over bare `<svg>`, and
  nothing is hittable there — verified by dispatching Cypress's own synthetic
  sequence at that exact point. Click the point itself. When a Cypress helper's
  comment names DOM that no longer exists, don't port the workaround.

## Gotchas added while porting documents (wave 9, slot 9)

- **Never select on a CSS-module class name — it's minified in the jar.** The
  dev (rspack) bundle names classes readably (`Foo-module__visible___xxxxx`);
  the production jar bundle minifies them to opaque tokens with **no stable
  substring** (measured: `AnchorLinkMenu`'s shown state was `vs_4B O6wZQ`, no
  `visible` anywhere). So `[class*="__visible"]` matches in source mode and
  matches **nothing** on the jar — a selector that is green locally and red in
  CI. This is the canonical case for the jar-mode-default rule; it was caught
  only by re-verifying on the jar. Select on `data-testid`, role, or the
  rendered style that actually drives the behaviour. For `AnchorLinkMenu`
  (shown via `opacity` alone, which Playwright's visibility ignores),
  `shownAnchorLinkMenu` resolves the `opacity === "1"` menu with `evaluateAll`
  inside an `expect.poll` — build-agnostic.

## Gotchas added in wave 10 (pivot_tables, embedding-dashboard, dashboard-cards/filters reproductions, column-compare)

- **Playwright refuses to click a descendant of an `aria-disabled` ancestor.**
  An enabled `ActionIcon` (no `disabled` prop, real `onClick`) inside a
  `Flex[aria-disabled=true]` is treated as disabled by Playwright's
  actionability; Cypress clicks it fine. When the aria state is the app's
  intent (verify in the component), use `click({ force: true })`. Distinct from
  the boolean-`disabled`-attribute gotcha.
- **Playwright's bundled Chromium ≠ Chrome for pixel/text metrics.** SmartScalar
  truncation is a JS text-measurement that lands on opposite sides of the
  boundary in bundled Chromium vs Chrome, so pixel-exact text/truncation
  assertions are engine-sensitive. The `--browser chrome` cross-check will pass
  while the Playwright (Chromium) run fails — that's an engine difference, not a
  bug or drift. `test.fixme` with the cross-check recorded; CI's Playwright leg
  uses the same Chromium so it can't be green there. Most tests don't care; only
  pixel-exact text ones do.
- **dnd-kit resize handles slide as you drag.** The handle's `left =
  initialWidth + transform.x`, so any approach that re-reads the handle position
  per pointer-move compounds the delta (a nominal +100 became +120). A
  fixed-coordinate drag lands short; real-mouse was flaky. Use a pointer helper
  that re-reads `boundingBox()` before EVERY synthetic pointer event
  (`moveDnDKitPointer` in pivot-tables.ts). Confirmed against `PivotTableCell.tsx`.
- **react-virtualized `ScrollSync` grids ignore a synthetic `scrollLeft`.**
  Setting `scrollLeft` doesn't drive the synced grids; use `hover()` +
  `mouse.wheel(dx, dy)` instead.
- **Mantine `Select` option rows can't be clicked even with `force`** (the text
  div isn't the click target). Open the select, then pick the `role="option"`.
- **Native-query error/pivot states render only after the query RUNS** — a bare
  hash `goto` of an ad-hoc native question shows nothing; use
  `visitNativeQuestionAdhoc` (autorun + runNativeQuery) so the error surfaces.
- **Another CSS-module vacuous assertion** (`IsSticky`, embedding #66742): the
  class is minified on the jar bundle, so a class-substring assertion is a
  no-op in CI — reinforces the "never assert on CSS-module class names; needs a
  data-* hook" rule.

## Gotcha: restore() can exceed the 30s default request timeout under w2 CI load

A snapshot `restore()` is heavy, and on a contended 2-worker CI runner it can
take >30s — Playwright's `APIRequestContext.fetch` default. (`actionTimeout`
does NOT apply to API fetches.) This surfaced as a flaky `beforeEach`
"apiRequestContext.fetch: Timeout 30000ms exceeded → POST
/api/testing/restore/default" on whichever spec happened to draw the slow slot
(navbar:128 on the wave-10 s4 shard — NOT a navbar bug). `api.restore()` now
passes an explicit 120s timeout. If you add other heavy testing-API calls,
give them an explicit `timeout` too — don't rely on the 30s default.

## Gotchas added in wave 11 (viz-tabular / multiple-column-breakouts / embedding / collections / actions)

- **ECharts SVG axis `<text>` carries leading/trailing spaces** (e.g. `" 1월 2027 "`),
  which breaks **anchored regexes**. Cypress's `findByText(/^1월/)` worked because
  testing-library trims first; a `^`/`\b`-anchored regex in Playwright matches
  nothing. Drop the anchors and match as a substring (or `.trim()` in an
  evaluate). (embedding-reproductions)
  ⚠️ **Scope corrected 2026-07-20:** an earlier version said "Playwright's
  `getByText` does NOT trim", which overreaches — **`getByText` normalizes
  whitespace even with `exact: true`**, so string matching is unaffected. The
  rule bites **regex matching only**. (viz-charts-reproductions)
- ⚠️ **`getByText(..., { exact: true })` is NOT equivalent to Cypress's exact
  match.** testing-library's `getNodeText` reads only an element's **direct child
  text nodes**; Playwright reads its **full `textContent`**, including text from
  nested elements. So an element whose label is split across child spans matches
  upstream but not the port. Measured on the setup flow: `exact: true` → **0
  matches**, `exact: false` → **1**, same element. If an exact-match locator
  finds nothing where the text is plainly on screen, this is the likely cause —
  **not** a product bug. (onboarding-setup)
- 🔴 **`e2e/snapshots/blank.sql` on this box is corrupt** (found 2026-07-20):
  it contains the fully-set-up `default` state — **11 users, 97 cards** — rather
  than a blank instance. `e2e/snapshot-creators/default.cy.snap.js` takes
  `snapshot("blank")` *before* `setup()`, so a correct one has no users at all.
  Proven with a same-backend control: `restore/blank` → `has-user-setup TRUE`,
  a freshly captured blank → `FALSE`, `restore/nonsense` → 404 (so the endpoint
  was live and the first two results are real).
  `e2e/snapshots/*` is **gitignored**, so this is a stale local artifact, not a
  repo defect — and it means **CI is unaffected**. Any spec needing a genuinely
  un-set-up instance will fail here in a way that looks exactly like port drift.
  **Do not regenerate snapshots while other slots are live** — all five share
  those files, and regenerating means running Cypress. Owed: regenerate
  `blank.sql` once the slots drain. (onboarding-setup)
- **`filter({ has: scope.getByText(...) })` breaks when `scope` is a Locator.**
  The `has` sub-locator gets re-anchored to the outer scope, not matched within
  each candidate row, so it never resolves (hover/click times out though the row
  is clearly present). Always build the `has` text locator from `page`, never
  from a Locator scope. (collections — openEllipsisMenuFor / checkbox select)
- ~~**Fully `@external`+`@actions` specs are all-skip in this setup.**~~
  ⚠️ **RETRACTED 2026-07-20.** This said such specs can never execute here,
  because the `${dialect}-writable` snapshots "aren't in the jar's snapshots and
  aren't generated in CI". Both halves are wrong. The writable QA postgres/mysql
  containers *are* available locally (`writable_db` on :5404/:3304), and
  `model-actions` runs **17 of 18 tests green** against them — the one skip is a
  correct `cy.onlyOn(dialect === "postgres")`. CI likewise provisions the
  containers and does not exclude `@external`; the snapshots are gitignored and
  generated **at CI time**, which is what the original claim misread.
  Run these with `PW_QA_DB_ENABLED=1`. The tier is real coverage, not
  faithful-by-construction — but see the shared-container hazards (#85) before
  touching it, and **always run a gate-OFF control** so you can quote executed
  vs skipped honestly rather than reading "correctly skipped" as "passing".
- ⚠️ **`toHaveText` NORMALIZES WHITESPACE.** `"\tSELECT\tFOO"` compares equal to
  `"SELECT FOO"`, so any assertion whose *subject* is indentation or formatting
  is silently vacuous — green while testing nothing. Use raw `textContent()`
  when whitespace is what's under test. Measured on the native editor's
  indentation tests, where `Tab`→`Space` mutants produced strings that are equal
  under normalization; both went red only because the port compared raw text.
  **Worth sweeping landed CodeMirror ports.** (native)
  (actions-on-dashboards: 33/33 gated)

## Gotchas added in wave 12 (filters/temporal/table/charts/visualizer/collections/custom-column/tabs)

- **ECharts pie/label hovers need `hover({ force: true })`** — the wedge's own
  `<text>` label overlays the path and intercepts the actionable hover (zrender
  hit-tests by coordinate). (viz-charts-reproductions)
- **`.type()` focuses the caret at position 0, not end** — so a `{backspace}`
  after pre-filled content deletes the wrong char ("1"+"{backspace}2" → "21").
  `press("End")` first (no-op on empty inputs). (dashboard-filters-reset-clear)
- **`page.clock.install()` does NOT freeze time** (unlike `cy.clock()`) — it
  ticks at real rate; `runFor` only adds jumps. Fine for wide-margin timeouts,
  but tight timer assertions drift by the real action time between ticks. Also:
  the app disables some test-only behaviour (e.g. toast TransitionGroup) only
  under `"Cypress" in window`, which Playwright never sets — so clock-precise
  toast-ordering tests can't port faithfully (fixme + cross-check). (auto-wiring)
- **`page.goBack()` restores Chromium's bfcache — the frozen DOM at nav time.**
  If a modal overlay was still mounted when you navigated away, the cached
  snapshot keeps it and its fixed overlay eats clicks after going back. Assert
  `modal` is gone (`toHaveCount(0)`) before any navigation whose history entry
  you'll `goBack()` to. (collections-trash)
- **Colliding negative dashcard ids across factory modules.** `getTextCardDetails`
  (dashboard-core.ts) and `getHeadingCardDetails`/`getLinkCardDetails`
  (click-behavior.ts) mint `-1, -2, …` from *independent* counters, so mixing
  them yields duplicate ids → `PUT /api/dashboard` 400 "ids must be unique".
  Reassign `id: -1 - index` when combining. (dashboard-tabs)
- **dnd-kit reorder drag swallows the next click.** After a synthetic reorder,
  the DOM order updates but the pointer sensor is still settling; an immediate
  click (e.g. Save) focuses but fires no request. Park the mouse off-target and
  wait ~1s. (dashboard-tabs, mirrors the dashboard-core tab-drag precedent)
- **Off-screen dnd-kit drag needs synthetic mouse events** — real-mouse
  `moveDnDKitElementOnto` silently no-ops when the destination is off-screen
  (e.g. `horizontal:-400`); use `moveDnDKitElementSynthetic`. Misleading
  fingerprint: the dead drag surfaces two steps later as a `visualize()`
  dataset `waitForResponse` timeout (unchanged query → cached results → no
  POST). When a dataset wait times out right after a reorder, suspect the drag.
  (custom-column-3)
- **`QA_DB_ENABLED` leaks truthy from `cypress.env.json`** on dev machines, so
  QA-DB describes gated on it wrongly RUN (and fail) locally. Always gate on the
  deliberate `PW_QA_DB_ENABLED`. (now enforced repo-wide — the bare var was
  unified to `PW_QA_DB_ENABLED` this wave.)

## Gotchas added in wave 13 (chart drill / line / pie / models / title-drill)

- **Cypress `.trigger("mousemove")` on a chart → a synthetic MouseEvent
  dispatch, NOT real `hover()`.** ECharts hit-tests the tooltip from the mouse
  coordinate; a data point on the plot edge (e.g. first point on the y-axis)
  resolves to nothing under a real hover, so no tooltip fires. Map
  `.trigger("mousemove")` → synthetic dispatch, `.realHover()` → real hover.
  (line_chart)
- **A chart click is swallowed while a drill popover is open.** Clicking a
  bar/point with a prior drill popover still open just dismisses it (Cypress's
  synthetic click reached the SVG regardless). `Escape` + assert
  `popover().toHaveCount(0)` before the next chart click. (chart_drill)
- **Pie drill fires on the wedge `<path>`, never the label `<text>`.** In
  zrender's SVG renderer thin-slice labels are leader labels placed off the
  wedge over bare SVG, so clicking the label — even a full synthetic sequence —
  never drills. Force-click the wedge path (see `pieSliceWithColor`). Also:
  multi-ring outer slices are colored by the parent-ring value, not the
  category, and hover emphasis mutates the fill — capture the target wedge as an
  elementHandle before hovering. (pie_chart)

## Consolidation priority: notebook.ts `startNewQuestion` is stale (flagged 3×) — RESOLVED

Three separate wave-12/13 ports (multiple-column-breakouts, chart_drill, models)
re-implemented `startNewQuestion` because the shared `notebook.ts` version clicked
the app-bar "New" (needs a loaded page) while current upstream `H.startNewQuestion`
navigates to `/question/notebook#<hash>` directly. RESOLVED in the consolidation
pass: `notebook.ts startNewQuestion` is now the URL-navigation form and the
duplicates were collapsed (along with the create* superset in `support/factories.ts`,
`support/dnd.ts`, `support/text.ts`).

## Gotchas & lessons added during continuous-dispatch waves (Opus, post-consolidation)

**🔴 `PW_KEEP_SLOT_BACKENDS=1` SILENTLY IGNORES `JAR_PATH` when the slot backend
is already up.** A reused backend prints `(reused)` and keeps whatever jar it
booted with — so setting `JAR_PATH` to a downloaded CI jar can leave you
verifying against the **stale local jar** while believing otherwise. This cost
one agent an entire evidence table, which it caught and redid. **Verify with
`ps` (or `version.hash` vs the jar's `COMMIT-ID`), never trust the env var** —
this is exactly why every port is asked to confirm the jar before reporting.
Kill the slot backend first when switching jars.

**To debug a CI-only failure: download the exact uberjar CI ran.** Pull it from
the failing run's artifact, boot a slot from it, and reproduce locally — this
turns "CI-only, can't reproduce" into an ordinary debugging loop and gives you a
before-red/after-green on the *same artifact*, which is far stronger than a green
on our stale local jar. Used to settle batch-15's `select-frequency` failure
(CI jar `COMMIT-ID e45bd0c9`), where it directly measured a control value
flipping between the two jars.

**CI builds a MERGE COMMIT — its jar contains master code your branch does not.**
This is worse than the sample-data drift below: it is stale *product code*. A
Jul-18 upstream commit moved the subscriptions sidebar onto the shared
`Schedule` component **and updated the Cypress spec in the same PR**; our branch
lacked both, so a faithful port of the pre-move original failed on CI and was
right to. Consequence: **a spec verified only against the local jar may be stale
against CI**, and long-lived branches make this worse over time. A fix matching
current master may legitimately fail on the local jar — document that in the
spec header rather than reverting it.

**Local verify-jar drift vs CI (IMPORTANT).** The local `target/uberjar/metabase.jar`
(COMMIT-ID 751c2a98) can carry OLDER sample data than CI's freshly-built jar.
`smartscalar-trend`'s `maxPeriodsAgo` clamp is derived from the sample DB's month
span → **47 on the stale local jar, 48 on CI/upstream**. A test pinning such a
data-derived value passes locally and fails in CI. The Chrome cross-check on the
SAME local jar confirmed 47 — proving port fidelity but blind to the skewed
environment. Rules: (1) don't pin data-derived magic numbers — assert the
*behaviour* (e.g. "over-max input clamps to a value in `[min, typed)`") not the
exact number; (2) treat a value only the local jar produces with suspicion;
(3) the cross-check validates fidelity, never the environment.

**Transient UI (toasts, tooltips) can leave a lingering duplicate → strict-mode
violation under CI load.** A fading-out toast/tooltip, or a Mantine portal that
renders a duplicate text node, means `getByText(exact)` on a toast/tooltip matches
2+ elements at assertion time. It passes locally (one element) and on a lightly
loaded shard, then fails only under CI parallelism — both batch-2 CI failures were
this (a "Document saved" toast and a "can't map to this parameter" tooltip). All
matches carry identical text, so assert `.first()` (or `.filter({visible:true}).first()`).
Default to `.first()` on any toast/tooltip text assertion in a loop or after a
repeated action.

**Duplicate `it`/test titles are a HARD LOAD ERROR in Playwright** (Cypress
tolerates them). The whole spec fails to parse; the error points only at the 2nd
declaration. Upstream has real dupes (create-queries, waterfall) — suffix the 2nd
faithfully.

**`TZ=US/Pacific` for any date-asserting test.** CI sets `TZ: US/Pacific`
process-wide and Playwright inherits it (no `timezoneId` is set). On other host
TZs, date-only values shift a day. Run date-asserting ports with `TZ=US/Pacific`
locally to match CI.

**EditableText: title vs description are different widgets.** Titles stay a
`<textarea>` → assert `toHaveValue`. Description / markdown-capable fields render
markdown *text* on blur → assert `getByText`, not `toHaveValue`/`getByPlaceholder`.

**`saveQuestionToCollection` ≠ a bare `saveQuestion`.** The save-question modal now
defaults its target to a *dashboard*, so a bare save can file the question into
"… in a dashboard" and navigate away. Port the explicit collection pick
(`{ path: ["Our analytics"] }`). Evil fingerprint: a later editor step times out on
a fully-rendered dashboard-edit page.

**React-Grid-Layout resize is react-draggable, NOT dnd-kit.** `dnd.ts` helpers are
the wrong tool. Dispatch `mousedown` on `.react-resizable-handle` (React delegated
listener), then `mousemove`/`mouseup` on `document` (react-draggable's raw
listeners). A real Playwright mouse can't run the min-size test (drags to hugely
negative client coords) — a synthetic MouseEvent carries them verbatim.

**Precise-coordinate ProseMirror drops → synthetic event replay, not `dragTo`.**
When a ProseMirror plugin reads the drop event's `clientX` to pick a side (20%/80%),
replay the full mousedown→dragstart→…→drop→dragend with one shared DataTransfer in a
single `page.evaluate`. The general "don't port the bare 3-event dnd sequence" rule
does NOT apply here.

**`getByDisplayValue` is missing from this install's Playwright types (1.61.1)**
despite shipping at runtime. Port `cy.findByDisplayValue` via an imperative
`inputValue()` scan (shared `filters-repros.findByDisplayValue`/`countDisplayValue`).

**`toBeInViewport()` over `toBeVisible()` for scroll-clipping intent.** Playwright
ignores overflow-scroll clipping, so an off-screen element still reads "visible".
Tests asserting "did NOT auto-scroll into view" must use `toBeInViewport()`.

**leaflet-draw box bounds come from the last `mousemove`, not `mouseup`.**
cypress-real-events `realMouseMove(x,y)` is element-relative (not a delta). End the
drag at the element-relative target corner.

**Pivot dashcards query `/api/dashboard/pivot/:id/...` / `/api/card/pivot/:id/query`**
— broaden `waitForResponse` regexes (`/api/card/.+/query`) to cover the pivot endpoint.

**Page-wide table-cell locators are a latent strict-mode flake — scope to
`table-header` like Cypress does.** A shared helper that scans page-wide for
`header-cell` (or `cell`) matches *any* table on the page, including the sticky
object-detail column and pivot sub-tables. It resolves to one element on most
specs and silently becomes a strict-mode violation the moment a second table
renders — which is how `dashboard-drill` #15331 went red on CI batch-9 s5 (a
duplicate "Quantity" from the object-detail column). Cypress's
`tableInteractiveHeader()` was always scoped; the port had widened it. Fix and
rule: `getByTestId("table-header").getByTestId("header-cell")` — provably the
same single element Cypress's green selector resolves to (`support/notebook.ts`
`tableHeaderColumn`, verified drill #15331 2/2 + the `summarization` caller).
Generalise: when a shared locator is broader than the Cypress helper it stands
in for, the extra breadth is not harmless — it is a flake waiting for a second
matching element.

## Gotchas added in batches 8–11 (reconciled from 66 inbox entries, 2026-07-20)

### Assertions and waits that don't mean what they look like
- **Absence assertions are vacuous inside a mount-lag window — and the fix is an
  ANCHOR, not a different assertion form.** (Corrected 2026-07-20; an earlier
  version of this bullet had it backwards and briefly propagated into agent
  briefs — see the correction note below.)

  The semantics, stated correctly:
  - Cypress `should("not.exist")` **retries** and passes at the *first absent
    observation*.
  - Playwright `expect(loc).toHaveCount(0)` **also retries** and also passes at
    the first absent observation. **These two are EQUIVALENT** — `toHaveCount(0)`
    is the faithful port, not a stronger one.
  - A non-retrying `expect(await loc.count()).toBe(0)` samples **one instant**.
    That is *stricter* than the original and can go **falsely red** when the
    element is transiently present but would have vanished. Do not reach for it
    to "match" Cypress; it does not.

  The real problem is that *both* retrying forms are satisfied by "nothing has
  rendered yet". If the gate you await fires before the content paints, the
  absence check proves nothing. **Measured** (`custom-elements-api`):
  `data-iframe-loaded` fires at +0ms, metabot chat paints at +92ms, the drill
  popover at +243ms — so all 8 of that spec's absence assertions passed with the
  behaviour under test **inverted**.

  **The fix**: anchor on something that is present in *both* variants and that
  proves the render completed, then assert absence. Prefer a discriminating
  signal (e.g. the disabled component's own error text) over a timeout. Where no
  DOM signal exists for "the interaction was ignored", a bounded settle well
  clear of the measured paint time is the honest fallback — document the margin.

  **🔴 An EMPTY-STATE component renders PRE-FETCH, so it is not a valid anchor.**
  The sharpest measured case: `admin-people`'s unsubscribe test anchors on a bell
  icon that is `NotificationEmptyState`, which renders whenever
  `items.length === 0` — **including before the fetch resolves**. Bell paints at
  **+68ms**, the real card at **+134ms**, and all three assertions fit in that
  gap. Result: replacing the "Unsubscribe" click with Escape — i.e. never
  unsubscribing — leaves the test **green**. Anchor on something that only exists
  in the *loaded* state.

  **Beware pre-interaction placeholders**: a locator that also exists in an empty
  state does not gate anything. `data-step-cell` resolves in ~3ms because the
  empty notebook step is already mounted; anchor on the step *naming Orders*.

  **When IS a non-retrying `count()` right?** Only for a genuinely *momentary*
  absence — where the point is "X was not present at this specific instant" and
  X may legitimately appear later. For a **steady-state** absence following a
  DOM-mutating action it is a flake generator: the wizard in
  `select-embed-options` re-renders its preview **in place** (no iframe remount),
  so a one-shot count catches the *outgoing* DOM. Measured: 1-in-36 flake with
  the one-shot form, 63/63 after converting to retrying `toHaveCount(0)`.
  **Default to `toHaveCount(0)`; justify any one-shot in a comment.**

  **How to prove vacuity**: see the dedicated section
  **"Mutation testing — proving a green test is load-bearing"** below. Do not
  claim vacuity from source-reading alone.
- **Read a Cypress helper's SIGNATURE before porting its call shape.**
  `tooltipHeader(x)`, `completions(x)`, `assertOrdersExport(n)` all silently
  discard their arguments. Strengthening them into real assertions can turn a
  test red — and has, correctly (the discarded `tooltipHeader("2025")` was
  factually wrong; the tooltip reads "2026").
- **Port a Cypress glob intercept LITERALLY.** `?` matches a literal `?` and a
  remainder with no `*` is exact — such an intercept matches only the fully
  unfiltered request and lets every filtered one through to the real backend.
  Build a URL predicate requiring the exact params *and* the absence of the
  others, or you will over-stub tests upstream deliberately left live.
- **Check the awaited endpoint can fire in the mode under test.** Beyond the
  #16 ordering rule: a wait on the app-mode card-query POST inside a *static
  embed* describe can never match (embeds GET under `/api/embed/dashboard`), and
  a table-only x-ray alias can never match a `/field/:id` drill. Widen the
  predicate to what the interaction actually hits — `waitForResponse` does not
  consume past responses, so a too-narrow alias that passed retroactively in
  Cypress will hang.
- **`waitForResponse` on an RTK-Query-cached endpoint hangs.** Re-opening a UI
  backed by a warm cache fires no request at all, where `cy.wait` is satisfied
  retroactively. Drop the wait; let retrying assertions gate.
- Port `cy.get("@alias.all").should("have.length", 0)` (assert a request never
  fired) as a passive `page.on("request")` counter checked at the end.
- Port `cy.wait(["@a","@a","@a"])` as one response *counter* polled to `>= n` —
  three concurrent `waitForResponse`s on one predicate all resolve on the first hit.

### Search index and async state
- **After any mutation on a search-backed page, poll the backend until the index
  reflects it BEFORE triggering the FE read.** These pages refetch once on
  remount then cache forever, so assertion retry cannot rescue a stale read.
- `mb.restore()`'s poll only guarantees a *table* is searchable. Seeding new
  content types, editing for last-editor attribution, and archiving each need
  their own index-readiness poll; wrap `reload()`+assert in `toPass`.
- A test asserting "Updated … by X" needs **≥1s** between create and edit —
  `InfoTextEditedInfo.tsx:52` renders "Updated" only when `last_edited_at`
  differs from `created_at` at second granularity. Cypress's slow UI flow always
  cleared the boundary; a fast API PUT does not.
- To make a card read as edited, PUT a **fresh legacy** `dataset_query` — a
  description-only PUT bumps `last_editor_id` without a content revision, and
  echoing back the stored MBQL 5 query with a `query` key is rejected 400.

### Sessions and auth
- **Reorder `signIn` FIRST when porting a `beforeEach` that hits an admin API
  before `cy.signInAs*`.** Cypress's `cy.request` rides an implicit cookie
  session; the Playwright `api` client only sends `X-Metabase-Session` after
  `signIn`, so the call runs session-less and silently no-ops under
  `failOnStatusCode:false` (fingerprint: every admin-settings call 402s).
- Cypress's command queue decides **which session a later command runs under**,
  not just ordering. Porting two chained creates as sequential admin calls
  silently changes creator/editor attribution.

### Clicking things Mantine has hidden
- Click the visible **label** for a `SegmentedControl` option, never
  `getByRole("radio").click({force:true})` — the inputs are `sr-only` and
  offscreen, and `force` still requires the point to be in the viewport. (A
  `SegmentedControl` option *does* survive `click({force:true})` because the
  intercepting `innerLabel` span is a child of the label — unlike `Select` rows,
  which force-click cannot rescue.)
- A visually-hidden input Mantine parks **outside the modal viewport** fails
  force-click ("Element is outside of the viewport", after "done scrolling") —
  use coordinate-free `locator.dispatchEvent("click")`.
- A `display:none` hover-child cannot be force-clicked at all (no layout box) —
  find the ancestor actually carrying the `onClick` and dispatch there.
- Assert `toBeEnabled()` before toggling any admin `Switch`: `useAdminSetting`'s
  `isLoading` keeps it disabled, and `click({force:true})` on a disabled input
  silently no-ops, surfacing as a `waitForResponse` timeout on the *save*.
- Reach for `hover({ force: true })` when a disabled control overlays the hover
  target — Playwright's actionability check refuses the point for the same
  hit-test reason CDP `realHover` failed in Cypress.

### Endpoint shapes worth knowing
- A **model** visited at `/question/:id` runs via `POST /api/dataset`, not
  `/api/card/:id/query` — the strict shared `visitQuestion` hangs on models.
  Branch on `type`: `visitModel` / `visitMetric`.
- Document public links are `POST /api/document/:id/public-link` (**dash**), not
  the `…/public_link` (underscore) used by card/dashboard/action.
- Public question exports (`GET /public/question/<uuid>.<type>`) answer **302** —
  capture the initial GET with `waitForRequest` and let the browser follow.
- `GET /api/setting/:key` returns raw **`text/plain`** for string settings — use
  `response.text()`; `.json()` throws `SyntaxError: Unexpected token 'h'`.
- Remote-sync endpoints are **premium-token-gated** (402 without a token), not
  `:feature :none`.

### Editors and tables
- Inside a CodeMirror **snippet**, drive bracket-bearing arguments with
  `keyboard.insertText`, never `keyboard.type` — a typed `[` fires
  close-brackets/autocomplete, exits the snippet, and the next Tab indents
  instead of advancing.
- Blur an EditableText with `page.locator("textarea:focus").blur()`, never
  `keyboard.press("Tab")` — its root `onKeyDown` re-focuses on every non-Enter
  key, so Tab bounces and the markdown preview never renders.
- Filter `{ visible: true }` on TableInteractive header cells — react-virtualized
  renders a `visibility:hidden` off-screen measurement clone at x≈-9959 — and
  `await expect(...).toBeVisible()` before any `boundingBox()`/drag, which does
  not auto-wait and returns null.
- The edit-table grid renders each data row once per horizontal quadrant, so
  `data-dataset-index` matches two `role="row"` sections: nth 0 (frozen) carries
  the hover-revealed `row-edit-icon`, nth 1 (center) carries `cell-data`.

### Harness
- **Run with `--workers=1` when `PW_SLOT_OFFSET` is pinned** — multiple workers
  each boot a backend on the same fixed slot and collide, surfacing as an
  unrelated spec "failing" in a crashed worker.
- Never press Enter to commit an entity-picker search: `SearchInput` debounces
  300ms and Enter submits the form, unmounting the picker before the debounce
  fires. Register the `/api/search` wait, type, await.
- **A snowplow-stubbed describe asserts nothing snowplow-specific** — such tests
  are smoke coverage only and can never ground a product-bug claim. Say so
  rather than reading them as passing assertions.
- Audit a spec's snapshot/gate dependencies while porting: `custom-viz` restored
  `postgres-writable` and never touched it (swapping to `"default"` freed 54
  cases onto the bare jar), and the SQLite x-ray tests need no container at all
  (built-in driver, repo-root fixture, slot backends run from `REPO_ROOT`).

## Mutation testing — proving a green test is load-bearing

**Why this exists.** A ported spec that has never run proves nothing by being
green. It may be green because it asserts something that *cannot fail*. That is
not hypothetical here — it has produced a dozen findings: absence checks
satisfied before the page painted (#73), helpers silently discarding their
arguments (#25, #53), `should("be.empty")` on a void element (#83), a test whose
entire subject can be deleted without it going red (#76). **Mutation testing is
the cheapest way to tell a real green from a hollow one, and it is now expected
on every port.**

**The method.** Break something the test claims to check; the test must go red.
- A **killed** mutant (test fails) = the assertion is load-bearing. Good.
- A **surviving** mutant (test still passes) = a question, not yet a verdict.

**Invert the INPUT, not the expectation.** Change the fixture *and* the
assertion and they move together, so the test passes and you have proved
nothing. The strongest form is corrupting something **no assertion references** —
`filter-bigint` altered one digit in the QA-DB fixture and three tests failed.

**If every mutant dies at the FIRST assertion, later assertions stay unproven.**
Several ports had to add follow-on mutants aimed specifically at the tail
assertions. Check *where* each mutant died, not just that it died.

### Four ways a mutation lies to you

1. **The mutation silently didn't apply.** `PUT /api/setting/:key` returning 2xx
   is NOT evidence the setting changed — `non-table-chart-generated` has a custom
   `:setter` that only ever applies `true` (`analytics/settings.clj:97`), so the
   "mutation" no-ops and reads as a surviving mutant. Same family as the
   `MB_SITE_URL` env-beats-app-DB trap (#39). **Read the `defsetting` first.**
2. **It shrank both sides.** `Array.from({length: 3})` → `{length: 1}` survives
   and means nothing. Corrupt what the assertion does *not* track.
3. **The content is conjunction-gated.** If it renders only under settings A
   AND B, inverting either alone leaves the test green — which looks exactly
   like vacuity while the assertion is sound. Measured in
   `embed-flow-enable-embed-js-*`. The decisive probe is **"can this locator ever
   match?"**
4. **The environment moved, not the code.** On the QA-DB tier a shared writable
   container (#85) makes results non-reproducible; a "surviving" mutant may just
   be a contaminated DB.

### When a mutant survives, ask "vacuous, or bad mutation?"

Answer it by asserting **presence** under the same mutation. `embedding-hub` did
exactly this: an absence check sailed past a 500, so it flipped the assertion to
`toHaveCount(1)` under the same mutation and *found* the element — proving the
check was sampling too early rather than asserting nothing. Different problem,
different fix.

And when the answer is "vacuous": if Cypress has the same semantics, **it is
vacuous upstream too** — not port drift, not a Playwright weakness. Fix it with
an anchor and say so.

## Capturing snowplow without micro (batch-12, search-snowplow)

**Rule 6's no-op stub is wrong when snowplow events are the spec's subject** — it
would have made `search-snowplow` 26 no-op tests. Events can be captured entirely
at the browser boundary: no container, no shared-file edit, and no cross-slot
contention (a shared snowplow-micro on :9090 has exactly that problem — five
parallel agents share one global store that `resetSnowplow` wipes).

`support/search-snowplow.ts installSnowplowCapture(page, mb.baseUrl)`:
1. `page.addInitScript` installs a setter on `window.MetabaseBootstrap` (the
   inline settings blob the backend embeds in index.html) forcing
   `snowplow-enabled`/`anon-tracking-enabled` true and `snowplow-url` to the
   app's **own origin**. Route and patch `/api/session/properties` the same way —
   `trackSchemaEvent` re-reads `Settings.snowplowEnabled()` per event, so a later
   site-settings refresh would restore the backend value.
2. `page.route` catches the tracker's POST to
   `/com.snowplowanalytics.snowplow/tp2`, base64url-decodes `ue_px` (or reads
   `ue_pr`), and records `data.data` — byte-identical to micro's
   `event.unstruct_event.data.data`, which is what
   `H.expectUnstructuredSnowplowEvent` matches on.

**Why the app's own origin is load-bearing (generalisable):** the tracker POSTs
`application/json` **plus an `SP-Anonymous` header**, so any cross-origin
collector triggers a CORS **preflight** — and **Playwright does not intercept
preflight `OPTIONS`**. The preflight fails against a dead collector, the real
POST is never sent, and `page.on("request")` never sees a body. Pointing the
collector at the app origin removes CORS entirely. **Any port that wants to
observe a POST body sent to a third-party origin has this problem**; re-pointing
the client at the app origin is the cheap fix.

**Artifact-dependent defaults — CORRECTED 2026-07-20, an earlier version of this
paragraph was wrong twice.** The raw `defsetting` defaults are: `snowplow-available`
→ `config/is-prod?`, `snowplow-url` → `https://sp.metabase.com` when prod,
`http://localhost:9090` otherwise (`analytics/settings.clj:64-72`).

**But those prod defaults never applied to our slot backends.** `deps.edn`'s
`:e2e` alias sets `-Dmb.run.mode=e2e`, so **`config/is-prod?` is FALSE even in
jar mode**. Measured: a clean-shell boot reports `localhost:9090`. The earlier
claim here — that a jar-mode port "fires real analytics at Metabase's production
collector" — **was false, and nothing was ever escaping to production.**

**Nor is `MB_SNOWPLOW_*` in a slot's env "leakage from an earlier session":**
`support/env.ts` loads it from `cypress.env.json` on every run. There is nothing
to reboot away.

**And `MB_SNOWPLOW_URL` does not work at all.** Settings resolve through
`environ`, which merges **system properties after env vars**, and the `:e2e`
alias already pins `-Dmb.snowplow.url=http://localhost:9090` via
`JDK_JAVA_OPTIONS` (set unconditionally by `cypress-runner-backend.js`, so
appending to it is also out). Measured: booting with
`MB_SNOWPLOW_URL=http://localhost:5999` reports `9090`; booting with
`_JAVA_OPTIONS="-Dmb.snowplow.url=http://localhost:5101"` reports `5101` —
`_JAVA_OPTIONS` is applied *after* the command line and wins. **This is why
`MB_SITE_URL` works but `MB_SNOWPLOW_URL` doesn't: site-url isn't pinned as a
system property.** Do not assume the env-beats-app-DB pattern generalises.

The real (narrower) problem the per-slot collector solves: every slot used to
emit to one fixed port, so with micro up all five slots interleaved into a store
any slot could wipe, and with micro down events vanished silently.

⚠️ **SCOPE — this covers exactly the FE-emitted class, not "snowplow specs"
generally.** Measured on `instance-stats-snowplow`: `instance_stats` is
**backend-emitted** (`stats.clj:1054` → `snowplow.clj track-event!` → Java
`Tracker` → Apache HttpClient POST). It never touches the browser, so the
capture is **structurally blind** to it. Proven, not inferred: a `node:http`
server bound on the collector port received one
`POST /com.snowplowanalytics.snowplow/tp2` (`iglu:com.metabase/instance_stats/…`)
~1s after `POST /api/testing/stats` returned, while the browser issued nothing.
- **`trackSchemaEvent` / `trackSimpleEvent` call sites in `frontend/`** →
  capturable with this technique.
- **`track-event!` call sites in `src/`** → NOT capturable. Re-pointing the
  collector at test time is impossible: `snowplow.clj` builds the tracker in a
  `defonce` whose `network-config` reads `snowplow-url` **once at backend boot**.
  The only real fix is a harness change — boot slot backends with
  `MB_SNOWPLOW_URL=http://localhost:<per-slot port>` in `worker-backend.ts`.
  Doing it from inside a spec is wrong: the port is global across five slots,
  and on a clean/CI backend `snowplow-url` defaults to `https://sp.metabase.com`,
  so it degrades into a FINDINGS #49 "green run that never executed" — and would
  fire real events at Metabase's **production collector**.

**Reuse status: proven on four independent specs** (`search-snowplow`,
`data-studio-metrics`, `visualizer-snowplow-tracking`, `reference-databases`)
with **zero modification**
to the helper — including matcher shapes (`event` + `event_detail` +
`triggered_from`) and count-accumulation assertions the original never
exercised. Treat it as the default for snowplow-subject specs.

**The gap, stated:** this cannot reproduce `expectNoBadSnowplowEvents`, which asks
micro for **Iglu schema validation failures**. The port degrades it to a
structural check, so it does NOT catch "the FE emits a field the schema rejects".
Closing that means running `snowplow/iglu-client-embedded/schemas` through a
JSON-schema validator (`ajv` is already in the repo root) — worthwhile follow-up.

## Gotchas added in batch 12

- **`pressSequentially` focuses but never CLICKS.** `SearchBar` opens on the
  container's `onClick`, so typing yields a populated input and **zero**
  `/api/search` requests. Click first. (Fingerprint: failure surfaces 15s later
  at an unrelated event assertion.)
- **`locator.count()` does not retry.** A still-loading popover returns 0, a
  `for`-loop over that count ticks zero times, and the subsequent Apply is a
  silent no-op. Await a first-element visibility assertion before counting.
- **Read the modal component before picking the endpoint to anchor on.** Metric
  "Duplicate" goes through `POST /api/card` (`CardCopyModal` uses
  `useCreateCardMutation`) even though `metabase/api/card.ts` defines a
  `copyCard` mutation against `/api/card/:id/copy`. Anchoring on the obvious copy
  endpoint burns 30s while the page has already navigated to the new card.
- **`*/` inside a JSDoc block silently terminates the comment** — the house-style
  `create*/getTableId` phrasing reports as four syntax errors on the import list
  below it. Write `create\*/…` or reword.
- **`MetabaseApi` has no `delete` shorthand** — port `cy.request("DELETE", …)`
  via `api.fetch("DELETE", …)`.
- **A one-shot absence check taken straight after a helper that resolves on a
  network response is a race BY CONSTRUCTION.** `publishChanges` (and any helper
  awaiting a PUT/POST) returns on the *response*; Cypress's command queue then
  supplies a settle that Playwright does not, so `count() === 0` immediately
  after reads the pre-render state — deterministically, not flakily. Gate on a
  mirror of the state you expect ("Copy code" visible ⟺ the link is gone) rather
  than weakening the one-shot semantics.
- **`.body` is a METHOD on Playwright's `APIResponse`, and reading it as a
  property fails toward the WRONG conclusion.** `(await mb.api.get(url)).body[x]`
  yields `undefined`; a `?? {}` fallback then manufactures a convincing empty
  result. When probing whether a token took effect this prints `{}` for both the
  licensed and unlicensed arms — i.e. it looks exactly like "the token silently
  failed" and would have produced the opposite of the true answer. The habit is
  learned from this codebase, where `api.getDashboard()` genuinely does return
  `{status, body}`. **Cross-check any negative token/feature probe against
  `curl`** before concluding a gate isn't real.
- **A cancelled agent can leave a file that LOOKS finished but carries a live
  mutation.** An agent stopped mid-mutation-check leaves its corruption in place
  — and if the mutation lives in a shared constant the assertions merely echo
  (e.g. a `cardText` string), the spec reads as complete and even passes its own
  altered expectation. **Never inherit a partial file on trust**: diff it against
  the Cypress original line by line before adopting it.
- **A shared factory that spreads unknown keys can make your fixture STRONGER
  than upstream's — the harder mismatch to spot.** Upstream's `question()`
  helper **silently drops `embedding_type`** (not destructured, absent from both
  the POST and the follow-up PUT), while our `factories.createQuestion` spreads
  unknown keys straight into the POST. Transcribing a spec's arguments literally
  therefore creates a card upstream never created. Drop it, matching upstream.
  **Blast radius checked 2026-07-20: no other spec passes `embedding_type` to a
  question factory** — the only other uses are a `createDashboard` call (fine)
  and a test whose subject *is* `embedding_type`. Generalise the shape, not the
  instance: when a shared factory forwards keys the Cypress original discarded,
  the port silently diverges upward.
- **Check `ERROR_DOC_LINKS` before loosening an error-text assertion.** `SdkError`
  appends "Read more." into the shared text container only when
  `ERROR_DOC_LINKS[code]` exists, and it has exactly one entry — so most error
  assertions can stay **exact** matches. This is the inverse of the
  loosen-by-default instinct; check the table rather than always loosening.
- **`cy.type()` CLICKS its subject first — porting it onto an input silently
  drops that click.** Cypress's `type` command does
  `cy.now('click', $el, {force:true})` ("click the element first to simulate
  focus") and *then* sends keystrokes to `document.activeElement`. So
  `findByLabelText("ID").type("123")` works even though that accessible name
  resolves to a **`<button aria-label="ID">`** (the Mantine Popover trigger
  `ParameterValueWidgetTrigger`, not an input): the click opens the popover,
  Mantine autofocuses the field-values input, and the text lands there.
  **If your Playwright locator is the input where Cypress's was a wrapper, you
  have dropped a click.** Port it literally: click → assert an input took focus
  → `keyboard.type`. Fingerprint: the target "isn't typeable" and the port looks
  impossible.
- **`cy.get()` RESETS the subject** — in
  `findAllByTestId(X).get("[data-parameter-slug=…]")` the `findAllByTestId` half
  is dead code and the real selector is the attribute alone. Same family as #15;
  port what actually executes, scoped as the test intended.
- **🔴 `cy.wait("@alias")` is a QUEUE that pops PAST responses — so "drop the
  wait" is NOT always the right port.** Measured in `model-actions`:
  `openActionEditorFor` fires a `GET /api/action/:id` that nothing waits on, and
  the later run-modal open is RTK-cached and fires **no** request — so upstream's
  in-test `cy.wait` was being satisfied *retroactively* by the earlier response.
  A naive `waitForResponse` deadlocked 2 tests × 30s, fingerprinted inside a
  shared helper. But **the first call genuinely needs the gate**, so dropping it
  would weaken the test. Port the **queue** itself (record responses, pop one per
  wait) rather than either extreme.
- **🔴 A `WRITABLE_DB_ID` reference does NOT mean the spec touches the writable
  container.** It is the literal `2`, and **under the `postgres-12` snapshot
  database 2 is the read-only "QA Postgres12" sample** — verified from the
  snapshot SQL and at runtime. So a spec can reference `WRITABLE_DB_ID` and be
  entirely unaffected by #85 contamination. Check which snapshot is restored
  before concluding either way; this is a red herring that will otherwise send
  you container-hunting.
- **🔴 The shared `openTable` silently DISCARDS its `database` argument on the
  notebook branch** — `joins.openTableNotebook` hardcodes `SAMPLE_DB_ID`, so a
  QA-DB table opens against database 1. The fingerprint is a
  "data-step-cell not found" that points at the *picker*, not at the dropped
  argument. Currently harmless (all present callers open sample tables — checked)
  but latent; consolidation candidate.
- **🔴 NEVER guess a fixture id.** A guessed `USER_GROUPS` id didn't fail — it
  silently tested something else: blocking group 4 (`DATA_ANALYSTS_GROUP`)
  instead of 5/6 meant impersonation was never enforced, the write succeeded, and
  it read as *"impersonation is broken in the app."* `click-behavior.ts` exports
  only a **partial** mirror, which invites exactly this. Look the constant up.
- **🔴 The general answer to intercept-early/wait-late: a `ResponseRecorder`
  registered where Cypress registers its intercept.** Many `cy.wait`s are
  satisfied *retroactively* by a request that already fired — e.g. `usage_info`
  is an RTK-Query read whose only request fires at **page mount** (because
  `DeleteDatabaseModal` renders eagerly with an `opened` prop), so a literal
  `waitForResponse` after the Remove click burns 30s. Same shape for a
  post-`goToMainApp` `@loadDatabases` and for `waitForDbSync` (which loops on one
  alias). **Record responses from the point Cypress would have intercepted, then
  assert against the recording** — this is preferable to creating the
  `waitForResponse` promise early, which risks unhandled rejections.
- **Key a retroactive-`cy.wait` recorder on WHICH response, never on a COUNT.**
  When you port a retroactive `cy.wait("@alias")` as a passive `page.on`
  recorder, it is tempting to model it as "≥N responses" because an earlier
  helper consumed the first. That is measurably fragile: in
  `select-embed-entity`, "can search and select a dashboard" produces exactly
  **one** `/api/dashboard/:id` fetch in the whole test, so a "≥2" model was
  simply wrong. Assert that the *specific* resource you care about was fetched.
- **Routing `/api/session/properties` AFTER `installSnowplowCapture` silently
  defeats the capture.** Playwright runs the **last-registered** route handler
  first, so a test-level patch of session properties wins and the capture's
  snowplow settings override is dropped. The failure mode is invisible — events
  simply stop matching, with no error. If a test must patch session properties
  after installing the capture, re-apply the three overrides verbatim in that
  handler. Will bite any future port that touches session properties.
- **`waitForRecentActivity` is broader than upstream's alias.** Upstream aliases
  `?context=selections*`; the shared helper matches the pathname regardless of
  query. Fine as a *gate*, wrong as a *body source* for `assertRecentItemName` —
  port the literal glob if you need the body.
- **`res.setThrottle(n)` has no Playwright equivalent** — port as a route delay,
  and inversion-probe at a much larger delay to confirm the behaviour under test
  is real rather than a timing artifact.
- **`page.clock` DOES install into embed iframes — and you must STEP it at the
  app timer's own period.** Verified from inside the frame's runtime on a loaded
  dashboard: `window.setTimeout` there is Playwright's stub, and the frame's
  `Date.now()` advances by exactly the amount passed to `runFor`, in lockstep
  with the parent. So an in-iframe `setInterval` (e.g. the SDK's 1s dashboard
  refresh via `useDashboardRefreshPeriod`) is fully drivable.
  **Measured refinement (2026-07-20):** `page.clock.setFixedTime()` **does apply to
an already-loaded page** — no `install()` and no navigation required (probed: the
date picker read "October 2026" after a bare `setFixedTime`). The notes below
would lead you to assume that's impossible; it isn't. `install()` is still needed
for *advancing* time.

**The trap:** a big jump COALESCES ticks. Measured against a 1s app timer —
  `runFor(1000)`×12 → exactly 12 refreshes; a single `runFor(3000)` → **0**;
  `runFor(5000)` → 1. On a negative assertion ("it did not refresh") a coalesced
  jump is a **silently vacuous pass**. Always step at the timer's period.
  This refines the wave-12 clock note, which is right about `install()` but omits
  that `pauseAt` + `runFor` gives full control, iframes included.
- **Two more `chromeWebSecurity: false` blockers, for any Group A spec that
  combines a production origin with a REAL auth flow** (the landed
  `authentication` spec missed them only because its production tests fail early
  inside `embed.js`'s own validation):
  - Cross-origin `/auth/sso` has no `Access-Control-Allow-Origin`. Fix with the
    **product's own** `embedding-app-origins-sdk` setting, not a route patch.
  - A mock JWT provider on `http://` is **mixed content** on the https-upgraded
    test page. Use a local https twin, reusing the harness's exported signer and
    CORS handling.
- **Some assertions are OSS-BUILD-only and NO token can reproduce them.** The
  sharpest case: any upsell-CTA assertion of the form
  `findByRole("link", { name: "Upgrade" })`. `UpsellCta.tsx` is a `ts-pattern`
  match testing **`onClick` before `url`**; `onClick` comes from
  `PLUGIN_ADMIN_SETTINGS.useUpsellFlow`, whose OSS default returns `undefined`
  (→ `<ExternalLink href>`) but which `metabase-enterprise/license/index.ts`
  overwrites (→ `<UnstyledButton>`). It is gated on `PLUGIN_IS_EE_BUILD`, **not**
  on token features, so on an EE jar it is a `<button>` with `href=null` at
  *every* tier and **there is no runtime lever**. `test.fixme` with the analysis
  rather than shipping a weakened green test. Also: **upsell content renders
  asynchronously** — a `count()` taken right after the page heading appeared
  returned 0 where 2 existed 2s later.
- **`cy.icon(x).should("be.visible")` on a multi-element subject is rule 3
  (ANY-of-set)** — chai-jquery's `visible` is `$el.is(":visible")` and jQuery
  `.is()` is true if *one* element matches. So `.filter({visible:true}).first()`
  is the FAITHFUL port, not a defensive one. (Needed because the EE build adds a
  second `dev_instances` gem where OSS has one.)
- **`.within()` rooted at a `findByTestId` carries an implicit existence
  requirement** — Cypress errors on a missing subject. Porting that as an
  explicit anchor is what keeps a nested absence check honest.
- **"EE jar with no token" is NOT an OSS build — the heuristic is close but not
  identical.** Clearing the token zeroes `token-features`, which is why most
  `@OSS` describes genuinely run on the EE jar (verified repeatedly, and
  `select-embed-options` confirmed its tier gating isn't real). But
  `PLUGIN_IS_EE_BUILD` is still set, so EE-only chrome renders that an OSS build
  never emits — measured: the embedding page fires `upsell_viewed / dev_instances`
  from `UpsellDevInstances`. Harmless for matcher-based assertions, but a port
  that **counts upsells page-wide**, or asserts the absence of EE-build chrome,
  will read the wrong answer. Check before relying on the equivalence.
- **Tier gating does NOT generalise across specs — check each one.** Two
  measured results that point opposite ways: `select-embed-options`'s gating is
  **not real** (both its OSS and unlicensed-EE describes pass on the EE jar),
  but `common-ee`'s **is** — removing `activateToken` and changing nothing else
  **fails 7 of its 8 tests**, with the single survivor being verbatim the one
  test its OSS sibling also carries. Without `embedding_simple`/`sso_jwt` the
  wizard genuinely refuses SSO and the navigation chain collapses. So neither
  "skip it, it's EE" nor "run it unlicensed, gating is never real" is safe as a
  default. Probe by removing the token and seeing what actually breaks.
- **A tier gate can be an ASSERTION gate, not a describe gate.** `guest-embed-ee`
  carries no tag: its entire EE-ness is `activateToken("pro-self-hosted")`, and
  the `-oss` sibling asserts the *same* `upsell-card` is visible where `-ee`
  asserts it absent. There is nothing to `test.skip`, and skipping by reflex
  deletes the only assertions that distinguish the two specs. Also: "activateToken
  didn't throw" is NOT evidence it worked — it PUTs with
  `failOnStatusCode: false`. Check `token-features` actually flipped.
- **"List re-renders under a resolved locator" also hits BREADCRUMBS.** React
  reuses the Mantine `Breadcrumbs` anchor nodes while swapping the trail
  contents, so a locator that resolved to "Orders" can be the "Library" anchor by
  click time — landing you on the wrong page, 3/3 deterministically. An href
  assertion alone is NOT sufficient (it re-resolves too). Gate on the settled
  trail (e.g. the expected crumb count) before clicking.
- **An avatar initial is part of the accessible name.** Group/collection links in
  `/admin/people/groups` compute as `"C collection"`, not `"collection"`, so
  `getByRole("link", { name: "collection", exact: true })` matches nothing — and
  as an *absence* anchor it fails silently in the passing direction. Drop
  `exact`, or match the rendered form.
- **A Cypress chain carries an implicit existence assertion that a naive port
  silently drops.** `cy.findByTestId("library-page").find(X).should("have.length", 0)`
  asserts TWO things: that `library-page` exists (findBy* throws if not) and that
  it contains no `X`. Porting it as `scope.locator(X)).toHaveCount(0)` keeps only
  the second — and that half passes trivially when the page never rendered.
  Port the anchor as its own visibility assertion first. **Worth sweeping across
  already-landed ports**: any `toHaveCount(0)` whose Cypress original hung off a
  `findByTestId`/`findByRole` anchor has the same hole.
- **Set `iat` explicitly when signing a JWT.** Upstream signs via
  `jsonwebtoken`, which stamps `iat` automatically; the local `signJwt` port adds
  no claims, and the backend unsigns with `{:max-age three-minutes-in-seconds}`
  (`sso/providers/jwt.clj:73`). Without `iat` the token is rejected. Affects
  every JWT port, not just the spec that found it.
- **FINDINGS #33 ("Playwright does not proxy a redirect's follow-up request")
  reads broader than it is.** It applies to a `page.route`-MOCKED hop. An
  `/auth/sso?jwt=` redirect handled by the real backend is the app's own
  redirect, and a plain `page.goto` follows it fine. Do not reach for the
  client-side redirect shim on every JWT SSO port — only when you are mocking
  the IdP.
- **Pin `maildev@2.0.5` — 3.x makes email specs silently gate-skip while looking
  green.** maildev 3.x moved the REST API to `/api/email`, so `isMaildevRunning()`
  probes the 2.x path, reports false, and every email test skips. The run is
  green and the tests never executed. `bunx maildev` installs 3.x by default, so
  this is the easy mistake. **This is a way to report a pass you never ran** —
  the same failure shape as FINDINGS #49; check executed-vs-skipped counts, never
  just the exit code.
- **The first-real-click drop generalises beyond auth-page links.** PORTING
  already notes auth links drop Playwright's first click (blur → "required"
  alert → reflow between mousedown and mouseup). It fires on **any control below
  an autofocused validated input** — e.g. the MFA challenge form's
  `AuthTextButton`s, which share a `<Form>` with the autofocused code input. Fix
  with a `toPass` retry gated on the button's OWN name, which relabels once the
  click lands and so cannot toggle back.
- **`H.getInbox()` returns as soon as the inbox is non-empty**, not when the
  email under test arrives. If any earlier mail is already sitting there (an
  enrollment notification, say), the poll returns immediately and the following
  `to.exist` is a timing coin flip. Port as a subject-matching wait.
- **An `afterEach` runs even when a skipped `beforeEach` short-circuits — and
  can fail every test in a gate-OFF control.** One QA-DB port's gate-off run
  reported **48 failed instead of 48 skipped** purely because of this, which
  would read as "the port is broken without the gate". Guard teardown on the
  same condition as the gate. Found *by* running the control, which is a point
  in favour of always running it.
- **Pin the schema in table lookups** (`"public"."foo"`, not `foo`). Upstream
  does this nearly everywhere; where it doesn't, another spec's same-named table
  in the shared container can win the lookup — and if that table is empty, an
  absence assertion **passes vacuously**. See #85's escalation.
- **🔴 OWED DURABLE FIX (#85): `multi_schema` reset in `support/data-model.ts`
  should drop schemas it does not own** — or the shared writable container needs
  a between-sessions teardown. Until then, QA-DB specs touching schema/table
  listing are contamination-fragile. Not done yet because siblings were live;
  **do this when the slots drain.** Mechanism: the picker is virtualized, so
  debris schemas push the target out of the DOM entirely — a taller viewport
  (`height: 1800`) is a diagnostic, not a fix.
- **🔴 Do NOT run a Cypress cross-check while parallel Playwright slots are
  live.** `H.restore()` re-points **database 1 at the shared `e2e/tmp` H2 file**,
  which breaks every concurrently-running slot (the same lock contention that
  manufactured the #22 evidence). Cross-checks require a quiesced box — that
  constraint is now about slot safety, not just result validity.
  **Measured consequence:** one agent ran a cross-check against its slot backend
  and **wedged it** — every subsequent `restore` timed out at 90s with
  `(reused)` in the log. Recovery is `kill -9` plus
  `rm -rf $TMPDIR/mb-pw-slot-<N>`. It recorded the trigger without isolating the
  cause, so the mechanism is unproven; the operational rule stands regardless.
  **If you must cross-check, do it LAST.**
- **🔴 On the QA-DB tier, a GREEN Cypress cross-check does NOT mean your port
  drifted — it may mean Cypress never saw the debris.** `resyncDatabase` without
  `tables` returns instantly, so Cypress reads the UI before the background sync
  discovers foreign tables (measured: Cypress sees 3 tables, the port sees 29).
  The two harnesses observe genuinely different application state. See #85.
- **🔴 An `{Enter}` inside a Cypress formula string is a COMPLETION ACCEPT, and
  needs `acceptCompletion`'s 300ms settle.** Ported literally, CodeMirror inserts
  a **newline** instead — `[Tot` + Enter becomes `"[Tot\n  ]"`. This hit one port
  in 4 tests with 4 different fingerprints. **Asserting the completion popup is
  visible is NOT sufficient** — the list is recomputed asynchronously and the
  selection resets to index 0 mid-sequence (measured `0→1→0→1→2→3` at a 300ms
  settle vs `0→5` at 1s, 3/3 and 5/5 runs).
- **The notebook data-step search input is autofocused and lives OUTSIDE
  `[data-testid=mini-picker]`** — so `H.miniPicker().within(() => cy.realType(…))`'s
  scope is decorative, and `miniPicker.getByRole("textbox")` matches nothing.
  Type at the focused element instead.
- **🔴 A real hover can CREATE the overlay that then intercepts its own click.**
  Playwright moves the mouse, the app renders a hover-triggered overlay at that
  point, and the follow-up click lands on the overlay it just summoned. Cypress
  never saw this because its synthetic click doesn't move the cursor.
  `dispatchEvent("click")` is the faithful port. (Same family as the
  `click({force:true})` trap, but the overlay is *caused by you*, which makes it
  much harder to spot in a snapshot.)
- **`H.NativeEditor.get(".ace_line")` silently discards its argument**, and
  **`CustomExpressionEditor.completion()` is an override whose base
  implementation (`.cm-completionLabel`) matches nothing in that editor** — two
  more members of the read-the-helper-before-porting-its-call-shape family
  (#25, #53).
- **Dense ECharts series defeat a real hover — the wave-12 pie-label rule
  generalises.** A weekly series in a dashcard packs ~3px dots a few px apart, so
  a *neighbouring* circle path is topmost at your target's centre and
  Playwright's hit-test refuses the hover. `realHover` did no hit-testing, so
  Cypress never saw this. Use `hover({ force: true })` (or a synthetic
  mousemove), not just for pie wedges but for any dense cartesian series.
- **🔴 Two testing-library → Playwright swaps that are silently LOOSER than the
  original** — the dangerous direction, since the test still passes:
  - **`findByPlaceholderText` NORMALIZES whitespace; `getByPlaceholder` does
    not.** The cron placeholder has triple spaces, so a literal transcription
    never resolves.
  - **`findByLabelText` is EXACT; `getByLabel` is a SUBSTRING match.**
    `getByLabel("Time")` also matched `aria-label="Your Metabase timezone"`.
    Pass `{ exact: true }`.
- **A getter written BEFORE its first use is unverified.** Both bugs above lived
  in helpers authored ahead of the tests that would exercise them, and survived
  until a later session actually called them. If you write support helpers
  speculatively, say so — or exercise them immediately.
- **🔴 Cypress's `not.be.visible` is an OCCLUSION test for `fixed`/`sticky`
  elements — and neither `toBeHidden()` nor `toBeInViewport()` ports it.**
  Measured: `table-header` is sticky, unclipped and `opacity: 1`, so Playwright
  correctly calls it visible — but `elementFromPoint` at its centre *and* all
  four corners returns the SQL sidebar's `DIV.cm-line`, which is what Cypress
  was actually asserting. A naive port therefore **fails on a correct app**.
  Port it as an occlusion probe (`elementFromPoint` at the centre and corners).
  Note `question-reproductions-4`'s `expectCypressHidden` helper **lacks this
  branch** — extend it rather than writing a third copy.
- **🔴 Cypress's `.click(position)` coordinates are ROUNDED** — `left` →
  `Math.ceil`, `right` → `floor - 1`. On text this matters: a naive `{x: 0}`
  lands on a token boundary and CodeMirror selects whitespace instead of the
  leading quote (the app's error banner read `select foobar'` rather than
  `select 'foobar'`). Reproduce Cypress's rounding, don't pass the raw edge.
- **🔴 The shared `verifyAndCloseToast` (`support/data-model.ts:235`) is a real
  strict-mode violation — MEASURED, and `data-model-shared-1` imports it.** It
  failed in both areas on run 1 when two toasts overlapped. Upstream survives
  only by accident: chai-jquery's `contain.text` on a multi-element subject is a
  **concatenation**, and Cypress's pacing lets the exit animation finish — so the
  *assertion* was never disambiguating, the *timing* was. Its own follow-up
  `.icon("close").click()` would have errored on two elements. **`data-model-shared-1`
  is therefore a flake waiting for CI load.** Replacement should preserve the
  concatenation semantics and use `dispatchEvent` rather than a force-click.
- **The table picker renders the RAW schema name** (`label: schemaName`, no
  humanization) — `public`, not `Public`. Invisible in most ports because they
  only name `Domestic`/`Wild`.
- **🔴 `H.CustomExpressionEditor.focus()` is `click("right", { force: true })`,
  and the `force` is LOAD-BEARING** — the editor's own portalled overlays sit on
  top of `.cm-content`. The shared `focusCustomExpressionEditor` uses a *real*
  click, so five tests in one spec each burned 30s on "subtree intercepts pointer
  events" over a fully-correct page. Use a dispatch-based focus.
  **3 specs call the shared helper — worth checking them.**
- **`allowFastSet` replaces `textContent`; it is NOT "type faster."** Porting it
  as a fast type changes what the editor receives.
- **🔴 The placeholder trap's worst instance: `RecipientPicker` only sets its
  placeholder while `recipients.length === 0`.** So a literal port of
  `cy.type(...).blur()` blurs a locator **that stopped existing the moment the
  first pill committed** — 15 of one port's 20 run-1 failures, every one with a
  `locator.blur: Timeout` fingerprint pointing at a *helper* rather than the
  cause. Never re-resolve a placeholder-based locator after typing; capture the
  element first, or anchor on something stable.
- **A setting key ending in `?` can never match a `pathname ===` comparison** —
  `bcc-enabled?` puts everything after the `?` into the query string, so the
  pathname is `/api/setting/bcc-enabled`. Compare on the pathname without the
  suffix, or match the full URL.
- **`should("not.have.value")` with NO argument is a chai-jquery tautology.**
- **Native parameter widgets drop their `placeholder` on focus** — re-resolving
  the input after `click()` finds nothing, the click itself succeeds, and the
  failure surfaces on the *next* line. (Same family as the token-field rule; this
  is the native-query instance.)
- **The first `Mod-j` after a completion tooltip appears is silently refused** —
  keydown is delivered with `defaultPrevented: false`, a second press ~400ms
  later works, and `ArrowDown` works throughout. Cypress's queue latency masked
  it; use the sanctioned re-nudge.
- **The containers named `postgres-sample` / `mysql-sample` ARE the writable
  hosts** — `writable_db` lives on **:5404 / :3304** inside them. *"postgres-writable
  isn't running"* is an easy and wrong inference from the container names; both
  `postgres_writable.sql` and `mysql_writable.sql` snapshots exist locally.
  Check the port before concluding a QA dialect is unavailable.
- **🔴 Driving `/auth/sso` through `mb.api` POISONS the `APIRequestContext`
  cookie jar — and `signInAsAdmin()` cannot undo it.** `signIn*` swaps the
  *browser* context's session; the `APIRequestContext` keeps the SSO cookie. So
  every later `mb.api.*` call silently runs as the SSO'd user — measured as
  `POST /api/card → 403` across four tests, with the UI looking correctly
  signed-in as admin. If you drive SSO at the API layer, use a **separate**
  request context for it, or re-establish the api client afterwards.
- **🔴 `contain` and `contain.text` behave OPPOSITELY on a multi-element subject
  — porting one as the other changes strength in opposite directions.**
  - **bare `should("contain", x)`** is chai-jquery's **ANY-OF** case
    (`$el.is(":contains()")`) — passes if *any* element contains `x`.
  - **`should("contain.text", x)`** is a **CONCATENATION** — joins all matched
    elements' text, so it passes if `x` spans two of them.
  So `.first()` **strengthens** a `contain.text` port and **weakens** a `contain`
  port. Check which one you have before choosing a shape.
- **`cy.get(sel).should("contain.text", X)` on a MULTI-element subject is a
  CONCATENATION, not an any-of.** chai-jquery joins the matched elements' text,
  so the assertion passes if `X` spans two elements. This is the **inverse** of
  the rule-3 any-of case (`should("be.visible")`/`be.disabled`), and it means
  porting it as `.first()` would **silently STRENGTHEN** the test. Port it as a
  join over all matches, or state explicitly that you strengthened it.
- **A `fill()` deadlocks a Formik submit gated on `dirty` + a derived sibling
  field** — and the intermediate assertion still passes, so the failure surfaces
  at the submit. Use the click + `pressSequentially` + blur shape.
- **🔴 CORRECTION: Python transforms are NOT premium-gated, and `@python` is
  OVER-gating.** I claimed `pro-self-hosted` lacks the feature and that a `402`
  blocks them; that is **false**, probed directly: `pro-self-hosted` carries
  `transforms-python: true`, and `GET`/`PUT /api/ee/transforms-python/library/common.py`
  both return **200**. The real blocker is only the dead python-runner/localstack
  containers (:5001/:4566), and it applies to just the **2** tests that call
  `setPythonRunnerSettings()` and actually run a transform — **the other 3
  `@python` tests execute green**. Two sessions treated the whole tier as blocked
  on my say-so. Probe the gate; don't inherit a claim.
- **🔴 `findByDisplayValue` used PAGE-WIDE is a latent flake — scope it to the
  widget.** The shared imperative scan (`support/filters-repros.ts`) resolves an
  `nth()` index, which **goes stale when the page re-renders between the scan
  and the click**. Measured as a 30s click timeout on a *different* widget's
  hidden input — a fingerprint that points nowhere near the cause. Fix by
  scoping to the widget's testid.
  **Blast radius, measured 2026-07-20: 12 page-wide calls across 6 specs** —
  `chart-drill`, `filters-reproductions`, `instance-analytics`,
  `personal-collections`, `models-reproductions-3`, `user-settings` (several via
  `page.locator("body")` or `page.getByRole("main")`, which are page-wide in
  effect). **These are sites to CHECK, not 12 bugs**: it only bites where the
  page re-renders in that window AND multiple hidden inputs match. Someone
  should walk them.
- **🔴 TWO upstream specs can share a basename, differing only in `.js` vs `.ts`
  — check before choosing a target filename.**
  `visualizations-charts/visualizations-charts-reproductions.cy.spec.**ts**`
  (issues 43075, 41133, 45255…) and `…**.js**` (issues 16170, 17524, 63671…)
  are disjoint specs. A brief that named the obvious target
  `tests/visualizations-charts-reproductions.spec.ts` would have **silently
  overwritten the landed `.ts` port**; the agent caught it and used
  `tests/viz-charts-reproductions.spec.ts`. PORTED.txt itself is fine (its
  entries carry the full extension) — the hazard is in choosing the *Playwright*
  filename. **Before writing, `ls` the source directory for same-basename
  siblings and `ls tests/` for an existing target.**
- **🔴 Playwright's actionability check reads `disabled` off ANCESTORS; Cypress
  does not.** This is the general rule behind several "the element is right there
  but the click deadlocks" reports. A faithful port of a control nested inside a
  disabled wrapper will hang on "element is not enabled" over a fully-rendered,
  correct page. `QuestionDisplayToggle` is the canonical case: both segments are
  `disabled: true` **by design** and the `SegmentedControl` *root* handles the
  click, so any port toggling the QB data/visualization switch needs
  `click({ force: true })`.
  ⚠️ **Scope it — do NOT apply reflexively to every "Visualization" string.** The
  `view-footer` "Visualization" button is the **chart-type** control, a different
  element entirely, and a plain `click()` works there. Check which control you
  actually have before reaching for `force`.
  The disabled attribute is not a bug and not a reason
  to hunt for another selector.
- **The parked-cursor gotcha INVERTS for hover-gated controls.** Wave-9 recorded
  that a parked real cursor opens a tooltip that eats the next Escape. The
  opposite also bites: Cypress's `realHover` plus later *synthetic* clicks leave
  the element `:hover` for the rest of the test, whereas Playwright's real mouse
  moves away and the hover-revealed overlay stops accepting clicks. **Re-hover
  before acting** on anything hover-gated.
- **`H.createQuestion(..., { visitQuestion: true })` does NOT call `visitQuestion`
  for models** — it routes to `visitModel`, and the difference matters:
  `/model/:id` runs `POST /api/dataset` and never `/api/card/:id/query`, so a
  wait on the card endpoint hangs.
- **`boundingBox()` is a SECOND round trip and returns `null` if the element
  re-rendered in between** — even immediately after a passing `toBeVisible()`
  from inside a helper. Bit a port right after a summarize re-query. When porting
  `.trigger()` with coordinates, read the rect **inside** the `evaluate`.
- **`[data-index=0]` is invalid CSS** — Sizzle (Cypress) accepts the unquoted
  numeric attribute value, `querySelectorAll` throws. Quote it: `[data-index="0"]`.
- **A `withinPortal: false` Select dropdown renders OVER the next control and
  eats a click silently** — the click lands on the dropdown, not the control you
  targeted, and the failure surfaces later.
- **`keyboard.press("Escape")` can be delivered to `<body>`** rather than the
  combobox input you think is focused — assert focus first if Escape is
  load-bearing.
- **🔴 `resyncDatabase({ dbId })` with no `tables` gates on NOTHING.** It returns
  as soon as the DB has *any* synced table — which the snapshot's own tables
  satisfy immediately — so it does not wait for the table you just created.
  Cypress's command-queue latency hid this; Playwright's back-to-back calls do
  not. Cost `source-replacement` **27 of 30 tests on run 1**, with a misleading
  fingerprint: first "table not found", then "Field `amount` cannot be found on
  table 235", which reads like a metadata bug. **Pass the helper's `tables`
  option.**

  ⚠️ **Refined 2026-07-20: passing `tables` does NOT always close the hole.**
  If the app DB already carries a stale row for that table with
  `initial_sync_status: "complete"` — which the `postgres-writable` snapshot does
  for `products` — the wait is satisfied **instantly by the stale row**, `tables`
  or not. Anchor on something that proves the *new* sync ran (a field the resync
  should have changed), not on sync-status alone.

  **Blast radius, measured 2026-07-20: 13 call sites use the bare
  `{ dbId: WRITABLE_DB_ID }` form**, across `data-model-shared-1` (3),
  `datamodel-data-studio` (5), `table-editing` (2), `interactive-embedding` (2),
  `embedding-hub` (1) — several already pushed. **These are sites to CHECK, not
  13 confirmed bugs**: the hole only bites when the test then depends on a
  *newly created* table appearing. Where the test only needs "a sync happened",
  the bare form is harmless. Someone should walk them.
- **🔴 `click({ force: true })` is NOT the port of Cypress's `{force: true}`.**
  Cypress **dispatches** the event at the resolved element. Playwright moves the
  **real mouse** to that element's coordinates and clicks **whatever is topmost
  there**. So a force-click under an overlay hits the overlay. Measured: the
  shared `verifyAndCloseToast`'s toast-close force-click landed on a **modal
  overlay and closed the modal**, surfacing three steps later as "Save button is
  not stable" — which reads as an app bug and sends you debugging the wrong
  thing. **`dispatchEvent("click")` is the faithful equivalent.**
  This is in a SHARED helper, so treat any unexplained "element became unstable /
  modal vanished" failure downstream of a force-click as this until ruled out.
- **Mantine `Select` option rows: `getByRole("option", { name, exact: true })`
  matches NOTHING.** `renderOption` injects an `Icon` (`aria-label`) and FK
  descriptions into the row, so the accessible name is never just the label —
  measured 0 vs 1. Upstream's `.contains`/`findByText` is substring anyway, so
  drop `exact`. Cost one port 4 failures that all looked like "the dropdown
  didn't open".
- **`.blur()` must hit the element Cypress typed into.** Re-querying a field
  input by its *new* name deadlocks: the accessible name only updates once the
  PUT that the blur itself triggers has landed.
- **`.closest("button")` on a Mantine `Card` gives you the STEP, not the card.**
  Hub cards are `Card` divs; the nearest `button` ancestor is the `Stepper.Step`
  `UnstyledButton` wrapping the *whole step*. It only looks unambiguous because
  each hub step happens to contain exactly one card.
- **`H.addPostgresDatabase` is not a thin POST** — it blocks on sync completion
  and field analysis (the `documents-core` copy does not). Budget for it, and
  don't swap one for the other.
- **Strengthening an assertion can RECREATE the bug under test.** `filter-bigint`'s
  export test doesn't verify exported digits — and neither does upstream. The
  tempting fix is to assert on `readSheetRows`' output, but that goes through
  `XLSX`, which **coerces those cells to JS numbers** — i.e. the strengthened
  assertion would itself lose the precision the spec exists to protect. Before
  strengthening, check that your assertion path doesn't pass the value through
  the very lossy step under test.
- **The MultiAutocomplete blur trap also fires on the FILTER PICKER's value
  input**, not just ID widgets: `NumberFilterPicker` renders a pill combobox
  (not `BigIntNumberInput`) when the column has field values, so
  `getByLabel("Filter value")` is a `MultiAutocomplete` and the "Add filter"
  click is swallowed. Fingerprint is misleading — it surfaces two steps later,
  with the pill committed and the popover still open.
- **Submitting a form while a `MultiAutocomplete`/`PillsInput` holds focus
  silently does nothing.** A real Playwright mousedown on the submit button blurs
  the focused `PillsInput`, whose blur handler re-renders the form — mouseup then
  lands on a *replaced node*, so **no `click` event is ever delivered**. Nothing
  errors; the filter is simply never applied. `force: true` fails identically
  (actionability was never the issue). Cypress never hit this because its
  `.click()` dispatches the whole sequence at the already-resolved element.
  Fix: `blur()` the input first, then click normally (`dispatchEvent("click")`
  and `focus()+Enter` also work). **Latent across a whole spec, not a one-off** —
  in table-collection-permissions one instance failed on run 1, a second only
  under `--repeat-each=2`, and a third with identical construction has never
  failed. Generalise to any port that submits a form while an autocomplete has
  focus.

### Consolidation candidates surfaced this stretch (later pass)
- **`openTable`-with-`limit`** — re-implemented 3× (table-drills, column-shortcuts,
  binning); shared `openTable`/`openOrdersTable`/`openReviewsTable` drop `limit`.
- **Visualizer helper surface split across 3 files** (visualizer-basics /
  dashboard-card-repros / visualizer-cartesian) — private `dataSource`/
  `dataSourceColumn` forced re-implementation. Unify a scope-parameterised
  `support/visualizer.ts`.
- **ECharts text/tooltip any-of helpers** (`expectEchartsTextContains`/`NotContains`,
  `assertEChartsTooltipNotContain`) → fold into `charts.ts`.
- **`applyFilterToast`/`applyFilterButton`/`cancelFilterButton` scope-taking trio**
  → absorb `dashboard-parameters.ts`'s Page-only `applyFilterButton`.
- **`documentsDragAndDrop` generic** vs the card-on-card specialization in
  `card-embed-node.ts`.
- **A shared USERS name map** (sample-data.ts carries only email/password) for
  `getPersonalCollectionName`.
- **`savePermissionsGraph`** (data-model-permissions.ts) ≡ **`saveAndConfirmPermissions`**
  (download-permissions.ts) — promote to one shared permissions helper.
- **The snowplow no-op stub block** is copy-pasted across `homepage.ts`,
  `datamodel-segments.ts`, `segments-data-studio.ts` — hoist to one module.
- **`undoToast`** (metrics.ts) ≡ **`undoToastList`** (organization.ts) —
  byte-identical `getByTestId("toast-undo")`; unify into `ui.ts`.
- **Two `MeasureEditor` helper objects** — `measures-queries.ts` (library route)
  and `measures-data-studio.ts` (data-model route) both port the same single
  Cypress `H.DataModel.MeasureEditor`. Clean consolidation target.
  (The `_measures_reexports` scaffolding previously flagged here is gone —
  verified absent 2026-07-20.)

Batch-12 additions (all cases where Cypress has exactly ONE copy, so
consolidating stays faithful):
- **`commandPaletteSearch` — re-implemented 5×.** All copies identical except
  prior ports hardcoded `viewAll = true`, which is the only reason
  `search-snowplow` needed its own. Parameterise it.
- **`dataStudioNav` ×4**, **`createCollection(api, name)` ×5**.
- **The `e2e-dependency-helpers.ts` surface is smeared across three port
  modules** — proposes `support/dependencies.ts` + `support/transforms.ts`.

Rule still in force for all of the above: **only consolidate toward a shape
Cypress already has** (faithfulness > DRY). All qualify.
