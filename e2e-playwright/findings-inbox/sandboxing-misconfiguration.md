# sandboxing-misconfiguration — port findings (slot 2, port 4102)

Source: `e2e/test/scenarios/permissions/sandboxing/sandboxing-misconfiguration.cy.spec.ts` (103 lines, 1 test)
Target: `e2e-playwright/tests/sandboxing-misconfiguration.spec.ts`
Support module: **`support/sandboxing-misconfiguration.ts`** — matches the expected name, nothing to flag.
Jar verified BY IDENTITY: `version.properties` `hash=751c2a9` vs `COMMIT-ID 751c2a98`. ✅

## 3-line summary

Ported green (3/3 under `--repeat-each=3`, tsc clean). The decisive "remove the restriction" mutation dies,
and so do three others; two of the four assertions' halves were each shown to kill a mutant the other lets
through, so nothing in the test is redundant. Two real findings: the token gate bites at `advanced_permissions`
**before** `sandboxes` (the source trace alone predicts the wrong death site), and the upstream
`rowsShouldContainOnlyOneCategory` is **vacuous on an empty result set** — a hole this port measured but,
per the faithfulness rule, did not silently patch.

## Collision checks

- `grep -rl "sandboxing-misconfiguration" tests/ support/` → **no hits**. No existing port of my source. ✅
- `ls tests/ support/` → `sandboxing-via-ui.spec.ts` + `support/sandboxing-via-ui.ts` and
  `sandboxing-via-api.spec.ts` + `support/sandboxing-via-api.ts` present. Read `sandboxing-via-ui.ts` in full
  and reused it **read-only** (imported, never edited). `sandboxing-via-api` deliberately **not** inherited
  from — its green is flagged UNVERIFIED in the brief and I had no reason to re-open that.
- No shared support module edited. PORTED.txt / QUEUE.md / playwright.config.ts untouched. Nothing committed.
  Port 4000 never touched.

## Fixture ids and their sources

| id | value | source |
|---|---|---|
| `WRITABLE_DB_ID` | 2 | `support/schema-viewer.ts:11`, mirroring `e2e/support/cypress_data.js` |
| `ALL_USERS_GROUP` | 1 | `support/sandboxing-via-ui.ts:84` (mirrors `cypress_data.js:42-49`) |
| `COLLECTION_GROUP` | 5 | same |
| `READONLY_GROUP` | 7 | same |
| products `table_id` | 199 (runtime) | **resolved at runtime** via `getTableId({databaseId: 2, name:"products", schema:"public"})` — never typed in |
| products field ids | runtime | read from `/api/table/199/query_metadata` |

**No id was guessed.** All four group ids are additionally re-checked against the live instance every run by
`assertUserGroupIds` (`GET /api/permissions/group`, matched by name) — so the `USER_GROUPS` vs
`MAGIC_USER_GROUPS` trap from the brief cannot bite silently here. `DATA_GROUP` is **not** used: this spec
selects the sandboxed group by NAME (`modifyPermission(page, "data", 0, …)`), so I removed it from the
module's re-export surface rather than leave a dead id lying around.

⚠️ `blockUserGroupPermissions(api, group, databaseId)` defaults its third argument to **SAMPLE_DB_ID**.
This spec never touches the sample database. A dropped third argument would block the wrong database, leave
the writable database wide open, and the test would still be green. It is passed explicitly and the hazard is
commented at the call site.

## Proof of which user each API call ran as

I used the imported `signInAs` (throwaway request context), **not** `signInWithCredentials`. Both ends are
pinned in the test body every run — this is the strengthening the brief calls for on a security surface, and
it is stated in the spec header as an addition the upstream does not have:

```
await assertRunningAs(api,    gizmoViewer.email);      // GET /api/user/current -> alice@gizmos.com
await assertRunningAs(mb.api, "admin@metabase.test");  // GET /api/user/current -> admin, i.e. mb.api NOT hijacked
```

Both pass. So the two `getCardResponses` calls — the ones the whole test rests on — provably run as the
sandboxed user, and `mb.api` provably remains admin. I did not take the neighbouring spec's word for the
cookie-jar mechanism; `assertRunningAs(mb.api, …)` is the direct check that it held on this backend.

## Gate mapping + gate-OFF control

| gate | mapping | control |
|---|---|---|
| `H.restore("postgres-writable")` + direct writable-postgres DDL | `test.skip(!PW_QA_DB_ENABLED)` at **describe** level | **run without `PW_QA_DB_ENABLED` → `1 skipped`, clean** ✅ |
| `H.activateToken("pro-self-hosted")` | `test.skip(!resolveToken("pro-self-hosted"))` at **describe** level | see two-arm control below |

Both skips are declared **ahead of** the `activateToken` call, per the brief.

