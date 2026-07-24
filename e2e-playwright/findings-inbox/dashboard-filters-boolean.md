# dashboard-filters-boolean

Source: `e2e/test/scenarios/dashboard-filters/dashboard-filters-boolean.cy.spec.ts` (434 lines, 9 tests)
Port: `e2e-playwright/tests/dashboard-filters-boolean.spec.ts`
Support module: **`support/dashboard-filters-boolean.ts`** — matches the briefed name exactly.

## Collision checks

- `grep -rl "dashboard-filters-boolean"` across the whole package: the **only** hit
  before my work was `QUEUE.md`. No port of this source existed, committed or
  uncommitted.
- `ls tests/ support/`: no `dashboard-filters-boolean.spec.ts`, no
  `support/dashboard-filters-boolean.ts`.
- The many landed `dashboard-filters-*` ports were read, not collided with. Nothing
  in `support/dashboard-filters-matrix.ts` or the 11 matrix pages mentions `boolean`,
  so this spec is not covered there either.
- No shared support module was edited. New helpers live only in
  `support/dashboard-filters-boolean.ts`.

## Infra tier, per describe — with the gate-OFF control

All three describes share ONE upstream `beforeEach`, so the tier is uniform:
`H.restore("postgres-writable")` + `H.resetTestTable({type:"postgres", table:"many_data_types"})`
+ `H.resyncDatabase`. Gated on `PW_QA_DB_ENABLED`.

**The `@external` tag is CORRECT** — probed, not read: the beforeEach genuinely
writes to and syncs the writable postgres container.

| describe | tests | actually reads `many_data_types`? |
|---|---|---|
| mbql queries | 5 | **No** — H2 SAMPLE `PRODUCTS` |
| native queries with field filters | 3 | **Yes** (WRITABLE_DB_ID) |
| native queries with variables | 1 | **No** — H2 SAMPLE `products` |

**WRITABLE_DB_ID red-herring check**: the constant is the literal `2`, but every
describe restores the `postgres-writable` snapshot, under which database 2 genuinely
IS the writable container. It is used only by
`createNativeQuestionWithFieldFilterAndDashboard`. Not a red herring here.

**Gate-OFF control** (`PW_QA_DB_ENABLED` unset, everything else identical):
**0 executed, 9 skipped.** Gate-ON: **9 executed, 0 skipped.**

**Audit note (recorded, not acted on):** 6 of the 9 tests would run fine on the
`default` snapshot with no container at all — same class of finding as `custom-viz`
in PORTING.md. Not split, because the beforeEach is shared upstream and splitting it
would change test identity. Worth ~6 cases to a future consolidation pass.

---

## 🔴 HEADLINE: a boolean filter whose two states are indistinguishable by the assertion

`testParameterWidget()` — the helper that carries the parameter-widget coverage for
3 of the 9 tests — asserts **nothing but the dashcard row count**. Its call sites:

| test | all | true | false | distinguishable? |
|---|---|---|---|---|
| mbql | `200 rows` | `1 row` | `199 rows` | yes |
| **native field filter** | `2 rows` | **`1 row`** | **`1 row`** | **NO — same string** |
| native variable | `200 rows` | `53 rows` | `54 rows` | yes |

For the native-field-filter test the expected `true` and `false` texts are *the same
string*. The assertion cannot tell the two filter values apart, by construction.

**Confirmed against the container**, not inferred:

```
$ docker exec metabase-e2e-postgres-sample-1 psql -U metabase -d writable_db \
    -tAc "select id, boolean from many_data_types order by id;"
1|t
2|f
```

`many_data_types` holds exactly one `true` row and one `false` row, so
`where {{boolean}}` returns 1 row either way. This is **sample data**, not a vacuous
assertion — and I proved which, rather than guessing (see mutation A below).

Kept **verbatim** with the analysis inline in both the spec and the helper docstring.
Not strengthened: the intent is unambiguous (it is a faithful row-count check) but
strengthening it would change what upstream tests.

## Mutation testing

Six mutants across four rounds. Every mutant inverts an **input**, never an
expectation. Two were bad and are called out.

### A — flip the applied filter value: `False` → `True` in `testParameterWidget`

The briefed probe. Assertions untouched.

