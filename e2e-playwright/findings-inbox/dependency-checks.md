# dependency-checks (slot 4, port 4104)

Source: `e2e/test/scenarios/dependencies/dependency-checks.cy.spec.ts` (344 lines, 4 tests)
Target: `e2e-playwright/tests/dependency-checks.spec.ts`
Support: **`support/dependency-checks.ts`** — the expected name; no deviation.

## Collision checks

- `grep -rl "dependency-checks" tests/ support/` → **no hits** before writing.
- `ls tests/` → no `dependency-checks.spec.ts`. `ls support/` → no
  `dependency-checks.ts`. The three neighbouring ports that DO exist
  (`dependency-graph`, `dependency-broken-list`, `dependency-unreferenced-list`)
  are ports of the *other three* files in `e2e/test/scenarios/dependencies/`,
  not of mine.
- Source-directory check: that directory holds exactly four `.cy.spec.ts` files
  and mine has no `.js`/`.ts` twin.
- Read-only imports from `dependency-graph.ts`, `schema-viewer.ts`,
  `transforms.ts`, `notebook.ts`, `ui.ts`, `native-editor.ts`,
  `native-extras.ts`, `custom-column-3.ts`, `data-studio-bulk-table.ts`,
  `table-editing.ts`, `search-snowplow.ts`. **No shared support module edited.**

---

## 🔴 HEADLINE: the behaviour these four tests are named for NO LONGER EXISTS

This is the most important thing in this report and it reframes everything else.

All four surviving tests are named *"should not show a confirmation / warning if
there are no breaking changes …"*. **The confirmation was deleted from the
product.** Two commits, found via `git log` on the spec:

