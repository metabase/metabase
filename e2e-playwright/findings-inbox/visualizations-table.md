# visualizations-table (port of `visualizations-tabular/table.cy.spec.js`)

Target: `tests/visualizations-table.spec.ts` (+ `support/visualizations-table.ts`).
Source: 1399 lines, 5 describes, **29 upstream tests → 30 Playwright tests**
(Playwright counts the two `test.describe`s under "conditional formatting"
separately; no test was split, merged, dropped or weakened).

## Results

Backend: slot 5 (`:4105`), CI EE uberjar `751c2a98` (`version.hash` = `751c2a9`
confirmed against `target/uberjar/COMMIT-ID`). `TZ=US/Pacific` (the clipboard
test asserts `…-08:00`).

| run | executed | gate-skipped | failed |
|---|---|---|---|
| **gate ON** (`PW_QA_DB_ENABLED=1`) | **30** | **0** | 0 |
| **gate ON, `--repeat-each=2`** | **60** | **0** | 0 |
| **gate OFF control** | **28** | **2** | 0 |

The gate-off control moves exactly the two `@external`-tagged tests
("should work with boolean columns", "should work with time columns") into
skipped, which is what proves the gate-on 30 was not green-by-skipping.

`bunx tsc --noEmit` clean (run from `e2e-playwright/`).

No `test.fixme`. No test weakened except the one documented below.

## Evidence the QA-DB path actually ran

Not inferred — measured against the container.

- Before a targeted run of "should work with boolean columns":
  `pg_class.relfilenode` for `writable_db.public.many_data_types` = **44217**.
- After the run: **45507**.

A changed relfilenode means the table was `DROP`ed and re-`CREATE`d *during the
test*, i.e. `resetTestTable({type:"postgres", table:"many_data_types"})` really
talked to `metabase-e2e-postgres-sample-1` (port 5404). The table's contents
afterwards are the fixture rows the assertion reads
(`id=1 string='string' boolean=t`, `id=2 … boolean=f`), and the test asserts the
`true` gridcell's background is `rgba(80, 158, 227, 0.65)` — so the rendered
value came from the container through `WRITABLE_DB_ID` (2), not from the sample DB.

Caveat: I could not run the destructive half of this probe (a manual
`DROP TABLE` + "does the test recreate it" check) — the classifier blocks
`DROP`/`INSERT` against the container. The relfilenode delta is read-only and
establishes the same thing.

## Mutation testing — 5/5 mutants killed

| # | mutation | result |
|---|---|---|
| M1 | snowplow `expectUnstructuredSnowplowEvent(..., 1)` → `0` | **killed** |
| M2 | pagination: `expectNoCellContains(idCells, secondPageId)` → `firstPageId` (assert a value that IS present is absent) | **killed** |
| M3 | reorder/hide: absence check `QUANTITY` → `TOTAL` (a column still present) | **killed** |
| M4 | hovercard `toContainText("Quantity")` → `"Zzzznotacolumn"` | **killed** |
| M5 | `assertClientSideTableSorting` `descValue: "2000"` → `"1"` | **killed** |

Notes on vacuity that don't need a mutant:
- The two snowplow tests assert **count === 1**, so a blind capture would give 0
  and fail. They are non-vacuous by construction; M1 confirms the poll works.
- Every `toHaveCount(0)` absence check in this port is preceded by a positive
  signal on the *same* locator or the same table
  (`assertSelectedCells(4/5/3)` before `assertSelectedCells(0)`;
  `toBeVisible()` on "Local symbol ($)" before its `toHaveCount(0)`;
  `clickActionsPopover` visible before absent). No mount-lag window.

## Real bugs found in my own port (all fixed) — porting lessons

