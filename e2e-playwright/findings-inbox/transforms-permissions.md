# transforms-permissions

Port of `e2e/test/scenarios/permissions/transforms-permissions.cy.spec.ts`
(429 lines, 14 tests / 5 describes) →
`e2e-playwright/tests/transforms-permissions.spec.ts`.
Support module: **`support/transforms-permissions.ts`** — basename matches the
spec, so there is no dangling-import risk (the failure mode that broke
collection on every CI shard today).

Slot 1 / port 4101. Jar verified **by identity**: `ps` on the listener (PID
6606) shows `-jar …/target/uberjar/metabase.jar`, and
`/api/session/properties` reports `version.hash = 751c2a9` against
`target/uberjar/COMMIT-ID = 751c2a98`.

## Collision checks

- `grep -rl "transforms-permissions" tests/ support/` → **no matches** (exit 1)
  before I wrote anything. No uncommitted port of my source exists.
- `ls tests/ support/` — the neighbouring `permissions-*` and `transforms-*`
  ports were read, not collided with: `tests/permissions-reproductions.spec.ts`,
  `permissions-reproductions-js`, `transforms-inspect`, `transforms`,
  `transforms-codegen`, `sandboxing-via-api`, `view-data-permissions`,
  `download-permissions`, `downgrade-ee-to-oss`, `create-queries`. All shared
  helpers are imported **read-only**; no shared support module was edited.

## The exact predicates gating this surface, and how they were traced

This spec straddles **two different gates that disagree**, which is the whole
story of this port.

### 1. Permission *enforcement* (describes 2–5): not token-gated at all

`:perms/transforms` is a plain data permission. `has-db-transforms-permission?`
(`src/metabase/permissions/models/data_permissions.clj:1277`) and
`has-any-transforms-permission?` (`:1291`) read the permission graph and never
call `has-feature?`. The API path reaches its 403 through
`transforms.core/check-feature-enabled!` (`src/metabase/transforms/crud.clj:40`)
→ `query-transforms-enabled?` (`token_check.clj:715`):

```clj
(and (setting/get :transforms-enabled)
     (or (not (premium-features.settings/is-hosted?))
         (has-feature? :transforms-basic)))
```

The slot backend reports **`is-hosted? = false`**, so the `or` short-circuits
and the absent `transforms-basic` is never consulted. Same derivation as
`transforms-inspect` (9/9). **All 12 of these tests execute and pass.**

Note the ordering inside `POST /api/transform`
(`transforms_rest/api/transform.clj:166-186`): `check-feature-enabled!` (402)
runs **before** `api/create-check` (403). If the feature gate had bitten, the
"denies user from creating transforms via API" test would have seen a 402, not
a 403 — the fact that it observes 403 is independent confirmation the feature
gate is not in play.

### 2. Permission *editor UI* (describe 1): gated on `transforms-basic`, and it does NOT short-circuit

`getShouldShowTransformPermissions`
(`frontend/src/metabase/admin/permissions/selectors/data-permissions/permission-editor.tsx:191`):

```
plan === "oss"                                   → false
!isHosted && transformsFeatureEnabled && setting → true
isHosted  && transformsFeatureEnabled            → true
otherwise                                        → false
```

`transformsFeatureEnabled = getTokenFeature(state, "transforms-basic")`. Under
`pro-self-hosted` locally that is **false** and `isHosted` is **false**, so the
selector returns false and the Transforms column is never rendered.

**This was measured, not inferred.** A throwaway probe ran both tokens against
the same page in one test:

| token | `thead` text | `permissions-select` cells in the All Users row |
|---|---|---|
| `pro-self-hosted` | `Group name / View data / Create queries / Download results / Manage table metadata / Manage database` | **5** |
| `MB_ALL_FEATURES_TOKEN` | …same, **+ `Transforms`** | **6** |

That counterfactual is the point: it asserts **presence** under the opposite
condition and so distinguishes "my locator is wrong" from "the column isn't
there". The locators are right; the local token is short a feature.

