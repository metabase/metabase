# impersonated.cy.spec.js → tests/impersonated.spec.ts

Source: `e2e/test/scenarios/permissions/impersonated.cy.spec.js` (154 lines, 2 tests)
Target: `e2e-playwright/tests/impersonated.spec.ts`
Support module: **`support/impersonated.ts`** — matches the expected name, nothing to flag.

## Collision checks

- `grep -rl "impersonat" tests/ support/` → 7 test files + 9 support files mention
  impersonation, but **none is a port of this source spec**. The closest,
  `tests/view-data-permissions.spec.ts`, ports `permissions/view-data.cy.spec.js`
  and has its own `impersonated` describe from that different source.
- `ls tests/ | grep impersonated` → nothing. `ls support/ | grep impersonated` → nothing.
- No `tests/impersonated.spec.ts`, no `support/impersonated.ts` existed. No STOP condition.
- `sandboxing-via-ui`, `sandboxing-via-api`, `permissions-reproductions{,-js}` read
  read-only; none edited.

Reused read-only (no shared module edited): `createTestRoles` + `QA_DB_SKIP_REASON`
(view-data-permissions.ts), `updatePermissionsGraph` 3-arg form that keeps
`impersonations` (model-actions.ts), `ALL_USERS_GROUP` (create-queries.ts),
`COLLECTION_GROUP` (admin-permissions.ts), `saveQuestion` (sharing.ts),
`runNativeQuery`/`openQuestionActions` (models.ts),
`startNewNativeQuestion`/`typeInNativeEditor` (native-editor.ts),
`cacheStrategySidesheet`/`selectCacheStrategy` (performance-caching.ts).

## Every fixture id, and where it was read from

| id | value | read from |
|---|---|---|
| `ALL_USERS_GROUP` | 1 | `e2e/support/cypress_data.js` USER_GROUPS; re-confirmed by live `GET /api/permissions/group` (`magic_group_type: "all-internal-users"`); imported from `support/create-queries.ts` |
| `COLLECTION_GROUP` | **5** | same three sources; imported from `support/admin-permissions.ts` |
| `PG_DB_ID` | 2 | spec-local const upstream; **verified at runtime** by `assertPgDbId` (`GET /api/database/2` → name "QA Postgres12", engine postgres) |
| impersonated user | `impersonated@metabase.test` | `cypress_data.js:158-170` |
| impersonation attribute | `role` → `orders_products_access` | `cypress_data.js` login_attributes + `e2e/support/test_roles.js` |
| role grants | SELECT/INSERT/UPDATE/DELETE on **Orders + Products only** | `e2e/support/test_roles.js` — this is *why* `reviews` is denied |

**The briefed 4-vs-5 hazard is real and confirmed.** `USER_GROUPS` is
`{ALL_USERS:1, ADMIN:2, COLLECTION:5, DATA:6, READONLY:7, NOSQL:8}` — ids 3 and 4
are absent because they live in a separate `MAGIC_USER_GROUPS`
(`EXTERNAL_USERS_GROUP:3`, `DATA_ANALYSTS_GROUP:4`). Nothing was guessed.
`assertGroupIds`/`assertPgDbId` re-derive all three ids from the live instance in
the beforeEach so a renumbered snapshot fails loudly instead of silently
disabling enforcement.

**Drift found:** the checked-in `cypress_sample_instance_data.json` calls group 1
"All internal users"; this jar serves **"All Users"**. Ids agree, only the label
moved. My first `assertGroupIds` matched on the name and failed — corrected to
match on `magic_group_type`, which is stable. That JSON is not a safe source for
name-based lookups.

## signInWithCredentials — INAPPLICABLE (mechanism checked, not merely unobserved)

I did **not** use `signInWithCredentials`. Two independent reasons:

1. `impersonated` **is** in `LOGIN_CACHE`. Measured keys:
   `[admin, normal, nodata, sandboxed, readonly, readonlynosql, nocollection, nosql, none, impersonated]`.
   So `MetabaseHarness.signIn` takes its **cached branch**, which only calls
   `context.addCookies` and sets the private `sessionId` used for the
   `X-Metabase-Session` header. It never POSTs `/api/session`, so nothing is
   written into the API request context's cookie jar and the cookie-beats-header
   resolution in `wrap-session-key` is never reached.
2. Even if it did: the `mb` fixture is constructed with Playwright's **top-level
   `request` fixture, not `context.request`** (fixtures.ts:216-224) — a separate
   `APIRequestContext` with its own jar. `context.addCookies` cannot reach it.

`signInAsImpersonatedUser` is therefore `mb.signIn("impersonated" as UserName)`.
The cast is needed only because `UserName = keyof typeof USERS` and `USERS` (the
*credentials fallback* map) has no `impersonated` entry; the cached branch indexes
`LOGIN_CACHE`, typed `Record<string, …>`, and returns before touching `USERS`. The
helper asserts the cache entry exists first, so a snapshot change fails loudly
rather than dereferencing `undefined`.

**Proof of which user each API call ran as** (not trusting the above):
`assertRunsAs` does `GET /api/user/current` and asserts the email at **four**
points — beforeEach before the permission-graph write (admin, `is_superuser: true`),
test 1 after switching (impersonated, `is_superuser: false`), test 2 setup (admin),
and test 2 after the switch (impersonated). All four pass on every green run.

## Gate mapping, with the gate-OFF control

Upstream tag: `{ tags: "@external" }` on the outer describe. Measured, not inferred:
**both** tests restore `postgres-12` **and** call `createTestRoles`, which opens a
real connection to postgres://localhost:5404 to `CREATE ROLE`. Neither can run
without the container, so the gate sits in the outermost `beforeEach` on
`PW_QA_DB_ENABLED` (not `QA_DB_ENABLED`, which leaks truthy from cypress.env.json).

**The upstream describe has no `afterEach`** (verified by reading the whole file),
so a `beforeEach`-level skip is safe — nothing needs to unwind.

| arm | result |
|---|---|
| `PW_QA_DB_ENABLED=1` | **2 passed** (executed) |
| gate unset | **2 skipped** (0 executed) |

## Token: predicate, two arms, feature count

Predicate traced in the backend, not assumed. `impersonation-enforced-for-db?` and
`impersonated-user?` (`enterprise/backend/src/metabase_enterprise/impersonation/util.clj`)
are `defenterprise … :feature :advanced-permissions`; `set-role-if-supported!` and
`hash-input-for-impersonation` (`impersonation/driver.clj`) are gated the same way.
Without the feature the OSS fallback returns false and **no role is ever set**.

Two-arm control run against slot 1 (token values never printed):

| | ARM 1 — `pro-self-hosted` active | ARM 2 — token absent |
|---|---|---|
| `advanced_permissions` | `true` | `false` |
| enabled features | **42** (of 59 known keys) | **0** |
| `PUT /api/permissions/graph` (with impersonations) | 200 | **402** |
| `GET /api/ee/advanced-permissions/impersonation` | 200, 1 policy | **402** "Advanced Permissions is a paid feature" |
| impersonated user `select * from reviews` | 400 — `ERROR: permission denied for table reviews` | 403 — `You do not have permissions to run this query.` |
| impersonated user `select current_user` | `orders_products_access` | *(no rows)* |

**My slot's final feature count for `pro-self-hosted`: 42 enabled of 59 keys.**
Measured, not matched to a reported number. Note the JSON key is
`advanced_permissions` with an **underscore**, while the backend keyword is
`:advanced-permissions` with a hyphen — my first probe checked the hyphen form and
got `undefined`, which would have read as "the feature is off". Corrected.

The token gate is real *and* the arms differ in a way the spec's assertion text
depends on: ARM 2 also denies, but with a **Metabase-level 403**, not postgres's
`permission denied for table reviews`. So a token-less run would fail the spec —
it would not silently pass.