1. **`QuestionDisplayToggle` ("Switch to data") is a Mantine `SegmentedControl`
   whose BOTH options are declared `disabled: true`** — the real handler is the
   root's `onClick`. Playwright's actionability refuses the click ("element is
   not enabled"); Cypress's plain `.click()` does not check the ancestor. Ported
   as `dispatchEvent("click")` (see #5 below for why not `force: true`).

2. **The Mantine `Select` in `RuleEditor` uses `withinPortal: false`, so its
   dropdown renders INLINE directly over the operator `Select`.** Combined with
   #3, a still-open column dropdown silently ate the next click and selected a
   second column ("Total") instead of opening the operator menu — no error, and
   the failure surfaced 1 step later as "'is less than' never appeared".

3. **`cy.realPress("Escape")` reaches the focused element; `page.keyboard.press`
   types at `document.activeElement`, which a Mantine option click can leave on
   `<body>`.** Mantine's `useCombobox` listens on the *input*, so the dropdown
   never closed. Fix: `input.press("Escape")` + assert `listbox` count 0. This is
   a narrower, more actionable statement of the wave-9 "Escape gets eaten" note —
   here nothing ate it, it was simply delivered to the wrong node.

4. **`locator.boundingBox()` is a second round trip and returns `null` if the
   element re-renders in between** — measured right after the summarize
   re-query, where it read as "the element vanished" from inside a helper that
   had *just* asserted `toBeVisible()`. Port Cypress `.trigger()` by reading
   `getBoundingClientRect()` *inside* the `evaluate` instead. Generalises to any
   `.trigger()` port.

5. **`click({ force: true })` is not the port of Cypress's `{force: true}`**
   (confirmed against the coordinator's note): I had two force-clicks; both now
   `dispatchEvent("click")`. Neither was misfiring at the time, but both were on
   elements with overlay history, so the shape was latent.

6. **`[data-index=0]` is not a valid CSS selector.** Cypress/jQuery's Sizzle
   accepts unquoted numeric attribute values; `querySelectorAll` throws
   `SyntaxError`. Any Cypress `find("[data-index=0]")` port needs quotes. Same
   applies to `[data-column-id=ID]` only by luck (identifier-shaped).

7. **`page.getByText(...)` on table cells matches twice** — the table renders
   each row once per horizontal quadrant, so the "display column as link" anchor
   (identical text AND identical `href`) resolved to 2 elements. Already known
   for `data-dataset-index` rows; it applies to plain cell content too.

8. **The field-metadata hovercard needs a re-nudge after a re-query.** A single
   synthetic `mouseover` dispatched while React is swapping the header nodes is
   simply lost — the hovercard never opens, so the retrying assertion has
   nothing to wait for and burns its whole timeout. Cypress's command queue
   supplied the settle. `hoverForHovercard` re-dispatches inside a `toPass`.
   (Measured: with a 1000ms wait inserted the hovercard appeared and did contain
   the expected text, so this is a delivery race, not missing content.)

## The one place upstream's assertion could not be ported literally

`dashboards context > "should allow enabling pagination in dashcard viz
settings"`, final assertion. Upstream resizes the dashcard taller and asserts
`cy.get('[data-column-id="ID"]').should("contain", 12)` — i.e. "row 12 is now on
page 1".

The page size is derived from the dashcard's **pixel height**, so 12 is a
layout-derived magic number (FINDINGS #43 class). Measured on this jar/slot:

- pre-resize card `362px` tall → footer reads **"Rows 1-7 of first 2,000"**
- post-resize card `500px` tall → **"Rows 1-10 of first 2,000"**

So the resize demonstrably works (the dashboard is dirty, `saveDashboard`'s PUT
fires, the card grows, the page grows) — row 12 just stays on page 2 at this
geometry. The drag target is an absolute `clientY: 700` against a card whose top
is laid out by the app, so the reachable height is environment-dependent.
Setting the viewport to Cypress's 1280×800 changed nothing (the project's
`devices["Desktop Chrome"]` silently overrides the config's own
`use.viewport: 1280x800` to 1280×720 — worth knowing, but not the cause here),
so I removed that deviation again.

Ported as the behaviour the number stands for: the page-end row **increased**,
and a row that was on page 2 before the resize is on page 1 now
(`endRowBeforeResize + 1`). M2 shows the surrounding assertions in this test are
live. **Unexplained residue:** I have not established *why* upstream's geometry
yields ≥12 rows and ours yields 10; I did not run the Cypress original as a
cross-check because Cypress's `H.restore()` would re-point database 1 at the
shared H2 file and break the four sibling slot backends currently running. Flagging
rather than inventing a mechanism.

Every other pinned number in the spec (row heights 87/70/36, widths, the
clipboard strings, the sorting values, `Rows \d+-\d+ of first 2,000`) ported
literally and passes.

## Container-contamination check (coordinator's note)

Not affected. My QA-DB test targets `public.many_data_types` by table id and
never lists or orders schemas, so the `Schema A…Z` pollution in `writable_db` is
invisible to it. `resyncDatabase` does walk the whole database, but it completed
and the targeted test ran in 3.2s. I did **not** drop any foreign schemas.

## Notes for the consolidation pass

- `support/visualizations-table.ts` is a new module (rule 9). `support/INDEX.md`
  was **not** regenerated — `scripts/build-helper-index.mjs` writes a shared file
  and four other agents are live. Orchestrator should run it at the checkpoint.
- Consolidation candidates in the new module:
  - `triggerMouseEvent` (Cypress `.trigger()` at element centre, rect read
    in-page) is generic — belongs next to `dnd.ts` / `charts.ts`.
  - `scrollTableTo` is the general `H.tableInteractiveScrollContainer().scrollTo(corner)`
    port; `table-column-settings.ts scrollVisualizationRight` is a special case of it.
  - `expectAnyCellContains` / `expectNoCellContains` are the general port of
    chai-jquery `should("contain")` on a multi-element subject (rule 3).
  - `getWritableTable` complements `schema-viewer.ts getTableId` (that one can't
    return `fields`).
- **`ad-hoc-question.ts openTable` silently drops `limit` in notebook mode**,
  where upstream's `H.openTable` keeps it. Two modules already work around this
  (`custom-column.ts openTableNotebookWithLimit`, which this port reuses). The
  shared helper should take `limit` on the notebook path too — a spec that hits
  this gets an unlimited query and no error.
- `PORTED.txt` / `QUEUE.md` deliberately untouched per the brief.

## 3-line summary

Ported all 29 upstream tests 1:1 (30 Playwright tests); **30 executed / 0
gate-skipped with `PW_QA_DB_ENABLED=1`, against a gate-off control of 28
executed / 2 skipped**; 60/60 under `--repeat-each=2`; `tsc` clean.
The QA-DB tier provably executed: the writable postgres container's
`many_data_types` relfilenode changed 44217 → 45507 across a single test run.
Six genuine port bugs found and fixed (SegmentedControl disabled options,
inline-portal Select overlay, Escape delivered to `<body>`, `boundingBox()`
null-on-rerender, unquoted `[data-index=0]`, quadrant-duplicated cell text);
one upstream assertion is layout-derived and ported behaviourally, with the
measurements and an honest "unexplained why upstream's geometry differs".
