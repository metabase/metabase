# transforms-incremental — port record (slot 3, :4103)

Source: `e2e/test/scenarios/data-studio/transforms/transforms-incremental.cy.spec.ts` (414 lines, 3 tests / 1 inner describe)
Target: `e2e-playwright/tests/transforms-incremental.spec.ts`
Support module: **`support/transforms-incremental.ts`** — exact basename match with the spec, so no dangling-import risk of the kind that failed collection on every CI shard today.

## 3-line summary

All 3 upstream `it`s ported in order; **2 of 3 execute and pass** (6/6 under `--repeat-each=3`), the python one is `test.fixme` on two independently-probed blockers.
The headline "neuter the write" mutation **killed both live tests** at the checkpoint read-back, and a snowplow mutation printed the real captured payload — the vantage is genuinely live.
One mutant **survived**: neutering `reset-checkpoint` leaves the tests green, because the UI field they read (`checkpoint_hi_value`) is **identical with and without the reset** — proven by API probe, and recorded rather than strengthened.

---

## 1. Collision checks

- `grep -rl "transforms-incremental" tests/ support/` → **no match** before I started. No uncommitted port of my source exists.
- Landed `transforms-*` work is `tests/transforms.spec.ts`, `transforms-codegen.spec.ts`, `transforms-inspect.spec.ts`, `transforms-permissions.spec.ts` + their support modules — all cover **different** upstream specs. Read them; reused read-only; no overlap.
- Confirmed my spec is not one of the three known `.js`/`.ts` pairs.
- Support module is `support/transforms-incremental.ts` — **basename matches the spec exactly**, as required.

### 🔴 Cross-slot hazard found while doing this check (worth propagating)

The landed `support/transforms.ts` `resetTransformTargetTables()` runs, against the **shared** writable container:

```sql
... WHERE table_schema IN ('Schema A','Schema B','Domestic','Wild','public')
      AND lower(table_name) LIKE '%transform%'   -> DROP TABLE ... CASCADE
```

Upstream's `TARGET_TABLE` for my spec is literally `"transform_table"`, which that pattern matches. A concurrent `transforms.spec.ts` run on another slot would **drop my target table mid-test**. Renaming to `incremental_transform_table` would *not* escape it either.

**Deviation, declared:** my `TARGET_TABLE` is `incr_target_table` — deliberately without the substring `transform`. Nothing is weakened: the table name is never the *subject* of an assertion (it is typed in and read back purely to prove the field stops auto-tracking the transform name, which holds for any value). The literal-dependent assertion — table name auto-populating to `"mbql"` from the name `"MBQL"` — is untouched. CI is unaffected either way since it provisions the container per job.

## 2. The exact predicate gating this surface, and how I traced it

**The gating is NOT uniform across this file — it splits by transform source type, and the two halves land on opposite sides.** This is the one place the sibling `transforms-inspect` conclusion does **not** transfer, and I checked rather than inheriting it.

How traced: `transforms/util.clj` `check-feature-enabled!` dispatches on source type, into two different `premium_features/token_check.clj` predicates:

```clojure
;; token_check.clj:715 — query (MBQL + native SQL)
(defn query-transforms-enabled? []
  (and (setting/get :transforms-enabled)
       (or (not (premium-features.settings/is-hosted?))
           (has-feature? :transforms-basic))))

;; token_check.clj:724 — python
(defn python-transforms-enabled? []
  (and (setting/get :transforms-enabled)
       (has-feature? :transforms-basic)      ; <- NO short-circuit
       (has-feature? :transforms-python)))
```

Measured on :4103 after activating `pro-self-hosted` (**no token value reproduced anywhere**):

- Activation `PUT /api/setting/premium-embedding-token` → **204**; **42 features on**.
- `transforms-basic: false` — genuinely absent, as briefed. `transforms-python: true`. `is-hosted?: false`.

**MBQL + SQL → runs.** The `or` is satisfied by its first branch, so `transforms-basic` is never consulted. Confirmed end-to-end before writing a line of the port:

```
POST /api/transform  (table-incremental target + checkpoint source) -> 200
POST /api/transform/:id/run                                          -> 202, status succeeded
     checkpoint_hi_value: 30      <- exactly the /30/ the spec asserts
POST /api/transform/:id/reset-checkpoint                             -> 204
```

**Python → genuinely blocked.** `python-transforms-enabled?` has no short-circuit. Probed:

```
POST /api/transform (python source) -> 402
  "Premium features required for this transform type are not enabled."
```

This is a *real* 402, unlike the false "transforms is 402-blocked" claim the brief warned about — that claim concerned **query** transforms, where it was indeed wrong. Both readings were tested; the pessimistic one reproduced only for python.

