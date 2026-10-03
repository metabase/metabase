# model-actions (slot 3 / :4103)

Source: `e2e/test/scenarios/actions/model-actions.cy.spec.js` (913 lines)
Target: `tests/model-actions.spec.ts`
Support: `support/model-actions.ts` — **matches the target basename, NO deviation.**

Jar confirmed: `ps` on pid 8885 → `java -jar target/uberjar/metabase.jar`;
`/api/session/properties` `version.hash = 751c2a9` == `target/uberjar/COMMIT-ID`
(`751c2a98`). Local jar dated 2026-07-18; CI builds a merge with master (#79),
so CI staleness caveat applies.

## Collision checks

1. `ls e2e/test/scenarios/actions/` → `actions-in-object-detail-view`,
   `actions-on-dashboards`, `actions-reproductions`, `model-actions` — no
   same-basename `.js`/`.ts` pair. `find e2e -name 'model-actions*'` returns
   exactly one file. `e2e/test-component/` contains only `scenarios/`, nothing
   matching.
2. `ls tests/` → no `model-actions.spec.ts`. `actions-on-dashboards.spec.ts`
   exists but ports a **different** source.
3. Support module name: `support/model-actions.ts`. No deviation to flag.

## Infra tier — this is a REAL QA-DB tier, and it EXECUTES

Determined by reading, not by tags. All 3 describes need the QA containers:

| describe | tags | needs |
|---|---|---|
| `scenarios > models > actions` (4 tests) | `@external`, `@actions` | `postgres-12` snapshot + QA Postgres (model over `orders`). Never *writes* — its sample action `UPDATE ORDERS SET TOTAL = TOTAL` is created but only ever executed in the read-only-permission test, which can't run it. |
| `Write actions … (postgres)` (7) | `@external` | `postgres-writable` + `resetTestTable`/`queryWritableDB` on `writable_db` |
| `Write actions … (mysql)` (7) | `@external` | `mysql-writable` + same on mysql |

**Contrary to the wave-11 note that fully `@external`+`@actions` specs are
all-skip in this setup** (recorded from `actions-on-dashboards`, 33/33 gated),
this spec runs **17 of 18** end to end against the live containers with
`PW_QA_DB_ENABLED=1`. The writable snapshots (`postgres_writable.sql`,
`mysql_writable.sql`) and `postgres_12.sql` are all present in `e2e/snapshots/`,
and `metabase-e2e-postgres-sample` (:5404) / `metabase-e2e-mysql-sample` (:3304)
host `writable_db`. The wave-11 claim should be narrowed to "that spec", not the
tier — it is worth re-checking whether `actions-on-dashboards` could also run.

**Executed vs skipped**

- Gate ON: **17 passed, 1 skipped** (49.4s). The single skip is
  `Write actions … (mysql) › should respect impersonated permission`, which is
  correct — upstream guards it with `cy.onlyOn(dialect === "postgres")`.
- `--repeat-each=2`: **34 passed, 2 skipped**, no flakes.
- Gate OFF control (no `PW_QA_DB_ENABLED`): **18 skipped, 0 failed.** There is
  no `afterEach`, so the "afterEach fails in a gate-off control" hazard does not
  apply here.
- `bunx tsc --noEmit`: clean.

## Token

`pro-self-hosted` probed directly on the slot backend: PUT 204, then
`token-features` shows **42 enabled**, `advanced_permissions: true` — which is
what both EE tests here need (`should respect permissions`,
`should respect impersonated permission`). Both pass, so the gate is real and
satisfied.

Confirms the brief's known gap: **`transforms-basic: false`**. No other
post-0.57 gap surfaced that touches this spec. (`transforms`, `transforms_basic`
and `actions` are simply absent keys — actions are not token-gated.)

## Fixes needed (classified per the feedback-loop rule)

### 1. 🔴 NEW GOTCHA — `USER_GROUPS` ids: guessing them produced a test that failed for the *right* reason but the *wrong* cause

I transcribed `USER_GROUPS` from memory as `COLLECTION_GROUP: 4, DATA_GROUP: 5`.
The real values (`e2e/support/cypress_data.js:42`) are **5 and 6**; **4 is
`MAGIC_USER_GROUPS.DATA_ANALYSTS_GROUP`**, a different group entirely.

Consequence, and why it is worth writing down: the impersonation test failed
with the modal simply *gone* and no error text — the run had **succeeded**
(`POST …/execute → 200 {"rows-affected":1}`). The upstream comment on that block
says exactly why ("By default, all groups get `unrestricted` access that will
override the impersonation"), so blocking the *wrong* group silently defeats the
entire subject of the test. It reads as "impersonation is broken in the app",
which is precisely the shape of claim that has been retracted four times.

The partial mirror in `support/click-behavior.ts` exports **only**
`COLLECTION_GROUP`, which is what tempted the guess. `support/model-actions.ts`
now carries the full transcription with the trap documented.
**Consolidation candidate: promote a complete `USER_GROUPS` (+ `MAGIC_USER_GROUPS`)
to a shared module** — several ports re-derive fragments of it.

### 2. 🔴 NEW GOTCHA — `cy.wait("@alias")` is a QUEUE that pops PAST responses; porting it as `waitForResponse` deadlocks on RTK-cached reads

Cost 2 tests × 30s on run 1, both fingerprinted inside the shared
`runActionFor` helper rather than at the cause.

`cy.intercept(...).as("getAction")` + `cy.wait("@getAction")` pops the next
**unconsumed** response, including ones that already arrived.
`page.waitForResponse` only sees the future. In
`should allow query action execution from the model details page`,
`openActionEditorFor` fires `GET /api/action/:id` and **nothing cy.waits on it**;
the later run-modal open is served from RTK-Query cache with **no request at
all**, and upstream's `cy.wait` inside `runActionFor` was being satisfied by that
earlier, still-queued response.

PORTING already has "waitForResponse on an RTK-Query-cached endpoint hangs → drop
the wait", but dropping it is wrong here: the *first* `runActionFor` in other
tests genuinely needs the gate. The faithful port is the queue itself —
`recordGetAction(page)` (installed in `beforeEach`) + `waitForGetAction(page)`
popping `responses[consumed++]`. This is a **reusable shape** for any port with a
`cy.wait("@x")` whose alias also fires outside the awaited step.

### 3. `input[value="…"]` is an ATTRIBUTE selector — it is not `findByDisplayValue`

React sets the `value` **property**; the attribute is often absent, so
`dialog.locator('input[value="Demo Action"]')` matched nothing. Fixed by using
the shared imperative scan (`filters-repros.findByDisplayValue`), **scoped to the
dialog** per the page-wide-scan flake rule. Known gotcha; I should have reached
for the helper first.

### 4. The spec's last DB read-back has no synchronization upstream — and mysql loses the race

`should allow query action execution …` ends `button.click()` →
`verifyScoreValue(22)` with nothing in between. Every *other* read-back in the
spec is preceded by a toast/"ran successfully" assertion that supplies the
settle; this one is not, so Cypress was relying on incidental command-queue +
`cy.task` latency. Measured: **postgres won the race, mysql read `score = 0`.**
Ported with `waitForResponse(isExecuteAction)` as the anchor (not a sleep),
documented inline. This is a synchronization strengthening, not an assertion
change.

## Mutation testing

Every mutation inverts an **input**, never an expectation. Kill sites recorded
because several tests have long assertion tails.

| # | Mutation | Result | Died at |
|---|---|---|---|
| **A** | **Neuter the write**: action SQL `SET score = 22` → `SET score = score` | **4 of 7 postgres tests killed** | action-execution :497 (the *final* assertion), public-sharing :548, query-action :659, public-query-action :846 — all `Expected 22, Received 0` |
| A (survivors) | same | 3 survive, **correctly**: the two implicit-action tests write via a different path, and the impersonation test asserts the score *stays* 0 | — |
| B1 | implicit Create: typed `Score` 1 → 2 (assertion hardcodes 1) | killed (mysql) | :786 `Expected 1, Received 2` |
| B2 | implicit Update: typed `Score` 16 → 17 | killed ×4 (both dialects, both tests) | :576 and :899, `Expected 16, Received 17` |
| C | skip both `disableSharingFor` calls | killed | :599 — the post-disable "Not found" block is load-bearing, not vacuous |
| D | don't hide the `Current Status` field | killed | :642 — the run-modal absence assertion is load-bearing |
| E1 | permissions: `ALL_USERS` `blocked/no` → `unrestricted/query-builder-and-native` | killed | :339 (read-only dialog block) |
| E2 | permissions **tail**: leave actions enabled for the sample DB | killed | :385 — the *last* assertion in that test |
| F | impersonation **tail**: break the group id **and delete the error-text assertion**, leaving only the read-back | killed | :980 `Expected 0, Received 22` |
| G | CRUD: press Cancel instead of Disable on "Disable basic actions?" | killed | :282 — the `<main>` absence block |
| H | constraint-violation: `User ID` 999999 → 1 (valid FK) | killed | :431 (`This value does not exist in table "people".`) |
| I | template tags: `{{id}}` → `{{ident}}` | killed | :410 (`getByLabel("ID")` visible) |

**Neuter-the-write verdict:** the read-back assertions are the load-bearing part
of this spec and they are genuinely wired to the database — mutation A alone
kills 4 tests, and B1/B2 cover the implicit-action write path A cannot reach.
Combined with F, the impersonation test is proven to be asserting a **blocked
write**, not just an error string.

**Tail coverage:** A killed test 3 at its *first* `verifyScoreValue(22)` (:659),
leaving its final one unproven — but that same tail assertion was killed
naturally by the mysql race (:727, `Expected 22, Received 0`) before the anchor
went in, so it is covered. E2 and F were written specifically to hit tails after
E1/A died early.

**Not triggered by any failure mode I could induce:** the absence assertions in
`should display parameters for variable template tags only`
(`getByLabel("#1-orders-model")`, `getByLabel("101")`). I could not construct an
input that makes a card-ref or snippet tag render a parameter widget — that is
the product behaviour under test, so there may be no such input. Mutation I does
establish that the label lookup itself resolves real widgets (`{{ident}}` →
`getByLabel("ID")` goes red), so the absence checks are at least querying a
working mechanism. I am not claiming they are structurally vacuous.

## Faithfulness notes / upstream quirks ported verbatim

- **Upstream typo, vacuous upstream too:** `should allow public sharing of
  implicit action and execution` asserts
  `cy.findByLabelText("Create At").should("not.exist")` — a typo for
  "Created At". Neither spelling exists once the field is hidden, and "Create At"
  is never a label the app renders, so it cannot fail. Ported verbatim with the
  analysis inline (faithfulness rule); **not** "fixed", since fixing it would
  change what the test checks.
- Never-awaited intercepts dropped and listed in the header: `getModelAction`,
  `fetchMetadata`, `getArchived`, `getSearchResults`, `getDatabase`.
- `cy.wait(["@createAction" ×3])` → a response **counter** polled to `>= 3`
  (three concurrent `waitForResponse`s on one predicate would all resolve on the
  first hit).
- `cy.signInAsImpersonatedUser()` → `signInWithCachedSession(context,
  "impersonated")`; "impersonated" is outside the harness `USERS` map. The api
  client deliberately stays on admin — that test makes no API calls as the
  impersonated user (all its `cy.request`s precede the sign-in).

## Container evidence (#85)

```
metabase-e2e-postgres-sample-1  0.0.0.0:5404->5432    writable_db
metabase-e2e-mysql-sample-1     0.0.0.0:3304->3306    writable_db
```
- postgres `writable_db`: **29 non-system schemas** of sibling debris. `public`
  holds `composite_pk_table, many_data_types, no_pk_table, products,
  scoreboard_actions`.
- **`scoreboard_actions` exists in `public` only** — checked with
  `table_name ilike '%scoreboard%'` across all schemas, one hit. So the unpinned
  `getTableId({ name: "scoreboard_actions" })` this port inherits from
  `support/actions-on-dashboards.ts` is currently safe. It is still a **latent**
  instance of the pin-the-schema rule: if a sibling ever creates a
  `scoreboard_actions` in a foreign schema, this port would silently bind to it.
  I did **not** change the shared helper (rule: don't edit shared support
  modules) — flagging it instead.
- No foreign schemas were dropped. `resetTestTable` only drops/recreates
  `public.scoreboard_actions`, which this spec owns.
- mysql `writable_db`: `composite_pk_table, no_pk_table, scoreboard_actions`.

**Unexplained / environmental, recorded not diagnosed:** during one mutation run
the `postgres` `beforeEach` exceeded the 90s test timeout inside
`resyncDatabase`, and an earlier full-suite invocation hit the 10-minute shell
timeout the same way. It did **not** recur across 4 subsequent clean runs
(18 + 36 + 18 tests). Sibling agents were running against the same shared
containers at the time. I am recording this as intermittent and most likely
contention on the shared writable container (#85) rather than inventing a
mechanism — I did not isolate it.

Note the `resyncDatabase` call here **does** pass `tables:
["scoreboard_actions"]` (the non-bare form). The refined #85 caveat — a stale
`initial_sync_status: "complete"` row satisfying the wait instantly — is
mitigated in practice because `scoreboard_actions` is dropped and recreated
under the same name+schema, so Metabase reuses the same table row and the id
stays valid. I did not add a field-level anchor; if this spec ever goes flaky on
"table not found", that is the first thing to add.

## Summary (3 lines)

1. Full 18-test port; **17 execute green on the live QA Postgres/MySQL
   containers** (1 correctly skipped by `cy.onlyOn`), stable at
   `--repeat-each=2`, tsc clean, gate-OFF control clean at 18 skipped / 0 failed.
2. Two reusable gotchas found: **`cy.wait("@alias")` is a queue that pops past
   responses** (a naive `waitForResponse` deadlocks on RTK-cached reads — cost 2
   tests × 30s), and **guessing `USER_GROUPS` ids silently defeats an
   impersonation test** in a way that reads as an app bug.
3. Eleven mutants, all killed including a **neuter-the-write** probe that takes
   down 4 tests and tail-targeted probes for the 3 tests whose earlier mutants
   died at assertion #1 — the read-back assertions are demonstrably load-bearing.