Token restored: `restore("postgres-12")` in each beforeEach resets
`premium-embedding-token`, and the probe left the slot restored; the token never
leaks past the file. The gate sits **ahead** of `activateToken`.

## Absence assertions and their positive anchors

This spec has **no `should("not.exist")` / zero-count assertions of its own** — every
upstream assertion is positive (error text present, header cell present). The two
places a zero-assertion exists are worth recording:

1. `runNativeQuery` (shared helper) ends with `expect(icon(page,"play")).toHaveCount(0)`,
   a faithful port of upstream's `cy.icon("play").should("not.exist")`. Its positive
   anchor is the preceding `waitForDataset` — the dataset response must have arrived
   before the count is checked, so this cannot be satisfied by a pre-render poll.
2. My own precondition anchor is the inverse shape and deliberately positive:
   `getImpersonations()` must **contain** `{db_id: 2, attribute: "role"}` before either
   test body runs. This is the guard against the whole spec going green on a
   permission-graph write the backend silently dropped — see MUT-B, which it catches.

The permission-denied screen is itself the "pre-fetch shape" risk the brief warns
about, so both error assertions are additionally anchored: test 1's denial is
scoped after a successful click on `Reviews` and is followed by the *positive*
"Orders works / Subtotal renders" branch; test 2's denial is preceded by an
explicit `waitForResponse` on the card query, so the error text is only checked
after the query actually returned.

## The remove-the-restriction mutation

Verifier sanity-checked before use: exact-occurrence count asserted (`==1`), no-op
detected by md5 comparison, validation before every write.

| mutant | change | result | where it died |
|---|---|---|---|
| **MUT-A** | ALL_USERS `view-data: impersonated` → `unrestricted` | **SURVIVED** | — |
| **MUT-C** | COLLECTION_GROUP PG `view-data: blocked` → `unrestricted` | **KILLED both** | test 1 line 157, test 2 line 290 — the security assertions themselves (tails) |
| **MUT-B** | drop the `impersonations` array entirely | **KILLED both** | spec line 132, the precondition anchor (~400ms) |

**MUT-A was a bad mutation and I am calling it out.** I aimed it wrong. Reading
`enforce-impersonations?` (`impersonation/driver.clj:26-44`) explains the survivor:
enforcement is decided by the **other** groups —
`non-impersonated-group-ids = group-ids − impersonation-holding-groups` — and
returns false only if one of *those* grants `:unrestricted`. ALL_USERS_GROUP *is*
the group holding the policy, so it is excluded from that set and its own
`view-data` value is irrelevant to the enforcement decision. MUT-A is semantically
a no-op on this code path, so its survival says nothing about the test. Not a
vacuity finding.

**MUT-C is the decisive one**, and it reproduces the exact historical defect: the
briefed bug (wrong `COLLECTION_GROUP` id) had precisely the effect of leaving the
user's *other* group unblocked, which makes `enforce-impersonations?` return false
and skips enforcement entirely. Under MUT-C both tests fail at their real security
assertions — the impersonated user reads `reviews` successfully. Runtime also rose
(11.1s/15.0s vs 4-5s baseline) because the queries now return data, a consistent
independent tell.

**Two independent proxies**, as asked:
1. **Denial** — postgres's `ERROR: permission denied for table reviews` (upstream's proxy).
2. **Positive role assumption** — `select current_user` returns `orders_products_access`.
   This one is decisive in a way the denial is not: a denial is a shape many
   unrelated failures produce (ARM 2 denies too, with different text), whereas the
   role name can only appear if `set-role-if-supported!` actually assumed it.

## Strengthening beyond upstream (declared)

One addition, marked inline in the spec: the `select current_user` →
`orders_products_access` assertion at the end of test 1. Upstream proves
impersonation only through the denial text. On a security surface I judged a
single negative proxy insufficient, and the brief permits strengthening when
declared. Nothing was dropped, weakened, or merged.

