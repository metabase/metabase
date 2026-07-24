# native-database-source (slot 5, port 4105)

Source: `e2e/test/scenarios/native/native-database-source.cy.spec.js` (399 lines)
Target: `e2e-playwright/tests/native-database-source.spec.ts`
Support: `e2e-playwright/support/native-database-source.ts` (new; no shared module edited)

Artifact verified BY IDENTITY, not by env var: slot-5 backend PID 60090 is
`java -jar target/uberjar/metabase.jar` listening on 4105, and
`GET /api/session/properties` reports `version.hash = 751c2a9`, matching
`target/uberjar/COMMIT-ID = 751c2a98`.

## Collision checks

- `ls e2e/test/scenarios/native/` — only `native-database-source.cy.spec.js`.
  **No `.ts` sibling**, so the visualizations-charts-reproductions hazard does
  not apply. Nothing of that basename anywhere else under `e2e/`.
- `ls tests/` (389 files) — no existing `native-database-source.spec.ts`.
- Support module name matches the target basename exactly. No deviation.

## Per-describe gate mapping + gate-OFF control

The queue hint was `external(2/4), mongo(2/4), token`. Correct in kind; the
operative fact is that **all four describes need QA containers**, so all four
gate on the single `PW_QA_DB_ENABLED`. Read from each `beforeEach`, not tags:

| describe | upstream tag | `beforeEach` restores | gate |
|---|---|---|---|
| `…native > database source` | `@external` | `postgres-12` | `PW_QA_DB_ENABLED` |
| ↳ nested `permissions` | inherits (grep propagates down) | same | same |
| `mongo as the default database` | `@mongo` | `mongo-5` | `PW_QA_DB_ENABLED` |
| `scenatios > … > mysql` [sic] | `@external` | `mysql-8` | `PW_QA_DB_ENABLED` |
| `scenarios > … > mongo` | `@mongo` | `mongo-5` | `PW_QA_DB_ENABLED` |

Snapshots present locally: `postgres_12.sql`, `mysql_8.sql`, `mongo_5.sql`.
Containers up: `metabase-e2e-postgres-sample` (:5404),
`metabase-e2e-mysql-sample` (:3304), `metabase-e2e-mongo-sample` (:27004).

**Gate-OFF control (the trustworthy signal):**

- `PW_QA_DB_ENABLED=1` → **5 passed, 7 skipped** (the 7 are `test.fixme`, see
  below), 0 failed. Under `--repeat-each=3`: **15 passed, 21 skipped**, twice.
- `PW_QA_DB_ENABLED` unset → **12 skipped, 0 executed, 0 failed.**

The difference is exactly the 12 gated tests, and nothing else moves. No
`afterEach` exists, so the "gate-off reports 48 failed instead of 48 skipped"
trap does not apply here.

`WRITABLE_DB_ID` red herring: **not applicable** — this spec never references it
and never writes to a container. Its `PG_DB_ID = 2` is the read-only
"QA Postgres12" under the `postgres-12` snapshot, verified at runtime (the
picker lists it by that name, and its schema browser shows the 8 QA sample
tables). No #85 debris exposure: no schema/table listing is asserted.

## Did the mongo tests execute? YES

Both `@mongo` describes execute end to end against `mongo-5`. Evidence beyond
"they weren't skipped":

- `restore("mongo-5")` succeeds and the picker renders a `QA Mongo` row
  (captured in the failure call log: `locator resolved to <div … >QA Mongo</div>`).
- On one isolated run, `should persist Mongo database, but not its selected
  table` **passed in full in 2.1s** — i.e. it selected QA Mongo, opened the
  table picker, picked `Reviews`, re-navigated and asserted the database
  persisted while the table did not. So the mongo path is genuinely exercisable
  here; mongo is not the blocker.

They are nevertheless `test.fixme`d, because that single green was a race win —
see the flakiness measurement below.

## Token predicate — traced AND measured

