# collections-uploads (slot 2, :4102)

Port of `e2e/test/scenarios/collections/uploads.cy.spec.js` (475 lines, 21 tests)
→ `tests/collections-uploads.spec.ts` + `support/collections-uploads.ts`.

## Collision checks

- `grep -rl "collections/uploads.cy.spec\|collections-uploads" tests/ support/` → **no hits**.
- `ls tests/` → no `collections-uploads.spec.ts`. Read every neighbouring
  `collections*` port (`collections`, `collections-cleanup`,
  `collections-permissions`, `collections-reproductions`, `collections-trash`,
  `collection-pinned-overview`, `collection-picker-tenants`): all port
  **different** sources under `e2e/test/scenarios/collections/`. None ports
  `uploads.cy.spec.js`.
- `ls e2e/test/scenarios/collections/` → no `.ts` sibling of `uploads`.
- **Support module name: `support/collections-uploads.ts`** — matches the target
  spec basename exactly. No deviation, nothing to flag.

## Infra tier per describe, with the gate-OFF control

The source has **6 `describe(` occurrences but only 3 top-level ones**
(lines 8, 263, 339) and **all three carry `@external`**. The other three
(lines 87 `CSV Uploading (${dialect})`, 158 `CSV appends`, 191
`CSV replacement`) are **nested inside** the `@external`-tagged describe at
line 8. `@cypress/grep` propagates suite tags down the suite chain, so they are
tagged in effect.

Re: the coordinator's `external(3/6 describes)` correction — that is the
**FINDINGS #121 counting artifact in the other direction**: the generator counts
nested describes as untagged when they inherit. Independently of tag semantics,
the gate is correct **on the merits**, which is the stronger argument:

| top-level describe | snapshot | database written | container needed |
|---|---|---|---|
| `CSV Uploading` → "…empty postgres schema" | `postgres-writable` | `writable_db` (:5404) | yes |
| `CSV Uploading` → `CSV Uploading (postgres)` ×8 | `postgres-writable` | `writable_db.public` | yes |
| `CSV Uploading` → `CSV Uploading (mysql)` ×8 | `mysql-writable` | `writable_db` (:3304) | yes |
| `CSV Uploading` → "…choose a model to append" | `postgres-writable` | `writable_db.public` | yes |
| `permissions` ×2 | `postgres-12` | QA `sample` (:5404) | yes |
| `Upload Table Cleanup/Management` ×1 | `postgres-12` | QA `sample` (:5404) | yes |

**All 21 tests restore a QA snapshot and point uploads at `WRITABLE_DB_ID`.**
None can run without a container, so the file-level gate skips nothing that
could otherwise execute.

**Gate-OFF control** (`PW_QA_DB_ENABLED` unset): `21 skipped`, **0 executed, 0 failed**.
**Gate-ON**: `20 passed, 1 skipped`. Difference = exactly 20 tests = every test
except the one skipped for FINDINGS #85 (below). No over-gating.

### The `WRITABLE_DB_ID` red herring — resolved by reading the snapshots

`WRITABLE_DB_ID` is the literal `2`, and which database that is *depends on the
snapshot*:

```
grep -aoiE "(QA Postgres12|Writable Postgres12)" e2e/snapshots/postgres_writable.sql
  → 16 × "Writable Postgres12", 0 × "QA Postgres12"
grep -aoiE "(QA Postgres12|Writable Postgres12)" e2e/snapshots/postgres_12.sql
  → 16 × "QA Postgres12", 0 × "Writable Postgres12"
```

Both live in the **same container** (`metabase-e2e-postgres-sample-1`, :5404) but
in **different databases**: `writable_db` vs `sample` (`QA_DB_CREDENTIALS.database
= "sample"`, `WRITABLE_DB_CONFIG…database = "writable_db"`).

**Consequence upstream never states: the `permissions` and `Upload Table
Cleanup/Management` describes CREATE TABLES IN THE READ-ONLY QA SAMPLE
DATABASE.** `H.enableUploads("postgres")` under the `postgres-12` snapshot points
uploads at db 2 = `QA Postgres12` = `sample.public`, and `headlessUpload` writes
5 tables there. Upstream leaves all of them. This port drops them in an
`afterAll` (see inventory below).

## Token — probed, not assumed

`PUT /api/setting/premium-embedding-token` with `MB_PRO_SELF_HOSTED_TOKEN` on
:4102, then `GET /api/session/properties`:

- Before activation: 59 features listed, **0 enabled**.
- After activation: **42 enabled**, including **`upload_management: true`** and
  **`sandboxes: true`**.
- `transforms-basic`: **absent/false** — matches the brief.

