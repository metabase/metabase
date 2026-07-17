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