One test calls `H.activateToken("pro-self-hosted")`. Predicate traced to
`enable-advanced-permissions?`, a bare
`(define-premium-feature … :advanced-permissions)`
(`src/metabase/premium_features/settings.clj:202`) — **no `(not is-hosted?)`
escape hatch**, unlike `query-transforms-enabled?`. So unlike
`transforms-basic`, this one should really gate.

Confirmed with a two-arm control against the slot backend (token values never
printed):

| arm | `token-features.advanced_permissions` | features on | `PUT /api/permissions/graph` with `view-data: "blocked"` |
|---|---|---|---|
| after `restore` (no token) | `false` | 0 | **402** — *"The blocked permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."* |
| `pro-self-hosted` activated | `true` | 42 | **200** |

So the `activateToken` is **load-bearing**: without it the test's own setup
hard-fails at the graph write. This is the `writable_connection`/`:library`
shape (a real gate), not the `transforms-basic` shape (a short-circuit).

Incidentally this re-confirms the retracted `.env` advice: `support/env.ts`
reads `cypress.env.json`, the `pro-self-hosted` token is a clean 64 chars, and
activation returns **204** with 42 features on. Nothing to strip.

## 🔴 #64406 picker regression — HIT, and independently re-derived

Yes, and it is the dominant finding. **Third independent derivation**, this
time with a direct DOM+network timeline rather than an inference.

`DataSelector.skipSteps()` auto-selects a database whenever the DATABASE step is
active with none selected. The guard was widened by PR #64406 (`2a6741df9cf`,
"Do not pick unsupported databases automatically in transforms", 2025-12-18 —
an **ancestor of HEAD**):

```diff
-      if (databases && databases.length === 1) {
-        this.onChangeDatabase(databases[0]);
+      const enabledDatabases = databases.filter((db) => !databaseIsDisabled?.(db));
+      if (enabledDatabases.length >= 1) {
+        this.onChangeDatabase(enabledDatabases[0]);
       }
```

The surrounding comment still reads *"for steps where there's a **single**
option"*. `useOnlyAvailableDatabase` defaults to `true`
(`DataSelector.tsx:289`; `DatabaseDataSelector` never overrides it), and
`componentDidMount` → `hydrateActiveStep()` → `switchToStep(DATABASE_STEP)` →
`skipSteps()` runs on mount. So with **any** number of enabled databases the
first one is chosen for the user. The PR's own e2e change touched only
`data-studio/transforms.cy.spec.ts`; this spec was not updated.

**Measured on the CI jar** with a throwaway probe that only navigated and
polled (no clicking), then deleted:

```
SETTING AFTER RESTORE: ""     <- last-used-native-database-id is EMPTY
+159ms selected=[]                popovers=1 rows=["QA Postgres12","Sample Database"] topBar="Select a database"
+280ms selected=["QA Postgres12"] popovers=0 rows=[]                                  topBar="QA Postgres12"
... stable for the remaining 6s
PUTs to last-used-native-database-id: ["… 204"]
```

Two things that matter:

1. **The alternative explanation is eliminated.** `last-used-native-database-id`
   is `""` immediately after `restore("postgres-12")`, so this is not a dirty
   snapshot preselecting a database through the feature under test. The FE
   picks one and then *writes* the setting.
2. The window in which `assertNoDatabaseSelected()` can observe the true state
   is **~150ms wide**. Upstream's assertion is therefore not just failing — on
   this build it is *racing*, and would be a hollow green whenever it won.

### Consequence for the port: 7 `test.fixme`s

Exactly the tests whose subject is "no database selected → the user picks one":

| test | failure shape |
|---|---|
| smoketest: persisting last used database… | picker row detaches mid-click |
| deleting previously persisted database… | picker row detaches mid-click |
| persisting a database source between native models and questions | picker row detaches mid-click |
| selecting a database … for model actions should not persist | `assertNoDatabaseSelected` → `selected-database` count 1, expected 0 |
| users that lose permissions to the last used database… | picker row detaches mid-click |
| should persist Mongo database, but not its selected table | picker row detaches mid-click |
| can save a native MongoDB query | detaches in the `beforeEach` |

