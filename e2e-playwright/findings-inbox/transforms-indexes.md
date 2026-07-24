# transforms-indexes — Playwright port (SLOT 4, :4104)

Source: `e2e/test/scenarios/data-studio/transforms/transforms-indexes.cy.spec.ts` (217 lines, 2 tests, 1 describe)
Target: `e2e-playwright/tests/transforms-indexes.spec.ts`
Support: **`e2e-playwright/support/transforms-indexes.ts`** — matches the spec basename exactly, as required.

Jar verified **by identity**, not by path: `unzip -p target/uberjar/metabase.jar version.properties` → `hash=751c2a9`,
matching COMMIT-ID `751c2a98`. Process confirmed running as `java -jar .../target/uberjar/metabase.jar`.

## 3-line summary

The `token` tag is a **red herring, proven by a two-arm control**: both tests pass with the token entirely absent,
because `/api/index/*` has no premium check at all and the transform-create check short-circuits on `(not is-hosted?)`.
Nine mutants were run: seven died (two at the very tail), one **survived as predicted**, exposing a genuinely vacuous
upstream assertion, and one was my own bad mutation which I re-ran two more ways until the mechanism was pinned down.
The spec needed one non-upstream fix — the writable warehouse is never reset here, so without it the *second* run 403s.

## Collision checks

- `grep -rl "transforms-indexes" tests/ support/` → only `support/transforms-incremental.ts` (a different basename;
  the hit is prose in its docstring referencing my source file). **No port of my source exists.** Proceeded.
- `ls tests/ support/` → no `transforms-indexes.spec.ts`, no `support/transforms-indexes.ts`.
- In-flight siblings read, not collided with: `transforms.ts`, `transforms-incremental.ts`, `transforms-inspect.ts`,
  `transforms-codegen.ts`, `transforms-template-tags.ts`, `transforms-reproductions.ts`, `transforms-permissions.ts`.
- Fixture-name collision check: `indexes_list_table` / `indexes_lifecycle_table` grepped across `e2e/` and
  `e2e-playwright/` → they appear **only** in my source spec. Upstream's literals were therefore kept **unchanged**
  (unlike the incremental sibling, which had to rename). Neither contains the substring `transform`, so
  `support/transforms.ts` `resetTransformTargetTables()` (`LIKE '%transform%'`) cannot reach them.
- No shared support module edited. `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` untouched. Nothing committed.
  Port 4000 never touched (`PW_SLOT_OFFSET=4`, all traffic on :4104).

## Gate mapping, with the gate-OFF control

| Gate | Upstream | Port | Verdict |
|---|---|---|---|
| `@external` | present on the describe | `test.skip(!PW_QA_DB_ENABLED)` | **Correct and load-bearing.** Drives the writable postgres container both through the app and directly over `pg`. |
| `token` (queue) | `H.activateToken("pro-self-hosted")` in `beforeEach` | kept, but gates nothing | **RED HERRING — see below.** |

Skip is placed at **DESCRIBE level, not in the `beforeEach`**, because this describe has an `afterEach`.

**Gate-OFF control (executed-vs-skipped, both directions):**

- `PW_QA_DB_ENABLED=1` → `2 passed` (and `6 passed` under `--repeat-each=3`). Tests **execute**; a green all-skipped
  run is not what happened.
- `PW_QA_DB_ENABLED` unset → `2 skipped`, reported as `-` (skipped), **not** as failures. This is the specific thing
  the describe-level placement buys: a `beforeEach`-level skip with an `afterEach` present reports *failed*.

## Token: predicate, arms, and final feature count

**Traced in source first.**

1. **`/api/index/*` is not gated at all.** `src/metabase/indexes_rest/api.clj` — `GET /`, `GET/POST/PUT/DELETE
   /request/:id` — contains **no** `check-feature-enabled!`, no `premium-features` require, no `api/check-superuser`.
   Its only authorization is `api/read-check` / `api/write-check` on the **owning transform**. The word "premium"
   does not appear in the namespace. Read in full, not grepped-and-assumed.
2. **The transform create is gated but short-circuits.** `transforms_rest/api/transform.clj:179` →
   `transforms.core/check-feature-enabled!` → for a `query` source, `query-transforms-enabled?`:
   `(and (setting/get :transforms-enabled) (or (not (is-hosted?)) (has-feature? :transforms-basic)))`.
   `is-hosted?` is false locally, so the `or` short-circuits and the absent `:transforms-basic` is never read.
   **This spec creates MBQL transforms only** — the `python-transforms-enabled?` arm (no short-circuit, genuinely
   402s) is **inapplicable here**. Confirmed the brief's split-by-source-type model, and confirmed which side I'm on.