So **nothing in this spec is 402-blocked here.** Uploading is OSS; only
`/api/ee/upload-management/*` is gated (`define-premium-feature
enable-upload-management? :upload-management`,
`src/metabase/premium_features/settings.clj:234`). No token values printed.

## Snowplow — vantage: the per-slot COLLECTOR

Not dead setup: upstream makes **8 real assertions**
(`H.expectUnstructuredSnowplowEvent` × 8, plus `H.expectNoBadSnowplowEvents` in
an `afterEach`). Grepped rather than assumed.

**Backend-emitted, so the browser-boundary capture is structurally blind:**

- `src/metabase/upload/impl.clj:684,691` → `analytics.core/track-event!
  :snowplow/csvupload` → `snowplow.clj` Java `Tracker` → Apache HttpClient.
- `grep -rn "csvupload\|csv_upload" frontend/src` finds only the TS **type**
  (`metabase-types/analytics/csv-upload.ts`) and static-viz fixture JSON —
  **no `trackSchemaEvent` call site**.

Using `installSnowplowCapture` here would have produced 8 silently no-op
assertions. All assertions run against `mb.snowplow`.

`snowplow.clj normalize-kw` (line 129) converts `:csv-upload-successful` →
`"csv_upload_successful"`, which is why `expectCsvUploadEvent` matches on
`data.event` rather than on the schema-derived name (every one of these is
`csvupload`). `expectNoBadCollectedSnowplowEvents` really does Iglu-validate —
not degraded.

### CONFIRMED: the "dropped backend event" report is actually a DELAY, and it produces hollow green

The brief carried an unconfirmed report that a backend event was dropped before
leaving the JVM. **It is not dropped. It is queued, and the queue has a
persistent offset.** Mechanism, measured on slot 2 (backend :4102, collector
:5102) with a standalone `node:http` listener:

1. A `POST /api/dashboard` (which emits `dashboard_created`) caused the listener
   to receive a **`csvupload / csv_append_failed`** payload — a stale event from
   an **earlier Playwright run**.
2. Firing 45 dashboard creations flushed **6 stale `csv_upload_successful`
   payloads** (`num_rows` 97/87, `model_id` 98…102 — exactly the previous run's
   uploads) plus one stale `instance_stats`, before `dashboard_created` came
   through. Firing 30 more later: 30 fired, 30 received, ids contiguous — the
   queue had caught up.

Why: `snowplow.clj` builds **one JVM-wide Tracker in a `defonce`** with
`EmitterConfiguration.batchSize(1)`, and a POST that fails because nothing is
listening is **re-queued**. Every backend event emitted while the per-slot
collector is down — i.e. the entire gap between two Playwright runs under
`PW_KEEP_SLOT_BACKENDS=1` — leaves the queue one deeper, for the life of the JVM.

**The damaging part is not the red.** With an offset of 1, a test asserting
`csv_upload_successful` **passes on the previous test's event**. Observed
directly: run 3 produced the pattern fail / pass / pass / fail across
dog_breeds / star_wars / pokedex / invalid — the two "passes" were reading their
predecessor's event. This is a hollow-green generator, not just a flake.

**Evidence it is the cause and not the port:**

| run | backend | result |
|---|---|---|
| 2 | freshly booted JVM | 20 passed, 1 skipped — every snowplow assertion green |
| 3 | reused, backlog present | 4 failures, all snowplow, plus 2 hollow passes |
| 8 (final) | freshly booted JVM | 20 passed, 1 skipped |
| final `--repeat-each=3` | fresh | 60 passed, 3 skipped |

**CI is unaffected** (fresh backend per shard). On a dev box, kill the slot
backend before running this file. Recorded in the spec header as a run
requirement.

**UNEXPLAINED, recorded as such:** I first tried to fix this inside the spec with
a `drainSnowplowBacklog` helper (fire N dashboards, wait for the last id to come
back at the collector). It works from a standalone script but **never converged
inside the Playwright harness** — 160 priming events fired, confirmed created in
the app DB, and the in-process collector never reported its own event, even on a
run where an external probe had just measured the backlog at **zero**. I could
not explain the difference between the in-process collector and an identical
standalone `node:http` server on the same port, so I removed the helper rather
than ship machinery I cannot account for. Worth a look by whoever owns
`support/snowplow-collector.ts`.

## Container inventory — before and after

Taken directly against the containers.

| | before | after | delta |
|---|---|---|---|
| PG `writable_db` schemas | 29 | 29 | 0 |
| PG `writable_db` total tables | 35 | 35 | 0 |
| PG `writable_db.public` | 5 (`composite_pk_table, many_data_types, no_pk_table, products, scoreboard_actions`) | 6 — the same 5 **plus `ip_addresses`** | **+1, not mine** |
| PG `sample` (QA read-only) | 9 | 9 (identical list) | 0 |
| MySQL `writable_db` | 4 (`composite_pk_table, many_data_types, no_pk_table, scoreboard_actions`) | 4 (identical) | 0 |
| schema `empty_uploads` | absent | absent | 0 |

