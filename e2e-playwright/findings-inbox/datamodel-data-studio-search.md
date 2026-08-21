# datamodel-data-studio-search — slot 3 (port 4103)

Source: `e2e/test/scenarios/data-studio/data-model/datamodel-data-studio-search.cy.spec.ts` (212 lines, 8 tests)
Target: `e2e-playwright/tests/datamodel-data-studio-search.spec.ts`
Support: `e2e-playwright/support/datamodel-data-studio-search.ts` — **conventional name, no deviation.**

Jar verified BY IDENTITY, not `JAR_PATH`: `ps` shows the slot java process on the repo jar, and
`version.properties` inside it reads `hash=751c2a9` = COMMIT-ID `751c2a98`. ✅

## 🔴 HEADLINE: the port is PROVEN CORRECT and BLOCKED by #85

On the real shared container: **2 passed / 6 failed.**
Under a diagnostic shim that presents the writable DB as a *pristine* container: **8/8 passed, and 24/24 under `--repeat-each=3`.**

All six failures are count assertions, and every one of them is #85 container debris. This is
**not** port drift, and I did not stop at "looks like debris" — I ruled drift out three ways:

1. **Arithmetic.** Upstream expects `an` → 3 and `a` → 4. A pristine writable DB after the
   `multi_schema` fixture holds exactly `Domestic.Animals`, `Wild.Animals`, `Wild.Birds`. Then
   `an` = Analytic Events + 2 Animals = **3**; `a` = + Accounts = **4**. Upstream's numbers fall
   out exactly. The counts are right.
2. **Direct API read** against my slot: `GET /api/table?term=an` returns **31** rows (28 `Animals`),
   `term=a` returns **51**. The container holds `Schema A`…`Schema Z`.`Animals` — 26 extra copies
   left by the `many_schemas` fixture — plus `public.ip_addresses`, `public.scoreboard_actions`, etc.
3. **The shim.** Filtering that response down to the pristine set (nothing else changed) turns
   2/8 into 8/8.

Root cause, stated precisely: Cypress's `H.restore("postgres-writable")` *also* calls
`resetWritableDb` (`e2e/support/db_tasks.js:41`), which drops and recreates the writable DB. Our
`mb.restore("postgres-writable")` does not, and no port of it exists. So the faithful port of
`H.restore("postgres-writable")` **includes** the writable-DB reset — that is the owed #85 fix.
Per brief I did **not** make it (`support/data-model.ts` owed fix left alone) and did **not** drop
foreign schemas (`Schema A`–`Z` belong to the `many_schemas` fixture that live siblings use).

**Container inventory before == after: 41 schemas / 46 tables.** I added nothing and dropped nothing.

Also worth recording: the UI showed **9** rows where the API returned 51, because the results grid
is **virtualized**. So `getTables()` counts *rendered* rows, not matches — on a pristine container
the two coincide, which is why upstream never noticed.

## Collision checks

- `grep -rl "datamodel-data-studio-search" tests/ support/` → **no matches** before this port.
- `ls tests/ support/` — `datamodel-data-studio.{ts,spec.ts}`, `data-studio-single-table`,
  `data-studio-bulk-table`, `data-model-shared-1..4`, `data-studio-tables`, `data-studio-library`,
  `measures-data-studio`, `segments-data-studio` all read; all are ports of **different** sources.
  No port of my source existed. Nothing overwritten.
- Shared modules imported **read-only**: `data-model.ts`, `datamodel-data-studio.ts`,
  `admin-datamodel.ts`, `schema-viewer.ts`, `search-snowplow.ts`, `fixtures.ts`. I edited none of them.

## Every absence assertion and its positive anchor