3. **The FE route is not plugin-gated.** `transforms/routes.tsx` registers `:transformId/indexes` unconditionally
   (contrast the adjacent `PLUGIN_DEPENDENCIES.isEnabled` and `PLUGIN_TRANSFORMS_PYTHON` routes on the same
   switchboard), and `TransformTabs.tsx` pushes the "Indexes" tab unconditionally.

**Two-arm control — the actual evidence, not the reasoning:**

| Arm | Change | Result |
|---|---|---|
| A (as-ported) | `activateToken("pro-self-hosted")` present | **2 passed** |
| B (control) | `activateToken` line removed from `beforeEach` | **2 passed** |

During arm B, `/api/premium-features/token/status` returned **404 "Not found."** — i.e. no token at all, not merely a
weaker one. So both tests pass with premium features entirely absent. **`token` is a red herring for this file.**
The call is nevertheless **kept** in the port: upstream runs it, and a token-off port would silently diverge if the
gating ever moved. Arm B's spec edit was reverted and the file confirmed **byte-identical** (md5 back to
`264c099b…`) before continuing.

**Feature count — and a correction to the brief.** The brief states `pro-self-hosted` = **42** features. On this slot
against jar `751c2a9` I measure **52**. Qualitatively the brief is right where it matters: `transforms-basic: false`,
`transforms-python: true`, `is-hosted?: false`. I did not re-derive why 42 vs 52 differ (different slot and/or a
different token file); recording the discrepancy rather than inventing a reason. **My slot ends at valid=true,
features=52, transforms-basic=false — identical to the pre-work baseline.** No token values were printed anywhere.

⚠️ **Self-inflicted incident, disclosed.** My first token probe ran under `bun` from `e2e-playwright/` and assumed
bun would auto-load the repo-root `.env`. It does not — and in any case the tokens come from
**`cypress.env.json`**, loaded by `support/env.ts`, *not* from `.env` (whose token values that file's comment
explicitly calls stale). So `MB_PRO_SELF_HOSTED_TOKEN` was `undefined` and the probe `PUT` a `value: undefined`,
which **cleared the token on slot 4**. Detected within one command (the status endpoint started returning
non-JSON 404), re-activated immediately, and the probe was hardened to `throw` rather than PUT an empty token.
Slot 4 was verified back at 52 features before any further work. This is exactly the failure mode the brief warns
about, and it is worth propagating: **the token source in this harness is `cypress.env.json`, not `.env`.**

## Container inventory, before and after

Taken directly against the writable container (`localhost:5404/writable_db`).

| | Schemas | Tables | `Schema A` contents | `Schema A` indexes |
|---|---|---|---|---|
| **Before** | 39 | 46 | `Animals`, `inspect_sql_table`, `transform_table` | 0 |
| **After** | 39 | 46 | `Animals`, `inspect_sql_table`, `transform_table` | 0 |

**Net footprint: zero.** The 39 schemas include ~10 debris schemas (`metabase_cache_*`, `empty_schema`, `Domestic`,
`Wild`) and two foreign transform-target tables belonging to live siblings — **none of which I touched**. Confirming
the brief: `schemas[0]` is `Domestic`, not `public`; my spec pins `Schema A` explicitly everywhere.

## The one non-upstream change (declared, not smuggled)

`resetIndexesTargetTables()` in `support/transforms-indexes.ts`. **Required, and here is the proof rather than the
argument:** `POST /api/transform` hard-403s with *"A table with that name already exists."*
(`transforms_rest/api/transform.clj:183-185` → `target-table-exists?`). Cypress never hits this because
`H.restore("*-writable")` also calls `resetWritableDb` (`e2e/support/db_tasks.js:41`); **this harness's `restore()`
does not, and no port of `resetWritableDb` exists anywhere in `e2e-playwright/`**. Without the helper the *second*
execution of this spec would 403 in fixture setup. The `--repeat-each=3` run (6/6 green) is the direct evidence it
works.

It drops **two exact table names in one schema**. No `LIKE` pattern, no foreign schemas — deliberately narrower than
the `%transform%` sweep that has already bitten two siblings on this shared container.

## Mutation testing

**Verifier sanity-checked BEFORE use** (`s4-transforms-indexes-mutate.js`). Its contract is enforced in order:
abort on unreadable file → abort unless occurrences of OLD `== 1` → abort if `NEW === OLD` → only then write →
read back and confirm. Self-test results:

| Case | Expected | Actual |
|---|---|---|
| 0 occurrences | ABORT, md5 unchanged | ABORT, md5 unchanged ✓ |
| 2 occurrences (ambiguity) | ABORT, md5 unchanged | ABORT, md5 unchanged ✓ |
| `NEW === OLD` (no-op) | ABORT, md5 unchanged | ABORT, md5 unchanged ✓ |
| missing file | ABORT | ABORT ✓ |
| valid single replace | write + read-back | OK, md5 changed as expected ✓ |

md5 verified unchanged after all three abort cases. Every mutant below was applied with `count == 1`, the file read
back, and **restored byte-identical** (`264c099b3c829018bae2297fb52ba34e`) — the runner asserts the baseline md5
before mutating and after restoring, and aborts otherwise. All restores confirmed.

| # | Mutation (input-side unless noted) | Outcome | Died at |
|---|---|---|---|
| M1 | index columns `["score","name"]` → `["score"]` | **DIED** | `toContainText("score, name")` (row 1) |
| M2 | drop the `DELETE /api/index/request/:id` | **DIED** | `toContainText("Removing")` — showed `Pending` |
| M3 | row-0 columns `["name"]` → `["score"]` | **SURVIVED (predicted)** | — see below |
| M4 | remove the sort-header click | **DIED** | `toHaveAttribute("aria-sort","descending")` — got `ascending` |
| M5 | DBA index `dba_made` → `dba_other` | **DIED** | **final step**, `toContainText("dba_made")` |
| M6 | DBA index column `(score)` → `(name)` | **DIED** | **final step**, `toContainText("score")` |
| M7 | *verification-side*: `pg_indexes` schema → `Schema B` | **DIED** | `expect(rows).toHaveLength(1)` — got `[]` |
| M8/8b/8c | remove the UI transform run (three variants) | **DIED** | `toHaveCount(2)` — see "my bad mutation" |

**M3 is the headline survivor and it is not a coverage gap in my port — it is a real upstream defect.** Upstream
asserts row 0 `.and("contain", "name")` intending to check the *Columns* cell. It cannot: the same row's *Name* cell
already reads `idx_animal_name`, which contains `name`. Changing the actual indexed column to `score` leaves the test
green. **Presence probe** confirms this is "the data cannot discriminate", not "the assertion never ran": M1 proves
the sibling row's `"score, name"` check on the *same column* dies correctly, and M1/M2's failure output prints the
full rendered row (`idx_animal_scoreB-Treescore, nameManagedRemovingBobby TablesNever`), so the Columns cell is
genuinely rendered and read. Ported **verbatim with the analysis inline**; not strengthened.

**M7 is declared as the weaker, verification-side kind.** No input-side mutation lands exactly on the `pg_indexes`
assertion (the row assertions above it fire first), so I mutated the SELECT instead. It answers the narrower question
it can answer — the `toHaveLength(1)` is non-vacuous — and I am not claiming more.

**My own bad mutation, called out.** M8 (remove the whole run step) died at `toHaveCount(2)`, not at the intended
`"Succeeded"`. I did not accept the kill: I re-ran it as **M8b** (keep the tab navigation, drop only the run action)
and **M8c** (additionally `waitForURL` so navigation provably settles). Both still died at `toHaveCount(2)`. Rather
than invent a mechanism I probed the API directly — reproducing the exact state over HTTP showed `GET /api/index`
correctly returning **both** entries, so the backend was innocent. The real mechanism is on the FE and is now
confirmed in source: `frontend/src/metabase/api/transform.ts:71` — `runTransform` invalidates
`listTag("table-index")`. Without the run there is no cache invalidation, so the tab round-trip re-renders from the
RTK cache and never sees the DBA index. So the kill **is** causally downstream of removing the run, just via cache
invalidation rather than via index status. Consequence worth recording: **upstream's `toHaveCount(2)` silently
depends on the run's cache invalidation, not merely on navigation.**

**Where the mutants die.** Two land on the **final assertion block** (M5, M6), one on the `pg_indexes` tail (M7) —
the tail is covered, not just the head. **Runtime was watched as a tell throughout**: dead mutants take 12–17s
(assertion timeout burned) versus 1.5–6.7s green, and the M3 survivor completed in **2.0s** — i.e. it passed
promptly rather than by exhausting a retry window. No unbounded-absence/self-expiry pattern.

**Not independently isolated:** the `"Succeeded"` status assertion. No constructible input-side mutant runs the
transform yet leaves the request pending. M7 covers the physical outcome that `"Succeeded"` reports. Stated as a
known limit rather than papered over.