⚠️ **Describe-level was required, not merely preferred.** The brief's rule ("if the describe has an
`afterEach`, skip at DESCRIBE level; else `beforeEach` is safe") is **inapplicable as stated here** — I checked
the mechanism rather than the surface. There is no `afterEach`, but the heavy build lives in `beforeEach`
(because `mb` is test-scoped and unusable from `beforeAll`), and a `beforeEach`-level skip would run the
restore + DDL + resync + snapshot *before* skipping. Describe level is what actually prevents that.

## Token predicate, arms, feature count

Source trace: `upsert-sandboxes!` is `(defenterprise … :feature :sandboxes)` at
`enterprise/backend/src/metabase_enterprise/sandbox/models/sandbox.clj:172-176`; the OSS implementation at
`src/metabase/permissions_rest/api.clj:56` errors. The QP middleware separately calls
`(premium-features/assert-has-feature :sandboxes)` at `…/query_processor/middleware/sandboxing.clj:431`.

🔴 **The trace alone predicts the wrong death site.** Two arms measured:

- **Arm A (token ON)** — green.
- **Arm B (`activateToken` removed)** — dies **earlier than predicted**, in setup, at
  `PUT /api/permissions/graph → 402 "The blocked permissions functionality is only enabled if you have a
  premium token with the advanced-permissions feature."` So the first thing the token buys this spec is
  **`advanced_permissions`** (for `blockUserGroupPermissions`), not `sandboxes`.
- **Arm B2 (`activateToken` removed AND `preparePermissions` skipped, to reach the policy UI)** — dies at the
  permissions dropdown: **"Row and column security" is simply absent**. That is the FE half of the
  `:sandboxes` gate, and it agrees with the BE half from the source trace.

So the token is load-bearing at **two independent points**. Both are real; neither alone explains arm B.
The spec header was corrected to say this (my first draft asserted only the `sandboxes` predicate — that
claim was wrong about *where* it bites, and the arms are what caught it).

**Final feature count for this slot: 42 enabled of 59 keys** (`pro-self-hosted`). Measured, not matched — the
brief flagged 42 vs 52 as disputed; 42 is what this token yields here. `sandboxes: true`,
`advanced_permissions: true`. (My first probe printed `advanced-permissions: None` — that was my own
hyphen-vs-underscore lookup error, not a finding; the key is `advanced_permissions`.) No token value printed.

**Token restored:** every run's build path re-activates the token and re-takes the snapshot, and the final
state on :4102 is a baseline run with `sandboxes: true` — verified by the feature dump above, taken after the
last green.

## Absence assertions and their positive anchors

Only one absence-shaped assertion exists in this spec, plus one I added in the helper:

| absence assertion | positive anchor |
|---|---|
| `expect(rows).toHaveLength(0)` (fail-closed) | `expect(responses).toHaveLength(questions.length)` immediately before the loop — an empty `responses` array cannot make the `for` loop vacuously pass. Plus `error_type` must match `/^(driver\|invalid-query)$/`, which no pre-fetch/empty shape satisfies. |
| `tableItem.count() === 0` branch in `configureSandboxPolicyOnColumn` | `await expect(page.getByRole("menuitem").first()).toBeVisible()` before branching — so a **pre-render empty sidebar** cannot decide which navigation shape to take. This is exactly the "zero-assertion satisfied on its first poll" trap; the branch is a decision, not an assertion, so it needed the anchor even more. |

## Mutation results

Verifier sanity-checked **before** use: aborts on 0 matches, aborts on >1 match, aborts on no-op, validates
before writing, and left the file md5-unchanged on both abort paths. Every mutant restored byte-identical
(`md5 e580f46bc28eb687c0dbf1559e14abe9` re-verified after each).

| # | mutation (input inverted, not assertion) | result | died where |
|---|---|---|---|
| M1 | **remove `configureSandboxPolicyOnColumn` entirely** — the decisive "remove the restriction" | ☠️ killed | `is_sandboxed` expected true, got false |
| M3 | `attributeValue: "Gizmo"` → `"Widget"` | ☠️ killed | **row-content** check ("Every result should have a Gizmo") — `is_sandboxed` was *true* here, so this is a genuinely **independent second proxy**, as the brief requires |
| M2 | don't drop the column | ☠️ killed | `rows` length 0 vs 1 |
| M4b | `attributeValue: "Doohickey"` (matches nothing) **and** don't drop the column | ☠️ killed | **only** the `error_type` assertion — the `rows` half passed (0 rows) |

M4b is the one that earns its keep: it proves the two halves of `assertResponseFailsClosed` are **not
over-determined**. `rows.length === 0` alone cannot distinguish "failed closed" from "legitimately empty",
and `error_type` alone is what does. Each half kills a mutant the other survives.