| # | Absence assertion | Positive anchor |
|---|---|---|
| 1 | T2 `noTablesFound` visible after `irds` | `typeSearch` awaits `GET /api/table?term=irds` (exact-match predicate) before asserting |
| 2 | T4 `not.toHaveAttribute(aria-selected)` ×2 | both rows asserted `toBeVisible()` immediately before — the attribute is read off a *rendered* row |
| 3 | T5 heading `toHaveCount(0)` after uncheck | the unchecked box asserted `not.toBeChecked()` **and** the untouched sibling asserted `toBeChecked()` — settled selection state |
| 4 | T5 heading `toHaveCount(0)` after search change | `typeSearch(page,"c","ac")` awaits the `term=ac` response; picker asserted visible |
| 5 | T7 `getTable(x).toHaveCount(0)` ×2 after DB collapse | the Sample DB row's toggle asserted `aria-expanded="false"` — proves the tree rendered *and* collapsed |
| 6 | T7 `getTables().toHaveCount(0)` | upstream's own next line, reordered: `getDatabases()` `toHaveCount(2)` first, so "0 tables" means collapsed, not "tree gone" |
| 7 | T8 `getTables().toHaveCount(0)` pre-search | `getDatabases()` `toHaveCount(2)` first (empty query renders the plain `Tree`, not `SearchNew`) |
| 8 | T8 checked-boxes `toHaveCount(0)` after filter | `getTables()` asserted `not.toHaveCount(0)` — a populated grid whose boxes were cleared |
| 9 | T8 heading `toHaveCount(0)` at end | the bulk write `POST /api/data-studio/table/edit` awaited, then `noTablesFound` visible |

On the brief's warning that **"no results is exactly the pre-fetch shape"**: I checked the
mechanism rather than assuming it. In `SearchNew.tsx` the pre-fetch branch is
`if (isLoading) return <Loader/>`, so for a *fresh* term the empty state is not reachable pre-fetch.
It **is** reachable when RTK-Query already holds a cache entry for the term (`isLoading` false,
data immediate) — which test 2 walks straight into, since it searches `irds`, clears, and searches
`*irds`. So the warning applies, via the cache path rather than the first-paint path. Anchored anyway.

## Gate mapping + gate-OFF control

One top-level `describe("Search")`, no `afterEach` anywhere — so a describe-level skip is safe
(the "afterEach fails every test in a gate-off control" trap is **inapplicable**; I checked for it).

Upstream carries **no tag at all** on the describe or any test, yet the `beforeEach` restores
`postgres-writable`, writes the `multi_schema` fixture to the writable container and resyncs
`WRITABLE_DB_ID`. That is the brief's **"a live dependency with no tag"** case: the queue's
`@external`-equivalent gate is genuinely required and simply missing upstream. Gated on the
deliberate `PW_QA_DB_ENABLED` (never bare `QA_DB_ENABLED`).

