# dashboard-filters-date

Port of `dashboard-filters/dashboard-filters-date.cy.spec.js` →
`tests/dashboard-filters-date.spec.ts`. 5/5 tests, 10/10 under `--repeat-each=2`
on the jar (slot 4, TZ=US/Pacific). New helpers: `support/dashboard-filters-date.ts`.

## Fixes classified

All three fixes were **known-gotcha applications** (not new gotchas, not product
bugs) — no `test.fixme`, no product-bug claims, no Cypress cross-check needed.

1. **`getByLabel("Time")` is a substring match that also hits the "Remove time"
   button** (aria-label "Remove time" contains "time") → strict-mode violation.
   Instance of the "native widget accessible-name" rule — scoped to
   `getByRole("textbox", { name: "Time", exact: true })`.

2. **`<input type="time">` ignores `pressSequentially` — use `fill()`.** The
   masked *date* textboxes need real keystrokes (per the existing date-picker
   rule), but the native time input is the opposite: `pressSequentially("09:27")`
   left the segmented control at its `00:00` default, silently. This produced a
   *faithful-looking* failure worth flagging: Single Date + a specific time
   makes the filter a **1-minute window**, so an unset time filters `00:00:00`–
   `00:01:00` → "No results", where the correct 09:27 window catches the order
   at `2025-05-23T09:27:34` → "49.54". The symptom (empty result) points
   nowhere near the cause (wrong input-entry method); the trace's request URL
   (`date=2025-05-23T00%3A00%3A00`) is what pinned it. Mixed date/time popovers
   need **pressSequentially for masked text inputs, fill for native time
   inputs** — worth a one-line addition to the date-picker patterns section.

3. **"Include this minute" is a Mantine Switch** (metabase#6660 test) — the
   label span intercepts pointer events for the underlying `role=switch` input.
   Rule 4 application: `getByLabel(/Include this minute/).click({ force: true })`
   (getByLabel resolves to the input; the text is a mixed-content node
   "Include" + `<strong>this minute</strong>`).

## Consolidation dividend (flag)

`support/dashboard-filters-date.ts` is the first Playwright home for the
`DateFilter.*` helpers from
`e2e/test/scenarios/native-filters/helpers/e2e-date-filter-helpers.js`
(`setMonthAndYear` / `setQuarterAndYear` / `setSingleDate` / `setTime` /
`setDateRange` / `setRelativeDate` / `setAdHocFilter`). Any future
native-filters / date-widget port that needs these should import from here
rather than re-implement — candidate for promotion to a shared `date-filter.ts`
at the next consolidation pass.

## Notes on fidelity

- Dropped the unawaited `@metadata` intercept from the Cypress `beforeEach`
  (rule 2 — never waited on).
- The per-dashcard `@dashcardQuery${DASHCARD_ID}` alias → generic
  `waitForDashcardQuery` (single dashcard); registered before `clearFilterWidget`,
  awaited after. Apply-query covered by the retrying `toContainText` assertion.
- The "All Options / years" representativeResult ("79.37") is data-derived and
  the upstream fixture comments "this may change every year" — it passed on the
  local jar (COMMIT-ID 751c2a98) with TZ=US/Pacific, but is a latent
  year-rollover / stale-jar-data risk.
