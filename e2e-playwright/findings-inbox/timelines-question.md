# timelines-question (organization/timelines-question.cy.spec.js → tests/timelines-question.spec.ts)

755 lines, no gating tags. 19 tests (17 admin + 2 readonly). All faithful.
Verified on the jar (slot 2, COMMIT-ID 751c2a98): 19/19 green, 38/38 under
`--repeat-each=2`. tsc clean.

New helper module: `support/timelines.ts` — createTimeline / createTimelineEvent /
createTimelineWithEvents (API ports), timelineEventChip, and the spec-local
timelineEventCard / timelineEventVisibility / toggleEventVisibility /
waitForTimelinesAfterCreatingAnEvent / timelineCardHeader (`.closest([aria-label])`
ports via `xpath=ancestor-or-self::*[@aria-label='…']`).

## Fixes classified

- **Known gotcha (SegmentedControl disabled segment).** "should display all
  events in data view" clicks `getByLabel("Switch to data")`. The display toggle
  is a Mantine SegmentedControl whose `data` items carry `disabled: true`
  (QuestionDisplayToggle.tsx) — the real onClick lives on the root, so Cypress's
  bubbling click on the svg label worked, but Playwright sees the label
  associated with a disabled input and refuses. Fix: `click({ force: true })`.
  This is the same class as the wave-10 "descendant of aria-disabled ancestor →
  force click" gotcha, now also for `disabled` SegmentedControl segments.

- **Existence-only findByTestId ported as toBeVisible was wrong.** "collapse
  close events…" does `cy.findByTestId("visualization-root").findByTestId(
  "timeline-events-band")` with NO assertion — an existence check only. Ported as
  `toBeVisible()` it failed: the band `<div>` is attached but its chips are
  opacity-hidden until laid out. Fix: `toBeAttached()`. General rule reminder: a
  bare Cypress `findBy*` with no chained assertion means "exists" (toBeAttached),
  not "is visible".

## Migration dividend

None — no product bugs found; the two fixes were port-fidelity issues, not app
behaviour. The cross-check (`--browser chrome` on the original) was not needed:
no test.fixme / product-bug claims were made.

## Shared-file note

Added one optional field to the shared `AdhocQuestion` type in
`support/permissions.ts` (`visualization_settings?: Record<string, unknown>`).
Four adhoc questions here pass `visualization_settings`, which
`adhocQuestionHash` already spreads into the URL hash at runtime — the type was
just incomplete. Additive, no behaviour change.
