# transforms

Port of `e2e/test/scenarios/data-studio/transforms/transforms.cy.spec.ts`
(4,394 lines — the largest spec in the corpus) →
`tests/transforms.spec.ts` + `support/transforms.ts` (new module).

## 3-line summary

**PARTIAL port, fully verified: the first top-level describe through `queries`
(upstream lines 35–1716) is ported and green — 42 executed / 6 gate-skipped,
gate-OFF control 0 executed / 48 skipped, `--repeat-each=2` 84 passed, tsc clean.**
This tier really executes (real writable postgres, real transform runs writing
real tables), and three mutations were killed.
**The dominant finding is not about the app: the shared `writable_db` is
contaminated across slots, and it produces failures that read exactly like
product bugs — including one place where it makes an upstream assertion vacuous.**

## How much is done, and the boundary for a follow-up

Ported and green (upstream lines 35–1716), all inside
`describe("scenarios > admin > transforms")`:

| describe | upstream lines | tests | executed | skipped |
|---|---|---|---|---|
| creation | 59–713 | 17 | 15 | 1 python, 1 env-fixme |
| name | 715–728 | 1 | 1 | — |
| ownership | 730–771 | 1 | 1 | — |
| tags | 773–903 | 5 | 5 | — |
| incremental settings inline editing | 905–1174 | 7 | 7 | — |
| targets | 1176–1403 | 6 | 6 | — |
| metadata | 1405–1479 | 3 | 3 | — |
| queries | 1481–1715 | 8 | 4 | 4 python |
| **total** | | **48** | **42** | **6** |

**NOT ported — clean boundary at upstream line 1717.** A follow-up starts at
`describe("runs")` and continues to EOF:

- Remaining describes inside the first top-level describe: `runs` (1717),
  `deletion` (1758), `disconnected database` (1827), `cancelation` (1887),
  `dependencies` (1993), `python > common library` (2038, all `@python`),
  `collections` (2257), `revision history` (2651), `read-only remote sync` (2729).
- Later top-level describes: `databases without :schemas` (2847), `jobs` (2895),
  `runs` (3311), the `@python` script test-run describe (3742),
  the no-supported-databases describe (3853), and the three permissions
  describes (4190, 4264, 4329).

`support/transforms.ts` already carries **the whole spec-local getter surface**
(upstream lines 3878–4188), not just the parts used so far — jobs list/editor,
run tables, all six run-filter widgets, the schedule/cron inputs,
`getRowNames`, `checkSortingOrder`, `createPythonLibrary`,
`runPythonScriptAndWaitForSuccess`, `verifyDisconnectedDatabaseBanner`,
`createTransformCollection`, the python fixtures. A follow-up should be able to
write tests against it without adding helpers.

## Executed vs gate-skipped (the FINDINGS #49 check)

| run | result |
|---|---|
| `PW_QA_DB_ENABLED=1` (gate ON) | **42 passed, 6 skipped** |
| gate OFF (control) | **0 passed, 48 skipped** |
| gate ON, `--repeat-each=2` | **84 passed, 12 skipped, 0 failed** |

The gate-off control is what makes the gate-on number mean something. It also
**found a real bug in my own harness**: with the gate off the `afterEach`
(`expectNoBadSnowplowEvents`) still runs while `beforeEach` never installed the
capture — 48 tests *failed* rather than skipped. Guarded. Worth generalising:
**any QA-DB port with an `afterEach` touching beforeEach-created state needs the
gate-off run, or CI's `-@external` leg goes red on a spec that is supposed to
skip.**

### Evidence the QA-DB path actually ran (not assumed)

- `GET /api/database` → `[[1,"Sample Database"],[2,"Writable Postgres12"]]`.
- Transforms created via `POST /api/transform` and run to `succeeded` through
  the run API, and separately through the UI run button ("Ran successfully").
- The tables are physically there — read out of the container, not inferred:
  `psql writable_db` shows `Schema A.transform_table`, `custom_schema`,
  `Domestic.sql_transformtransform_table`, … appearing as tests run.
- The `403 A table with that name already exists.` failures below are only
  possible if the writes landed in the real postgres.
- Backend confirmed jar-mode: `/api/session/properties` → `version.hash
  751c2a9`, `/` serves `app-main.2968ba045c7df524.js` (hashed static assets).

## Python tier: NOT executable here, and it is not the 402 the brief expected

11 upstream tests are `@python`-tagged (5 of them inside the ported range).
They call `H.setPythonRunnerSettings()`, which points the instance at a
**python-runner on `:5001`** and a **localstack S3 on `:4566`** — neither is
running, and neither is in the container set. They are gated on
`PW_PYTHON_RUNNER_ENABLED` with the bodies left unwritten, because PORTING
forbids shipping a body that cannot be verified.

**Correction to the brief:** it warned that Python transforms hit
`402 Premium features required` on `pro-self-hosted` (measured by
transforms-codegen). I did **not** reproduce a 402 — I never got far enough to
try, because the blocker is the missing runner containers, and I did not probe
the 402 separately. Recording this as *unverified either way* rather than
repeating it: the transforms-codegen observation may still be right, but this
port is not evidence for it.

## THE BIG ONE: `writable_db` contamination across slots

This matches the structural problem the coordinator flagged mid-task, and I hit
it **four separate times**, each time looking like something else. Reporting in
detail because the coordinator is collecting evidence.

### 1. Physical target-table residue → `403 A table with that name already exists.`

The "already exists" guard is a **physical** check —
`transforms_rest/api/transform.clj:183` → `transforms_base.util/target-table-exists?`
→ `driver/table-exists?`, i.e. describe-table against the real postgres. The
app-DB snapshot restore cannot touch the warehouse, and upstream's
`resetTestTable("many_schemas")` only drops/recreates the 26 `Animals` tables.
So every transform run leaves `Schema A.transform_table` behind and the next
test targeting it 403s.

**5 of the 7 initial failures were this one cause** — two of them surfacing as a
UI modal error rather than an API status, which reads as a product bug.

Fix: `resetTransformTargetTables()` in `support/transforms.ts`, deliberately
narrow (only `%transform%` tables, only the schemas this spec writes to, plus
`DROP SCHEMA custom_schema`) so it cannot disturb the other QA-DB specs sharing
the container. It changes no assertion; it restores the clean-warehouse
precondition upstream assumes because CI gives each job a fresh container.

### 2. A foreign schema changes a default → looks exactly like a product bug

The save-transform modal defaults its Schema field to the **first schema of the
database**, not to the source table's schema. Measured directly: with the source
picked as `"Schema A"."Animals"` (confirmed via the compiled SQL preview), the
modal's Schema input reads **`Domestic`**. `Domestic` is embedding-hub /
interactive-embedding's `multi_schema` fixture, and `D` sorts before `S`.

So upstream's `getSchemaLink().should("have.text", "Schema A")` cannot pass while
that schema exists. I had a fix (drop `Domestic`/`Wild`) and **reverted it** on
the coordinator's instruction not to drop foreign schemas with three QA-DB
agents live. The test is `test.fixme`'d with the measurement — it is
environment-blocked, not port drift and not a product bug.

**This is one test that a per-slot writable DB would recover for free.**

### 3. `Domestic.Animals` exists and has ZERO ROWS — and it makes an upstream assertion VACUOUS

Verified by querying the container:

```
 table_schema | table_name          Domestic.Animals row count: 0
 Domestic     | Animals
 Schema A..Z  | Animals   (26)
 Wild         | Animals
```

Upstream's `createMbqlTransform` pins the source schema **only for the default
table** — passing `sourceTable` explicitly takes the "custom source table"
branch, which leaves the lookup unpinned. On a clean container that is harmless
(all 26 `many_schemas` Animals are identical). Here, `getTableId({name:"Animals"})`
can resolve to the empty `Domestic.Animals`, and then:

- **`not show the 'Show details' buttons in ID columns (metabase#64473)`**: the
  query returns "No results", so upstream's `detail-shortcut` absence assertion
  **passes on an empty result pane** — a vacuous green. My anchor
  (`cell-data` visible) is what exposed it; without the anchor the test is
  green and worthless.
