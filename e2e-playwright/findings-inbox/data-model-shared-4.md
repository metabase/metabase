# data-model-shared-4

Port of `e2e/test/scenarios/data-model/data-model-shared-4.cy.spec.ts` (475 lines)
→ `tests/data-model-shared-4.spec.ts`, support in `support/data-model-shared-4.ts`.

Slot 5 (:4105). **Jar verified BY IDENTITY, not by `JAR_PATH`**: the slot backend
printed `(reused)`, so `JAR_PATH` was not trusted — `GET :4105/api/session/properties`
gives `version.hash = 751c2a9`, matching `target/uberjar/COMMIT-ID 751c2a98`, and
`ps` confirms all running backends are `java -jar .../target/uberjar/metabase.jar`.

## Collision checks

- `grep -rl "data-model-shared-4" .` (excluding node_modules/test-results) hit
  **only `QUEUE.md`**. No uncommitted port of this source existed.
- `ls tests/` had no `data-model-shared-4.spec.ts`; `ls support/` had no
  `data-model-shared-4.ts`. Siblings `-1`, `-2`, `-3` are present and are
  different sources.
- Source dir holds only `.ts` specs (`data-model-shared-1..4.cy.spec.ts`) — no
  `.js`/`.ts` basename pair, consistent with the settled "three disjoint pairs,
  all already ported" result.
- **Support module name is the conventional `support/data-model-shared-4.ts` —
  no deviation to report.**

## Shape and snapshot, per describe

2 upstream tests × 2 areas (`admin`, `data studio`) = **4 cases**. Both are
monolithic "walk every editable surface" tests (~15 surfaces each).

| describe | tag | snapshot restored | touches shared writable container? |
|---|---|---|---|
| Error handling | `@external` | `postgres-writable` | **YES** — reseeds `many_data_types` on `writable_db` (:5404) and resyncs |
| Undos | `@external` | `postgres-writable` | **YES** — identical beforeEach |

**Both tags are ACCURATE, in both directions.** Neither describe is over-tagged
(each genuinely ends by driving the JSON-unfolding control on `many_data_types`,
so the container is load-bearing for both), and nothing is under-tagged — there
is no third describe. Note the outer `beforeEach`'s `H.restore()` is immediately
overridden by each inner `beforeEach`'s `H.restore("postgres-writable")`, so the
*effective* snapshot for all 4 cases is `postgres-writable`.

**The `WRITABLE_DB_ID` red herring does NOT apply here.** It is the literal `2`,
which is the read-only "QA Postgres12" sample only under `postgres-12`; under
`postgres-writable` database 2 genuinely is the writable container. So all 4
cases are fully exposed to #85, and I checked the snapshot rather than the
constant — same conclusion `-3` reached, for the same reason.

**Gate-OFF control:** `PW_QA_DB_ENABLED` unset → **4 skipped**, clean. No
`afterEach` fallout is possible: this spec has no `afterEach` hooks at all.

## Snowplow: which vantage, and why NONE

This spec is queue-gated on snowplow because its outer `beforeEach` calls
`H.resetSnowplow()`. **That call is dead setup.** Verified rather than assumed:

- the spec asserts **no tracking event anywhere** — no `expectUnstructuredSnowplowEvent`,
  no `expectGoodSnowplowEvent`, no `H.expectNoBadSnowplowEvents`;
- `grep -rn "expectNoBadSnowplowEvents\|resetSnowplow\|afterEach" e2e/support/e2e.js`
  is **empty** — there is no global Cypress hook that would consume it.

So neither vantage would have anything to observe: `installSnowplowCapture`
(browser boundary) and the per-slot collector (`support/snowplow-collector.ts`,
backend port + 1000) would both see an unasserted stream. Dropped rather than
stubbed. **The tag misled in the "over-broad" direction here** — worth recording
because the brief warns tags mislead in both.