1. `d8b40292d12` **"Disable blocking dependency checks on save (#70819)"**
   (Mar 13 2026) — unregistered `PLUGIN_DEPENDENCIES.useCheckCardDependencies /
   useCheckSnippetDependencies / useCheckTransformDependencies`, and **deleted
   145 lines from this very spec**: every test that asserted the confirmation
   *does* appear ("should be able to confirm or cancel breaking changes to a MBQL
   question", "…to a metric", "…to a MBQL transform", "should ignore breaking
   changes to a SQL transform after it was run", "should be able to navigate to
   affected questions or their collection").
2. `9c76f5c6297` "Show upstream archived on inactive dependencies (#73186)" —
   deleted the components (`CheckDependenciesModal` / `Form` / `Title`), the
   hooks, and the three backend endpoints `POST /api/ee/dependencies/
   check-card | check-transform | check-snippet`.

Verified against the current tree, not inferred from commit messages:
`useCheckCardDependencies` and `useCheckTransformDependencies` return **zero
grep hits** across `frontend/src` and `enterprise/frontend/src`, and
`dependencies/api.clj` now defines only `/graph`, `/graph/dependents`,
`/graph/unreferenced`, `/graph/breaking`, `/graph/broken`, `/backfill-status`.

**So these four tests are the negative half of a pair whose positive half is
gone.** They still exercise a real end-to-end path (edit → save → the PUT
actually fires) and are ported faithfully and completely — nothing dropped,
merged, weakened or renamed — but they can no longer discriminate the
proposition their names assert.

### I measured that rather than asserting it — presence probe

Temporary probe (`tests/s4-presence-probe.spec.ts`, deleted after the run)
replicating the **deleted** test: remove the `Expr` expression that "Question
with fields" filters on, i.e. make the change genuinely **breaking**, then save.

```
PROBE: modals=0  affectedListed=0  saveAnywayButtons=0
PROBE: PUT /api/card fired -> 200
```

A breaking change saves **silently and identically** to a non-breaking one. A
second, independent demonstration came from mutation **M3** (below): typing SQL
that references a non-existent table *and* column still fires the PUT and still
passes.

This is the brief's *"distinguish a vacuous assertion from the data cannot
discriminate"* — and it is neither exactly. The assertion is sound and was
meaningful when written; **the product side of the discrimination was removed.**
Per the hard rules I did not strengthen anything to compensate; the analysis is
recorded inline in both files.

---

## 🔴 The async backfill — and the honest answer, which is that it is MOOT here

The brief flagged this as my spec's "entire subject" and primary hazard. I
handled it, then measured it, and the measurement says it does not bite. Both
halves are reported because the second is the useful one.

**Handled:** `waitForBackfillComplete(mb.api)` (the existing poll of
`GET /api/ee/dependencies/backfill-status`, imported read-only from
`support/dependency-graph.ts`) after the fixtures and before the UI in all four
tests — a wait, not an assertion, exactly the `model-to-transform` pattern.

**Measured, both ways, `--repeat-each=3`:**

| variant | result |
|---|---|
| with `waitForBackfillComplete` ×4 | **12/12 passed** (54.2s) |
| with all four calls removed | **12/12 passed** (42.2s) |

**`--repeat-each=3` did NOT expose a backfill race, and there is a mechanism for
why not:** the only consumer of the graph on this spec's paths was the
`check-card` / `check-transform` endpoint, and those endpoints **have been
deleted**. Nothing this spec drives reads the dependency graph any more, so
there is nothing for a stale graph to corrupt.

Note the direction, because it inverts the `model-to-transform` finding: even
when the check *did* exist, a stale graph would have made these tests pass
**more** easily (empty dependents → no confirmation → PUT fires → green), not
fail. On this spec the race was always a *hollow-green* hazard, never a
flake-in-sequence one. So the brief's "fails in sequence, passes in isolation"
signature was never going to appear here, and its absence is not evidence the
wait is working.

**I kept the wait.** It costs ~1s/test and guards nothing measurable today, but
removing it would be an undocumented divergence from the sibling dependency
ports, and it becomes load-bearing the moment the checks are re-enabled.

### Correction owed to the inbox — two notes conflict, and one is wrong

- `support/model-to-transform.ts` / `findings-inbox/model-to-transform.md`:
  backfill-status means "no stale or outdated entities awaiting processing".
- `support/dependency-unreferenced-list.ts:78-79`: "backfill-status only reports
  the **global one-time backfill flag**".

**The first is correct.** `dependencies/api.clj:1047-1052` is
`{:complete (not (deps.dependency-status/has-stale-or-outdated?))}`, and
`dependency_status.clj:100-108` defines that as *"any entities needing
dependency calculation: no status row yet, stale=true, OR version < current"*,
built on the same `instances-for-dependency-calculation` the backfill consumes.
It is genuinely per-entity, not a global flag. The unreferenced-list comment
overstates the weakness (its own second poll may still be justified for the
*unreferenced analysis* specifically, which is a different computation — I did
not verify that half, and am not claiming it is unnecessary).

---

## 🔴 The one real failure was PORT DRIFT — and it is a HARNESS GAP affecting other ports

Run 1: **3 passed, 1 failed.** Test 4 died at fixture time:

```
POST /api/transform -> 403 A table with that name already exists.
```

Diagnosis, traced rather than guessed:

- Both transform tests target the **same** table, `public.base_transform`
  (upstream lines 205 and 258), and test 3 *runs* its transform, materialising
  it in the warehouse.
- The target check is against the **warehouse**, not the app DB:
  `transforms_rest/api/transform.clj:184` → `target-table-exists?` →
  `driver/table-exists?` (`transforms_base/util.clj:464-469`). The app-DB
  restore removes the transform *rows* and leaves the physical table standing.

**Why upstream does not hit this** — `e2e/support/helpers/e2e-setup-helpers.js:44-49`:

```js
export function restore(name = "default") {
  // automatically reset the data db if this is a test that uses a writable db
  if (name.includes("-writable")) {
    resetWritableDb({ type: dbType });   //  ← the missing half
  }
  ...
}
```

`resetWritableDb` (`db_tasks.js:41`) wipes the writable warehouse:
`DROP SCHEMA … CASCADE` for every schema not matching
`/^pg_|information_schema|public/`, plus `DROP TABLE public.<t>` for every table
in `public`.

**`resetWritableDb` is not ported anywhere in `e2e-playwright/` — grep returns
zero hits.** `mb.restore()` does the app-DB half only. That is a genuine harness
gap, not specific to my spec: **any port that calls `mb.restore("*-writable")`
is missing the warehouse reset**, and will silently inherit warehouse debris
from whatever ran before it. Worth a shared fix. I did not make it (shared
module).

**My scoped stand-in, and the trade I knowingly made.** The faithful
`resetWritableDb` would `DROP SCHEMA … CASCADE` on `Schema A`…`Schema Z`,
`Domestic`, `Wild` — the fixtures four **live** sibling slots are using. The
standing rule is "do NOT drop foreign schemas; siblings live". So
`resetSpecTargetTables()` drops exactly the five `public` tables this spec
creates — a strict subset of upstream's behaviour, sufficient to make the two
transform tests independent, and attributable table-by-table. On an isolated CI
container the full `resetWritableDb` is the right port. This is documented at
length at the call site.

After the fix: **4/4, then 12/12 under `--repeat-each=3`.**

---

## Gate mapping + the gate-OFF control

Gate: `test.skip(!process.env.PW_QA_DB_ENABLED, …)` at **describe level**.

Deliberately *not* in the `beforeEach`: this spec has an `afterEach`
(`expectNoBadSnowplowEvents`), and a `test.skip()` inside `beforeEach` still runs
the afterEach, which would dereference a never-installed capture and **fail**
every test in the gate-OFF control instead of skipping it — the #1509 trap. The
describe-level form avoids it, and the control below confirms it did.

| | executed | passed | skipped | failed |
|---|---|---|---|---|
| Gate ON (`PW_QA_DB_ENABLED=1`) | 4 | 4 | 0 | 0 |
| Gate OFF (unset) | 0 | 0 | **4** | 0 |

The difference is exactly the 4 gated tests — the whole file, which matches the
tag propagating from the sole top-level describe. **No afterEach failure in the
gate-OFF run**, confirming the placement.

The upstream `@external` tag is **accurate** here: the `beforeEach` genuinely
restores `postgres-writable`, resets `many_schemas`, and drives `WRITABLE_DB_ID`.
Read from the `beforeEach`, not from the tag. Container gating and token gating
are independent here and **both** are real (see next section) — this is not one
of the seven mis-tagging shapes.

---

## Token predicate — traced on both sides, and the local token HAS it

Upstream calls `H.activateToken("pro-self-hosted")` — note this spec was moved
**off** bleeding-edge by `f7ead911372` "Reduce bleeding-edge token usage
(#72613)", which in the same hunk added `H.updateSetting("transforms-enabled",
true)`.

Predicate: **`:dependencies`**, real on both sides, no `is-hosted?`
short-circuit and no split-by-argument:

- **Backend** — `enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:123`
  `"/dependencies" (premium-handler metabase-enterprise.dependencies.api/routes :dependencies)`.
- **Frontend** — `enterprise/frontend/src/metabase-enterprise/dependencies/index.ts:16`
  `if (hasPremiumFeature("dependencies")) { PLUGIN_DEPENDENCIES.isEnabled = true; … }`;
  OSS default `isEnabled: false` (`frontend/src/metabase/plugins/oss/dependencies.ts:26`).

**Measured on slot 4104 (values never printed):**

| state | `token-features` ON | `dependencies` |
|---|---|---|
| bare backend, before activation | 0 of 59 | `false` |
| after `pro-self-hosted` (PUT → **204**) | **42** of 59 | **`true`** |

**So the local token DOES carry `:dependencies`** — no swap needed, and none was
made. The `MB_PRO_SELF_HOSTED_TOKEN` in `cypress.env.json` is 64 chars and
activates 204, consistent with the retraction of the `.env` trailing-comma
advice (`support/env.ts` reads `cypress.env.json`; `token-features` ON = 0 simply
means nothing activated yet).

**Banked oddity, not a problem here.** Under `pro-self-hosted`,
`transforms-basic` is **`false`** and `writable_connection` is **`false`**, yet
the transform tests pass. Traced: `/api/ee/transforms` gates on
`:transforms-python` (**true**), with an explicit `TODO … use
:transforms-advanced once it exists` at `routes.clj:142`; and
`query-transforms-enabled?` (`premium_features/token_check.clj:715-722`) =
`transforms-enabled` setting **AND** `:transforms-basic`, which is false — but
`any-transforms-enabled?` ORs in the python predicate, which is true. This is
exactly the brief's **split-by-argument** shape, and it happens to fall the
permissive way. The spec's own `updateSetting("transforms-enabled", true)` is
what upstream added to make this work. I did not need to act on it.

Because `dependencies` is genuinely required and `pro-self-hosted` carries it,
there is no unlicensed arm to assert against; the port gates on the same token
upstream uses.

---

## Snowplow — vantage and why

**Browser boundary (`installSnowplowCapture`).** Decided from the call sites, as
instructed:

- question save → `frontend/src/metabase/query_builder/analytics.ts`
  (`trackSchemaEvent("question", …)`, `trackSimpleEvent`)
- transform save → `frontend/src/metabase/transforms/analytics.ts`
  (`trackSimpleEvent`, 9 call sites)
- a grep for backend emission (`analytics/track-event!`) across
  `enterprise/backend/.../transforms/` and `src/metabase/transforms_rest/`
  returns **nothing**.

Every event this spec can emit is **frontend**-emitted, so the collector is not
merely the wrong choice, it is a **blind** one — its preflight omits
`Access-Control-Allow-Credentials`, so the tracker's `credentials:"include"`
POST dies `net::ERR_FAILED`. The one-line shared fix is still **owed and not
applied**. The backend queued-offset / hollow-green hazard is therefore
inapplicable: I assert on no backend events.

**Not dead setup, but weak.** `H.resetSnowplow()` + `H.expectNoBadSnowplowEvents()`
with no positive event assertions is close to the "dead setup" shape, but
`expectNoBadSnowplowEvents` *is* a real assertion, so it is ported rather than
dropped. **Its strength is degraded and I am flagging that rather than hiding
it:** upstream's version asks snowplow-micro which events failed **Iglu
validation**; `SnowplowCapture` pushes `outer.data.data` and discards the schema
URI, so the payloads cannot be re-validated against
`snowplow/iglu-client-embedded` (as `support/iglu-validate.ts` otherwise
allows). It therefore degrades to "no payload failed to decode into a
well-formed self-describing envelope". Strictly weaker. Fixing it needs an edit
to the shared `search-snowplow.ts`, which this port must not make.

---

## Other port decisions worth recording

- **Schema pinned to `"Schema A"` (FINDINGS #85).** Upstream's
  `H.getTableId({ databaseId, name: "Animals" })` matches by name only; this box
  has **three** different `Animals` tables (`Schema A`…`Schema Z` from
  `many_schemas`, plus `Domestic` and `Wild` from a sibling's `multi_schema`), so
  the lookup was nondeterministic. `Schema A` is the schema the spec's own SQL
  transform names literally, so this expresses upstream's intent. All candidates
  have identical columns and nothing here asserts on rows, so it is determinism,
  not a behaviour change. **No foreign schema dropped.**
- **`resyncDatabase` bare `tableName` form → gated `tables: [...]` form** at all
  three call sites; each is immediately followed by a `getTableId` on the table
  in question, which is exactly where the bare form's "gates on nothing" hole
  bites.
- **`cy.wait("@alias")` queue semantics do not bite.** Each alias is awaited
  exactly once per test and no PUT to `/api/card/*` or `/api/transform/*` happens
  during fixture setup (everything is POST; `runTransformAndWaitForSuccess` uses
  `POST /api/transform/:id/run`), so there is no past response to pop. Checked
  before porting, per the rule.
- **`waitForResponse` promises created BEFORE the click** that triggers them
  (rule 2) — load-bearing here, because the PUT *is* the entire assertion.
- **No status assertion added** to either wait. Upstream asserts none;
  strengthening would have been unfaithful and would also have masked the M3
  survivor that turned out to be informative.
- **`findByText` → `getByText(…, { exact: true })`** — Cypress's `findByText` is
  exact and fails on multiple; Playwright's default is substring, and strict mode
  supplies the fail-on-multiple half.
- **`click({force:true})` → `dispatchEvent("click")`** in the presence probe: the
  hover-revealed "Remove step" icon is outside the viewport and Playwright's
  forced click still scroll-checks, unlike Cypress's. Cost me one run; recorded
  because the brief's rule is right and I initially reached for `force`.

## `tsc`

`bunx tsc --noEmit` from `e2e-playwright/` — **clean for my two files**, run
after every edit including after the final restore.

⚠️ **Not mine:** during my mutation runs a pre-existing error appeared in a file
a sibling slot is actively writing —
`support/workspace-instance.ts(190,13): error TS2339: Property 'delete' does not
exist on type 'MetabaseApi'.` I did not touch that file and did not fix it;
flagging so its owner sees it (it implies a wanted `MetabaseApi.delete`).

**Dead imports checked by hand, and the checker was validated.** My checker
strips comment blocks first (so a name merely *mentioned in prose* cannot mask a
dead import) and reported `DEAD=[]` for both files. To sanity-check the checker
itself I injected two known-unused imports (`resetTestTableMultiSchema`,
`ZZZ_NOT_REAL`) into a scratch copy; it reported **both**. So the empty result is
trustworthy, not a silent pass.

---

## Mutation testing

Every mutation inverts an **input**, never an expectation. Each was applied with
an anchored `str.replace` guarded by an `assert count == 1`, then **read back
from disk** before the run was interpreted, then the file was restored from a
slot-prefixed scratch copy and its **md5 re-checked** before the next mutation.

| # | Mutation (input) | Landed? | Killed | Died at | Survived (and why that is correct) |
|---|---|---|---|---|---|
| **M1** | `FIXTURE_SCHEMA` `"Schema A"` → `"Schema ZZZ_NONEXISTENT"` | yes (readback line 81) | **2, 3, 4** | 2 & 4 → `getTableId`, *"Table with name Animals cannot be found"*; 3 → transform run never succeeds (31.5s timeout) | **1** — provably never touches the writable DB (its fixture is Sample-DB `PRODUCTS_ID`) |
| **M2** | Metric aggregation `min` → `max` (notebook then reads "Max of Score"). `"Min of Score"` in the spec is an independent literal, so the data moves and the assertion does not. | yes (readback line 216) | **2** | `spec:178`, waiting for `step-summarize-0-0` `getByText('Min of Score')` | 1, 3, 4 — none reference the metric |
| **M3** | Test 3's typed SQL → `SELECT nope FROM "Schema A"."NoSuchTable"` | yes (readback line 210) | **none** | — | **ALL FOUR — and this is the informative one.** See below. |
| **M4** | Base question's expression key `Expr` → `Renamed` (spec's `getByText("Expr")` is an independent literal) | yes (readback line 172) | **1** | `spec:152`, waiting for `step-expression-0-0` `getByText('Expr')` | 2, 3, 4 — none use that question |
| **M5** | Test 4's Base transform MBQL → **native** (same output table/columns, so the fixture and both dependent transforms still build; only the *editor surface* changes) | yes (`type: "native"` count 1→2) | **4** | `spec:224`, waiting for `step-data-0-0` `getByRole('button', {name:'Sort'})` | 1, 2, 3 |
| **M6** | Test 3's Base transform native → **MBQL** (mirror of M5) | yes (`type: "native"` count 1→0) | **3** | `native-extras.ts:94`, waiting for `[data-testid=native-query-editor] .cm-content` | 1, 2, 4 |

### M5 and M6 were deliberate follow-ups at the tails

After M1–M4, tests **3** and **4** had only *fixture-level* killers (M1), which
die before any UI runs — the same weakness the `model-to-transform` M1 follow-up
identified. M5 and M6 were aimed specifically at their UI tails and both landed
there (the Sort button and the native editor respectively), so **every one of the
four tests now has a killing mutant that dies at a UI step**, not just at setup.

### The M3 survivor is a finding, not a gap — answered with a presence probe

M3 makes the SQL transform reference a table **and** a column that do not exist —
about as breaking as an edit can be — and **all four tests still pass**. Combined
with the presence probe above (breaking question edit → 0 modals, PUT 200), this
is a direct, two-surface demonstration that:

> the surviving assertions **cannot discriminate breaking from non-breaking
> changes**, because the product no longer distinguishes them.

Per the brief's taxonomy this is **"the data cannot discriminate"**, not a
vacuous assertion: `cy.wait("@updateTransform")` was a genuine negative assertion
when written. It is **"not triggered by any failure mode I could induce"** on the
current product. I did **not** strengthen it — doing so would have invented
coverage upstream does not have and would have hidden the real finding.

### Calling out my own bad mutation

**My first attempt at the presence probe was bad** and I discarded it: I reached
for `click({ force: true })` on the hover-revealed "Remove step" icon, which
failed with *"Element is outside of the viewport"*. That is the brief's
documented `force` ≠ Cypress trap; re-done with `dispatchEvent("click")`. No
result was interpreted from the failed attempt.

I also want to flag a mutation I **considered and rejected as bad**: mutating
`FIXTURE_SCHEMA` to another *existing* schema (e.g. `"Schema Q"`). Every
`Animals` table on this box is column-identical, so both branches would have
produced the same result — the "a boolean filter where both branches returned
`1 row`" shape. Using a *non-existent* schema instead is what made M1
discriminating.

**Coverage: 4/4 tests have at least one killing mutant, all at UI steps.**

## Spec restored byte-identical

```
before mutations:  3d84957818d66bf302328539c7513b1c  tests/dependency-checks.spec.ts
                   9237a7e82f4e3dc44f8a06298f9f806e  support/dependency-checks.ts
after  restore:    3d84957818d66bf302328539c7513b1c  tests/dependency-checks.spec.ts
                   9237a7e82f4e3dc44f8a06298f9f806e  support/dependency-checks.ts
```

md5-identical, confirmed, and re-verified green (12/12 under `--repeat-each=3`)
**after** the restore. Scratch copies were slot-prefixed (`s4-spec.orig.ts`,
`s4-support.orig.ts`, `s4-md5.orig.txt`, `s4-deadimports.py`) per the shared-
scratchpad rule. The temporary probe spec (`tests/s4-presence-probe.spec.ts`) was
deleted.

## Backend / container state, before and after

- **Jar verified BY IDENTITY, not `JAR_PATH`:** the process on :4104 reports
  `version.hash = 751c2a9`, matching `version.properties` in
  `target/uberjar/metabase.jar` and the expected `COMMIT-ID 751c2a98`. The run
  log prints `(reused)`, exactly as warned.
- `docker ps`: `postgres-sample` (:5404), `mysql-sample`, `mongo-sample`,
  `maildev`, `webhook-tester` up; `maildev-ssl` and localstack :4566 down —
  neither needed. Ran with `PW_QA_DB_ENABLED=1`.
- **Schemas in `writable_db`: 34 before, 34 after** — I created and dropped
  none. (Note this is up from the 29 in the brief; siblings have added more.
  Not touched.)
- **`public` tables after:** `composite_pk_table, ip_addresses, many_data_types,
  no_pk_table, products, scoreboard_actions` — all sibling/other-spec fixtures,
  left alone.
- **My only leftover was `public.base_transform`**, dropped by hand and
  attributed by grep: the string `base_transform` appears in exactly two files
  in the repo, my source spec and my port. `name_transform`, `score_transform`,
  `transform_1_stage` and `transform_2_stages` never materialise — their
  transforms are created but never run.

## Warnings from the brief that turned out INAPPLICABLE (banked, not dropped)

- **Toast strict-mode / `UndoListing.tsx:203`** — no toast is asserted anywhere.
- **Three placeholder-trap variants / `Locator` laziness / `elementHandle()`** —
  no placeholder or accessible-name-as-state assertion here.
- **`cy.intercept(url, {statusCode:500})` empty body** — no stubbed responses.
- **`should("not.have.value")` / `be.empty` on `<input>` / checkbox
  `have.value","on"` / DOMRect `deep.eq` / `.contains()` innermost-descendant /
  `toHaveCount(0)` vs `count()`/ bare `toBeHidden()`** — this spec contains
  **no** DOM state assertions at all. Its only assertions are the two request
  waits, which is the whole reason the mutation analysis above matters.
- **EMPTY-STATE-renders-pre-fetch** — no list surface is read; the
  `MigrateModelsPage` search-index hazard from `model-to-transform` does not
  apply, as this spec reads no search-backed list.
- **1280×720 vs configured 800** — no failure here was layout-dependent, so
  nothing is attributed to it. (The one viewport-shaped error, the "Remove step"
  icon, was in my discarded probe and was a `force`-click semantics issue.)
- **`blank.sql` corruption / `default` snapshot 30-day fuse** — this spec
  restores `postgres-writable` only, and asserts nothing about "Getting Started".
- **Backend snowplow queued-offset hollow green** — no backend event asserted.
- **`.env` trailing comma (retracted)** — confirmed irrelevant.

## Not verified (scope caveats)

- **No Cypress cross-check was run** (four sibling slots live). So I **cannot**
  say whether upstream passes or fails here, and I make no fidelity claim
  resting on it. Note this matters more than usual for one claim: my reading
  that upstream is saved from the `base_transform` 403 by `resetWritableDb` is
  read from `e2e-setup-helpers.js` + `db_tasks.js` **source**, and reproduced in
  the negative (removing the reset reproduces the 403, adding it fixes it) — but
  not confirmed by an actual upstream run.
- The `9c76f5c6297` half of the removal timeline came from a subagent's
  `git log` archaeology; I independently verified its **conclusions** against the
  current tree (zero grep hits for the hooks, endpoint list in `api.clj`), which
  is what the argument rests on, but I did not re-read that commit myself.
- Whether the check removal is permanent or a temporary disable pending rework
  **cannot be determined from the repo** — `errors-from-proposed-edits`
  (`dependencies/core.clj:107`) is left intact and still wired to Metabot
  (`metabot/tools/dependencies.clj:62`), which is consistent with either reading.
  Recorded as unexplained rather than guessed. **If it is temporary, these four
  tests become meaningful again the moment it is reverted — which is a good
  reason to keep them and the backfill wait.**
- CI runs a *merge commit* jar; verified only against local `751c2a9`.

## Summary (3 lines)

1. 4/4 execute and pass on the CI uberjar (verified by identity, `751c2a9`),
   12/12 under `--repeat-each=3`, gate-OFF control 4 skipped with no afterEach
   fallout; `@external` and `token` are both accurate, the predicate is
   `:dependencies`, real on BE **and** FE, and the local `pro-self-hosted` token
   **does** carry it (42 features, `dependencies: true`).
2. **The behaviour all four tests are named for was deleted from the product**
   (#70819 then #73186, which also deleted the positive half of this very spec);
   a presence probe and mutation M3 both show a genuinely breaking change now
   saves silently, so the tests are faithful but can no longer discriminate —
   recorded, not strengthened.
3. The one real failure was **port drift in the harness, not in my spec**:
   `mb.restore("*-writable")` omits Cypress's `resetWritableDb`, so warehouse
   debris survives the app-DB restore and the second transform test 403s on
   `public.base_transform` — worked around scoped (siblings are live) and flagged
   as a shared fix owed; no shared module edited, spec restored byte-identical.