`ip_addresses` appeared in `writable_db.public` during my session and is **not
produced by anything in this spec** — a sibling slot's table. Left alone
(FINDINGS #85: siblings are live).

Everything this spec created was removed: per-run the `afterAll` hooks dropped
9 tables from `writable_db.public`, 7 from MySQL `writable_db`, 2 from the QA
`sample` database, and the `empty_uploads` schema (which this spec creates
itself — no foreign schema was ever dropped). Two mutation-only leftovers
(`invalid_20260720040629`, `upload_invalid_20260720040640`, created because the
M2 mutant makes `invalid.csv` valid) were dropped by hand and `"invalid"` was
added to the cleanup prefix list so a future mutation run cleans itself.

## Mutation results

Fixtures restored **byte-identical** (md5 verified against the pre-mutation
values): `dog_breeds.csv a078790819250fcd406466ff7d2d14f9`,
`star_wars_characters.csv a7c919967c038582b9a0c9795e67961c`,
`pokedex.tsv 82557431e9acfa2171c38e9987353dda`,
`invalid.csv 107ead9e45f82fa67a43d506dfe2e896`.
Spec restored byte-identical (`cc31bfe4492f5a7b29f8fd46116efa1d` before and
after M3).

### M1 — the neuter-the-write mutation: `dog_breeds.csv` 97 → 87 data rows

The input the test never re-derives; no assertion was touched. **Killed 10 of 21
tests.** Where each died matters:

- `Can upload dog_breeds.csv to a collection` (both dialects) died at
  **spec:312 — the DB read-back** (`expect(count).toEqual(97)` → received 87),
  *not* at the first assertion. Every UI assertion ahead of it (status toast,
  collection table row, model page, table-root) passed under the mutation,
  which is exactly the model-actions shape: the interaction is intact and the
  test still goes red on the read-back. **The write is load-bearing.**
- All 8 append/replace tests died at their **first** `Showing 97 rows`
  (spec:368/394/420/445), so their *tail* assertions (the post-append
  `Showing 194 rows`, the post-error `Showing 97 rows`) are not proven by M1 —
  stated rather than papered over.
- Survivors, all correctly: `star_wars`/`pokedex` uploads (different fixture),
  `Cannot upload invalid.csv` (different fixture), the model-picker test (uses
  dog_breeds only by *name*), both `permissions` tests, and the upload-management
  test (counts table-name occurrences). None of these reference dog_breeds' row
  count, so surviving is the right answer, not vacuity.

### M2 — `invalid.csv` replaced with a valid 3-column CSV

**Killed both** `Cannot upload …` tests, but at the **first** assertion — the
`Error uploading your file` status (support:179). So M2 proves the error path
and leaves the tail unproven: the `csv_upload_failed` assertion, the no-table
check, and the metabase#55382 block.

### M3 — aimed at the tail M1 and M2 left: `anon-tracking-enabled` false

An input inversion (a setting the product reads), not an expectation change.
Checked for mutation-lie #1 first: `anon-tracking-enabled` is a plain
`:type :boolean` `defsetting` with **no custom `:setter`**
(`src/metabase/analytics/settings.clj:19`), so the mutation really applies.

**Killed 8 of 21** — every test carrying a snowplow assertion, and each died
**at the snowplow assertion itself** (spec:297 `csv_upload_successful` ×6,
spec:323 `csv_upload_failed` ×2), with `saw []`. The collector-side assertions
are load-bearing and are not passing on ambient traffic. The 8 append/replace
tests correctly survived (they make no snowplow assertion).

### Not triggered by any failure mode I could induce

The final absence check in the metabase#55382 block
(`getByRole("dialog", {name: "Upload error details"})` → `toHaveCount(0)` after
trashing the collection). It is **anchored, not vacuous** — the same dialog is
asserted *present* moments earlier inside `uploadFile`'s invalid branch, so the
locator demonstrably can match — but it is weak: it cannot distinguish "the
dialog never reopened" from "the dialog was closed by the explicit Close click".
Reproducing the regression would require breaking the product. Recorded, not
strengthened.

### A bad mutation I rejected

My first idea for the "neuter the write" mutation was to shrink
`VALID_CSV_FILES[0].rowCount` in the support module. That is mutation-lie #2 —
the fixture and every assertion read the same constant, so they move together
and the mutant survives meaninglessly. Mutating the CSV bytes instead is what
made M1 informative.

## Fixmes / audit notes

1. **`test.skip` on "Can upload a CSV file to an empty postgres schema"** —
   FINDINGS #85, measured not assumed. The test ends with
   `TablePicker.getTables()` `have.length 2` immediately after clicking the
   **database** row, which only holds when the database has exactly one visible
   schema (the picker then collapses the schema level and renders tables
   directly). On a pristine CI container `writable_db` has an empty `public`
   plus `empty_uploads` — one visible schema, 2 tables, upstream's number.
   Measured here after the resync the test performs:
   `GET /api/database/2/schemas` → **29 schemas**
   (`Domestic, Wild, Schema A…Schema Z, public`), so the picker renders 29
   schema nodes and **0** table nodes. Confirmed the sequencing too: straight
   after `restore("postgres-writable")` the API reports **1** schema (`public`)
   — the debris only becomes visible once the spec's own resync runs.
   The assertion is kept verbatim and the test skips up front (rather than
   half-running) when `writable_db` carries foreign schemas with tables. It will
   execute on CI.
2. **Vacuous upstream assertion, ported verbatim.** In `Cannot upload
   invalid.csv`, the "no table was created" check builds its SQL from
   `testFile.tableName` — but `INVALID_CSV_FILES` entries carry only `valid` and
   `fileName`, so `tableName` is `undefined` and the pattern is
   `LIKE '%undefined_%'`, which matches nothing whatever the upload did. The
   check cannot fail. Kept verbatim with the analysis inline (weak-but-faithful
   is recorded, not strengthened) — worth fixing upstream, since M2 shows the
   product really does create an `invalid_<ts>` table when the file is valid, and
   this assertion would not notice.
3. **One deliberate strengthening, declared.** Upstream's bare
   `H.resyncDatabase({ dbId: WRITABLE_DB_ID })` waits only for "some table is
   complete", which any pre-existing `public` table satisfies instantly (the
   stale-`initial_sync_status` hole). The port passes
   `tables: ["empty_table"]` — the table the reset just created. A stronger
   *wait*, not a stronger assertion.
