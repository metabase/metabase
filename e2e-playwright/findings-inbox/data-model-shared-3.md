# data-model-shared-3

Port of `e2e/test/scenarios/data-model/data-model-shared-3.cy.spec.ts` (802 lines)
→ `tests/data-model-shared-3.spec.ts`, support in `support/data-model-shared-3.ts`.

Slot 2 (:4102). Jar verified: `version.hash 751c2a9` == `target/uberjar/COMMIT-ID
751c2a98`, `ps` confirms `-jar target/uberjar/metabase.jar`. The slot backend was
already up and `(reused)`, so `JAR_PATH` was NOT trusted — checked directly.

## Collision checks

- Source dir `e2e/test/scenarios/data-model/` holds only `.ts` specs
  (`data-model-shared-1..4.cy.spec.ts`). **No `.js`/`.ts` basename pair.**
- `e2e/test-component/` contains only `scenarios/embedding-sdk` — no pair there.
- `ls tests/` had **no** `data-model-shared-3.spec.ts`. `data-model-shared-1`
  and `-2` exist and are different sources. No collision; proceeded.
- Support module name is the conventional `support/data-model-shared-3.ts` —
  **no deviation to report.**

## What I did with the inherited support module

`support/data-model-shared-3.ts` existed (untracked, no spec). I did **not**
adopt it on trust.

**Verified and kept.** All seven `FieldSection` getters were re-derived from
`e2e/support/helpers/e2e-datamodel-helpers.ts:441-527`
(`getRawFieldName` → `findByLabelText("Field name")`, `getFieldDisplayValuesInput`
→ placeholder `"Select display values"`, `…FkTargetInput` → `"Choose a field"`,
`getFieldUnfoldJsonInput`, `getFieldStyleInput`, `getFieldPrefixInput` /
`getFieldSuffixInput` → testids). **All seven matched**, including the
`{ exact: true }` on every `getByLabel`/`getByPlaceholder` (the
`findByLabelText`-is-exact / `getByLabel`-is-substring trap). The tooltip
assertion trio reproducing chai-jquery's concatenation / any-of split is also
correct. No live mutation was hiding in it.

**Two real gaps found and closed:**
1. **No `verifyAndCloseToast` replacement** — the spec calls it 6× and the
   brief's whole point is that the shared `data-model.ts:235` one is the
   measured strict-mode + force-click bug. The inherited module simply didn't
   have one, so a spec written against it would have imported the broken shared
   helper. Closed by re-exporting `data-model-shared-2`'s already-correct pair
   (concatenated assertion + `dispatchEvent` close) rather than writing a third
   copy — Cypress has exactly one `verifyAndCloseToast`, so consolidating
   toward it stays faithful.
2. **No `many_data_types` fixture** for the `@external` describe. Written from
   `e2e/support/test_tables.js` + `test_tables_data.js`, verified against the
   container (2 rows, `json = {"a":10,…}`).

**One thing dropped:** `expandPublicSchemaIfPresent`. It did
`getSchema(page,"public").scrollIntoViewIfNeeded().click()` — which cannot work:
the tree is virtualized and `public` sorts **last** of the 29 schemas, so the
node is not in the DOM to be scrolled to. This is a concrete instance of the
brief's "a getter written before its first use is unverified" — it was authored
ahead of the tests that would exercise it and would have hung. Replaced by
navigating straight to `schemaId` (below).

**Exercised, not assumed:** every kept getter is used by at least one now-passing
test, and `getDatabaseTableIds` / `getDatabaseSchemas` are both load-bearing in
the SQLite test. `getDatabaseFields` (homepage.ts) really does omit the
`<TABLE>_ID` keys, so `getDatabaseTableIds` was genuinely needed.

## Infra tier, per describe

| describe | tests | tier | verdict |
|---|---|---|---|
| Behavior › Display values | 7 (×2 = 14) | Sample DB; one adds a **SQLite** DB (built-in driver, repo-root `resources/sqlite-fixture.db`) | executes, no container, correctly untagged upstream |
| Behavior › Unfold JSON | 3 (×2 = 6) | `@external`; `postgres-writable` snapshot + writable QA postgres | gated on `PW_QA_DB_ENABLED` |
| Formatting | 4 (×2 = 8) | Sample DB | executes, no container |