Token gate: `H.activateToken("pro-self-hosted")`, ported as the standard
`resolveToken` skip. Nothing here is `transforms-basic`-adjacent, and no
feature-gated surface rendered empty.

## Run 1: 2 passed / 2 failed → ONE root cause, port drift in my own stub

Both "Undos" cases passed first time. Both "Error handling" cases failed at
`spec.ts:367`, the **last two** assertions — the preview error.

🔴 **`cy.intercept(url, { statusCode: N })` sends an EMPTY body.** I had
fulfilled with `{ status: 500, contentType: "application/json", body:
JSON.stringify({ message: "Internal Server Error" }) }`, which looks harmless.
It is not: Metabase's error surfaces render the server's message when there is
one, so the preview rendered the literal string **"Internal Server Error"**
instead of the generic **"Something went wrong"** the spec asserts. The DOM
snapshot showed `- img "warning icon"` / `- text: Internal Server Error` — i.e.
the error path was correctly reached and the assertion was correctly red.

Every toast assertion before it passed, because those messages are
FE-constructed and do not surface the server body. So the mistake was invisible
for 13 of 15 surfaces and only bit at the one place the app echoes the body.

Fixed to `route.fulfill({ status: 500, body: "" })`. **Generalisable rule: a
Playwright `route.fulfill` standing in for a bare Cypress `{statusCode}` must
send an empty body — a convenience JSON `{message}` body is a behaviour change,
not cosmetics.**

That was the only failure. No product-bug claim anywhere in this port.

## #85 accommodation (a documented deviation)

Upstream's `visit({ databaseId: WRITABLE_DB_ID })` relies on the picker
auto-expanding the *sole* schema. Measured on this box: **31 schemas now** on
`writable_db` (29 when `-3` measured it — siblings have added more since; I
created none). With 31, no auto-expand, `public` sorts last of a virtualized
~20-row tree so the node is never in the DOM to click, and `visitDataModel`'s
default `schema` wait gates on `GET /api/database/:id/schema/:name` which only
fires ON auto-expand.

The port navigates straight to `schemaId` = `2:public` — the **RAW** schema
name, as the picker renders it — reaching the identical end state. Both #85
mechanisms the brief describes reproduced as briefed.

**I did not drop any foreign schemas** (sibling slots live), and I did not touch
the owed `support/data-model.ts` fix.

## Container evidence (before → after)

```
metabase-e2e-postgres-sample-1   0.0.0.0:5404->5432/tcp   <- the writable host
writable_db schemas: 31 (unchanged by me)
writable_db public tables: composite_pk_table, many_data_types, no_pk_table,
                           products, scoreboard_actions
many_data_types after my last run: 2 rows,
  min(json::text) = {"a":10,"b":20,"c":[6,7,8],"d":"foobar"}
```

**Shared state created and restored:** the only container write is
`resetManyDataTypesTable` (drop + recreate + 2-row reseed in `public`), the same
fixture `-3` uses and byte-equal to `e2e/support/test_tables_data.js`. It is
left in canonical state, verified above. Two mutation runs did
`PUT /api/field/:id` against slot 5's **app** DB only; every subsequent test
restores the snapshot, and the final post-restore run is green.

## Results

| run | result |
|---|---|
| run 1 (gate ON) | 2 passed / 2 failed → 1 root cause, port drift |
| run 2 (gate ON) | **4 passed** (1.8m) |
| `--repeat-each=2` (gate ON) | **8 passed** (3.6m), 0 flaky |
| gate-OFF control | **4 skipped**, clean |
| post-restore confirming run | **4 passed** (1.8m) |
| `bunx tsc --noEmit` | **clean, zero errors repo-wide** |

**tsc note:** unlike `-3`'s session, the repo was clean when I started and clean
when I finished — there were **no** pre-existing errors to disclaim, and none of
mine.