Both shapes are the same cause: the auto-selection closes the popover under the
resolved row. Quantified by temporarily lifting two fixmes and running
`--repeat-each=5`: **0/5 and 0/5**. The one earlier green was a genuine race
win, which is precisely why they cannot be left un-fixme'd.

The 5 tests that pass are the ones the regression cannot reach: two where only
**one** database is choosable for the user (so old and new code behave alike and
the test *expects* the auto-selection), one that pre-sets the setting so a
database is already selected on mount, and the two mysql tests which arrive via
a hash URL with the database already in the card.

### ⚠️ Scope of the claim

**The Cypress fidelity cross-check was NOT run** — standing rule, sibling slots
live. So whether the upstream spec fails identically is **unknown and not
claimed**. What is established: the auto-selection is real, measured at the DOM
and network layer on the CI uberjar (not a `--hot` bundle, so the source-mode
false-failure class is excluded), traced to a named source diff, and not
explained by a persisted setting. The port's own soundness is evidenced by the
5 green tests and by 8/8 killed mutants.

## Vacuous / weak upstream assertions ported verbatim

- `cy.get("@persistDatabase").should("be.null")` (×2). An unfired intercept
  alias yields `null` and the assertion passes on the **first** attempt — it
  does not usefully retry, so it is a one-shot check upstream too. Ported at
  the same strength (`recorder.count === 0`) with the weakness noted inline
  rather than strengthened. The mutant below proves it is not vacuous.
- `H.NativeEditor.type(text, { parseSpecialCharSequences: false })` — the option
  is **dead**: `codeMirrorHelpers.type`'s `TypeOptions` is only
  `{ delay, focus, allowFastSet }`; `parseSpecialCharSequences` is a `cy.type`
  option this helper never reads. Recorded, not "fixed".
- Upstream typo `"scenatios > question > native > mysql"` kept verbatim.

## Brief warnings that turned out INAPPLICABLE here (banked, not forced)

- **75ms `@codemirror/autocomplete` interactionDelay / `{Enter}`-is-a-completion-accept.**
  This spec never presses Enter or Tab into a completion list, so there is no
  accept to be refused into a newline. No `toPass` re-nudge needed.
- **`H.NativeEditor.type`'s string parser swallowing characters.** Traced both
  strings through it. `"…{{id}}]];"` → `{{}`,`{{}`,`"id}}]];"` (the `{{}` case
  types a literal `{`); `'[ { $count: "Total" } ]'` → the middle part hits the
  "unknown escape sequence" branch which types `{` then `part.slice(1)`, i.e.
  reconstitutes it in full. **Net keystrokes equal the source string in both
  cases** — nothing swallowed. A literal `keyboard.type` is faithful, and
  CodeMirror's close-bracket type-over lands the same buffer.
- **Virtualized picker holding ~20 rows / raw schema names / #85 debris.** This
  spec's pickers hold 2–3 databases and it never asserts on schema names.
- **Toast strict-mode (`UndoListing` MockGroup).** Only one save-toast
  assertion, inside the shared `saveQuestion`, and only one save per test.
- **Placeholder focus-drop.** Does apply, and is handled: the mysql field-filter
  input goes through `clickAndType` (support/native.ts), which resolves and
  clicks once and then types at `document.activeElement`.
- **`openTable` dropping its `database` argument.** Not used by this spec.

## Mutation testing — 8 mutants, 8 killed

Every mutation was an anchored replace with a `count == 1` assertion **and** a
read-back before the run; the spec was restored from a pristine copy between
groups and verified byte-identical by md5 each time.

