# mid-stream-download-failure

Source: `e2e/test/scenarios/sharing/downloads/mid-stream-download-failure.cy.spec.ts`
Target: `tests/mid-stream-download-failure.spec.ts`
New helper: `support/mid-stream-download-failure.ts`

## Result
1 test, green on the jar (slot 1, `JAR_PATH` uberjar 751c2a98). Passes 2/2 under
`--repeat-each=2`. tsc clean for the ported files. No fixme, no product-bug claim,
so no Cypress cross-check was needed.

## Fixes / classification
- **Dropped a redundant intercept (known gotcha, rule 2).** Upstream registers
  `cy.intercept(POST /api/card/:id/query).as("preview")` then `cy.wait("@preview")`
  after `visitQuestion`. Our `visitQuestion` already awaits the card-query
  response, so the preview load is enforced there — the separate wait is
  subsumed. Noted in the spec header.
- **No download-event wait (faithful, not a fix).** The whole point of the repro
  is that the CSV export aborts mid-stream, so no browser `download` event fires
  and nothing lands as a file. The frontend surfaces the failure in the
  download-status toast (`status-root-container` → "Download error"), which is
  what both the original and the port assert. This is the inverse of the
  precedent `sharing-download-reproductions` / `downloads.ts downloadAndAssert`,
  which assert success and parse the file — those helpers could not be reused, so
  the popover-drive + toast-assert flow lives in the new helper file.

## Notes
- The reproduction is a genuine backend/streaming behaviour: the H2 native query
  `SELECT 100 / (x - 5000) AS v FROM SYSTEM_RANGE(1, 10000)` divides by zero at
  row 5000. The capped preview (2000 rows) succeeds; the unbounded export streams
  past the failing row and aborts. No `page.route` injection was needed (the task
  flagged it as optional) — so there is no route handler that could outlive the
  test.
- No migration dividend to report: the port is a faithful 1:1 with a strictly
  equivalent assertion.