Also checked: **there is no incremental-specific premium feature.** Grepping the backend for an `incremental`-flavoured feature/enabled predicate returns nothing. Incrementality is gated solely via the source-type predicates above.

### `.env` trailing-comma hazard — **inapplicable here, not banked**

The brief warned about `.env` token values carrying a trailing comma. **The harness does not read `.env`**: `support/env.ts:8` loads repo-root `cypress.env.json` and its comment explicitly says the `.env` values are stale. All four tokens there are clean **64-char hex**. The hazard is real for a hand-rolled `.env` probe; it did not apply to this port, and I used the file the harness uses. Reporting as inapplicable rather than as a dividend.

## 3. Per-describe gate mapping, with the gate-OFF control

Upstream has one outer describe and one inner `creation` describe. **No describe carries `@external`** — the only tag in the file is `{ tags: ["@python"] }` on a single **test** (upstream line 156). So the gate is per-*test*, not per-describe, here.

| describe / test | upstream tag | gate ON | gate OFF |
|---|---|---|---|
| creation › mbql incremental transform | — | **executed ✓** | skipped |
| creation › Python incremental transform | `@python` | **fixme** (402 + localstack) | skipped |
| creation › native SQL incremental transform | — | **executed ✓** | skipped |
| **total** | | **2 executed, 1 fixme** | **0 executed, 3 skipped** |

**Gate-OFF control run: `3 skipped`, zero executed.** Gate-ON: `2 passed, 1 skipped`. The difference is exactly the two untagged tests, so the green run is not a "green because everything skipped" run.

### Upstream tagging drift, flagged

This file drives the writable QA container exactly as hard as its siblings (`H.restore("postgres-writable")`, `H.resetTestTable({table:"many_schemas"})`, `WRITABLE_DB_ID`) but carries **no `@external` tag**, while `transforms.cy.spec.ts` and `transforms-indexes.cy.spec.ts` in the same directory do. The tag looks **missing, not absent-by-design**.

Note also: the sibling `findings-inbox/transforms-inspect.md` states "upstream is `@external`" for *its* file. Reading `transforms-inspect.cy.spec.ts` line 10, that describe carries **no tags either**. That claim appears to be loose — the file is QA-DB-dependent in fact, but not tagged. Minor, but it is the kind of detail the queue generator's gate column keys on.

## 4. Snowplow — which vantage and why

**Browser boundary (`installSnowplowCapture`), deliberately. Not "none".**

First I checked it wasn't dead setup, since the brief warns a `snowplow` tag can be pure ceremony: upstream calls `H.resetSnowplow()` in the beforeEach **and** makes **six real assertions** (two per test) plus `H.expectNoBadSnowplowEvents()` in an afterEach. The machinery is load-bearing, so it was built rather than stubbed.

Both asserted events are **FE-emitted** `trackSimpleEvent` calls in `frontend/src/metabase/transforms/analytics.ts` — grepped across **both** `frontend/src` and `enterprise/frontend`, with no `track-event!` call site in `src/`:

| event | line |
|---|---|
| `transform_trigger_manual_run` | 19 |
| `transform_create` | 41 |

So the per-slot collector is the wrong seam (it exists for backend-emitted events), and it would be **self-defeating**: `installSnowplowCapture`'s `page.route` fulfils the tracker POST before it leaves the browser. The two vantages are mutually exclusive for FE events.

I specifically considered the brief's hypothesis that **a transform *run* might be backend-emitted** — it is not: `transform_trigger_manual_run` is a plain FE `trackSimpleEvent` at analytics.ts:19, fired from the run button, and mutation M3 below captured it at the browser boundary.

**The capture demonstrably works** — this is proven, not assumed. M3 printed the live payload:

```
expected 1 snowplow event(s) matching {"event":"transform_create","event_detail":"query"};
captured: [{"event":"transform_create","event_detail":"native"}]
```

**Known gap, stated:** `H.expectNoBadSnowplowEvents` upstream asks snowplow-micro for Iglu **schema-validation** failures; the port degrades it to the structural check (`capture.malformed` empty), exactly as the sibling transforms/transforms-inspect ports do. Closing it needs `SnowplowCapture` to retain the schema URI (it currently keeps only `outer.data.data`), which means editing a shared support module — not permitted here. **Consolidation candidate**, same as the sibling flagged.

## 5. Mutation testing

Five mutations, four killed at **three distinct assertions**, one survived and was diagnosed rather than excused. Both files restored **byte-identical** (md5 verified against a baseline taken before the first mutation: `ec1d2af471351f5909c8f548e8e26de8` / `a14584726516043cb949419195313749`).

