# actions-reproductions

Port of `e2e/test/scenarios/actions/actions-reproductions.cy.spec.js` (535 lines)
→ `tests/actions-reproductions.spec.ts` + `support/actions-reproductions.ts`.
Slot 5 (:4105), jar mode, `COMMIT-ID 751c2a98`.

## Collision checks

- `grep -rl "actions-reproductions" tests/ support/` → **no hits**.
- `ls tests/` → no existing `actions-reproductions.spec.ts`.
- `ls e2e/test/scenarios/actions/` → four files, **all `.cy.spec.js`**; no
  `.ts` sibling of this basename. `e2e/test-component/` holds only
  `scenarios/`, nothing of this basename. **Ported file:
  `actions-reproductions.cy.spec.js`.**
- Support module is `support/actions-reproductions.ts` — matches the target
  basename, **no deviation**.

## Infra tier — the tags are wrong in BOTH directions on this one file

| describe | upstream tag | snapshot | touches shared writable container? |
|---|---|---|---|
| `metabase#31587` (×3 viewports) | none | `default` | no |
| `Issue 32974` | `["@external","@actions"]` | `postgres-writable` | **yes — writes** |
| `issue 51020 > when primary key is called 'id'` | **NONE** | `postgres-writable` | **yes — DDL** |
| `issue 51020 > when primary key is not called 'id'` | `@external` | `postgres-writable` | **yes — DDL** |
| `issue 32840` | none | `default` | no |
| `issue 32750` | none | `default` | no |

**Finding: `issue 51020 > "when primary key is called 'id'"` is MISSING its
`@external` tag upstream** while its immediate sibling describe — same
`H.restore("postgres-writable")`, same `H.queryWritableDB` CREATE/DROP of
`public.foo`, same `H.resyncDatabase(WRITABLE_DB_ID)` — carries it. Under
`grepTags="-@external"` that describe would be *selected* and then fail for
want of a container. Ported gated regardless: a tag cannot make a container
appear.

Corollary for the brief's "tags mislead four ways": this file is a
**missing-tag** case, not a stale or over-broad one. The `@external` describes
here are all genuinely external — confirmed by the control below, not assumed.

## Executed vs gate-skipped (with the control)

Both runs on the same slot-5 jar backend, same file, one variable
(`PW_QA_DB_ENABLED`):

| run | result |
|---|---|
| `PW_QA_DB_ENABLED=1` | **11 passed, 0 skipped** |
| gate OFF (var unset) | **8 passed, 3 skipped** |

