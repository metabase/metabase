# Resume here

## ✅ STATUS: THE PORTING QUEUE IS EMPTY (2026-07-21)

**414 specs ported.** `PORTED.txt` has 414 entries; `node scripts/build-queue.mjs`
reports `0 specs queued (0 lines)`.

Verification at handoff:
- `bunx tsc --noEmit` → **exit 0**
- import gate across all 414 specs → **0 unresolved** (the 8 flagged deps are
  `cypress_sample_instance_data.json`, **gitignored and generated at CI time** —
  verified, not assumed)
- branch `playwright-e2e-spike`, PR #77999

---

## Read this before trusting anything below

`FINDINGS.md` is 207 entries. **Twelve of my own claims were corrected on
evidence**, several after being repeated in a dozen agent briefs. Retractions are
recorded in place, not deleted. **If a claim here matters to a decision you are
about to make, check it** — that is the method, and it is why the rest is worth
anything.

Two habits produced most of the value:
1. **Mutation testing every port.** A green port proves nothing until something
   that should break it does. ~12 vacuous assertions were found this way, several
   of them upstream's.
2. **Reporting a briefed hazard as *inapplicable*** — the standard being *"I
   checked the mechanism"*, not *"I didn't see it"*. This prevented manufactured
   work and false "fixes" repeatedly.

---

## 🔴 Owed work, in priority order

### 1. Port `resetWritableDb` (#157)
Cypress's `H.restore("*-writable")` also calls `resetWritableDb`
(`e2e/support/db_tasks.js:41`), which wipes the warehouse. **Ours does not, and it
is not ported anywhere** — while 47 files here restore a writable snapshot. State
accumulates forever.
- **A fidelity gap, not just hygiene** — every spec on that tier runs against a
  materially different warehouse than upstream.
- **Not a drop-in:** a faithful version does `DROP SCHEMA … CASCADE` across
  `Schema A`…`Schema Z` and would destroy a concurrent agent's fixtures. **Land it
  with the slots drained.**