| test | result | died where |
|---|---|---|
| mbql drill-thru | **KILLED** | `falseRowCountText` — the **4th** row-count check (tail, not #1) |
| native variable | **KILLED** | same tail assertion (`54 rows` not found) |
| native field filter | **SURVIVED** | — |

**Vacuous, or same-data?** Answered by asserting **presence** under the same mutation
(the PORTING.md `embedding-hub` method): I added a temporary
`expect(card.getByText("false", {exact:true}).first()).toBeVisible()` immediately
after the surviving assertion. Under mutation it **FAILED** — the card really was
showing `true` data. So the interaction fires correctly and only the *count* is
blind. **Same-data, not vacuity.** Temporary probe removed.

### B — click a `false` cell instead of a `true` cell (7 call sites)

| test | result | died where |
|---|---|---|
| 2 Update dashboard filter | KILLED | `filterWidget → "True"` (assertion #1 of the block) |
| 3 dest: Saved question (mbql) | KILLED | `qb-filters-panel → "Boolean is true"` (#1) |
| 4 dest: Dashboard, column | KILLED | `filterWidget → "True"` — **after** the `dashboardHeader` assertion passed, so it is the *value*, not the navigation, that is proven |
| 5 dest: Dashboard, parameter | ⚠️ **BAD MUTATION** | died at a `.click()`, not an assertion |
| 7 dest: Saved question (native FF) | KILLED | `filterWidget → "True"` — **`assertTableRowsCount(1)` passed first** (1 row either way) |
| 8 dest: URL | KILLED | `filterWidget → "True"` — again `assertTableRowsCount(1)` passed first |
| 1, 6, 9 | not mutated (no cell click) | — |

**My bad mutation, test 5:** that test applies the dashboard-2 filter *before*
clicking, which filters the card to the single `true` row — so no `false` cell exists
and the mutation broke the setup instead of the assertion. Redone as C1.

Tests 7 and 8 are the second and third independent corroborations of the headline:
their row-count assertion sails through a flipped boolean and only the widget
assertion catches it.

### C1 — test 5, the correct inversion (parameter set to False, then click)

**KILLED** at `filterWidget → "True"`, with the `dashboardHeader` assertion passing
first. Tail proven. Note this deliberately changes the parameter rather than clearing
it — Metabase persists `last_used_param_values` server-side, so removing it is not a
reliable inversion.

### C2 — test 2 tail, first attempt: second click on a `false` cell

⚠️ **BAD MUTATION** — died at the `.click()`. Same cause as B/test 5: after the first
click the card holds only the `true` row.

### C3 — test 2 tail, correct: drop the toggle-off click

**KILLED** at `expect(filterWidget → "True").toHaveCount(0)`. The absence assertion is
load-bearing, *not* mount-lag-vacuous — the widget genuinely holds "True" at that
point and has to be cleared for it to pass.

Still unproven: test 2's final `200 rows`. C3 dies one assertion earlier and I could
not construct an input inversion that reaches it without also tripping C3's
assertion. Recorded as **unproven**, not as vacuous.

### C4 — MBQL fixture: `["=", ID, 1]` → `["<", ID, 3]` (1 true row → 2)

Corrupts something the target assertion does not reference. Test 3 **KILLED** at
`assertTableRowsCount(page, 1)` — `Received: "2"` — with the filters-panel assertion
passing first. Test 3's tail proven. Test 7 (native, different fixture) correctly
unaffected and green: the mutation is scoped, not a shared-constant move.

### D — test 6 drill-thru: apply `False` before drilling

**KILLED** at the final `filterWidget → "True"`, and `assertQueryBuilderRowCount(page, 1)`
**passed** under the flipped value. Fourth corroboration of the headline.

### Mutation coverage summary

Mutants died at assertion #1 in only 2 of 8 cases; the rest died at tails (4th
row-count check, post-navigation value checks, `toHaveCount(0)`, `assertTableRowsCount`,
final widget check). One assertion — test 2's closing `200 rows` — remains unproven by
any inversion I could induce.

## Pinned values flagged for CI drift (jar is 2026-07-18; CI builds a merge with master)

- `200 rows` / `1 row` / `199 rows` (SAMPLE `PRODUCTS`, expression `[ID] = 1`)
- `2 rows` / `1 row` / `1 row` (`many_data_types`, rebuilt per test — stable)
- `200 rows` / `53 rows` / `54 rows` (SAMPLE `products`, Gadget=53, Widget=54)
- `assertQueryBuilderRowCount(page, 53)`

All derive from the H2 sample database or a per-test rebuilt table, so drift risk is
low — but they are pinned counts and would move if sample data changed.

## Port decisions worth recording

- **`http://localhost:4000/...` → `mb.baseUrl`.** Upstream's URL click-behavior test
  hard-codes port 4000. Ported literally it would leave the slot backend entirely.
- **`cy.type(url, { parseSpecialCharSequences: false })` → `fill()`.** No analogue
  needed: `fill()` never interprets `{{ }}`.
- **Row-count locator.** These are the data-grid `Footer`'s `rowsCount` span
  (`frontend/src/metabase/data-grid/components/Footer/Footer.tsx`), whose textContent
  is exactly `"N rows"` — *not* the QB footer's `"Showing N rows"`. So Playwright
  `exact: true` is safe here; the testing-library/Playwright exact-match divergence
  does not bite. Verified in source before writing the locator.
- **`BooleanWidget` defaults its picker to `"true"`**
  (`BooleanWidget.tsx` `getPickerValue`'s `.otherwise(() => "true")`) — which is why
  upstream's first `Add filter` with no radio click applies True. Documented in the
  helper so the flow does not read as an accident.
- **One deliberate addition, declared:** `createAndMapParameter` ends with
  `expect(getByTestId("dashboard-parameter-sidebar")).toHaveCount(0)`. This is a
  *sequencing anchor* for the PORTING.md "anchor `saveDashboard()` on the change it
  saves" gotcha, not a new assertion — Playwright fires Done and Save back-to-back.
  Called out in the docstring.
- **Upstream describe title is `"scenarios > dashboard > filters > number"`** — a
  copy-paste misnomer; the spec is entirely about boolean filters. Kept verbatim so
  test identity matches upstream.

## Verification

- Backend verified **by identity**, not by `JAR_PATH`: `ps` on PID 60090 →
  `java -jar .../target/uberjar/metabase.jar`; `/api/session/properties` →
  `version.hash 751c2a9` == `target/uberjar/COMMIT-ID 751c2a98`. (The runner printed
  `(reused)`, exactly the case the brief warns about.)
- Run 1: **9/9 passed** (30.5s). No run-1 failures — no placeholder traps hit.
- `--repeat-each=2`: **18/18 passed**, twice (before and after mutation testing).
- Gate-OFF control: 0 executed / 9 skipped.
- `bunx tsc --noEmit`: clean for both my files. (The run does report 3 errors in
  `tests/transforms-permissions.spec.ts` — a sibling agent's in-progress file that
  appeared mid-session; it was absent from my earlier clean full-tsc run. Not mine,
  not touched.)
- Dead imports checked **by hand** (tsc does not catch them): every import in both
  files is used.
- No debug code, no bare `waitForTimeout`.
- Upstream Cypress spec **restored byte-identical**: md5 `e65534289d79a18901a27fc2eb48fb1a`,
  unchanged from the start of the session. `git status e2e/` clean.
- Own artifacts cleaned (`test-results-dfb`, scratchpad backups). Siblings' left alone.

## What I did NOT do

- **No Cypress cross-check** (standing rule — it would break live sibling slots). I
  therefore **cannot** say whether upstream also exhibits anything here, and I am not
  implying I checked. Nothing in this port required one: nothing failed.
- Nothing was `test.fixme`d; no product-bug claim is made. The headline finding is a
  *test-design* observation about upstream's assertion strength, verified against the
  database, not a claim about the app.

## Summary

Nine tests ported clean — 9/9 on run 1, 18/18 under `--repeat-each=2`, tsc clean, and
the `@external` gate independently probed (9 executed ON / 9 skipped OFF).

The headline is an upstream assertion-strength finding, kept verbatim: on the
native-field-filter path `true` and `false` both return exactly 1 row of
`many_data_types`, so `testParameterWidget`'s row-count assertion is provably unable
to distinguish the two filter values — confirmed by a surviving mutant, then resolved
as same-data rather than vacuity by a presence probe that went red under the same
mutation, and corroborated three more times (tests 7, 8, D).

Six mutants across four rounds; six killed, one survived-and-explained, and **two of
my own mutations were bad** (tests 5 and 2 died at a `.click()` because the prior
filter had already removed the cell I meant to click) — both redone correctly. One
assertion, test 2's closing `200 rows`, is recorded as unproven rather than claimed
either way.