| # | Mutation (input, not expectation) | Result |
|---|---|---|
| **M1** | **Neuter the write**: `INSERT ... VALUES ('NewRow', 31)` → `('NewRow', 29)` — the incremental run produces **no new rows** because the value is below the watermark | **KILLED both tests** at `expectCheckpointTo(/31/)` (spec.ts:253 / :404), the post-second-run read-back |
| **M2** | Never enable incrementality (switch click → `.count()` no-op) | **KILLED both tests** at the **first** `expectCheckpointTo(/30/)` (spec.ts:240 / :391) — no "Checkpoint to" group exists at all |
| **M3** | Pick "SQL query" instead of "Query builder" in the MBQL test → `event_detail` becomes `native` | **KILLED** at the snowplow assertion (spec.ts:180), with the captured payload printed |
| **M4** | **Neuter reset-checkpoint**: stub `POST /api/transform/:id/reset-checkpoint` to a local `204` (empty body, per the stub rule) so the request fires and the wait resolves but nothing resets | **SURVIVED — test green** |
| **M4b** | Presence probe under the *same* M4 stub: final assertion `/31/` → `/99/` | **KILLED** (spec.ts:269) — so the assertion is **live, not vacuous** |

M1 is the brief's requested shape and it is caught: every UI interaction still happens, and the test goes red purely on the read-back. Note the two kill sites differ (M2 dies one assertion earlier than M1), so the mutants are not all dying at one over-broad gate.

### 🔴 The surviving mutant, diagnosed — a real weakness in the UPSTREAM test

M4's survival is **data coincidence, not a vacuous assertion** (M4b proves the assertion evaluates). The last third of each test — reset checkpoint → re-run → assert "Checkpoint to 31" — **cannot detect a broken `reset-checkpoint`**, because the field it reads is the same in both branches. Measured directly via the API:

```
run1 (initial)        status=succeeded  lo=None  hi='30'
run2 (no new rows)    status=succeeded  lo='30'  hi='30'
reset-checkpoint -> 204
run3 (after reset)    status=succeeded  lo=None  hi='30'
```

`checkpoint_hi_value` — which is exactly what the "Checkpoint to" group renders — is **30 in all three states**. The discriminating field is **`checkpoint_lo_value`**: `null` after a reset, the prior watermark otherwise. And `InfoSection.tsx:50` renders its **"Checkpoint from"** row *only when that value is non-null*.

So the only thing currently tying the reset to anything is `cy.wait("@resetCheckpoint")`, which confirms the request **fired**, not that it **worked**.

**Not strengthened** — faithfulness rule: weak-but-faithful is recorded, not fixed. Recorded verbatim with the analysis inline at the call site (spec.ts, before the final assertion block).

**Follow-up for whoever owns the upstream spec:** assert the **"Checkpoint from" group is ABSENT** after the reset (it is *present* on the immediately preceding un-reset run). That single assertion kills M4.

### Bad mutations I ruled out, called out per the brief

- **"Delete the INSERT entirely"** — rejected before running: removing a value the app persists is not a reliable inversion. Changed `31` → `29` instead, which keeps the row count identical and moves only the watermark.
- **"Assert a bogus `event_detail`"** — rejected: that mutates the *expectation*. Flipped the editor-type **input** (M3) so the app genuinely emits a different detail.
- **First M2 attempt was malformed** — my `perl` substitution produced `await saveModal\n /* M2 */ 0;`, i.e. syntactically broken source. Caught and repaired into a valid no-op (`.count()`) before running, so the M2 result above is from a well-formed mutant, not a syntax error masquerading as a kill.

## 6. Fixes needed while stabilising (all port drift — my bug, not the app's)

Three failures, all diagnosed to port drift, consistent with the standing strong prior:

1. **`403 "A table with that name already exists."`** — my cleanup dropped `Schema A`/`Schema B`, but the save modal exposes **no target-schema control** and the app defaults the target to **`Domestic`**. Measured by inventorying the container after a run. Fixed by keying the sweep on the **table name across all schemas** (safe: the name is unique to this spec) rather than on a guessed schema. *New gotcha — the transform target schema is not the source schema.*
2. **`pressSequentially` after `fill()` PREPENDS.** Cypress `.type()` appends at the end; after a Playwright `fill()` the caret sits at index **0**. The transform was created as `" transformMBQL"` instead of `"MBQL transform"`, and the run-list row regex then never matched — the failure surfaced two assertions later, at `openRunDetail`, which is what made it look like a run-list problem. Fixed with `click()` + `press("End")` before `pressSequentially`. **Worth adding to PORTING.md's rule 5** — this is a general Cypress-`.type()`-vs-Playwright difference and it fails far from its cause.
3. **The database popover is transient and unclickable.** Upstream's `H.popover().findByText(DB_NAME).click()` cannot be ported literally on this instance: exactly one database is eligible for transforms, so the app **auto-selects it** — measured **0 popovers at t+200/800/2000ms**, with `native-query-top-bar` already showing the DB. Playwright's actionability checks lose the race every time (30s of *"element was detached from the DOM, retrying"*). Ported as an assertion on the **state the click exists to establish**. Not a weakening: if a second eligible database ever appears, it fails loudly rather than proceeding on the wrong DB.