**Two-way control:**
- Gate ON (`PW_QA_DB_ENABLED=1`): **8 executed** (2 passed, 6 failed on #85).
- Gate OFF (var unset): **8 skipped, 0 executed.** No teardown ran, nothing errored.

## Token: predicate, two arms, feature count

Upstream: `H.activateToken("pro-self-hosted")` in the `beforeEach`.

**Predicate traced:**
- FE — `hasPremiumFeature("library")` sets `PLUGIN_LIBRARY.isEnabled`
  (`enterprise/frontend/.../data-studio/library/index.ts:24`), which becomes the `isLibraryEnabled`
  prop on `SearchNew` / `TablePickerTreeTable`. Nothing this spec asserts reads it.
- BE — `/api/ee/data-studio` is `(premium-handler ... :library)`
  (`enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:117`). But the only write this
  spec makes is `POST /api/data-studio/table/edit`, the **OSS** route, which is not gated.

**Two-arm control:**
- **Without** the token: `token-features` all false (**0** true, `library: false`) →
  `POST /api/data-studio/table/edit` returns **200**. Full spec run without `activateToken`:
  **8/8 passed** (under the pristine shim).
- **With** the token: **42** features true, `library: true` → same endpoint **200**.

**Outcome: pure red herring.** The token gates nothing this spec exercises. Recorded, not removed —
faithfulness over cleverness. (I did not activate a *different* token, so nothing needed restoring
on that axis; the gate sits ahead of `activateToken`, at describe level, so no `beforeEach`-activates-
then-skips hazard.) **Slot ends at the expected 42 features, `library: true` — verified after the
final run.** No token values printed anywhere.

## Snowplow vantage

**Browser boundary (`installSnowplowCapture`), and here is why:** the asserted event
`data_studio_table_picker_search_performed` is emitted by `trackSimpleEvent` in
`frontend/src/metabase/common/data-studio/analytics.ts:51`, called from
`TablePicker/components/SearchNew.tsx:169`. It is a **frontend** event, so the per-slot collector
would never see it (the collector is blind to FE events — preflight omits
`Access-Control-Allow-Credentials`; shared fix **owed, not applied**). Backend-queue-offset hazards
are therefore **inapplicable** to this spec.

The `snowplow` tag is **live, not dead setup**: three real assertions depend on it (one in test 1,
two in test 2, the last with an explicit count of 2). `H.resetSnowplow()` → `capture.reset()`.

Firing semantics worth recording: the event fires on the **rising edge of `isFetchingTables`**
(`SearchNew.tsx:163-171`), i.e. once per issued fetch, and the query is debounced 500 ms
(`SEARCH_DEBOUNCE_DURATION`). That is what makes the exact count of 2 in test 2 correct rather than
flaky — both `pressSequentially` bursts land inside one debounce window each.

## Port drift found and fixed (3 real bugs, all measured not guessed)

1. **🔴 `pressSequentially` types at caret 0, `cy.type()` appends.** `type("c")` on a field holding
   `"a"` produced **`"ca"`**, not `"ac"` — read directly off the failure snapshot
   (`textbox "Search tables" [active]: ca`). The spec then searched the wrong term and the
   `term=ac` wait timed out. Fixed with `press("End")` before typing (no-op on an empty input, so
   every other call site is unaffected). Mutation M1 confirms this line is load-bearing.
2. **🔴 The shared `selectFilterOption` is unscoped; upstream's first call is inside
   `cy.findByTestId("table-picker-filter").within(...)`.** Measured: 2 matching "Visibility layer"
   textboxes → strict-mode violation. Added a locally-scoped `selectFilterOptionInForm` rather than
   editing the shared module (rule 9).
3. **🔴 Upstream's SECOND `selectFilterOption("Visibility layer","Final")` is not a filter at all.**
   Measured at that point: `table-picker-filter` count **0** (the popover closed itself —
   `FilterPopover`'s `onSubmit` calls `close()`), `table-section` count **0**, and exactly **1**
   "Visibility layer" textbox offering Hidden/Internal/Final. That control is the picker's
   **bulk-attribute editor** (`TableSection/components/TableAttributesEditBulk.tsx`), shown because
   two tables are selected. So upstream reuses a helper named `selectFilterOption` to perform a bulk
   metadata **write**, which drops the two tables out of the still-active "Internal" filter — hence
   the "No tables found" and cleared heading. Ported to the behaviour, with the note; not renamed.
   **I did not inherit a sibling's explanation here** — my first reading (that this hit the
   TableSection metadata editor) was *wrong*, and the diagnostic disproved it.

**Called out as my own bad guess:** I first anchored the bulk write on `PUT /api/table`
(`useUpdateTableListMutation`) and it timed out — that hook backs `BulkTableVisibilityToggle`, a
different control. Correct endpoint traced to `useEditTablesMutation` →
`POST /api/data-studio/table/edit` (`frontend/src/metabase/api/table.ts:218`). Guessing an endpoint
cost one run; the brief's "never guess" rule earned its keep.

## Declared deviations

- **Strengthening (declared):** the bulk write is awaited before the final two assertions. Upstream
  awaits nothing there. Without it both could be read off the pre-write render.
- `cy.get(<multi>).should("be.visible")` → `expectAllVisible` (count > 0, then every node visible).
  Cypress asserts all matched nodes; bare `toBeVisible()` would be a strict-mode violation and
  `.first()` would **weaken** it. `getTable("Animals")` really does match two rows — the fixture
  creates `Domestic.Animals` *and* `Wild.Animals`, so this is **ambiguous by construction**, not
  purely debris (the sibling's note in `data-studio-bulk-table.ts` is right on this).
- `selectedTablesHeading` keeps upstream's case-insensitive `/N tables selected/i` substring regex
  verbatim rather than tightening to `exact`. It is loose (would match "12 tables selected") but no
  count above 4 is reachable. **Weak-but-faithful, recorded not strengthened.**
- `beforeEach` ordering: upstream does `signInAsAdmin()` *then* `restore()`; restoring replaces the
  app DB and the session, so the sign-in is re-issued after the restore. Same terminal state.
- No test dropped, weakened or merged. 8 tests in, 8 tests out.

## `getByText` exactness

`noTablesFound` uses `{ exact: true }`. Checked both directions per the brief: the node is
`<Text>{t\`No tables found\`}</Text>` with no child elements, so Playwright's full-`textContent`
read and testing-library's direct-child-text read coincide — `exact: true` is the faithful port and
not a tightening. `exact: false` would additionally ignore case, which is *broader* than Cypress.

## tsc + dead-import audit

`bunx tsc --noEmit` → **clean, exit 0**. Since tsc is provably silent on dead imports, I hand-audited
both files programmatically (25 imported names in the spec, 6 in the support module): **zero dead
imports**. One dead import (`getFilterForm`) was found and removed this way.

## Mutation testing

**Verifier sanity-checked BEFORE use**, against the four failure modes the brief names. It aborts
*without writing* on 0 occurrences, on ambiguity (correctly reported 8 occurrences), and on a no-op;
a positive control confirmed it actually writes and then restores **byte-identical md5**
(`07a7b56f…` before and after). Restore is in a `finally`, so an exception cannot leave the tree
mutated. All 8 runs below reported "md5 restored OK".

Run against the shimmed spec — the only configuration where the assertions are live. Each mutation
**inverts an input** and each died in **exactly** the intended test (no mis-attribution):

| Mutation | Result | Died in |
|---|---|---|
| M1 drop `press("End")` (support) | **KILLED** | T5 clicking checkboxes |
| M2 `"*irds"` → `"irds"` | **KILLED** | T2 wildcard search |
| M3 drop `Shift` modifier | **KILLED** | T3 shift-select |
| M4 bulk layer `Final` → `Internal` | **KILLED** | T8 deselect-and-hide |
| M5 schema toggle `Domestic` → `Wild` | SURVIVED | — |
| M6 schema checkbox `Domestic` → `Wild` | SURVIVED | — |

**4 killed, 2 survived.** Both survivors share one mechanism, and I **probed the hypothesis rather
than asserting it**: under term `a`/`an`, Domestic contributes exactly one matching table
(`Animals`) and Wild contributes exactly one (`Animals`; `Birds` doesn't match `a`), so the two
schemas are interchangeable for these counts.

Presence probes to separate "vacuous" from "the data cannot discriminate":
- **P1** T7 expected Animals `1` → `0`: **KILLED** → assertion is live.
- **P2** T6 expected heading `3` → `2`: **KILLED** → assertion is live.

So both survivors are **"the data cannot discriminate"**, not vacuous — a symmetry in upstream's own
fixture. Recorded, not strengthened. Runtimes were also checked as a tell: killed mutants ran
12–33 s (real assertion failures / waits), survivors 20 s — matching the clean baseline, i.e. no
silently-skipped work.

## Fixmes owed (NOT applied)

1. **🔴 #85 — the durable one.** `mb.restore("postgres-writable")` must also reset the writable
   container, mirroring Cypress's `resetWritableDb`. Until then **this spec cannot pass**, and it is
   the sharpest reproduction of #85 in the suite so far (it needs *exact* table counts, so any
   single stray table breaks it). Deliberately not made per brief.
2. The Snowplow collector's blindness to FE events (missing `Access-Control-Allow-Credentials`) —
   shared fix owed, not applied. Did not bite here; I used the browser boundary.
3. The harness runs 1280×720 rather than the configured 800 — no layout-dependent failure observed
   here, so nothing attributed to it.

## Unexplained

Nothing. Every failure observed in this port was traced to a mechanism and confirmed by an
experiment; the six remaining failures are fully accounted for by #85.

## Summary (3 lines)

The port is faithful and **proven correct — 8/8, and 24/24 under `--repeat-each=3`, once the
writable container is presented pristine** — but it fails **2/8 on the real shared container**,
entirely because `mb.restore("postgres-writable")` does not reset the writable DB the way Cypress's
does (#85); the counts upstream asserts fall out exactly on a clean container.
Three genuine port bugs were found and fixed by measurement: `pressSequentially` types at caret 0
where `cy.type()` appends, the shared `selectFilterOption` is unscoped where upstream's `within()`
scopes it, and upstream's second "filter" call is really a **bulk metadata write** on a control that
merely shares a label.
Gate and token controls both ran two ways: gate OFF → 8 skipped / ON → 8 executed; token absent →
0 features and the endpoint still 200, so `pro-self-hosted` is a **pure red herring** here — slot
verified back at **42 features, `library: true`**, container inventory unchanged at 41 schemas / 46 tables.
