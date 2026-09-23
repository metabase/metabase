# joins-reproductions

Port of `e2e/test/scenarios/joins/joins-reproductions.cy.spec.js` (979 lines)
→ `e2e-playwright/tests/joins-reproductions.spec.ts` (+ `support/joins-reproductions.ts`).

## Collision checks

- **No `.js`/`.ts` twin.** The source directory holds exactly three specs:
  `joins.cy.spec.js`, `joins-custom-expressions.cy.spec.ts`,
  `joins-reproductions.cy.spec.js`. The basename `joins-reproductions` is unique
  — no disjoint sibling to overwrite.
- **No existing target.** `tests/` held `joins.spec.ts` and
  `joins-custom-expressions.spec.ts` (ports of the *other* two sources).
  `tests/joins-reproductions.spec.ts` did not exist.

## Infra tier: MIXED — and the tags are accurate here

Worked out describe by describe rather than trusted, per the brief's warning
that tags mislead in both directions. In this file they happen to be right:

| describe | snapshot | tier |
|---|---|---|
| 15342 (`@external`) | `mysql-8` | needs QA **MySQL** container |
| 42385 (`@external`) | `postgres-12` | needs QA **Postgres** container |
| all 9 others | `default` | **bare jar**, Sample Database only |

Nothing in this file touches `writable_db`. No `resyncDatabase`, no table
creation, no schema/table listing. **Container evidence: n/a** — the #85
shared-writable-container contamination hazard does not apply.

## Executed vs gate-skipped (both controls run, on the jar)

Jar confirmed before every run: `/api/session/properties` → `version.hash
751c2a9` = `target/uberjar/COMMIT-ID 751c2a98`.

- **Gate ON** (`PW_QA_DB_ENABLED=1`): **19 passed**, 0 skipped (39.1s).
- **Gate OFF** (control): **16 passed, 3 skipped** — exactly the three
  `@external` tests, cleanly. No `afterEach` fallout (the failure shape PORTING
  warns about, where a gate-off control reports failures instead of skips).
- The two runs together are the positive evidence that the 3 QA-DB tests
  genuinely **executed** under the gate rather than silently skipping — the
  FINDINGS #49 shape.
- **`--repeat-each=2`: 38/38 passed** (1.2m).
- `bunx tsc --noEmit`: **clean**.

### Runtime sanity check (I did not take the fast times on trust)

19 tests in 39s, ~1–2s each *including* a snapshot restore, looked like a
never-executed run. Measured directly: `POST /api/testing/restore/default`
returns **204 in ~0.08s** on this jar. The timings are real, not a skipped run.

## Fixmes

**None.** All 19 tests pass as faithful ports; nothing needed `test.fixme`.

## Port notes worth keeping