## Fidelity notes / port drift ruled out

- **Case sensitivity is load-bearing.** `cy.findAllByTestId("header-cell").contains("Subtotal")`
  is case-**sensitive** substring; Playwright's `hasText` with a **string is
  case-INsensitive**. The spec asserts `"Subtotal"` (MBQL display name) in one place
  and lowercase `"subtotal"` (postgres column) in another — a string port would have
  made the two interchangeable and stopped distinguishing the MBQL and native paths.
  Ported as regexes `/Subtotal/` and `/subtotal/`, preserving case sensitivity.
- **`cy.wait("@query")` is a queue that pops past responses.** Ported as
  `page.waitForResponse` promises constructed *before* each `reload()`, which gives
  the same ordering guarantee without replay semantics.
- **`NativeEditor.type("{selectall}{backspace}")`**: `pressSequentially` inserts at
  caret 0 whereas `cy.type` appends, so the editor is explicitly clicked,
  `ControlOrMeta+a`, `Backspace`, then typed with `{focus:false}`.
- Upstream's bare `cy.findByText(...)` (no `.should`) is a real assertion —
  `findByText` throws when absent — so `toBeVisible()` is faithful, not a
  strengthening.
- The **duplicated beforeEach** (outer describe restores/activates, inner does it
  all again) is preserved rather than deduplicated: `restore` resets the token and
  the permission graph, so collapsing them would change the state the permission
  write lands on.
- `createTestRoles()` in the ported helper takes **no arguments** (postgres baked
  in), unlike upstream's `createTestRoles({type:"postgres"})` — caught by tsc.

## Verification

- `bunx tsc --noEmit` → clean.
- Dead-import hand-audit (tsc is silent on these): 21 imports in the spec, 7 in the
  support module, **0 dead**.
- Green: 2 passed. `--repeat-each=3`: **6 passed**, no flake.
- Jar verified **by identity**: `version.properties` `hash=751c2a9`, matching the
  briefed `COMMIT-ID 751c2a98`. (Repo HEAD is `09a06cd472a` — the jar is older, as
  expected.)
- Mutated file restored **byte-identical** after **each** mutation, md5 re-verified
  `dcf4532e2088eb26afb022265f4fe703` all three times. (`support/impersonated.ts`
  now hashes `1844cc48e6c2cd5a5e295b2166be2523` — that is the *later, deliberate*
  docstring edit recording the "All Users" name drift, made after all mutation work
  was complete, not mutation residue.)
- Shared warehouse: this spec creates only the pre-existing `orders_products_access`
  role via the idempotent `CREATE ROLE IF NOT EXISTS` SQL, and drops no schemas.
  Port 4000 never touched.

## Unexplained

Nothing material left unexplained. The one initially-suspicious signal — a 4-5s
green for a test doing two snapshot restores — was probed and is accounted for:
`restore` is an H2 `RUNSCRIPT` against a warm reused backend, and the runtime moves
in the expected direction under mutation (MUT-C 11-15s when queries actually return
data, MUT-B ~0.4s when it dies in setup). The timing responds to the input, so it
is not a no-op green.

## Summary

Ported both tests faithfully; they genuinely measure connection-impersonation
enforcement — MUT-C (unblocking the user's other group, the exact historical
defect) kills both at their real security assertions, with a second positive proxy
showing postgres assumed the `orders_products_access` role.
Every group/db id is read from the fixture or re-derived from the live instance at
run time; the briefed 4-vs-5 hazard is confirmed real and avoided, and I found a
related name drift ("All Users" vs "All internal users") that makes the checked-in
instance JSON unsafe for name lookups.
The `signInWithCredentials` jar hazard is inapplicable here by mechanism
(`impersonated` is in `LOGIN_CACHE`, and the API context is not `context.request`),
proven by four `GET /api/user/current` identity checks rather than by argument.