**Runtime as a tell:** all mutants died in ~3s, same as the baseline — no mutant "survived by timing out",
and no green was suspiciously faster than the mutants.

### 🔴 Vacuity found (upstream, reported not patched)

M4b also exposed that upstream's `rowsShouldContainOnlyOneCategory` is **vacuous on an empty result set**:
`rows.every(...)` on `[]` is `true` and `!rows.some(...)` on `[]` is `true`, so a sandbox that returns zero
rows passes the "shows only Gizmos" assertion. In M4b the pre-drop assertion passed with **zero rows** and the
test proceeded. Per the faithfulness rule this is reported rather than silently strengthened — the helper is
shared (`support/sandboxing-via-ui.ts`) and I was not to edit it. A future fix would add a
`rows.length > 0` positive anchor there; it would strengthen `sandboxing-via-ui` too.

### Bad mutation I ran, called out

My first framing of the token control (arm B) was a **poor isolation**: removing `activateToken` changes two
things at once, so its death at `advanced_permissions` told me nothing about `sandboxes`. Arm B2 was needed to
separate them. I am recording arm B as inconclusive-on-its-own rather than pretending it demonstrated the
sandboxes gate.

## Port deviations (all deliberate, all stated in-file)

1. **Schema-aware navigation** (`configureSandboxPolicyOnColumn`, my module). Upstream's helper goes straight
   from `/admin/permissions/data/database/2` to `menuitem[name="Products"]`. On this harness that **timed out**,
   and the cause is environmental, not port drift: `writable_db` is shared and never reset
   (`resetWritableDb` unported), so it has accumulated 29 debris schemas from neighbouring specs. Measured —
   `/admin/permissions/data/database/2` lists `["Domestic","public","Schema A"…"Schema Z","Wild"]` and **no**
   tables; `/…/schema/public` then lists `Products`, `IP Addresses`, `Many Data Types`, `Scoreboard Actions`, …
   (themselves debris from other ports). The schema click is **conditional**, so in a clean single-schema
   environment the flow is byte-for-byte upstream's. Written in my own module — the shared
   `sandboxing-via-ui.ts` was not touched. Only the `filterTableBy: "column"` branch is reproduced (the only
   branch this spec takes); the `custom_view` branch is not ported here — porting it would be gold-plating.
2. **`setUpProductsTable()` re-run after every restore.** The physical table is in the warehouse, which is not
   part of the app-DB snapshot, so the test's `ALTER TABLE … DROP COLUMN category` is **not** undone by
   `restore(snapshot)`. Upstream has the same latent hole (harmless there because the file has one test and CI
   resets the warehouse). Honest caveat recorded in-file: under `--repeat-each=3` each repeat landed on a
   **fresh worker**, so `built` was false every time and the `built === true` path is not what those greens
   exercised. The rebuild is still required for a reused worker.
3. **`assertRunningAs` on both clients** — added, not upstream; strengthening on a security surface, declared.
4. **`waitForSyncedField` after `resyncDatabase`.** Upstream is `resyncDatabase({tableName: "products"})`,
   which gates on "a table named products has `initial_sync_status` complete" — satisfied on the **first poll**
   by the snapshot's own stale `products` row. Honest limit: my added poll checks the *field* set, and in the
   steady state the stale row also carries a `category` field, so it does **not** catch that specific case
   either. It is a real guard for a shape-changed table and no guard at all for a shape-identical one. Recorded
   as a partial mitigation rather than a fix.

## Fixmes / unexplained

- **`json_query` is absent** from `POST /api/card/:id/query` response bodies here, so the helper's
  `questionDesc` renders as `(query: undefined)` in failure messages. Cosmetic only — it appears solely inside
  assertion message strings and never in a predicate. Not chased further; recorded rather than explained away.
- **Shared-warehouse hazard (pre-existing, not introduced).** `tests/question-reproductions.spec.ts:703`
  rebuilds the **same** `public.products` table in the same shared `writable_db`. The two specs must not run
  concurrently on different slots. This is the same table upstream drops, so the port does not add the hazard,
  but it is now a second occupant of that table name. Flagged in the module docstring.
- Both specs only touch their own `public.products`; **no foreign schema was dropped**, per the standing rule.

## Verification

- Baseline: **green**.
- `--repeat-each=3`: **3 passed** (11.6s), re-run green after the final import trim.
- `bunx tsc --noEmit`: **exit 0**.
- Dead-import hand-audit (tsc is silent on these): scripted import-vs-usage check over both files → found one
  dead re-export (`DATA_GROUP`), removed; re-ran tsc and repeat-each after the trim. Zero dead imports now.
- Gate-OFF control: `1 skipped`.