- **`create and run a transform from a question or a model`**: fails
  `assertQueryBuilderRowCount(3)` with "Showing 0 rows". 2/2 under
  `--repeat-each=2` before the fix, 0/2 after.

Fix in both: pin `schema: "Schema A"` on the lookup, documented inline as a
deviation. It is a **no-op on a clean container** and is exactly what upstream
does everywhere else in the file.

**Generalisable warning:** contamination does not only make tests red. It can
make an absence assertion pass while the thing under test never rendered — the
FINDINGS-#49 shape, arriving through a shared container rather than a gate.

### 4. Reproducibility caveat, stated plainly

These greens were obtained with concurrent sibling agents on the same
`writable_db`. Another slot's run can repopulate it underneath this spec, so
**the results may not reproduce**. My own spec is itself a contaminator: its
`beforeEach` runs `resetTestTable("many_schemas")` and injects the 26
`Schema A`…`Schema Z` schemas that a sibling reported as breaking *their* tests.
This is mutual, not one-directional. **This tier needs a per-slot writable DB.**

## Upstream assertion that is vacuous by chai semantics (deliberate deviation)

`should not include absolute-max-results LIMIT in SQL preview for MBQL transforms`
(upstream 400–409) writes:

```js
H.sidebar().should("be.visible").and("not.contain", /\bLIMIT\b/i);
```

chai-jquery's `contain` **stringifies its argument** — it is a `:contains(...)`
substring test, not a regex test — so this searches the sidebar for the literal
text `"/\bLIMIT\b/i"`, which is never present. The assertion always passes.

And the preview genuinely **does** contain a LIMIT: measured on the jar, the
sidebar reads `… FROM "Schema A"."Animals" LIMIT 5` — the transform's own
`limit: 5`. So a literal port of the intended assertion fails, correctly.

Ported as the test's stated intent instead: the preview must not contain
`absolute-max-results` (`qp.settings/absolute-max-results` = **1048575**), plus a
positive check that the only LIMIT present is the transform's own `LIMIT 5`.
Flagged as a deviation in the spec.

*Scope caveat:* I did **not** run the Cypress original for this one. The
argument is chai semantics plus the measured DOM; if it were non-vacuous
upstream would be red in CI. Someone should confirm with a cross-check before
this is treated as settled.

## Other measured port gotchas (candidates for PORTING.md)

- **`cy.findAllByTestId("picker-item").contains(x).should("have.attr","data-disabled")`
  — the attribute is NOT on `picker-item`.** Measured against the live DOM:
  `picker-item` is a wrapper `Box`; `data-disabled` lives on the Mantine
  `NavLink` `<a role="link">` inside it (`ItemList.tsx:112-118`), which is what
  Cypress's `.contains()` resolves to. Selecting the wrapper reads `null` for
  **both** the enabled and the disabled row — so the naive port makes the
  *negative* assertion (`not.have.attr`) pass **vacuously** while the positive
  one fails. Two tests hit this.
- **The mini-picker schema click lands on the WRONG ROW without a response
  anchor.** Another instance of PORTING's "a list that re-renders under a
  resolved locator". Measured: the schema click resolved to `Domestic` (the row
  above `Schema A` in the 27-row list) and the wrong source table came out,
  surfacing two steps later as `schema-link` reading the wrong schema. Anchored
  on `GET /api/database/:id/schemas` and `/api/database/:id/schema/:name`.
- **A transient popover that AUTO-CLOSES makes upstream's click unportable.**
  In `create and run a SQL transform`, upstream clicks the DB in a popover.
  Measured: the popover ("Sample Database / Writable Postgres12") is open at
  t=0 and **gone by t=500ms** — with only one transform-capable database the app
  auto-selects it and unmounts the picker. Playwright reported "html intercepts
  pointer events" then "element was detached"; Cypress runs the same race and
  no-ops when it loses. Ported as an assertion on the state the click exists to
  produce (`gui-builder-data` contains the DB name).
- **`toHaveText` vs CodeMirror.** `H.NativeEditor.value().should("eq", multiline)`
  needs `toHaveText(expected, { useInnerText: true })` — CodeMirror renders each
  line in its own div, so `textContent` carries no newlines and the default
  comparison can never match a multi-line expectation.
- **A `loading-indicator` `toHaveCount(0)` is not a results anchor.** It is
  satisfied by "it has not appeared yet"; measured as a 1-in-2 failure under
  `--repeat-each`. Anchor on the `POST /api/dataset` response *and* a painted
  cell.
- **Two `toast-undo` nodes with identical text** when the same action fires
  twice in quick succession → strict-mode violation. Cypress's `findByTestId`
  throws on multiple, so upstream implicitly assumes one. Ported as
  `.filter({ hasText }).first()`, with the honest limitation noted inline: with
  identical text this cannot distinguish the new toast from the old — the same
  limitation upstream's assertion has.
- **`cy.get()` RESETS the subject**, again: upstream's
  `getTagsInput().parent().get("[data-with-remove=true]").should("not.exist")`
  has a dead `.parent()` scope; the real selector is the bare attribute,
  page-wide. Ported as what executes, anchored on the tags input being visible.
- **The "Create new schema" option renders as `Create new schema <name>`** —
  testing-library's exact `findByText` matched the inner text node; Playwright
  compares full element text, so it needs a substring regex.
- **`getSchemaLink().realHover()` → `hover({ force: true })`** — the link's inner
  span intercepts the pointer; `realHover` is coordinate-based and skips
  actionability.

## Snowplow: captured, not stubbed

