# viz-charts-reproductions (the `.cy.spec.**js**` twin) — slot 4

Source: `e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.js` (1209 lines)
Target: `e2e-playwright/tests/viz-charts-reproductions.spec.ts`
Helpers: `e2e-playwright/support/visualizations-charts-reproductions.ts`

> Filed under `viz-charts-reproductions.md`, **not** the briefed
> `visualizations-charts-reproductions.md` — that filename is already taken by the sibling `.ts` port's
> findings. Same collision as the spec itself; see below.

## 🔴 Did a port already exist? NO — but there IS a real filename collision

**Two upstream files share the basename**, with entirely disjoint issue sets:

| upstream | issues | status |
|---|---|---|
| `…-reproductions.cy.spec.**ts**` | 43075, 41133, 45255, 49874, … | ported earlier → `tests/visualizations-charts-reproductions.spec.ts` (+ `support/viz-charts-repros.ts`), PORTED.txt:85 |
| `…-reproductions.cy.spec.**js**` | 16170, 17524, 18061, … 63671 | **mine — not previously ported** |

The briefed target path (`tests/visualizations-charts-reproductions.spec.ts`) was **already taken by the
`.ts` port**, so writing there would have silently destroyed a landed spec. I used
`tests/viz-charts-reproductions.spec.ts` and documented the split in both file headers.

**PORTED.txt:85 is ambiguous** — it records the `.ts` path, which reads as covering both files. Worth
disambiguating when this lands, and worth a general note that this repo has at least one `.cy.spec.js` /
`.cy.spec.ts` basename pair.

## Infra tier — NOT a QA-database spec (classifier wrong again)

The `@mongo` tag is what the grep classifier flagged. Actual dependencies:

- **24 of 26 upstream tests need no container at all** — bare `default` snapshot, sample DB only.
- **`issue 16170` (2 tests)** is genuinely `@mongo`: `restore("mongo-5")` + queries database 2
  (`mongo-sample` container). Gated on `PW_QA_DB_ENABLED`, tagged `@mongo`.
- **`issue 49160` (2 tests)** needs an EE token (`pro-self-hosted`) — no container.
- **`issue 22527`** is `@skip` upstream; ported faithfully as `test.skip`.

No writable QA Postgres/MySQL, no maildev, no webhook-tester, no snowplow.

## Executed vs gate-skipped (jar `COMMIT-ID 751c2a98`, confirmed `version.hash 751c2a9`)

| run | result |
|---|---|
| gate ON, `--repeat-each=2` | **56 passed, 2 skipped** (1.8m) — the 2 skips are `issue 22527` ×2 |
| gate OFF (control, no `PW_QA_DB_ENABLED`) | **26 passed, 3 skipped** (37s) — 2 mongo + 1 upstream-`@skip` |

The control matters here: it proves the 26 non-mongo tests **really execute** with no container, i.e. this
spec is nearly free coverage. No `afterEach` teardown to mis-fire on the skipped arm.

