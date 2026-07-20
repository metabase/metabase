# Migration dividends — evidence file

Every concrete benefit surfaced by porting Cypress e2e specs to Playwright.
Each entry: what we found, where, and why it matters. **Process rule: any new
dividend found during porting gets an entry here in the same PR.**

## Scoreboard — read this before quoting numbers

**Product bugs: 1 jar-CONFIRMED (#1), 6 retracted (#2, #3, #22, #24,
`dashboard-parameters` field-61, `dashboard-reproductions` 12926), 2 open
questions (#45, #46 — jar-observed, but neither established as a defect rather
than intended behaviour; do NOT count these as bugs).** Every claim
was put through the jar gauntlet.

**Coverage claims need two numbers, not one.** ~300+ specs are ported; a
non-trivial share is **ported-and-gated** — faithful, typechecked, and not
executed anywhere *yet*, because the spike's own CI workflow skips QA-database
snapshot generation (`-@external`) and we don't run those containers locally
(#49). Quote ported-and-verified separately from ported-and-gated. **Note this
is a config gap in the spike, NOT a limit of the harness** — Cypress CI runs
these specs today with QA containers, and #50, which claimed otherwise, is
retracted.

**The case has costs on the record too**, deliberately: one spec where the
migration *reduced* coverage (#47), and one input class where Playwright's real
CDP input is worse than Cypress's (#48). **#1 reproduces on the production bundle** — a
real, precisely-scoped embedding bug (details in #1). Everything else was
retracted after it failed to reproduce against the CI uberjar: the
`parameters: []` / load-path / "Cypress fails identically" cluster (#2, #22,
#24, field-61, 12926) died to one shared mechanism — a code path we didn't know
about masked the difference we measured (see #31) — and #3 (search-index drop)
simply doesn't reproduce and was test-infra, not user-facing, to begin with.

The honest headline is **one confirmed bug**, not a count — and it's the right
one to lead with because it's verified and scoped. The stronger case for the
migration is the capability + test-quality evidence below (isolation, real
iframes/downloads, strictly-stronger and de-vacuoused tests), which doesn't
depend on bug count and survived the same scrutiny.

**Do not quote a bug count from an un-cross-checked observation.** The honest,
defensible case for migration does not rest on bug count — it rests on
capability differences the harness demonstrably has and Cypress structurally
lacks (#8 per-worker isolation, #22's retraction is itself a demonstration,
#32 a race only Playwright can see, #33 a green test whose mock never ran),
plus a large set of strictly-stronger tests and vacuous-assertion fixes (#4–6,
#34–38) that make the suite catch things the originals could not. Every bug
candidate has now been through the jar + `--browser chrome` gauntlet: #1 is
confirmed (and cross-checked as a race Cypress cannot see); the other six are
retracted. Lead with #1 and the capability evidence.

## Product bugs found by porting

1. **Enter on a highlighted embedded-search result navigates to `/search`
   instead of the result** (`search.spec.ts`). **JAR-CONFIRMED 2026-07-18 —
   reproduces on the production bundle, and is more severe than first written.**

   The classic `SearchBar` wires two handlers to Enter: the results dropdown's
   `onKeyDown` (navigate to the highlighted result) and the input's `onKeyPress`
   → `goToSearchApp` (go to the full-page `/search` app). A real Enter press
   emits both a keydown and a keypress, so both fire — and `goToSearchApp`
   **wins**, so a user who arrow-keys to a result and presses Enter lands on
   `/search`, losing their selection.

   Probe against the CI uberjar (slot 13, jar mode), embedded app with
   `top_nav=true, search=true`, one ArrowDown to highlight, then Enter:
   - natural `page.keyboard.press("Enter")` → extra `GET /api/search?…&context=
     search-app` fires and the frame ends on **`/search`** (wrong).
   - `realPressEnter` (rawKeyDown+keyUp only, no char → no keypress) → no extra
     request, frame ends on **`/dashboard/10-orders-in-a-dashboard`** (correct).
   The only variable is whether the keypress/char event is delivered, which
   pins the cause to the `onKeyPress` handler firing regardless of highlight
   state.

   **Scope (precise):** the classic `SearchBar` renders only in the embedding
   iframe — `AppBarLarge`/`AppBarSmall` show `<SearchBar>` when
   `isEmbeddingIframe`, else the command-palette `<SearchButton>`. So this hits
   **full-app embedding with the top-nav search bar**, a shipped customer
   config, NOT the normal Metabase app. Reachable by real users (a hardware
   Enter emits keypress in Chromium). The port avoids it with a keydown-only
   CDP helper (`realPressEnter`).

   **Cross-check DONE 2026-07-18 — Cypress structurally cannot catch it.** Ran
   the original `search.cy.spec.js` "allows to select a search result using
   keyboard" against the SAME jar backend (:4114) with `--browser chrome`
   (Chrome 150 headless). It **passes**: it asserts landing on
   `/question/<id>-orders` with exactly one search request, and does — because
   `cy.realPress("Enter")` (cypress-real-events) delivers the char event
   delayed, so the result-navigation wins and `goToSearchApp` loses the race.
   Only the input mechanism differs from the Playwright repro (same backend,
   same browser, same test intent): Playwright's tight keydown→keypress→keyup
   mirrors a real keyboard and exposes the bug; Cypress's delayed dispatch
   hides it. So this is a real, user-reachable race that the Cypress suite is
   **blind to by construction** — the cleanest migration dividend in the file:
   not "a bug we found", but "a class of input-timing bug Cypress cannot see".

2. ~~**Dimension-template-tag cards get empty `parameters`**~~
   **RETRACTED 2026-07-18 — not a bug. Do not cite this as a migration
   dividend.** The original claim was: cards created with dimension-type
   template tags come back with `parameters: []`, so `string/=` filters error
   at query time ("Invalid values provided for operator"), and the Cypress
   original fails identically against the same backend.

   Re-verified against the CI uberjar (run 29569211972's own artifact, slot 11
   / :4111, jar mode). **Every limb of the claim is false:**

   - **`parameters: []` is normal and designed-for, not a regression.** The
     Cypress helper `question()` (`e2e/support/helpers/api/createQuestion.ts`)
     passes `parameters` straight through to `POST /api/card` and never
     derives it, so a fixture that omits it stores `[]` *by construction* —
     always has. Both sides then derive from template-tags on purpose:
     `getParametersFromCard` (`metabase-lib/v1/parameters/utils/template-tags.ts`)
     falls back to `getTemplateTagParametersFromCard` when `card.parameters`
     is empty, and the backend mirrors it in
     `queries/models/card.clj:384 template-tag-parameters`, whose docstring
     says outright: *"An older style was to not include `:template-tags` onto
     cards as parameters… Apparently lots of e2e tests are sloppy about this so
     this is included as a convenience."* `queries/card.clj:24` and
     `embedding_rest/api/common.clj:442,486` use the same fallback.
   - **The filters do render and the query does succeed.** With the fixme
     lifted, the test passes `toHaveURL(/source=Affiliate/)`, renders
     "Affiliate" and "Previous 30 years" in the filter widget, and resolves
     `GET /api/public/card/:uuid/query` (202). Only the *download* step is red.
   - **"Invalid values provided for operator" has a different cause and is not
     UI-reachable.** It comes from `verify-type-and-arity`
     (`query_processor/parameters/operators.clj:54`) when a *variadic* operator
     gets a non-sequential value — i.e. from the fixture's `default: "Affiliate"`
     (a bare string) on a `string/=` tag, and only on the raw-API path where the
     **server** applies the default. The FE normalises it to `["Affiliate"]`
     first; with FE-shaped params the query returns 202 and xlsx/csv return 200.
   - **The download failure is ours, twice over.** (1) A slot backend's
     `site-url` stays `http://localhost:4000` (snapshot-pinned), so
     `/public/question/:uuid.xlsx` 302s to the *dev* backend, which 404s — no
     download event. (2) The FE downloads via a `blob:` URL, so the port's
     `expect(download.url()).toContain("/public/question/<uuid>.xlsx")` can
     never pass. Repointing site-url makes the download fire.

   See `findings-inbox/findings-2-22-reverification.md` for the evidence.

3. ~~**`restore()` can silently kill the search index**~~ **RETRACTED as a
   product bug 2026-07-18 — does not reproduce, and was never user-facing.**
   Original claim: back-to-back `/api/testing/restore` calls drop the async
   search-index rebuild, leaving table search permanently empty until a
   force-reindex.

   Probed against the CI uberjar (slot 13, jar mode): two back-to-back raw
   restores, then poll `GET /api/search?q=Reviews&models=table` for 25s with no
   force-reindex — **7 runs (incl. a cold path that never force-reindexes), the
   table index was populated at t=0 every time, zero drops.** The likely reason
   the harness once needed the mitigation no longer bites: the current
   (regenerated) snapshots ship a persisted index, so restore repopulates it
   immediately — there's no rebuild window to lose.

   Two honest caveats: (a) `/api/testing/restore` is a **test-only** endpoint,
   so even if it reproduced this was never a user-facing product bug — it was
   miscategorized here; (b) I probed the backend index via the API, not the
   exact original FE empty-state scenario (observed in the source/hot-bundle
   era). The `fixtures.ts` poll+force-reindex mitigation is **kept** — it's
   cheap (exits on the first iteration when the index is present, as the probe
   confirms) and harmless defense — but this should not be cited as a bug.

## Tests that got strictly stronger in the port

4. **downloads.spec.ts actually downloads.** The Cypress original intercepts
   export requests, asserts status/content-type, and redirects the response
   away — no file ever lands. The port completes real downloads and parses
   the xlsx/csv (18,760-row assertions are now real). It also found the
   Cypress spec asserting against a wrong endpoint expectation for saved
   questions and *ignoring* the row-count arguments callers passed to
   `assertOrdersExport`.

5. **Dead assertions in the Cypress originals surfaced.** Multiple specs
   carried assertions that could never fail: `search.cy.spec.js` passes a
   callback to jQuery `.first()` (never executed); `suggestions.cy.spec.ts`
   asserts `.should("have.length", 1)` on a `cy.contains` result (always 1
   by construction). The ports made these real assertions — and they pass,
   but now they actually guard something.

6. **Strict mode catches ambiguity loudly instead of clicking the wrong
   element.** Cypress `.contains`/first-match semantics silently act on the
   first of multiple matches; Playwright errors. In `permissions-baseline`
   this exposed that the "run button disabled" assertion was only ever
   checking the first of two run buttons — the second (hidden) one is
   *enabled*, which the Cypress test can never notice.

## Infrastructure findings

7. **Full-app embedding tests now run in a real iframe** (`support/search.ts`
   harness). Cypress fakes embedding by exploiting its own architecture (it
   runs tests inside an iframe and deletes `window.Cypress`). The Playwright
   harness loads the app in an actual `<iframe>` like a customer site —
   which also documented that the backend sends `X-Frame-Options: DENY` +
   `frame-ancestors 'none'` and exactly which headers interactive embedding
   relies on stripping.

8. **Per-worker backend isolation is solved and measured** (`worker-backend.ts`):
   H2 sample-DB file locking, plugins-dir extraction races, nREPL port
   clashes, cold-boot first-query failures — all diagnosed with fixes. CI
   numbers on standard 4vCPU runners: workers=2 → 1.27× wall clock, ~1.4×
   test throughput; matches-to-beats Cypress serial on identical specs and
   hardware, with headroom on bigger runners (2×+ at 4 workers on 14 cores).
   Cypress architecturally cannot parallelize within a run.

## Framework-level simplifications

9. **cypress-real-events is unnecessary.** CodeMirror typing, hover, keyboard
   shortcuts all work with Playwright's native CDP input (`page.keyboard`,
   `hover()`). This retires the exact plugin responsible for the pinned-
   Chrome headless failures from the Chrome-upgrade investigation
   (realHover tooltip hit-testing, realPress kbar dispatch).

10. **dnd-kit drags are real mouse input**, not 40 lines of synthetic-event
    choreography with hardcoded waits (`moveDnDKitElementOnto` — and it's
    target-based rather than pixel-offset-based, so row-height changes don't
    break it).

11. **No pinned browser.** Playwright ships versioned browsers; the
    setup-chrome pinning (and the class of "tests break on Chrome vN"
    migrations) goes away. CI runs needed zero browser-specific flags beyond
    `bypassCSP` (the analog of Cypress's `chromeWebSecurity: false`).

12. **Traces instead of videos**: failure artifacts include full
    DOM/network/console timelines (`--trace retain-on-failure`), which is
    how most of the porting bugs in this spike were diagnosed in minutes.

## Port-cost evidence (for the effort estimate)

- 20 spec files / 137 tests ported (~4,000 Cypress lines), largely by
  parallel agents; **0-2 small fixes per spec**, every one surfaced by
  strict mode or a timeout on the first run — nothing silently wrong found
  later. Fix categories converged quickly (exact-match, wait-inversion,
  hover-gating, strict-mode duplicates) and are now codified in PORTING.md.
- Full suite green in CI serial and 2-worker parallel; two consecutive
  zero-flake CI runs before the parallel experiments began.

## Wave 5 additions (question-saved/new, command-palette, collections, embedding)

13. **Bogus MBQL fixture caught by TypeScript** (`saved.cy.spec.js`): the
    view-only-tag test's join fixture references `PRODUCTS.PRODUCT_ID` — a
    field that doesn't exist (undefined → serialized as `null`), plus
    inconsistent join aliases. Passes in Cypress only because the card is
    never executed. The TS port refused to compile it, which is how it
    surfaced. Ported byte-identically with a NOTE.

14. **Latent copy-paste bug** (`collection-pinned-overview.cy.spec.js:240`):
    the required-parameter test asserts on a *different fixture's* `.name`
    than the one it created — masked because both constants share the same
    name string. Port references the correct constant.

15. **A family of dead/vacuous Cypress assertions** found this wave alone:
    `cy.realPress(["Meta","["])` tests a keybinding that doesn't exist (the
    following assertion passes because the sidebar was already visible);
    chained `cy.get()` silently un-scopes (`commandPalette().get(...)`,
    `tableInteractiveBody().get(...)`); `.then()` used where `.within()` was
    meant (no scoping at all); `should("be.exist")` (works only because
    chai's `be` is a passthrough); a `location("pathname")` check that can
    never catch a slow redirect. All ported as real assertions.

16. **Cypress wait-ordering quirk documented** (`question-new`): upstream
    `cy.wait("@createDashboard")` sits after a click that does NOT trigger
    the request — it passes because cy.wait consumes already-received
    responses. The Playwright port must register the wait at the true
    trigger; a naive 1:1 port would hang. (Porting rule updated.)

17. **Real HTML5 drag-and-drop — the thing Cypress's own comment wishes
    for.** The Cypress spec carries a long apology that synthetic dnd
    events "will not guarantee that the drag and drop functionality will
    work in the real world" and that the test "would not have caught
    metabase#30614". Playwright's `dragTo` drives actual mouse input with
    CDP drag interception — the browser itself synthesizes the full drag
    event stream. The ported pin-by-dragging test now exercises exactly the
    interaction the upstream comment says it can't.

18. **Embedding rendering is context-sensitive and Cypress hid it**:
    /embed/* and /public/* pages render differently when framed (borders,
    hidden action buttons — `use-embed-frame-options.ts`); Cypress tests got
    the framed context *by accident of its architecture*. The Playwright
    iframe harness makes that context explicit and controllable. Also found:
    a dead `database_id` param in the spec's factory call, another
    never-awaited intercept, and a `site-url` coupling in embed preview
    iframes that only shows up with more than one backend.

19. **kbar drops keystrokes in real usage** (`command-palette.spec.ts`,
    instrumented and verified): kbar detaches/re-attaches its window keydown
    listener whenever any action re-registers (RTK Query refetches do this
    at arbitrary times) and keeps it detached while a modal is open or
    mid-close-transition. Keystrokes landing in those windows silently
    vanish — a trusted `?` keydown was observed reaching `window` with no
    handler attached. User-reachable; very plausibly the root cause of the
    kbar `realPress` flake from the 2026 Chrome-upgrade investigation.
    Cypress's inter-command latency masks it; the port handles it with an
    effect-verified `pressShortcut` retry helper (no weakened assertions)
    and documents the dead windows.

## Wave 6 additions (binning, filters, native-filters, dashboard-management, onboarding)

20. **Vacuous 403 assertion across an 18-invocation permission matrix**
    (`dashboard-management.cy.spec.js`): `assertOnRequest` reads
    `xhr.status`, which doesn't exist on Cypress interceptions (it's
    `xhr.response.statusCode`) — so it asserted `undefined !== 403`, always
    true. The port makes the status check real for the first time.

21. **Harness self-defense**: the binning port's agent caught a latent bug
    in our OWN earlier helper (metrics.ts binning picker used
    case-insensitive substring matching — "Total" would select the
    "Subtotal" row). The review loop guards the new harness, not just the
    ported specs.

22. ~~**Third confirmed hit of the dimension-template-tag regression**~~
    **RETRACTED 2026-07-18 — does not reproduce. Do not cite this as a
    migration dividend.** The original claim was that sql-field-filter's widget
    test fails identically in Cypress against this backend, giving FINDINGS #2
    a blast radius across three specs.

    Re-verified against the CI uberjar (run 29569211972's artifact, slot 11 /
    :4111). **The port passes**: `sql-field-filter.spec.ts` is 8/8 with the
    fixme lifted, and the named test is 3/3 under `--repeat-each=3`. It is
    re-enabled in this PR.

    **The "Cypress fails identically" evidence was an artifact of running
    Cypress on a shared box.** The Cypress original (Chrome 150 headless,
    `MB_JETTY_PORT=4111`, no :4000 contact) does fail 3/8 — but with
    `POST 500 /api/card/:id/query`, and the 500 is:

    ```
    Database may be already in use: ".../e2e/tmp/sample-database.db.mv.db".
    Possible solutions: close all other connection(s); use the server mode
    ```

    Snapshots pin database 1 to the **shared** `e2e/tmp` H2 file, which only
    one JVM can hold; this box runs 8+ concurrent slot backends. Our Playwright
    harness re-points database 1 to a per-worker private copy after *every*
    restore (`support/fixtures.ts` restore(), the `sampleDbUrl` block) —
    **Cypress has no such step**, because it never needed one. So the port is
    insulated from a collision Cypress is fully exposed to.

    Controlled proof — same card, same backend, same session, only the repoint
    differs: without it `POST /api/card/:id/query` → **500** (lock error); with
    it → **202, completed, row_count 42**, which is exactly the "Showing 42
    rows" the test asserts. `parameters: []` is present in *both* arms, so it is
    causally irrelevant. Two of the three Cypress failures ("field alias") were
    never part of this claim at all — a tell that the cause was environmental.

    Mechanism note, mirroring #24: a code path we didn't know about (the
    harness's own sample-DB repoint) masked the real difference, and we read the
    resulting Cypress-vs-Playwright split as an app bug.

23. More silently-weak Cypress assertions made real: a Save-button check on
    the `disabled` attribute where the button is actually gated by
    `aria-disabled` (passes vacuously upstream); another `.get()` silently
    de-scoping a `within()` chain in `multiAutocompleteInput`; a regex
    passed to chai-jQuery `contain` (which expects a string).

## Wave 7 additions (native pack, schema-viewer, detail-view, glossary, filters/oauth)

24. ~~**Two more real app bugs — an MBQL5 load-path template-tag cluster**~~
    **RETRACTED 2026-07-17 — does not reproduce. Do not cite this as a
    migration dividend.** The original claim was: (a) card-reference tags no
    longer rewritten to slugs on question load (`GET /api/card/:id` never
    fires from `updateTemplateTagNames`); (b) snippet-inner variable tags not
    surfaced on saved-question load.

    Re-verified against the CI uberjar (run 29569211972's own artifact) while
    chasing an unrelated CI failure: **both sub-claims are false there**.
    `GET /api/card/:id` fires and the rewrite lands (instrumented); the
    `test.fixme`'d card-tag test passes end-to-end and has been re-enabled.
    Both `native-snippet-tags` fixmes also pass on the jar (verified by
    temporarily flipping them; that spec is restored byte-identical).

    One mechanism explains why we mis-read it: where the rewrite *does* land,
    the loaded question is dirty, so the QB runs it via `/api/dataset` and the
    card-query endpoint never fires — which is what the original
    investigation saw and read as "the rewrite never happened". See
    `findings-inbox/native-subquery-ci-failure.md` for the evidence.

    **Caveat**: the source-mode side was not re-verified (slots were busy).
    A stale slot backend or stale hot bundle is the likely explanation, but
    that remains a hypothesis, not a confirmed cause. (An earlier version of
    this note argued a behavioural split was *impossible* because the repo
    outside `e2e-playwright/` is identical between the jar's commit and HEAD.
    That argument is weaker than stated: CI builds a **merge commit**, so the
    jar's `version.properties` hash isn't a repo revision we can diff against.)

    **Action owed — DONE 2026-07-18**: #2 and #22 were re-checked against the
    jar the same way and **both are now retracted too** (see above). The
    "load-path reconciliation cluster" framing is dead: there is no cluster and
    no product bug. `parameters: []` turned out to be a documented,
    deliberately-accommodated condition, and the "Cypress fails identically"
    evidence was H2 sample-DB lock contention between concurrent slot backends.
    Evidence: `findings-inbox/findings-2-22-reverification.md`.

25. **Another silently-ignored assertion argument**:
    `H.NativeEditor.completions("ANOTHER")` — completions() takes no
    argument, so the test only ever checked that *some* completion tooltip
    was visible. Port asserts the named completion.

26. **Latent upstream flake source made explicit** (schema-viewer): the
    Cypress camera-zoom assertions snapshot an *animating* transform via
    `invoke("attr")`; the port's expect.poll genuinely retries. Also: the
    writable-Postgres describe upstream carries no @external tag despite
    requiring live QA containers — a tagging gap.

## Wave 8 additions (self-verifying agent loop)

27. **QA-DB gating can pass by racing** (`document-title` port): the
    "Doing science..." loading assertion flashes even when the QA database
    connection is refused instantly — the Cypress original can go green
    against an unreachable QA DB. Also: `cypress.env.json` hardcodes
    `QA_DB_ENABLED: "true"` regardless of whether containers run.

28. **Silent snapshot staleness after migrations**: `restore-snapshot!`
    only auto-migrates when `config/is-dev?`, which source-mode e2e
    backends (run-mode e2e) never satisfy — local restores silently serve
    pre-migration schemas until snapshots are regenerated; the Cypress
    original fails identically. Found when a 2-day-old migration broke the
    security-center port.

29. **Another no-op test**: bookmarks-collection's "removes items from
    bookmarks list when they are archived" never asserted the removal; the
    port asserts it (passes — behavior fine, test was dead).

30. **Latent time-drift flake in Cypress** (`relative-datetime`): `now` is
    captured at module load with only ~4 minutes of tolerance in the
    minutes-unit tests; the Cypress spec runs ~3.5 minutes — one slow CI
    run from flaking. The port captures `now` per test.

## Wave 9 additions (nine large specs: dashboards, documents, embedding, metrics)

This wave landed nine of the largest specs in the corpus (~22K lines) and, more
importantly, matured how we decide whether a finding is real. Read the
methodology note first — it reframes several earlier entries.

### Methodology: jar mode is the verification default, and it retracted five claims

31. **The single most valuable lesson of the spike: verify against the CI
    uberjar, not the local dev bundle — and the Cypress cross-check proves port
    *fidelity*, never *causation*.** Both harnesses run against one backend and
    one local rspack hot bundle, so a shared environmental cause fails both
    identically while the app is fine. Over this wave, **five product-bug claims
    of exactly this shape were retracted** after checking against the jar: #2,
    #22, #24, `dashboard-parameters`' field-61, and `dashboard-reproductions`'
    12926, across four independent specs. Each was a *real observation* and a
    *wrong inference*. Jar mode is now the default loop (it's what CI runs and
    2–3× faster); source mode is for debugging with source maps only. The
    decider for real-vs-environmental is a different **artifact**, not a second
    harness on the same one. This is a strength of the migration, honestly
    stated: the discipline that caught these is repeatable and now written down.

### Capability differences (things Cypress structurally cannot do)

32. **A real app race only Playwright can see** (`documents-comments`):
    `deleteNewParamFromURLIfNeeded` strips `?new=true` *after* the mutation
    resolves, using a `location.pathname` captured at submit time, so a route
    change inside that window is reverted by a stale `replace`. Instrumented
    `history` and watched Escape's `push /document/1` get undone. Cypress's
    command-queue latency always covers the window, so it passes there.
    **Scope**: the Cypress cross-check passes → not a port defect and not
    CI-catchable; user impact not hand-verified. A genuine candidate, precisely
    bounded.

33. **Playwright does not proxy a redirect's follow-up request** — and it
    exposed a green test that never ran its own mock (`interactive-embedding`).
    Cypress's proxy fronts every hop; Playwright's `route()` does not, so a JWT
    SSO test was passing while its IdP mock had *never once executed* — it only
    waited for the request to be attempted. Isolated with a control: a direct
    `goto` hits the handler, the same URL via a 302 skips even a `() => true`
    catch-all. Fixed with a client-side redirect shim.

    **Scope narrowed 2026-07-20** (`tenant-users-sidecar`): this applies to a
    `page.route`-**mocked** hop. An `/auth/sso?jwt=` redirect served by the real
    backend is the app's own redirect and a plain `page.goto` follows it fine —
    no shim needed. As originally written the entry sounded like it covered every
    JWT SSO port; it does not.

### Tests that got strictly stronger

34. **A resize test that asserts the opposite of the app's behaviour and passes
    by accident** (`documents`). Upstream drags a card's handle down 200px and
    asserts the card gets *shorter*; it passes only because the shared
    `documentDoDrag` helper fires `mouseup` with no coordinates, committing the
    resize at the body centre instead of the drag destination. Measured to the
    pixel (426→264 upstream vs the correct 426→626). The `{y:200}` delta is
    discarded; the test would pass for any delta and flip meaning with layout.
    The port asserts the real behaviour (drag down 200 → grow by 200).

35. **A dead upstream test** (`documents`): `it("should support formatting via
    floating menu")` is declared *inside* another test's callback body, so Mocha
    never schedules it — an entire rich-text-format menu suite that has never
    run, reading as coverage. The port runs it as a real sibling.

36. **`should("be.disabled")` on a menu is an ANY assertion, not ALL**
    (`documents`, `metrics-explorer`, others): chai-jquery resolves it to
    `$els.is(":disabled")`, true if *any* element matches. Upstream "all items
    disabled" passed with an enabled Download item (correct product behaviour).
    Same class as #6. Ports assert per-item intent. **Cross-checked**: Cypress
    passes where the naive port failed — confirmed as port drift, not a bug.

37. **Callback-scoped assertions never enforce** (`click-behavior`): two
    upstream tests assert an href inside `H.onNextAnchorClick`'s callback and
    pass green while asserting an href the app never produces — corroborated
    *within one test body* (asserts a cell reads "October 2026" while asserting
    an href containing `2025-07`). The port asserts outside the callback.

38. **A cluster of vacuous assertions surfaced across the dashboard specs**
    (`dashboard-reproductions`): `cy.tick` misused so a negative assertion
    passed vacuously; `realHover` silently no-ops off-viewport so a tooltip
    check asserted nothing; `enable_embedding` spread into a POST that ignores
    it (killed 5 tests once ported faithfully). Each became a real assertion.

### Infrastructure findings

39. **A harness bug corrupting every slot: `site-url` baked to :4000**
    (found independently by two agents, `dashboard-reproductions` +
    `interactive-embedding`). Snapshots pin `site-url: http://localhost:4000`,
    so every drill-through/`openUrl` navigation on a :410N slot backend landed
    the browser on a *different instance* — and failed silently, because a
    pathname-only assertion still passed. Fixed once in `worker-backend.ts` via
    `MB_SITE_URL`. **Known cost** (documented): env beats the app DB, so any
    test that *writes* site-url is now silently overridden — one fixme records
    it. Reproduces identically under Cypress, so the cross-check does not clear
    it — a backend-setting instance of the shared-cause class in #31.

40. **CSS-module class names are minified in the jar — never select on them**
    (`documents`). A selector matching the class substring `__visible` was green
    in source mode and red on the jar, where the production bundle minifies the
    class to an opaque token (measured `vs_4B O6wZQ`). The textbook case for
    verifying on the jar. Fixed by selecting on computed `opacity`, the real
    signal in both builds.

41. **Viewport drift — the whole spike runs at 1280×720, not the configured
    1280×800** (`interactive-embedding`). `devices["Desktop Chrome"]` silently
    overrides the top-level viewport; caught only because one test asserts the
    height back. Cypress runs 800, so this is a real fidelity gap. **Needs an
    owner** — landed specs may have stabilized against 720; fix + full-suite
    revalidation at a checkpoint, not mid-wave.

42. **Zero-box Mantine modal roots** (`documents`): `ConfirmModal` spreads its
    testid onto Mantine's `Modal` *root*, which is `position: static` with
    `fixed` children and collapses to height 0. Cypress `should("be.visible")`
    passes (visible-child rule); Playwright `toBeVisible()` fails on an open
    modal. Scope assertions to the dialog content. Reusable across every port.

43. **The jar+CI gauntlet catches its own blind spot — local verify-jar drift**
    (`smartscalar-trend`). A port pinned `maxPeriodsAgo` to `47`, the value the
    *local* verify uberjar (COMMIT-ID 751c2a98) clamps to. It passed locally
    8/8 and the `--browser chrome` cross-check on the same jar "confirmed" 47.
    CI's freshly-built jar clamps to **48** (matching upstream) — the max is
    derived from the sample DB's month span, so it is jar-/sample-data-dependent,
    and the local jar simply carried older sample data. CI caught it (1/402 on
    shard 4). Two lessons for the case: (a) the fidelity cross-check proves the
    port matches the original *in that environment* but is blind to a skewed
    environment — it is not a substitute for CI on the fresh jar; (b) the fix is
    to assert the *behaviour* (over-max input clamps to `[min, typed)`) not a
    data-derived magic number, which makes the Playwright port strictly more
    robust than upstream's hardcoded `48`. This is the process working as
    intended, not a regression — worth citing as evidence the verification loop
    is honest about its own limits.

44. **A keyboard shortcut Playwright fires and Cypress can't** (`user-settings`).
    The dark-mode toggle is a tinykeys global shortcut `$mod+Shift+KeyL`. In the
    Cypress suite this was unreliable in headless Chrome — cypress-real-events'
    `realPress` (CDP keyboard dispatch) never reached the handler, so the
    **original spec abandoned real input and dispatched a synthetic
    `KeyboardEvent`** via `cy.trigger`. The port uses a real
    `page.keyboard.press("ControlOrMeta+Shift+KeyL")` and it fires **5/5 across
    1+2+3 runs, zero fallback**: Playwright's real input delivers a genuine
    `KeyboardEvent` that satisfies tinykeys' `instanceof` check where CDP dispatch
    could not. Second independently-evidenced instance of #1 (an input Playwright
    drives that Cypress structurally can't), and it confirms the exact hypothesis
    from the Chrome-upgrade investigation. The proof is upstream's own synthetic
    fallback — Cypress conceded real input here; Playwright doesn't need to. This
    is a strictly-stronger port, not a faithful one.

## Wave 10 additions (pivot_tables, embedding-dashboard, dashboard-cards/filters repros, column-compare)

Five specs / ~145 tests, all green on the jar. **No product bugs** — every
failure this wave was port drift, fixed and (where a bug was plausible)
disproven by the `--browser chrome` cross-check. The dividends are test-quality
and a migration caveat, not bugs:

- **Engine caveat (worth knowing for the migration):** Playwright's bundled
  Chromium differs from Chrome in pixel/text metrics — SmartScalar truncation
  lands differently, so pixel-exact text tests are engine-sensitive. Cross-check
  passes under Chrome while the Chromium run fails; not a bug or drift. Handled
  with `test.fixme` + recorded cross-check (dashboard-card-reproductions).
- **More vacuous assertions surfaced:** `column-compare`'s entire suite is
  `@skip` (feature disabled) — verified the helper chain still exercises real
  behaviour by temporarily un-skipping; `embedding #66742`'s `IsSticky` class
  assertion is a no-op on the minified jar bundle (needs a `data-*` hook).
- **Consolidation debt is now worth a pass** (flagged repeatedly this wave):
  `caseSensitiveSubstring`/text matchers duplicated across 5+ support files
  (→ `support/text.ts`); `findDisplayValue`/`assertIsEllipsified`/
  `updatePermissionsGraph`/`createQuestionAndAddToDashboard` duplicated across
  repros modules; typed wrappers (`visitPivotAdhoc`, `createPivotQuestion`) exist
  only because shared `api.createQuestion` / `permissions.visitQuestionAdhoc`
  param types omit `visualization_settings` (both forward it at runtime —
  widening the types deletes the wrappers). New gotchas → PORTING.md wave-10.

See `NOTES-parallelism.md` for the read-only-pool / seeding analysis done this
session, and `findings-inbox/` for per-spec detail.

## Batches 8–11 additions (66 inbox entries reconciled 2026-07-20)

66 per-spec inbox entries merged in one pass. **No new confirmed product bugs**
— 60 of the 66 explicitly record "no product-bug claims", which under #31 is the
expected and healthy outcome, and worth stating plainly: sixty consecutive specs
went through the jar loop and produced nothing to retract. Two observations rise
to *open product questions* (#45, #46) and are labelled as such, not as bugs.

The most valuable material in this batch runs **against** the migration case.
Four findings (#47–#50) are costs, losses, or overclaims. They are recorded here
in the same detail as the wins, because a case that only survives favourable
evidence isn't worth making.

### Two open product questions — NOT confirmed bugs

45. **Tenant collections are selectable in a non-tenant collection's move picker,
    and upstream passes only on search-index lag** (`entity-picker-shared-tenant-collection`).
    `/api/search?context=entity-picker` returns collection hits with
    `namespace: null` (12/12 polls against the EE jar after a full force-reindex),
    while `/api/collection/:id/items` does carry it. `SearchResultsItemList` gates
    selectability on `PLUGIN_TENANTS.canPlaceEntityInCollection`, whose EE impl
    (`tenants/utils/utils.ts:44`) reads `collection.namespace` — so a tenant
    collection reads as a regular one. Upstream's `should("not.exist")` passes
    because a freshly-created collection isn't searchable for ~1–2s and the check
    lands before the debounced search returns; the Chrome cross-check on the same
    jar confirms the timing accident. **Jar status:** the namespace omission and
    the leak were observed directly on the CI EE uberjar, so this clears the
    environmental bar that killed #2/#22/#24. **Not established:** user-facing
    severity, or whether anything outside the picker-move flow is affected. The
    port stayed faithful to the racy timing rather than asserting the leak.

46. **"Explain this chart" renders inside full-app embedding, and
    `should("not.exist")` is structurally blind to it** (`metabot`). Both the
    navbar metabot icon and `AIQuestionAnalysisButton` share one gate
    (`useUserMetabotPermissions().hasMetabotAccess`) with no embedding-specific
    check on the latter; the QB toolbar just mounts ~160ms after the navbar. A
    dedicated Cypress ground-truth spec on the same jar measured
    `{after: 0, settled: 1}`. **Jar status: jar-observed, and the fidelity
    cross-check passes on the same jar — but nobody has established that the
    explainer appearing in embedding is a defect rather than an intended
    affordance.** Open product question, not a bug claim. The durable dividend is
    the mechanism, which is new: Cypress `should("not.exist")` passes on its
    *first* absent poll and never re-checks, so **any assertion of absence inside
    a mount-lag window is vacuous by construction** — a distinct class from the
    #15/#38 family.

### Findings that cut against the migration case

47. **The first recorded case of the migration REDUCING coverage**
    (`document-metabot`). Upstream stubs at the Anthropic wire level via
    `cy.task startMockLlmServer` and lets the real backend run
    `document_construct_sql_chart` — SQL validation, query construction,
    `draft-card-from-chart-output`. Jar mode can't reach an LLM, so the port mocks
    the FE-facing `POST /api/metabot/document/generate-content` one hop below,
    and the backend tool pipeline is no longer exercised **at all**. The pitch
    rests on capability differences; the one running the other way needs stating.
    Closeable — `ai-controls` (#51) built exactly the mock-LLM fixture this needs.

48. **Real CDP input is not uniformly better than Cypress's — here it is worse**
    (`custom-column-1`). Accepting the `coalesce` completion inserts a
    Tab-navigable CodeMirror snippet; typing an argument's `[` fires
    close-brackets plus the column autocomplete, and that transaction *exits the
    active snippet*, so the next Tab indents instead of advancing. Probed
    exhaustively: plain text advances, any `[` kills it; Enter-accept,
    click-accept, Escape-then-Tab, ArrowRight-then-Tab and a 300ms settle all
    fail. The Cypress original passes both tests on the *same* slot-4 jar backend
    under `--browser chrome`, so the app is correct and this is purely
    `realType`-vs-`page.keyboard`. The honest counterweight to #1 and #44: real
    input is *different*, not strictly better, and here Cypress's dispatch was the
    safer one. Port matches outcome via `keyboard.insertText` (no key events).

49. **The ported-but-never-executed tier is now large enough that headline
    numbers must separate it.** In batch 11 alone, `dependency-graph` (16 tests),
    `dependency-unreferenced-list` (11) and `database-routing-admin` (15) are
    faithful, tsc-clean, and comprise **42 tests that have never run a single
    assertion** — all gate on `PW_QA_DB_ENABLED` plus a token, and a green local
    run means "correctly skipped". The wave-11 rule says this per-spec, but the
    port-cost section quotes ported test counts without separating tiers. Any
    number we publish must distinguish **ported-and-verified** from
    **ported-and-gated**, or the effort estimate silently claims coverage the
    spike has not demonstrated.

50. ~~**A whole class of specs can never run in CI — the `postgres-writable`
    snapshot is gitignored**~~ **RETRACTED 2026-07-20 — the inference was wrong.
    Do not cite this.** The original claim was that because
    `git check-ignore e2e/snapshots/postgres_writable.sql` reports IGNORED, the
    artifact CI needs "does not exist", so `@external`/QA-DB specs could never
    run in CI even once ported.

    **Every limb of that inference is false:**
    - **All snapshots are gitignored** — `/e2e/snapshots/*` is a blanket
      `.gitignore` entry covering `default.sql`, which every landed spec in this
      spike uses. Snapshots are **generated at CI time**, never committed, so
      "gitignored" carries no information about CI at all.
    - **Cypress CI runs these specs today.** `.github/workflows/e2e-test.yml`
      provisions maildev, openldap, webhook, snowplow, **postgres, mysql and
      mongo** containers, and runs with
      `grepTags="-@mongo+-@python+-@OSS+-@skip"` — which does **not** exclude
      `@external`.
    - **The gap is our own spike workflow's scoping choice**, one line:
      `e2e-playwright.yml:114` generates snapshots with
      `grepTags="-@external"`, deliberately skipping the QA-database snapshots.

    **What is actually true**, and all that should be claimed: these specs are
    ported-and-gated *in the Playwright spike's current CI config*. Unblocking
    them is a workflow change that mirrors what `e2e-test.yml` already does —
    add the QA-DB containers and drop `-@external` from the snapshot step — not
    an infrastructure impossibility. `transforms-codegen` remains the cheapest
    proof case (its LLM is already fully stubbed via canned SSE).

    **Mechanism note, and the reason this entry is kept rather than deleted:**
    this is the same failure mode the file keeps documenting — a real
    observation (`git check-ignore` really does report IGNORED) turned into a
    confident causal claim without checking the one thing that would falsify it
    (what CI actually does). #31 is about exactly this, and the author of this
    entry had read #31.

### Vacuous upstream assertions — two new mechanisms

51. **Intercepts and waits that cannot match what they name.** Four independent
    instances this batch, all a step beyond #16 (which was about *ordering*):
    here the pattern could never have matched. `admin-tools`' `/api/task` glob
    intercepts (`?` matching a literal `?`, remainder exact with no `*`) match
    only the fully-unfiltered request, so every filtered request falls through to
    the real backend and `filtering should work` silently asserts against live
    sync data. `content-translation-dashboards` waits on the app-mode card-query
    POST inside describes that run in **static embeds**, which never call that
    endpoint at all. `homepage`'s x-ray alias is table-only
    (`/api/automagic-*/table/**`) while the zoom-in drill fires
    `/api/automagic-dashboards/field/53`, so the second wait was satisfied
    retroactively by the first click's stale response and the drill was never
    verified. `public-resource-downloads` matches dashcard exports with
    `…/card/*/<type>`, so the `questionId` every caller threads in never
    constrained anything. All four ported as predicates that actually match.

52. **Mocks that cannot affect what they appear to control.** `admin-tools-help`'s
    `mockSessionPropertiesTokenFeatures` is inert for the "Helping hand"
    visibility it appears to drive — that reads the **active token** via the
    settings bootstrap, a path the `/api/session/properties` intercept never
    reaches. The tests pass because of the real token, not the mock. Ported
    faithfully with the inertness documented, so nobody later "fixes" a test by
    editing a mock that does nothing. Related: `metrics-browse`'s
    "should respect the user setting" forces
    `browse-filter-only-verified-metrics = true` (already the backend default)
    and then asserts `aria-selected="false"` — it passes only because the toggle
    renders false before the forced setting hydrates and Cypress's retry latches
    onto that first frame. Almost certainly a copy-paste bug; the port drives
    `false` so the test finally exercises its stated intent.

53. **#25 again, but with proof it mattered** (`line-bar-tooltips`).
    `e2e-visual-tests-helpers.js:184`'s `tooltipHeader()` takes no parameters and
    asserts nothing, so every `H.tooltipHeader("2025")` in the spec is a no-op.
    Porting those strings as real `assertEChartsTooltip({ header })` assertions
    *fails* — `testAvgTotalChange`'s index-1 tooltip actually reads "2026". The
    ignored argument was not merely unchecked, it was **wrong**: had it ever been
    enforced, the suite would have been red.

### Tests that got strictly stronger

54. **Jar speed makes sub-poll-interval UI states unobservable — so the port
    controls the window instead of racing it** (`whitelabel`). The custom loading
    message renders only in the QB overlay while a query runs; against the jar's
    static assets that window is shorter than Playwright's poll interval, so
    `toBeVisible` missed it every time where Cypress's retry-until-timeout
    happened to catch the flicker. The port holds the response ~1.5s with
    `page.route(…) → route.continue()`, making it a real assertion on a
    controlled window rather than a race won by luck. Generalises to every
    "assert the transient loading/spinner text" port.

### Infrastructure

55. **A real mock-LLM server, and why stubbing at the browser would have made
    every quota test vacuous** (`ai-controls`). The obvious port
    (`mockMetabotResponse`) fulfils `POST /api/metabot/agent-streaming` at the
    browser — but the entire point of these tests is the backend's
    `usage/check-usage-limits!` logic, so all 17 quota assertions would have
    passed without exercising anything. The faithful mechanism is upstream's: a
    Node HTTP server impersonating the Anthropic Messages API, pointed at by
    `llm-anthropic-api-base-url`, so traffic flows through the real backend and
    only the provider call is stubbed. The port binds an **ephemeral port**
    (`listen(0)`) instead of Cypress's fixed 6123, so it cannot collide with a
    sibling worker. This is the missing `cy.task("startMockLlmServer")` analogue
    and it unblocks #47.

56. **Gate audits reclaim coverage — two directions, both cheap.** `custom-viz`
    restores the `postgres-writable` snapshot but every question queries the
    sample H2 DB and the writable Postgres is never touched; swapping to
    `"default"` makes the whole 54-case spec runnable on the bare jar with
    nothing exercised changed. `homepage`'s SQLite x-ray tests need no container
    either — they use the built-in `sqlite` driver against the repo-root
    `resources/sqlite-fixture.db`, which resolves because slot backends run from
    `REPO_ROOT`. Conversely `admin-permissions` tags 12 permission-table tests
    `@OSS`, excluding them from CI's EE leg, but all 12 pass on the EE jar with
    no token active; gating on "no token" rather than "OSS build" reclaims them.
    Inverse of #26's tagging gap — and auditing snapshot/gate dependencies during
    a port is nearly free.

57. **Search-backed browse pages refetch exactly once, so a stale post-`restore()`
    index is permanent** (`metrics-browse`). Browse > Metrics reads
    `/api/search?models=metric`; after a mutation RTK invalidates the `card` list
    tag and the page refetches **once** on remount, then caches forever.
    `restore()`'s force-reindex is async, so a mutation issued moments after
    restore is read against a still-settling index and the page stays wrong for
    the rest of the test — assertion retry cannot rescue it because no second
    fetch is ever issued. A backend probe confirmed moderation is reflected
    synchronously, so this is a reindex-settle race, not a product bug. Applies to
    every search-backed browse/list page.

58. **Harness self-defense, second instance** (`remote-sync`, fixing
    `support/snippets.ts` — same class as #21). `setupGitSync` runs a bare
    `git init`; on a runner with no global `init.defaultBranch` that creates
    `master` while the sync settings configure `remote-sync-branch: "main"`, so
    the import finds no ref and fails. Fix: `git branch -M main` after the first
    commit (works pre-2.28, unlike `git init -b main`) plus
    `commit.gpgsign=false` so an inherited signing config can't break the commit
    on a signing-less runner. **Already landed** in `support/snippets.ts:143,148`
    (commit `8cbe3b6d915`) — the inbox entry recorded it as owed, but the
    remote-sync port had applied it; verified in place during this reconciliation.
    Also measured there and correcting the `snippets` inbox entry: remote-sync
    endpoints are **premium-token-gated** (`PUT /api/ee/remote-sync/settings`
    returns 402 without a token), not `:feature :none` — both specs pass only
    because the jar activates `pro-self-hosted`.

59. **Real git push/pull is covered and needs no external server**
    (`remote-sync`). `setupGitSync()` builds a throwaway repo under `$TMPDIR` and
    the backend clones `file://…/.git` in-process. The read-write describe
    (create branch, push, switch, force-push, stash-to-branch, discard) passes
    8/8 locally. It doesn't run in the spike's CI only because that describe's
    `beforeEach` restores `postgres-writable` despite the tests never touching
    that DB — a gating over-reach worth revisiting. (Originally cited #50 as
    "can't run in CI"; #50 is retracted — the spike's workflow simply doesn't
    generate QA-DB snapshots, and Cypress CI runs these specs today.)

60. **Consolidation debt has crossed from "worth a pass" to "costing every
    port".** Five more independent duplications in one batch of eleven specs:
    `createOfficialCollection` is the **4th** independent `createCollection`
    variant (the shared ports all drop `authority_level`); `ORDERS_COUNT_QUESTION_ID`
    is re-derived locally for the **3rd** time; `createPublicDocumentLink`
    duplicates `createPublicLink` solely because the document endpoint uses a
    different slug; `mockMetabotResponseWithDelay` is a strict superset of the
    shared `mockMetabotResponse`. The driver is the "new module per agent, don't
    edit shared files" rule interacting with parallel agents — correct during the
    spike, but the fix list is now concrete and scheduled in PORTING.md.

61. **Marginal port cost in a covered domain is now near zero**
    (`content-translation-questions`). Third spec in that domain: 3 tests, 6/6
    under `--repeat-each=2`, and **no support file was created at all** — the
    existing content-translation helpers, `visitEmbeddedPage` and the shared
    factories covered it entirely. A concrete data point for the effort estimate:
    the third spec in a domain costs roughly the diff, not the harness.

## Batch 12–13 additions

### A capability the spike had been leaving on the table

62. **Snowplow events can be captured at the browser boundary — no micro, no
    container, no cross-slot contention** (`search-snowplow`). PORTING rule 6
    said stub snowplow to no-ops; applied to a spec whose *subject* is analytics
    that would have produced **26 no-op tests**. The working mechanism instead:
    `page.addInitScript` overrides `window.MetabaseBootstrap` to force tracking
    on and point the collector at the app's own origin, then `page.route`
    base64url-decodes the tracker's `tp2` POST body — yielding `data.data`
    byte-identical to what micro exposes, which is exactly what
    `expectUnstructuredSnowplowEvent` matches on.

    Two things make this a genuine dividend rather than a workaround. First, the
    **CORS discovery**: the tracker sends `application/json` plus `SP-Anonymous`,
    so a cross-origin collector triggers a preflight — and **Playwright does not
    intercept preflight `OPTIONS`**, so the real POST is never sent and the
    capture sees nothing. Re-pointing the client at the app origin removes CORS
    entirely, and this generalises to *any* port trying to observe a POST body
    sent to a third-party origin. Second, a shared snowplow-micro on :9090 has a
    structural problem this avoids: `resetSnowplow` wipes one global store that
    every parallel worker shares.

    **Proven on three independent specs with zero modification to the helper** —
    `search-snowplow`, `data-studio-metrics` (which reported that stubbing would
    have made three of its tests no-ops), and `visualizer-snowplow-tracking`
    (whose matcher shapes and count-accumulation assertions the original never
    exercised). It is now the documented default for snowplow-subject specs.

    **Stated gap:** it cannot reproduce `expectNoBadSnowplowEvents`, which asks
    micro for **Iglu schema validation failures**; the port degrades that to a
    structural check, so it does NOT catch "the FE emits a field the schema
    rejects". Closing it means running `snowplow/iglu-client-embedded/schemas`
    through a JSON-schema validator (`ajv` is already in the repo root).

    The rule change also has to survive its own converse, and it did:
    `data-studio-snippets` correctly judged the *opposite* way — upstream calls
    `resetSnowplow` but asserts no events at all, so capture would have bought
    nothing. Its 14 tests carry no analytics coverage, upstream included, and
    that is now written down rather than papered over.

### More upstream tests that assert nothing

63. **A test with no assertion whatsoever** (`data-studio-library`): "should let
    you move metrics into the library, even when empty" ends on a `Duplicate`
    click and simply stops — it would pass if the duplicate returned 500. Ported
    with the test's stated intent made real: anchor the `POST /api/card`
    response, assert 200 and `collection_id === <library-metrics id>`. The
    starkest member of the #15/#38/#51 family so far.

64. **An absence assertion aimed at the wrong object** (`measures-data-studio`):
    the deletion test creates "Measure to Delete", then asserts
    `verifyMeasureNotInQueryBuilder("Total Revenue")` — a measure it never
    creates and that `restore()` guarantees absent. The deletion was never
    verified. Ported against the right name; it passes, so the behaviour is fine
    and only the check was empty.

65. **Absence checks that pass just as well on a broken page**
    (`application-permissions`, three instances). Each asserts X is absent from a
    container the test never asserts is *present*. The strongest is the
    notifications list, where the whole claim is "the subscription is listed but
    unremovable" — an empty list satisfies it identically. All three are now
    gated on the container, and on "Subscription" actually being listed; they
    still pass, so the gates are load-bearing rather than cosmetic. Ported as
    non-retrying `count()` per #46's one-shot rule, not as a stronger
    `toHaveCount(0)`.

66. **A poll that returns before the thing it waits for**
    (`multi-factor-auth`): `H.getInbox()` resolves as soon as the inbox is
    non-empty, and both email tests already have an enrollment notification
    sitting there — so it returns before the email under test is necessarily
    sent, making the following `to.exist` a timing coin flip. Ported as a
    subject-matching wait, and `expect(code).to.be.a("string")` tightened to
    `/^\d{6}$/`.

### Infrastructure

67. **A green run that never ran: maildev 3.x silently disables every email
    test** (`multi-factor-auth`). maildev 3.x moved its REST API to `/api/email`,
    so `isMaildevRunning()` probes the 2.x path, reports false, and every email
    test gate-skips — while the suite reports green. `bunx maildev` installs 3.x
    by default, so this is the easy mistake, not the exotic one. Pin
    `maildev@2.0.5`. Same failure shape as #49: the exit code is not the
    coverage number.

68. **A container dependency inherited from a helper is not automatically a real
    dependency of the test** (`application-permissions`). `H.setupSMTP()` PUTs
    `/api/email`, which live-validates and therefore needs maildev — but the test
    calling it never reads an inbox; it only needs the "email is configured"
    state. Swapping to `configureSmtpSettings` (bulk `PUT /api/setting`, no
    validation) kept the test executable on the bare jar instead of gate-skipped.
    Cheap win, and the same audit that #56 describes for snapshots.

### The SDK-iframe tier — feasibility settled

69. **The 28 deferred SDK-iframe specs are PORTABLE, with no hard blockers, and
    all three assumed obstacles were false or cheap.** `embed.js` needs no SDK
    build — confirmed by measurement, not assumption: it ships in the uberjar at
    82,224 bytes and `GET :4105/app/embed.js` returns exactly that off a slot
    backend, so upstream's `mockEmbedJsToDevServer` is a hot-reload convenience
    and was dropped. The `:4000` hardcoding is not structural — it appears in
    three places that must merely agree (script `src`, `instanceUrl`, test-page
    origin), all now derived from `mb.baseUrl`; no product code reads `:4000`.
    And `visitCustomHtmlPage` is *less* machinery in Playwright than in Cypress
    (`page.route()` + `fulfill()` + `goto()`). Proof spec `authentication`:
    **16/16, 32/32 under `--repeat-each=2`**, tsc clean; 3 first-run failures,
    all port drift, no bug claims.

70. **Cypress's `chromeWebSecurity: false` has been doing invisible work, and
    two browser security mechanisms surface the moment you stop disabling it.**
    Both were found porting the SDK harness, and both look exactly like product
    regressions:
    - **Credentialed CORS**: a wildcard `Access-Control-Allow-Origin` is rejected
      for `credentials: "include"`. Fix: echo the caller's Origin.
    - **Private Network Access**: `http://example.com` → `http://localhost:4105`
      is refused — *"the request client is not a secure context and the resource
      is in more-private address space `loopback`"*. `embed.js` never loads, the
      iframe never exists, and it reads as the app being broken. **Critically,
      `grantPermissions(["local-network-access"])` does NOT lift this** — the
      blocker is the secure-context requirement, not a permission. Fix: upgrade
      non-loopback test origins to `https://` (faithful, because `_getIsLocalhost`
      reads hostname only).

    **This qualifies #7's harness**, which leans on that `grantPermissions` call
    — it works there only because that page's origin is already loopback. Anyone
    reusing #7's approach from a non-loopback origin will hit this.

71. **Method note: proving you are on your own slot requires falsification, not
    assertion** (the #39 discipline applied). Content assertions cannot prove it —
    `:4000` serves identical sample data, which is exactly why #39 failed
    silently. The harness ships a two-leg guard and the agent **falsified both
    rather than asserting them**: leg 1 rejected a deliberate misdirection at
    another live slot (`:4104`), producing
    `Expected /^http:\/\/localhost:4105/ Received "http://localhost:4104/embed/sdk/v1…"`;
    leg 2 writes a slot-unique marker to the app DB and reads it back *from
    inside the embed iframe's own document*, then re-writes a second marker to
    track the change — proving live backend state rather than anything the
    harness injected. **Scope caveat on record:** `:4000` was not running during
    that session, so a `:4000` misdirection would have failed loudly anyway. The
    guard is what makes this trustworthy on a box where `:4000` *is* up — the
    normal dev machine, and the exact condition of #39.

72. **The tier is two groups, not one — and that halves the scary number.** The
    13 `sdk-iframe-embedding-setup/` specs **do not use the embed.js harness at
    all**: they are ordinary admin-UI tests that visit `/admin/embedding` and
    drive the setup flow, with only 2 touching `loadSdkIframeEmbedTestPage` once
    each. They need a port of their 200-line spec-local `helpers/index.ts` —
    normal work, no novel infrastructure.
    - **Group A** (14 specs genuinely needing the harness): ~7–9 sessions, with
      one ~20-line gap to close first (`prepareGuestEmbedSdkIframeEmbedTest`,
      needed by 3 specs). Highest variance: `guest-token-refresh` (1018 lines).
    - **Group B** (13 setup specs): 1 session for the shared helper, then 4–5 to
      fan out.
    - **Total ~12–14 sessions**, which is the spike's remaining runway of
      genuinely CI-verifiable work.

    Flagged upside worth a dedicated look: in `sdk-iframe-embedding.cy.spec.ts`
    upstream **explicitly gives up on `cy.clock()` inside the iframe** and falls
    back to real timeouts. `page.clock` installs into frames, so that block may
    become both faster and deterministic — a likely capability win of the same
    shape as #1 and #44.

### The absence-assertion class — the biggest test-quality finding of the spike

73. **All 8 absence assertions in `custom-elements-api` were vacuous upstream,
    proven by inversion.** `H.getSimpleEmbedIframeContent()` gates on
    `data-iframe-loaded`, which fires *before* the embed paints — measured:
    iframe loaded +0ms, metabot chat +92ms, drill popover +243ms. Every
    `should("not.exist")` in that window is satisfied by "nothing has rendered
    yet". Verified the right way: each input was **inverted**
    (`with-title="false"`→`"true"`, `drills` off→on, `embedded-metabot-enabled?`
    false→true) and **all 8 stayed green with the behaviour under test
    reversed**. Reading the source would not have established this.

    All 8 now carry an anchor and were re-mutated to confirm they fail for the
    right reason (8/8 red). Six anchor on content present in both variants —
    including the disabled component's own error text
    ("Metabot is not enabled for embedded analytics."), a discriminating signal
    found by dumping the disabled DOM. Two `drills="false"` cases have no DOM
    signal for "the click was ignored" and use a bounded 3s settle against the
    measured 243ms (>12× margin), documented as the honest fallback rather than
    a habit.

    Sub-trap worth its own rule: **a locator that exists in a pre-interaction
    placeholder form gates nothing.** `data-step-cell` resolves in ~3ms because
    the empty notebook step is already mounted; the anchor has to be the step
    *naming Orders*.

74. **A correction to our own playbook, caught by two agents and proven by a
    third.** PORTING.md had claimed Cypress's `should("not.exist")` is a one-shot
    check and that agents should match it with a non-retrying
    `expect(await loc.count()).toBe(0)`, on the reasoning that a retrying
    `toHaveCount(0)` would be "stronger than the original". **That is backwards.**
    Both forms retry and both pass at the first absent observation — they are
    equivalent, and `toHaveCount(0)` is the faithful port. The non-retrying form
    samples one instant, is *stricter*, and can go falsely red.

    Not theoretical: `select-embed-options` written to the bad rule flaked
    **1-in-36** (the wizard re-renders its preview in place, so the one-shot
    count catches the outgoing DOM); converted to retrying, **63/63**. 28
    assertions across 7 specs were written this way before the rule was fixed.
    Recorded because the spike's credibility rests on the playbook being
    correctable, and because it is a clean example of the failure mode this file
    keeps documenting: a plausible mechanism asserted without measurement.

76. **A test whose entire subject can be deleted without turning it red — with a
    control that makes the claim sharp** (`select-embed-entity`). Removing the
    *whole* entity-picker interaction from "can search and select a dashboard"
    leaves the test **green**: it creates "Acme Inc" in its own body, and the
    wizard defaults to the most-recently-created dashboard (the EMB-1179
    behaviour the file's last test asserts), so the picker merely re-selects what
    was already selected. What makes this a finding rather than a guess is the
    control: the identical probe against the sibling "can search and select a
    question" **fails**, because its default is a different question. So the
    weakness is specific to the dashboard case, not a property of the harness.
    Ported faithfully rather than strengthened — the fix is upstream's to make.

77. **Upstream's CSV assertions inspect the WRONG BYTES** (`sdk-csv-downloads`) —
    a sharper instance of #4. The spec intercepts `/api/dataset/csv` and calls
    `res.send({ statusCode: 200 })`, **replacing the response body**; the file
    `cy.verifyDownload` then inspects is Cypress's replacement, not the actual
    export. So the assertions never witness what the endpoint produced. The port
    completes the real download and asserts against the saved file — confirmed a
    genuine pivoted export (51 lines,
    `Created At: Month,0,20,…,Row totals`) — which means it now actually
    witnesses the metabase#70757 fix the test is named for.
    **Stated gap:** CSV validity is checked structurally (every record splits to
    the same field count), not with a real parser — upstream uses `csv-parse`,
    which is not a dependency of this package. Weaker than upstream on that axis,
    deliberately recorded rather than quietly dropped.

78. **`installSnowplowCapture` reaches inside the embed iframe — proven, not
    assumed.** `page.addInitScript` runs in every frame and `page.route`
    intercepts every frame, so the shared capture sees events fired from within
    a cross-origin embed. Payload printed to confirm: exactly one
    `{"event":"dashboard_pdf_exported","dashboard_id":10,"dashboard_accessed_via":"sdk-embed"}`.
    Every remaining sdk-iframe spec whose snowplow events are the subject can
    therefore capture rather than stub. (Eighth independent reuse of the helper
    with zero modification.)

79. **CI builds a MERGE commit, so CI's jar contains master code our branch does
    not — a sharper and nastier variant of #43.** #43 was about stale *sample
    data* in the local jar. This is stale *product code*: upstream
    `8dd86422fec` (Jul 18) moved the subscriptions sidebar onto the shared
    `Schedule` component (lowercase "Sent *hourly*",
    `data-testid="select-frequency"`) **and updated that very Cypress spec in the
    same PR**, away from `findByDisplayValue`. Our branch doesn't contain it;
    CI's merge jar does. The port was faithful to the original as it existed at
    fork time, and CI was right to fail it.

    ⚠️ **Caveat on the technique, learned the hard way 2026-07-20:**
    `PW_KEEP_SLOT_BACKENDS=1` **silently ignores `JAR_PATH` if the slot backend
    is already up** — it prints `(reused)` and keeps its original jar. A later
    agent produced a whole evidence table against the stale local jar while
    believing it was on the CI one, caught it via `ps`, and redid every
    load-bearing run. **Kill the slot backend before switching jars, and verify
    with `ps` or `version.hash` vs `COMMIT-ID` rather than trusting the env
    var.** This is the same "reports success while doing nothing" class as #67.

    **The technique that settled it, worth reusing:** download **the exact
    uberjar CI ran** (from the run's artifact — here `COMMIT-ID e45bd0c9`), boot
    a slot from it, and reproduce locally. That converts "CI-only, can't
    reproduce" into an ordinary local debugging loop, and it produced a
    before-red/after-green on the *same artifact* — far stronger evidence than a
    green on our stale jar. It also directly measured the control value flipping
    from `"Hourly"` to `"hourly"`/aria `Frequency` between the two jars.

    **Accepted trade-off, documented in the spec header:** the fixed test now
    **fails on our stale local jar** (which has no `select-frequency`). Local
    re-verification of that spec requires a jar containing `8dd86422fec`. Same
    shape as the trade already accepted for the #22/#24 re-enabled tests.

    **Standing hazard this implies:** any spec verified only against our local
    jar may be stale with respect to CI's merge jar. Long-lived branches make
    this worse the longer they run.

80. **A hardcoded plan→feature table is billing data living outside the repo, and
    it drifts** (`admin-tools-help`). FINDINGS #52 correctly established that
    `mockSessionPropertiesTokenFeatures` is **inert** for the "Helping hand"
    section — `initializePlugin()` gates `PLUGIN_SUPPORT.isEnabled` on
    `hasPremiumFeature("support-users")`, called at module scope from
    `app.js:65` reading `window.MetabaseBootstrap`, which no
    `/api/session/properties` intercept can reach. But that mechanism was **not
    what reddened CI**. The actual cause: the staging **`pro-self-hosted` token
    now grants `support-users`** — measured, all four tokens return true, and
    the served `#_metabaseBootstrap` confirms it. The upstream test hardcodes a
    plan→feature mapping that is not repo state, and it drifted out from under
    the test.

    Fixed by asserting the **relationship** rather than the table: read the
    bootstrap grant per document and assert the section renders iff granted. Still
    non-vacuous — the no-token step is a hard negative independent of any plan,
    and four sibling tests still require `pro-cloud` to render the section.
    **Unexplained and recorded as such:** the first local run of the unmodified
    spec passed before probing began. `token_check.clj`'s 12h soft-TTL cache is
    the obvious candidate; it was not proven and is not claimed.

81. **A port can be faithful line-by-line and still functionally inert — and
    deleting the original would break tooling SILENTLY** (`coverage-baseline`).
    `coverage-baseline.cy.spec.js` is not a product spec: it is instrumentation
    scaffolding. `.github/scripts/e2e-spec-globs.mjs` exports it as
    `BASELINE_SPEC` and `listSpecFiles()` explicitly `ignore:`s it, while
    `config.js:250`'s `after:spec` hook writes raw coverage that
    `build-coverage-manifest.mjs` **subtracts from every other spec** to strip
    boot noise. It was ported 1:1 (it is a real sub-second smoke test and passes),
    **but the Playwright harness has no coverage instrumentation, so the port does
    not reproduce the original's function.** Retiring the Cypress spec on the
    strength of a green port would break baseline subtraction — and would surface
    as **wrong selective-test plans, not a failing test**.

    Generalises to the migration plan: "every spec is ported and green" is not
    sufficient grounds to delete the Cypress suite. Specs that exist to feed
    *tooling* rather than to assert behaviour need their consumers checked
    independently, because their failure mode is silent.

82. **The snowplow capture covers the FE-emitted class only — `instance-stats`
    is backend-emitted and has no browser seam.** `instance_stats` goes
    `stats.clj:1054` → `snowplow.clj track-event!` → Java `Tracker` → Apache
    HttpClient, never touching the browser. Measured rather than argued: a
    `node:http` server on the collector port received exactly one
    `POST /…/tp2` (`iglu:com.metabase/instance_stats/jsonschema/2-0-0`) ~1s after
    `POST /api/testing/stats` returned 200, with zero browser traffic. **The app
    is fine; there is no seam to observe it from.**

    The two tests were `test.fixme`'d rather than faked, and re-pointing the
    collector per-test is impossible — `snowplow.clj` builds the tracker in a
    `defonce` whose `network-config` reads `snowplow-url` **once at backend
    boot** — so the fix had to be a harness change.

    **RESOLVED 2026-07-20 — a per-slot collector now exists** (`support/snowplow-collector.ts`,
    wired in `worker-backend.ts` + `fixtures.ts`): a `node:http` server in the
    Playwright process on `backend port + 1000`, started before the slot backend
    spawns. It restores micro's vantage point (downstream of everything, so it
    sees backend-emitted events) without micro's one-store-on-one-fixed-port
    contention. `instance-stats-snowplow` is un-fixme'd and passing;
    `installSnowplowCapture` is untouched and the two coexist. See
    `findings-inbox/per-slot-snowplow-collector.md`.

    ⚠️ **Two claims in the original version of this entry were WRONG and are
    retracted** (measured during the fix):
    - **`MB_SNOWPLOW_URL` does not work.** `environ` merges system properties
      *after* env vars, and `deps.edn`'s `:e2e` alias pins
      `-Dmb.snowplow.url` via `JDK_JAVA_OPTIONS`. `_JAVA_OPTIONS` is what wins,
      because it is applied after the command line. The `MB_SITE_URL` pattern
      does **not** generalise — site-url simply isn't pinned as a system property.
    - **"A clean or CI backend would fire real events at
      `https://sp.metabase.com`" is false.** The `:e2e` alias also sets
      `-Dmb.run.mode=e2e`, so `config/is-prod?` is **false** for slot backends
      and that default never applied. A clean-shell boot reports
      `localhost:9090`. **Nothing was escaping to production**, and the
      safety argument that was made for this change does not hold. The real
      benefit is narrower: previously all five slots emitted to one fixed port
      (interleaving into a store any slot could wipe, or vanishing silently when
      micro was down); now each slot owns its collector.

    Also landed: `expectNoBadSnowplowEvents` is now **real** on the collector
    path — `ajv` against the schemas vendored in `snowplow/iglu-client-embedded`,
    verified inside a Playwright worker (valid passes; `analytics_uuid: 12345`
    fails `must be string`; an unknown schema URI is reported, not skipped). This
    closes the Iglu gap #62 recorded, **for the collector path only** — the
    browser-side check in `search-snowplow.ts` was deliberately left alone, since
    retrofitting it would change assertion strength across ~26 landed tests and
    deserves its own verification pass.

83. **`should("be.empty")` on an `<input>` is vacuous** (`embedding-hub`) — a
    new member of the chai-jquery-semantics family (#6, #36, #23). chai-jquery's
    `empty` means "has no child nodes", which is **trivially true of a void
    element**: an `<input>` can never have children regardless of its value. So
    the assertion passes whatever the field contains. Ported as
    `toHaveValue("")`, which is what the test meant.

84. **An absence assertion that sails past a 500 — and the honest finding is
    that it's faithful** (`embedding-hub`). Mutation D fulfilled
    `PUT /api/permissions/graph` with a 500, and upstream's
    `undoToast().should("not.exist")` passed in three tests. The agent confirmed
    the toast is genuinely emitted rather than assuming — flipping the same
    assertion to `toHaveCount(1)` under the same mutation *found* it — so the
    absence check simply samples before the toast paints.

    **This is a no-op upstream too**, since Cypress's `should("not.exist")` has
    identical first-absent semantics (#74). So it is not port drift and not a
    Playwright weakness; it is an upstream assertion that cannot fail. Fixed per
    the standing rule — **anchor, don't change the assertion form** — by gating
    each of the three on the success signal the same submit produces (the `check`
    icon on *Select data to make available*). Re-running mutation D against the
    anchored version kills it.

    Worth noting as the pattern that keeps recurring: a *surviving* mutant is the
    signal, and the follow-up question is always "is this vacuous, or is the
    mutation wrong?" — answered here by asserting presence under the same
    mutation.

85. **🔴 The QA-DB tier is not safely parallelisable as built — one writable
    container is shared by all five slots** (`datamodel-data-studio`). Each
    spec's reset creates only *its own* fixture; upstream's `multi_schema` reset
    does **not** drop foreign schemas, because CI hands every run a fresh
    container and never had to. On our long-lived shared container the debris
    accumulates: measured `Schema A`…`Schema Z` plus six stray `public` tables
    from other slots' runs.

    **It fails in the shape of a product bug**, which is what makes it dangerous:
    a database checkbox stuck `indeterminate`; a `Wild` schema unclickable
    because it sorted after 26 injected schemas and never rendered. Cause and
    cure were both confirmed — all 5 affected tests pass on a cleaned container
    and fail again once sibling runs repopulate it. Nothing was weakened to
    accommodate it.

    **Narrowed 2026-07-20** (`transforms` session 3): contamination comes from
    **running** transforms, not from **creating** them. That session's batch
    created transforms in collections but never ran any, and added **zero** new
    tables — 29 schemas before and after, identical to the prior baseline. So the
    fix surface is narrower than "every QA-DB spec": it's the specs that
    materialise physical tables.

    **🔴 NOW BLOCKING, NOT COSMETIC** (`filters-reproductions`, 2026-07-20): the
    debris makes the notebook mini picker render a **schema level upstream never
    sees** — a clean `writable_db` has only `public`, so the picker skips
    straight to tables. And because the list is virtualized, `public` is **not in
    the DOM at all** (`count()` → 0; `scrollIntoViewIfNeeded` times out). Ports
    now have to *work around* the contamination (wheel the virtual list, pin the
    schema) rather than merely tolerate it. That is a cost paid by every future
    QA-DB port until the reset is fixed.

    **🔴 A GREEN CYPRESS CROSS-CHECK IS NOT EVIDENCE THE CONTAINER IS CLEAN —
    and on this tier it actively misleads** (`entity-picker`, 2026-07-20).
    Measured: after a Cypress run Metabase sees **3** tables in `writable_db`;
    after the port's run it sees **29**. Cause: `H.resyncDatabase({ dbId })` with
    no `tables` returns instantly (satisfied by the snapshot's own metadata), so
    **Cypress reads the picker before the background sync has discovered the
    debris**. The port passes `tables` — the correct, documented behaviour — and
    therefore waits long enough to see it.

    So the cross-check says "Cypress passes, your port drifted" when the truth is
    "the port is more correct and the container is dirty". This is a new way for
    the fidelity cross-check to mislead, on top of #31's shared-cause problem:
    here the two harnesses genuinely observe **different application state**.
    Concretely, `GET /api/search?q=anim` returns 28 results with the target at
    rank **27** — below the virtualized render window, so never in the DOM; on a
    clean container the same query returns 2 results at ranks 0 and 1.

    **🔴 ESCALATION — contamination also causes vacuous GREENS, not just reds**
    (`transforms`, 2026-07-20). `Domestic.Animals` — another spec's fixture,
    left in the shared container — exists with **zero rows**, and can win
    upstream's *unpinned* table lookup. At that point the `metabase#64473`
    test's absence assertion **passes on an empty result pane**. So this is a
    #49 vacuous green arriving through the *container* rather than through a
    gate, which is strictly harder to notice: nothing skips, nothing fails,
    and the count looks like coverage.

    Fixed by pinning the schema (a no-op on a clean container, and what upstream
    does everywhere else) rather than dropping foreign schemas. Note the
    relationship is **mutual** — that spec injects `Schema A`…`Schema Z` itself,
    so every QA-DB spec is both victim and contaminator. Its later batch adds
    generically-named `table_a`/`table_b`/`table_c` too, which is exactly the
    naming most likely to collide with another spec's unpinned lookup.

    **A SECOND, distinct mechanism** (`data-model-shared-2`, 2026-07-20): the
    debris also breaks **`visitDataModel`'s own wait gate**. That helper waits on
    `GET /api/database/:id/schema/:name`, which only fires when a schema
    **auto-expands** — and auto-expand requires **exactly one schema**. The
    shared writable postgres has 29 (measured), so the request never fires and
    the helper burns its full 30s on a **correctly-rendered page**. Note this is
    not the virtualization mechanism below; contamination breaks this tier in at
    least two independent ways.

    **MECHANISM NAMED 2026-07-20** (`admin-datamodel`): the admin table picker
    is **virtualized** (`@tanstack/react-virtual`, `Results.tsx`). With 26 debris
    schemas present the backend reports **29 schemas while the DOM holds only
    20** — `Domestic, public, Schema A … Schema R`. **`Wild` sorts after
    `Schema Z` and is therefore never in the DOM at all.** That single fact
    explains every observed failure, including the puzzling one where
    `getDatabases()` returned 0 after clearing a search: the virtualizer had
    scrolled to the selected row at the bottom and unmounted the *database* rows
    too. So the symptom isn't "the app is broken" or "the locator is wrong" —
    it's that the element genuinely does not exist in the DOM.

    Neat corollary: the port could be proven correct **without touching the
    container** — the three non-count-based tests pass 3/3 with
    `viewport: {width:1280, height:1800}` as the only change, because a taller
    viewport virtualizes more rows into the DOM. The fourth is inherently
    contamination-fatal since it counts rendered schemas.

    **Consequence for the migration plan, and it is a real one:** the per-worker
    *backend* isolation that #8 celebrates does not extend to the QA databases.
    Before more of this tier lands, it needs either a **per-slot writable DB** or
    a **"drop everything not mine" reset**. Until then, QA-DB specs verified
    concurrently may not reproduce, and a green result carries less weight than
    the same result obtained serially.

    Recorded honestly: the agent dropped the foreign schemas once to run its
    control, and disclosed that a concurrently-running sibling could have been
    disturbed by it.

86. **QUANTIFIED 2026-07-20 (`native-reproductions`): tag-based classification
    misses most container tests.** That spec has **5 tests needing a QA
    container** (postgres-12 ×3, postgres-writable ×1, mongo-5 ×1) and **only
    one carries `@external`** — 55951, 57644-multi and 59356 restore postgres
    snapshots while untagged. So **3 of 5, i.e. 60%, are invisible to the tag.**

    Consequence for planning: any "how many specs need QA infra" number derived
    from tags — including the tier split I produced earlier — is a **lower
    bound** on tests and unreliable per-spec. The only sound method is opening
    the spec. (Conversely the tag over-reports at spec granularity, since it also
    covers maildev and `@mongo` — which is how four specs briefed as QA-DB
    turned out to need no container at all.) **The tag is not the tier, in
    either direction.**

    **The untagged-`@external` pattern — now FIVE+ sightings, so it is systemic**
    (`datamodel-data-studio`, `data-model-shared-1`, schema-viewer via #26, and
    `admin-settings`). The newest is the sharpest: `admin-settings`' Pro-cloud
    SMTP test needs a **third container nobody had running — `maildev-ssl`**
    (`:465` plus a root CA in the JVM keystore), because
    `PUT /api/ee/email/override` live-validates. Measured: 400 *"Wrong host or
    port"*, `nc -z localhost 465` closed. **Upstream carries no `@external` tag
    on it at all.**

    Original entry follows.

    **A second instance of the untagged-`@external` pattern** (`datamodel-data-studio`).
    `Extra info about tables` (3 tests) and `should filter unused tables only`
    restore `postgres-writable` with **no `@external` tag**, so on a
    `-@external` CI leg they run against a container that isn't there. The first
    instance was `data-model-shared-1`'s untagged mysql-8 test, and #26 recorded
    the same shape for schema-viewer. Three sightings makes it a pattern in the
    upstream suite rather than an oversight: **restoring a QA snapshot and
    carrying an `@external` tag are independently maintained, and they drift.**

87. **🔴 Two sandboxing tests have silently-disabled column assertions — and the
    shared helper's fallback is weaker than it looks** (`sandboxing-via-api`).
    This is the highest-stakes instance of the vacuity family, because the
    surface is data-access security.

    `assertDatasetReqIsSandboxed` degrades to an **`is_sandboxed`-only** check
    when either option is falsy. And `is_sandboxed` is the query processor
    **self-reporting that a sandbox ran** — never that data was actually
    *filtered*. So a silently-dropped option turns a data-restriction assertion
    into "the sandbox code path executed", which is a much weaker claim.

    Two call sites do exactly that, both by typo, both measured:
    - *"should be sandboxed even after applying a filter"* passes
      **`columnAssetion`** (sic) — the column check never runs. Fixing the typo
      alone still fails (string `"3"` vs a numeric column); `Number(ATTRIBUTE_VALUE)`
      passes.
    - *"dashboard question as a sandbox source"* passes
      **`columnId: PEOPLE.USER_ID`**, which is `undefined` — PEOPLE has no
      `USER_ID`. `PEOPLE.ID` passes.

    Both are **test defects, not product bugs**: the sandboxing itself works.
    Ported verbatim with the analysis inline rather than shipped as strengthened
    green tests — the fix is upstream's to make, and silently "fixing" a security
    test in a port would hide that it had been disabled.

    **The sandbox restriction itself is genuinely observed**, proven by the
    strongest available mutation: swapping `sandboxTable` for plain unrestricted
    access (so the user still has data access, isolating the *sandbox* rather
    than access itself) kills at the row count — `"11 rows"` vs
    `"Showing first 2,000 rows"` — and, with the row count also removed, kills
    again inside `assertDatasetReqIsSandboxed`. Two independent proxies observe
    the restriction.

88. **`H.popover()` returns a SET, and destructuring takes the FIRST one — so a
    hovercard test never looked at the hovercard** (`filters-reproductions`,
    issue 50731). `const [container] = $element` grabs the first visible popover,
    which is the filter column-list popover; the hovercard the test is *named
    for* mounts **second**. Both popovers' contents were measured.

    The proof is the strongest form available: **deleting the `hover()` line
    entirely — the entire subject of the test — leaves it green in 1.6s.** Same
    shape as #76, and the second time a test has survived deletion of the very
    interaction it exists to exercise.

    Cypress has identical destructuring semantics, so this is an **upstream
    hole, not port drift**. Ported verbatim with the analysis inline rather than
    silently strengthened. Caveat stated by the agent: with cross-checks banned
    while sibling slots run, the claim rests on the mutation plus a
    byte-identical popover selector, not on a cross-harness comparison.

89. **🔴 SYSTEMIC: the permissions/security test helpers silently drop
    assertions — four independent instances, all measured.** Individually each
    looks like a typo. Together they mean the suite's *security* coverage is
    materially thinner than its test titles claim, and it is the strongest
    test-quality finding of the spike.

    - **`assertPermissionTable` never compares the trailing column**
      (`view-data`). Its `.each` iterates the **actual** cells — every table
      renders **5** — while many expectation rows list **6**, so
      `permissions[5]` is never read. Proved with a deliberately-surviving
      mutant: the 6th value was replaced with `"MUTANT-M5-GARBAGE"` and the test
      still passed.
    - **The same helper, hit from the other side** (`downgrade-ee-to-oss`):
      upstream asserts six values for the Sample Database row where the table
      renders five, so the 6th has never been evaluated — confirmed by a control
      run of the unmodified Cypress spec.
    - **`assertPermissionForItem`'s 4th argument is discarded at 12 call sites**
      (`view-data`). The helper takes three parameters; the spec passes
      `…, "No", true` meaning "and it is disabled". So the test titled *"should
      allow saving 'blocked' and **disable create queries dropdown when set**"*
      never checks the disabling — and a working `isPermissionDisabled` exists
      and is used elsewhere **in the same file**.
    - **Two sandboxing assertions disabled by typo** (#87): `columnAssetion`
      (sic) and a `columnId` that evaluates to `undefined`, where
      `assertDatasetReqIsSandboxed` then degrades to an `is_sandboxed`-only
      check — the QP self-reporting that a sandbox *ran*, never that data was
      *filtered*.

    **All four are vacuous in Cypress too** — identical semantics — so this is
    upstream's problem, not port drift, and not something the migration
    introduced. Every one was ported **verbatim with the analysis inline**
    rather than silently strengthened: on a security surface, quietly fixing a
    disabled assertion in a port would hide that it had ever been disabled.

    The common mechanism is worth stating plainly: **these helpers take options
    they do not validate, and a dropped or misspelled option degrades the
    assertion instead of erroring.** That is what makes the failure silent and
    repeatable. TypeScript catches the argument-count case at the boundary,
    which is one concrete argument for the ported suite over the original.

90. **`expect(rect).to.deep.eq(otherRect)` on two DOMRects is ALWAYS TRUE**
    (`question-reproductions`, issue 39487). A `DOMRect`'s `x/y/width/height`
    live on the **prototype** as accessors, so `Object.keys(rect)` is `[]` and
    deep-eql's `objectEqual` compares two empty own-property sets — which always
    match. **Two of that test's three assertions cannot fail upstream**, whatever
    the geometry.

    Verified against the repo's `deep-eql@5.0.2`. Caveat stated by the agent:
    Cypress bundles 4.x and the check wasn't run directly against that version,
    though it is the same code path.

    This one **was** strengthened rather than ported verbatim (compare the
    numeric fields explicitly), and the deviation is documented in the spec — the
    assertion's intent is unambiguous and there is no security surface involved,
    unlike the #89 cluster where preserving the defect was the honest choice.

    Generalises: **any `deep.eq` between two DOM-API objects whose fields are
    prototype accessors is vacuous** — `DOMRect`, `DOMStringMap`, `CSSStyleDeclaration`.

91. **🔴 ACTIONABLE: the local `MB_PRO_SELF_HOSTED_TOKEN` is STALE — it lacks
    `transforms-basic`** (`transforms` session 4). Measured immediately after a
    `beforeEach` activated it: `transforms-python: true`, **`transforms-basic:
    false`** — absent from all 40 truthy features. The reason is dating:
    `:transforms-basic` is `^{:added "0.59.0"}` while `:transforms-python` is
    `"0.57.0"`, so **the token predates the feature**.

    **This resolved a prior unexplained finding.** Session 3 had recorded, and
    correctly declined to explain, that the transforms Move picker's root item
    list computes to zero (`item-picker-level-0` empty, while
    `GET /api/collection/root?namespace=transforms` returns 200). The cause is
    `use-get-root-items.ts:52` — literally `useHasTokenFeature("transforms-basic")`
    — so the transforms root is never pushed. **Their observations were all
    correct; only their assumption that the token carried the feature was
    wrong.** No cross-check was needed; a later measurement settled it.

    That is the process working as intended: an honest "unexplained" survived
    long enough to be explained, rather than being closed with an invented
    mechanism.

    **Concretely actionable: refreshing the token recovers 3 tests and removes
    every remaining fixme in that file.** It also means any *other* spec gated on
    a post-0.57 feature may be silently under-running here — worth an audit of
    `token-features` against the current feature list.

    Also settled while probing: the `@python` script test-run is blocked by
    `POST /api/ee/transforms-python/test-run` → **500, "Connection refused" to
    localhost:4566** (the localstack S3), which fails before :5001 is reached.
    No 402 anywhere — the final nail in my retracted premium-gating claim.

92. **🔴 `isScrollableHorizontally` / `Vertically` are vacuous under overlay
    scrollbars — a SHARED upstream helper, so this is a sweep candidate**
    (`custom-column-reproductions-2`). The helper infers a scrollbar from the
    layout height it *reserves*; overlay scrollbars reserve **zero**. Measured by
    forcing a dropdown child to 2000px: `scrollWidth 2000 > clientWidth 1197`
    (genuinely overflowing) yet `offsetHeight - clientHeight - borders = 0`, so
    the helper returns `false`. Both of issue 55984's tests were **unfailable**.

    **Prediction worth checking during the sweep:** if the helper always returns
    `false` here, then every `expect(isScrollable).toBe(false)` using it is
    vacuous, and any `toBe(true)` assertion would *fail* — so the surviving green
    specs are presumably asserting only the false direction. **Call sites:
    `dashboard-parameters`, `detail-view`, `search`, `visualizations-table`,
    `custom-column-reproductions-2`** (plus `support/search.ts`). Not swept.

    Handled by keeping the verbatim port **and adding** a direct
    `scrollWidth - clientWidth <= 0` check alongside it, with the strengthening
    stated explicitly.

    ⚠️ **UNRESOLVED CONFLICT with #question-reproductions-4's scrollbar finding.**
    That port measured the same class of problem and concluded it was
    **macOS-specific** — overlay scrollbars come from `NSScroller`,
    `--disable-features=OverlayScrollbar` changes nothing, and it explicitly
    stated that Linux behaviour was **inferred, not observed** (it gated its fix
    behind an in-browser gutter probe rather than `process.platform` for exactly
    that reason). This port instead claims the vacuity holds **"CI included"**.
    **Both cannot be right, and neither has been measured on Linux.** Whoever
    runs the sweep should settle it on a CI runner first — the answer determines
    whether this is a local-only artifact or real lost coverage in CI.

93. **A test that cannot see the behaviour it exists to test — with a measured,
    one-line upstream fix** (`native-filters-reproductions`, issue 31606:
    *"should not start drag and drop from clicks on popovers"*).

    `ParametersList` uses `useDndSensors`, which registers **MouseSensor +
    TouchSensor only — no PointerSensor** — and upstream's call omits
    `useMouseEvents`. So the PointerEvents the test dispatches are **inert for
    any target whatsoever**. Confirmed rather than inferred: dragging a widget
    that *provably* reorders under mouse events also did nothing under pointer
    events. Re-run with MouseEvents, the app **correctly refuses** the drag — so
    **the behaviour is real and the test simply can't observe it.**

    **Actionable upstream follow-up: add `useMouseEvents: true` to that call —
    measured safe.** This is the clearest "the fix is one line and we know it
    works" item the spike has produced.

    Also in the same spec: issue 15163's
    `NativeEditor.get().should("not.exist")` is vacuous — `.cm-content` count is
    **0 for admin and 0 for `nodata` alike** (a saved question always renders the
    editor collapsed), so it cannot discriminate the permission state it exists
    to check. **Not strengthened** — permissions surface, so ported verbatim per
    the #89 rule, with upstream's own `loading-indicator` gate restored.

    And a third instance of tag drift, this time the *stale-tag* direction: the
    file's only `@external` tag is obsolete — commit `4701e5f8dc5` removed this
    file's `WRITABLE_DB_ID` usage without updating it. Gating on it reflexively
    would have skipped a perfectly runnable test.

94. **A distinct vacuity shape, now seen TWICE: an assertion targeting a testid
    that does not exist anywhere in the product.**
    - `tenants` asserts absence of **`navbar-new-collection-button`** — zero hits
      across `frontend/src` + `enterprise/frontend/src`; `git log -S` shows the
      tenants PR introduced it **in the spec only**. Proven by probe: it resolves
      to 0 for an admin too, so it can never match for anyone.
    - `admin-databases`' *"should handle is_attached_dwh databases"* has its one
      flag-gated assertion pointed at **`database-actions-panel`** — likewise
      **zero occurrences** in the codebase. A presence probe under the same
      mutation confirmed the mutation *had* applied (the `!is_attached_dwh`-gated
      "Sync database schema" rendered) and the test simply doesn't observe it.
      The rest of that test's signal comes from `isDbModifiable`, which is false
      for `is_sample` too — so it isn't discriminating the flag either.

    Both ported verbatim with the analysis inline. This shape is worth a
    dedicated sweep: **a grep for asserted testids that appear nowhere in
    `frontend/src`/`enterprise/frontend/src` would find these mechanically**, and
    unlike the timing-dependent vacuities it is a static check.

95. **🔴 The wave-11 "actions specs are all-skip" claim was too broad — and
    ~33 tests may be recoverable.** Wave 11 recorded that fully
    `@external`+`@actions` specs are ported-but-unexecuted everywhere, based on
    `actions-on-dashboards` (33/33 gated). `model-actions` falsifies the general
    form: **17 of its 18 tests run green** against live `writable_db` on
    :5404/:3304, and the single skip is correct
    (`cy.onlyOn(dialect === "postgres")`).

    **So the claim should be narrowed to `actions-on-dashboards` specifically —
    and that spec is now worth re-checking**, because if it runs for the same
    reason `model-actions` does, that is 33 tests moving from
    ported-and-gated into executed coverage. Concrete, cheap, and directly
    improves the honest coverage number #49 asks us to quote.

96. **A near-miss that would have produced a false product-bug claim**
    (`model-actions`). The port initially **guessed** `USER_GROUPS` ids as 4/5
    for COLLECTION/DATA; the real values are 5/6, and **4 is
    `DATA_ANALYSTS_GROUP`**. So the test blocked the *wrong group*, impersonation
    was never enforced, the write succeeded (`200 {"rows-affected":1}`) — and it
    read exactly like *"impersonation is broken in the app."*

    Caught because the agent verified the constant rather than trusting the
    symptom. The temptation was structural: `click-behavior.ts` exports a
    **partial** mirror (`COLLECTION_GROUP` only), which invites guessing the
    rest. **A complete shared `USER_GROUPS` is a consolidation candidate**, and
    the general rule is worth stating: *a guessed fixture id doesn't fail — it
    silently tests something else.*

### Capability: `page.clock` reaches into embed iframes

75. **`page.clock` installs into the embed iframe, where upstream gave up on
    `cy.clock()`** (`sdk-iframe-embedding`). Verified from inside the frame's own
    runtime on a loaded dashboard — `window.setTimeout` there is Playwright's
    stub, and the frame's `Date.now()` advances by exactly the amount passed to
    `runFor`, in lockstep with the parent. The SDK's 1s refresh `setInterval`
    (`useDashboardRefreshPeriod` → Mantine `useInterval`, living inside the
    iframe) is therefore drivable. Both auto-refresh tests now freeze real time
    and advance virtual time; the negative test's window went from upstream's
    ~1 real second to **30 virtual seconds** at the same wall clock, and because
    real time is frozen the positive test becomes the negative test's control.

    **Framed honestly, at the porting agent's own insistence:** the wall-clock
    saving is small (upstream waited only ~1–2s), so this is a
    determinism/assertion-width win, not a speed one. And it is a **weaker**
    instance of the #1/#44 pattern than hoped — upstream *tried* `cy.clock()` and
    abandoned it, but nobody has proven Cypress **cannot** do it. Do not cite
    this as a third "Cypress structurally can't" alongside #1 and #44.

    **The reusable catch:** you must step the clock at the app timer's own
    period. Against a 1s timer, `runFor(1000)`×12 → exactly 12 refreshes; a
    single `runFor(3000)` → **0**; `runFor(5000)` → 1. A big jump coalesces
    ticks, which on a negative assertion is a silently vacuous pass.

### Open item owed from this batch

**The one experiment that would give a third instance of #1/#44 is blocked, and
it is cheap** (`database-routing-admin`). `assertDbRoutingDisabled` is the exact
test MEMORY records as a Chrome v122+ headless failure: upstream abandoned
`realHover()` on `#database-routing-toggle` — CDP hit-testing resolves to the
disabled `<input>` inside the Mantine Switch and swallows the boundary events —
and fell back to a synthetic `cy.trigger("mouseenter")`. The port uses a real
`hover({ force: true })` on `database-routing-toggle-wrapper`, but the tooltip
path only runs after the `postgres-writable` setup (#50), so **the probe never
executed**. To settle it: `PW_QA_DB_ENABLED=1` against a live writable QA
postgres, `assertDbRoutingDisabled` under `--repeat-each=3`. Recorded as an owned
open item, not as evidence.

## Batch 14 additions (onboarding/setup, native pack, admin/databases)

### A harness defect that reads exactly like port drift

97. **This box's `e2e/snapshots/blank.sql` is corrupt — it holds the fully
    set-up `default` state (11 users, 97 cards) instead of a blank instance**
    (`onboarding-setup`). `e2e/snapshot-creators/default.cy.snap.js` takes
    `snapshot("blank")` *before* `setup()`, so a correct one has no users at all.

    What makes this a finding rather than a guess is the **same-backend
    control**: `restore/blank` → `has-user-setup TRUE`, a freshly captured blank
    → `FALSE`, and `restore/nonsense` → 404. The third leg is the important one —
    it proves the endpoint was live, so the first two results are real answers
    rather than a silently-failing restore.

    It cost a **15-way failure** that looked precisely like a bad port: a setup
    wizard cannot be tested against an instance that is already set up. Any spec
    needing a genuinely un-set-up instance will fail here the same way.

    **`e2e/snapshots/*` is gitignored, so CI is unaffected** — CI generates these
    at run time. This is a stale local artifact only. The agent deliberately did
    **not** regenerate it, because regenerating means running Cypress and
    rewriting files all five slots share; it captured a correct snapshot under an
    unreferenced name on its own port instead. **Owed: regenerate `blank.sql`
    once the slots drain.**

### A porting hazard general enough to sweep for

98. **`getByText(..., { exact: true })` is not equivalent to Cypress's exact
    match** (`onboarding-setup`). testing-library's `getNodeText` reads only an
    element's **direct child text nodes**; Playwright reads its full
    `textContent`, including nested elements. An element whose label is split
    across child spans therefore matches upstream and not the port. Measured on
    the same element: `exact: true` → **0 matches**, `exact: false` → **1**.

    This is the third member of the exact-match family (after the
    testing-library trim rule and the ECharts anchored-regex case), and the one
    most likely to be mistaken for a product bug, because the text is plainly
    visible on screen while the locator finds nothing.

### Two mutation results worth recording for method, not outcome

99. **A survivor explained by measurement rather than argument**
    (`onboarding-setup`). `expect.poll(...).not.toBe("onscreen")` accepted its
    **first** offscreen sample, catching the element's pre-animation position —
    the helper genuinely discriminates (hidden `y=860` vs shown `y=574` against a
    720px fold), so the assertion is not vacuous, but its retry semantics let a
    transient state satisfy it. **Upstream's `should("not.be.visible")` has
    identical semantics**, so this was recorded as a faithfully-ported weakness
    and documented in the helper rather than silently strengthened.

    Also of note: the agent judged **one of its own mutations bad** (it died at a
    precondition rather than the assertion under test) and reaimed it. That is
    now the fourth agent today to catch an invalid mutation of its own — the
    "check *where* the mutant dies" rule is doing real work.

100. **A hypothesis correctly withheld from the findings** (`onboarding-setup`).
    The backend `invite_sent` snowplow event is dropped before leaving the JVM,
    but *only* when preceded by a test that generated backend snowplow traffic —
    it passes alone and under `--repeat-each=4`. The collector logged exactly 3
    POSTs, 0 malformed, with tracking enabled and `POST /api/user` returning 200
    on the `source: setup` branch, so the event is never sent at all. The agent
    had a plausible mechanism (the collector's default 5s keep-alive against the
    backend's `defonce` pooled client) but **could not confirm it, and recorded
    it as a hypothesis with a fixme rather than a finding.** The fix would touch
    a shared support module, which a port must not edit. **Owed: investigate.**

### #85 root cause: the debris is self-inflicted, not cross-slot

101. **The `Schema A…Z` contamination in the shared writable container is created
    by `issue 28106` — a test *inside* `notebook-data-source` itself**
    (`notebook-data-source`). Measured: 29 schemas present (`Domestic`,
    `Schema A`…`Schema Z`, `Wild`, `public`), and the `Schema A…Z` block is the
    `many_schemas` fixture that this very spec creates. **It contaminates itself
    across runs.**

    This materially changes how #85 should be read. It had been framed as
    sibling slots polluting a shared resource — a coordination problem, fixable
    by scheduling. It is substantially **a spec creating fixtures it never
    cleans up**, which means it reproduces on a single-agent box and would
    reproduce in CI on any re-run against a persistent container. The
    coordination story is not wrong (multiple slots do share the container) but
    it was not the main mechanism.

    The consequence is the one already documented: the mini picker is a
    `VirtualizedList` holding ~20 rows, so `Wild` — sorting after `Schema Z` —
    is **never in the DOM**. Fixed here with a scroll-until-attached
    `clickMiniPickerItem`, with **no assertion weakened**.

    **This strengthens the case for the owed `multi_schema` reset fix**: a reset
    that drops only the schemas it owns will not clear `many_schemas` debris
    either. Whatever lands should be verified against a container that already
    has the `Schema A…Z` block present.

### An `@OSS` tag that wasn't a gate at all

102. **`@OSS` resolved as not a real gate — +1 executed test**
    (`notebook-data-source`). "should display databases by default" runs
    unconditionally and passes on the EE jar, because its assertions are scoped
    `data-active` checks with **no upsell CTA and no page-wide EE-chrome count**,
    so `PLUGIN_IS_EE_BUILD` cannot reach them.

    The complementary result from the same spec is what makes this a method
    rather than a lucky guess: an **untagged** describe turned out to be
    *genuinely* token-gated, proven by deleting `activateToken` and watching both
    tests fail in `beforeEach` at `POST /api/ee/library`. So the tags were wrong
    in **both** directions in one file. **Probe the gate; don't read the tag.**

### A fixme that is environmental, with the measurement to prove it

103. **`issue 34350` fails on a heap-order accident, not a product defect**
    (`notebook-data-source`). It asserts `cell-data` contains `37.65` — Orders
    **id 1** — against a virtualized ~18-row grid, so it silently depends on id 1
    being physically first in an `ORDER BY`-less `LIMIT 2000`.

    Measured: `select ctid, id from orders where id in (1,2)` returns
    `(213,21) | 1` versus `(0,2) | 2`. Row 1 was UPDATEd into the tail of an
    18760-row heap and is outside the virtualization window. The DOM was probed
    directly to confirm the grid starts at id 2 with nothing scrolled.

    **That ctid is impossible in a fresh fixture, so CI should be green.** The
    repair (`CLUSTER orders USING orders_pkey`) was correctly refused while
    sibling slots were live. **Owed: re-seed the container, then flip the fixme.**
    No Cypress cross-check was run, so whether upstream also fails is unknown and
    is not claimed either way.

### `page.goBack()` is measurably not the app's back control

104. **Swapping `page.goBack()` for a click on the app's back affordance changes
    the request profile, not just the rendering** (`dashboard-back-navigation`).
    Measured: `goBack()` fires an **extra `GET /api/dashboard/:id`** (1 → 2) and
    an **extra dashcard query** (2 → 3).

    This had been asserted in a brief as a plausible rule; it is now measured.
    The consequence is sharper than "they're different": in a **caching** spec,
    the swap would mask precisely the regression under test — the port would go
    green while no longer exercising the cache path at all. **Port the click if
    upstream clicks; use `goBack()` only where upstream uses `cy.go("back")`.**

### An over-broad `@external` tag, distinguished from a vacuous test

105. **Only one of two `@external`-gated tests actually depends on the container**
    (`dashboard-back-navigation`). Repointing the slow card to H2 kills the
    loading-cards test but leaves "preserve filter value" passing — its subject
    is counts and filter state, indifferent to whether the query errors.

    The distinction that makes this a tag finding rather than a test-quality one:
    **the mutation provably applied**, because its sibling died from the same
    constant. So the test is not vacuous; the *gate* is over-broad. Those are
    different defects with different fixes, and conflating them would have led to
    "weakening" a sound test. Tags have now been found wrong in both directions
    on four specs today — missing, stale, over-broad, and red-herring.

### The transforms token debt was largely imaginary

106. **`transforms-basic` is absent from the local token but does not gate the
    inspect tier** (`transforms-inspect`). The predicate is
    `query-transforms-enabled?` (`token_check.clj:715`):
    `(and transforms-enabled (or (not is-hosted?) (has-feature? :transforms-basic)))`.
    The slot backend reports **`is-hosted? = false`**, so the `or` short-circuits
    and the feature check never runs. The docstring is explicit: *"OSS
    intentionally gets query transforms without a license."*

    Verified end-to-end before a line was written: create → run (`succeeded`) →
    `GET /inspect` → **200**, `available_lenses: [generic-summary,
    column-comparison]`. Result: **9/9 ported, 9/9 executing**, gate-off control
    showing 9 skipped / 0 executed.

    **This retracts part of the standing brief guidance.** I had been telling
    agents that the missing `transforms-basic` might block the whole transforms
    tier and that a token refresh was owed for it. For the inspect tier a refresh
    would recover **zero** tests. The debt is real only for the sibling
    `transforms.spec.ts`. **A missing feature flag is not a gate until you have
    read the predicate that consumes it.**

### An environmental trap that manufactures false "no features" conclusions

107. **`.env` has a trailing comma on every token value** (`transforms-inspect`).
    A naive parse yields a 65-char token that **400s on activation**, after which
    `token-features` reads `ON (0)` — indistinguishable at a glance from "this
    token genuinely has no features".

    This is exactly the shape of the over-gating failure mode that has already
    cost this spike two sessions (the false "transforms is 402-blocked" claim).
    The agent nearly logged it as a finding and checked instead. Also measured:
    `MB_ALL_FEATURES_TOKEN` is 61 chars and 400s the same way, so **bleeding-edge
    features may be silently unusable on this box** — worth knowing before anyone
    concludes a bleeding-edge surface is broken.

    **Strip the comma and re-check before concluding a feature is unavailable.**

### A survivor that was the assertion being right

108. **Corrupting the warehouse cannot reach a fingerprint-derived statistic**
    (`transforms-inspect`). A mutation NULLing a source column to move a
    null-percentage **survived**. The agent confirmed the mutation applied
    against the DB, then ran a sentinel probe: the cell renders `0.00 %`
    regardless, because the null-percentage is **fingerprint-derived, not
    recomputed live**.

    So the assertion is sound and discriminating; the mutation simply could not
    reach it. Recorded honestly as **"no input-side mutant kills the field-stats
    block — not triggered by any failure mode I could induce"** rather than
    claimed as coverage. That is the distinction this spike keeps having to make:
    *unkillable by me* is not *vacuous*.

### A stub-fidelity rule that hides in plain sight

109. **`cy.intercept(url, { statusCode: 500 })` sends an EMPTY body** — porting
    it as a `route.fulfill` with a JSON body is a behavioural change
    (`data-model-shared-4`). The port supplied
    `{ message: "Internal Server Error" }`, and Metabase's preview rendered *that
    string* instead of the generic "Something went wrong".

    What makes this worth recording is how nearly it escaped: the drift was
    **invisible across 13 of 15 surfaces**, because toast text is FE-constructed
    and never echoes the response. Only the single place where the app displays
    the server body went red. A port that happened not to touch that surface
    would have shipped an error-path stub that silently tests the wrong string.

    **Default to an empty body when porting a bare `statusCode` intercept**, and
    supply one only where upstream does.

### A `snowplow` gate that was dead setup

110. **`H.resetSnowplow()` present, zero snowplow assertions**
    (`data-model-shared-4`). The queue tagged this spec `snowplow` because the
    string appears; the spec asserts no event, has no
    `expectNoBadSnowplowEvents`, and `e2e/support/e2e.js` has **no global hook** —
    grepped, not assumed. So the correct vantage was **none at all**.

    This is a sixth distinct way the tag metadata misleads, alongside missing,
    stale, over-broad and red-herring: **a setup call with no corresponding
    assertion**. The generated queue's gate column is a keyword scan and cannot
    tell the difference; only reading the spec can.

### #41 RESOLVED: the viewport line in playwright.config.ts is dead code

111. **The harness runs 1280×720, not the 1280×800 the config appears to
    specify** (`custom-column-2`). Mechanism, confirmed directly in
    `playwright.config.ts`: line 46 sets `viewport: { width: 1280, height: 800 }`
    in the **top-level `use`**, but the `chromium` project at line 52 spreads
    `...devices["Desktop Chrome"]`, which carries its own `viewport` of
    **1280×720** — and **project-level `use` overrides top-level `use`**. So line
    46 has never taken effect.

    This closes FINDINGS #41, which had been open since early in the spike as an
    unexplained discrepancy against Cypress's 1280×800.

    **It is not cosmetic.** At 720 the expression popover flips *above* its
    anchor (measured `y=26` vs `y=402`) and covers "Pick columns", which broke
    **four tests** in a way that reads exactly like port drift. Any spec whose
    layout depends on fold position has been silently running at the wrong
    viewport, and a port that "fixed" such a failure locally may have encoded a
    workaround for a harness defect.

    **Fix, deliberately NOT applied yet:** add the viewport *after* the spread in
    the project block. Doing so while agents are live would change rendering
    mid-run and invalidate verification already completed at 720. **Owed once the
    slots drain — and landed ports should then be re-run**, since some may
    contain workarounds that become unnecessary or wrong at 800.

### The mechanism behind "the first Mod-j is silently refused"

112. **`@codemirror/autocomplete` has a 75ms `interactionDelay`**
    (`custom-column-2`; `dist/index.js:1044,1066`, left at its default by
    Metabase). For 75ms after the suggestion tooltip opens,
    `acceptCompletion`, `moveCompletionSelection` and option-click all return
    `false`.

    The damaging part is what happens next: **a refused Enter falls through to
    `insertNewline`**, silently corrupting the formula rather than doing nothing.
    Measured: three back-to-back Enters produce `["rou","","",""]`; with a 300ms
    gap, `round(column)`.

    Two consequences worth propagating:
    - **The tooltip DOM is not a valid gate** — the option renders
      `aria-selected="true"` immediately, so waiting for it proves nothing. A
      `toPass` retry loop is *unsafe* here, because each refused attempt inserts
      a newline.
    - This is very likely the **same root cause** as the long-standing "first
      `Mod-j` after a completion tooltip is silently refused" gotcha (identical
      guard) — which had been recorded as an observation with no mechanism.
      Upstream's own helper works around it with `cy.wait(300)`.

### 🔴 INDEPENDENT CORROBORATION: the #64406 DataSelector regression

113. **A second agent, on a different spec, root-caused the same commit**
    (`admin-datamodel-reproductions`; first found in `native-reproductions-js`).
    Commit `2a6741df9cf` (PR **#64406**, 2025-12-18) widened
    `DataSelector.skipSteps` from `databases.length === 1` to
    `enabledDatabases.length >= 1`, so with two databases the DATABASE step is
    **always skipped**.

    The two reports were produced independently, on unrelated specs, with
    different symptoms:
    - `native-reproductions-js` (issue 18148): the native DB picker auto-selects
      the first database ~750ms in and PUTs `last-used-native-database-id`,
      closing the picker before "sqlite" can be chosen.
    - `admin-datamodel-reproductions` (segments "Filter by table"): no database
      list renders at all — the picker opens straight on Sample Database's
      tables, so `Writable Postgres12` is **unreachable**.

    **Both measurements discriminate rather than merely fit.** The first observed
    two enabled databases present when the skip fired — impossible under
    `=== 1`. The second sampled the popover's `innerText` every 100ms for 4s and
    found it **identical at every sample including t=0**, ruling out a race,
    scoping, and virtualization. The affected test predates the change by 11
    months.

    **Still not claimed:** neither agent ran the Cypress original, because the
    cross-check is banned while sibling slots are live. So whether upstream fails
    identically is **unknown**, and the ~80ms window in the first case means
    upstream may simply be flaky rather than red. What is established is the code
    change and its observable consequence, not that Cypress catches it.

    This is the strongest product finding the migration has produced: two
    independent derivations of the same root cause, each with a measurement that
    excludes the alternatives.

### Two more vacuity confirmations, both kept verbatim

114. **The command-palette "Recents" absence check is vacuous — upstream too**
    (`admin-datamodel-reproductions`). The palette renders its empty state until
    the recents fetch **commits** at ~t=200ms, so an absence assertion is
    satisfied by a component that simply hasn't loaded. **Three anchors were
    tried and each proven insufficient**, including `waitForResponse`, which
    resolves a tick before React commits. Kept **verbatim with the analysis
    inline** rather than papered over with a sleep.

115. **`isScrollableVertically` is structurally vacuous on macOS**
    (`admin-datamodel-reproductions`). It infers a scrollbar from layout width,
    and Chromium's **overlay scrollbars consume none**. Measured on a plainly
    overflowing popover — `scrollHeight 650` vs `clientHeight 147` — it still
    returns `false`.

    This is consistent with the open **#92** conflict (overlay scrollbars:
    macOS-only vs CI-included) and does not resolve it: the helper **may be live
    on Linux CI**, where scrollbars can take layout width. **Owed: settle #92 on
    a Linux runner.** Until then, treat every `isScrollable*` call site as
    unproven — there are 5 known.

### The shared `openTable` drops arguments on its notebook branch — twice now

116. **`ad-hoc-question.ts`'s `openTable` silently drops `limit` on the notebook
    branch** (`notebook-native-preview-sidebar`), and its comment claims no
    caller needs it. This spec does: without the limit there is no
    `step-limit-0-0` to delete and the smoke test collapses.

    This is the **second** argument the same helper is known to drop — it also
    discards `database` on that branch (`joins.openTableNotebook` hardcodes
    `SAMPLE_DB_ID`). So the pattern is not a one-off bug but a shape: **the
    notebook branch of `openTable` honours fewer options than its signature
    advertises, and its comments assert otherwise.** Reproduced locally rather
    than editing shared code. **Consolidation candidate — and any caller relying
    on `openTable`'s notebook branch should be audited, not trusted.**

### A brief claim that did not survive contact

117. **My "generated-SQL whitespace" warning did not apply here, and the agent
    said so** (`notebook-native-preview-sidebar`). The brief called the
    `toHaveText` normalization trap "the single most likely way this port goes
    green while asserting nothing", since the spec renders generated SQL.

    On inspection all nine SQL assertions are **single-token substring
    containment**, where normalization is a **no-op**. The agent used raw
    `textContent` anyway but correctly reported it as *the safer equivalent, not
    a strengthening*, and stated that none was ever at risk of the `\tSELECT`
    vacuity.

    Recorded because the alternative — quietly accepting the coordinator's
    framing and claiming a dividend — is exactly the failure mode this spike
    keeps guarding against. **A warning being inapplicable is a result.**

### A virtualization accommodation, correctly bounded

118. **The mongo `"Small Marble Shoes"` assertion failed on document order, not
    on the port** (`notebook-native-preview-sidebar`). The generated pipeline has
    **no `$sort`**, so rows come back in MongoDB natural order; on this box the
    target row sits at position **20 of 200** while the 196px results grid
    virtualizes **10**.

    Port drift was ruled out by measurement first — same query, same testid, 90
    cells present, same viewport. Fixed with `scrollResultsToCell`, which is a
    virtualization accommodation rather than a semantic change: the assertion
    still reads "some *rendered* cell contains X".

    **Explicitly left undetermined:** whether CI's mongo container orders those
    documents the same way. The Cypress cross-check is barred on a shared box, so
    this is recorded as environment-bounded rather than as a product claim.
    Third instance of the virtualization-window class today, after the ~18-row
    results grid and the ~20-row schema picker.

### A row-count assertion that cannot distinguish true from false

119. **Flipping the boolean filter leaves one test green, and the cause is the
    data, not the assertion** (`dashboard-filters-boolean`). Flipping
    `False`→`True` killed the mbql and native-variable tests **at a tail
    assertion** (the fourth row-count check) but **survived** on the
    native-field-filter test.

    Confirmed against the container rather than inferred: `many_data_types` holds
    **exactly one `true` row and one `false` row**, so both branches expect the
    identical string `"1 row"`. The assertion is structurally incapable of
    telling the two values apart.

    **The distinction that matters was then made explicitly.** "Same data" and
    "vacuous assertion" are different defects, and the agent separated them by
    asserting *presence* under the same mutation: a temporary "false cell
    visible" check went **red**, proving the interaction genuinely fires and only
    the *count* is blind. Corroborated three further times, where
    `assertTableRowsCount(1)` and `assertQueryBuilderRowCount(1)` all sail
    through a flipped boolean.

    Kept **verbatim with the analysis inline** — the test is faithful to
    upstream and the weakness is upstream's. **A row count is a weak proxy for a
    boolean filter whenever both branches return the same number of rows**, which
    for a two-row fixture is always.

### An accurate tag over a partially unnecessary gate

120. **`@external` is correct here, but 6 of 9 tests never touch the container**
    (`dashboard-filters-boolean`). The `beforeEach` writes and syncs
    `many_data_types` in the writable postgres, so the gate is genuinely required
    for the spec as written — gate-ON 9 executed, gate-OFF 9 skipped.

    But only 3 tests actually depend on it; the other 6 would run on `default`.
    Because the `beforeEach` is **shared upstream**, splitting them would be a
    structural change rather than a port, so it was recorded as an audit note and
    left faithful. Same class as `custom-viz`.

    Worth tracking as a **coverage-recovery candidate**: specs where an accurate
    tag hides tests that could execute without containers. This is the second.

### 🔴 The queue's gate column is per-FILE; tags are per-DESCRIBE

121. **Gating this spec at the file level would have silently skipped 9 of its 11
    tests** (`dashboard-filters-source`). The queue reports `@external`, but only
    the **second** describe carries that tag — the first is `@slow` and runs on
    plain H2.

    Measured: `PW_QA_DB_ENABLED=1` → **11 executed / 0 skipped**; gate off →
    **9 executed / 2 skipped**.

    This is a defect in `scripts/build-queue.mjs`, not in the spec. The gate
    column is a **keyword scan over the whole file**, so a tag on any one
    describe colours the entire entry, and an agent that trusts it applies a
    file-wide gate. The result is the worst kind of failure this spike has:
    **ported, green, and silently not executing** — indistinguishable from
    success unless someone runs the gate-off control.

    **Consequence for briefs: "probe the gate" must mean per-describe, not
    per-file.** The gate-OFF control is what catches this, which is why it is
    mandatory. Owed: either make the generator emit per-describe gates, or label
    the column explicitly as "any describe in this file mentions…".

    Related: `dashboard-filters-boolean` (#120) is the inverse — an accurate
    file-level tag where 6 of 9 tests still don't need the container.

### Three brief warnings that did not apply, reported rather than banked

122. **`dashboard-filters-source` reported three of my warnings as inapplicable**
    — the second agent in a row to do so, after #117.
    - **Virtualization:** every dropdown here holds 3–4 options, and the
      `toHaveCount(0)` mutants failed by *finding* elements, not by
      under-rendering.
    - **The `cy.wait` queue rule:** the `/api/dataset` intercept is registered
      and **never awaited anywhere in the file**, so there was no queue to port.
    - **The 1280×720 viewport defect:** nothing observed was layout- or
      popover-position-dependent.

    Recording this because the briefs have grown long and carry an increasing
    number of hazards that are real *somewhere*. An agent that quietly treats
    every listed hazard as present will manufacture work and, worse, may "fix"
    something that was never broken. **A warning being inapplicable is a
    result, and saying so is the correct behaviour.**

    Also settled, as a by-product of a mutation: flipping
    `ORDER BY ID ASC`→`DESC` killed both label tests, which **answers the
    ordering question the brief raised** — that list's order is guaranteed by
    the query, not incidental.

### 🔴 The `@external` tagging convention has drifted repo-wide

123. **~20 of ~50 specs that restore a `*-writable` snapshot carry no
    `@external` tag** (`database-writable-connection`). This spec's describe has
    *no* tag at all, yet it restores `mysql-writable` and issues raw
    `CREATE USER` / `CREATE TABLE` against the QA MySQL container.

    The agent audited the whole repo rather than reporting its own file, which is
    what makes this actionable: **the convention has drifted generally**, so
    "untagged" cannot be read as "needs no container". Combined with #121 (the
    queue's gate column was a per-file scan) and #120 (an accurate tag over
    tests that don't need the container), **the tag metadata is unreliable in
    every direction** — missing, stale, over-broad, red-herring, dead-setup, and
    now systematically absent across a whole class.

    **Operational consequence: the gate-OFF control is the only trustworthy
    signal.** A spec that runs green with the gate off is either genuinely
    container-free or silently skipping — and only the executed-vs-skipped counts
    distinguish those.

### A token gap traced to its predicate — and how it differs from the retracted one

124. **`writable_connection` is genuinely unavailable on the local token, with no
    short-circuit** (`database-writable-connection`). It is `false` on
    `pro-self-hosted`, `pro-cloud` and `starter`, and true only on
    `bleeding-edge` (53 features).

    This is the **opposite** outcome to #106, and the contrast is the point.
    There, `transforms-basic` was absent but gated nothing, because
    `query-transforms-enabled?` short-circuits on `(not is-hosted?)`. Here the
    agent checked for the same escape and found none: `define-premium-feature` on
    the stock getter, the FE rendering `PluginPlaceholder → null`, and the
    backend hard-throwing `assert-has-feature`. **Same method, opposite answer** —
    which is exactly why the method matters.

    So this is a **local token gap, not a product finding**; CI's
    `pro-self-hosted` evidently carries the feature. The port keeps
    `pro-self-hosted` verbatim and probes the feature at runtime. The agent
    verified the port by *temporarily* swapping to a feature-carrying token —
    **9/9 green, 27/27 under `--repeat-each=3`** — then restored it, leaving a
    two-line diff that was both the token. Gate-OFF control: 9 skipped / 0
    executed.

### A placeholder trap where the accessible name IS the state

125. **The global model-persistence `Switch`'s accessible name changes with its
    state** (`Disabled` → `Enabled`), so a locator built on it **dies mid-flow**
    (`database-writable-connection`). This is the placeholder-trap family again,
    but with the mutating value in the *a11y name* rather than the `placeholder`
    or `value` attribute — a third variant, after the native parameter widgets
    and React's `value`-attribute sync.

    It surfaced as a real failure: model persistence returned
    `400 "Persisting models not enabled for database"` because the admin toggle's
    async mutation **raced the next API call**. Fixed by gating on the state the
    race corrupts (the checked switch) rather than on a sleep.

    Also recorded, and left alone: the runs leaked **8 orphan
    `metabase_cache_*` schemas**, which the agent cleaned — attributing them by
    *contents*, because `create_time` proved unreliable (the container clock runs
    ~7h behind the host). **Upstream has the same cache-schema leak**, so this is
    not port-specific.

### A truthy-string coercion, and a candidate bug scoped honestly

126. **`?ssl=false` in a connection string turns the SSL switch ON**
    (`database-connection-strings`). `database-field-mapper.ts` passes the raw
    string straight into `details.ssl`, and the string `"false"` is **truthy**.

    The agent scoped the claim tightly and I am keeping it that way: this was
    **measured at the form layer only**. It did not check what the *saved record*
    ends up containing, so this is **not** an end-to-end bug claim. Recorded as a
    candidate, with the exact boundary of what was observed.

    The same coercion explains one of its mutation survivors: `ssl=true` →
    `ssl=false` survived because both strings are truthy. Rather than filing that
    as vacuity, the agent ran the presence probe — `.not.toBeChecked()` under the
    same mutation failed with "Received: checked" — establishing **coincidence,
    not a blind assertion**.

### A vacuity proven by where the mutant died

127. **`should("have.value", "on")` on a checkbox is near-tautological**
    (`database-connection-strings`). `"on"` is the HTML default `value` for a
    checkbox and **does not track checkedness** at all.

    Proven rather than argued: the mutation that genuinely unchecks the box
    **died at `toBeChecked()` and sailed straight past the value check**. That
    ordering is the evidence — the value assertion cannot distinguish the states
    it appears to be testing. Kept **verbatim with the analysis inline**.

### Mutation-tooling hygiene: verify the mutation you think you made

128. **A `perl`-based mutation silently clobbered a fixture line to `X`**
    (`database-connection-strings`). It was caught only by **reading the file
    back** after mutating.

    This is a failure mode the spike had not recorded: a mutation that does
    something *other* than intended produces a result that looks like a finding —
    a mutant that "kills" for the wrong reason, or "survives" because the intended
    change never landed. It sits alongside the known bad-mutation shapes
    (mutating a shared constant so assertions move with it; removing a value the
    app persists).

    **Adopted remedy, worth generalising:** use an **anchored replace with a
    `count == 1` assertion**, and **read the file back** before drawing any
    conclusion from the run. Every later mutation in that port did so.

    Related, from the same agent: it also **sanity-checked its own dead-import
    checker** after a greedy regex reported `test` as a dead import — the real
    answer was zero. **Verify the tool before trusting its verdict.**

### ⚠️ #107 NARROWED: the trailing-comma trap does not affect this harness

129. **`.env` does have a trailing comma on its token values, but the harness
    never reads `.env`** (`transforms-permissions`; narrows #107). Verified
    directly: `support/env.ts:8-15` loads the gitignored repo-root
    **`cypress.env.json`**, whose four tokens are clean 64-char strings that all
    activate **204**.

    So the operational advice I propagated into roughly a dozen briefs —
    "strip the comma and re-check before concluding a feature is unavailable" —
    was **aimed at a file this harness does not consult**. The measurement behind
    #107 was real (a 65-char token does 400), but the inference that it explains
    a `token-features` reading of `ON (0)` was wrong.

    **The actual explanation for `ON (0)`: a backend with no token activated
    yet.** That is the thing to check first.

    #107 stands as a fact about `.env`; its *conclusion* is retracted. Eighth
    coordinator claim corrected on evidence.

### 🔴 The scratchpad is NOT agent-isolated — it caused real data loss

130. **A sibling agent wrote `spec.orig.ts` over another agent's file mid-run**
    (`transforms-permissions`). The victim's revert `cp` then clobbered its own
    spec with the sibling's content.

    The agent rebuilt and re-verified the spec functionally, and — importantly —
    reported it as **"re-verified", explicitly not "restored byte-identical"**,
    because the md5 differs in whitespace. That distinction is the correct call:
    every other port this session claims a byte-identical md5 restore, and
    silently claiming it here would have made an unverifiable statement.

    **Generic scratchpad filenames are already colliding.** Five slots share one
    scratchpad directory, and names like `spec.orig.ts`, `run4.log` and
    `mutation.bak` are the obvious things for an agent to reach for.

    **Fix to propagate: slot-prefix every scratchpad filename** (`s3-spec.orig.ts`,
    `s3-run4.log`). Cheap, and the failure mode is silent overwrite of another
    agent's in-flight work — which git cannot recover, because scratch files are
    never tracked.

### 🔴 #100 RETRACTED AND REPLACED: snowplow events are QUEUED, not dropped

131. **The "backend event dropped before leaving the JVM" hypothesis is wrong.
    Events are queued with a persistent offset, and a test can pass on its
    PREDECESSOR's event** (`collections-uploads`; replaces the hypothesis in
    #100).

    Mechanism, measured: `snowplow.clj` uses one JVM-wide `defonce` Tracker with
    `batchSize(1)`. A POST that fails while the collector is down is **re-queued**,
    so the queue never recovers on its own.

    The evidence is specific and damning:
    - A `POST /api/dashboard` flushed a **stale `csv_append_failed` from an
      earlier run**.
    - 45 dashboard creations flushed **6 stale `csv_upload_successful` payloads
      with `model_id` 98–102 from the prior run**.

    **The consequence is worse than flakiness. At offset 1, a test passes on the
    event emitted by its predecessor** — a hollow green, not a red. Measured:
    a fresh backend gives 20/21; a backlogged backend gives **4 failures plus 2
    hollow passes**. CI is unaffected, since each run gets a fresh JVM.

    This retracts #100's mechanism entirely. #100 was correctly filed as a
    *hypothesis* rather than a finding, which is exactly why it was cheap to
    replace — the earlier agent said it could not confirm the mechanism, and it
    was right not to.

    **One thing left unexplained, and recorded as such:** an in-spec drain worked
    from a standalone script but never converged inside the harness. The agent
    removed it rather than ship machinery it could not account for.

### Two upstream defects in the uploads spec

132. **The invalid-file "no table created" check is vacuous**
    (`collections-uploads`): `tableName` is `undefined`, so the query becomes
    `LIKE '%undefined_%'` and can never match. Kept verbatim with analysis inline.

    Also: the `permissions` and `Upload Table Cleanup` describes **silently
    create tables in the read-only QA `sample` database and never clean up**.
    This port does clean up. That is a second confirmed instance of the
    self-inflicted-debris pattern behind #101 — specs, not slots, are the
    dominant source of container contamination.