**Tags are accurate both ways here.** The only tag is `@external` on Unfold
JSON, and it is correct. Nothing untagged needs a container — in particular the
SQLite test *looks* infra-ish but is a local fixture file. So my siblings
disagreed and, for this spec, `-2`'s reading (tags accurate) is the one that
matches: I found **no** missing, over-broad, or stale tag.

**The `WRITABLE_DB_ID` red herring does NOT apply.** It is the literal `2`, and
under `postgres-12` that is the read-only QA Postgres12 sample — but this
describe restores **`postgres-writable`**, under which database 2 genuinely is
the writable container (verified: `GET /api/database/2` → name
`"Writable Postgres12"`, engine `postgres`). So these 6 tests are fully exposed
to #85, and I checked the snapshot rather than the constant.

## Container evidence

```
metabase-e2e-postgres-sample-1   0.0.0.0:5404->5432/tcp     <- the writable host
metabase-e2e-mysql-sample-1      0.0.0.0:3304->3306/tcp
metabase-e2e-mongo-sample-1, metabase-e2e-maildev-1, metabase-e2e-webhook-tester-1
```

`writable_db` schema count = **29**, exactly as briefed:
`Domestic, Wild, Schema A … Schema Z, public`. `public` sorts **last**.

`many_data_types` after my fixture ran: 25 columns, `json` of type `json`,
2 rows, `min(json::text) = {"a":10,"b":20,"c":[6,7,8],"d":"foobar"}`.

## Run 1: 18 passed / 10 failed → three root causes, all port drift

### 1. 🔴 The `value`-attribute locator is a placeholder trap (NEW instance)

`cy.findAllByPlaceholderText("Enter value").filter("[value='null']")`.
Transcribed literally as
`input[placeholder="Enter value"][value="null"]`, which is the correct
*attribute* semantics — jQuery's `.filter("[value=…]")` and CSS agree.

**But React keeps the `value` attribute in sync**, so the instant
`replaceValue`'s `clear()` empties the field the selector stops matching, and
the very next `pressSequentially` re-resolves to nothing and burns the full
30s. Cypress never sees this because its chain holds the already-resolved
subject.

Fingerprint is misleading in the documented way: the error points at
**`support/data-model.ts:337` (`replaceValue`)**, a shared, correct helper, not
at the selector that invalidated itself.

This is the placeholder-trap family (`RecipientPicker`, native param widgets)
extended to a new trigger: **the locator is invalidated by the test's own
typing, via an attribute rather than a placeholder.** Generalisable rule:
*never leave a locator that selects on a mutable value/state attribute live
across an edit — resolve it to a positional `nth()` first.* Fixed that way.

### 2. 🔴 `cy.wait("@updateFieldDimension")` is satisfied RETROACTIVELY

"should correctly apply and display custom remapping for numeric values".
Selecting "Custom mapping" fires **`POST /api/field/:id/dimension` at selection
time**; upstream's `cy.wait("@updateFieldDimension")` sits *after* the modal's
Save and is satisfied by that earlier response popping off the queue. A literal
`waitForResponse` registered before the Save click deadlocked 30s.

This is the brief's queue rule landing exactly as described. Ported as a
`responseQueue` (record from where Cypress registers the intercept — the
`beforeEach` — then `pop()` once per `cy.wait`) for `@updateFieldValues` and
`@updateFieldDimension`, which are the two aliases that fire more than once per
test. Left `@updateField` / `@metadata` / `@sync_schema` as before-action
`waitForResponse`s, since each of those directly follows its own trigger and
all passed. Fixed 2 tests.

### 3. I guessed a field name — the "never guess an id" rule applies to names too

`waitForUnfoldedJsonField` (mine) polled for a field literally named `json.a`,
because that is the string the spec asserts via `FieldSection.getRawName()`.
**`json.a` is the FE's rendering and appears nowhere in the API payload.** The
backend field `name` is `"json → a"`, with `nfc_path: ["json","a"]`.

Probed rather than assumed, against the running backend:

```
json-ish fields: [{"name":"json → a","display":"Json → A","parent":null,"nfc":["json","a"]},
                  {"name":"json → b",...}, ..., {"name":"json","nfc":null}]
```

Cost all 6 Unfold JSON tests a 90s test-timeout each (~9 of run 1's 12 minutes).
Now matched on `nfc_path`, which is the structural signal rather than a
formatted name. **JSON unfolding itself works fine out of the box** — no
`json-unfolding` DB detail needed, 31 fields synced. My original write-up
instinct ("the fixture must be wrong") was wrong; the fixture was correct and
the *probe* was wrong.

## #85 accommodation (a documented deviation)

Upstream `visit({ databaseId: WRITABLE_DB_ID })` relies on the picker
**auto-expanding the sole schema**. With 29 schemas it does not, and `public`
sorts last so the virtualized tree never renders that node — meaning the
brief's "pin the schema" advice cannot be implemented as a *click* here. The
port navigates straight to `schemaId` (`2:public`), reaching the identical end
state upstream's auto-expand produces on a clean container.

This also sidesteps the second #85 mechanism the brief names: `visitDataModel`'s
default `schema` wait gates on `GET /api/database/:id/schema/:name`, which only
fires **on auto-expand**, so the `databaseId`-only form would have burned 30s on
a correctly-rendered page. Both mechanisms reproduced as briefed.

I did **not** drop any foreign schemas (siblings live).

## Results

| run | result |
|---|---|
| run 1 (gate ON) | 18 passed / 10 failed → 3 root causes, all port drift |
| run 2 (gate ON) | **28 passed** (1.5m) |
| gate-OFF control | **22 passed / 6 skipped** (1.0m) — the 6 are exactly the Unfold JSON describe ×2 areas |
| `--repeat-each=2` (gate ON) | **56 passed** (3.1m), 0 flaky |
| `bunx tsc --noEmit` | clean for both my files (see caveat below) |

**tsc caveat:** the repo currently has 2 errors, both in
`tests/permissions-reproductions-js.spec.ts` (`DATA_GROUP` not exported from
`dashboard-repros`; `name` not in `AdhocQuestion`). That file is a **sibling
agent's** in-progress work — tsc was clean when I started and these appeared
mid-session. Not touched. `data-model-shared-3` (spec + support) produces zero
errors.

**Gate-OFF control found no `afterEach` fallout** (the #67/#49 trap where an
`afterEach` runs past a skipped `beforeEach`). The `Field section` describe's
`afterEach` calls `expectNoBadSnowplowEvents(capture)`, which is a pure
in-memory array check and does not throw when the skipped tests leave `capture`
holding the previous test's value.

## Mutation testing

Inverting the **input**, never the expectation. Six mutants + one probe.

| # | mutation (input) | result | died at |
|---|---|---|---|
| M1 | `many_data_types` fixture `json.a: 10 → 99` (nothing in the beforeEach tracks it) | **killed** ×2 | preview `toHaveText` "10" vs "99" — spec.ts:675 / :773 |
| M2 | *probe*: `dispatchEvent("click")` aimed at an **enabled** Custom-mapping option | **value changed** to "Custom mapping" | n/a — see below |
| M3 | SEM-359: type `"MUT"` into the prefix so a PUT genuinely fires | **killed** | `expect(fieldPuts.urls).toEqual([])` — 3 received, spec.ts:1008 |
| M4 | typed prefix `"about " → "roughly "` | **killed** | preview "about 2" vs "roughly 2" — spec.ts:959 |
| M5 | FK target `Created At → Birth Date` | **killed** | preview date value — spec.ts:594 |
| M6 | unfold `No → Yes` (aimed at test 8's tail) | **BAD MUTATION** | died early at the `@updateField` wait (spec.ts:705) — a no-op change fires no PUT, so it never reached the tail |
| M7 | remove the "Sync database schema" step + my `present:false` gate | **survived** | — |
| M8 | remove the disable+sync block entirely (presence probe for the tail) | **killed** | `toHaveCount(0)` got **1** — spec.ts:707 |

**M1 answers a doubt I had about the harness, not just the assertions.** The
Unfold JSON tests run in ~4s each, which looked far too fast for a
`postgres-writable` restore + knex reseed + resync, and I suspected the
`beforeEach` was being satisfied by stale state (the #85 / stale-sync-row
family). M1 rules that out: corrupting the fixture changes what the test
observes, so the reseed and resync are genuinely happening on every test. The
runtime is simply real.

**M2 (the `dispatchEvent` question).** Test 1's final assertion — dispatch a
click at a `pointer-events: none` disabled option, then assert the value did
*not* change — is the kind that passes whether or not the event ever reached
the app. Rather than assume, I asserted **presence under the same mechanism**:
the identical `dispatchEvent("click")` aimed at that option where it is
*enabled* (test 6's end state) **does** flip the value to "Custom mapping". So
the dispatch is app-reaching and test 1 is observing disabled-ness, not a dead
event.

**M6 was my own bad mutation** and I am recording it as such: I aimed it at
test 8's tail absence assertion, but selecting the value the field already has
fires no `PUT /api/field/:id`, so it died at the wait ~40 lines earlier and
proved nothing about the tail.

**M7 survived — and the answer is "bad mutation", not "vacuous".** Removing the
sync step left the tail assertion green, which looks like vacuity. M8 settles
it the way the playbook prescribes (assert presence under the same mutation):
with unfolding left enabled, the same locator matches **1**, so the absence
assertion can and does fail. The real explanation for M7 is a fact about the
app: **disabling JSON unfolding drops the nested fields from the field list
immediately — the explicit "Sync database schema" step is not what makes them
disappear.** Upstream's sync step is belt-and-braces for that particular
assertion. Not a bug; worth knowing before anyone "optimises" that assertion.

**Where mutants died / what stays unproven.** M1 and M5 both died at *preview*
assertions rather than at the final QB-table assertion that follows them
(spec.ts:594 → the `cell-data` nth(10) check; spec.ts:675 → later steps). Those
trailing assertions check the same remapped value through a different surface,
so they are not *independently* proven by these mutants. I could not construct
an input mutation that separates the two surfaces, so I am recording it as a
known gap rather than claiming coverage I did not demonstrate.

## Notes / fixmes

- **No `test.fixme`s.** No test dropped, weakened, or merged. All 14 upstream
  tests × 2 areas are present and executing (6 behind the documented QA gate).
- **No Cypress cross-check was run** — parallel slots are live and the standing
  rule forbids it (`H.restore()` re-points database 1 at the shared H2 file and
  wedges sibling slots). Nothing here needed one: all 10 run-1 failures resolved
  to port drift with a demonstrated mechanism, and none became a product-bug
  claim.
- **Assertion semantics I deliberately did not "fix":** upstream's
  `H.tooltip().should("have.text", …)` and `undoToast().should("contain.text", …)`
  are chai-jquery CONCATENATIONS on multi-element subjects. Ported as joins, not
  `.first()`, which would have silently strengthened them. `cy.findAllByRole(…)
  .should("be.visible")` ported as ANY-OF (`.filter({visible:true}).first()`).
- **One place I strengthened, and say so:** `cy.findByText(x).should("not.be.visible")`
  in the currency test carries an implicit existence requirement (testing-library
  `findBy*` throws when absent) that a bare `toBeHidden()` would drop, so the port
  asserts `toHaveCount(1)` **and** `toBeHidden()`. I checked this is the
  display-none case, not the fixed/sticky occlusion case that needs an
  `elementFromPoint` probe.
- **Shared-helper hazard NOT acted on (brief says leave it):** the owed
  `data-model.ts` fixes (`verifyAndCloseToast` at :235, and `multi_schema` reset
  not dropping foreign schemas) are untouched. This port simply does not import
  the broken `verifyAndCloseToast`.
- **Consolidation candidate:** `verifyAndCloseToast` / `expectToastsContainText`
  now live in `data-model-shared-2` and are re-exported by `-3`. When the shared
  `data-model.ts:235` version is finally fixed, all three should collapse into it
  — Cypress has exactly one, so that stays faithful.
- **`resyncDatabase` blast-radius note:** this spec is a *correct* use of the
  `tables` form, but it needed the extra `waitForUnfoldedJsonField` anchor on top.
  Confirms the PORTING refinement that `tables` alone does not close the
  stale-sync-row hole.
