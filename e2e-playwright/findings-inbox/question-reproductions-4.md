# question-reproductions-4 — port report (slot 3, :4103)

Source: `e2e/test/scenarios/question-reproductions/reproductions-4.cy.spec.js` (1221 lines)
Target: `e2e-playwright/tests/question-reproductions-4.spec.ts`
Helpers: `e2e-playwright/support/question-reproductions-4.ts` (new, spec-local; no shared module touched)

## Summary (3 lines)

25 tests across 17 describes ported 1:1 — 24 executed, 1 gate-skipped (upstream `@skip`);
48/48 green under `--repeat-each=2` on the CI uberjar (`751c2a98`), tsc clean.
10 of 12 mutants killed first pass; both survivors were **bad mutations**, proved so by
follow-up probes (12/12 effectively). Five fixes were all port drift, no product bugs.

## Infra tier — MOSTLY NO CONTAINER (the brief's classifier was right here, but only just)

**Tier: 24/25 tests need no container at all. Exactly one test needs the QA Postgres.**

- `issue 44974` is the only `@external` describe and it is a genuine QA-Postgres test:
  `H.restore("postgres-12")` + `H.withDatabase(2, ...)` + a card created on database 2.
  Gated on `PW_QA_DB_ENABLED`.
- Every other describe runs entirely on the H2 sample database. No maildev, no webhook
  tester, no mongo, and **nothing touches the writable container** — so FINDINGS #85
  (shared `writable_db` debris) is **not applicable** to this spec.
- `issue 45359` is tagged `@skip` upstream (never runs in CI). Ported in full and skipped
  with that reason rather than dropped.

## Executed vs gate-skipped (gate-OFF control run)

