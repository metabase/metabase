# transforms-inspect — port record (slot 3, :4103)

Source: `e2e/test/scenarios/data-studio/transforms/transforms-inspect.cy.spec.ts` (484 lines, 9 tests / 7 describes)
Target: `e2e-playwright/tests/transforms-inspect.spec.ts`
Support module: **`support/transforms-inspect.ts`** — matches the spec basename exactly, so there is no dangling-import risk of the kind that failed collection on every CI shard today.

## 3-line summary

All 9 tests ported and **all 9 EXECUTE and pass** (18/18 under `--repeat-each=2`); nothing is fixme'd or skipped.
The headline token worry is **falsified by probe**: `transforms-basic` really is absent, but it does not gate this surface, because `query-transforms-enabled?` short-circuits on `is-hosted? = false`.
Five mutants: four killed at four different assertions, one survived and was **my own bad mutation** — proven sound by a presence probe, not excused.

---

## 1. Token probe — the requested check, done FIRST

Measured against :4103 by activating `MB_PRO_SELF_HOSTED_TOKEN` and reading `token-features`
(**no token value is reproduced here or anywhere in the port**):

- Activation: `PUT /api/setting/premium-embedding-token` → **204**
- **42 features on**, matching the brief's count exactly.
- **`transforms-basic: false`** — genuinely absent, as warned.
- `transforms-python: true`.

### …and it does NOT block this spec. Here is why, with the evidence.

`transforms_inspector/api.clj` gates all three inspect endpoints on
`transforms.core/check-feature-enabled!` → `transforms/util.clj:37` → for query transforms,
`premium-features/query-transforms-enabled?` (`token_check.clj:715`):

```clojure
(and (setting/get :transforms-enabled)
     (or (not (premium-features.settings/is-hosted?))
         (has-feature? :transforms-basic)))
```

The slot backend reports **`is-hosted? = false`**, so the `or` is satisfied by its *first* branch and
`transforms-basic` is never consulted. The docstring states the intent outright: *"Available on any
non-hosted instance (OSS intentionally gets query transforms without a license)."*

Every transform in this spec is MBQL or SQL — there is **no python transform**, which is the branch
that genuinely needs `transforms-basic` *and* `transforms-python`.

**Confirmed end-to-end before a line of the port was written** (create → run → inspect on :4103):

```
CREATE /api/transform                  -> 200
POST   /api/transform/:id/run          -> 202   run status: succeeded
GET    /api/ee/transforms/:id/inspect  -> 200
       available_lenses: [generic-summary, column-comparison]
```

**Implication for this tier: nothing is owed.** A token refresh would *not* recover anything here.
The known-owed refresh (~3 tests + the transforms fixmes) remains owed for the **sibling
`transforms.spec.ts`**, whose fixmes sit on FE gates that do read `transforms-basic` — but this spec
is not part of that debt. Per the brief's instruction not to inherit the pessimistic version either:
**the pessimistic reading was tested and did not reproduce.**

### Incidental finding — `.env` parsing hazard (not mine to fix, but it will bite someone)

Repo-root `.env` stores the tokens as `KEY = value` **with a trailing comma on the value**:
`MB_PRO_SELF_HOSTED_TOKEN` reads as **65 chars**, and the backend rejects it with
`"Token should be 64 hexadecimal characters."` A naive `split("=")` + `strip()` parse therefore
produces a *silently invalid* token whose activation 400s — and if you then read `token-features`
you get **`ON (0)`, which looks exactly like "the token has no features"**. I hit this and nearly
recorded it as a finding. Stripping the trailing comma gives a clean 204 and 42 features.

Also noted: **`MB_ALL_FEATURES_TOKEN` is 61 chars** after the same normalization and 400s the same
way — i.e. the `bleeding-edge` token appears unusable on this box. Not investigated further (out of
scope), but flagged because other slots may be silently degrading on it.

## 2. Collision checks