**On (3): NOT cross-checked against Cypress.** Running the original would break live sibling slots (standing rule), so I **cannot** say whether upstream races this too, or whether CI has a second eligible database that keeps the popover open. Recorded as an environment-dependent divergence, not as a product claim.

## 7. Order dependence under `--repeat-each=3`

**6/6 passed** (2 executing tests × 3, plus 3 skips). **No order dependence detected.**

This was the brief's specific worry — incremental transforms keep state between runs (a watermark), which is exactly the class that leaks across repeats. It does not leak here, and the reason is concrete: each test restores the `postgres-writable` snapshot (clearing the app-DB `transform_run` rows), `resetManySchemasTable()` recreates `Animals` from scratch, and `resetIncrementalTargetTables()` drops the physical target. The watermark has no surviving carrier. Recorded as *checked and negative*, not as *assumed safe*.

## 8. Container table inventory, before and after

| | tables |
|---|---|
| BEFORE (baseline, before any of my work) | **37** |
| AFTER (final state) | **40** |

**None of the delta is mine.** Verified explicitly:

- `incr_target_table` remaining: **0**; my API-probe tables (`pw_probe_incr`, `pw_probe_m4`, `pw_probe_py`) remaining: **0**.
- Appended `NewRow` rows remaining in `Schema A."Animals"` / `Schema B."Animals"`: **0 / 0**.

The delta is sibling activity in the shared container: **+3** `mtt_*` tables appeared (`Domestic.mtt_other_table`, `Domestic.mtt_output_table`, `public.mtt_source_table`) and **−1** `public.invalid_20260720040629` was removed — neither set is touched by this spec. **My spec's net footprint is zero.** No foreign schema was dropped (#85 respected — the sweep drops one exact table name and never a schema).

## 9. Brief hazards that did NOT apply (reported as inapplicable, not banked)

- **`.env` trailing comma / 65-char token** — harness reads `cypress.env.json`; tokens there are clean 64-char hex. See §2.
- **CodeMirror autocomplete `interactionDelay` / Enter-as-completion-accept** — upstream uses `{ allowFastSet: true }`, which does **not** type: it writes `.cm-content.textContent` directly then types `" {backspace}"` to re-trigger the validator. Ported via the existing `fastSetNativeEditor`, so `{{t}}` never goes through close-brackets or autocomplete. The hazard is real elsewhere; it is structurally absent here.
- **Empty-state component as an invalid anchor** — the brief flagged a transform-run status panel as "exactly this shape". Not hit: the port anchors on the run button settling to `"Ran successfully"` and on the run-detail Info region, never on a "no runs yet" empty state.
- **localstack :4566** — probed **DOWN**, and it *is* a genuine blocker, but only for the python test, which the 402 already blocks first. Irrelevant to the two executing tests (no python transform).
- **`e2e/snapshots/blank.sql` corruption** — not exercised; this spec restores `postgres-writable`, never `blank`.
- **1280×720 harness viewport defect** — no failure in this port was layout- or popover-position-dependent in a way I could attribute to it. The popover issue in §6(3) is a *lifetime* race (the popover closes), not a positioning one; I verified it is gone at t+200ms rather than merely off-screen.

## 10. Verification summary

- Jar verified **by identity**, not by `JAR_PATH`: `/api/session/properties` → `version.hash = 751c2a9` vs `target/uberjar/COMMIT-ID = 751c2a98`. `is-hosted? = false` confirmed on the slot (the load-bearing fact for §2).
- Final run: **2 passed, 1 skipped**. `--repeat-each=3`: **6 passed, 3 skipped**.
- `bunx tsc --noEmit`: **clean for my two files.** Transient errors from siblings' in-progress specs were present and are not mine.
- **Dead imports checked by hand** (tsc does not catch them): every import in the spec is referenced beyond its import line. No debug code, no bare `waitForTimeout` in the final files.
- Cleaned up my own `scratchpad/out-incr-slot3` and md5 baseline; left siblings' logs and processes alone. No stray pollers.
- Did **not** touch `PORTED.txt`, `QUEUE.md`, `playwright.config.ts`, or any shared support module. Did not commit. Never contacted port 4000.
- **No Cypress cross-check was run** (standing rule) — so for every failure above, "upstream also fails/passes" is *unknown*, and nothing here is claimed as a product bug.
