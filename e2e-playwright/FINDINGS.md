# Migration dividends — evidence file

Every concrete benefit surfaced by porting Cypress e2e specs to Playwright.
Each entry: what we found, where, and why it matters. **Process rule: any new
dividend found during porting gets an entry here in the same PR.**

## Product bugs found by porting

1. **Enter-key double-navigation race in SearchBar** (`search.spec.ts`).
   `page.keyboard.press("Enter")` on a highlighted search result fires the
   keydown navigation handler AND the `onKeyPress` fallback (`goToSearchApp`)
   — a transient `/search` mount issues a duplicate search request.
   Reachable by real users. Cypress never sees it because cypress-real-events
   dispatches rawKeyDown and the char event as separate delayed CDP commands.
   Ported with a CDP-level keydown/keyup helper; the underlying race is a
   real FE bug candidate.

2. **Dimension-template-tag cards get empty `parameters`** (upstream
   regression, found via `public-question.spec.ts`). Cards created with
   dimension-type template tags come back with `parameters: []`, so
   `string/=` filters error at query time ("Invalid values provided for
   operator"). Verified the *Cypress original fails identically* against the
   same backend — the port reproduced the failure profile exactly
   (fidelity evidence AND a regression report in one).

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