- `grep -rl "transforms-inspect" tests/ support/` → **no match** before I started. No uncommitted port of my source exists.
- Landed `transforms-*` work is `tests/transforms.spec.ts`, `tests/transforms-codegen.spec.ts`, `support/transforms.ts`, `support/transforms-codegen.ts` — all cover **different** upstream specs. No overlap.
- Confirmed my spec is not one of the three known `.js`/`.ts` pairs.
- Support module named `support/transforms-inspect.ts` — **exact basename match with the spec**.

## 3. Snowplow — vantage chosen, and why

**Browser boundary (`installSnowplowCapture`), deliberately.**

All four asserted events are **FE-emitted** `trackSimpleEvent` calls in
`frontend/src/metabase/transforms/analytics.ts` (lines 103, 120, 135, 149) — verified by grep across
**both** `frontend/src` and `enterprise/frontend`:

| event | line |
|---|---|
| `transform_inspect_lens_loaded` | 103 |
| `transform_inspect_drill_lens_clicked` | 120 |
| `transform_inspect_alert_clicked` | 135 |
| `transform_inspect_drill_lens_closed` | 149 |

None is a `track-event!` call site in `src/`, so the per-slot collector is the wrong seam — it exists
for backend-emitted events, and `support/fixtures.ts:36` says so directly ("FE-emitted events remain
the province of `installSnowplowCapture`; the two coexist"). It would also be **self-defeating**
here: `installSnowplowCapture`'s `page.route` intercepts the tracker POST, so the collector could
never receive these events anyway. The two vantages are mutually exclusive for FE events, not
complementary.

**The capture demonstrably works** — this is not assumed. Mutant M5 produced the actual captured
payload:

```
captured: [{"event":"transform_inspect_lens_loaded","target_id":1,
            "event_detail":"generic-summary","duration_ms":132}]
```

**Gap, stated rather than papered over.** `H.expectNoBadSnowplowEvents` upstream asks
snowplow-micro for Iglu **schema-validation** failures. The port degrades it to the structural check
(`capture.malformed` empty), exactly as the sibling transforms port does. `support/iglu-validate.ts`
now exists and could close this — but it needs `{schema, data}` pairs, and `SnowplowCapture.record()`
**discards the schema URI**, pushing only `outer.data.data`. Closing the gap means editing a shared
support module, which this port is not permitted to do.
→ **Consolidation candidate:** have `SnowplowCapture` retain the schema URI alongside the data so
`expectNoBadSnowplowEvents` can run `validateIgluPayloads`. This would upgrade the browser-boundary
vantage for *every* FE snowplow port at once, not just this one.

Doc drift noticed in passing: `support/snowplow-collector.ts`'s header (lines 29-34) still asserts
that `snowplow-url` defaults to the production collector because `config/is-prod?` is true for the
uberjar. PORTING.md's corrected section explicitly retracts that (`-Dmb.run.mode=e2e` makes
`is-prod?` false). Left untouched — shared module — but it will mislead the next reader.

## 4. Infra tier — per describe, with the gate-OFF control

Whole file is **QA-DATABASE TIER**: upstream is `@external`, restoring `postgres-writable`, resetting
`many_schemas`, driving WRITABLE_DB_ID on :5404. Gated on `PW_QA_DB_ENABLED`.

| describe | tests | gate ON | gate OFF |
|---|---|---|---|
| pre-run state | 1 | executed ✓ | skipped |
| generic-summary lens | 1 | executed ✓ | skipped |
| join-analysis lens | 3 | executed ✓ | skipped |
| drill-down lenses | 1 | executed ✓ | skipped |
| column-comparison lens | 1 | executed ✓ | skipped |
| loading indicator | 1 | executed ✓ | skipped |
| sql transforms | 1 | executed ✓ | skipped |
| **total** | **9** | **9 executed, 0 skipped, 0 fixme** | **0 executed, 9 skipped** |