`bunx tsc --noEmit`: clean for both new files. (`tests/transforms.spec.ts` reports 4 pre-existing errors —
a sibling agent's untracked file, not mine.)

## Fixmes

**None.** 29/29 ported, 0 `test.fixme`, 0 weakened assertions.

## Fixes needed while stabilizing (all port drift — classified)

1. **`aggregation-item`'s close icon is a DESCENDANT, not a sibling** *(new gotcha)*.
   Upstream `findAllByTestId("aggregation-item").contains(item).siblings(".Icon-close")` works because
   `cy.contains` descends to the deepest matching node — the inner `<span class=AggregationName>` — whose
   sibling *is* the icon (`AggregationItem.tsx`: both are children of the `aggregation-item` button).
   Relative to the button, the icon is a descendant, so a literal `siblings` port matches nothing.
   **Generalises: when porting `.contains(x).siblings(y)`, work out which node `contains` actually landed on.**

2. **`H.visitQuestionAdhoc(q, {mode:"notebook"})` registers NO waits** *(known: read the helper)*.
   `if (mode !== "notebook" && !skipWaiting)` — nothing runs until Visualize is clicked. My first port
   invented a `notebook-root` anchor, which does not exist (the notebook page's testids are
   `query-builder-root` / `step-data-0-0` / `mini-picker`). Cost 4 tests. The faithful port is a bare
   `goto`; `visualize()`'s own click actionability is the gate.

3. **`H.runNativeQuery({ wait: false })` on a SAVED question** *(known: saved-vs-adhoc endpoint)*.
   The shared `runNativeQuery()` waits on `POST /api/dataset`; a saved native question runs via
   `/api/card/:id/query`, so the wait can only time out. Upstream passes `{wait:false}` — port as a bare
   play click and let the following assertion gate.

4. **🔴 NEW GOTCHA — the chart-settings `Select` intermittently ignores its first click.**
   `ChartSettingSelect` (a Mantine `Select` portaled into `ChartSettingsWidgetPopover`'s `dropdownTarget`):
   measured **1/3 runs opened on the first click, 2/3 needed a second**. `aria-expanded` is `null` in *both*
   states, so there is no DOM signal to gate on beforehand. It can also close again *between* "dropdown is
   open" and the option click — so opening and picking must be retried **together** in one `toPass`.
   Cypress's command-queue latency covered the whole window.
   **Mechanism unconfirmed.** Most plausible: the widget popover is still settling and its dismiss handler
   swallows the freshly-opened dropdown. Recorded as unexplained rather than asserted.
   Also: **these options render as `role="option"` OUTSIDE `H.popover()`'s selector**, so a
   `popover().getByText(value)` port finds nothing even when the dropdown *is* open.

5. **ECharts tooltip after a chart re-render needs a re-nudge** *(extends the known settle rules)*.
   Changing the missing-values setting re-renders the line chart; a synthetic mousemove dispatched mid-settle
   resolves to the wrong data point (1 run in 6). Fixed by re-dispatching inside a `toPass` gated on the
   **discriminating** tooltip header — mutation M7 still dies there, so the retry tolerates the settle
   window without weakening anything.

## Mutation testing — 9 mutants, 9 killed, 0 survivors

Inputs inverted (fixtures/queries), expectations left alone, with **five aimed specifically at tails**
because the first pass showed several mutants dying at assertion #1.

| # | test | mutation (input) | died at | tail? |
|---|---|---|---|---|
| M1 | 63671 | breakout `year` → `month` | count 1 → 0 | — |
| M2 | 27279 | fixture SQL `'F2022', 4` → `7` | **2nd (tail) tooltip**, `value: "4"` row | ✅ |
| M3 | 20548 | added `CATEGORY = "Gizmo"` filter | 1st bar count, 4 → 1 | — |
| M4 | 18061-1 | typed `"4"` instead of `"2"` | **tail** "ID is less than 2" (earlier absence check passed) | ✅ |
| M7 | 16170 | hover `nth(0)` instead of `nth(-2)` | **tail** tooltip header, "2019" → "2015" | ✅ |
| M10 | 20548 | sidebar tail value `Count` → `CountXYZ` | **tail** sidebar assertion (locator discriminates on value) | ✅ |
| M11 | 18063 | fixture `'Copenhagen'` → `'Aarhus'` | **tail** `NAME` pair (LAT/LONG/COUNT pairs passed) | ✅ |
| M8 | 21452 | counter presence probe (`toBe(0)`) | **Received 1** — recorder really sees the single `/api/dataset` POST | ✅ |
| M9 | 43077 | repoint predicate at `/api/dataset` | **Received 1** — recorder + 100ms window really observe requests | ✅ |

M8/M9 are the "assert *presence* under the same mutation" technique, used because both are absence/count
assertions of exactly the shape PORTING flags as vacuity-prone. They prove the **observation seam works**;
they do **not** prove 43077's 100ms window is generous (that margin is upstream's own).

## Three upstream assertions that are weaker than they look

Ported **verbatim** with the analysis inline — not silently strengthened.

1. **`issue 20548` `assertOnLegendItemFrequency(item, frequency)`** —
   `cy.findAllByTestId("legend-item").contains(item).should("have.length", frequency)`.
   `cy.contains` is a first-match command yielding exactly ONE element, so `have.length` can only ever pass
   for `frequency === 1`. Both call sites pass 1. **It does not count duplicate legend items — which is
   precisely what metabase#20548 is about.** The real coverage for that issue is the
   `chartPathWithFillColor` count pair immediately above it (M3 confirms those are load-bearing).

2. **`issue 27279` x-axis tick check** — the subject is
   `H.echartsContainer().get("text").contains(/F2021|V2021|S2022|F2022/)`. `cy.get()` **resets the subject**,
   so the `echartsContainer` scope is dead code; `.contains()` then yields only the FIRST match. So
   `compareValuesInOrder`'s `.each` loop iterates over **exactly one element** and compares it to
   `xAxisTicks[0]`. The test names four ticks and asserts one. (Ordering *is* still covered by the
   legend-item loop above it, which is a genuine 4-element `.each`.)

3. **`issue 33208` `H.saveSavedQuestion("top category")`** — the helper takes **no parameters**
   (`e2e-misc-helpers.js:382`). The argument is silently discarded and the question is never renamed.
   Same family as #25/#53.

## Brief claims — reproduced / not

- ✅ **"`.trigger()` with coordinates → read the rect inside the `evaluate`"** — the shared
  `line-chart.triggerMousemove` already does this and was reusable unchanged across 3 call sites.
- ✅ **`hover({force:true})` for chart paths** — needed for 27279's two bar hovers.
- ⚠️ **"dense ECharts series defeat a real hover"** — not independently exercised here (all hovers are
  either `.trigger("mousemove")` → synthetic, or single-bar targets). Neither confirmed nor contradicted.
- ⚠️ **ECharts axis-text whitespace — the PORTING wording overreaches.** Playwright's `getByText`
  **normalizes whitespace even with `exact: true`**, so `getByText("2028", {exact:true})` matches `" 2028 "`
  fine (63671, verified green + killed by M1). The rule bites **regex** matching only, which is why
  `line-chart.echartsExactText` needs its `\s*` padding. Worth narrowing the PORTING bullet — as written it
  reads as if all exact matching is affected, which would send agents to regex helpers they don't need.

## Reuse

Wrote very little new code, as briefed. Reused read-only from `charts`, `charts-extras`, `line-chart`,
`viz-charts-repros`, `binning`, `notebook`, `joins`, `models`, `dashboard`, `ui`, `factories`,
`filters-repros`, `filter`, `documents-core`, `native-editor`, `visualizer-basics`, `permissions`.
The per-spec module holds only: the mongo gate reason, a `withDatabase` port that keeps the `<TABLE>_ID`
half (the shared `homepage.getDatabaseFields` drops it), the notebook-mode adhoc visit,
`testPairedTooltipValues`, this spec's `toggleFieldSelectElement` (placeholder-based, distinct from
`maps.ts`'s testid-based one), `cartesianChartCircles`, and `countResponses`.

**Consolidation candidates:**
- `countResponses` is the ~5th passive response counter in the tree
  (`question-reproductions-2.countResponses`, `filters-repros.trackResponses`,
  `filter-bulk.trackDatasetRequests`, …). One shared `support/response-counters.ts` stays faithful — Cypress
  has exactly one `cy.intercept`-alias idiom behind all of them.
- `cartesianChartCircles` + the widened `visitAdhoc`/`visitNativeAdhoc` wrappers are now duplicated in three
  modules (`viz-charts-repros`, `line-chart`, mine) — already flagged upstream, still open.
- Two `toggleFieldSelectElement`s now exist (`maps.ts` = testid-based, mine = placeholder-based). They target
  genuinely different widget states; if unified, take a mode argument rather than picking one.

## Summary (3 lines)

Ported 29 tests from the **`.js`** twin of an already-ported filename (the briefed target path would have
overwritten a landed spec); 56/56 green under `--repeat-each=2` on the jar, 26/29 executing with **no
container at all** — only the 2 mongo tests are gated — tsc clean, zero fixmes.
Nine input-inverted mutants all died, five of them at tail assertions, so the tails are load-bearing.
Three upstream assertions are weaker than they read (a legend-frequency check that cannot count, an x-axis
loop that checks one of four ticks, a discarded rename argument) — ported verbatim with the analysis inline.
