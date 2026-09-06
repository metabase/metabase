# view-data-permissions (slot 4, port 4104)

Source: `e2e/test/scenarios/permissions/view-data.cy.spec.js` (1060 lines)
Target: `e2e-playwright/tests/view-data-permissions.spec.ts` (21 tests)
Helpers: `e2e-playwright/support/view-data-permissions.ts`

Artifact: `target/uberjar/metabase.jar`, `COMMIT-ID 751c2a98`; slot backend
verified by `ps` (`-jar .../target/uberjar/metabase.jar`) **and**
`/api/session/properties` → `version.hash = 751c2a9`. Not taken on trust from
`JAR_PATH` (the `PW_KEEP_SLOT_BACKENDS` trap).

## Pre-flight

- **No existing port.** `ls tests/ | grep view-data` → empty. Nothing overwritten.
- **No basename sibling.** `e2e/test/scenarios/permissions/` contains exactly one
  `view-data.*` file (`view-data.cy.spec.js`). There *is* a `.js`/`.ts` sibling
  pair in that directory — `permissions-reproductions.cy.spec.js` and
  `.cy.spec.ts` — but that is a different spec and already ported.

## Infra tier — the brief's `@external` classification is HALF right here

Unlike the four previous mis-classifications, this one is partly genuine, so
stating it precisely matters:

| Tier | Tests | Evidence |
|---|---|---|
| **No container** | **15** | `H.restore()` (default H2 snapshot) + admin permissions UI only |
| **QA Postgres 12** | **6** | `H.restore("postgres-12")` **and** `H.createTestRoles({type:"postgres"})`, which opens a real connection to `postgres://localhost:5404` and runs `CREATE ROLE orders_products_access` |

The QA-DB six are the whole `impersonated` describe (5) plus the second
`reproductions` test (1). The `postgres_12.sql` snapshot exists in
`e2e/snapshots/`, and `metabase-e2e-postgres-sample-1` was up on 5404, so these
are **really executed here**, not gated away.

`createTestRoles` has no `cy.task` equivalent in this harness; ported with a
lazy `require("knex")` against `QA_DB_CONFIG.postgres`, the same pattern
`support/actions-on-dashboards.ts` and `support/custom-column-reproductions-1.ts`
already use. SQL copied verbatim from `e2e/support/test_roles.js`.

**No maildev / mongo / snowplow dependency anywhere in this spec.**

## Executed vs gate-skipped (both directions measured)

| Run | Result |
|---|---|
| `PW_QA_DB_ENABLED=1` | **21 passed** (32.7s) |
| gate OFF (control) | **15 passed, 6 skipped** (23.3s) |
| `PW_QA_DB_ENABLED=1 --repeat-each=2` | **42 passed** (1.1m) |

The gate-OFF control skips exactly the 6 QA-DB tests — the gate is wired to the
right describes, and the other 15 genuinely need no container.

`tsc --noEmit`: clean (exit 0, no output).

State restoration verified: the spec mutates the permission graph in nearly
every test, and consecutive full runs (plus the repeat-each run, which followed
six mutant runs) were green — the slot is not poisoned. Slot explicitly
restored to `default` afterwards.

## Token gate: REAL, and proven by removal

Not by "activateToken didn't throw" — that call PUTs with
`failOnStatusCode:false` and cannot throw.

1. **Measured the flip.** `/api/session/properties` → `token-features` via
   `curl`: **0/59 true** before any run, **42/59 true** after
   (`advanced_permissions: true`, `sandboxes: true`). Read with a real JSON
   parse over `curl`, not `(await mb.api.get(url)).body[x]` (`.body` is a
   method — that idiom manufactures an empty result that reads as a failed token).
2. **Removed it (mutant M1).** Stripped every `activateToken` and every
   `test.skip(!resolveToken(...))` from a copy of the spec:
   **14 of the 15 executable tests failed.** The single survivor is the
   deliberately token-less `granular` describe, which asserts the EE-only
   "View data" column is *absent* — semantically the right one to survive.
3. **Corroborated independently**: `POST /api/testing/restore/default` alone
   took `token-features` from 42 true back to **0** — confirming restore resets
   `premium-embedding-token`, which is what lets the token-less `granular`
   describe work.

**Token gating did not need to generalise from a sibling — it was measured here.**

## FINDING: `H.assertPermissionTable` never compares the trailing column — 6 expected values, 5 rendered cells

This is the substantive finding, and it is **measured, not inferred**.

`H.assertPermissionTable` (`e2e-permissions-helpers.js`) iterates the **actual**
DOM cells and indexes into the expected array:

```js
getPermissionRowPermissions(item).each(($permissionEl, index) => {
  cy.wrap($permissionEl).should("have.text", permissions[index]);
});
```

Every permission table in this spec renders **5** `permissions-select` cells
(Playwright: `locator resolved to 5 elements`). Several of the spec's
expectation rows list **6** permission values, e.g.

```js
["Sample Database", "Granular", "No", "1 million rows", "No", "No", "No"]
//                   1          2      3                 4     5     ^ never compared
```

`.each` runs 5 times, so `permissions[5]` is **never read**. The 6th value is
dead weight — it asserts nothing.

**Proved with a deliberately-surviving mutant (M5).** Changed that trailing
value to `"MUTANT-M5-GARBAGE"` in the legacy-no-self-service test's
`finalExpectedRows`. **The test still passed.** That is the "vacuous, or bad
mutation?" question answered in the vacuous direction, by measurement.

The same-semantics rule applies: **Cypress behaves identically, so this is
vacuous upstream too** — not port drift, not a Playwright weakness. Ported
verbatim with the analysis inline (`support/view-data-permissions.ts`), per the
rule that an upstream vacuous assertion on a security surface must not be
silently strengthened — doing so would hide that it had been disabled.