Per-case runtimes: Error handling ~21-23s, Undos ~31-33s. Each case exceeds the
90s project timeout only in the worst case, so `test.setTimeout(300_000)` is set
per test — a harness accommodation, not a change to what is asserted.

## Mutation testing

Inverting the **input**, never the expectation. Five mutants, all killed, and
deliberately aimed at *different* regions because both tests are monolithic and
a naive mutant dies at line 1.

| # | mutation (input) | result | died at |
|---|---|---|---|
| M1 | drop the `POST /api/dataset` 500 stub | **killed** ×2 | spec.ts:367 — first preview assertion (the TAIL) |
| M2 | drop the `PUT /api/field/:id` 500 stub | **killed** ×2 | spec.ts:261 — "Failed to update name of Quantity" (MIDDLE) |
| M3 | pre-set `ORDERS.QUANTITY settings.show_mini_bar = true` | **killed** ×2 | spec.ts:592 — the **final assertion of the whole spec** |
| M4 | pre-set `ORDERS.QUANTITY settings.prefix = "$"` | **killed** ×2 | spec.ts:581 — prefix assertion in the formatting tail |
| M5 | *probe*: remove the mini-bar toggle **action** | **killed** ×2 | spec.ts:587 — `Received string: ""` |

**M3 is the load-bearing result.** Killing at the last line of a ~200-line
monolithic test proves the whole Undos case genuinely executes to the end, and
that the final assertion observes the undo *restoring the original value* rather
than merely observing a default. M4 pins a second, independent tail assertion.

**M5 answers a vacuity question I could not settle by reading.** Several toast
messages REPEAT within a test — "Formatting of Quantity updated" 3×, "Name of
Quantity updated" 2× — and `expectToastsContainText` is a CONCATENATION over
every on-screen toast (faithful to chai-jquery). If an earlier toast lingered,
the later assertion would pass retroactively and be hollow. Upstream's
`verifyToastAndUndo` closes only the "Change undone" toast and relies on the
original auto-dismissing, so this was a live concern. M5 removes the action that
should produce the third "Formatting…" toast; the assertion failed with
**`Received string: ""`** — i.e. **zero toasts on screen at that point**. So no
toast lingers, and the repeated-message assertions are genuinely fresh. This is
the "assert presence under the same mechanism" move the playbook prescribes, and
it turned a suspected vacuity into a measured fact.

**A bad mutation I identified and did NOT run**, because `-3`'s M6 already
showed it proves nothing: flipping the writable DB's JSON unfolding so that
selecting "No" becomes a no-op. A no-op selection fires no PUT and produces no
toast, so it would have died ~40 lines early inside `verifyToastAndUndo` rather
than at the `toHaveValue("Yes")` tail it was aimed at. I could not construct an
input mutation that separates that specific assertion, so I record it as a
**known coverage gap** rather than claiming it.

**Second known gap, same shape as `-3`'s.** M1 kills at the *table* preview
assertion (367); the *object-detail* preview assertion (374) checks the same
generic error through a different preview tab, and both are driven by the same
`POST /api/dataset`. No input mutation separates them, so 374 is not
*independently* proven.

**Spec and support restored byte-identically** — `md5` re-checked after every
mutant and after the last one:
`733cc3a37f455a134591ae4b2a7ad2d1` (spec), `4ce6b8daf53d90fc3153a050eef367d8`
(support), matching the pre-mutation values. The post-restore run is green.

## Notes / fixmes

- **No `test.fixme`s.** No test dropped, weakened, or merged. All 2 upstream
  tests × 2 areas are present and executing behind the documented QA gate.
- **Eleven `cy.intercept` aliases dropped as pure dead setup.** This spec
  registers `schemas`, `metadata`, `schema`, `dataset`, `fieldValues`,
  `updateField` (+ a `cy.spy()` aliased `updateFieldSpy`), `updateFieldOrder`,
  `updateFieldValues`, `updateFieldDimension`, `updateTables`, `updateTable`,
  plus per-area `databases` — and then contains **not one `cy.wait`** and never
  reads `@updateFieldSpy`. Grepped to confirm before dropping.
  **Consequence: there is no `cy.wait` alias QUEUE to port in this spec.** The
  brief's ResponseRecorder rule applies to `-3`, not here; the retrying toast
  assertions are what gate every step, exactly as upstream.
