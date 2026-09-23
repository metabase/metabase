# native-filters-reproductions

Port of `e2e/test/scenarios/native-filters/native-filters-reproductions.cy.spec.js`
(933 lines) → `e2e-playwright/tests/native-filters-reproductions.spec.ts`.

Verified on the local CI uberjar, slot 1 / :4101. Jar confirmed, not assumed:
`GET /api/session/properties` → `version.hash = 751c2a9`, `target/uberjar/COMMIT-ID`
= `751c2a98`, and `ps` shows `-jar …/target/uberjar/metabase.jar` for the
`MB_JETTY_PORT=4101` process. (`PW_KEEP_SLOT_BACKENDS=1` printed `(reused)`, which
is exactly the case where `JAR_PATH` is silently ignored — hence the check.)

## Collision checks

Both clean.

1. **Source directory** — `e2e/test/scenarios/native-filters/` contains exactly one
   `native-filters-reproductions.*` file (`.cy.spec.js`). There is **no** disjoint
   `.ts` sibling of that basename (unlike `visualizations-charts-reproductions`).
   The other files there — `native-filters-remapping.cy.spec.ts`,
   `sql-field-filter{,-types}.cy.spec.js`, `sql-filters{,-reset-clear,-source}.cy.spec.*`
   — are separate specs. Nothing matching under `e2e/test-component/`.
2. **Target** — `tests/native-filters-reproductions.spec.ts` did not exist. The
   landed `native-reproductions.spec.ts`, `filters-reproductions.spec.ts`,
   `dashboard-filters-reproductions-{1,2}.spec.ts` and `sql-filters*.spec.ts`
   port different sources and share **no issue numbers** with this file.

## Support-module name

`support/native-filters-reproductions.ts` — **the default `support/<target-name>.ts`.
No deviation.** No shared support module was edited.

## Infra tier: NONE (n/a for container evidence)

Every test runs against the built-in H2 sample database. No QA container, no
writable DB, no `WRITABLE_DB_ID`, no maildev/snowplow/mongo. The spec was read
rather than trusting tags — and the one tag present is wrong:

> **`describe("issue 31606", { tags: "@external" })` needs no external DB.** It
> drives `SELECT * FROM PRODUCTS WHERE CATEGORY = {{test}}` on the sample DB
> throughout. The tag is a leftover: commit `4701e5f8dc5` removed this file's
> `WRITABLE_DB_ID` import (deleting the tests that used it) without updating the
> surviving describe's tag. Ported **ungated**, and it runs green on the bare jar.
> Reflexively mapping `@external → test.skip(!PW_QA_DB_ENABLED)` would have
> produced a FINDINGS-#49-shaped "green run that never executed" for a test that
> has no container dependency at all.

## Executed vs skipped, with the gate-OFF control

| | tests | result |
|---|---|---|
| Gate ON (`PW_QA_DB_ENABLED=1`) | 20 | **19 passed, 1 skipped** |
| Gate OFF (control, no `PW_QA_DB_ENABLED`) | 20 | **19 passed, 1 skipped** |
| Gate ON, `--repeat-each=2` | 40 | **38 passed, 2 skipped** |

Identical both ways, as it must be for a tier-none spec — the control's value here
is precisely that it shows **nothing in this file is gated**, so there is no hidden
skip masquerading as a pass. The single skip is issue 13961, which is
`{ tags: "@skip" }` upstream (excluded from every CI run) and is ported as a
declared `test.skip`, following the sql-filters `#19454` precedent.

No `@OSS` describes in this file, so no OSS-gate probe was applicable.

## Fixmes

