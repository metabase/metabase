# dependency-unreferenced-list

Port of `e2e/test/scenarios/dependencies/dependency-unreferenced-list.cy.spec.ts`
→ `tests/dependency-unreferenced-list.spec.ts`.

- **Size:** ~1217-line Cypress spec → faithful 1:1 port. 11 tests (analysis 2,
  search 2, filters 3, sorting 3, selecting-entities 1) — all describe/it
  structure and issue references (#77714, #71037) preserved.
- **Result on jar (slot 5, default loop):** 11/11 correctly gated-skipped
  (`PW_QA_DB_ENABLED` unset). tsc clean for both new files.

## Gated-skip (why)

`@external` by construction — identical shape to the already-landed
`dependency-graph.spec.ts`. The `beforeEach` restores the `postgres-writable`
snapshot and seeds/resyncs a writable QA postgres table (`H.resetTestTable` /
`resyncDatabase` on `WRITABLE_DB_ID`) for the spec's one *table* entity. The
models/segments/metrics/snippets themselves live on the sample DB, but the
beforeEach cannot run without the writable snapshot + DB, which the jar harness
(and CI's `-@external` runs) don't have. Also needs a `pro-self-hosted` token
(EE dependency diagnostics). Gated on
`!PW_QA_DB_ENABLED || !resolveToken("pro-self-hosted")`, matching the precedent.

**Runtime-unverified** here: a green run means "correctly skipped", not
"passing". It will execute for real once the writable-DB path is wired
(`PW_QA_DB_ENABLED=1` + postgres on :5404 + `postgres-writable` snapshot). No
`test.fixme` and no product-bug claims — so no Cypress cross-check was required.

## Helper reuse / new surface

- **Reused read-only:** `waitForBackfillComplete` from the shared dependency
  helper `support/dependency-graph.ts`; `resetTestTable`
  (actions-on-dashboards), `getTableId`/`resyncDatabase`/`WRITABLE_DB_ID`
  (schema-viewer), `createSegment` (filter-bulk), `createSnippet`
  (native-extras), `updateDashboardCards` (dashboard-core), the create*
  factories (factories), `ADMIN_PERSONAL_COLLECTION_ID` (permissions),
  `FIRST_COLLECTION_ID`/`SAMPLE_DATABASE`/`USERS` (sample-data), `popover` (ui).
  No shared file was edited.
- **New file `support/dependency-unreferenced-list.ts`:** the
  `DependencyDiagnostics` list/search/filter/sidebar locators,
  `waitForUnreferencedEntities` (poll the unreferenced endpoint until the async
  analysis classifies every seeded entity), and `getNodeName`.
- **Spec-local:** `mockParameter` (createMockParameter's 4 defaults; the shared
  `dashboard-parameters.mockParameter` uses a narrower `MockParameter` type that
  doesn't carry `target`/`values_source_config`), `ADMIN_USER_ID` (derived from
  the instance-data JSON — not exported by a shared module).

## Notes on port fidelity (gotchas applied, not new)

- `USERS.admin.first_name`/`last_name` → the Playwright `USERS` map carries only
  email/password (known consolidation gap). Admin's full name is the snapshot
  constant "Bobby Tables" (the spec already hardcodes it as `createdBy`), used
  for the table-owner assertion.
- `findByText(string)` → `getByText(name, { exact: true })` (rule 1);
  `should("not.exist")` → `toHaveCount(0)`.
- `searchInput().type(...)` → `pressSequentially` (debounced typeahead, rule 5).
- `scrollIntoView().should("be.visible")` → `scrollIntoViewIfNeeded()` +
  `toBeVisible()` (virtualized list).
- `.parents("[data-index]").should("have.attr", "data-index", n)` →
  `list.locator("[data-index]").filter({ has: page.getByText(...) })` +
  `toHaveAttribute` (has-locator built from `page`, not the scope — wave-11
  gotcha).
- Snowplow (`resetSnowplow` / `expectNoBadSnowplowEvents` /
  `expectUnstructuredSnowplowEvent`) → no-op stubs (rule 6); the spike stubs
  snowplow.

## Dividends

None. Faithful structural port of a fully-gated spec; no bug found, no
Cypress-masked issue, no assertion strengthened beyond the original.
