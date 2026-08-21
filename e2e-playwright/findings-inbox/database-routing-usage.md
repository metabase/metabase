# database-routing-usage — port report (slot 1, port 4101)

Source: `e2e/test/scenarios/admin/database-routing/database-routing-usage.cy.spec.ts` (405 lines)
Target: `e2e-playwright/tests/database-routing-usage.spec.ts`
Support module: **`support/database-routing-usage.ts`** — matches the spec basename, as required.

## Summary (3 lines)

Ported 4/4 tests; green, and green under `--repeat-each=3` (12/12). Four of five
mutations killed tests, each at the expected assertion; the fifth survived and a
presence probe proved *why* — an upstream test that signs in as a user and then
asserts without re-visiting the question, so the `__METABASE_ROUTER__` case is
vacuous. One real harness gotcha found and worked around: signing a user in
through `mb.api` poisons the API request context's cookie jar and silently
rebinds every later "admin" API call.

## Collision checks

- `grep -rl "database-routing-usage" tests/ support/` → no hits before I started
  (only my own files after). No uncommitted port of this source exists.
- `ls tests/ support/` — siblings `tests/database-routing-admin.spec.ts` +
  `support/database-routing-admin.ts` and `tests/database-writable-connection.spec.ts`
  exist and are ports of *different* sources. Read them; reused
  `database-routing-admin.ts` **read-only** (`configureDbRoutingViaAPI`,
  `createDestinationDatabasesViaAPI`, `BASE_POSTGRES_DESTINATION_DB_INFO`,
  `QA_POSTGRES_PORT`, `ALL_USERS_GROUP`). No shared module edited; PORTED.txt /
  QUEUE.md / playwright.config.ts untouched; nothing committed.

## What the `beforeEach` actually restores

The tag says `@external`, and that is right, but it is not the whole story.

- `before()` (once): creates three **real postgres databases** on the QA
  container (`lead`, `destination_one`, `destination_two`), each with an
  identical `db_identifier` table, a `blue_role` role and an RLS policy; then
  `H.restore("postgres-writable")`, activates the **pro-self-hosted** token,
  creates 5 users, adds `lead` as a Metabase database, configures routing on it,
  creates 2 destination databases through the EE routing API, adds
  `destination_one` as a normal database, and finally `H.snapshot("db-routing-3-dbs")`.
- `beforeEach` restores **`db-routing-3-dbs`** — the spec's *own* snapshot, not
  `postgres-writable`. So the token, the users, the routing config and the
  destination databases are all baked into what each test restores.

Ported with the established snapshot-build idiom (module-level `snapshotReady`
guard in the first `beforeEach`). The `e2e/snapshots/db_routing_3_dbs.sql`
artifact already existed on disk; my runs rewrote it (confirmed by mtime). No
committed snapshot was regenerated.

## Gate mapping, with the gate-OFF control

| gate | executed | skipped |
|---|---|---|
| `PW_QA_DB_ENABLED=1` (ON) | **4** | 0 |
| gate OFF (unset) | **0** | **4** |

The difference is exactly the four gated tests, so the ON run is real coverage,
not silent skipping.

Token: the `pro-self-hosted` token is activated *inside* the snapshot build, so
it is part of the restored state rather than a per-test step.

## Token predicate, and how I traced it

Traced from the feature name to the getter to the enforcement point:

1. `src/metabase/premium_features/settings.clj:250` —
   `(define-premium-feature enable-database-routing? "…" :database-routing)`.