**None.** All 19 runnable tests pass, twice each.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` — clean.

## Mutation testing

18 mutants. Every one inverted an **input**, never an expectation, and the *line
where each died* was checked so tail assertions were not left unproven — several
follow-up mutants exist for exactly that reason (M12b, M17b, M21, M20, M6c, M19).

### Killed (15)

| # | Test | Mutation | Died at |
|---|---|---|---|
| M1 | 9357 | remove the drag | 1st order assertion |
| M21 | 9357 | drag 100px instead of 50 (two slots) | **2nd (tail)** assertion — 1st still passed |
| M12 | 11480 | default value `"some text"` → `"10"` | assertion #1 (URL) — bad aim, superseded |
| M12b | 11480 | query `… where total = {{x}}` → `select {{x}}` (URL untouched) | **"Data conversion error" (tail)** |
| M13 | 11580 | query `{{foo}} {{bar}}` → `{{bar}} {{foo}}` | 1st order assertion |
| M9 | 12581 | fixture query gains `ORDER BY ID DESC` | **`37.65` (post-revert tail)** — proves every assertion before it ran |
| M3 | 14302 | open the editor + type a space (dirty the question) | the `Save` absence check |
| M4 | 15163 | dashboard URL `?category=Gizmo` → `?category=Doohickey` | **cell-data `51` (tail)** |
| M2 | 15700 | map the field filter to `Price` instead of `Category` | `setWidgetType("String is not")` |
| M14 | 15981-1 | widget value `Gizmo` → `Doohickey` | `Rustic Paper Wallet` |
| M17b | 16739 (admin arm) | saved question → unrun ad-hoc editor, anchored on the editor painting | the `play` absence check |
| M20 | 16756 | query gains `or 1=1` | **`No results` (last assertion)** |
| M5 | 27257 | clear the widget value before the reload | **`findByDisplayValue("0")` after reload (tail)** |
| M6a | 31606 | skip `removeFieldValuesValue` before "Update filter" | the "Update filter" click (button inert with the value still set) |
| M6c | 31606 | re-enter an ID right after the final removal | **the very last assertion (`close` icon absent)** |
| M19 | 49577 | never switch to "Dropdown list" | **`Search the list` placeholder (dropdown-branch tail)** |
| M10 | 34129 | pick `Yesterday` instead of `Today` | **the final `Today` assertion — pure tail** |
| M16 | 70311 | saved question → unrun ad-hoc native question | the `play` absence check |

### Survivors, and what they mean

Three survivors. Each was resolved by the sanctioned "assert **presence** under
the same mutation" probe rather than being written off.

#### 1. **`H.NativeEditor.get().should("not.exist")` in issue 15163 is VACUOUS — upstream too**

M15b removed `signIn("nodata")` so the test runs as a **full-permission admin**,
the exact state the assertion is supposed to exclude. It stayed green.

Direct measurement on the jar at that point in the flow:

| user | `.cm-content` | `visibility-toggler` | "Open editor" |
|---|---|---|---|
| `nodata` (as upstream) | **0** | 0 | 0 |
| admin (mutated) | **0** | **1** | **1** |

A **saved** question always renders with the native editor *collapsed*, so
`[data-testid=native-query-editor] .cm-content` is absent for everybody — the
assertion cannot fail for any permission level. Upstream's `NativeEditor.get()`
(`e2e-codemirror-helpers.ts:13`) is byte-identically the same selector, so this is
**upstream vacuity, not port drift**. The discriminating signal that *does* exist
is `visibility-toggler` (1 vs 0).

**Not strengthened**, deliberately: the assertion guards a *permissions* surface,
and the hard rule allows strengthening only when no security surface is involved.
Ported verbatim with the analysis inline. I did add upstream's own
`loading-indicator` gate (part of `get()`, which the port had dropped) so the
absence check at least carries the anchor the original had.

**Recommended follow-up (upstream):** assert the absence of `visibility-toggler`,
which is what "cannot open the SQL editor without SQL permissions" actually means.

#### 2. **`describe("issue 31606") › "should not start drag and drop from clicks on popovers"` is STRUCTURALLY VACUOUS — upstream too**

M11 drove the test's own PointerEvents at the **first parameter widget** — a
target that provably reorders (issue 9357 does exactly that, and M1 killed it).
It did not reorder either. So the drag is *inert*, not *refused*.

Mechanism, confirmed in source: `ParametersList` builds its sensors with
`useDndSensors` (`frontend/src/metabase/common/hooks/use-dnd-sensors.ts`), which
registers **`MouseSensor` + `TouchSensor` only — no `PointerSensor`**. Upstream's
`moveDnDKitElementByAlias(alias, { horizontal: 300 })` omits `useMouseEvents`, so
it dispatches `pointerdown`/`pointermove`/`pointerup`, which this list never
listens for. "The widgets did not reorder" is therefore guaranteed by
construction, independent of the popover-click fix the test is named after.
(That is also why issue 9357, in the *same file*, has to pass `useMouseEvents: true`.)

M11b then re-ran **this** drag with MouseEvents: the app **still** refuses to
reorder. So the behaviour under test is real — the test as written simply cannot
observe it.

Ported verbatim with the analysis inline; Cypress uses the identical event
constructors, so this is upstream vacuity.

**Recommended follow-up (upstream):** add `useMouseEvents: true` to that call. It
passes today (measured), so the change is safe and converts a no-op into a real guard.

#### 3. **11580's tail — not triggered by any failure mode I could induce**

`assertVariablesOrder()` is called twice: before and after the type change. M13
kills the first call. The second call is the *same code*, and a state where the
order is correct before the type change and wrong after **is precisely the
regression #11580 fixed** — I could not induce it without reintroducing the bug.
Recording this as "no inducible failure mode", not as "structurally vacuous": the
assertion is sound and would catch a real regression.

### One bad mutation, called out

M17 (16739) initially survived. It was **my mutation that was wrong, not the
test**: swapping `visitQuestion` for a bare `startNewNativeQuestion` removed the
response-await, so the absence check ran pre-paint and passed in **628ms**. Re-run
as M17b with an explicit `expect(nativeEditor).toBeVisible()` anchor, it **failed**
in 10.8s on the admin arm. Textbox case of PORTING's "absence assertions are
vacuous inside a mount-lag window — the fix is an ANCHOR". The `nodata` arm of
M17b still survived, also a bad mutation: `nodata` cannot drive an ad-hoc native
question, so no run overlay exists for it either. Both arms of the real test use
the identical assertion, which M16/M17b prove is matchable.

## Measurements worth keeping

### `page.clock.setFixedTime()` DOES apply to an already-loaded page

PORTING's clock notes are all about `page.clock.install()` (which the docs say to
call before navigating, and which does **not** freeze time). Issue 16756 needs
`cy.clock(new Date("2026-10-31"), ["Date"])` — Date faked, timers untouched —
applied **mid-test**, long after the question has loaded.

`await page.clock.setFixedTime(new Date("2026-10-31"))` is the exact equivalent
and **works without a preceding `install()` and without a navigation**: probed by
asserting the date picker's header, which read **"October 2026"** (real host date
at the time: 2026-07-20). No `install()`, no reload. Worth knowing — the existing
notes would lead you to assume this is impossible and reach for a reload or a
`test.fixme`.

### `@cardQuery` in this file comes from the *factory*, not the spec

Two describes (12581, 13961) `cy.wait("@cardQuery")` without ever declaring the
alias, which reads like an upstream bug. It is not:
`H.createNativeQuestion(…, { visitQuestion: true })` routes through `question()` in
`e2e/support/helpers/api/createQuestion.ts`, whose `interceptAlias` **defaults to
the literal string `"cardQuery"`** (line 139) and which registers
`cy.intercept("POST", "/api/card/**/:id/query")` before visiting (line 182).
Note it is *not* `visitQuestion`'s alias — that one is `cardQuery${id}`
(`e2e-misc-helpers.js:122`), a different string. Any port that sees a bare
`@cardQuery` next to a `visitQuestion: true` factory call should look here rather
than assuming drift.

### `should("contain", x)` vs `should("contain.text", x)` on a multi-element subject

PORTING records that `contain.text` on a multi-element subject **concatenates**.
The bare `contain` used in issue 15163 (`cy.get("[data-testid=cell-data]").should("contain","51")`)
is a **different chai-jquery path**: it overwrites the chainable `contain` to
`$el.is(":contains('51')")`, and jQuery `.is()` is true when *any* element matches.
So bare `contain` is the **any-of** case (same family as rule 3's
`be.visible`/`be.disabled`), while `contain.text` is the concatenation case. Porting
either as the other silently changes the assertion's strength — in opposite
directions.

## Fidelity notes worth flagging in the port

- **`describe("issue 17490")` upstream declares a `beforeEach` and no `it`.** It
  mocks `/api/database?include=tables` with 7 fake tables for a test that no longer
  exists. Dead code; nothing to port. Recorded in the spec header rather than
  silently dropped.
- **Two describes are both titled `"issue 31606"`.** Playwright only rejects
  duplicate *full* titles and the two test names differ, so both titles are kept
  verbatim (no suffixing needed).
- **The placeholder trap fired twice**, both compensated:
  - Issue 27257's `cy.findByPlaceholderText("Number").type("0").blur()` — native
    parameter widgets drop their `placeholder` on focus, so the placeholder locator
    cannot be re-resolved for the `.blur()`. The port asserts the placeholder
    exists, then holds the widget's input directly.
  - `FieldFilter.addDefaultStringFilter` → `enterDefaultValue` does the same thing
    against a **MultiAutocomplete**, which drops its placeholder once a pill
    commits. The helper blurs `input:focus` instead — which also sidesteps the
    "submitting a form while a MultiAutocomplete holds focus is silently swallowed"
    trap on the "Add filter" click that follows.
- **One anchor added, flagged:** issue 14302's only assertion is
  `expect(getByText("Save")).toHaveCount(0)`, and `visitQuestion` resolves on the
  query *response*, not the paint. An `expect(filterWidget().first()).toBeVisible()`
  anchor was added ahead of it (the widget renders from the loaded card's template
  tags, so it only exists in the loaded state). Mutation M3 confirms the absence
  check is load-bearing with the anchor in place.
- `openTypePickerFromSelectedFilterType("Number")` **discards its argument**
  (e2e-sql-filter-helpers.js:15) — it is the same "click the type select" call as
  `openTypePickerFromDefaultFilterType`. Ported as the latter, noted inline.
  (Read-the-helper-signature family: #25, #53.)
- `H.moveDnDKitElementByAlias` maps to **two different** shared helpers depending
  on `useMouseEvents`: `true` → MouseSensor → `moveDnDKitElementSynthetic`
  (issue 9357); default → PointerSensor → `moveDnDKitPointer` (issue 31606-second).
  They are not interchangeable — see survivor #2 above for what happens when the
  event type doesn't match the sensor.
- `cy.location("search").should("eq", …)` is a **retried** assertion in Cypress →
  `expect.poll`, never a one-shot `page.url()` read (`expectLocationSearch`).

## Three-line summary

Ported all 20 upstream tests 1:1; 19 run green on the CI uberjar (38/38 under
`--repeat-each=2`, tsc clean, gate-OFF control identical), the 20th being upstream's
own `@skip`. Infra tier is **none** — and the file's lone `@external` tag is stale,
so gating on it would have skipped a test that needs no container.
18 mutants, 15 killed with follow-ups aimed at tails; the three survivors resolved
to **two genuinely vacuous upstream assertions** (15163's collapsed-editor check,
which measures 0 for admin too; and 31606's pointer-event drag against a
MouseSensor-only list) plus one tail with no inducible failure mode — all ported
verbatim with the analysis inline, since a strengthened permissions assertion is
not mine to write.
