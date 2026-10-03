# visualizer-filters (dashboard/visualizer/filters.cy.spec.ts)

**Zero executed tests.** The file's only test carries `{ tags: "@skip" }` upstream
(with a TODO saying the two datasets should be compatible), so it never runs in
CI. Ported as `test.skip("…", async …)` with the body transcribed — the
established precedent (bar-chart, filter, dashboard-drill, custom-column-1).

A green run here means "correctly skipped", not "passing". Same reporting shape
as the fully-`@external` specs noted in wave 11 — worth counting separately in
the batch metrics.

Small note for the visualizer consolidation backlog (already flagged in
PORTING as "visualizer helper surface split across 3 files"): the shared
`support/visualizer-basics.ts` carries `PRODUCTS_AVERAGE_BY_CREATED_AT` but not
`PRODUCTS_AVERAGE_BY_CATEGORY`, which upstream's
`e2e/support/test-visualizer-data.ts` does have. Transcribed into the spec
rather than editing a shared module. When the visualizer helpers are unified,
port the whole `test-visualizer-data.ts` fixture set, not the subset each spec
happened to need.
