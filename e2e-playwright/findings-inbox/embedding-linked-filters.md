# embedding-linked-filters

Port of `e2e/test/scenarios/embedding/embedding-linked-filters.cy.spec.js`
(metabase#13639, metabase#13868) → `tests/embedding-linked-filters.spec.ts`.
9 tests, all green on the jar (slot 2), 18/18 under `--repeat-each=2`. tsc clean.

## Result

Clean, faithful port on the first jar run — no fixmes, no product-bug claims,
so no Cypress cross-check was required. Static embedding, linked dashboard
filters: the parent (State / ID) filter constrains the child (City / Category)
filter's offered values inside the embedded iframe.

## Fixes / classifications

All mechanical, no new gotchas:

- **Fixtures ported wholesale** (`shared/embedding-linked-filters.js` →
  `support/embedding-linked-filters.ts`): the two `cy.request("PUT", …)`
  mappers became `api.put`. Nothing surprising.
- **`H.applyFilterToast`** had no shared port — it is just
  `getByTestId("filter-apply-toast")`; added to the new module. (Existing
  `applyFilterButton` in dashboard-parameters.ts already targets the toast's
  Apply button, so no duplication there.)
- **`echartsContainer().get("text").should("contain"/"not.contain", X)`** is a
  chai-jquery any-of assertion over the SVG axis `<text>` collection. Ported as
  `expectEchartsTextContains` (first match visible) /
  `expectEchartsTextNotContains` (count 0), case-sensitive substring regex, no
  `^`/`\b` anchors (wave-11 ECharts-whitespace rule).
- **Typeahead** in `searchFieldValuesFilter` uses `pressSequentially("An")`
  (rule 5), not `fill()` — the linked-filter dropdown filters on real
  keystrokes.
- **`removeValueForFilter`** hovers the filter widget before clicking its close
  icon (hover-gated), where the Cypress synthetic `.click()` did not need to.
- **`cy.location("search")`** assertions → `expect.poll(() => new
  URL(page.url()).search)` (retried-URL rule).
- **`cy.window().then(win => win.location.search = …)`** → `page.evaluate`; the
  following retrying `toHaveCount`/`toContainText` assertions absorb the reload.

## Dividends

None — no Cypress-masked bug surfaced; behaviour matches upstream on the jar.

## Consolidation candidates (flag only, no shared edits)

- `applyFilterToast` belongs next to `applyFilterButton` in
  `dashboard-parameters.ts`.
- `expectEchartsTextContains` / `expectEchartsTextNotContains` (any-of over
  ECharts axis `<text>`) is a generic pattern — candidate for charts.ts.