4. **`qb-header-append-button`** used in place of
   `cy.findByTestId("qb-header").icon("upload")`. Same element (verified in
   `QuestionActions.tsx:139`), chosen for stability — scoping, not `.first()`.
5. **`headlessUpload` runs inside the page.** `MetabaseApi` has no multipart
   path and does not expose its session id, so the multipart POST is issued via
   `page.evaluate` + `fetch`, where the session cookie already is — the closest
   analogue of `cy.request`'s cookie sharing. Note the content-type header is
   deliberately *omitted*: upstream passes `"multipart/form-data"`, which Cypress
   rewrites with a boundary for FormData bodies; setting it by hand in the
   browser produces a boundary-less header and a 400.
6. **File input**: `setInputFiles` on the `<input type=file>` directly. The
   product's `UploadInput` is `display: none` inside a `<label>`, which
   `setInputFiles` handles by specification — no drag-drop emulation, no force
   equivalent, anywhere in this port.
7. **No Cypress cross-check was run** (standing rule — it would break live
   sibling slots). I therefore **cannot** say whether upstream also fails the
   TablePicker assertion on a contaminated container; the #85 diagnosis rests on
   the measured schema count, not on a cross-check.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: **clean, 0 errors.**
Mid-session it briefly reported 4 errors, all in **another agent's uncommitted
files** (`tests/transforms-permissions.spec.ts` ×3,
`tests/zzprobe-s1.spec.ts` ×1 — `resyncDatabase({tableName})` and
`Locator.getByDisplayValue`). Not mine; they were gone by the final check.

## Runs

- gate-OFF: **21 skipped / 0 executed**
- gate-ON: **20 passed, 1 skipped** (25.5s)
- `--repeat-each=3`: **60 passed, 3 skipped** (1.7m) — no state leakage between
  repeats, which is the thing a write tier is most likely to have.
- Jar verified **by identity**: `GET /api/session/properties` → `version.hash
  751c2a9`, matching COMMIT-ID `751c2a98`.

## Summary (3 lines)

21 tests ported faithfully; 20 green, 1 skipped for measured FINDINGS #85
container debris (29 schemas vs the pristine 1 upstream's TablePicker count
assumes), with the container restored to its exact pre-run inventory.
The snowplow assertions had to run at the per-slot **collector** because
`csvupload` is backend-emitted with no frontend call site — and doing so
uncovered a JVM-wide emitter backlog that delivers events with a persistent
offset, which makes reused slot backends produce *hollow green*, not just red.
Three mutations killed 10, 2 and 8 tests respectively and, between them, reached
the DB read-back, the error path and the snowplow tail; the one surviving
absence check is anchored but weak, and one upstream assertion is vacuous
(`LIKE '%undefined_%'`) and was kept verbatim with the analysis inline.