- **Acceptance test, ready-made:** `datamodel-data-studio-search` is **2/6 failed**
  on the real container and **8/8 under a pristine-DB shim**. It should go
  2/8 → 8/8 with no other change (#183).
- Second leak it also covers: model persistence leaks a `metabase_cache_*` schema
  per run **forever** (#195). I cleaned 9 by hand (39 → 30 schemas).

### 2. Two specs are deliberately RED, both on warehouse provisioning
- **`datamodel-data-studio-search`** — above.
- **`workspace-manager`** postgres arm — 412, because `writable_db`'s `public`
  schema grants CREATE to PUBLIC and workspace isolation refuses it. The one-line
  REVOKE belongs in **provisioning**, not a `beforeEach` (#193). Left faithful with
  a full FIXME. Nothing in the repo establishes that precondition, and whether
  upstream passes in CI is **unknown and unclaimed**.

### 3. Fix the viewport (#111)
The harness runs **1280×720**, not the 1280×800 `playwright.config.ts` appears to
set — the `chromium` project spreads `devices["Desktop Chrome"]`, whose viewport
overrides the top-level `use`. **Line 46 has never had any effect.** Add the
viewport *after* the spread, **then re-run the landed ports** — some may encode
workarounds that become wrong at 800. The re-verification is the real cost.

### 4. Fix the snowplow collector's CORS preflight (#133)
It omits `Access-Control-Allow-Credentials`, so the tracker's
`credentials:"include"` POST dies `net::ERR_FAILED` and only the OPTIONS is
recorded — **the collector is blind to FE events**, the opposite of its docstring.
One line. Audited: no landed port currently depends on it for an FE event, but
that is **an inference from reports, not a re-run**.

### 5. Fix `signInWithCredentials` (#139, #148)
It POSTs `/api/session` through `mb.api`, so the cookie lands in the API request
jar and `wrap-session-key` resolves **cookie before header** — every later
`mb.api` call runs as that user, and `mb.signInAsAdmin()` does **not** undo it.
**A mutation proved this makes sandboxing baselines pass while measuring nothing.**
Working shape is in `sandboxing-via-ui`: session POST through a **throwaway
request context disposed immediately**.
⚠️ **`sandboxing-via-api`'s green is marked UNVERIFIED** pending this — 84
`mb.api`/`signInAsAdmin` references.

### 6. CI parallelism — settle before raising the shard count
- `sandboxing-misconfiguration` and `question-reproductions` **both rebuild
  `public.products`** in the shared warehouse; they must not run concurrently
  (#203). Presents as an inexplicable intermittent failure in one of them.
- The **maildev inbox is shared and `setupSMTP` DELETEs it** (#186). `forgot-password`
  shows the fix: isolate on the **per-slot site URL** (#205).
- Some upstream specs are **only safe because Cypress is serial** (#191).

### 7. Smaller, well-scoped
- **`openTable` drops `database` and `limit`** on its notebook branch (#116, #197)
  — three independent confirmations, two near-duplicate workarounds to retire.
- **`.every(` / `.all(` sweep in shared assertion helpers** — `[].every(...)` is
  `true`, so `rowsShouldContainOnlyOneCategory` passes on an empty result set
  (#202). Fixing it also strengthens `sandboxing-via-ui`.
- **`be.enabled` → `toBeEnabled()` audit** (#188/#190): 41 specs exposed, but the
  hazard only bites on **non-form-control** targets and the failure direction is
  **safe** (red against correct code). Any of the 41 currently green have already
  demonstrated consistency.
- **`pro-self-hosted` feature count disputed** — 42 vs 52 (#180). One measurement
  against a freshly started backend settles it.
- **5s first-call tax on `PUT /api/email`** (#207) — localized precisely,
  mechanism unknown, taxes every email spec via the shared helper.
- `support/INDEX.md` is stale. Prettier has never been run on this package.

---

## Environment gotchas that masquerade as port drift

**Check the fixture before accepting a local failure as your own bug:**
- **`e2e/snapshots/blank.sql` is corrupt** — holds the fully set-up `default` state
  (11 users, 97 cards), not a blank instance (#97). Gitignored, so **CI is fine**.
- **The `default` snapshot has a 30-day fuse** (#145).
- **Postgres heap order** broke one assertion via the virtualization window (#103).
- **`schemas[0]` is `Domestic`, not `public`** on this box.
- **Three routes to a false "feature is off"**: the retracted `.env` trailing comma
  (#107/#129 — the harness reads `cypress.env.json`), a probe that PUT an
  **undefined** token (#181), and **underscore vs hyphen** in the feature key
  (#200). `undefined` and `false` are not the same answer.
- **`cypress_sample_instance_data.json` is unsafe for name-based lookups** — it says
  "All internal users" where the jar serves "All Users" (#201).

**Do not regenerate snapshots while agents are live** — they are shared.

---

## What is shared and what is not (#178, #186 — I had this wrong at first)

- **Per-slot, isolated:** everything in the application DB — settings, users,
  groups, tokens, collections, questions. `worker-backend.ts:266` gives each slot
  its own `MB_DB_FILE`.
- **Genuinely shared:** the **warehouse containers** (postgres :5404, mysql :3304,
  mongo), **maildev including its inbox**, and **webhook-tester**.

I over-constrained app-DB writes and under-emphasised warehouse hygiene for most of
this work. **The warehouse is where the real hazards live.**

---

## Running it

```
cd e2e-playwright
JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar \
  PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=<1-5> \
  PW_QA_DB_ENABLED=1 PW_ACTION_TIMEOUT=30000 TZ=US/Pacific \
  bunx playwright test tests/<spec>.spec.ts --workers=1 --trace=off
```

- **Verify the jar BY IDENTITY** (`ps` + `version.hash` vs `COMMIT-ID`) —
  `PW_KEEP_SLOT_BACKENDS=1` silently ignores `JAR_PATH` and prints `(reused)`.
- **Never touch port 4000.**
- **The gate-OFF control is the only trustworthy signal** that a spec really
  executes. Tags have been found wrong in **eight** distinct ways; a green run with
  the gate off is either real coverage or silent skipping, and only the
  executed-vs-skipped counts tell them apart.
- Containers: `postgres-sample`, `mysql-sample`, `mongo-sample`, `maildev`,
  `webhook-tester`, and an **OpenLDAP on :389** started this session — that one took
  `sso-ldap` from **4/14 to 14/14**. `maildev-ssl` and localstack :4566 are down;
  localstack is the real python-transforms blocker.

---

## 🔴 The product finding worth taking to the frontend team

**PR #64406 (`2a6741df9cf`)** widened `DataSelector.skipSteps` from
`databases.length === 1` to `enabledDatabases.length >= 1`, so with two databases
the DATABASE step is **always skipped**.

**Three agents derived this independently, from three specs with three different
symptoms.** The third measured the window directly: `last-used-native-database-id`
is `""` after restore (eliminating the dirty-snapshot explanation), popover open
with nothing selected at **+159 ms**, auto-selected and PUT at **+280 ms** — a
~150 ms window. Seven tests in `native-database-source` are `test.fixme` because
their subject is now untestable; lifting two and running `--repeat-each=5` gave
**0/5 and 0/5**.

**Not claimed:** whether Cypress catches it. The cross-check is barred while
sibling slots are live, so upstream's behaviour is **unknown**.

---
---

# ⬇️ SUPERSEDED — kept for provenance

Everything below predates the queue being emptied. Where it conflicts with the
block above, **the block above wins**.

# Resume here

This is the "you've been away" doc: current state, what's half-done, what to do
first. Read this, then PORTING.md (the playbook — rules, gotchas, env facts).

> ## ⏱ LATEST (2026-07-20, batches 12–17) — READ THIS BLOCK, THE REST IS HISTORY
>
> **The porting phase is essentially DONE. 334 specs ported. Every spec that can
> run against the uberjar in the spike's current CI config is ported.** The
> queue's remaining 80 specs / 58,451 lines are all one tier — see "The one real
> decision left" below. Do not start a porting wave without reading that first.
>
> **Branch state:** `playwright-e2e-spike`, pushed through `bb8f30e4932`. Working
> tree clean. PORTED.txt 334, QUEUE.md 80.
>
> ### 🔴 The one real decision left: the QA-DB tier
>
> **FINDINGS #50 is RETRACTED — I got this wrong and it matters.** I claimed
> these specs "can never run in CI" because `e2e/snapshots/postgres_writable.sql`
> is gitignored. Wrong on every limb: **all** snapshots are gitignored
> (`/e2e/snapshots/*`, including `default.sql` that every landed spec uses) and
> are generated at CI time; and `.github/workflows/e2e-test.yml` provisions
> postgres/mysql/mongo/maildev/openldap/webhook/snowplow and runs
> `grepTags="-@mongo+-@python+-@OSS+-@skip"`, which does **not** exclude
> `@external`. **Cypress CI runs these specs today.**
>
> The gap is *our* workflow, and it is three edits, not one:
> 1. add the `e2e-prepare-containers` action (it already exists; `e2e-test.yml`
>    uses it) — our workflow currently starts **no containers at all**;
> 2. drop `-@external` from the snapshot step (`e2e-playwright.yml:114`);
> 3. set `PW_QA_DB_ENABLED=1` in the test step — it is currently set **nowhere**,
>    so every gated spec would still skip itself silently (#67's failure mode).
>
> **Validated locally, 2026-07-20** — started `postgres-sample` from
> `e2e/test/scenarios/docker-compose.yml`, ran two gated specs with
> `PW_QA_DB_ENABLED=1`:
> - `transforms-codegen` 4 passed / 1 failed (the failure is `402 Premium
>   features required` — Python transforms need a token feature
>   `pro-self-hosted` lacks; **not** an infra problem)
> - `table-editing` 16 passed / 5 failed
>
> So **20 of 26 pass on their first-ever execution**. Expect ~20–25% of the
> gated tier to need real debugging (those specs were written, typechecked and
> never run — the ported-and-gated tier #49 warns about). The 5 `table-editing`
> failures are undiagnosed; a locator waiting on
> `browse-schemas → Many Data Types → edit-table-icon`. **That is the obvious
> next task and nobody has started it.**
>
> Cost caveat: snapshot generation is ~13 min and **each of 20 shards re-pays
> it**. Adding QA-DB snapshots makes that worse ×20. The shared-snapshot-artifact
> idea (below) probably wants doing first.
>
> ### What landed in batches 12–17
>
> The **SDK-iframe tier went 0 → 23 specs** (12 Group A + 11 Group B) after a
> feasibility probe found all three assumed blockers were false. **`support/sdk-iframe.ts`
> and `support/sdk-embed-setup.ts` each needed ZERO changes across all 23** —
> built once, consumed read-only. Best evidence yet for #61 (marginal port cost
> in a covered domain ≈ the diff, not the harness).
>
> Also: the SSO trio, data-studio pairs, the permissions/tenant tail, and a
> 66-entry findings-inbox reconciliation into FINDINGS #45–82.
>
> ### 🟡 Owed / open
>
> - **CI is green** on the pushed tip apart from what's noted below. Two real
>   failures in run 29711801159 were fixed in `68281ccb2fb`; both were artifact
>   drift, not product bugs. **Watch the next run** — the SDK tier and batch-17
>   have not had a full CI pass yet.
> - **`sdk-iframe-embed-options` now FAILS on the stale local jar** by design —
>   its fix matches current master (`select-frequency`), which our 2026-07-18 jar
>   predates. Local re-verification of that spec needs a newer jar. Documented in
>   its header.
> - **`instance-stats-snowplow` is 2 × `test.fixme` and UNPORTABLE as-is** —
>   backend-emitted events have no browser seam (#82). Fixing it means booting
>   slot backends with `MB_SNOWPLOW_URL=http://localhost:<per-slot port>` in
>   `worker-backend.ts`. **Do not bodge it from inside the spec** — the collector
>   port is global across slots and a clean/CI backend would fire real events at
>   `sp.metabase.com`.
> - **`embedding-admin-settings-oss` has 1 `test.fixme`** — the upsell-CTA
>   `role=link` assertion is OSS-**build**-only (`PLUGIN_IS_EE_BUILD`, not a token
>   feature), so no token can reproduce it on an EE jar.
> - **Prettier has never been run on `e2e-playwright/`** — the dir isn't in
>   `.prettierignore` and produces ~50 lines of churn per file. Wants its own pass.
> - **Consolidation debt** is inventoried at the end of PORTING.md and has grown
>   large (`commandPaletteSearch` ×5, `dataStudioNav` ×4, `createCollection` ×5,
>   `updatePermissionsGraph` ×3, the SSO surface across 3 modules, `waitForDashCardQuery`
>   ×2, `embedPreview`, `loadedEmbedFrame`). Rule still: **only consolidate toward
>   a shape Cypress already has.**
> - **Viewport drift** (#41) still unresolved: suite runs 1280×720, config says
>   1280×800. One-liner, but moves ground under 334 specs — needs its own task.
> - Shared snapshot artifact across shards (see the sharding note further down).
>
> ### ⚠️ Two hazards this session paid for — internalise these
>
> **1. CI builds a MERGE commit, so its jar contains master code this branch
> lacks (#79).** A faithful port of a pre-move original legitimately failed on
> CI. **A spec verified only against the local jar may be stale against CI**, and
> this branch is long-lived. To debug a CI-only failure: **download the exact
> uberjar CI ran** from the run's artifact and boot a slot from it — that turns
> "can't reproduce" into ordinary debugging and gives before-red/after-green on
> the *same* artifact.
>
> **2. "Ported and green" is NOT sufficient grounds to delete the Cypress suite
> (#81).** `coverage-baseline.cy.spec.js` is instrumentation, not a product spec:
> `build-coverage-manifest.mjs` subtracts its coverage from every other spec. The
> Playwright port is faithful, passes, and is **functionally inert** — deleting
> the Cypress original would break baseline subtraction and surface as *wrong
> selective-test plans, not a failing test*. Any spec that feeds tooling rather
> than asserting behaviour needs its consumers checked independently.
>
> ### Scoreboard honesty (don't drift from this)
>
> 1 jar-confirmed product bug (#1), 2 open product *questions* (#45, #46 — not
> bugs), **7 retractions** — six product-bug claims plus #50, which was ours.
> Coverage needs two numbers: ported-and-verified vs ported-and-gated. The case
> rests on capability + test-quality evidence, not bug count. FINDINGS #47/#48
> are deliberate entries **against** the migration; keep them.
>
> ---
>
> ## Older history below (batches ≤11) — superseded, kept for provenance
>
> ### ⏱ Prior (2026-07-20) — session ended on the subagent cap.
>
> **Why it stopped:** the session hit `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`
> (200 spawns, cumulative over the whole session — it counts agents *spawned*,
> not running, so stopping agents does NOT free spawns). The per-spec porting
> pool can't be refilled this session. **The cap is per-session, so simply
> starting a NEW session resets the counter to 0 — no env change needed.** Resume
> the 5-slot pool exactly as PORTING.md describes. (Only raise
> `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` if you want >200 spawns within one
> session. Or port in-context on one slot — slower, no parallelism.)
>
> **Count: 273 in PORTED.txt.** ~117 non-SDK specs + 28 SDK-iframe specs remain.
>
> **Batches 10 AND 11 are both pushed.** The batch-11 push superseded batch-10's
> CI run (cancel-in-progress). **Watch CI run 29707147953** (commit `4afc0aca530`,
> batch-11 tip — covers all landed specs): `gh run view 29707147953`. If it goes
> red on a shard, pull the failing spec from the log the same way batch-9 s5 was
> diagnosed (`gh run view --job <id> --log | grep -aiE "✘|Error:|strict mode"`).
>
> **Batch-11** (commit `4afc0aca530`): custom-viz (52 pass / 2 skip),
> measures-queries (29/29), segments-data-studio (19 pass / 1 skip),
> table-editing (21/21 gated-skip, writable postgres), dependency-unreferenced-list
> (11/11 gated-skip). All tsc clean, import-gate applied.
>
> **Batch-10** — commit `aac52adf001`, 18 specs:
> admin-tools-help, collection-picker-tenants, collections-reproductions,
> content-translation-questions, content-translation-upload-and-download,
> data-model-permissions, document-downloads, download-permissions,
> embedding-snippets, embedding-theme-listing,
> entity-picker-shared-tenant-collection, official-collections,
> performance-caching, permissions-reproductions, personal-collections,
> public-resource-downloads, recently-viewed, summarization.
>
> **Batch-10 also carries the fix for the batch-9 s5 red** (this is a reusable
> lesson, now owed to PORTING.md as a gotcha): `dashboard-drill` #15331 hit a
> strict-mode violation because the shared `tableHeaderColumn` (support/notebook.ts)
> scanned **page-wide** `header-cell`s and caught the sticky object-detail
> column's duplicate "Quantity". It's now scoped to
> `getByTestId("table-header").getByTestId("header-cell")`, matching Cypress's
> `tableInteractiveHeader()` — provably the same single element Cypress's green
> selector resolves to. Verified: drill #15331 2/2, summarization caller green.
> **Takeaway: page-wide table-cell locators are a latent strict-mode flake that
> only fires when a second table/column renders (object-detail, pivots) — scope
> to `table-header` like Cypress does.**
>
> ### 🔜 First move next session: resume the pool from the queue
> Nothing is left uncommitted — batches 10 and 11 are both pushed and the working
> tree is clean. Start a fresh session (resets the spawn cap), confirm run
> 29707147953 is green, then dispatch the next wave from the queue picks below.
>
> **The commit gate (why batch-8 broke once — keep doing this every push):**
> 1. Stage only specs that are in `PORTED.txt` AND have a green run. Exclude any
>    in-flight spec/support file (a half-written `.ts` fails collection on EVERY
>    shard — that's the batch-8 0/20).
> 2. Import-resolution gate: for each staged spec, every `../support/X` import
>    must resolve to a tracked-or-staged file. (One-liner used this session:
>    build an `avail` set from `git ls-files support/` + staged support files,
>    then grep each spec's `from "../support/…"` against it — 0 misses required.)
> 3. `git add` wholesale then `git reset` the in-flight files — and re-check,
>    because a running agent may have just created its spec file (this session,
>    `segments-data-studio.spec.ts` snuck into the stage this way).
> 4. One push per batch (`cancel-in-progress:true` cancels the prior run).
>
> ### Consolidation dividends flagged this session (deferred — do in one pass)
> - `savePermissionsGraph` (data-model-permissions.ts) ≡ `saveAndConfirmPermissions`
>   (download-permissions.ts) — promote to a shared permissions helper.
> - The snowplow no-op stub block is copy-pasted across `homepage.ts`,
>   `datamodel-segments.ts`, `segments-data-studio.ts` — hoist to one module.
> - `undoToast` (metrics.ts) ≡ `undoToastList` (organization.ts) — byte-identical
>   `getByTestId("toast-undo")` — unify into `ui.ts`.
> - `support/measures-queries.ts` `_measures_reexports` — clean up once slot-2
>   lands (was WIP).
> - Rule still in force from the last consolidation: **only consolidate toward a
>   shape Cypress already has** (faithfulness > DRY). All four above qualify.
>
> ### Docs owed
> `findings-inbox/` has ~20+ unmerged per-spec entries — reconcile into
> FINDINGS.md / PORTING.md at the next checkpoint (the batch-10 gotcha above is
> the priority one to add to PORTING.md). Regenerate `QUEUE.md`
> (`node scripts/build-queue.mjs`) after batch-11 lands.
>
> ### Next queue picks (largest fully-jar-runnable, no external gate)
> `search/search-snowplow` (674 — was the rejected 201st spawn, not started),
> `dependencies/dependency-broken-list` (576), `data-studio/measures/measures-data-studio`
> (569), `data-studio/table-collection-permissions` (551),
> `data-studio/snippets` (503), `data-studio/transforms/transforms-inspect` (485).
> Filter QUEUE.md for specs whose gates are only `token|snowplow|oss|has-skips`
> (no `external|mongo|email|webhook`) — those run fully on the jar; the rest
> gate-skip or need infra.
>
> ---
>
> **Latest (2026-07-19, consolidation pass):** dedup of the shared helpers the
> "no-shared-edits" rule had duplicated. New `support/factories.ts` (7 canonical
> create* as supersets — ~30 copies across 12 modules collapsed to re-exports;
> follow-up-PUT logic preserved; the one conflicting default [createNativeQuestion
> "native" in filters-repros] kept as a wrapper, not guessed), `support/dnd.ts`
> (moveDnDKitPointer + moveDnDKitElementSynthetic — kept separate, different
> sensors), `support/text.ts` (caseSensitiveSubstring). `notebook.ts
> startNewQuestion` reconciled to the URL-nav form; 4 copies collapsed. 30 files,
> tsc clean, agent-verified broad sample green; full-suite CI is the validator.
> Still owed: api.ts create* methods (broad mb.api.* blast radius),
> documents.ts commentTextContaining (trivial). No behaviour change intended.
>
> Prior (wave 13): +5 chart/model/drill specs; #23076 flake fixed.

> **Wave 13 (2026-07-19):** +5 specs jar-verified — 93 ported, 321 in
> QUEUE. All executable, all green: chart_drill, line_chart, pie_chart, models,
> title-drill. No product bugs. Also batched in the #23076 pivot-subtotal load-
> flake fix (wave-12 s4). 4 new PORTING gotchas (synthetic-mousemove for charts,
> chart-click-swallowed-by-open-popover, pie-drill-on-wedge-path). **Elevated
> consolidation priority: notebook.ts `startNewQuestion` is stale** — flagged by
> 3 ports; reconcile to the URL-navigation form (see PORTING.md). Two more
> vacuous upstream assertions noted (line_chart g.axis.yr).
>
> Prior (wave 12): +10 specs (two parallel waves, one push); QA_DB_ENABLED gate
> unified; #25322 route-crash fixed.

> **Wave 12 (2026-07-19):** +10 specs jar-verified (two parallel
> 5-agent waves, batched into ONE push/CI run) — 88 ported, 326 in QUEUE. All
> real executable coverage (no all-gated specs this time): dashboard-filters-
> reset-clear, temporal-unit-parameters, table-column-settings, viz-charts-
> reproductions, dashboard-filters-auto-wiring, visualizer-basics, collections-
> trash, custom-column-3, sql-filters-reset-clear, dashboard-tabs. No product
> bugs; 2 fixmes (auto-wiring #35461 clock, both cross-checked). Also: unified
> the leaky `QA_DB_ENABLED` gate → `PW_QA_DB_ENABLED` repo-wide (closes the
> gate-naming TODO), fixed the #25322 route-teardown worker-crash (batched in),
> and added 8 wave-12 PORTING gotchas. Two upstream test-suite defects noted
> (dashboard-tabs `assertFiltersVisibility` dead since written).
>
> Prior (wave 11): +5 dashboard/embedding specs; actions-on-dashboards all-gated.

> **Wave 11 (2026-07-18):** +5 specs jar-verified — 78 ported, 336 in
> QUEUE. Real coverage: multiple-column-breakouts (14), viz-tabular-reproductions
> (27), collections (32), embedding-reproductions (15+5 gated). **Caveat:
> actions-on-dashboards is 33/33 all-gated** (writable QA postgres/mysql not in
> the jar snapshots / not in CI's `-@external` gen) — ported but *unexecuted*
> everywhere; don't count it as verified coverage. No product bugs. Two new
> PORTING gotchas (ECharts axis-text spaces; `filter({has})` Locator-scope
> anchoring). **CI cost:** now batching a whole wave into ONE push/CI run
> instead of per-commit. Dedup pass 1+2 done (icon/modal/popover/goToTab →
> ui.ts); create*/text-matcher consolidation still deferred (needs a superset +
> full-suite run). documents-comments formatting-menu test fixme'd (thread 6).
>
> Prior (wave 10): +5 dashboard/embedding specs; bug candidates #1 confirmed /
> #3 retracted; NOTES-parallelism.md added.

## Where the work lives

- Branch `playwright-e2e-spike`, PR #77999. Spike package: `e2e-playwright/`.
- **Never** run `playwright`/`tsc` from the repo root — it scans the monorepo
  and OOMs node. Always `cd e2e-playwright` first.
- Local HEAD is ahead of `origin`. Everything below the "in flight" heading was
  uncommitted when the session ended; see the commit that added this file.

## Ground truth files

| File | What it is |
|---|---|
| `PORTING.md` | The playbook. Port rules, gotchas, env facts, dispatch process. Every gotcha we hit gets appended here — that loop is why later waves need fewer fixes. |
| `QUEUE.md` | Generated dispatch queue, largest specs first. 354 specs / ~192.5K lines remaining at last generation. Regenerate: `node scripts/build-queue.mjs`. |
| `PORTED.txt` | Ledger of source specs already ported. Feeds QUEUE generation. **Currently optimistic — see caveat below.** |
| `support/INDEX.md` | Generated helper catalog so agents don't re-grep. Regenerate: `node scripts/build-helper-index.mjs`. |
| `FINDINGS.md` | The case file — every migration dividend (product bugs, test-suite defects, infra discoveries). This is the artifact that makes the argument to colleagues. |
| `findings-inbox/` | Per-agent dividend drops, merged into FINDINGS.md at checkpoints. **Empty right now** — the agents died before writing their entries. |

### PORTED.txt caveat — fix this first

Lines under `# wave 9 in flight:` were added optimistically. Any spec there whose
port did not actually land must be removed, or QUEUE.md will skip real work.
Verify each against `tests/` and a green run before trusting it.

## In flight when usage ran out

Nine large specs were being ported concurrently, one agent per backend slot.
All agents died on a Fable 5 usage limit (see "Usage" below). The spec files are
**written but mostly unverified** — treat every one as WIP until it runs green.

| Slot | Spec file (lines) | State when the agent died |
|---|---|---|
| 1 | `tests/click-behavior.spec.ts` (2786) | **DONE — verified and landed.** **41 pass / 1 fixme on the CI uberjar**, clean under `--repeat-each=2` (82 passed / 2 skipped), tsc clean. Source `dashboard-cards/click-behavior.cy.spec.js` is in PORTED.txt; findings in `findings-inbox/click-behavior.md`. Two shared-helper changes: `saveDashboard` gained `awaitRequest` (`support/dashboard.ts`), and `openLegacyStaticEmbeddingModal` gained `activeTab` (`support/embedding.ts`) — both optional, backwards-compatible. **Dividend: two upstream tests assert an href the app never produces and pass anyway** (assertions inside `H.onNextAnchorClick` never enforce). The 1 fixme (33379) is blocked by thread #4's `MB_SITE_URL` pin — **see the trade-off table in the findings; it affects any spec that writes site-url.** Not WIP; leave alone. |
| 2 | `tests/dashboard-reproductions.spec.ts` (2438) | **DONE — verified and landed.** 40 pass / 1 skipped (`@skip` upstream) / **0 fixme**, on the **CI uberjar**, clean under `--repeat-each=2` (80/82). Source `dashboard/dashboard-reproductions.cy.spec.js` is in PORTED.txt; findings in `findings-inbox/dashboard-reproductions.md`. **Fixed a harness bug affecting every slot — see open thread #4 below (`MB_SITE_URL`).** A suspected product bug (12926) was **disproven by the jar** after Cypress had failed it identically — the fidelity cross-check alone did not catch it. Not WIP; leave alone. |
| 3 | `tests/dashboard-parameters.spec.ts` (2989) | **DONE — verified and landed.** 43/43 on the CI uberjar, clean under `--repeat-each=2` (86/86). Source is `dashboard-filters/parameters.cy.spec.js` (not `dashboard-parameters.cy.spec.js` — no such file). The suspected product bug is **disproven**: see open thread #2. Needed one helper fix (`undo` → newest toast); the spec itself was already correct. |
| 4 | `tests/metrics-explorer.spec.ts` (2560) | **DONE — verified and landed.** 46 pass / 0 skipped / 0 fixme, clean under `--repeat-each=2`. Not WIP; leave alone. |
| 5 | `tests/dashboard-filters-reproductions-1.spec.ts` (2745) | **DONE — verified and landed.** **39 pass / 1 skipped on the CI uberjar** (updated 2026-07-18: the 6 `test.fixme`s were re-enabled — they pass on the jar and were never product bugs; see thread #3). Only the upstream `@skip` remains. Note the 6 still fail on a local source-mode `--hot` backend — known artifact, CI is the gate. Not WIP; leave alone. |
| 6 | `tests/dashboard-core.spec.ts` (2131) | **Full file green (45 passed / 1 skipped `@skip` upstream), one flake open.** Two port defects found and fixed (one root cause: `saveDashboard` racing an unanchored card-add — now a PORTING.md gotcha). No product bug: a test-side wait fixes both, and a Cypress cross-check on :4106 passed both (⚠️ Electron, predates the `--browser chrome` rule — re-run before citing). **Open (needs a decision, not a fix):** `--repeat-each=2` (89 passed / 1 failed / 2 skipped) caught `auto-scrolling to a dashcard via a url hash param` (:1318); measured **3 fail / 2 pass over 5 runs on a quiet box**. Cause is app-side: `DashCard` scrolls once in `useMount` and clears the `scrollTo` hash immediately, so any later remount/reflow loses the scroll and nothing re-scrolls. Left unmodified and unskipped on purpose — the port's `toBeInViewport()` is *stronger* than Cypress's `should("be.visible")` (which ignores scroll position), so weakening it makes the test vacuous and a `toPass` retry would mask the very behaviour under test. Not claimed as a product bug (fidelity bar not met). See `findings-inbox/dashboard-core.md`. |
| 7 | `tests/documents-comments.spec.ts` (2009) | **DONE — verified and landed.** 47 pass / 1 skipped (the original's `it.skip`), clean under `--repeat-each=2`. In PORTED.txt; findings in `findings-inbox/documents-comments.md`. Not WIP; leave alone. |
| 8 | `tests/interactive-embedding.spec.ts` (2673) | **DONE — verified and landed.** 73 pass / 6 skipped (@external), clean under `--repeat-each=2`, tsc clean. The "mid-write" note was wrong: all 79 upstream tests were already there and typechecked. Not WIP; leave alone. Yielded 4 new PORTING gotchas + 2 infra dividends — see `findings-inbox/interactive-embedding.md`, and **the two config items below want an owner.** |
| 9 | `tests/documents.spec.ts` (2241) | **DONE — verified and landed.** 36 pass / 1 skipped on the CI uberjar, 72/2 under `--repeat-each=2`, tsc clean. Landed by the coordinator after the porting agent stalled twice on the stream watchdog mid-fix. Yielded a general gotcha (CSS-module class names are minified in the jar — never select on them; the class-substring selector was source-green and jar-red). See `findings-inbox/documents.md` §7. Not WIP; leave alone. |

Their new helper modules are equally unverified: `support/click-behavior.ts`,
`dashboard-core.ts`, `dashboard-parameters.ts`, `dashboard-repros.ts`,
`documents-core.ts`, `documents.ts`, `filters-repros.ts`,
`interactive-embedding.ts`. (`metrics-explorer.ts` is verified — slot 4.)

### Debris to delete

`repro1.png`, `scratch-repro2.ts`, `tests/zz-scratch-fixme.spec.ts` — agent
scratch files, not part of the port.

## Open threads worth picking up

**1. `native-subquery` autocomplete — SOLVED, and it retracted a finding.**
The wave-8 CI failure (run 29569211972, 373/374 both legs) turned out to be a
**port bug, not an app bug**: loading a card whose `{{#id}}` tag is unslugged
triggers `updateTemplateTagNames` to rewrite the query text, which leaves the
saved question *dirty*, so the QB runs it through `/api/dataset` and the
`POST /api/card/:id/query` that `visitQuestion` waits for never fires. The
Cypress original used a bare `cy.visit` with no wait, so only the port was
exposed. Fixed with `visitQuestionEitherEndpoint` (`support/native-extras.ts`);
verified 4/4 × 3 runs in jar mode.

**The same investigation retracted FINDINGS #24** — neither sub-claim
reproduces against the CI uberjar, and the previously-fixme'd test now passes
and is re-enabled. See the retraction note in FINDINGS.md and the evidence in
`findings-inbox/native-subquery-ci-failure.md`.

**CLOSED 2026-07-18 — #2 and #22 are also retracted.** The open action above
was carried out against the same jar (slot 11 / :4111). Neither survives:
`parameters: []` is a documented, deliberately-accommodated condition (both FE
and BE derive parameters from template-tags when it's empty — the backend
docstring literally says e2e tests are sloppy about this), the filters render,
and the query succeeds. The "Cypress fails identically" evidence turned out to
be **H2 sample-DB lock contention**: snapshots pin database 1 to the shared
`e2e/tmp` H2 file, our Playwright harness re-points it to a per-worker copy
after every restore and Cypress does not, so a Cypress cross-check run on this
multi-slot box 500s for reasons that have nothing to do with the app. There is
no product bug and no "load-path cluster". Evidence:
`findings-inbox/findings-2-22-reverification.md`.

**All three product-bug claims that rested on a `parameters: []` / load-path
observation (#2, #22, #24) are now retracted.** FINDINGS #1 and #3 are
untouched by this and remain the product-bug claims. Before adding another
"the Cypress original fails identically" finding, read the method note in
PORTING.md — that cross-check is only valid on a quiesced box.

**2. `dashboard-parameters` suspected product bug — CLOSED. Not a bug.**
Settled 2026-07-18. Full evidence: `findings-inbox/dashboard-parameters.md`.

Field 61 = `PRODUCTS.CATEGORY`, which pinned the claim to "should handle
mismatch between filter types (metabase#9299, metabase#16181)". The observation
is **real and reproducible** — on a *freshly booted* backend, `query_metadata`
delivers `fields: [61]` to the browser and the mapper still renders disabled
(`mappingOptions` empty). It is **not** staleness, and **not** a port artifact:
the unmodified Cypress original fails at the *same assertion* on the same
backend, in Chrome.

**But it passes on the CI uberjar**, with byte-equivalent backend payloads
(`fields: [61]`, same MBQL5 `dataset_query`, same `parameters: []`). The branch
touches no product code and only 2 unrelated FE commits landed on master since
the merge-base, so the FE *source* is identical between the two. The differing
variable is the **local rspack hot FE bundle** — environmental, local-only.

This closes the gap FINDINGS #24's retraction left open ("Not verified: the
source-mode side"). It also proves the fidelity cross-check does **not**
establish that a behaviour is real — both harnesses share the FE bundle. See
the corrected rule in PORTING.md. Dead ends already ruled out (don't re-chase):
the MBQL5 `dimension[1]` story (Lib converts to legacy refs first), stale CLJS
(the bundle *has* `ref->legacy-ref`), and `parameters: []` (normal; the jar
returns it too).

**3. `dashboard-filters-reproductions-1` — 6 fixmes. CLOSED 2026-07-18. Not bugs.**
All six **pass against the CI EE uberjar** (`751c2a98`, slot 11 / :4111): 6/6,
and 12/12 under `--repeat-each=2`. All six are **re-enabled**, and the full spec
was re-measured on the jar: **39 passed / 1 skipped** (the upstream `@skip`), up
from "33 pass / 7 skipped". Full evidence:
`findings-inbox/filters-repros-1-jar-recheck.md`.

The controlled comparison — same slot, same box, same spec, only the artifact
swapped:

| Artifact | Result |
|---|---|
| CI uberjar `751c2a9` + static FE assets | **6/6 pass** |
| Source-mode backend `6c67bb8` + rspack hot bundle | **6/6 fail**, at the original assertions |

So the 2026-07-17 observation was real; the **inference** from it was wrong. The
justification ("the original Cypress spec fails identically, so something real
is behind them") established *fidelity only* — both harnesses share one backend
and one FE bundle, which is exactly what thread #2 falsified. This is the
field-61 pattern reproduced on a second, independent spec, and it is now the
**fourth** claim of this shape to die (#2, #22, #24, and this). `21528` — flagged
here as "suspiciously close in shape to #2's symptom" — was indeed the same
thing.

**No product-bug dividends came out of this spec.** FINDINGS #1 and #3 remain
the only standing product-bug claims.

> **Not established** (don't over-quote this): the root cause. Jar mode swaps
> the backend artifact *and* the FE bundle together, so this run doesn't isolate
> which; #2's byte-equivalent-payload evidence points at the **hot bundle**, but
> that's a hypothesis. The rspack server had been up ~3h with HEAD moving under
> it, and PORTING.md already warns long-lived `--hot` builds degrade — the cheap
> unrun experiment is *restart rspack, re-test source mode*.
>
> **Consequence:** these 6 pass in CI (jar) and **fail on a local `--hot` run**.
> Same trade already accepted for #22/#24's re-enabled tests. Local red here is
> the known artifact, not a regression.

**4. Slot backends had the wrong `site-url` — FIXED 2026-07-18 (harness bug).**
Every per-worker backend restored `site-url = http://localhost:4000` from the
e2e snapshot (they were captured against the standard :4000 dev backend), and
`restore()` reinstated it per test. The frontend prefixes root-relative
navigation targets with site-url (`getWithSiteUrl` in `utils/dom.ts`, called by
`openUrl` in `visualizations/lib/open-url.ts:105`), so on a slot backend every
**click-behavior / drill-through** navigation left for **:4000** — a different
backend without the test's data. It fails *quietly*: the URL still matches
`/question`, so `toHaveURL(/\/question/)` passes and the test dies later on a
downstream assertion. All 4 of `dashboard-reproductions`' issue-17879 tests
failed this way (in **both** harnesses — the Cypress screenshot showed the
browser parked on `localhost:4000/question#…` reading "We're a little lost").

Fixed in `support/worker-backend.ts`: slot backends now boot with
`MB_SITE_URL=http://localhost:<port>`. Settings resolve env before the app DB,
so it survives `restore()` (a DB write would not). 17879 went **0/4 → 4/4**
(and from 30s timeouts to 5s each). Applies to source and jar mode alike — it's
a restored DB value, independent of the artifact.

> Scope: this is **not** the cause of threads #2/#3 (see #3 — those pass on the
> jar at :4111 with site-url untouched). `openUrl` targets get the prefix;
> react-router `Link` navigation doesn't. If you have a **landed port that was
> verified on a slot before this fix and had drill-through tests fixme'd**,
> it's worth a recheck.

> **Known side effect (found in slot 1, click-behavior).** Because env beats the
> app DB — the property that makes this survive `restore()` — a test that *writes*
> site-url is now **silently defeated**: the PUT reports success and the value
> does not change (measured on the jar: `https://…/subpath` requested,
> `http://localhost:4101` still returned). Any spec whose scenario is "site-url
> differs from the real origin" cannot run on a slot; click-behavior's
> metabase#33379 test is `test.fixme`'d for exactly this. The escape hatch, if
> another spec needs it, is a post-`restore()` `PUT /api/setting/site-url`
> instead of the env pin — same effect, one PUT per restore, but overridable.
> Slot 1 had built that variant independently and removed it in favour of this
> one; noting the trade-off rather than re-opening it. Trade-off table in
> `findings-inbox/click-behavior.md`.

Also unfinished: the w2-only SCIM test failure (`admin-authentication.spec.ts`
"setup and manage scim feature", died in 20ms, passed on w1) looked like
teardown noise. Watch whether it recurs.

## Outstanding work (as of 2026-07-18, end of the wave-9 session)

State: all nine wave-9 specs landed and pushed (origin `c6a1f19223d`); CI
switched from the workers `[1,2]` A/B to a **4-way spec shard** (workers=2 per
shard). Nothing is running. The items below are open and none is a regression
in landed code.

1. **`metrics-explorer.spec.ts` ECharts tooltip hover — FIX v2 2026-07-18
   (pending CI confirmation).** The three "Expression custom names" tooltip
   tests (now ~1155/1209/1247) are all flaky on CI because the chart is still
   animating after a breakout/metric change when the test hovers a point. Two
   distinct failure modes, seen on two sharded runs:
   - 29616824640 s3: hover lands on a moving point → no tooltip at all
     ("should revert to formula text…", :1131).
   - 29624367644 s3: tooltip flashes up then ECharts hides it again before the
     text assertion → DOM snapshot shows no tooltip ("should preserve custom
     name when re-running…", :1220).

   **v1** (container-anchored `toPass` retry) fixed the first but not the
   second — it returned as soon as the tooltip box appeared, which the transient
   tooltip then outlived. **v2** anchors the retry on the *exact expected text*
   and calls `ensureChartIsActive` first, so the whole hover-and-assert-text
   re-runs as one unit (a vanished tooltip is simply re-triggered) and the chart
   is settled before the first hover. Signature is now
   `hoverChartPointForTooltip(page, expectedText, index=4)`; callers moved their
   positive text assertion into the helper and keep the negative one after.
   Verified locally 24/24 under `--repeat-each=4`. Still can't reproduce the
   4vCPU timing locally, so CI is the validator — watch the next s3.

2. **Per-worker "backend exited (code 0)" flake — ROOT-CAUSED & FIXED
   2026-07-18 (pending CI confirmation).** It's a false positive, not a real
   death. `startWorkerBackend` monitored the launcher process (`node
   start-backend.js`), which spawns the JVM detached, waits until ready,
   `unref()`s it, and returns — so on CI the launcher exits `code 0 / signal
   null` while the detached JVM keeps serving (confirmed from the diagnostic
   run's backend.log: "Backend ready on :4100" then a clean code-0 exit, JVM
   still healthy). The boot loop treated *any* launcher exit as fatal, which
   raced the health probe; under w2 load the exit-check won → healthy backends
   reported dead. Only ever w2 (single-process uses the shared step-backend, no
   managed launcher). This also explains the long-standing intermittent SCIM
   failure that was written off as "teardown noise".
   Fix (`worker-backend.ts`): a non-zero or signalled exit still fails fast; a
   clean code-0 exit is confirmed via the health probe (30s grace), not treated
   as death. Diagnostics kept as a permanent aid: boot-failure errors embed the
   exit code/signal + backend.log tail, and the workflow uploads every slot's
   backend.log. Can't reproduce the code-0 race locally (launchers stay alive
   here — a local Node quirk), so CI validates.

   Two false starts on this, recorded so they aren't re-run: (a) a first fix
   assuming the launcher exits after `unref` was reverted when local launchers
   looked alive — but local ≠ CI here; (b) the "SIGTERM from teardown" theory
   was wrong (`signal=null`, and the fixture never stops backends per-worker).

3. **Viewport drift — suite runs 1280×720, config says 1280×800.** FINDINGS
   #41. `devices["Desktop Chrome"]` at the project level shadows the top-level
   viewport; Cypress runs 800, so this is a real fidelity gap. Left at 720
   (internally consistent, matches what CI runs). Fixing it is a one-liner but
   moves ground under ~60 landed specs, so it needs a full-suite revalidation —
   do it as its own task, not mid-wave.

4. **Bug candidates #1 and #3 — JAR-VERIFIED 2026-07-18. Done.** #1 (embedded
   SearchBar Enter race) **reproduces on the jar** and is a real, embedding-
   scoped bug (sharpened: user lands on /search instead of the highlighted
   result). #3 (`restore()` killing the search index) **does not reproduce**
   (7 probe runs, index populated every time) and was test-infra not
   user-facing — retracted. Net: one confirmed product bug (#1), six retracted.
   See FINDINGS.md #1 and #3. #1's Cypress cross-check is now DONE too: the
   original Cypress test passes on the same jar backend + Chrome 150, so Cypress
   is blind to the race by construction — #1 is fully closed and airtight.

5. **Sharding follow-ups.** The 4-way split is count/order-based, not
   duration-balanced, so a shard drawing several huge specs can run long; bump
   `SHARD_TOTAL` + the matrix list as spec count climbs, and consider a
   timings-balanced split. Bigger win when it's worth it: generate DB snapshots
   **once** and share them as an artifact, so each shard stops re-paying the
   ~13m Cypress snapshot run (each shard currently pays full setup).

6. **`documents-comments` "supports basic formatting with formatting menu" is
   `test.fixme`'d** — needs a deterministic word-select. It selects each word via
   backward cursor arithmetic (ArrowLeft between words + Shift+ArrowLeft to
   select); after each format wraps a word in a mark, macOS stops at mark
   boundaries differently than Linux, so the cursor drifts and a format lands on
   the wrong chars ("bold" → "ld i"). Deterministic macOS-fail / Linux-pass; also
   flaked on a loaded Linux CI shard. The clean deterministic approaches all
   regress against this ProseMirror editor (double-click fights the format
   bubble-menu; a programmatic DOM-range set is reverted by PM; Escape closes the
   composer) — a proper fix needs the editor's own selection API or a robust
   word-locator. Coverage of the four marks is preserved by the passing sibling
   "supports basic formatting with markdown" test; only the menu-interaction path
   is unverified. This is also the clearest example of Playwright exposing a
   cross-platform test fragility Cypress's slower synthetic input masked.

## Usage — read before dispatching agents

The session died because **Fable 5 hit its usage limit** and every in-flight
agent inherited that model. Nine agents died mid-work, several minutes-to-hours
of work each, and none wrote its findings-inbox entry. When dispatching, pass
an explicit model to the Agent tool rather than inheriting, and prefer starting
a wave only when there's headroom to finish it.

## Suggested first moves

1. Delete the debris files listed above.
2. ~~Finish slot 6 (`dashboard-core`)~~ — **done**; verified green and landed.
3. Reconcile `PORTED.txt` against reality; regenerate QUEUE.md.
4. ~~Cypress cross-check for dashboard-parameters~~ (thread #2) and ~~re-run
   `dashboard-filters-reproductions-1`'s 6 fixmes against the CI uberjar~~
   (thread #3) — **both done; neither is a bug.** All 6 fixmes pass on the jar
   and are re-enabled. That answers "do we have any product-bug dividends left":
   **FINDINGS #1 and #3, and nothing else.** Every claim resting on "the Cypress
   original fails identically" is now retracted (#2, #22, #24, + these 6).
   The migration case should lean on the dividends that *did* survive —
   strengthened assertions, silently-vacuous upstream tests, infra findings —
   not on product bugs.
5. Then resume the dispatch loop from QUEUE.md as described in PORTING.md.

## How to verify a spec (the loop every agent runs)

```bash
cd /Users/fraser/Documents/code/metabase/e2e-playwright
JAR_PATH=$(git rev-parse --show-toplevel)/target/uberjar/metabase.jar \
  PW_PER_WORKER_BACKEND=1 PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=<slot> \
  PW_ACTION_TIMEOUT=30000 bunx playwright test <spec> --trace=off
```

**Verify against the jar, not source mode** — it's what CI runs, it's 2-3×
faster per test, and source mode's rspack hot bundle has now manufactured five
false product-bug claims across four specs. Source mode is for debugging with
source maps. See PORTING.md's "Jar mode is the DEFAULT verification loop".

Slot N owns port 410N. Kill that port first if a kept backend mass-fails.
One runner at a time per backend; never touch port 4000 (the shared dev
backend). Confirm stability with `--repeat-each=2` before landing. Run
verification in the **foreground** — a backgrounded run leaves an agent waiting
on a notification it never receives, and the slot stalls silently.

## Local services the ports assume

Docker: `postgres-sample`, `mongo-sample`, `mysql-sample`, `maildev`
(:1025 SMTP / :1080 UI), `webhook-tester`. Compose file:
`e2e/test/scenarios/docker-compose.yml`. Premium tokens come from repo-root
`cypress.env.json` (the values in `.env` are stale — never print token values).

`snowplow-micro` (:9090) is now **also running** (`snowplow/docker-compose.yml`,
started during the documents-comments port and left up). The ports stub
snowplow, so they don't need it — but any **original Cypress spec whose
`beforeEach` calls `H.resetSnowplow()`** dies in `before each hook` in ~1s
without it, which matters for the fidelity cross-check.