- **Did not import the shared `data-model.ts:235` `verifyAndCloseToast`.** This
  spec produces overlapping toasts by construction, so the measured strict-mode
  bug would fire. Re-exported shared-2's correct pair, as `-3` did — consolidating
  toward one implementation stays faithful (Cypress has exactly one).
- **Two declared strengthenings, both small and both matching shared-2's landed
  precedent:** (1) `icon("close").click({force:true})` → `dispatchEvent("click")`
  — a Playwright force-click moves the real mouse and would hit the mapping modal
  the toast sits behind; (2) a `toHaveCount(0)` settle after each close, which
  upstream does not assert. (2) is what makes the repeated-message assertions
  non-vacuous, per M5 — so it is load-bearing, not decorative.
- **`findByLabelText("Alphabetical order")` is NOT the radio input.** The field
  order picker is a Mantine **SegmentedControl** (`FieldOrderPicker.tsx`), whose
  radio inputs are `sr-only`. But `Label.tsx` puts the `aria-label` on a *visible*
  `<Flex>` inside the option's `<label>` — so upstream's locator is already the
  "click the visible label" form PORTING prescribes, and no force-click is
  needed. Checked the source rather than assuming from the `radiogroup` role.
- **`H.modal().should("be.visible")` did NOT hit the "Mantine Modal root reports
  hidden" trap.** `support/ui.ts`'s `modal()` resolves to the inner
  `[role=dialog][aria-modal=true]` content node, which reports visible. Ported
  literally; verified green, not assumed.
- **Every testid used is inherited from already-exercised sibling helpers**
  (`table-section`, `field-section`, `preview-section`, `toast-undo`, `tree-item`,
  `prefix`, `.Icon-close`). No new testid was invented; nothing needed grepping
  against `frontend/src` + `enterprise/frontend/` beyond the four product labels
  I did verify (`Show a mini bar chart`, `Multiply by a number`, `Column order`,
  `More actions`) plus the three `data-studio/table/*` endpoints.
- **`getByText("Something went wrong")` is left NON-exact** — deliberately. The
  `exact:true` trap (testing-library reads direct child text nodes, Playwright
  reads full `textContent`) makes a literal transcription risky; non-exact is a
  documented slight loosening, and M1 shows it still discriminates.
- **No Cypress cross-check was run** — sibling slots are live and the standing
  rule forbids it. I therefore cannot and do not claim anything about whether
  upstream also passes. Nothing here needed one: the single run-1 failure
  resolved to port drift with a demonstrated mechanism.
- **`resyncDatabase({ tables })` + `waitForUnfoldedJsonField` anchor kept**, per
  the PORTING refinement — a stale `initial_sync_status: "complete"` row would
  otherwise satisfy the bare form instantly. Confirms `-3`'s note; not
  independently re-measured here.
- **`blank.sql` corruption:** not exercised by this port (both describes restore
  `postgres-writable`), so I have nothing to add or retract about it.

## Summary (3 lines)

Ported 2 monolithic tests × 2 areas; **4/4 green, 8/8 under `--repeat-each=2`,
0 flaky, tsc clean repo-wide**, gate-OFF cleanly skips all 4.
The single run-1 failure was my own stub drift — **a Cypress bare
`{statusCode:500}` sends an EMPTY body, and a JSON `{message}` body makes the app
render the server string instead of "Something went wrong"**.
Five mutants, all killed, aimed at distinct regions — including one that dies at
the spec's **final** assertion and one probe that proved the repeated-message
toast assertions are **not** satisfied by lingering toasts (`Received: ""`).
