# timelines-collection

Port of `e2e/test/scenarios/organization/timelines-collection.cy.spec.js` →
`tests/timelines-collection.spec.ts`. 27 tests (26 admin/readonly + 1
snowplow-tagged), all green on the jar (slot 2), 54/54 under `--repeat-each=2`.
No `test.fixme`, no product-bug claims — nothing needed the Cypress cross-check.

## Consolidation dividend

`createTimeline` / `createTimelineWithEvents` were imported **wholesale** from
the pre-existing `support/timelines.ts` (staged by a sibling; imported
read-only). The collection spec and the question spec (`timelines-question`)
now share the same timeline API factories — no re-implementation. Only two
genuinely spec-local helpers (`openMenu`, `setFormattingSettings`) plus the
request-wait helpers landed in the new `support/timelines-collection.ts`.

## Gotcha (environment, not a bug): date-display assertions need TZ=US/Pacific

The two date-display tests ("should create and edit an event with a date",
"should use custom date/time formatting settings") FAILED on a first run and
passed once re-run with `TZ=US/Pacific`. Root cause is purely timezone:

- CI's `e2e-playwright.yml` sets `TZ: US/Pacific` ("to make Node match the
  instance tz"). Playwright's browser context inherits the process TZ (no
  `timezoneId` is set in `playwright.config.ts` or the fixtures), so on CI the
  browser runs in Pacific.
- A dev box in another zone (this one is NZST, +12) shifts every date-only
  event by a day: `10/20/2026` rendered "October **19**, 2026", and the
  `2022-10-12T18:15:30Z` event's date field showed `2022/10/13` instead of
  `2022/10/12`.

This is not a port drift and not a product bug — it is the same class as
Cypress's own `TZ: US/Pacific` requirement. **Any ported spec that asserts a
rendered/edited date string must be verified with `TZ=US/Pacific`** to match
CI. Worth a line in PORTING.md's environment facts if it bites again — the
symptom (an off-by-one date) looks nothing like a timezone issue at first.

## Gotcha: `findByDisplayValue` (support/filters-repros) is a one-shot scan

`cy.findByDisplayValue(v).should("be.visible")` retries; the shared
`findByDisplayValue` helper does an `expect(first).toBeVisible()` then a single
non-retried value scan. In the custom-date-formatting test it ran a beat
before the *edit form* populated the Date field, so the scan saw an empty input
and threw "No form control with display value …". Fixed by asserting on the
known field directly — `expect(page.getByLabel("Date")).toHaveValue("2022/10/12")`
— which retries. (The other call site, the collection-title edit in "preserve
collection names", is fine because the title is already rendered when scanned.)
Note for a future consolidation: `findByDisplayValue` could take an optional
retry, but callers that know the target field should prefer `toHaveValue`.

## Mechanical notes

- Snowplow-tagged describe ("scenarios > collections > timelines") → snowplow
  helpers are no-op stubs (rule 6); the UI flow is ported for real, with an
  added `waitForCreateEvent` at the Create click to keep it deterministic
  (the original leaned on the snowplow assertion for pacing).
- `openMenu` = `findByText(name).parent().parent().icon("ellipsis")` → grandparent
  card via `xpath=../..`, hover (action icon is hover-gated), then click.
- `cy.icon(name).should("be.visible")` (e.g. star/cake in the event list) →
  `.filter({ visible: true }).first()` (rule 3 any-match).
- EditableText edits (event/timeline name, collection title) → click +
  ControlOrMeta+A + fill/pressSequentially + blur, anchored on the PUT.