2. The macro defaults `:getter` to `default-premium-feature-getter`, which is
   `(and config/ee-available? (has-feature? feature))`
   (`settings.clj:89-92`), and `has-feature?` is a plain
   `(contains? (*token-features*) (name feature))` (`token_check.clj:662`).
   **No `is-hosted?` (or any other) short-circuit** — unlike the
   `transforms-basic` case (#106), this genuinely gates.
3. Enforcement is not just FE visibility: `attach-destination-db-middleware`
   (`enterprise/.../database_routing/middleware.clj`) is declared `:feature :none`
   *specifically so it still runs without the feature*, and then calls
   `(premium-features/assert-has-feature :database-routing …)` whenever routing
   is configured — the comment says "Throwing here is better than silently
   ignoring the configured routing". So on a token without `database-routing`
   every routed query 402s rather than quietly falling back. This is the
   `writable_connection` shape (#124), not the `transforms-basic` shape.
4. Sandboxing and impersonation in tests 3/4 additionally need `sandboxes` and
   `advanced-permissions`; `pro-self-hosted` carries all three.

Backend on :4101 reported `database_routing`, `sandboxes`,
`advanced_permissions` all true (42 of 59 features ON), so the "`ON (0)` means
no token activated" failure mode did not arise. No token values printed.

## `GET /api/database` before / after

Before (slot-1 backend, left in `postgres-writable` state by a previous run):

```
1  Sample Database      h2
2  Writable Postgres12  postgres  (dbname=writable_db)   ← confirms WRITABLE_DB_ID=2 IS the writable container here
```

During the run (after a `db-routing-3-dbs` restore):

```
1  Sample Database   h2
2  Writable Postgres12  postgres
3  lead              postgres (dbname=lead)
6  destination_one   postgres (dbname=destination_one)
```

Note the two databases created through
`POST /api/ee/database-routing/destination-database` do **not** appear in
`GET /api/database` — router destinations are hidden from the list; only `lead`
(the router) and the separately-added `destination_one` are listed.

After (restored to `default` and cleaned):

```
1  Sample Database   h2
```

Container-level cleanup (these are cluster-wide state shared with the other
slots, and none of them existed before I started — verified by listing
`pg_database` first):

- `lead`, `destination_one`, `destination_two` — **dropped** (needed
  `pg_terminate_backend` scoped to those three datnames first, because the
  Metabase pool still held sessions). `pg_database` is back to
  `postgres/sample/template0/template1/writable_db`, exactly as found.
- `blue_role` — **dropped**. Grepped first: only this spec's helpers and the
  Cypress snapshot reference it, so nothing else depended on it.
- No schemas were created in `writable_db`, so this port is not a #85 debris
  source.

## Findings

### 1. HARNESS GOTCHA (cost me one full run): `signInWithCredentials` poisons `mb.api`

`support/sandboxing-via-api.ts:signInWithCredentials` issues its
`POST /api/session` **through the passed `MetabaseApi`**, i.e. through the
test-scoped `request` fixture, which has its own cookie jar. The response sets
`metabase.SESSION` in *that* jar. And
`metabase.server.middleware.session/wrap-session-key` resolves
`:embedded-cookie → :normal-cookie → :header` (session.clj:78-84) — **cookie
before header**. So from that point on every `mb.api` call runs as the
signed-in user regardless of `X-Metabase-Session`, and `mb.signInAsAdmin()`
does **not** fix it (it only rewrites the *browser context's* cookies and the
harness's header).

Observed as `POST /api/card → 403 "You cannot save this Question because you do
not have permissions to run its query"` and `GET /api/permissions/graph → 403`,
in three of four tests, with `actual-perms` showing a router user's collection
permissions.

Workaround in this port (no shared module edited): the local `signInAs` posts
through **`context.request`**, which shares the *browser context's* jar — which
is where this spec wants the cookie anyway, and which `mb.signInAsAdmin()` does
overwrite.

**This is worth chasing beyond this spec.** Any port that calls
`signInWithCredentials` and then does admin API work afterwards is silently
running that work as the non-admin user. It will only surface as a failure when
the call happens to need admin rights.

### 2. Upstream vacuity kept verbatim: the `__METABASE_ROUTER__` assertions

Both halves of "should route users to the correct destination database" do:

```js
signInAs(DB_ROUTER_USERS.userWithMetabaseRouterAttr);
cy.get('[data-column-id="name"]').should("contain", "lead");        // no visit!
```

There is no `H.visitQuestion` between the session swap and the assertion, so the
page still shows the **admin's** previously-rendered result. The assertion passes
regardless of what that user would actually see. Ported verbatim (Playwright
behaves identically — a cookie swap doesn't reload), with the analysis inline in
the spec. **Not strengthened.** Mutation 4 + its presence probe below is the
proof, not an inference.

### 3. Upstream setup bug (worked around in setup only, no assertion changed)

`addQADatabase`'s post-create sync wait (`assertOnDatabaseMetadata`) picks the
database to poll with `body.data.find(db => db.engine === "postgres")` — the
**first** postgres database, which after `restore("postgres-writable")` is the
pre-existing "Writable Postgres12", never the one just added. So upstream never
actually waits for `lead`/`destination_one` to sync and races the metadata read
that follows. This port polls the database it just created, and polls the
`db_identifier` table/field lookup too. Setup robustness only.

### 4. Observed, unexplained: MBQL routing-error message renders `hidden`

`expectVisualizationError` was first written as `toBeVisible()` — a
strengthening upstream never made (`findByText` is an exactly-one **existence**
assertion). It fails on the **MBQL** half of test 1: the message node is present
(`<div class="oUD80">Database Routing error: …`, resolved 24× over the full 10s
retry window) but Playwright reports it `hidden`, while the **native** half of
the same test reports the same helper's node visible. Playwright's `toBeVisible`
is not an occlusion test, so this is a zero-size / `display:none` ancestor, not
something covering it. `QueryVisualization.tsx` renders `VisualizationError`
with an absolutely-positioned `S.spread` inside an `h="100%"` box, so a
zero-height ancestor in the MBQL layout is a plausible mechanism — but **I could
not confirm it and am recording it as unexplained rather than inventing a cause.**
The port asserts `toHaveCount(1)`, which is exactly what upstream asserts.

Worth a second look by someone with the QB layout in their head: if the error
banner really is zero-size for MBQL routing failures, that is a user-visible bug
that no existing assertion can see.

### 5. Assertion-semantics notes (recorded, not strengthened)

- `cy.get(sel).should("contain", x)` is **ANY-OF** over the collection
  (chai-jquery), and `cy.get` itself requires ≥1 match. Ported as
  "filtered subset non-empty". `should("not.contain", x)` is ported as
  "collection non-empty **and** filtered subset empty" — the non-empty half is
  `cy.get`'s own existence requirement, not an addition, and without it
  `toHaveCount(0)` would pass vacuously on a table that never rendered.
- Substring matching uses an escaped **regex**, not a bare string, so it stays
  case-sensitive like Cypress's `contain` (Playwright's string `hasText` is
  case-insensitive).
- `cy.request("GET", "api/cache?…")` in the cache test asserts nothing but the
  2xx that `cy.request` enforces by default; `api.get` enforces the same. Kept.

## Mutation testing

Every mutation was applied with an anchored replace + `count == 1` assert and
**read back from disk** before the run. Files restored from slot-prefixed
scratch copies between mutations.

| # | mutation | landed | result | died where |
|---|---|---|---|---|
| 1 | `userA.destination_database` `destination_one` → `destination_two` (route to the wrong destination — the brief's suggested probe) | ✅ verified | **kills all 4 tests** | first userA `name contains destination_one` in each test (spec:295 / 384 / 415 / 497) |
| 2 | `userA.color` `blue` → `red` (the sandbox remapping input) | ✅ verified | **kills test 3 only**; 1, 2, 4 correctly unaffected | spec:441 — `color contains blue` after the lead-db sandbox |
| 3 | RLS policy `USING (color = 'blue')` → `USING (true)` (the impersonation input) | ✅ verified | **kills test 4 only** | spec:553 — the final `color not.contains red` |
| 4 | `userWithMetabaseRouterAttr.destination_database` `__METABASE_ROUTER__` → `destination_two` | ✅ verified | **SURVIVES** | — |
| 5 | `userWrongAttribute.destination_database` `wrong_destination` → `destination_one` (valid) | ✅ verified | **kills test 1** | spec:307 — `expectVisualizationError(NO_DESTINATION_ERROR)` |

Mutations 2 and 3 landing on *disjoint* tests is the useful signal: the
sandboxing and impersonation assertions are each independently live, and neither
is riding on the routing assertions.

**Mutant 4 survives, and the presence probe answers why.** Under the same
mutation I added a single `visitQuestion(page, nativeQuestionId)` immediately
after the `userWithMetabaseRouterAttr` sign-in and re-ran: the test died at once
at spec:289 (`name contains lead`). So the surface is fully reachable and the
assertion is capable — it is the *missing navigation* (finding 2) that hides it,
not a weak assertion and not a port defect. Probe reverted.

Self-criticism on my own mutations: mutation 1 is coarse — it kills at the first
userA assertion in every test, so it says nothing about the assertions *after*
that point, which is exactly why 2 and 3 were aimed at those tails. I did not
find a mutation that exercises test 1's `userNoAttribute` branch specifically
(removing the attribute is the identity of that user, so there is nothing to
invert); its sibling `userWrongAttribute` branch is covered by mutation 5, and
the missing-attribute assertion is **not triggered by any failure mode I could
induce**.

## Verification

- `bunx tsc --noEmit` — clean.
- Dead-import check by hand (not by regex alone): all 18 imported symbols in the
  spec appear ≥2× (import + ≥1 use); spot-checked the two lowest counts
  (`createUserFromRawData`, `MetabaseApi`) against their real call sites.
- Gate-ON: 4 passed. `--repeat-each=3`: 12 passed. Gate-OFF: 4 skipped.
- Jar verified **by identity**, not by path: `ps` shows the slot-4101 JVM
  (pid 6606) running `target/uberjar/metabase.jar`, and
  `/api/session/properties` on :4101 reports `hash=751c2a9` — matches
  COMMIT-ID 751c2a98.
- Spec + support restored byte-identical after mutation testing:
  `tests/…spec.ts` md5 `0c5b1613214c17eb2ddb4c69ad67141e`,
  `support/…usage.ts` md5 `b6ffcec1cd5d49db68c892a0e7e18f20`, both matching the
  pre-mutation checksums. (The support module was then intentionally edited once
  more — an import tidy-up + a doc-comment fix — and re-verified green; that
  change is deliberate, not mutation residue.)

## Not done / caveats

- **No Cypress cross-check was run** (standing rule — it would break live
  sibling slots). I therefore **cannot** say whether upstream also sees finding
  4; nothing here implies I checked.
- Brief warnings that turned out **inapplicable** rather than banked: the
  `database-routing-admin` headless-tooltip hazard (this spec has no hover, no
  tooltip, no toggle), the three placeholder-trap variants (no form input at
  all), `cy.intercept(…, {statusCode: 500})` (no stubs in this spec), and the
  1280×720-vs-800 viewport note (no layout- or popover-position-dependent
  assertion — finding 4 is a same-viewport native-vs-MBQL difference, not a
  viewport artifact).
- The `.contains(...).should("have.attr", …)` innermost-descendant trap: grepped
  the source, no such chain here.
- No fixture ids or field names were guessed — every id (`lead` db, the
  `db_identifier` table, the `color` field) is resolved from
  `GET /api/database/:id/metadata` at build time.