- **🔴 Duplicate `it` titles upstream.** `issue 46675` declares two `it`s with
  the byte-identical title *"should reset the draft join state when the source
  table changes (metabase#46675)"*. Cypress tolerates this; Playwright treats
  duplicate titles as a **hard load error** (the whole file fails to parse). The
  second is suffixed `— rhs table` / first `— source table`, taken from each
  test's own `cy.log`. This is the PORTING rule firing on a spec that hadn't
  been flagged for it.
- **`cy.wait("@dataset")` in two describes relies on an alias registered by a
  *helper*, not the beforeEach.** `issue 23293` and `issue 45300` both call
  `cy.wait("@dataset")` with no matching `cy.intercept` in their own
  `beforeEach` — the alias comes from inside `H.visitQuestionAdhoc`
  (`e2e-ad-hoc-question-helpers.js:141`), which registers *and consumes* one.
  So the in-test wait belongs to the *next* dataset request. Registered at that
  true trigger in the port (before the column edits / before "Apply filter"),
  not at the top.
- **Upstream dead code ported as dead code, flagged inline:** `issue 31769`
  wraps an assertion in `cy.get("@card_id_q2").then(cardId => …)` and never uses
  `cardId`; `issue 45300` sets `parameters: []` *inside* `dataset_query`, where
  it is inert (dropped — the harness's `dataset_query` type has no such key).
- **`assertTableHeader` deliberately kept PAGE-WIDE.** The shared
  `tableHeaderColumn` scopes to `table-header`, but `issue 27521`'s original is
  page-wide *and* positional (`.eq(index)`), so narrowing the set would shift
  the very indices the test is about. Documented at the helper.
- 11 never-awaited `cy.intercept` aliases dropped (listed in the spec header).

## Mutation testing — 16 mutants, 15 killed, 1 resolved as a bad mutation

Input-inverted, never expectation-inverted. Where each died was tracked, and
follow-ups were aimed at tails where mutants clustered at assertion #1.

| mutant | verdict | died at |
|---|---|---|
| M1 14793: metric `sum(Products.Price)` → `count` | **SURVIVED** → resolved, see below | — |
| M1b 14793: breakout `CREATED_AT/year` → `RATING` | KILLED | `toHaveCount(35)` — **the tail** |
| M1c 14793: X-ray click → Escape | KILLED | `waitForXray` (assertion #1) |
| M4 31769: extra breakout on Q2 | KILLED | `toHaveCount(4)` |
| M5 46675: skip rhs table change | KILLED | `toHaveText` |
| M6 23293: skip `Category` add | KILLED | `toContainText` |
| M6b 23293: keep `Product ID` | KILLED | `toContainText` |
| M6c 23293: add `Title` not `Category` | KILLED | `toContainText` |
| M7 27521: keep ID in join column picker | KILLED | `toHaveText` |
| M8 39448: join Reviews not Products | KILLED | `toHaveText` |
| M9 17968: skip summarize step | KILLED | click timeout |
| M10 45300: filter Gizmo not Doohickey | KILLED | `toHaveText` |
| M11 15342: third table Reviews not Products | KILLED | `toBeAttached` |
| M12 18502: Q2 breakout `BIRTH_DATE` → `CREATED_AT` | KILLED | click timeout |
| M13 27380: skip the zoom-in drill | KILLED | click timeout |
| M14 22859: leave Q2 a question, not a model | KILLED | `waitForResponse` timeout |

### The survivor, resolved: bad mutation, not vacuity

M1 changed 14793's aggregation from `sum(Products.Price)` to `count` and all
four assertions still passed — including `toHaveCount(35)`. The follow-up **M1b**
(changing the *breakout* instead) **killed the count assertion**. So the x-ray's
card set keys off the query's **dimensions**, not the metric function: M1 moved
something the output genuinely does not depend on. The assertions are sound.
This is PORTING's "it shrank both sides" family — the decisive test was finding
an input the output *does* track.

### An absence assertion probed and cleared (42385)

`H.getNotebookStep("join").should("not.exist")` is the kind of check the brief
warns is satisfied by "nothing has rendered yet".

- First mutation (switch to Sample Database → Reviews instead of QA Postgres12)
  **survived** — which looks exactly like vacuity.
- **Presence probe under the same flow settled it**: `getNotebookStep("join")`
  has **count 1** immediately before the switch and **0** after. The assertion
  observes a real state transition and is load-bearing.
- The survivor was therefore a *bad* mutation, and it taught something about the
  app: **any source-table change resets an incomplete draft join, not just a
  database change.** The upstream test title ("when query database changes") is
  narrower than the behaviour it actually exercises. Not a bug — recorded as a
  scope note.
- The probe was **reverted**; the port is verbatim. Both 42385 absence checks
  now sit behind anchors (upstream's own placeholder-visible assertion in test
  1; a discriminating `data-step-cell` text check in test 2).

### Honestly unproven

**`issue 23293`'s tail** — the last `header-cell` reading `Product → Category`
and the grid containing `Doohickey` / not `Gizmo` — is **not independently
mutation-provable here**. All three mutants aimed at it (M6, M6b, M6c) died at
the *first* tail assertion (`qb-filters-panel` contains the drill filter),
because every input I could perturb also changes that filter. The tail is
causally downstream of the same drill. Recording this as unproven rather than
inventing a mechanism or claiming vacuity.

### `27380`'s absence check — answered by cross-reference, not asserted

`cy.findByText("Pick a column to group by").should("not.exist")` guards against
the zoom-in dropping the breakout. It cannot fail in the happy path (a breakout
is set), so the question is PORTING's "can this locator ever match?" — **yes**:
`issue 17968` in this same file *clicks* that exact string in a summarize step
with no breakout. So it is a real guard, not a vacuous one. An anchor
(`getNotebookStep("summarize")` visible) was added ahead of it so the check
cannot pass on an unpainted notebook; the presence assertion that follows it
upstream is unchanged.

## Summary (3 lines)

Ported 19 tests across 11 describes with no fixmes: 19/19 green on the jar
gate-on, 16+3-skipped gate-off, 38/38 under `--repeat-each=2`, tsc clean.
Mixed infra tier — 2 `@external` describes genuinely need the QA MySQL/Postgres
containers and 9 run on the bare jar; tags were accurate this time, verified
per-describe. 16 mutants: 15 killed, the 1 survivor resolved as a bad mutation
via a follow-up that killed the same tail assertion; one absence check cleared
by a presence probe, one tail recorded as honestly unproven.
