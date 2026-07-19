# dashboard-filters-with-question-revert

Port of `filters-reproductions/dashboard-filters-with-question-revert.cy.spec.js`
(issue 35954, also touches 45022). 6 tests. Verified on the jar (slot 3): 6/6,
and 12/12 under `--repeat-each=2`. tsc clean.

## Result

Faithful port, no product-bug/fixme claims — nothing diverged, so no fidelity
cross-check was needed. All fixes were mechanical porting-rule applications, not
app findings.

## Fixes classified (all "known gotcha" — brief already covered them)

- **Custom snapshot** (`H.snapshot("35954")` / `H.restore("35954")`): built once
  per worker behind a module-level `snapshotReady` flag; ids captured
  module-level (snapshot preserves them). Same pattern as metrics-explorer, but
  the build here drives the full revert-through-the-UI flow (not pure-API),
  including upstream's mid-build "root out the flakiness" assertions.
- **cell-data `should("contain"/"not.contain")`** is a combined-text substring
  check over the set → toPass over joined `allInnerTexts` (also lets the query
  re-run after a filter change). Helper takes `Page | FrameLocator` so the same
  assertion serves the embedding-preview iframe.
- **revision/revert + card query intercepts** → `waitForResponse` registered
  before the revert click, awaited after.
- **Embedding preview**: `openLegacyStaticEmbeddingModal({activeTab:"parameters",
  previewMode:"preview"})` performs the Parameters-tab + Preview clicks upstream
  did by hand; the two `@previewEmbed` waits became a positive iframe-heading
  load gate (embedding-reproductions precedent).

## Note (not a finding, just context)

- The `?number=3` that reappears on a fresh `visitDashboard` in tests 1 and 2 is
  Metabase's **per-user last-used parameter value** (set when "3" was applied in
  the build), captured in the snapshot — not a saved dashboard default. Worth
  knowing before anyone "fixes" what looks like a stray query param.

## Dividends

None. Straightforward faithful port; passed on the jar first attempt.
