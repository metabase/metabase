# data-studio-single-table

Port of `e2e/test/scenarios/data-studio/data-model/data-studio-single-table.cy.spec.ts`
(272 lines, 5 tests, 2 describes) →
`tests/data-studio-single-table.spec.ts` + `support/data-studio-single-table.ts`.
Slot 2 (:4102). **5/5 green; 15/15 under `--repeat-each=3`; `tsc --noEmit` clean.**

## Summary (3 lines)

1. All 5 tests execute and pass; `@external` is accurate on all 5 and the
   gate-OFF control skips exactly those 5.
2. The headline finding is **mutation M4**: the four "navigate away and back"
   persistence assertions were **vacuous** — asserting the *wrong* value passed —
   because the selects transiently render the previously-selected table's values.
   Fixed with a declared `query_metadata` anchor; the mutant now dies 3/3.
3. Two upstream/harness gaps recorded, not papered over: the spec makes a live
   snowplow assertion with **no `@snowplow` tag**, and the never-reset writable
   warehouse 403s the transform test until its target table is dropped.

## Collision checks

- `grep -rl "data-studio-single-table" tests/ support/` → **no match** before the
  port. No port of this source existed; **nothing was overwritten**.
- The named-at-risk neighbours were read first and are ports of DIFFERENT
  sources: `data-studio-bulk-table`, `datamodel-data-studio`,
  `data-model-shared-1..4`, plus `data-studio-tables` / `-library` / `-metrics` /
  `-snippets`. Confirmed by reading their headers, not by filename.
- **Support module is the conventional `support/data-studio-single-table.ts`.
  NO deviation.** Nothing else imports it → no dangling-import risk.
- Scratch files were prefixed `s2-single-table-` throughout; all deleted.
- No shared support module was edited. **`support/data-model.ts` was not
  touched, and its owed fix was NOT made.**

## Gate mapping, per describe, with the gate-OFF control

| describe | tests | tag placement | accurate? |
|---|---|---|---|
| `Table editing` (direct `it`s) | 4 | `@external` on each `it` | yes |
| ↳ `with remote sync enabled` | 1 | `@external` on the `it` | yes |

Read from the `beforeEach` and each `it`, not a file scan. The tag is accurate
for all 5: three restore `mysql-8` (QA MySQL8), one `postgres-12` (QA
Postgres12), one `postgres-writable` + writes the `many_schemas` fixture.

Gated on the deliberate **`PW_QA_DB_ENABLED`**, never the bare `QA_DB_ENABLED`
(which leaks truthy from `cypress.env.json`).

- **Gate-ON:** `5 passed`, 0 skipped.
- **Gate-OFF (`PW_QA_DB_ENABLED` unset):** `5 skipped`, 0 executed.

The difference is exactly the 5 tagged tests — nothing silently non-executing.

Per the brief, the remote-sync describe owns an `afterEach` (repo teardown), so
the gate is applied at **describe level** (top-level `test.skip`), never inside a
test body.

### 🔴 Tag drift: snowplow used but untagged

The queue lists a `snowplow` gate. **No test in this file carries an
`@snowplow` tag** — the only tags present are `@external`. Yet the file calls
`H.resetSnowplow()` in `beforeEach` **and** makes a real
`H.expectUnstructuredSnowplowEvent` assertion in the publish test.