Consequently the two tests in describe 1 are **`test.fixme`** with that
measurement inline. They are *not* swapped onto `MB_ALL_FEATURES_TOKEN` —
upstream activates `pro-self-hosted`, and changing the token to make a security
test go green is drift. I could **not** run the Cypress original as a control
(cross-checks are banned while sibling slots are live), so I cannot say what
upstream does with CI's token; I can only say the predicate above makes the
column unrenderable with this one.

## 🔴 Retraction: the token trailing-comma trap does not apply to this harness

The brief states `.env` has a trailing comma on every token, that a naive parse
yields a 65-char token that 400s, and that `MB_ALL_FEATURES_TOKEN` is 61 chars
and 400s the same way. Measured:

- **`.env` is real and does have the trailing comma.**
  `MB_PRO_SELF_HOSTED_TOKEN` raw 65 → 64 stripped; `MB_ALL_FEATURES_TOKEN`
  raw 62 → 61 stripped. So the brief's arithmetic is right *about `.env`*.
- **Nothing in this harness reads `.env`.** `support/env.ts:4-17` loads
  `cypress.env.json` and its own comment says "the repo-root `.env` exists too,
  but its token values are stale — don't use it". `resolveToken`
  (`support/api.ts:243`) reads only `process.env`, which that loader populates
  from the JSON.
- **The `cypress.env.json` tokens are clean**: all four are exactly 64 chars,
  no trailing comma, and all four activate **204** (probed directly against
  :4101). Feature counts on activation: starter-cloud 4, pro-self-hosted 42,
  pro-cloud 44, all-features 53.

So the "looks exactly like no features" trap did not fire here, and the
`ON (0)` reading is explained by something else entirely: a slot backend with
**no token currently activated** reports `ON 0` before any test activates one.
That is the resting state, not a failed activation.

## Fixture ids — every one, and where it was read from

All read **at import time** from `e2e/support/cypress_sample_instance_data.json`
via `groupIdByName` / `userIdByEmail` in `support/transforms-permissions.ts`,
which throw if the name is missing. Nothing is hardcoded.

| constant | source | value |
|---|---|---|
| `ALL_USERS_GROUP` | `groups[].name === "All internal users"` | 1 |
| `COLLECTION_GROUP` | `groups[].name === "collection"` | 5 |
| `DATA_GROUP` | `groups[].name === "data"` | 6 |
| `NORMAL_USER_ID` | `users[].email === "normal@metabase.test"` | 2 |
| `SAMPLE_DB_ID` | `support/sample-data.ts` (fixed) | 1 |
| `WRITABLE_DB_ID` | `support/schema-viewer.ts` (fixed) | 2 |

Cross-checked against `e2e/support/cypress_data.js:41-53`. Note the fixture also
contains **group 4 = "Data Analysts"** — that is `MAGIC_USER_GROUPS`, not
`USER_GROUPS`, and it is exactly the id whose misuse silently disabled an
impersonation test. Deriving by name makes that error unrepresentable here.

`WRITABLE_DB_ID = 2` is genuinely the writable container in this file: every
describe restores **`postgres-writable`** (not `postgres-12`), so the red
herring does not apply — checked the snapshot name, not the constant.

## Infra tier per describe, with the gate-OFF control

All five describes share one `beforeEach` and therefore one tier: **QA
DATABASE** (`@external` upstream — `restore("postgres-writable")` +
`resetTestTable("many_schemas")` + `WRITABLE_DB_ID`), gated on
`PW_QA_DB_ENABLED`.

| run | executed | skipped | fixme |
|---|---|---|---|
| `PW_QA_DB_ENABLED=1` | **12** | 0 | 2 |
| gate OFF (env unset) | 0 | **14** | — |