**Note for the consolidation pass:** `support/create-queries.ts`'s
`assertPermissionTable` iterates the **expected** array instead, i.e. it would
resolve `cells.nth(5)` against a 5-cell row and time out. Neither shape matches
upstream. That is why this spec carries its own copy (documented in the helper).
The two copies now differ in observable behaviour and should be reconciled —
ideally by fixing the *upstream* expectations to 5 values and making the helper
strict, which is a product-repo change rather than a port change.

## FINDING: `H.assertPermissionForItem`'s 4th argument is silently discarded (12 call sites)

The helper's signature is three parameters:

```js
export function assertPermissionForItem(item, permissionColumnIndex, permissionValue)
```

`view-data.cy.spec.js` calls it with a **fourth** argument in 12 places:

```js
H.assertPermissionForItem(g, CREATE_QUERIES_PERM_IDX, "No", true);
//                                                          ^ meant to be "and it is disabled"
```

JS discards extra arguments, so **the disabled-ness is never asserted anywhere
in this spec** — including in `removeCollectionGroupPermissions`, which is the
setup for all three enforcement tests. The spec title
*"should allow saving 'blocked' and **disable create queries dropdown when set**"*
names a behaviour its assertions do not check. A working
`H.isPermissionDisabled(row, index, permission, isDisabled)` exists and is used
elsewhere in the same file — the intent was clearly to call that.

Same family as #25/#53 (helpers silently discarding arguments) and directly
adjacent to #87 (two sandboxing security assertions disabled by typo). Ported
verbatim — the 4th arg simply isn't passed — with the upstream call recorded in
a comment at each site.

## Mutation testing

Every mutant inverted the **input**, never the expectation (except M5, which was
a deliberate vacuity probe). Where each died was checked, and follow-ups were
aimed at tails.

| # | Mutation | Result | **Where it died** |
|---|---|---|---|
| **M1** | Remove the EE token entirely | **KILLED** — 14/15 fail | broad; 1 correct survivor (the OSS `granular` test) |
| **M2** | **Remove-the-permission probe**: `removeCollectionGroupPermissions` made a no-op — the block is never applied | **KILLED** — all 3 enforcement tests | at the **security assertion itself** (`lackPermissionsView` → "Sorry, you don't have permission to run this query."), *not* at setup |
| **M3** | 46450: never raise create-queries to "Query builder only" | **KILLED** | at the **tail** (spec:1159, the *second* assertion — `Expected "Query builder only", Received "No"`); the first assertion still passed |
| **M4** | sandboxed/group-focused: never raise create-queries to "Query builder and native" | **KILLED** | **early** (spec:997, the "Change access…" modal) — recorded as an early kill, not claimed as tail coverage |
| **M5** | Corrupt the trailing (6th) expected permission value | **SURVIVED — intended** | proves the vacuity finding above |
| **M6** | "infer parent permissions": set Orders to "Blocked" instead of "Can view" | **KILLED** | at the **tail** (spec:405, the final `assertPermissionTable`) |

M2 is the one the brief asked for and it is the strongest result here: the
enforcement tests fail *at the restriction assertion* when the restriction is
removed, so they observe the restriction rather than a coincidence of fixture
data.

M6 was added specifically because M4 died early — it confirms
`assertPermissionTable`'s **checked** cells (0–4) are load-bearing even though
cell 5's expectation is not.

## Port notes / deliberate divergences

- **`cy.intercept` registered AFTER `cy.reload()`** (legacy-no-self-service,
  upstream lines 514–529). Cypress queues commands, so the intercept lands a
  tick after the reload resolves and beats the app's graph fetch only by a race
  (React has to boot first). The port registers the route **before** the reload
  — same intent, deterministic. Documented at the site.
- **Duplicate describe title.** Upstream declares
  `"scenarios > admin > permissions > view data > granular"` **twice** (once
  token-less, once EE). Test titles differ so this isn't Playwright's
  duplicate-title load error, but the two suites are indistinguishable in
  reports; the second is suffixed `(EE)`.
- **`isQbQuestion`** is a parameter of both
  `assertCollectionGroupUserHasAccess` / `assertCollectionGroupHasNoAccess` and
  is never read by either. Kept in the signature so call sites read identically.
- **Upstream's unconfirmed save** in `sandboxed > database focused view`: it
  clicks "Save changes" and immediately asserts the table without dismissing the
  confirmation modal. Ported as written.
- `cy.button("Save")` vs the edit bar's "Save changes": testing-library's
  `findByRole` name matching is exact, so `{ exact: true }` keeps them distinct —
  and Playwright strict mode would have caught it had they collided (the FINDINGS
  #6 hazard from this same domain). They don't.

## No fixmes

All 21 tests pass on the jar, both gate states, and under `--repeat-each=2`.
No `test.fixme`, no product-bug claim, nothing unexplained. No Cypress
cross-check was run (standing rule — `H.restore()` would re-point database 1 at
the shared H2 file and break the four live sibling slots); none was needed,
since nothing failed.

## 3-line summary

Ported 21 tests 1:1; 15 need no container and 6 genuinely need QA Postgres 12
(the `@external` tag is honest here, unlike the four prior mis-classifications),
all 21 green on the jar and under repeat-each=2, tsc clean.
The EE token gate is real — measured by removal (14/15 fail token-less) and by
`token-features` going 0→42→0, not by `activateToken` not throwing.
Two upstream holes found and ported verbatim with analysis: every
`assertPermissionTable` row carries one expected value more than the table has
columns and it is **never compared** (proved by a surviving mutant), and
`assertPermissionForItem`'s 4th "is disabled" argument is discarded at 12 call
sites — so the spec never checks the disabling its own title names.