The three transform events (`transform_create`, `transform_created`,
`transform_trigger_manual_run`, plus `transform_tags_updated`) are FE-emitted
from `frontend/src/metabase/transforms/analytics.ts`, so
`installSnowplowCapture` captures them at the browser boundary. Stubbing to
no-ops (PORTING rule 6's default) would have made **11 event assertions
vacuous**. This is the fifth independent spec the capture helper works on with
zero modification. `expectNoBadSnowplowEvents` degrades to the documented
structural check (no Iglu validation without micro).

## Mutation testing (3 mutations, 3 killed)

| mutation | result |
|---|---|
| snowplow `event: "transform_create"` → `"transform_createXX"` | **killed** — proves the capture is live, not a stub |
| `picker-item` link `data-disabled` `"true"` → `"false"` | **killed** — proves the anchor-element fix resolves a real attribute |
| debounce test: drop the second toggle so a PUT genuinely fires | **killed** |

The third was re-run in an **isolating** form, because the first version was
killed by the switch-state assertion rather than by the counter: toggle on, wait
1200ms (past the 300ms debounce, so a PUT really fires), toggle back off — final
switch state still unchecked, so only the counter can catch it. Result:
`expect(updateCallCount).toBe(0)` failed with **Received: 2**. The passive
`page.on("request")` counter is genuinely live.

## Fixmes

**One**, and it is environmental, not a bug claim:
`should be able to create a new table in an existing transform when saving a
transform` — blocked by contamination #2 above (foreign `Domestic` schema
changes the modal's default). Recoverable for free by a per-slot writable DB.

No product-bug claims. No Cypress cross-check was run: the only two candidates
for one were (a) the vacuous-`not.contain` deviation, argued from chai semantics
plus measured DOM and explicitly flagged as unconfirmed, and (b) the single
fixme, whose cause was measured directly in the container. Everything else
resolved to port drift, which was the right prior every time.

## One unexplained intermittent, recorded rather than explained

`metadata › should be able to edit table metadata after table creation` failed
**once**, in one full-file `--repeat-each=2` run, and I did not capture its
error before it disappeared. It then passed 3/3 in isolation, 4/4 in a
`targets|metadata` repeat run, and 2/2 in the final full-file repeat run
(84 passed, 0 failed). I have no mechanism for it and am not inventing one.
Given the shared-container situation a sibling run is a plausible cause, but
that is a guess, not a measurement. Flagging it so a follow-up watches that test.

## Consolidation notes

- `support/transforms.ts` is the shared transforms module PORTING asked for, but
  it deliberately does **not** refactor the transform helpers already in
  `dependency-graph.ts` / `dependency-broken-list.ts` / `transforms-codegen.ts`
  — it imports `createTransform` / `runTransformAndWaitForSuccess` from
  `dependency-graph.ts` and `resetManySchemasTable` from `transforms-codegen.ts`
  read-only. A later pass can collapse them; doing it now would have edited
  files other agents own.
- **A fourth knex `resetTestTable` copy now exists** (`resetCompositePkTable`),
  alongside `actions-on-dashboards.ts`, `filter-bigint.ts` and
  `transforms-codegen.ts`. The brief asked me to import rather than write a
  fourth — I could reuse `resetManySchemasTable` but `composite_pk_table` was in
  none of them. This is now a 4-way duplication of the same connection config
  and strongly wants the `support/writable-db.ts` with a table registry that
  transforms-codegen's findings already proposed.
- `tooltip` is re-exported from `charts.ts` rather than re-implemented.

---

# CONTINUATION (session 2) — upstream lines 1717–2036

Picking up at the clean boundary the previous agent left (`describe("runs")`,
upstream line 1717). Nothing in lines 35–1716 was re-ported or refactored, and
no defect was found in it. The one change to `support/transforms.ts` is
additive (see "reset extension" below).

## 3-line summary

**Five more describes ported and verified — `runs`, `deletion`,
`disconnected database`, `cancelation`, `dependencies` (upstream 1717–2036, 12
tests, all executed).** Whole file now 54 executed / 6 gate-skipped, 108/12/0
under `--repeat-each=2`, gate-OFF control 0 executed / 60 skipped, tsc clean;
three mutants run, three killed, two of them landing on *tail* assertions.
**No new blockers, no new fixmes, and — unlike session 1 — the shared
`writable_db` caused nothing here, though this batch does add three more
contaminating table names.**

## How far, and the new boundary

| describe | upstream lines | tests | executed | skipped |
|---|---|---|---|---|
| runs | 1717–1756 | 2 | 2 | — |
| deletion | 1758–1825 | 3 | 3 | — |
| disconnected database | 1827–1885 | 1 | 1 | — |
| cancelation | 1887–1991 | 4 | 4 | — |
| dependencies | 1993–2036 | 2 | 2 | — |
| **this session** | | **12** | **12** | **0** |
| **file total** | 35–2036 | **60** | **54** | **6** |

**NOT ported — clean boundary at upstream line 2038,
`describe("python > common library")`.** A follow-up starts there and continues
to EOF:

- Remaining inside the first top-level describe: `python > common library`
  (2038, all `@python`), `collections` (2257), `revision history` (2651),
  `read-only remote sync` (2729).
- Later top-level describes: `databases without :schemas` (2847), `jobs`
  (2895), `runs` (3311), the `@python` script test-run describe (3742), the
  no-supported-databases describe (3853), and the three permissions describes
  (4190, 4264, 4329).

The previous agent's claim that `support/transforms.ts` already carries the
whole spec-local getter surface **held up exactly**: these 12 tests needed
**zero new helpers**. The only support change was one additive line in the
reset (below). `getRunStatus`, `getCancelButton`, `getRunsNavLink`,
`getRunListLink`, `getRunErrorInfoButton`, `getTransformRunTable`,
`verifyDisconnectedDatabaseBanner`, `DataStudio.Runs.*`,
`DataStudio.Dependencies.content` and `runTransformInUiAndWaitForFailure` were
all already there and all correct on first use.

## Verification

| run | result |
|---|---|
| new 12 only, gate ON | **12 passed** (1.4m) — green on the first attempt |
| whole file, gate ON | **54 passed, 6 skipped, 0 failed** (4.4m) |
| whole file, gate OFF (control) | **0 passed, 0 failed, 60 skipped** |
| whole file, gate ON, `--repeat-each=2` | **108 passed, 12 skipped, 0 failed** (9.1m) |
| `bunx tsc --noEmit` | clean |

The inherited 42 did **not** regress: 54 = 42 + 12, and the 6 skips are the
same `@python` six.

**The gate-OFF control is clean** — 60 skipped, nothing failed. The
`afterEach` guard the previous agent added (`if (!capture) return;`) is still
in the file and still correct; this session re-confirmed it rather than
re-finding the bug.

### Backend artifact, verified not assumed

`PW_KEEP_SLOT_BACKENDS=1` printed `(reused)` on every run, which is exactly the
case where `JAR_PATH` is silently ignored — so it was checked rather than
trusted: `GET :4102/api/session/properties` → `version.hash 751c2a9`, against
`target/uberjar/COMMIT-ID` = `751c2a98`. Jar mode confirmed.

### Evidence the QA-DB path actually ran

Read out of the container, not inferred. After the `dependency graph` test
(run in isolation so no later `beforeEach` could clean up behind it):

```
 table_schema | table_name | rows
--------------+------------+------
 Schema A     | table_a    |    3
 Schema A     | table_b    |    3
```

That is the transform chain physically materialised in the writable postgres:
Transform A wrote `"Schema A"."table_a"`, Transform B read it and wrote
`table_b`. `table_c` is absent because upstream deliberately never runs
Transform C — it only needs it to exist as a dependent.

Also: the `cancelation` describe runs real `pg_sleep(100)` / `pg_sleep(500)`
queries against that container and cancels them through the backend's cancel
path, and the `deletion` describe's third test deletes a real physical table
and then proves it gone via a native question that errors with
`"Schema A.transform_table" does not exist`.

## Mutation testing (3 mutations, 3 killed, 2 landing on tails)

Deliberately aimed away from first assertions, per the brief.

| # | mutation (input inverted, not the expectation) | result |
|---|---|---|
| M1 | `runs › navigate to a list of runs`: replace `getRunListLink().click()` (per-transform run list) with a `goto` of the **global** run list | **killed at the TAIL** — `transforms.spec.ts:2016`, the `"MBQL transform"` `toHaveCount(0)`. The three preceding assertions ("SQL transform" / "Success" / "Manual") still passed, which is the point: the filtering assertion is the one carrying the test's subject, and it is load-bearing on its own. |
| M2 | `cancelation › cancel a SQL transform from the preview (#64474)`: drop the **second** run-button click (the one that cancels) | **killed** — `loading-indicator` `toHaveCount(0)` got `Received: 1`. This was the test I most suspected of vacuity (1.5s, an absence assertion right after a click); it is real. |
| M3 | `disconnected database`: skip the database deletion entirely, so the transform page renders with the DB still connected | **killed** at the `editDefinitionButton` `toHaveCount(0)` (`Received: 1`). |

### M3 had to be re-run in isolating form — and the first form taught something

The first M3 attempt asserted the `editDefinitionButton` absence immediately
after `visitTransform`, with no anchor. **It passed** — i.e. the absence check
was satisfied by "the page has not painted yet", the classic PORTING vacuity
shape. The mutant then died one line later on the banner assertion, which would
have been the wrong reason to call it killed.

Re-run with an anchor that exists in *both* variants (`runTab` visible) before
the absence check, it died correctly at the absence check itself.

**This is a methodology note, not a defect in the shipped test**: upstream puts
`verifyDisconnectedDatabaseBanner()` — which asserts a visible `role="alert"` —
immediately *before* the `editDefinitionButton().should("not.exist")`, so the
ported test already has a real anchor and the check is honest as shipped. The
lesson is only that **an unanchored version of that same assertion is vacuous**,
measured rather than reasoned, and that checking *where* a mutant dies is what
surfaced it. (The previous agent hit the same trap once; it is apparently the
default failure mode of mutating this spec.)

## The one support change: reset extension

`resetTransformTargetTables()` matched only `%transform%` table names. The
`dependencies` describe targets `table_a` / `table_b` / `table_c`, which that
pattern does not cover, so the residue would 403 the *second* run of that test
on the same physical already-exists check
(`transforms_base.util/target-table-exists?`) the previous agent documented.
Added those three names to the same narrowly-scoped DO block. It changes no
assertion and cannot touch another spec's fixtures — and it is exactly the
mechanism `--repeat-each=2` would otherwise have exposed.

**Contamination note in the other direction, stated because this spec is also a
contaminator:** this session adds three more table names
(`"Schema A"."table_a"`, `table_b`, `table_c`) that a sibling slot could now
find in the shared `writable_db` mid-run. They are dropped by our own
`beforeEach`, but only when *this* spec next runs. `table_a` is a generic
enough name to be worth flagging in the #85 write-up.

## Contamination: nothing new this session, and the reason is worth recording

The shared `writable_db` caused **zero** failures in these 12 tests. Baseline
before the run was 29 schemas (`Domestic`, `Schema A`–`Z`, `Wild`, `public`) —
i.e. exactly the previous session's described debris, unchanged. None of the
five new describes touches the schema **picker**, which is where the
virtualization problem (#85 failure shape 1) bites, and the only cross-schema
table lookups are pinned. So this batch is not evidence that #85 is any less
severe — it is evidence that the damage is concentrated in the picker-driven
and unpinned-lookup tests, which is a useful narrowing.

Two lookups were pinned defensively in the `dependency graph` test
(`sourceSchema: TARGET_SCHEMA` for the `table_a` and `table_b` sources).
Upstream leaves them unpinned because passing `sourceTable` explicitly takes
`createMbqlTransform`'s custom-source-table branch. Same deviation, same
reasoning and same no-op-on-a-clean-container property as the previous
session's two. Flagged inline.

## Claims from the brief that this session did NOT reproduce or settle

Stated plainly rather than repeated:

- **Python transforms / the `402 Premium features required`.** Not probed. This
  session ported nothing `@python`-tagged, so it adds **no** evidence either
  way. The previous agent's finding (the real blocker is the missing
  python-runner `:5001` + localstack `:4566` containers, and the 402 was never
  observed) stands unchanged and still unconfirmed on the 402 specifically.
- **The vacuous `not.contain(/\bLIMIT\b/i)` deviation** (upstream 400–409) is
  still **not** cross-checked. No Cypress run was performed — the brief
  forbids one while sibling slots are live, and four other agents were running
  throughout. It remains a chai-semantics argument plus a measured DOM, exactly
  as the previous agent flagged it. Do not treat it as settled.
- **The one unexplained intermittent** the previous agent recorded
  (`metadata › should be able to edit table metadata after table creation`,
  failed once, no error captured) did **not** recur: it passed 1/1 in the
  full-file run and 2/2 under `--repeat-each=2`. That is not an explanation and
  I am not offering one — three more clean passes is weak evidence and the
  mechanism is still unknown.

## Fixmes

**None added.** The file still carries exactly the one environment-blocked
`test.fixme` from session 1 (`should be able to create a new table in an
existing transform when saving a transform`, blocked by the foreign `Domestic`
schema changing the save modal's default). No product-bug claims from this
session.

## Port notes worth keeping (nothing here is new-gotcha material)

Everything in this batch ported mechanically. Recording the four decisions that
required a judgement call:

- **`cy.visit("/data-studio/transforms/1")`** in the disconnected-database test
  hardcodes transform id 1, which only works because the snapshot restore
  resets the app DB. Ported as the created transform's real id — same intent,
  no dependence on id allocation.
- **`.should("exist")` on the transient `Canceling` / `Canceled` run-table
  text** ported as `toBeAttached()`, not `toBeVisible()` — `should("exist")` is
  an attachment assertion and the stronger form would be port drift. The
  `Canceling → Canceled` race is upstream's; it is inherited as-is and did not
  flake across 3 runs (6 executions).
- **`H.modal().within(...)` around the delete-transform radio absences** carries
  Cypress's implicit "the modal exists" requirement. Ported as an explicit
  `expect(button("Delete transform")).toBeVisible()` first, per the PORTING rule
  about naive `toHaveCount(0)` ports dropping the anchor half.
- **`getTableLink()`** in the two deletion tests is called purely for its
  chained `aria-disabled` assertion; the support port already folds that
  assertion into the getter, so the bare `await getTableLink(page)` is the
  faithful equivalent of upstream's `getTableLink().should(...)`.

## Reproducibility caveat (unchanged, restated)

These greens were obtained with four sibling agents live on the same box and
the same `writable_db`. The container happened to be clean of transform residue
at the start and end of every run, but a sibling can repopulate it underneath
this spec at any time. **This tier still needs a per-slot writable DB** — that
recommendation is unchanged and this session adds no reason to soften it.

---

# CONTINUATION (session 3) — upstream lines 2038–2846

Picking up at the clean boundary session 2 left (`describe("python > common
library")`, upstream line 2038). Nothing in lines 35–2036 was re-ported or
refactored, and no defect was found in it. Changes to `support/transforms.ts`
are purely additive (python-editor surface + collection/history getters).

## 3-line summary

**Four more describes ported — `python > common library`, `collections`,
`revision history`, `read-only remote sync` (upstream 2038–2846, 17 tests, 14
executed).** Whole file now 68 executed / 9 skipped, gate-OFF control 0
executed / 77 skipped, tsc clean; three mutants run, three killed, all three at
the intended tail assertion.
**The headline finding is that `@python` was over-gating: 3 of the 5 tests in
the python describe need no runner at all and now execute — and the brief's
`402 Premium features required` is settled as FALSE.** One new `test.fixme`,
whose cause I could NOT determine and have recorded as unexplained.

## How far, and the new boundary

| describe | upstream lines | tests | executed | skipped |
|---|---|---|---|---|
| python > common library | 2038–2255 | 5 | 3 | 2 (runner) |
| collections | 2257–2649 | 8 | 7 | 1 fixme |
| revision history | 2651–2727 | 1 | 1 | — |
| read-only remote sync | 2729–2846 | 3 | 3 | — |
| **this session** | | **17** | **14** | **3** |
| **file total** | 35–2846 | **77** | **68** | **9** |

**NOT ported — clean boundary at upstream line 2847,
`describe("scenarios > admin > transforms > databases without :schemas")`.**
That line also closes the first top-level describe, so a follow-up starts at a
top-level boundary for the first time — the cleanest handoff point in this file
so far. Remaining: `databases without :schemas` (2847), `jobs` (2895), `runs`
(3311), the `@python` script test-run describe (3742), the
no-supported-databases describe (3853), and the three permissions describes
(4190 / 4264 / 4329).

## THE `@python` TAG IS COARSER THAN THE ACTUAL REQUIREMENT (3 tests recovered)

Both previous sessions treated `@python` as a single blocked tier. Measured,
it splits cleanly in two, and the split is worth three executed tests:

- **Needs the containers (2 tests).** Only the tests that call
  `H.setPythonRunnerSettings()` and then RUN a python transform need the
  python-runner (:5001) and localstack S3 (:4566). Both were probed this
  session and are dead (empty response, no listener). These two keep the
  `PW_PYTHON_RUNNER_ENABLED` gate and unwritten bodies.
- **Needs only the token feature (3 tests).** `edit and save the common
  library`, `navigate to the common library when clicking 'common'`, and the
  cmd-click variant never start a runner — they exercise the library editor and
  a CodeMirror clickable token. They are ported and **execute green**.

### The `402 Premium features required` is SETTLED — it does not happen

The original brief predicted a 402 on `pro-self-hosted`; session 1 declined to
repeat it and recorded it unverified; session 2 added no evidence. Probed
directly this session:

- `/api/session/properties` → `token-features` includes **`transforms-python:
  true`** and `transforms-basic: true` under the `pro-self-hosted` token the
  beforeEach activates.
- `GET /api/ee/transforms-python/library/common.py` → **200**.
- `PUT /api/ee/transforms-python/library/common.py` → **200**.

So the 402 claim is **false for these endpoints**. The blocker is exactly and
only the missing containers, as session 1 suspected. Scope caveat: I did not
probe the transform *execution* endpoint under a runner-less instance, so this
settles the library/premium-gate question, not "no 402 exists anywhere in the
python tier".

## The one new fixme — and I could NOT explain it

`collections › should move transforms between collections` is `test.fixme`'d at
its second half. Upstream moves the transform back to root with
`H.modal().within(() => cy.findByText("Transforms").click())`. Measured on this
build, that row does not exist. Reporting the measurements, **not** a mechanism:

- The Move dialog's COMPLETE innerText, in both states (transform at root, and
  transform inside `Target Collection`), after a 2s settle:
  `Move "Movable Transform" / Target Collection / New folder / Cancel / Select`.
  There is no `Transforms` row anywhere in the dialog.
- `item-picker-level-0` (the `RootItemList` column) has **empty innerHTML**.
  `ItemList` returns `null` iff `filteredItems` is empty, so the root item list
  genuinely computes to zero items — this is not virtualization, not CSS, and
  not a timing window (level-1 is populated in the same snapshot).
- `GET /api/collection/root?namespace=transforms` → **200**,
  `{"name":"Transforms","can_write":true,"id":"root"}`. The data the row would
  be built from is present and writable.
- No request fails while the dialog opens (only the harness's own snowplow CORS
  noise on the console).
- `useRootItems` pushes the transforms root under
  `namespaces.includes("transforms") && transformsEnabled`, and
  `transforms-basic` IS in this instance's token features — so the guard that
  would suppress it appears satisfied.

**I did not establish which of `namespaces` / `transformsEnabled` /
`isHiddenItem` actually zeroes that list, and I am not inventing one.**

Why port drift is an unlikely explanation here, stated as an argument rather
than a conclusion: there is no alternative locator to translate to. Cypress's
`findByText("Transforms")` scoped to the same `[role=dialog][aria-modal=true]`
(`H.modal()` is the byte-identical selector — checked against
`e2e-ui-elements-helpers.js:33` vs `support/ui.ts:27`) would face the same empty
DOM. The first half of the test — moving INTO the collection, the toast, and the
breadcrumbs — passes.

**This is NOT a product-bug claim.** Settling it needs a Cypress cross-check of
this test on this build, which the brief forbids while sibling slots share the
box. The test is ported verbatim so that cross-check is a one-line un-fixme.

## Verification

| run | result |
|---|---|
| new 17 only, gate ON | 14 passed, 3 skipped (python describe green first try; collections 7/8; revision + remote-sync 4/4 first try) |
| whole file, gate ON | **68 passed, 9 skipped, 0 failed** (6.2m) |
| whole file, gate OFF (control) | **0 passed, 0 failed, 77 skipped** |
| whole file, gate ON, `--repeat-each=2` | **136 passed, 18 skipped, 0 failed** (11.6m) |
| `bunx tsc --noEmit` | clean |

The inherited 54 did **not** regress: 68 = 54 + 14. The 9 skips are the
original 6 `@python` + the 2 runner-gated new ones + the 1 new fixme.

The gate-OFF control is clean. Session 1's `afterEach` guard is still in the
file and still correct; the three new describes needed no equivalent, but note
that `read-only remote sync` has **its own** `beforeEach` — it carries its own
`test.skip(!PW_QA_DB_ENABLED)` because a nested `beforeEach` runs even when the
outer one skipped, and it does real filesystem work (`setupGitSync`).

### Backend artifact, verified not assumed

`PW_KEEP_SLOT_BACKENDS=1` printed `(reused)` on every run — the case where
`JAR_PATH` is silently ignored — so it was checked rather than trusted:
`GET :4102/api/session/properties` → `version.hash 751c2a9`, against
`target/uberjar/COMMIT-ID` = `751c2a98`. Jar mode confirmed. This matters more
than usual this session: the fixme above is an argument about *this build*, and
it would be worthless if the jar and the spec were different commits. They are
the same commit.

## Mutation testing (3 mutations, 3 killed, 3 landing where intended)

Aimed at tails, and **where** each died was checked, per the brief.

| # | mutation (input inverted, not the expectation) | result |
|---|---|---|
| M1 | `python > common library › edit and save`: drop the **Revert** click, so `# oops` survives | **killed at the TAIL** — line 2452, the *second* (post-revert) value assertion, not the earlier save assertion. The revert half of the test is load-bearing on its own. |
| M2 | `collections › sort by all columns`: drop the **second** `Name` click, so the list stays ascending | **killed** at line 2855, the descending `getRowNames` expectation — i.e. the four sort assertions are not collapsing into one. |
| M3 | `read-only remote sync`: skip `configureGit(read-only)` entirely, so the instance stays editable | **killed in all three tests**, and in `should not allow editing a transform` it died at **line 3175, the `editDefinitionButton` `toHaveCount(0)` itself** — not at a later assertion. |

**M3 is the one worth keeping.** Session 2 measured that an *unanchored*
`editDefinitionButton` absence check is vacuous (satisfied by "the page has not
painted yet") and that the shipped test only survives because upstream happens
to put a banner assertion before it. The `read-only remote sync` version has no
such banner, so this port adds an explicit `runTab` visibility anchor before the
absence check — and M3 dying *at that assertion* is the measurement that the
anchor works. Without it this mutant would have died later, at the tags-disabled
assertion, and the absence check would have been silently vacuous.

## Container evidence and contamination

Baseline before and after: **29 schemas** (`Domestic`, `Schema A`–`Z`, `Wild`,
`public`) — byte-identical to session 2's baseline, so no sibling slot added
debris across this session.

Transform-table residue after the full run, read out of the container:

```
 table_schema | table_name
--------------+------------------------------
 Domestic     | sql_transformtransform_table
```

That single row is pre-existing debris from an earlier session, in a foreign
schema, deliberately not dropped. Our own `beforeEach` reset is doing its job.

**Contamination caused this session: none.** None of these 17 tests hit the
schema *picker* (the virtualization failure shape), and the collections tests
create transforms but never RUN them, so they materialise **no physical
tables** — `sales_summary`, `movable_transform`, `alpha_output`, `beta_output`,
`zebra_output`, `middle_output`, `archived_transform_table` and
`analytics_transform` exist only as app-DB rows. This batch is therefore the
first that adds **zero** new contamination to the shared `writable_db`. It does
not weaken the per-slot-writable-DB recommendation; it narrows where the damage
comes from (runs, not creates).

## Support additions (all additive)

`support/transforms.ts` gained:

- A **python CodeMirror surface**: `pythonEditorContent`, `focusPythonEditor`,
  `clearPythonEditor`, `typePythonEditor`, `pythonEditorValue`,
  `visitCommonLibrary`, `getLibraryEditorHeader`, `setPythonRunnerSettings`.
  `transforms-codegen.ts` already has a python editor port, but its focus helper
  is module-private and its `makeManualEdit` **pastes**. That distinction is
  load-bearing here: upstream types `return a + b` with NO indent and asserts
  the saved value HAS four spaces, so the assertion is on CodeMirror's python
  auto-indent. A paste would insert the text verbatim and the test would fail
  for the wrong reason. `typePythonEditor` uses `pressSequentially`.
- `pythonEditorValue` reconstructs `.cm-line` textContents joined by newline —
  the literal port of `codeMirrorHelpers.value()`. NOT `toHaveText` /
  `useInnerText`, which the earlier NativeEditor ports use; for an `eq` on a
  two-line value the reconstruction is what matches upstream semantics.
- Collection/history getters: `collectionPickerDialog`, `collectionPickerButton`,
  `collectionRowOptions`, `transformsSearchInput`, `getTransformNameInput`,
  `getTransformHeaderEllipsis`, `getTransformHistoryList`.

`support/remote-sync.ts` was **imported read-only** — `setupGitSync`,
`configureGit`, `teardownGitSync` all worked unmodified on first use. Third
independent spec to reuse it.

## Port notes (judgement calls worth recording)

- **`cy.stub(win, "open")` → an in-page `window.open` recorder.** Patched with
  `page.evaluate` *after* the visit, exactly where upstream patches it, pushing
  into a `window.__openCalls` array the assertion polls back. Upstream's
  `should("have.been.calledWithMatch", "…/common.py")` is a sinon **substring**
  match on a string argument, so the port uses
  `arrayContaining([stringContaining(…)])` rather than an equality.
- **`cy.intercept(url, { statusCode: 500, body })` → `page.route` + `fulfill`,
  registered before the click.** Used for the UXW-310 failed-revert assertion.
- **`H.undoToastList()` vs `H.undoToast()`.** Upstream switches helpers for the
  second "Transform moved" toast because the first is still mounted. The
  existing `expectUndoToast` already handles the transient duplicate
  (`filter({hasText}).first()`), so both call sites use it — with the same
  honest limitation noted in session 1: identical text cannot distinguish the
  new toast from the old, which is upstream's limitation too.
- **The three `new/<kind>` not-found assertions were ported as a loop** over
  `["native","python","query"]`. Upstream writes them out three times; the loop
  is the same three assertions in the same order, not a merge — no assertion is
  dropped or weakened.
- **`cy.visit("/data-studio/transforms/1")`** in `read-only remote sync` again
  hardcodes id 1; ported as the created transform's real id, same as session 2
  did for the disconnected-database test.
- **The disabled `Create a transform` button needs `hover({force:true})`.**
  Playwright's actionability check never resolves a hover on a disabled button,
  while `cy.realHover` is coordinate-based and skips it — the same deviation the
  `getSchemaLink` hover needed in session 1.
- **Upstream's own "Expand" comment was ported verbatim** (the nested-collection
  step). It is a real re-render race that upstream already documented; keeping
  the comment keeps the reason discoverable.

## Claims from the brief this session did NOT settle

- **The vacuous `not.contain(/\bLIMIT\b/i)` deviation** (upstream 400–409)
  remains **not** cross-checked, and this session ran no Cypress. It is still a
  chai-semantics argument plus a measured DOM. Left flagged, as instructed. Do
  not treat it as settled.
- **Session 1's unexplained intermittent** (`metadata › edit table metadata
  after table creation`) did not recur — 1/1 in the full run. That is now three
  sessions of clean passes with no mechanism. Still not an explanation.
- **The new fixme's mechanism** (above) is genuinely unexplained. It is the one
  thing in this session I would most want a follow-up to resolve, and the only
  way to resolve it is the forbidden Cypress cross-check.

---

# CONTINUATION (session 4) — upstream lines 2847–4394 — **PORT COMPLETE**

Picking up at the clean top-level boundary session 3 left (upstream line 2847).
Nothing in lines 35–2846 was re-ported or refactored. One inherited comment was
corrected (see "session 3's fixme is now explained"); no inherited test body was
changed. Changes to `support/transforms.ts` are additive plus two getter fixes.

## 3-line summary

**The spec is now fully ported: all eight remaining describes (upstream
2847–4394, 24 tests) are in, so every upstream `it` in the 4,394-line original
has a counterpart — 101 tests, 88 executed / 13 skipped / 0 failed in the
single run, gate-OFF control 1 executed / 100 skipped, tsc clean, three mutants
killed; `--repeat-each=2` surfaced one intermittent in an INHERITED test, not
in this session's work.**
**The headline finding is that the local `MB_PRO_SELF_HOSTED_TOKEN` is missing
the `transforms-basic` feature — which blocks three tests AND explains session
3's "unexplained" fixme, so that open question is now closed with a
measurement rather than a guess.**
**Secondary: the brief's question about what blocks upstream 3742 is settled —
it is the dead `:4566` localstack, measured as a 500 from the real endpoint,
and there is no 402 anywhere near it.**

## How far: the port is finished

| describe | upstream lines | tests | executed | skipped |
|---|---|---|---|---|
| databases without :schemas | 2847–2893 | 2 | 2 | — |
| jobs (8 nested describes) | 2895–3309 | 14 | 14 | — |
| runs | 3311–3740 | 2 | 2 | — |
| python runner (`@python`) | 3742–3851 | 2 | 0 | 2 (runner) |
| no supported databases | 3853–3874 | 1 | 1 | — |
| permissions | 4190–4262 | 1 | 0 | 1 fixme |
| permissions > oss | 4264–4327 | 1 | 1 | — |
| permissions > pro-self-hosted | 4329–4394 | 1 | 0 | 1 fixme |
| **this session** | | **24** | **20** | **4** |
| **file total** | 35–4394 | **101** | **88** | **13** |

Nothing is dropped, weakened or merged. The two places where upstream repeats
itself verbatim (`testStartAtFilter`/`testEndAtFilter`, and the three
`new/<kind>` not-found visits session 3 looped) are parameterised, not merged:
every assertion still runs, in the same order, with the same arguments.

## THE FINDING: the local pro-self-hosted token lacks `transforms-basic`

Measured on this backend immediately after a `beforeEach` activated
`pro-self-hosted`, via `GET /api/session/properties` → `token-features`:

```
transforms-python: true
transforms-basic:  FALSE     <- absent from the truthy feature list entirely
```

The truthy list has 40 entries (`sandboxes`, `remote_sync`, `dependencies`,
`transforms-python`, …) and no `transforms-basic`.

**Why:** `:transforms-basic` is `^{:added "0.59.0"}`
(`src/metabase/premium_features/settings.clj:296`) while `:transforms-python`
is `"0.57.0"`. The local token predates the newer feature. This is an
environment artifact, not a jar or product problem — the jar knows the feature
(`token_check.clj:718-729`).

**Why the rest of the spec is unaffected:**
`token_check.clj/query-transforms-enabled?` only requires `:transforms-basic`
on HOSTED instances, and `is-hosted?` is false here. So transforms themselves
work fine; only the two FE call sites that read the token feature directly
break.

### Consequence 1 — session 3's UNEXPLAINED fixme is now EXPLAINED

Session 3 recorded `collections › should move transforms between collections`
as unexplained, and did the right thing by not inventing a mechanism. But one
step of its reasoning was wrong, and it is the load-bearing one:

> "`transforms-basic` IS in this instance's token features — so the guard that
> would suppress it appears satisfied."

**That is false**, measured above. And
`use-get-root-items.ts:52` is literally

```ts
const transformsEnabled = useHasTokenFeature("transforms-basic");
```

so `transformsEnabled` is false, the transforms root is never pushed into
`rootItems`, `filteredItems` is empty, and `ItemList` returns `null` — which is
*exactly* the empty `item-picker-level-0` innerHTML session 3 measured. Their
observations were all correct; only the token reading was wrong.

**It is not a product bug, not port drift, and does not need the forbidden
Cypress cross-check.** It stays `test.fixme` (it genuinely cannot pass against
this token) but the comment now carries the mechanism and it becomes a one-line
un-fixme when the token is refreshed.

### Consequence 2 — two of my permissions tests are blocked the same way

`getShouldShowTransformPermissions`
(`admin/permissions/selectors/data-permissions/permission-editor.tsx:192`)
returns true on a non-hosted instance only when `transforms-enabled` (the
beforeEach sets it) **and** the `transforms-basic` token feature are both
present. So the `Transforms` permission column can never render here. Measured
from the failure snapshot: the table has exactly six column headers — Database
name / View data / Create queries / Download results / Manage table metadata /
Manage database — and no Transforms one.

Blocked: `permissions › should allow non-admin users with data-studio
permission to create transforms` (the assertion sits mid-test) and
`permissions > pro-self-hosted › should have transforms available…` (the
trailing assertion; everything before it passes).

**Not split to salvage the passing halves.** Upstream is one `it` each, and
dropping the column assertion would be weakening the test — the hard rule the
brief sets. Both `test.fixme`'d with the measurement and the exact FE gate
cited inline.

**Recommendation for the coordinator: refresh `MB_PRO_SELF_HOSTED_TOKEN`.**
It recovers three tests across this file for free and removes the only
remaining fixmes in the whole 4,394-line port.

### A vacuity caveat on the ONE permissions test that passes

`permissions > oss` is green, but its two load-bearing assertions are
`columnheader /Transforms/` → `toHaveCount(0)`. Those would pass under the
stale token regardless of whether the instance is OSS, so on this box the test
**cannot distinguish "OSS" from "stale token"**. It is also `@OSS`-tagged
upstream, i.e. CI runs it against an OSS jar while this package only has the EE
one (the describe activates no token, so what ran is "EE build, no token").
Flagged inline. Do not read its green as evidence about OSS behaviour.

## What actually blocks upstream 3742 (the brief asked; I probed)

The brief said to probe rather than assume either way. Both tests in the
`python runner` describe call `runPythonScriptAndWaitForSuccess()`, so unlike
session 3's `python > common library` split, **neither** of them comes free.

Measured, not inferred:

- `token-features` carries `transforms-python: true` → **no 402**, confirming
  session 3's settlement from a second direction.
- `POST /api/ee/transforms-python/test-run` — the endpoint the run button
  drives (`transforms_python/api.clj:48`) — returns **500**:
  `"An error occurred while copying table data to S3"` /
  `"Unable to execute HTTP request: Connect to localhost:4566 … Connection
  refused (SDK Attempt Count: 4)"`.
- `:5001` and `:4566` both refuse connections (`curl` → 000); neither is in the
  local container set.

So the blocker is exactly and only the missing containers, and the **S3 side
fails first** — the python-runner on :5001 is never even reached. Both tests
keep `PW_PYTHON_RUNNER_ENABLED` with unwritten bodies.

## Verification

| run | result |
|---|---|
| batch A (mysql + jobs), gate ON | 16 passed (2 fixed on the second attempt, both port drift) |
| batch B (runs + python + no-db + permissions), gate ON | 4 passed, 2 skipped, 2 blocked → fixme'd |
| whole file, gate ON | **88 passed, 13 skipped, 0 failed** (6.3m) |
| whole file, gate OFF (control) | **1 passed, 100 skipped, 0 failed** (5.1s) |
| whole file, gate ON, `--repeat-each=2` | **175 passed, 26 skipped, 1 failed** (13.4m) — the one failure is an INHERITED test, see below |
| `bunx tsc --noEmit` | clean |

The inherited 68 did **not** regress in the single run: 88 = 68 + 20.

### The one `--repeat-each=2` failure is inherited, and I did not resolve it

`cancelation › should show a message when the run finished before it cancels`
(session 2's, upstream ~1940) failed on its **second** execution — 175 passed
instead of the expected 176. None of my 24 new tests failed in either pass.

Re-run **4/4 green in isolation** immediately afterwards, so it is
intermittent, not a regression from this session's work (my describes are
separate top-level describes with their own `restore`, and none of them touches
the cancelation flow).

What the failure log actually shows, as a measurement: while waiting for
`"This run succeeded before it had a chance to cancel."`, the run button
oscillated — 13 polls read `Ran successfully`, 11 polls read `Run now` (the
reset state). The transform's own status line said
`Last ran a few seconds ago successfully.` throughout, so the run genuinely
succeeded; only the cancel-arrived-too-late message never rendered.

**Hypothesis, explicitly labelled as one:** upstream's test deliberately races
— it cancels a run that is about to finish — so on a contended box the run can
complete (and the UI reset to `Run now`) before the cancel request registers,
in which case the backend never sees a cancel against a succeeded run and
never emits that message. **I did not verify this**, and I am recording it as
an unresolved intermittent rather than claiming a mechanism. It is now the
second such open intermittent in this file (session 1's `metadata` one is the
other, still unexplained after four sessions). A follow-up should watch it.

**The gate-OFF control is 1, not 0 — and that is the correct number.** The
`no supported databases` describe (upstream 3853) has **no `@external` tag** and
restores the DEFAULT snapshot; its whole point is that only the Sample Database
(which cannot host transforms) exists. Gating it on `PW_QA_DB_ENABLED` would be
the over-gating sin session 3 measured in the `@python` tier, so it is
deliberately ungated. Session 1's `afterEach` capture guard still holds; the two
new describes with their own `afterEach` carry the same guard.

**On the 4 tsc errors siblings reported in this file earlier: they do not
reproduce.** `bunx tsc --noEmit` was clean before I touched anything and clean
after. Either they were fixed or they were never in this file.

### Backend artifact, verified not assumed

`PW_KEEP_SLOT_BACKENDS=1` printed `(reused)` on every run — the case where
`JAR_PATH` is silently ignored — so it was checked rather than trusted:
`GET :4102/api/session/properties` → `version.hash 751c2a9` against
`target/uberjar/COMMIT-ID` = `751c2a98`. Jar mode confirmed. This matters
unusually much here, because the token finding is an argument about *this*
instance.

### Evidence the QA-DB path really ran

- `jobs › schedule › run a job on a schedule` drives a once-a-second quartz cron
  and polls `GET /api/transform/run` until a run reports `succeeded` — a real
  scheduled execution against the writable postgres, not a UI fake.
- `jobs › runs › error message from a failed run` reads
  `relation "abc" does not exist` out of the run's error modal — a genuine
  postgres error surfaced through the run pipeline.
- `runs › filter runs` / `sort runs` each run one transform to success and one
  to failure through the UI, then filter and sort the resulting run rows.
- `databases without :schemas` restores the `mysql-8` snapshot and drives the
  QA MySQL8 container on :3304.

## Mutation testing (3 mutations, 3 killed — one needed re-aiming, one an isolating re-run)

Inputs inverted, never expectations, and **where** each died was checked.

| # | mutation | result |
|---|---|---|
| M1 | `jobs › runs › manually run a job`: give the JOB a different tag from the transform, so it has nothing to process | **killed in the WRONG place** — at `runJobAndWaitForSuccess`, `Received: "Run now"`. Too coarse: it blocks the run entirely, so it says nothing about the tail. Re-aimed as M1b. |
| M1b | same test: rename the transform to `"Other transform"`, so the job runs successfully but the run table shows a different name | **killed at the TAIL** — line 3617, the run table's `"MBQL transform"` assertion. The snowplow event and the `"Last ran a few seconds ago successfully."` assertion both passed first, so the tail carries its own weight. |
| M2 | `runs › filter runs`: make the second transform SUCCEED (`SELECT 1 AS n` + wait-for-success) instead of failing | **killed at line 4131**, inside `testStatusFilter` — the `Success`-filter `SQL transform → toHaveCount(0)`. The entire preceding transform-filter block passed, i.e. the six filter blocks are not collapsing into one another. |
| M3 | `jobs › dependencies › should not render the transforms table…`: give the job a tag that HAS a transform | **killed at the ANCHOR**, not the absence check — so re-run isolating (see below). |

### M1 is worth keeping as a methodology note

M1 died with `Expected: "Ran successfully" / Received: "Run now"` after the full
60s. That is not a useful mutation result, but it *is* a useful measurement:
the completion anchor did not silently pass on a timeout, it waited on the run
button's own label and then reported the real terminal state. The brief warned
that `runs`/`jobs` would be full of async-completion assertions; this is direct
evidence that this file's completion signal is the button label and not a
sleep.

### M3 needed the isolating form, and the first form would have misled

With the anchor in place (`emptyState.scrollIntoViewIfNeeded()` +
`toBeVisible()`), M3 died **at the anchor** — which proves the anchor works but
says nothing about whether
`expect(getJobTransformTable(page)).toHaveCount(0)` is load-bearing. Calling it
"killed" there would have been the exact mistake session 2 documented.

Re-run with the anchor neutralised (`expect(Jobs.editor).toBeVisible()`
instead), the mutant died **at the absence check itself**, `Received: 1`. So
the absence assertion is genuinely non-vacuous, and the shipped test has both
the anchor and a real check. This is the third session running in which
"check WHERE the mutant dies" changed the conclusion.

## Port gotchas measured this session (candidates for PORTING.md)

- **testing-library NORMALISES WHITESPACE in `findByPlaceholderText`;
  Playwright's `getByPlaceholder` does not.** The cron field's real placeholder
  is `"For example 5   0   *   Aug   ?"` — three spaces between fields
  (`CronExpressioInput/CronExpressionInput.tsx:62`). Upstream writes it with
  single spaces and matches anyway, because testing-library runs its default
  normalizer (trim + collapse) over the attribute value. A literal
  transcription of upstream's string **never resolves** and the failure looks
  like "the custom-schedule branch didn't render". Ported as a
  whitespace-tolerant regex, which is what upstream's matcher actually means.
  *This one generalises to every `findByPlaceholderText`/`findByLabelText` port
  in the corpus.*
- **`findByLabelText` is EXACT by default; `getByLabel` is a SUBSTRING match.**
  `getScheduleTimeInput` (`getByLabel("Time")`) resolved to two elements: the
  time `Select` **and** `<div role="note" aria-label="Your Metabase timezone">`
  — "timezone" contains "time". Strict-mode violation. Needs
  `{ exact: true }`. Same class of bug as the whitespace one: the naive
  transcription is silently *looser* than the Cypress original.
- **A `PUT /api/transform-job/*` intercept also matches
  `PUT /api/transform-job/active`.** The `active flag` test waits on both in
  the same flow, so the id-shaped waiter needs a negative lookahead
  (`/^\/api\/transform-job\/(?!active$)[^/]+$/`) or the bulk call satisfies the
  per-row waiter and the assertion reads the wrong body.
- **`cy.wait("@alias").its("request.body")` → a `waitForApiRequestBody` helper**
  that resolves to the parsed `request.postData()`. Registered before the
  action, awaited after, asserted with `toEqual` — the faithful equivalent of
  `should("deep.equal", …)`. Six call sites in the `active flag` test.
- **`cy.go("back")` → `page.goBack()` needs a re-anchor.** Cypress queues the
  next command behind its own retries; Playwright returns as soon as the
  navigation commits, so the loop in `recognize built-in jobs in the cron
  builder` re-asserts the job list is visible before the next iteration clicks.
- **MySQL's mini-picker has no schema level**, so the DB→table drill anchors on
  `/api/database/:id/schema…` with a pattern that matches either shape, rather
  than reusing `pickWritableAnimals`.

## Container delta (measured, both ends)

Before this session: **29 schemas, 32 tables**, and **zero** transform residue
(`%transform%` / `table_a` / `table_b` / `table_c` all empty) — byte-identical
to session 3's closing state, so no sibling added debris in between.

This session is a **contaminator by design**: `jobs` and `runs` are the two
describes that actually materialise physical tables, exactly as the brief
predicted. All of their targets (`transform_table`, `transform_table_2`) are
already covered by `resetTransformTargetTables()`'s `%transform%` pattern, so
**no extension was needed** — I checked rather than assumed, and this is the
first session that added no new names to that reset.

Every target schema is pinned (`"Schema A"`), no test in this batch touches the
schema *picker* (the virtualization failure shape), and contamination caused
**zero** failures here. The two failures I did get were the token, not the
container.

Measured after the final `--repeat-each=2` run: **29 schemas, 34 tables**, with
one residue row, `"Schema A"."transform_table"` — the last test's target, which
our own `beforeEach` drops on the next run. So the delta across this whole
session is **+0 schemas, +2 tables, +1 transient transform table**. Mid-run I
also observed `Domestic.transform_table`, i.e. a transform whose save-modal
Schema defaulted to the foreign `Domestic` schema — session 1's contamination
#2 shape, still live. It is inside our reset's schema list so it does get
dropped, but `transform_table` under a foreign schema is worth flagging in the
#85 write-up.

## Support changes

Additive: `createTransformTag`, `createTransformJob`, `visitTransformJob`,
`waitForSucceededTransformRuns` (a poll on `GET /api/transform/run` with
upstream's `runs.some(status === "succeeded")` predicate — not a sleep),
`waitForCreateJob` / `waitForUpdateJob` / `waitForDeleteJob` /
`waitForBulkUpdateJobActive`, and `waitForApiRequestBody`.

Two **fixes** to getters session 1 wrote ahead of use — both were wrong in the
same direction (looser than the Cypress original), and neither could have been
caught before a test used them: `getScheduleTimeInput` and
`getScheduleFrequencyInput` gained `{ exact: true }`, and `getCronInput` became
the whitespace-tolerant regex. Session 1's claim that the module "already
carries the whole spec-local getter surface" held up in coverage — 24 tests
needed no new getters — but two of the unexercised ones were subtly broken.
Worth generalising: **a getter written ahead of its first use is unverified,
however faithful it looks.**

## Claims from the brief / prior sessions this session did NOT settle

- **The vacuous `not.contain(/\bLIMIT\b/i)` deviation** (upstream 400–409)
  remains **not** cross-checked. No Cypress was run this session either (the
  standing rule holds; four sibling slots were live). Three sessions have now
  declined it. Still a chai-semantics argument plus a measured DOM.
- **Session 1's unexplained intermittent** (`metadata › edit table metadata
  after table creation`) did not recur. That is four sessions of clean passes
  with no mechanism. Still not an explanation.
- **Whether the `permissions > oss` test means anything on an EE jar.** Argued
  above from the FE gate; not settled, and settling it needs an OSS jar.

## @python tier completed and verified (live runner up)

The `@python` tier — deferred across earlier sessions because the runner infra
was down and PORTING forbids shipping unverifiable bodies — is now PORTED and
GREEN against a live python-runner (:5001) + localstack S3 (:4566). Run on slot
7 (:4107) with `PW_QA_DB_ENABLED=1 PW_PYTHON_RUNNER_ENABLED=1`:

| test | spec | result |
|---|---|---|
| should be possible to create and run a Python transform | transforms | pass |
| should be able to update a Python query | transforms | pass |
| should show Python transforms in view-only mode | transforms | pass |
| should transition from read-only to edit mode for Python transforms | transforms | pass |
| should return to read-only mode after saving a Python transform | transforms | pass |
| should be possible to use the common library | transforms | pass |
| should be able to run a transform with default import common … | transforms | pass |
| should be possible to test run a Python script | transforms | pass |
| should display preview notice message | transforms | pass |
| should be able to create and run a Python incremental transform | transforms-incremental | pass (was `test.fixme`) |

Full python subset: **9 passed** in transforms.spec (single `--workers=1` run,
0 skipped), + **1 passed** in transforms-incremental. tsc clean.

**Mutation check (live, killed then reverted):** in "test run a Python script",
changing the transform body from `useful_calculation(40, 2)` to `(40, 30)` made
the runner emit `70`; `assertTableData({ firstRows: [["42"]] })` went red on the
real cell value "70" — proving the runner executes and its output flows to the
assertion. Reverted; the file is byte-identical to pre-mutation.

### TOKEN GAP (the brief's probe #3, settled)

`POST /api/transform` with a python source returns **402 "Premium features
required for this transform type are not enabled."** on the LOCAL
`MB_PRO_SELF_HOSTED_TOKEN`. Python transform CREATE is gated by
`python-transforms-enabled?` (token_check.clj), which requires `:transforms-basic`
with no non-hosted short-circuit; the local token predates that feature
(`^{:added "0.59.0"}`). This CORRECTS the earlier "there is NO 402 here" note,
which was about the *test-run* endpoint (checks `:transforms-python`, present) —
a different feature from *create* (`:transforms-basic`).

Resolution that preserves CI's token choice: the @python tests go through
`activatePythonTransformToken` (support/transforms.ts). It activates
`pro-self-hosted` (upstream's / CI's choice — the CI staging secret carries
`:transforms-basic`, so no fallback fires there) and only when the instance
reports `transforms-basic: false` does it fall back to the all-features token
(`MB_ALL_FEATURES_TOKEN`, the `bleeding-edge` name). The spec's `beforeEach`
token choice is unchanged. Verified: with the fallback, the view-only test that
had 402'd at create now passes.

### DEVIATIONS recorded (measured on this jar, not papered over)

1. **`create and run a Python transform` — `.cm-panels` not-visible (#73290).**
   The fix (`CodeMirror.module.css`) drops the search panel's z-index to 2 so it
   stacks below surrounding components; the panel stays MOUNTED and CSS-visible.
   Cypress's occlusion-aware `not.be.visible` reads it hidden under the modal;
   Playwright's `toBeHidden` only checks CSS and would report it visible. Ported
   to the actual invariant: at the panel's own centre, `elementFromPoint` returns
   an element belonging to the entity-picker modal — i.e. the modal paints over
   the panel. Regressing the z-index flips this false.

2. **`create and run a Python transform` — "same table should not be possible".**
   On this jar the SECOND source-table picker opens at the root (not
   auto-navigated into Schema A), and once drilled in, Schema A's already-used
   Animals renders as an ENABLED `<a href>` link rather than a `data-disabled`
   NavLink — the already-used-table disable upstream asserts does not reproduce
   here. The negative assertion is not portable against this build; the rest of
   the flow (a second Animals from Schema B, driving the alias de-dup that is the
   point of adding a second table) is preserved and asserted.

3. **`update a Python query` — caret placement.** `H.PythonEditor.type("{backspace}
   …")` deletes from the doc end. The port's `focusPythonEditor` clicks the
   editor top-right (caret on line 1), so the port collapses the selection to the
   very end (`Ctrl/Cmd+A`, then `ArrowRight`) before the backspaces — otherwise
   they chew into `import pandas as pd` and the run fails.