The gate **discriminates**: the 3 QA-DB tests execute only with the container
available, and the other 8 are real sample-DB coverage that runs either way.
So this is not a "green run that never executed" (FINDINGS #49) — and equally,
the green under the closed gate is only "correctly skipped" for those 3.

The gate-OFF run also confirms the **guarded `afterEach`** is required and
correct: `issue 51020`'s teardown calls `dropTemporaryTable()`, which would
have hit a knex connection with the gate off. Guarding it on the same condition
as the `beforeEach` gate yields `3 skipped` rather than the `N failed` that
PORTING warns about.

## Backend identity (verified, not assumed)

`PW_KEEP_SLOT_BACKENDS=1` silently ignores `JAR_PATH` on a reused backend, so
verified by identity rather than env var:

- `lsof -iTCP:4105` → PID 60090, `ps` → `java -jar …/target/uberjar/metabase.jar`
- `GET /api/session/properties` → `version.hash = 751c2a9`
- `target/uberjar/COMMIT-ID` = `751c2a98` ✅

## Shared writable container — state created and restored

Container inventory before starting (`writable_db` on :5404): **29 debris
schemas** (`Schema A`…`Schema Z`, `Domestic`, `Wild`) plus `public` with
`composite_pk_table`, `many_data_types`, `no_pk_table`, `products`,
`scoreboard_actions`. **No foreign schema was dropped** (siblings live, #85).

State this port creates:

- `public.scoreboard_actions` — dropped + rebuilt by `resetTestTable` in
  `Issue 32974`'s `beforeEach` (the same table `model-actions` and
  `actions-on-dashboards` rebuild). The action under test sets row 1's
  `score` to 999; the next `resetTestTable` wipes it. Self-restoring.
- `public.foo` — created and dropped by `issue 51020` (upstream's own
  `beforeEach`/`afterEach` pair, both ported).

Post-run verification: the container's table list is byte-identical to the
pre-run inventory (35 tables, no `foo`, no new schema), and a second
consecutive full run was green — see "Stability" below.

### #85 mitigation applied (a deliberate, documented narrowing)

`H.getTable` and `H.getTableId` match on table **name alone** upstream. With 29
debris schemas in a shared container that is exactly the unpinned-lookup hazard
#85 describes, so both lookups here **pin `schema: "public"`**
(`support/actions-reproductions.ts getTable`, and the `getTableId` call in
`issue 51020`). This only ever *narrows* the match to the table the test itself
created — it cannot make a failing assertion pass. Recorded as a deviation.

Note also that this port does **not** copy the unpinned `getTableId` pattern in
`support/actions-on-dashboards.ts` that the brief flagged.

### The `resyncDatabase` stale-row hole does NOT apply here — checked, not assumed

PORTING warns that `resyncDatabase` with `tables` can still be satisfied
instantly by a stale `initial_sync_status: "complete"` row from the snapshot.
Checked directly: `grep -c "scoreboard_actions" e2e/snapshots/postgres_writable.sql`
→ **0**, and there is no `foo` row either. Both waits are therefore genuine —
the app DB starts with no row for either table, so the poll cannot short-circuit.
(Upstream's `{ tableName: X }` and our `{ tables: [X] }` are the same thing:
`waitForSyncToFinish` treats the two branches identically.)

## Port notes worth keeping

- **Three never-awaited intercepts dropped** in `Issue 32974`
  (`getModelActions`, `executeAction`, `prefetchValues`) — its single test
  contains no `cy.wait` at all. The awaited ones (`dataset`, `createCard`,
  `getCard` in 51020; `executeAction` in 32840) are ported as
  `waitForResponse` registered before the trigger.
- **Duplicate negative dashcard ids avoided.** Upstream mixes
  `H.getNextUnsavedDashboardCardId()` (model card) with
  `H.getActionCardDetails()` (action card); in our support modules those are
  *independent* counters that both mint `-1` first → `PUT /api/dashboard` 400
  "ids must be unique". Assigned `-1`/`-2` explicitly.
- **`cy.type()` on a pre-filled input appends at the end.** The 51020 tests do
  `findByLabelText("Name").type(" Baz")` against a field pre-filled with
  "Foo" and expect "Foo Baz". Playwright's `click()` drops the caret wherever
  the pointer landed and `fill()` replaces the value, so both diverge. Ported
  as `appendToInput` = click + assert focused + `press("End")` +
  `pressSequentially`.
- **`H.createQuestion(..., { visitQuestion: true })` routes MODELS to
  `visitModel`** — `/model/:id` runs `POST /api/dataset`, never
  `/api/card/:id/query`. Anchored on `/api/dataset` accordingly.
- **`setupBasicActionsInModel` needed a gate upstream doesn't have.** Upstream
  clicks "Create basic actions" and moves straight on; the three
  `POST /api/action` calls are async and the very next step (the dashboard
  flow) picks "Update" out of the action list. Cypress's command queue supplied
  the gap. Reused `createBasicActions` from `support/model-actions.ts`, which
  already models `cy.wait(["@createAction" ×3])` as a response **counter**.
- `should("contain.text", …)` here has a **single-element** subject
  (`H.getDashboardCard(0)`), so the concatenation-vs-any-of trap does not bite;
  `toContainText` is faithful.

## Data-derived assertions (the class that differs local jar vs CI)

`issue 32840` pins two sample-DB timestamps: `"July 19, 2026, 7:44 PM"` and
`"2026-07-19T19:44:56"`. These are **not** now-relative despite looking it —
they were bumped wholesale by `c16ec07edc5 "Update the Sample Database by
shifting CREATED_AT by three years"` (2026-04-17), i.e. they track a checked-in
artifact. The local jar (2026-07-18) is after that commit and matches. Flagged
in the spec header as the assertions to watch if CI's merge jar ever carries a
re-generated sample DB.

## Stability

- Run 1: **11/11 green**, no fixes needed (unusually clean for a
  `-reproductions` file).
- `--repeat-each=3`, whole file in order: **33/33 green**. No order-dependence
  surfaced across three sequential full-file passes — worth noting given the
  brief's warning that `-reproductions` files are the usual home of terminal
  bad state.
- Final post-mutation confirmation run on the restored spec: **11/11 green**.

## Mutation testing

Every mutation inverts an **input**; no assertion was ever edited. The spec was
restored **byte-identical** afterwards (`md5` match against a pre-mutation copy,
`diff` empty) and re-run green.

| # | target | mutation (input only) | result | died at |
|---|---|---|---|---|
| M1 | Issue 32974 | `SET SCORE = 999` → `SET SCORE = SCORE` (**neuter the write**) | **killed** | assertion 1 — the 999 read-back |
| M2 | Issue 32974 tail | rename only the **action** (`"Query action"` → `"Renamed action"`), leaving the dashcard `"button.label"` intact | **killed** | assertion 3 — the undo toast |
| M3 | 31587 (edit) | inject `min-height: 400px` on `action-button-full-container` — reproduces the overflow the issue exists to catch | **killed** | the scrollHeight compare |
| M4 | 32840 | open a different row's detail modal (`cell-data` nth 8 → nth 0) | **killed** | assertion 1 — the displayed Created At |
| M5 | 51020 ×2 | drive the click behaviour from row **2** (Bar) instead of row 1 (Foo) | **killed** | assertion 1 — `toContainText("Foo Baz")` |
| M6a | 51020 tail | reload **without** the query string | **SURVIVED — bad mutation, see below** | — |
| M6a-v2 | 51020 tail | reload with `?id=2` instead of `?id=1` | **killed** | the tail — `toContainText("Foo Baz Baz")` |
| M6b | 32750 | never call `startNewAction` | **killed** | assertion 1 — `action-creator` absent |
| M6c | 31587 (sidebar) ×3 | same overflow injection as M3 | **killed** (all 3 viewports) | the scrollHeight compare |

### The headline: neutering the write kills it (M1)

`UPDATE scoreboard_actions SET SCORE = SCORE` leaves every UI interaction
identical — the button clicks, the modal, the toast all still happen — and the
test goes red on the dashcard read-back (`999` resolved to 0 elements for the
full 10s). This is an action test that genuinely verifies the write, not one
that merely exercises the UI.

### Where the mutants died, and what that left unproven

M1, M4 and M5 all died at their test's **first** assertion, so the tails needed
their own mutants — M2 (32974 toast), M6a-v2 (51020 URL half) and M6c (31587's
second test) were written specifically for that and all killed.

**One assertion remains not-independently-killed and I am recording it as such
rather than claiming it is vacuous:** 32974's middle assertion
`expect(modal(page)).toHaveCount(0)`. It was *reached and satisfied* under M2
(which got past it to die at the toast), so it is not sampling a never-rendered
state — but every input mutation that would keep the modal open also breaks the
999 read-back, which fires first. **Not triggered by any failure mode I could
induce.**

### M3's probe: the scrollHeight comparison genuinely discriminates

Worth recording because equality-of-two-measurements assertions are a known
vacuity family (cf. the `deep.eq` on DOMRects tautology). Measured both values
before and after the injection:

```
before (button, card) = 40, 40      after = 400, 40
```

The card's `scrollHeight` does **not** follow the button's, so this is not a
PORTING "both sides moved together" artifact — the assertion can distinguish
overflow from no-overflow.

### 🔴 A bad mutation of my own (M6a) — and the mechanism, verified

M6a replaced 51020's `cy.reload()` with a `goto` of the bare pathname, intending
to remove the URL-supplied primary key. **Both tests still passed.** That reads
exactly like "the URL half of this test asserts nothing".

It does not. The mutation **re-supplied the very context it removed through a
different channel**: Metabase persists the last-used dashboard parameter values
server-side and re-applies them on a fresh visit — `last_used_param_values`,
hydrated onto the dashboard in
`src/metabase/users/models/user_parameter_value.clj:90` and gated by the
`dashboards-save-last-used-parameters` setting
(`src/metabase/dashboards_rest/api.clj:136`). So the bare URL still arrived with
`id=1` applied, and the test was right to pass.

Re-aimed as M6a-v2 (`?id=2` rather than no param), the same tail assertion died
immediately. **The URL half is load-bearing; my first mutation was wrong.**
Flagging the shape because it is a cheap way to manufacture a false vacuity
claim on any dashboard-parameter port: *removing* a parameter is not a reliable
inversion when the app remembers it — *change* it instead.

## Fixmes

**None.** 11/11 execute and pass; nothing was `test.fixme`d, dropped, weakened
or merged.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` → **clean, zero errors** (the 3
transient `data-model-shared-3.spec.ts` errors mentioned in the brief were
already gone by the time I ran it). No debug code, no `waitForTimeout`, no dead
imports left behind.