| Run | passed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` (gate ON) | 24 | 1 (`45359`, upstream `@skip`) |
| `PW_QA_DB_ENABLED` unset (control) | 23 | 2 (`45359` + `44974`) |
| gate ON, `--repeat-each=2` | 48 | 2 |

The delta is exactly `issue 44974`, so the QA-DB test really executes with the container
up and really skips without it. No test is silently a no-op.

Backend verified before every run: `ps` on :4103 → `java -jar target/uberjar/metabase.jar`,
`/api/session/properties` `version.hash` = `751c2a9` = `target/uberjar/COMMIT-ID` `751c2a98`.

## tsc

`bunx tsc --noEmit` clean for this spec and its support module. (The only errors in the
tree are four pre-existing ones in a sibling agent's `tests/transforms.spec.ts` —
`Locator` passed where `Page` is expected — untouched by me.)

## Fixes needed (all port drift — five, all classified)

1. **`issue 32499` — `H.createQuestion(..., { visitQuestion: true })` does NOT call
   `visitQuestion` for models.** `api/createQuestion.ts:175-181` routes `type: "model"`
   through `visitModel` and `type: "metric"` through `visitMetric`. It matters:
   `/question/:id` for a model client-side-redirects to `/model/:id-slug`, which runs the
   card through **POST `/api/dataset`** and never POSTs `/api/card/:id/query` (measured on
   the request log). The port's `visitQuestion` therefore hung 30s on a request that is
   never made. *Known-gotcha class* (read the Cypress helper's real branch before porting
   its call shape) — worth a line in PORTING.md's helper-signature bullet, since
   `{ visitQuestion: true }` reads as "call visitQuestion" and isn't.

2. **`issue 41612` — `QuestionDisplayToggle` marks BOTH SegmentedControl items
   `disabled: true` on purpose.** The component handles the toggle with its own `onClick`
   on the control root (`QuestionDisplayToggle.tsx:39-50`), so the `<label>` carries
   `data-disabled="true"` permanently. Cypress's `.click()` only checks the `disabled`
   *property* of form elements and the subject here is an `<svg>`, so it clicks straight
   through; Playwright's actionability check sees the disabled ancestor and waits forever
   ("element is not enabled", 30s). `click({ force: true })` is the faithful equivalent —
   same real mouse, same point, bubbles to the root handler. **New gotcha:** *Playwright's
   enabled-check reads disabled state off ancestors; Cypress does not. A component that is
   deliberately `disabled` while handling clicks itself will deadlock a faithful port.*

3. **`issue 39771` — `realHover()` runs no actionability checks, and the hover target is
   `visibility: hidden` until hovered.** Measured: the bucket `<button>` and everything
   under it report `visibility: hidden`; the row above it is visible. The hover is what
   reveals it, so Playwright's default hover (waits for visibility) deadlocks on its own
   precondition. `hover({ force: true })` moves the same real mouse to the same point.
   This is the *inverse* of the wave-9 "a real hover CREATES the overlay that intercepts
   its own click" gotcha and belongs next to it.

4. **`issue 48829` (dashboard click-action test) — the parked-cursor gotcha, inverted.**
   Cypress's `realHover` parks the OS cursor on the dashcard and its later *synthetic*
   clicks never move it, so the card is still `:hover` (overlay interactive) when "Click
   behavior" is clicked. Playwright's `editDashboard` click moves the real mouse to the
   header, the overlay stops receiving pointer events, and the dashcard underneath
   intercepts. Fix: re-hover the dashcard after `editDashboard` — that restores the exact
   cursor state the original is in at that point. **Generalisable:** whenever a Cypress
   spec does `realHover(X)` then several plain clicks then acts on X's hover-revealed UI,
   the port needs the hover repeated immediately before the action.

5. **`issue 32499` — "Edit metadata" is mixed-content.** The model actions menu renders
   `Edit metadata` plus a sibling completion badge, so the row's full text is
   `"Edit metadata 89%"`. testing-library's exact `findByText` compares an element's own
   text nodes (matches); Playwright's exact `getByText` compares the element's full text
   (does not). The shared `openQuestionActions(page, action)` helper therefore cannot be
   used with this label. Ported as `openQuestionActions(page)` + a prefix regex, inline,
   because shared modules are off limits — **flagging for the consolidation pass**: the
   shared helper will hit this again for any badge-bearing menu row.

## Container evidence

QA Postgres (`issue 44974`) — the only container-dependent test:

- Gate ON: `[2/25] … issue 44974 … @external` **executed and passed** (both repeats).
- Gate OFF: same line reports **skipped**, total drops 24 → 23.
- The test resolves the QA table id through a port of `H.withDatabase(2, …)`
  (`GET /api/database/2/metadata?include_hidden=true`), which returns the postgres
  `PEOPLE` table id — i.e. the postgres-12 snapshot really is restored and synced;
  a stale/absent database would throw on the missing `PEOPLE_ID` key rather than pass.
- **`writable_db` is never touched** — no `queryWritableDB`, no schema creation, no
  `resetTestTable`. FINDINGS #85 is not applicable.

## Mutation testing — 12 mutants, 10 killed first pass, both survivors explained

Inputs were mutated, never expectations, and several were aimed deliberately at tail
assertions.

| # | Mutation (input) | Result | Died at |
|---|---|---|---|
| M1 | 44668: custom column formula `abc_` → `xyz_` | KILLED | **tail** — the `abc_68…abc_90` legend labels, ~15 assertions in |
| M2 | 38989: invalid join `"source-table": 123` → `ORDERS_ID` | KILLED | "Show error details" |
| M3 | 39771: breakout unit `quarter-of-year` → `month` | KILLED | breakout-step click |
| M4 | 45063 native FK model: `fieldSemanticType` `type/FK` → `type/Category` | KILLED | FK case fails, PK case passes (correctly scoped) |
| M5 | 41464: drop the response delay | **SURVIVED** | see below |
| M6 | 45452: viewport 1280×3000 so the sidebar stops overflowing | KILLED | `expect(scrolls).toBe(true)` |
| M7 | 41612: `display: "line"` → `"table"` | KILLED | the switch-to-data click (the toggle is absent without a chart) |
| M8 | 36027: restrict base query to < 2027 | KILLED | **mid/tail** — the x-axis year labels |
| M9 | 47940: coercion `UNIXMicroSeconds` → `UNIXSeconds` | **SURVIVED** | see below |
| M10 | 12679: post-aggregation filter `> 100` → `> 10` | KILLED | **tail** — "Showing 175 rows", the last assertion |
| M11 | 12586: `route.abort()` → `route.fallback()` | KILLED | "We're experiencing server issues" |
| M12 | 50038: drop the join from the joined question | KILLED | the join-step source button |

### M9 was a bad mutation, not a vacuous assertion — proved

`ORDERS.PRODUCT_ID` values are 1–200. Coerced as micro**seconds** or as **seconds** both
land inside the same displayed minute at the epoch, so the rendered
`"December 31, 1969, 4:00 PM"` is *identical* under both — the mutation is a no-op in
effect (failure mode #2, "it shrank both sides"). Follow-up **M9b — drop the coercion
entirely — KILLED at exactly the tail assertion** (`visualization-root` toContainText).
The assertion is load-bearing.

**Caveat worth flagging for CI:** `"December 31, 1969, 4:00 PM"` implies a report timezone
of UTC-8. This is one of the data-derived assertions that can differ between the local jar
and CI's merge build; same class as the `36027` year labels (`January 2026…2029`) and the
`12679` row count (175).

### M5 was a bad mutation too — the delay is not the only source of the loading state

Dropping the artificial delay left the test green because the real query still has latency
and `toBeVisible` retries, so the loading indicator is still caught. The mutation did not
remove the condition.

I then asked "vacuous, or bad mutation?" the prescribed way — **assert presence under the
same conditions**:

- M5b/M5c (empty result set) were **contaminated**: changing the filter value also changes
  the filter-pill text, so they died at the pill assertion and said nothing about the tail.
- M5d (empty result set + pill text moved with the input + no delay) **survived**, and the
  reason is instructive: the test *removes* the filter, so the post-click result set is
  always the full Orders table. `"No results"` can never be the end state of this test by
  construction — the assertion is a **momentary-absence** check (the regression was the
  empty state flashing under the loader), which PORTING explicitly names as the one
  legitimate one-shot case, and upstream gives it a 500ms window.
- **Locator-viability probe:** on a query that genuinely returns zero rows,
  `queryBuilderMain().getByText("No results", { exact: true })` resolves to exactly 1
  element. So the absence check is not a dead locator.

Conclusion: **not vacuous, and not port drift** — a correctly-scoped momentary-absence
assertion whose precondition my mutation failed to remove. Recorded rather than "fixed".

## Environment-dependent assertion — `issue 45452`, third check (platform, not app)

`expect(offsetWidth > clientWidth)` on `sidebar-content` asks whether a **classic**
scrollbar reserves layout width. Measured on this machine with a bare 100px
`overflow: auto` probe div: `offsetWidth === clientWidth === 100`, i.e. macOS Chromium
uses **overlay** scrollbars and *nothing* ever reserves gutter. Not fixable from the
spec: `--disable-features=OverlayScrollbar` changes nothing (re-measured), and the macOS
overlay style comes from `NSScroller preferredScrollerStyle`, not a Chromium flag.

Consequences, stated plainly:

- The Cypress original would fail identically on this machine — this is a **platform**
  property, not an app behaviour, not a harness difference, and **not** grounds for a
  product-bug claim.
- On overlay-scrollbar platforms the two `expectNoScrollbarContainer` calls are
  **vacuous upstream as well**: their second conjunct (`offsetWidth > clientWidth`) can
  never hold, so the whole predicate is constant-false. That is an upstream property, not
  something the port introduced.

Ported as: the two `expectNoScrollbarContainer` checks and `expect(scrolls).toBe(true)`
always run; the gutter assertion runs behind an **in-page** probe of whether this browser
reserves gutter at all (probed in the browser, not off `process.platform`), with the
reasoning inline. Nothing is silently weakened — on CI's Linux Chromium the probe is true
and the assertion runs exactly as upstream. M6 confirms the `scrolls` half has teeth.

## Deliberate deviations (all documented inline in the spec)

- **`issue 41464` throttle.** Cypress throttles `/api/dataset` to 50 kbps. Playwright has
  no bandwidth throttle for a route, so the equivalent condition (response still pending
  while the assertions run) is produced by holding the response back a fixed 5s.
- **`cy.wait("@alias")` awaited N-at-a-time after several actions** (`44974`'s two
  `@getCollectionItems`, `45359`'s font counts). `waitForResponse` only sees the future,
  so those use a small `responseCounter` in the spec-local module that starts listening
  where the Cypress `cy.intercept` was registered — matching cy.wait's "consumes past
  responses" semantics rather than approximating them.
- **`enterCustomColumnDetails({ format: true })`** has no shared equivalent, and upstream's
  order is load-bearing (type → blur → **format** → name). Reproduced in the spec-local
  helper on top of the shared `enterCustomColumnDetails` + `formatExpression`.
- **`should("not.be.visible")`** (`issue 12586`) is ported as `expectCypressHidden`:
  Playwright's `toBeHidden` passes on a *detached* element and ignores `opacity`, Cypress
  requires existence and treats `opacity: 0` on the element or any ancestor as hidden.

## Not verified

- No Cypress cross-check was run (standing rule — `H.restore()` would re-point database 1
  at the shared H2 file and break sibling slots). Every claim above rests on the jar plus
  in-browser measurement, not on harness agreement.
- CI behaviour of the `45452` gutter assertion is *inferred* from Linux Chromium using
  classic scrollbars; it has not been observed green.
- The three data-derived assertions (`36027` year labels, `47940` epoch date, `12679` row
  count) are green against the local 2026-07-18 jar only.