| # | test | mutation (INPUT, never the expectation) | outcome | died at |
|---|---|---|---|---|
| M2 | mysql field filter | `SELECT TOTAL, CATEGORY` → `SELECT TOTAL` | killed | `:458` `Widget` attached (HEAD) |
| M1a | mysql field filter | `…= {{id}}]]` → `…= {{id}} OR 1=1]]` (filter becomes a tautology) | killed | `:465` `Widget` `toHaveCount(0)` — got **5** (TAIL) |
| M1b | mysql field filter | typed filter value `"1"` → `"999999"` (no such product) | killed | `:467` `Gizmo` attached (LAST assertion) |
| M3 | mysql save | `SELECT * FROM ORDERS` → `… FROM PRODUCTS` | killed | `:479` `SUBTOTAL` visible (HEAD) |
| M4 | mysql save | `SELECT * FROM ORDERS` → `… ORDER BY ID DESC` (same columns, different first page) | killed | `:482` `37.65` attached (TAIL; `SUBTOTAL` correctly survived) |
| M5 | should not update the setting… | reselect a **different** database instead of the same one | killed | `:275` `persistDatabase.count` — 1, expected 0 |
| M6 | nosql / #39053 | additionally grant the group query rights on the Sample DB, so a second database is choosable | killed | `:358` `popover` `toHaveCount(0)` — got 1 |
| M7 | permissions / nodata | drop the permission grant on the newly added `New Database` | killed | `:334` popover contains `QA Postgres12` (TAIL) |

Notes on aim and honesty:

- M2/M3 kill at the **first** assertion, so M1a, M1b and M4 were added
  specifically to reach the tails. After those, every assertion in both mysql
  tests is proven load-bearing.
- **M5 is the important one**: it proves the `cy.get("@alias").should("be.null")`
  port (a passive response counter) genuinely detects a PUT. Without it that
  assertion would be indistinguishable from an assertion that cannot fail.
- **M7 is a partially-blunt mutation and I am calling it out.** It kills, but at
  `:334` (`popover contains "QA Postgres12"`) rather than at `:335`
  (`contains "New Database"`), because with only one database available the
  trigger renders as a non-interactive `SingleDatabaseName` and no popover opens
  at all. So `:335` specifically is reached-but-unproven by this mutant. A
  sharper probe would rename the added database; not run.
- The 7 fixme'd tests were **not** mutation-tested — a fixme'd test cannot be
  killed. Their subject is instead covered by the direct product measurement
  above.
- Mutating shared constants (`postgresName`, `mongoName`, `PG_DB_ID`) was
  deliberately **avoided**: assertions echo those constants, so they would move
  together and prove nothing.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/` — clean, both before and after the
mutation cycle. Dead-import check done by hand (every imported identifier
occurs ≥2× in the file); the checker itself was sanity-checked by confirming
`Page`, which is used exactly once outside its import, reports 2 rather than 1.

## Fixmes / owed

- 7 `test.fixme`s, all attributable to #64406 (above). They should un-fixme in
  one move once `skipSteps` is restored to `=== 1` (or the callers stop
  defaulting `useOnlyAvailableDatabase` to `true`).
- **`PORTED.txt` was NOT updated** — slot brief forbids touching it. The line to
  add when someone does: `native/native-database-source.cy.spec.js`.
- Owed follow-up for whoever quiesces the box: run the Cypress original for this
  spec to settle the fidelity question, and confirm whether upstream CI is
  currently red on it (if it is green there, the difference is worth chasing —
  it would mean CI's merge-commit jar differs, which the PORTING notes say is
  possible on a long-lived branch).

## 3-line summary

Ported 12 tests; 5 pass (15/15 under `--repeat-each=3`), 7 are `test.fixme`d on a
live product regression, and the gate-OFF control skips exactly 12/12.
PR #64406 widened `DataSelector.skipSteps` from `length === 1` to `>= 1`, so the
native database picker auto-selects and persists a database ~150ms after mount —
measured directly on the CI jar, with a dirty-snapshot explanation ruled out.
The `pro-self-hosted` token is a real gate here (402 vs 200 on a blocked-perms
graph write), and all 8 mutants died at their intended assertions.