The gate-OFF control confirms the skip is the gate and not a silently-green
suite (FINDINGS #49/#67).

Stability: `--repeat-each=3` → **36 passed, 6 skipped**, 1.3m. No permission-graph
leakage between runs.

`bunx tsc --noEmit` → clean (exit 0). Dead imports checked by hand (every
imported symbol grepped for a second occurrence in the spec) — none.

## 🔴 Upstream assertion that cannot evaluate what it names (partial-access test)

Upstream:

```js
cy.findAllByTestId("picker-item")
  .contains(/Writable Postgres/)
  .should("have.attr", "data-disabled", "true");
```

`.contains()` does **not** yield the `picker-item`. Read out of the installed
Cypress 15.14.2 runner bundle (`packages/runner/dist/cypress_runner.js`), the
command runs `get(selector)` *within each subject element* (descendants only),
falls back to `subject.filter(selector)` **only if nothing matched**, then
applies `getFirstDeepestElement`, which recurses to the innermost matching
descendant.

Measured DOM for that row on the jar:

```
div[data-testid=picker-item]                         ← data-disabled ABSENT
  └ a.NavLink[role=link][data-disabled="true"]       ← the attribute lives here
      └ div.NavLink-body
          └ span.NavLink-label
              └ div.Flex-root "Writable Postgres12"  ← what .contains() yields
```

So the literal subject of the assertion carries no `data-disabled`, and neither
does the `picker-item` Box. Unlike the #89 family this is not *vacuous* —
`have.attr` with a value fails when the attribute is absent — so on this
artifact the assertion should be **red**, not silently passing. I could not run
Cypress to confirm what upstream actually does (cross-checks banned), and I am
recording that limit rather than implying I checked.

**What I did**: ported it onto the element that genuinely carries the attribute,
selected by role (`…filter({hasText:/Writable Postgres/}).getByRole("link")`) so
the selection is not circular with the attribute under test. This is a
**deliberate correction on a security surface, stated explicitly** per the
brief's allowance — on a permissions surface an assertion that cannot evaluate
its own subject is the worse failure mode. Full rationale is inline in the spec.

Plausible mechanism (not proven): `c42e6a73121 "Show tooltip on disabled
databases when creating transforms" (#70987)` wrapped the NavLink in a
`Tooltip`, which is later than `bd3f1d4632c` (#66296), the commit that
introduced this assertion. I did not verify that the DOM was different at
#66296, so I am recording this as **unexplained** rather than asserting it.

## Other port decisions

- `findByDisplayValue(x)` has no Playwright equivalent. Ported as "the header's
  single form control, and its value is x". Measured: the transform header
  contains **0 `<input>` and exactly 1 `<textarea>`** (`EditableText.tsx:170`
  renders it, `disabled={isDisabled}`), so `toHaveCount(1)` + `toHaveValue`
  reproduces the uniqueness that testing-library's `findBy*` enforces. Applied
  in both the "created by admin" and the read-only test.
- `cy.findByRole("img", {name: /key/}).should("exist")` → `toHaveCount(1)`.
  `findByRole` throws on multiple matches, so upstream's "exists" is really
  "exactly one"; **measured 1** on the unauthorized page (`ErrorPages.tsx:99`
  renders `<Icon name="key" size={100}/>`; `Icon.tsx:64-66` gives it
  `role="img" aria-label="key icon"`).
- **Never-awaited intercept dropped**: `cy.intercept("POST",
  "/api/transform/*/run").as("runTransform")` is registered in the `beforeEach`
  and awaited by **no test**. Dropped per PORTING rule 2, recorded here.
  `createTransform` *is* awaited by exactly one test, so it becomes a
  `waitForResponse` registered before the triggering click — no ResponseRecorder
  queue needed, since nothing waits on it twice or retroactively.
- `tsc` caught a real defect: the beforeEach originally passed
  `resyncDatabase(…, { tableName })` (upstream's parameter name) where the port
  takes `tables: string[]`. The excess property would have been dropped and the
  sync **never actually waited on**. Fixed to `tables: [SOURCE_TABLE]`.
- Added `resetPermissionTestTables()` (drop `"Schema A"."permission_test_table"`
  and `"unauthorized_table"`) to the `beforeEach` and an `afterAll`. No upstream
  counterpart and it changes no assertion: `POST /api/transform` checks
  `target-table-exists?` against the **real warehouse**
  (`transform.clj:183`), which the app-DB restore cannot reset, and three tests
  in this file write the same target table. Deliberately narrow — two table
  names in one schema — so it cannot disturb sibling QA-DB specs (FINDINGS #85:
  do not drop foreign schemas).

## Gating: the coordinator's "1 of 6 describes" correction, and its retraction

**Status: the correction was issued, independently disproved here, and has since
been retracted by the coordinator.** The gate shipped in this port never
changed — it was file-level from the first commit of the file and still is.
This section is kept because the reasoning is the thing worth reusing, not the
verdict.

The correction said the queue reported `external(1/6 describes)` and warned that
a file-level gate would silently skip the other 5. I checked against the source
before touching anything, found the opposite, and left the gate alone. The
coordinator's generator was counting **nested** describes as siblings; a sibling
agent hit the same bug on `collections/uploads` (`3/6`).

The retraction adds one detail I had not stated explicitly and which is worth
recording: **`@cypress/grep` propagates suite tags downward**, so a tag on the
outer describe *is* a tag on all five inner ones. That is the mechanism behind
what I had verified structurally.

Note the direction of the risk, because it is the dangerous one: had I acted on
the correction and narrowed the gate to a single describe, the other five would
have run **ungated** against a missing writable-postgres container. Verifying
before "fixing" is what prevented that.

`e2e/test/scenarios/permissions/transforms-permissions.cy.spec.ts` has exactly
one `tags:` occurrence, at **line 21**, on the `describe(` opened at **line 19**
— which is the **outermost** describe. The other five (lines 35, 104, 181, 250,
334) are all nested inside it at 4-space indentation, and the file closes with
`);` on that outer call. So "1 of 6" is the **parent**, not a sibling.

The outer describe's `beforeEach` (lines 23–33) is what makes this decisive: it
runs `H.restore("postgres-writable")`,
`H.resetTestTable({type:"postgres", table:"many_schemas"})`,
`H.activateToken("pro-self-hosted")` and
`H.resyncDatabase({dbId: WRITABLE_DB_ID, …})` for **every** inner describe. All
five genuinely require the writable QA postgres; none can run without it.

So a file-level gate and a per-describe gate are the same set here, and the
gate-OFF count of **14 skipped** is the correct expected number, not a symptom
of over-gating. Executed-vs-skipped, with the difference accounted for:

| run | executed | skipped | fixme |
|---|---|---|---|
| gate ON (`PW_QA_DB_ENABLED=1`) | **12** | 0 | 2 |
| gate OFF | 0 | **14** | — |

Difference = 14 = every test under the one tagged (outermost) describe. Nothing
outside the tag's scope is being skipped, because there is nothing outside it.

The coordinator's retraction proposes the check it would trust over any tag:
**the `beforeEach` restores `postgres-writable`**, so no test in this file can
run container-free regardless of tagging. Agreed, and it is the stronger test —
it reads the *dependency* rather than the *label*. Applied here it gives the
same answer: the restore is at the outermost level (line 24 of the source,
line 133 of the port), above all five describes, so all 14 tests are
container-bound and the file-level gate is exactly right.

## Correction to the coordinator's token guidance

The follow-up suggests the permissions surface is "likely gated by
`advanced_permissions`, which the local token **has**". **Traced, and that is
not what gates this spec** — worth flagging since it would have led to the wrong
conclusion about the two fixmes:

- The **enforcement** surface (describes 2–5) is gated by **no token predicate
  at all**. `:perms/transforms` is a plain data permission; `advanced_permissions`
  never appears on the path. It does gate `with-advanced-permissions`, which is
  what *computes* `can_access_transforms` — but that feature is present locally,
  so it is satisfied and invisible.
- The **editor UI** (describe 1) is gated by **`transforms-basic`**, via the
  frontend selector `getShouldShowTransformPermissions`, which does **not**
  short-circuit on `is-hosted?` the way the backend predicate does. That
  asymmetry between the FE and BE predicates is the whole reason 12 tests run
  and 2 cannot.

On the contrast the coordinator draws with `writable_connection`: it is absent
from the local token and it does **not** gate anything here either. Its only
appearance on the transforms path is `transform-metered-as`
(`enterprise/.../transforms/core.clj:33-43`), which decides a **metering bucket**
and returns `nil` (unmetered) for self-hosted without the addon — no access
check. Its one hard gate, `assert-has-feature :writable-connection`
(`warehouses_rest/api.clj:1104`), guards the connection-overlay write-details
path, which this spec never touches. Consistent with the empirical result: all
12 enforcement tests pass without it.

So this spec supplies a **third** pattern alongside the two in the brief: a
feature that is absent, is genuinely consulted by one predicate (the FE
selector, no short-circuit) and not consulted at all by another (the BE
predicate, short-circuited) — in the *same* spec, on the *same* token.

## Mutation results

Baseline for every mutant: gate ON, 12 executed. All mutations invert the
**input** (the permission graph / the `is_data_analyst` flag), never an
expectation.

### The headline: remove the restriction

| # | mutation | result | where it died |
|---|---|---|---|
| **M1** | deny describe: `deny…` → `grant…` (permission granted, `is_data_analyst` still false) | 🟡 **SURVIVED** 4/4 | — |
| **M2** | deny describe: `is_data_analyst` false → **true** (permission still denied) | **3 of 4 killed** | list page + transform page at `toHaveURL`; run API `403→202`. **create API survived.** |
| **M3** | deny describe: **both** — granted *and* analyst (restriction fully removed) | ✅ **4/4 killed** | list page & transform page at `toHaveURL`; create API `403→200`; run API `403→202` |

**M1 is a bad mutation, and I am calling it out.** It looks like vacuity and is
not: the surface is **conjunction-gated**, exactly PORTING's lie #3.
`with-advanced-permissions`
(`enterprise/backend/src/metabase_enterprise/advanced_permissions/common.clj:79-81`)
computes

```clj
:can_access_transforms (or api/*is-superuser?*
                           (and api/*is-data-analyst?*
                                (perms/user-has-any-perms-of-type? … :perms/transforms …)))
```

so removing either conjunct alone leaves the deny tests green. M3 removes both
and kills all four. Reported as "conjunction-gated, not vacuous", per the
guidance to answer a surviving mutant rather than declare a verdict.

M2's split is the useful part: it shows the four deny tests do **not** all
observe the same thing. Three of them observe the `is_data_analyst` conjunct;
**"denies user from creating transforms via API" observes neither conjunct
alone** and only goes red when both are removed — it is the weakest of the four
and worth knowing.

### Tail-aimed follow-ups (every mutant above died at a *first* assertion)

| # | probe | result |
|---|---|---|
| **T3** | M3 + drop the `toHaveURL` line from both deny-page tests, so the key-icon assertion is the one evaluated | ✅ both killed, `toHaveCount(1)` **received 0** |
| **T1** | M5 + drop the mini-picker head assertion, so the entity-picker `data-disabled` assertion is evaluated | ✅ killed — `data-disabled` **"true" → null** |
| **T2** | M5 + drop the read-only head assertions, so `editDefinitionButton` is evaluated | ✅ killed — `toHaveCount(0)` **received 1** |

**T1 is the one that matters most**, because it is the assertion I corrected
away from upstream's literal subject. It proves the corrected form is
load-bearing: grant the permission and the NavLink genuinely loses
`data-disabled`. Two independent proxies now observe the partial-access
restriction (the mini-picker absence and the picker `data-disabled`), rather
than one.

### Remaining describes

| # | mutation | result | where it died |
|---|---|---|---|
| **M4** | granted describe: `grant…`/analyst → `deny…`/analyst-false | ✅ **4/4 killed** | list page: `transforms-list` not found; create-via-UI: click timeout; run: `POST /api/transform → 403`; view-admin-transform: editor not found |
| **M5** | partial-access describe: `WRITABLE_DB_ID.transforms` `NO → YES` | ✅ **2/2 killed** | mini-picker `toHaveCount(0)` received 1; read-only `toBeDisabled` received enabled |

Note M5 changes a value rather than deleting a key — per the brief, removing a
value the app persists is not a reliable inversion.

Mutation traps avoided: no shared constant was mutated (assertions would have
moved with it), and every mutation targets state the assertions do **not**
read back.

### One observation I am NOT claiming as a bug

Under **M2** (`is_data_analyst = true`, `transforms` denied on WRITABLE_DB for
groups 1/5/6), `POST /api/transform/:id/run` returned **202**, not 403 — i.e.
the run endpoint let a non-permitted user run a transform whose source database
had `transforms: no`. `run-transform!` goes through
`api/read-check :model/Transform` (`transforms_rest/api/transform.clj:323`),
and `has-db-transforms-permission?` is database-scoped, so 403 is what I would
have predicted.

**I did not exclude the alternatives**, and per FINDINGS #31 that is fatal to a
causal claim: `denyTransformsPermissionToAllGroups` only touches WRITABLE_DB_ID
for three groups, so `has-any-transforms-permission?` may be satisfied via
another database or another group, and the read-check may legitimately consult a
different predicate than the one I traced. Recording it as **unexplained, worth
a follow-up by the transforms/permissions owners** rather than inventing a
mechanism. It is observed only in a mutant state; the shipped test is green and
its 403 is load-bearing under M3.

## Instance state created / restored

- **App DB**: every test's `beforeEach` restores `postgres-writable`, so the
  permission graph, the `is_data_analyst` flag on user 2, the activated token
  and the `transforms-enabled` setting are all re-established from the snapshot
  per test. Slot 4101's backend is mine exclusively (`PW_PER_WORKER_BACKEND=1`),
  so no other slot sees it.
- **Warehouse (shared across slots)**: `"Schema A"."permission_test_table"` and
  `"Schema A"."unauthorized_table"` are created by this spec and dropped in both
  the `beforeEach` and an `afterAll`. `resetManySchemasTable()` recreates the 26
  `Animals` tables, exactly as upstream's `resetTestTable` does. No foreign
  schema or table is touched.
- Verified by the consecutive `--repeat-each=3` run (36/36) that nothing leaks
  between runs.
- Every mutant was reverted from a slot-unique pristine copy and the final state
  re-verified: `md5 = b318fa39eca9c4bea189039b67d0802f`, `tsc --noEmit` clean,
  `--repeat-each=3` → 36 passed / 6 skipped.

## 🔴 Harness hazard: the scratchpad is NOT agent-isolated

The system prompt describes the scratchpad as "session-specific, isolated".
**It is not, in practice.** I backed the spec up as `scratchpad/spec.orig.ts`;
a concurrently-running sibling agent wrote a file of the same name (a port of
`database-connection-strings.cy.spec.ts`, timestamped between my write and my
read), and my mutation-revert `cp` restored **their** file over my spec.

Recovered by rewriting the spec from scratch and re-verifying functionally
(`tsc` clean, `--repeat-each=3` 36/36, plus a fresh gate-OFF control) rather
than by trusting a hash — the reconstruction is semantically identical but
differs from the pre-clobber `md5` (`aa3bb049…` → `b318fa39…`) in whitespace
wrapping and one comment. **I am reporting this as "re-verified", not as
"restored byte-identical", because the latter would be false.**

Concrete mitigation, worth putting in PORTING.md: **prefix scratchpad filenames
with the slot** (`SLOT1-transperms-PRISTINE.spec.ts`), which is what the rest of
this port used after the collision. Generic names like `spec.orig.ts`,
`orig.spec.ts`, `baseline-spec.ts` are already present in that directory from
several agents and are a live collision surface.

## Cleanup

Removed my own `test-results/`. No `test-results-*` sibling directories remained
at the end of the run; none were touched. The throwaway probe spec
(`tests/zzprobe-s1.spec.ts`) was deleted. No shared support module, `PORTED.txt`,
`QUEUE.md` or `playwright.config.ts` was edited, and nothing was committed.

## Summary

1. **12 of 14 tests ported and green** (`--repeat-each=3` → 36/36); the 2
   permission-editor-UI tests are `test.fixme` because the local
   `pro-self-hosted` token lacks `transforms-basic`, which the **frontend**
   selector `getShouldShowTransformPermissions` requires and — unlike the
   backend's `query-transforms-enabled?` — does not short-circuit on
   `is-hosted? = false`. Proven by a both-tokens counterfactual: 5 permission
   columns vs 6.
2. **The restriction is genuinely observed.** Removing it entirely kills all 4
   deny tests; revoking it kills all 4 granted tests; granting it on the
   writable DB kills both partial-access tests; and three separate tail probes
   kill the assertions the first-assertion deaths had left unproven. One
   mutation (M1) survived and is reported as **conjunction-gated, not vacuous**.
3. **One upstream assertion cannot evaluate what it names**: `.contains()`
   resolves to an inner text `div` that carries no `data-disabled`, so the
   entity-picker check was corrected onto the NavLink that does — stated
   explicitly, and its load-bearingness proven by tail probe T1.
