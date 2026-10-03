# dashboard-filters-reproductions-2 — port findings

Port of `filters-reproductions/dashboard-filters-reproductions-2.cy.spec.js`
(2232 lines, 31 tests across 30 describes) → `tests/dashboard-filters-reproductions-2.spec.ts`.
Verified on the CI EE uberjar (`target/uberjar/metabase.jar`, COMMIT-ID 751c2a98),
slot 3 / :4103, per-worker backend. **27 passed, 3 gated-skipped**, and
**58 passed / 6 skipped under `--repeat-each=2`**. tsc clean (the only tsc
errors are pre-existing in `pivot-tables.spec.ts`).

No product-bug or `test.fixme` claims — every fix was port drift or a known
harness-semantics difference, classified below.

## New helpers (support/filters-repros-2.ts)

Two, both genuinely absent from the existing surface:
- `dashboardParametersDoneButton` — port of H.dashboardParametersDoneButton
  (the "Done" button in the parameter sidebar). **Consolidation candidate:**
  it's a one-liner over `dashboardParameterSidebar` (already in
  filters-repros.ts) — fold in next pass.
- `getManyDataTypesBooleanFieldId` — port of issue-45670's spec-local
  `getField()` (locate `many_data_types.boolean` on the writable postgres DB).

Everything else was imported from existing modules (filters-repros,
dashboard, dashboard-parameters, dashboard-cards, dashboard-management,
dashboard-repros, models, metrics, notebook, binning, detail-view,
question-saved, question-new, revisions, sharing, schema-viewer,
native-filters-extras, native-extras, interactive-embedding, click-behavior,
command-palette, ui). No shared files were edited.

## Gates (as briefed)

- **issue 45670** (`{ tags: ["@external"] }`) and **issue 14595** (needs the
  `postgres-writable` snapshot + `many_data_types` — upstream *forgot* the
  `@external` tag but it can't run without the QA DB) → `test.skip` gated on
  `PW_QA_DB_ENABLED` in the beforeEach (skips before `restore("postgres-writable")`).
- **issue 48824** (`{ tags: "@skip" }`, "unskip after v54") → `test.skip(true, …)`
  preserved; body ported for when it's re-enabled.
- Issue numbers kept exact, including the bare `44047` / `44266` describe names
  and `issue #66670`.

## Fixes classified

### New gotcha — Playwright treats descendants of an `aria-disabled` ancestor as disabled (issue 32573)
`cy.findByLabelText("Disconnect").click()` on the "Unknown Field" (invalid)
parameter mapping. The Disconnect control is an `ActionIcon` with **no**
`disabled` prop and a wired `onClick`, but it renders **inside** the mapper's
`Flex component="button"` whose `aria-disabled` is `true` for the invalid
variant (`DashCardCardParameterMapperButton.tsx`). Playwright's actionability
"enabled" check walks ancestors and considers any descendant of an
`aria-disabled=true` element disabled, so `.click()` waits out the full timeout;
Cypress does not do this. The button genuinely works, so the faithful port is
`click({ force: true })`. Confirmed the disabled state is the app's intended
aria-disabled (read `DashCardCardParameterMapperButton.tsx`), not a regression —
no cross-check needed. **Feed to PORTING.md:** "descendant-of-aria-disabled" is a
new class of false-disabled distinct from the boolean-attr gotcha; force-click
(or scope to the inner control) is the fix.

### Known gotcha — revision fetch can fire on sidebar-open, not the tab click (issue #66670)
`cy.wait("@revisionHistory")` after clicking the History tab. Registering the
Playwright `waitForResponse(GET /api/revision)` *after* `openDashboardInfoSidebar`
timed out — the fetch fires when the info sidebar opens, before the History-tab
click. Moved the registration **before** `openDashboardInfoSidebar` (await still
after the tab click). Instance of the standing rule: register at the true
trigger, and `cy.wait` consumes past responses while `waitForResponse` doesn't.

### Mechanical
- Duplicate title combo: upstream declares **two** identical
  `describe("Issue 60987")` blocks with identical test titles — Playwright
  rejects duplicate combos. Kept both issue numbers exact; suffixed the second
  (the text-color variant) test title with ", with the text-medium color".
- `visitDashboard(dashboard.id, { params })` → `visitDashboardWithParams`
  (filters-repros).
- `visitEmbeddedPage` / `visitPublicDashboard` → the filters-repros /
  question-saved ports (45659, 44047, 17061).
- `cy.get("@publicDashcardData.all").should("have.length", 1)` (17061) →
  `trackResponses` + 500ms settle.
- `cy.clock(new Date("2028-02-26"))` (54236) → `page.clock.setFixedTime`.
- Width/overflow `.should("be.lt", …)` (44090, 59306, 52918, 46372) →
  `boundingBox()` / in-page `offsetWidth`/`scrollWidth`/`scrollHeight` evaluate.
- EditableText dashboard title (66670 step 5b): click → select-all →
  `pressSequentially` → blur, anchored on the PUT (fill() doesn't mark dirty).
- `MetabaseApi` has no `.delete()` — used the public `fetch("DELETE", …)`.
- `createMockParameter` extra field `values_query_type` (59306) isn't in the
  shared `mockParameter` type — spread the mock and add the field.
- Virtualized dashcard cells → `.first()` on single-value cell getByText.
