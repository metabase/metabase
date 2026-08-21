# scalar-tabular (visualizations-tabular/scalar.cy.spec.js)

Ported to `tests/scalar-tabular.spec.ts` (named to avoid collision with the
existing `tests/scalar.spec.ts`, which is the *charts* scalar spec).

Small spec: a viewport loop (mobile/tablet/desktop/hd) asserting compact
notation "1.5T", plus a date-without-time rendering + viz-settings test.

## Result
Jar mode, slot 5: 4 passed / 1 skipped (mobile). Stable under `--repeat-each=2`
(8 passed / 2 skipped). tsc clean. No fixmes, no bug claims → no cross-check
needed.

## Fixes / classification
No stabilization fixes required — clean first pass. All handled by existing
shared helpers:
- `H.createQuestionAndDashboard` → `mb.api.createQuestionAndDashboard`
- `H.visitDashboard` → `visitDashboard` (ui.ts)
- `H.visitQuestionAdhoc` on a **native** query → `visitNativeQuestionAdhoc`
  (charts-extras.ts) — the plain `visitQuestionAdhoc` throws on native+autorun.
- `H.openVizSettingsSidebar` → charts.ts
- `cy.viewport(w,h)` → `page.setViewportSize`
- `cy.skipOn(size === "mobile")` → `test.skip(...)`

## Notes (no new gotchas)
- `should("be.hidden")` here is on single `findByText` matches (not multi-match)
  → `toBeHidden()`. Rule 3's any-of caveat did not apply.
- Date test is date-asserting (Z timestamp cast to date renders "April 30, 2024"
  a day early under Pacific) — ran with `TZ=US/Pacific` per the wave-13 TZ rule.
  Passes.
- Upstream test title `should render human readable numbers on ${size} screen
  size (metabase` is genuinely truncated (unclosed paren) — preserved verbatim.
- No new helpers added → no helper-index regen needed.