**Gate-OFF control run (#67/#49): `9 skipped`, zero executed.** The gate genuinely controls
execution, so the green run is not a "green because everything skipped" run.

No python tier here (no python transform in the spec), so **localstack :4566 is irrelevant to this
port** — the blocker that stalls the sibling spec does not touch it.

`e2e/snapshots/blank.sql` corruption: not exercised. This spec restores `postgres-writable`, never `blank`.

## 5. Executed vs unexecuted — stated honestly

**9 of 9 upstream `it`s ported, 9 of 9 executed, 0 unexecuted.** No `test.fixme`, no `test.skip`
beyond the QA-DB gate, nothing dropped, weakened, or merged. Upstream order preserved.

No vacuous upstream assertions were found in this spec — none of the traps flagged in the brief
(`deep.eq` on DOMRects, argless `not.have.value`, `be.empty` on an `<input>`, bare `should("contain")`)
appear in the source. I did **not** strengthen anything.

## 6. Fidelity decisions worth recording

- **The two `cy.intercept` aliases are ported as RESPONSE QUEUES**, not call-site `waitForResponse`.
  This is load-bearing: `cy.wait("@alias")` pops *past* responses and is satisfiable retroactively.
  Three tests wait on `@inspectorLens` twice in a row where the first wait is satisfied by a
  response fired during page load — a call-site `waitForResponse` registered at that line would hang.
- **Cypress glob `*` does not cross `/`**, so `/inspect` and `/inspect/*` are *disjoint* aliases.
  The queue predicates preserve this (`isDiscovery` requires `inspect` to end the path); collapsing
  them would make every discovery response also satisfy a lens wait.
- `toHaveText` normalizes whitespace. Checked deliberately given the brief's warning about
  inspect/preview surfaces: **every** asserted value here is a short token (`"Animals"`, `"3"`,
  `"0.00 %"`, `"Integer"`, `"inspect_mbql_table"`) — no SQL and no preformatted query output — so
  normalization has no formatting subject to erase. Raw `textContent()` was not needed.
- **All six testids verified present in the product** before being asserted on:
  `generic-summary-tables`, `generic-summary-fields`, `lens-tab-loader` (all three in
  `enterprise/frontend/.../transforms-inspector/`), `table-footer`, `visualization-root`,
  `run-button`. Grepped both trees, per the brief.
- `resetInspectTargetTables()` has **no upstream counterpart** — same reasoning as
  `resetTransformTargetTables` in the sibling port: the "already exists" guard is a *physical*
  warehouse check the app-DB restore cannot reach, and the local container is long-lived and shared.
  Scoped narrowly to this spec's eight `inspect_*` targets in `Schema A`; **drops no foreign schemas**
  (#85 — siblings live in the same container).
- Reused `waitForSucceededTransformRuns` from `support/transforms.ts` rather than duplicating it,
  after first writing and then deleting my own copy — the shared one already had upstream's `some`
  semantics and had been exercised.
- Shared modules imported **read-only**; none edited. `PORTED.txt` / `QUEUE.md` untouched. No commit.

## 7. Mutation testing

Every mutant inverts an **input**, never an expectation (except the two explicitly-labelled vacuity
probes). Where each died is recorded, because a mutant that dies at assertion #1 proves nothing about
the tail.

| # | mutation | result | died at |
|---|---|---|---|
| M1 | `no_pk_table` fixture rewritten so all 6 rows match `Animals` (0% unmatched, below the >20% threshold) | **KILLED ×2** | test 5 line 321 (drill button absent); test 6 line 357 (click timeout) |
| M2 | MBQL transform `limit: 5` → `2` — output table gains 2 rows, input still 3 | **KILLED** | test 2 line 211, `Expected "3" / Received "2"` — the **output**-table block, past the input-table assertions |
| M3 | one `Animals.name` set to NULL in the warehouse, to move the null-percentage off `0.00 %` | **SURVIVED — my own bad mutation** | see below |
| M4 | lens-query route pattern changed so the 1000ms delay never applies | **KILLED** | test 8 line 466, first spinner assertion |
| M5 | snowplow `event_detail` → `column-comparison` (a real lens, not the one loaded) — *vacuity probe, expectation-side, labelled as such* | **KILLED** | test 2 snowplow tail |
| P1 | test 8's tail absence check `toHaveCount(0)` → `toHaveCount(1)` — *presence probe* | **KILLED** | test 8 line 475 |

### M3 — calling out my own bad mutation

M3 survived, so I applied the "vacuous, or bad mutation?" test rather than recording a defect.

1. **The mutation applied.** Verified directly: `SELECT name, score FROM "Schema A"."Animals"`
   returned a NULL name for `score = 10`. So this was *not* lie #1 (a silently-unapplied mutation).
2. **Presence probe.** I replaced the expectation with a sentinel and read what actually renders:
   `Expected "__PROBE__" / Received "0.00 %"`.

So the cell renders a real, present, discriminating `0.00 %` **even with a NULL in the source table**.
The assertion is **sound and not vacuous** — the locator resolves and the matcher discriminates.

**The mutation was mine, and it was bad**: the inspector's null-percentage is derived from Metabase's
cached field **fingerprints**, not recomputed from the warehouse at inspect time, so corrupting the
warehouse alone cannot move it. This is PORTING's failure-mode family #1/#3 — the value I targeted is
not downstream of the thing I mutated.

**Honest residual:** I therefore have **no input-side mutant that kills the field-stats block**
(`Name`/`Text`/`3`/`0.00 %`, `Score`/`Integer`/`3`/`0.00 %`). Moving it would require re-fingerprinting,
which this spec's `beforeEach` does not force. The block is proven *present and discriminating* by the
sentinel probe, but its sensitivity to real data change is **not triggered by any failure mode I could
induce.** Recorded as a limit of the testing, not as a pass.

### Coverage reading

Mutants killed at **six distinct assertions across four of the nine tests**, spanning the join-alert
threshold, the output-table row counts, the loading-spinner route delay, the tail absence checks, and
the snowplow capture. Tests 1, 3, 7 and 9 were not individually mutated; they assert the same
discovery/lens-tab machinery that M1/M2/M4 killed elsewhere.

**The spec was restored byte-identically after every mutant.**
`md5(tests/transforms-inspect.spec.ts) = 3e141b3b6fb3162a8e4b601d0c0f5853`,
`md5(support/transforms-inspect.ts) = deaebbb39d1bee41cfdd574e84e39a5a` — verified against the
pre-mutation checksums, and the full suite re-run green (9/9) *after* the final restore.

## 8. Verification

- Run 1: **9 passed** (45.1s)
- `--repeat-each=2`: **18 passed** (1.1m) — no flake
- Gate-OFF control: **9 skipped**, 0 executed
- Post-restore re-run: **9 passed** (34.4s)
- `bunx tsc --noEmit`: **clean**
- **Dead imports checked by hand** (tsc does not catch them): 22 imported names in the spec, 9 in the
  support module, **zero dead**.
- Jar verified **by identity, not by path**: `/api/session/properties` reports
  `version.hash = 751c2a9`, matching `COMMIT-ID 751c2a98`.
- No debug code, no bare `waitForTimeout`. (The one `setTimeout` is *inside* the ported route handler
  and is the 1000ms response delay that is the loading-indicator test's subject — mutant M4 proves it
  is load-bearing, not a sleep.)

## 9. Shared state — created and restored

- Probe transform + its physical table `"Schema A".probe_inspect_tbl` created during the token probe:
  transform deleted via API, table dropped, absence verified (`0 rows` matching `%probe%`/`%inspect%`).
- M3 NULLed one `Animals.name` in `writable_db`: **repaired** (`UPDATE … SET name = 'Duck'`, verified
  Duck/Horse/Cow restored). It would also self-heal via `resetManySchemasTable`, but I did not rely on that.
- `test-results-tri/` removed. Siblings' `test-results-*` left alone.
- Only port 4103 / slot 3 touched. Port 4000 never touched. No Cypress cross-check run — so, as
  expected, **I cannot confirm whether upstream also passes**; this port's fidelity rests on reading
  the source, not on a cross-check.

## 10. Unexplained / not established

- Why `MB_ALL_FEATURES_TOKEN` is 61 characters. Recorded as an observation, mechanism not investigated.
- The brief's unconfirmed report of a **dropped backend snowplow event** did not arise here and could
  not have: this spec's events are all FE-emitted and the collector is not the seam in use. **No
  evidence either way** — I am not corroborating or contradicting that report.
- Field-stats sensitivity to live data change: not triggered by any mutation I could induce (§7).