## Upstream weaknesses recorded (kept verbatim, analysis inline in the spec header)

- **(a)** row-0 `contain "name"` — vacuous, demonstrated by M3. Kept.
- **(b)** `indexesContent().should("contain", "Indexes")` — the `transforms-indexes-content` container encloses the
  `TransformHeader` tab strip, which contains a literal "Indexes" tab on every transform page regardless of payload.
  The substring is present pre-fetch. The companion long-sentence assertion is the load-bearing half. Kept.
- **(c)** `not.contain "Never"` — an absence assertion, but I **checked the mechanism** rather than pattern-matching
  the warning: `columns.tsx`'s `last-run` accessor renders `"Never"` statically for `last_executed_at == null`, in a
  table cell, with no timer and no exit transition. The self-expiry/toast hazard is **inapplicable** here.

## Fixmes / notes for the next agent

1. **`support/schema-viewer.ts`'s `queryWritableDB` is typed `Promise<void>` and discards the result set.** This spec
   needs rows (`pg_indexes` count), so I wrote a local `queryWritableDBRows`. Widening the shared signature is a
   one-line change and a good consolidation candidate — I could not make it here (shared modules are read-only).
2. **`resetWritableDb` is still unported.** My `resetIndexesTargetTables()` is a spec-local patch over a
   harness-wide hole. Every transforms spec is re-solving this; debris is at ~39 schemas / 46 tables.
3. **`DataStudio.Transforms` in `support/transforms.ts` has no `visitIndexes` / `indexesTab`.** Both live locally.
   They belong in the shared object next to the other tab getters.
4. **Token source is `cypress.env.json` via `support/env.ts`, not `.env`.** Worth adding to the brief — the `.env`
   token values are explicitly documented as stale in that file's own comment.
5. **`WRITABLE_PG_CONFIG` is private in both `schema-viewer.ts` and `transforms-codegen.ts`** and is now duplicated a
   third time in my module. Three copies of the same six connection facts.

## Warnings from the brief that were checked and found INAPPLICABLE

Reported as inapplicable on the basis of "I checked the mechanism", not "I didn't see it":

- **python 402 / localstack** — no python transform in this spec; the `python-transforms-enabled?` arm is never
  reached. The MBQL arm short-circuits.
- **CodeMirror `{Enter}` / `interactionDelay` / `pressSequentially` prepend** — no native editor and no
  `pressSequentially` anywhere in this port. The only text entry is a `fill()` into a Mantine `TextInput`.
- **Toast exit-transition lingering (`UndoListing.tsx:203`)** — the only toast assertion is a *presence* check
  (`toBeVisible`), never an absence/`toHaveCount(0)` check, so the Cypress-only transition suppression cannot matter.
- **Virtualized pickers hold ~20 rows** — the `TreeTable` here is virtualized, but the tests render 1–2 rows.
- **1280×720 vs configured 800** — no layout-dependent assertion in this spec (roles, text, and `aria-sort` only).
- **`cy.intercept({statusCode:500})` empty body / `cy.wait` queue semantics** — no intercepts and no stubbing upstream.
- **Placeholder traps / `Locator` laziness** — `getByPlaceholder("Select columns")` is used only as a *click target*,
  never asserted on, so no `elementHandle()` question arises.
- **`should("be.empty")` / `not.have.value` / DOMRect `deep.eq` tautologies** — none present upstream.

## Verification

- `bunx tsc --noEmit` → **clean**. (An earlier run surfaced `tests/s3-ldap-probe5.spec.ts(7,23) TS7006` — another
  slot's scratch file, not mine; it was gone by the final run.) Per the brief's warning that **`tsc` is provably
  silent on dead imports**, I also hand-audited: every one of the 16 named imports in the spec and every export in
  the support module is referenced. No dead imports.
- `--workers=1 --trace=off` → **2 passed**.
- `--repeat-each=3` → **6 passed** (26.7s), stable runtimes across all three workers.
- Gate-OFF → **2 skipped** (not failed).
- Final `git status`: only `support/transforms-indexes.ts` and `tests/transforms-indexes.spec.ts` are mine.
  `QUEUE.md`'s modification and the other untracked files belong to other slots.

**No Cypress cross-check was performed** — I cannot say whether upstream also fails. Standing prior on failure is
port drift; in this port nothing failed, so there is nothing to attribute. The one genuine upstream defect found
(M3 / note (a)) is a *source* property, reproduced faithfully rather than diagnosed as drift.
