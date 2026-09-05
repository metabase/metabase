# dependency-graph (dependencies/dependency-graph.cy.spec.ts)

Port of the entity dependency-graph spec (the `/data-studio/dependencies`
graph/list view: what references a table/card/model/measure/metric/segment/
snippet/transform, and navigation between dependents). 16 tests.

## Status: infra-gated (external QA postgres) — runtime-UNVERIFIED

The whole describe's `beforeEach` restores the `postgres-writable` snapshot and
drives the **writable QA postgres DB** (`resetTestTable({type:"postgres"})`,
`resyncDatabase(WRITABLE_DB_ID)`, every `create*` targets `WRITABLE_DB_ID=2`).
That live DB is not in the jar harness — no postgres container, port 5432 closed,
only the `postgres_writable.sql` snapshot *file* exists. Same class as
metrics-explorer/actions-on-dashboards/embedding-reproductions: gated on
`PW_QA_DB_ENABLED`, and additionally on a `pro-self-hosted` token (EE
dependency-graph + transforms + measures are all EE).

Verified on the jar (slot 3, `JAR_PATH` + `PW_PER_WORKER_BACKEND=1`): all 16
skip cleanly, 32/32 skipped under `--repeat-each=2`, tsc clean. **Green here
means "correctly skipped", not "passing"** (wave-11 rule). No `test.fixme` and
no product-bug claims were made, so the Cypress fidelity cross-check was not
required (and can't run without the QA DB anyway).

To actually exercise it: bring up the writable postgres QA container + build the
`postgres-writable` snapshot, set `PW_QA_DB_ENABLED=1`, and provide the
`pro-self-hosted` token.

## Port notes (mechanical)

- Snowplow stubbed to no-ops (rule 6): `resetSnowplow` and the
  `dependency_entity_selected` `expectUnstructuredSnowplowEvent` assertion have
  nothing to assert against in the spike.
- **Duplicate `it` title** in upstream: "should display dependencies for a model
  and navigate to them" appears twice (2nd actually targets a *measure*).
  Playwright treats duplicate titles as a hard load error, so the 2nd was
  suffixed to "…for a measure and navigate to them" (faithful to what it does).
- New helpers isolated in `support/dependency-graph.ts` (no shared-file edits):
  `DependencyGraph` locators, `waitForBackfillComplete`, `createTransform`,
  `runTransformAndWaitForSuccess`, a `cards`-carrying `createDocument`, and a
  local `createMockCard` (the package doesn't import `metabase-types`; the shared
  `documents.ts createDocument` omits the `cards` field the document test needs).
- Reused shared factories: `createQuestion`/`createNativeQuestion`/`createDashboard`
  (factories.ts), `createMeasure` (metrics-explorer.ts), `createSnippet`
  (native-extras.ts), `createSegment` (filter-bulk.ts), `resetTestTable`
  (actions-on-dashboards.ts), `getTableId`/`resyncDatabase`/`WRITABLE_DB_ID`
  (schema-viewer.ts), `pickEntity` (dashboard.ts), `entityPickerModal`
  (notebook.ts), `entityPickerModalItem`/`SECOND_COLLECTION_ID` (question-new.ts),
  `icon`/`popover` (ui.ts).

## Consolidation candidates (later pass)

- **Transform helpers are new to the spike.** `createTransform` /
  `runTransformAndWaitForSuccess` live in `dependency-graph.ts` for now; the
  next transform-domain spec should promote them to a shared `support/transforms.ts`.
- **`createDocument` has three+ copies now** (documents.ts, command-palette.ts,
  interactive-embedding.ts, and this one) with divergent param support — only
  this copy carries `cards`. Unify into one document factory that takes the full
  `{name, collection_id, document, cards}` shape.
- **`createMockCard`** re-implemented here (like `mockParameter`/`mockVirtualCard`
  elsewhere) — a shared `support/mocks.ts` for the `createMock*` shapes would
  stop the re-implementation.
