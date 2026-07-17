# Migration dividends — evidence file

Every concrete benefit surfaced by porting Cypress e2e specs to Playwright.
Each entry: what we found, where, and why it matters. **Process rule: any new
dividend found during porting gets an entry here in the same PR.**

## Scoreboard — read this before quoting numbers

**Product bugs: 2 standing (#1, #3), 3 retracted (#2, #22, #24).** Everything
that rested on a `parameters: []` / load-path observation is gone: re-checked
against the CI uberjar with Chrome cross-checks, none of it reproduced. Two of
the three died to the same mechanism — a code path we didn't know about masked
the difference we were measuring, and we read the gap as an app bug (#24: the
question loads dirty so the QB uses `/api/dataset`; #22: our own per-worker H2
repoint, which Cypress lacks, so its "identical failure" was really lock
contention between concurrent slot backends).

Do not quote a bug count from an un-cross-checked observation. The honest,
defensible case for the migration does not rest on bug count anyway — see
"Infrastructure findings" and "Framework-level simplifications", where the
evidence is strong: the harness solves isolation problems Cypress structurally
cannot, and #22's retraction is itself a demonstration of that.

## Product bugs found by porting

1. **Enter-key double-navigation race in SearchBar** (`search.spec.ts`).
   `page.keyboard.press("Enter")` on a highlighted search result fires the
   keydown navigation handler AND the `onKeyPress` fallback (`goToSearchApp`)
   — a transient `/search` mount issues a duplicate search request.
   Reachable by real users. Cypress never sees it because cypress-real-events
   dispatches rawKeyDown and the char event as separate delayed CDP commands.
   Ported with a CDP-level keydown/keyup helper; the underlying race is a
   real FE bug candidate.

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

3. **`restore()` can silently kill the search index** (found via joins +
   metrics ports; almost certainly explains a class of *existing Cypress CI
   search flakes*). Back-to-back app-DB restores can drop the async
   search-index rebuild trigger entirely; the FE then renders permanent
   empty search states ("No search results" in pickers, "Search Index not
   found" on browse pages) because it never re-queries. Also: the rebuild
   indexes cards before tables, so "search works" for cards while table
   search is still broken. Harness fix: post-restore poll +
   `POST /api/search/force-reindex` escalation (`fixtures.ts`).

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