This is the **opposite** of the brief's "dead setup" case: the snowplow setup is
live and load-bearing, but untagged upstream. I checked the mechanism (read every
`it`'s options object) rather than inferring from a grep. Ported faithfully — the
assertion is kept and provably executes (see M3). The missing upstream tag is
recorded here, not fixed.

## Token predicate — TWO predicates, traced, two-arm control

`H.activateToken("pro-self-hosted")` appears in the `beforeEach` **and again in
every test body**. That repetition is load-bearing, not redundant: each test's
`H.restore(...)` wipes the token.

Unlike the sibling bulk-table port (which found only `:library`), this spec
depends on **two distinct premium predicates**:

| predicate | gates | evidence |
|---|---|---|
| **`:library`** | publish/unpublish | BE: `api_routes/routes.clj` registers `"/data-studio"` under `premium-handler … :library` (= `+require-premium-feature`); `enable-library?` is a plain `define-premium-feature` with the default getter — no short-circuit. FE: `hasPremiumFeature("library")` → `PLUGIN_LIBRARY.isEnabled` (`data-studio/library/index.ts:23`); `DataStudioLayout.tsx:100` uses `useHasTokenFeature("library")`. |
| **`:dependencies`** | the Dependency-graph link, the graph page, and the Dependencies/Dependents rows | FE: `metabase-enterprise/dependencies/index.ts:15` `hasPremiumFeature("dependencies")` mounts `data-testid="dependency-graph"` (`DependencyGraph.tsx:130`). |

**Two-arm control (run, not reasoned):**

| arm | Publish button | Dep-graph link | Dependencies row | nav Library item | `POST publish-tables` |
|---|---|---|---|---|---|
| **A — without token** | 0 | 0 | 0 | **1** | **402** |
| **B — with `pro-self-hosted`** | 1 | 1 | 1 | 1 | 400 |

Arm B's 400 (not 402) is the point: the premium gate no longer fires and the
route is reached — the 400 is my probe's deliberately incomplete body. So this is
the **hard-gate** outcome, on both predicates, confirmed at both the FE surface
and the BE status code.

**One nuance worth banking:** the Library **nav item renders in BOTH arms**
(`navLibraryItem=1` either way) — without the token it is merely marked
`isGated` (`DataStudioLayout.tsx:136`). A test that only asserted the nav item's
*presence* would therefore be a false negative for the token. This spec clicks it
and then asserts on library contents, which does require the feature.

**Token restoration:** I only ever activated **`pro-self-hosted`** — the same
token the spec itself uses. I did **not** activate `bleeding-edge` or any other
token, so there was no foreign token to restore. Final slot state is
`pro-self-hosted` active, exactly what the spec's own `beforeEach` sets. **No
token value was printed** anywhere (only feature counts/booleans: 42 on,
`library=true`, `dependencies=true`).

## Snowplow vantage: the BROWSER BOUNDARY, and why

`installSnowplowCapture` (`support/search-snowplow.ts`), **not** the per-slot
collector.

**Decided from the call site**, per the brief: the single asserted event,
`data_studio_table_published`, is emitted by an FE `trackSimpleEvent` at
`frontend/src/metabase/common/data-studio/analytics.ts:13`. It is a **frontend**
event, therefore:

- the per-slot collector is **blind** to it (its preflight omits
  `Access-Control-Allow-Credentials`, so the `credentials:"include"` POST dies
  `net::ERR_FAILED`) — it would never see the event at all; and
- the collector's **persistent queue offset** would let the assertion pass on a
  predecessor test's event.

Neither hazard applies at the boundary: the capture is per-page, fulfils the
tracker POST inside the browser, and `capture.reset()` in `beforeEach` is the
faithful map of `H.resetSnowplow()`.

**Proven live, not assumed.** Mutation M3's failure message dumped the captured
buffer:
`[{"event":"data_studio_library_created","target_id":17},{"event":"data_studio_table_published"}]`
— the real event *is* being captured. That rules out the no-op-stub / dead-setup
failure mode by evidence rather than inspection.

## 🔴 Finding: the four persistence assertions were VACUOUS (mutation M4)

The most important result of this port.

**Symptom.** M4 changed the last assertion of `should allow to edit attributes`
from `selectHasValue("Source", "Ingested")` to the **wrong** value
`"Unspecified"` (Products' value). It **PASSED** — as did the unmutated
`"Ingested"`. Both values passing means the assertion could not discriminate.

**Diagnosis, measured rather than guessed.** My first hypothesis — that the
assertion caught the previous table's render and that anchoring on the name input
would fix it — was **wrong**: with `toHaveValue("Renamed Orders")` on the name
input inserted first, the mutant *still* survived. I then dumped all four inputs
at that point and got `["Bobby Tables","Internal","Person","Ingested"]` — the
settled values are correct, and *merely adding the dump's round-trips* was enough
to kill the mutant.

So the mechanism is the brief's **"an EMPTY-STATE renders PRE-FETCH is not a
valid anchor"** family: clicking a table re-renders the section before its
`query_metadata` lands, so the selects transiently show the previously-selected
table's values. The name input flips to the new value **before** the selects
settle, which is why it is not a sufficient anchor.

**This is not port drift** — I ruled that out first, per the standing prior.
Cypress's `should("have.value", …)` retries identically, so **upstream carries
the same race**: a wrong expected value would pass there too. (Per the standing
rule I ran **no** Cypress cross-check, so I cannot claim upstream *does* fail —
only that its assertion has the same structure and the same retry semantics.)

**Disposition — DECLARED STRENGTHENING (an added wait; no assertion changed).**
A `waitForTableMetadata` registered before the re-click (rule 2) and awaited
after, plus the name-input anchor because `waitForResponse` resolves a tick
before React commits. The four `selectHasValue` assertions are **unchanged and
verbatim**. With the anchor in place M4 dies **3/3, deterministically**
(`Expected: "Unspecified" / Received: "Ingested"`), where before it passed 2/2.

## 🔴 Finding: the writable warehouse 403s the transform test

First run: `POST /api/transform -> 403 A table with that name already exists.`

**Not port drift.** Presence probe against the container:
`Schema A.transform_table` was **already present**, with **38** non-system
schemas. The failing run did not create it — the 403 is a pre-check, so the
transform never ran. It is prior debris from another spec/session.

Root cause is the documented harness gap: Cypress's `H.restore("*-writable")`
also calls `resetWritableDb` (`e2e/support/db_tasks.js:41`), which drops the
warehouse; our `mb.restore("postgres-writable")` resets only the **app DB**, and
`resetWritableDb` is **not ported anywhere**.

**Disposition:** a narrowly-scoped `dropTransformTargetTable(schema, table)`
that drops only the ONE table this spec targets, run before the resync so sync
cannot register the stale table. Deliberately **not** a warehouse-wide reset —
sibling slots are live, and the brief's rule is to not drop foreign schemas. The
`Schema A`…`Schema Z` schemas are left in place. This has no upstream
counterpart and is declared inline in both files.

## Mutation results

Verifier sanity-checked **before** use: the runner had already produced a genuine
red (the 403 above), and every mutation below was applied with an anchored
replace verified at **`count == 1`** and **read back from disk** before running.

| # | mutation | outcome | died where |
|---|---|---|---|
| M1 | `View count` expected `viewCount` → `viewCount + 1` | **killed** | spec:187, the intended assertion (`Expected "1" / Received "0"`) |
| M2 | final `allLibraryTableItems` `toHaveCount(0)` → `(1)` | **killed** | spec:254, the tail (`Received: 0`) |
| M3 | snowplow event name → `…_MUTANT` | **killed** | spec:236; failure dumped the real captured events |
| M4 | `selectHasValue("Source","Ingested")` → `"Unspecified"` | **SURVIVED** → fixed → **killed 3/3** | spec:344, after the anchor |
| M5 | `selectIsDisabled("Source")` → `"Owner"` | **killed** | support:55 (attribute absent on Owner, present on Source) |
| M6 | remove the click from `closeUndoToast` | **SURVIVED** (my bad mutation) → gate bounded → **killed** | support:138 |

**Where they died / tails.** M1 aims at the head of test 1, M2/M3 at the tail of
test 2, M4 at the tail of test 3, M5 at the tail of test 4. M2's kill is
non-vacuous by a built-in presence probe: earlier in the *same* test
`tableItem("Orders")` is visible via the same `library-page`/`table-name`
locator, so `Received: 0` proves the library genuinely emptied rather than the
locator never matching.

**M5 is why the brief's "a getter written before its first use is unverified"
rule earned its keep.** `selectIsDisabled` is a helper I wrote fresh; M5 shows it
discriminates (Owner: attribute absent → fail; Source: present → pass), i.e. it
faithfully reproduces Cypress's `should("have.attr","disabled")` presence
semantics rather than the weaker `toBeDisabled()`.

**Calling out my own bad mutation (M6).** Removing the click from
`closeUndoToast` did **not** fail, because undo toasts **auto-expire (~4-5s)**, so
an unbounded `toHaveCount(0)` is satisfied by the timer rather than the click.
The tell was runtime: **19.4s vs the usual 6.5s** — the test was waiting out three
auto-dismiss timers. Rather than report a survivor, I fixed the helper: the
count-0 gate is now bounded at **3s** (~10x the ~300ms exit transition, far below
auto-expiry). Baseline stays green at 6.4s, and M6 then dies at support:138. So
the gate now proves the *click* landed, not merely that the toast went away.

### Restoration

Both files were restored and a residue scan run over every mutant marker
(`MUTANT`, `DIAGNOSTIC`, `[DIAG]`, `+ 1`, `"Owner"`, `toHaveCount(1)`,
`"Source", "Unspecified"`): **no residue**; the only `"Source", "Unspecified"`
hit is the legitimate `setSelectValue(page,"Source","Unspecified","Ingested")`
at spec:308.

**Honest note on md5:** the final files are **not** byte-identical to the
pre-mutation baseline, and deliberately so — M4 and M6 each exposed a real
defect, so the spec gained the `query_metadata` anchor and the helper gained its
bounded timeout. Both are declared above and inline. Everything else is
byte-restored. Baseline → final:

- `tests/…spec.ts`: `e4be159edc9d495b5f1e16ab49c93d1c` → `d9577d0f5cd40f1fc72a427a6ce77ce4`
- `support/…ts`: `c9f11f55de30721431bf8e8bec899d7f` → `5ac88047dacdfb24d90424f5903a7221`

## Brief hazards checked and found INAPPLICABLE

Reported as inapplicable because I checked the mechanism, not because I didn't
see them.

- **`visitDataModel`'s never-firing wait gate.** Inapplicable: I read the
  `RESPONSE_PREDICATES`/`defaultWaits` table in `support/data-model.ts`. The
  `schema` wait is only registered when a `databaseId` is supplied; this spec
  uses the **bare** `visitDataStudio()` everywhere, which waits on `databases`
  only. No `schemaId` navigation was needed.
- **Shared `verifyAndCloseToast` strict-mode violation.** Real and avoided — but
  by a **local** `closeUndoToast`, not by editing `support/data-model.ts`. I
  confirmed the mechanism at `frontend/src/metabase/common/components/UndoListing.tsx:203`
  (`const Group = "Cypress" in window ? MockGroup : TransitionGroup`) — note the
  path is `common/components/UndoListing.tsx`, not `common/components/UndoListing/UndoListing.tsx`
  as the brief has it; the line number 203 is correct. The fix is a **wait**
  (`toHaveCount(1)` → click → bounded `toHaveCount(0)`), **never `.first()`**.
- **`getByText(..., {exact:true})` vs testing-library's direct-child-text
  semantics.** Inapplicable: this port uses **no** `getByText(…, {exact:true})`.
  Label lookups go through `getByLabel`, which computes an accessible name the
  same way in both frameworks; the two `modal().getByText(...)` calls are
  substring matches, matching `findByText`'s behaviour on unique modal copy.
- **`getTable("Animals")` ambiguity (6 matches).** Inapplicable to this spec: it
  never selects `Animals` in the picker. `Animals` is used only as a transform
  *source table* resolved via the API, where any match is equivalent.
- **The `WRITABLE_DB_ID` red herring.** Not a red herring here — under
  `postgres-writable`, database 2 genuinely is the writable container.
- **1280×720 harness width.** No layout-dependent assertion in this spec; the
  upstream file sets no `viewportWidth`. Nothing attributable.
- **`cy.intercept(url,{statusCode:500})` empty body / `cy.wait` queue popping.**
  No stubbed intercepts and no retroactive-queue waits in this spec.
- **`resyncDatabase` bare form.** Heeded: passed `tables: ["Animals"]`, never the
  bare `{ dbId }`. (Upstream passes the equivalent `tableName`.)

## Fixmes / gaps recorded

1. **Owed, not applied:** `resetWritableDb` is unported, so the writable
   warehouse is never reset. My per-table drop is a workaround, not the fix.
2. **Owed, not applied:** the shared `support/data-model.ts verifyAndCloseToast`
   strict-mode bug — left alone by instruction.
3. **Upstream gap:** the missing `@snowplow` tag (above).
4. **Upstream gap:** the pre-fetch race behind M4 exists in the Cypress source
   too; only this port is anchored.
5. **Cosmetic:** three exports in my support module (`selectDropdown`,
   `clickSelectOption`, `undoToast`) are consumed only internally. Left exported
   to mirror the sibling bulk-table module's shape and the upstream `H.*` names.
6. **No Cypress cross-check was run** (standing rule) — I cannot say whether
   upstream also fails on any of the above.

## Verification

- `5 passed` (gate-ON); `5 skipped` (gate-OFF).
- `15 passed` under `--repeat-each=3`.
- `bunx tsc --noEmit`: **0 errors** referencing these files.
- **Dead-import hand-audit** (tsc is provably silent on these): all 31 imported
  symbols in the spec were grepped for a use site; **none dead**.
- **Jar verified BY IDENTITY:** `ps` shows `java -jar …/target/uberjar/metabase.jar`,
  and the jar's `version.properties` reads `hash=751c2a9`, matching the required
  `COMMIT-ID 751c2a98`.

## Shared state: container before/after

| | before | after |
|---|---|---|
| non-system schemas | 38 | 39 |
| `Schema A.transform_table` | present (debris) | present (recreated by the test) |
| tables named `Animals` | — | 28 |

Schema list after: 26 × `Schema A–Z`, `Domestic`, `Wild`, `empty_schema`,
`public`, and **9 × `metabase_cache_*`**.

**Honest attribution:** my fixture only issues `CREATE SCHEMA IF NOT EXISTS` for
`Schema A`–`Schema Z`, all of which pre-existed, so **this port provably created
no new named schema**. The +1 is a `metabase_cache_*` (model-persistence cache,
hash-keyed per app-DB identity). I **cannot** attribute it with certainty to my
run versus one of the four sibling slots writing to the same container
concurrently. Recording it as unexplained rather than inventing a mechanism.

No shared support module was modified. No scratch files remain. Nothing
committed; `PORTED.txt`, `QUEUE.md` and `playwright.config.ts` untouched.
