# dashboard-card-reproductions

Port of `e2e/test/scenarios/dashboard-cards/dashboard-card-reproductions.cy.spec.js`
(1702 lines) → `tests/dashboard-card-reproductions.spec.ts`. Verified on the CI
uberjar, slot 5 (`JAR_PATH=…`, hash `751c2a9`, per-worker backend on :4105).

## Result

- 24 tests passing on the jar.
- 2 skipped by design: issue 18067 (`@external`, mysql-writable QA DB → gated on
  `PW_QA_DB_ENABLED`) and issue 17160-2 (`@skip` upstream, "FIXME: setup public
  dashboards").
- 3 `test.fixme` — issue 31628 smartscalar `7x3` / `7x4` "should follow
  truncation rules" and `2x2` "should truncate previous value (840x600)".

## New helpers (support/dashboard-card-repros.ts)

All new; several duplicate existing helpers — **consolidation candidates**:

- `assertIsEllipsified` / `assertIsNotEllipsified` — `assertIsEllipsified`
  already exists verbatim in `support/search.ts`; the negation was missing.
  Fold both into one place.
- `pieSlices` — port of H.pieSlices (no prior home).
- `assertDescendantsNotOverflowDashcards` — port of the spec-local overflow
  loop + H.assertDescendantNotOverflowsContainer.
- `grantClipboardPermissions` / `readClipboard` — context.grantPermissions +
  navigator.clipboard.readText.
- `toggleFilterWidgetValues` — port of the H helper.
- `showDashcardVisualizerModalSettings` / `saveDashcardVisualizerModal` —
  ports of the e2e-dashboard-visualizer helpers (first visualizer-modal helpers
  in the spike).
- `createQuestionAndAddToDashboard` — appends a question to an EXISTING
  dashboard (distinct from filters-repros' createQuestionAndDashboard, which
  makes a fresh one). Candidate for the api layer.

## Fixes classified (feedback loop)

### Known gotchas the port hit (brief could have pre-empted)

1. **Dashcard queries are POST, not GET.** issue 29304's `getDashcardQuery`
   wait was first registered as GET and hung the 30s action timeout. POST.
2. **Hardcoded `http://localhost:4000` in a click-behavior URL.** issue 46318
   types `http://localhost:4000/?q={{group_name}}` — Cypress's baseUrl. Under
   the per-worker backend the app is on :410N, so navigating to :4000 aborts
   (connection refused) and `page.url()` never changes. Repointed the
   destination + assertions at `mb.baseUrl` — the test's real subject is that
   `{{group_name}}` is interpolated into the URL, which is preserved. Same class
   as the documented MB_SITE_URL / :4000 gotcha, but a test-authored literal
   rather than a backend setting.
3. **Export POST sends `parameters` as a JSON-encoded string field.** issue
   63416: `request.postDataJSON().parameters` is a string, not an array —
   `JSON.parse` it before asserting. (Value was correct all along.)

### New gotcha

4. **Smartscalar previous-value truncation is a JS text-measurement, and it
   diverges between Playwright's bundled Chromium and Chrome.**
   `PreviousValueComparison` (SmartScalar.tsx) decides compact-vs-full display
   and whether to show a hover tooltip by measuring text against the card
   `width`. That measurement lands on opposite sides of the truncation boundary
   in Playwright's Chromium vs Chrome 150 — e.g. in a 7x3 card the previous
   value is shown *in full* (the `toContainText` assertions pass) yet still gets
   a hover tooltip, because the measure says it overflows.

   **Cross-check (playbook fidelity rule): NOT a product bug, NOT port drift.**
   The ORIGINAL Cypress spec, `GREP="should follow truncation rules"
   --browser chrome` against **this same jar backend** (`MB_JETTY_PORT=4105`,
   hash `751c2a9`), passes **all 6** truncation tests. Same backend + FE bundle;
   only the browser engine differs. So the app is correct and the port steps are
   faithful — the decider here is the *browser engine's text metrics*, not the
   artifact. CI's Playwright leg runs the same Chromium, so these would be red
   there too, which is why they are `test.fixme` rather than left failing.
   Cost of fixme: the 7x3/7x4 tests also uniquely cover `scalar-period`
   ("Apr 2029") and the description tooltip — those assertions pass but are
   skipped along with the divergent tail. Acceptable, documented gap.

## Migration dividends

None claimed. (The one candidate — a real previous-value tooltip appearing
where upstream expects none — was disproven by the cross-check: Chrome renders
it correctly, so it is an engine artifact, not a product issue.)
