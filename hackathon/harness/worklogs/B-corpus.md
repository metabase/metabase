# Worklog — Agent B (corpus and scenarios)

**Status: ACTIVE (stats-real-v1, real-data corpus)** — previous build DONE, confirmed by F 2026-09-23 ~11:25.

Session: Claude Code session in worktree `metabase-sqlite-semantic-search` (Agent B, brief `agents/B-corpus.md`).
Times are approximate for backfilled entries (before 10:33).

## 2026-09-23 ~09:40 — Read brief, surveyed state
- **What**: Read `agents/B-corpus.md`, `_shared-context.md`, `00-plan.md`, `01-contracts.md`, `brief.md`; inspected `dev/src/dev/search_perf.clj`.
- **Why**: Orientation before asking Voytek anything.
- **How**: Read-only. Findings: (1) search-perf names everything `Perf Card <run-id> 00042` with empty queries, which is useless for quality labels; (2) it is not seedable (`u.random/random-name` run-id, ids depend on app-DB state); (3) `snowflake-arctic-embed2` was not pulled.
- **Open**: → decisions below.

## ~09:45 — Decisions with Voytek
- **What**: Asked 4 questions. Answers: I write the golden corpus by hand (Northwind Outdoor theme); pull arctic; separate app DB per corpus; labels use stable keys rather than raw ids.

## ~09:50 — Embedding throughput (deliverable 1)
- **What**: Measured Ollama throughput with a python script in the scratchpad. No files touched.
- **How**: 100–200 sequential calls to `/api/embeddings` (the endpoint Metabase uses, one doc per call). Results: all-minilm **172 docs/s**; snowflake-arctic-embed2 **81 docs/s** (1024d). Data-scale 10k ≈ 26.4k docs ≈ 2.5 min (minilm) / 5.5 min (arctic) of embedding. So **10k fits, and synthetic injection is not needed**. Side finding: Ollama's `/api/embed` batch endpoint does 460 docs/s, but Metabase uses the single-doc endpoint. Not changed (baseline is off-limits).
- **Open**: Measures embedding time only. Entity creation, sync and pgvector insert time are not included, so not verified end-to-end.

## ~09:55 — Pulled snowflake-arctic-embed2
- **What**: `ollama pull snowflake-arctic-embed2` in a retry loop (flaky wifi). Succeeded first try.

## ~10:00 — Found what text gets embedded
- **What**: Read `src/metabase/search/ingestion.clj` `embeddable-text` and the `:search-terms` in each model spec.
- **Why**: This decides what corpus content matters.
- **How**: Embedded text is `[model]\nname: …\ndescription: …`. Collections embed name only. Documents embed name only (body is keyword-indexed, not embedded). Tables embed name/display_name/description.

## ~10:05 — Wrote golden corpus (first as EDN, then converted)
- **What**: Wrote a 234-entity corpus: 20 tables, 16 collections, 109 cards, 14 models, 16 metrics, 27 dashboards, 14 documents, 10 segments, 8 measures. About 20% is Polish/Japanese. Deliberate traps: near-duplicate names, lexical decoys (HR "Churn" vs customer churn, talent vs customer acquisition), rare tokens (SKU-4471, KPI-017, PO-88213, GDPR-DSR, fct_orders_v2), one restricted collection (Executive Compensation). Voytek approved the plan beforehand.
- **Dead end**: First written as `scenarios/corpus/northwind-{structure,content}.edn`. Converted to `scenarios/corpus/northwind.json` (added table columns and per-collection default tables) after the TS direction change, and **deleted the EDN files**.

## ~10:10 — Dead end: Clojure loader / instance question
- **What**: Tried to check `entity_id` availability on the live :3002 REPL. `clj-nrepl-eval` is not installed, so I wrote a tiny babashka nREPL client in the scratchpad (not in the repo). Checked read-only: Card/Dashboard/Collection have entity_id; Table/Database don't.
- **Why abandoned**: Voytek pointed out my job is to produce artifacts; loading into an instance is the runner's job. Then the TS / outside-in direction came from another session. **The planned `dev/src/dev/harness/corpus.clj` was never created.** No Clojure written, no Metabase source touched.

## ~10:15 — Agreed architecture with Voytek
- **What**: Decisions: (1) I deliver files plus a TS generator; the runner applies them. (2) The TS generator covers golden AND scale tiers, replacing the search-perf path (which Agent A reports does not compile: `search_perf.clj:1008`, `search.ingestion/spec-index-query`). (3) The warehouse is emitted as SQL files for the runner to apply. (4) I write the REST applier; A runs it. (5) Scenarios are JSON. (6) Tell A once formats are drafted.

## ~10:20 — Golden scenarios
- **What**: `scenarios/src/golden.json`: 56 scenarios with `{ref, grade}` items. Tag mix: exact-name 8, rare-token 6, paraphrase 13, concept 10, typo 5, cross-lingual 7 (pl/ja both directions), ambiguous 4, empty-expected 4. Includes near-miss queries from the known 0.7-cutoff failures and `empty-04`, a permission-leak check.
- **How**: Labelled by reading the corpus I wrote.
- **Open**: **Labels not yet sanity-checked against a live baseline** (brief requires 5). Waiting on the throwaway instance.

## ~10:25 — corpus-gen TS tooling
- **What**: `hackathon/harness/corpus-gen/{lib.ts, validate.ts, generate.ts, apply.ts, resolve.ts, package.json, README.md}`. Zero-dependency, `node x.ts` (Node 22.23).
  - `generate.ts golden|scale` → `artifacts/<corpus>/{corpus.json, warehouse.sql}`. Scale follows search-perf multipliers, seeded mulberry32, and builds names from a vocabulary (not `Perf Card N`) so embeddings aren't near-identical.
  - `apply.ts` → REST API: creates database + waits for sync, table metadata, collections, cards/models/metrics (legacy MBQL), dashboards, documents, segments (not-null filter), measures (count), a harness non-admin user + group + collection/data perms. Writes `manifest.json`.
  - `resolve.ts` → §3 JSON with live ids plus `ref`; exits 1 on an unknown ref.
  - `validate.ts` → offline schema/ref/tag-mix checks.
- **How verified**: validate passes; `tsc --strict --noEmit` clean (using `results/node_modules/.bin/tsc`); scale-1000 regenerated with the same seed is byte-identical (shasum); resolve checked against a fake manifest, including a stale-ref failure (exit 1). API payloads were designed from the endpoint schemas (subagent survey of `defendpoint`s).
- **Open**: **`apply.ts` has never run against a real Metabase.** Artifacts generated: golden, scale-100/1000/10000 (10000 = 10 MB corpus.json, 10k tables).

## ~10:28 — Contracts + briefed A
- **What**: Added an "Amended (Agent B)" note to §3 in `01-contracts.md` (refs in `scenarios/src/`, resolved files in `scenarios/`, pipeline). Sent Agent A the artifact list, manifest shape and caveats.

## ~10:30 — Throwaway golden instance (in progress)
- **What**: Voytek chose a throwaway instance for verifying apply. Created `mb_ss_golden` (vector extension) and `northwind_warehouse` in `semantic_search-postgres-1`, and applied `artifacts/golden/warehouse.sql` (20 tables confirmed). Wrote `local/run-golden.sh`: port 3003, H2 `local/golden/golden.db`, `:run` alias with no nREPL, never writes `local/.port` / `.nrepl-port`.
- **Why**: A clean app DB for golden numbers, without disturbing the shared :3002.
- **Open**: **Blocked on the license token.** `op signin` fails through `!` (no TTY). Asked Voytek to write the token to `local/.golden-token` from his own terminal, or enable 1Password CLI integration. The launcher reads that file first.

## 2026-09-23 10:34 — Golden instance up on :3003
- **What**: 1Password CLI integration enabled by Voytek. `local/run-golden.sh` needed `--account metabaseinc` (op saw multiple accounts). Instance healthy after ~95 s. Fresh instance contains no Sample DB and no content. Engine is `semantic`.
- **Dead end**: the first launch failed because the log dir didn't exist yet (my redirect ran before the script's mkdir).

## 10:36 — apply.ts first real run: Metabase race bug
- **What**: `POST /api/collection` with concurrency 8 → 500 PK violation on `COLLECTION_PERMISSION_GRAPH_REVISION` (H2). Metabase-side race. Fix: create collections sequentially (`pool(..., width=1)` in `corpus-gen/apply.ts`).
- **How**: Before resetting, probed every create endpoint once on the half-applied instance (card, model, metric, dashboard, document, segment, measure, table PUT): all 200. Postgres `COMMENT ON TABLE` syncs into Metabase table descriptions.
- **Dead end**: `local/reset-golden.sh` v1 killed by `pkill -f golden.db`, which doesn't match (the DB path is an env var, not on the java cmdline), so the old JVM kept serving. Fixed: kill by listening-port PID. :3002 (pid 35969) was never touched.

## 10:40 — apply.ts verified end-to-end
- **What**: Reset → boot (135 s) → `apply.ts`: all 234 entities + harness user/group/perms in ~2 s after sync. Semantic index reached 250/250 docs. The extra 16 are Metabase built-ins: 9 Usage-analytics dashboards, 2 of its collections, Trash, 2 personal collections, the internal DB, and the warehouse DB. `resolve.ts` → `scenarios/northwind-golden-v1.json`.
- Also added the warehouse database itself to the manifest (`database/northwind-warehouse`), since databases are searchable. `lib.ts`/`apply.ts` changed; the live manifest was patched by hand, not by re-running apply.
- **Open**: that last TS change is **not type-checked**, because `results/node_modules` (the only tsc) disappeared. validate/resolve run fine.

## 10:45 — Label sanity check (all 56 scenarios, semantic baseline, all-minilm, as harness user)
- **What**: Script in scratchpad (not in repo). Results:
  - Permission check `empty-04` passes (no leak).
  - Zero-result bug reproduced on labelled data: para-01, para-03, typo-04 return 0 results.
  - Decoy works: "customer churn" → HR "Churn" dashboard ranks #1.
  - Cross-lingual weak with minilm (xling-03 recall 0), as expected.
- **Label fixes (Voytek approved all)**: added grade-1 labels my first pass missed: para-12 +inventory-planning; concept-08 +fct-wholesale-orders, +cash-collected-vs-invoiced; concept-10 +inventory-daily; ambig-01 +web-orders; para-05 +late-shipments, +fulfilment; para-02 +wholesale-accounts (debatable).
- **Decision (Voytek)**: `expectedAbsent` = permission leaks only. Removed from 7 decoy scenarios; kept only on empty-04. Decoys stay unlabelled, so precision/nDCG already penalise them.
- **Not verified**: arctic embedder runs (the instance runs all-minilm); keyword (appdb) column not looked at.

## 2026-09-23 10:50 — Agent C added `permission_leak`
- **What**: At my suggestion, C added a `permission_leak` metric: 0/1 per scenario, emitted only when `expectedAbsent` is non-empty, and any rank counts (matched on model+id; `ref` ignored). Voytek approved it on C's side. Nothing to change in the corpus: empty-04 already carries the restricted items.

## 2026-09-23 10:52 — Scale tiers: instance scripts parametrised
- **What**: `local/run-golden.sh` / `local/reset-golden.sh` take `INSTANCE=` (default `golden`) and `GOLDEN_PORT=`. App DB `local/$INSTANCE/$INSTANCE.db`, pgvector `mb_ss_$INSTANCE`. reset no longer deletes manifests.
- **Dead end**: first version renamed the DB file to `app.db`, which would have made the next golden restart silently boot on an empty app DB. Caught before any restart; fixed to `$INSTANCE.db` (golden path unchanged).

## 10:53 — scale-1000 verified end to end (fresh instance :3004)
- **How**: warehouse DDL <1 s; boot 112 s; apply: database 27.5 s, sync 9.7 s, entities ~7 s (cards 4.3 s), perms 0.5 s; semantic index 2656/2656 docs 18 s after apply. JVM RSS 3.3 GB, pgvector index table 13 MB.
- **Open**: ~80 s of apply wall time is outside every phase. Not a first-login delay (login measured at 0 s on the 10k boot). Not investigated further.
- Instance stopped but not wiped (`INSTANCE=scale1000 GOLDEN_PORT=3004 ./local/run-golden.sh` restores it).

## 10:55 — scale-10000: apply.ts bug #2 (permission graph timeout)
- **What**: Every entity was created, and the index reached 26,416/26,416. Then `PUT /api/collection/graph` over 1,000 collections failed with 500 "Statement was canceled or the session timed out" (H2). Fix: chunk graph updates in groups of 100 collections, re-reading the revision per chunk.

## 11:06 — scale-10000 verified end to end (reset + re-run)
- **How**: warehouse DDL 3 s (10k tables); boot 84–90 s; database ~1 s; **sync ~2m53s** for 10k tables; collections 1000 in 5.2 s (sequential); cards 10,000 in 35.8 s (~280/s); models 1000 in 4 s; metrics 500 in 1.4 s; dashboards 3000 in 4.6 s; documents 500 in 0.8 s; segments/measures 200 each <1 s; perms 21 s. **Semantic index 26,416/26,416 docs 19 s after apply**, meaning embedding kept pace with creation (all-minilm). Total from boot to queryable ≈ 6.5 min.
- **Not verified**: arctic at 10k; keyword/appdb index state; latency queries (runner's job).
- :3004 left running (scale10000) for A.

## 11:08 — Typecheck fix requested by A/F
- **What**: `EntityDef.model` now excludes `"database"` (TS2741 in apply.ts creators after my 10:40 change). Added `corpus-gen/tsconfig.json` (extends `../tsconfig.base.json`) and a `typecheck` script. `tsc --noEmit -p corpus-gen` passes with the shared strict config.
- **Open**: root `package.json` workspaces entry for corpus-gen belongs to D. Asked A to relay (couldn't identify D's session).
- Answered F's point: only the :3003 golden manifest was hand-patched (it was applied before the database step existed). The 10k manifest was produced entirely by the current apply.ts and includes the database entry.

## 2026-09-23 11:10 — Handoff note from A
- A relayed the root-workspace line to D (session `metabase-sqlite-semantic-search-02`). A is keeping scale10000 on :3004 for the latency tier, so **do not stop it**. A's `pipeline.ts` is building its own fresh golden instance on :3010 with my apply.ts/resolve.ts (`--out local/pipeline/golden_all_minilm/`). That will be the second independent run of apply.ts on a fresh instance.

## 2026-09-23 11:20 — /simplify pass over corpus-gen + instance scripts
- **What**: Voytek ran /simplify. Four parallel review agents (reuse, simplification, efficiency, altitude) looked at `corpus-gen/*.ts` and `local/{run,reset}-golden.sh`. Agent E's tracked `src/` changes were out of scope. Applied:
  - `lib.ts`: `ENTITY_MODELS` / `isCardLike` / `isTableOwned` replace 5 hand-copied model lists. A single `corpusItems()` list feeds `corpusKeys`, duplicate detection and generate's count. `Manifest` now includes `harnessUser.password` and `timingsMs` (the inline widening in apply.ts is gone). `Scenario` and `CATEGORY_TAGS` come from `../shared/types.ts` (dependency-free), since the local copy had drifted (grade/lang optionality, tag order). New check: table names unique, because apply resolves tables by name. `Column` is no longer exported.
  - `apply.ts`: one `createCard(type, display, extra)` for card/dataset/metric. `pool` lost its unused results array and width param. Collections are a plain sequential loop. A table key→meta map replaces the O(n²) `find` (tableId). Sync polls cheap `GET /api/database/:id` until `initial_sync_status=complete`, then fetches metadata once. The collection graph PUT drops its per-chunk GET and uses `force=true&skip-graph=true` (param spelling checked against `permissions_rest/api_test.clj`). No retries on POST (a retried POST can duplicate). Corpus validated at startup. Final check compares key sets and names missing keys instead of a count. `timingsMs.total` added (targets the unexplained ~80 s). Card queries go through `cardTable()`.
  - `resolve.ts`: spreads the authored scenario instead of copying fields by hand. Items stay ordered model, id, ref, grade.
  - `generate.ts`: dropped the duplicate validate in golden mode; restricted collection set inline; summary counts `corpusItems`.
  - Scripts: **fixed a real hazard**. `reset-golden.sh` killed by `GOLDEN_PORT` (default 3003) but wiped by `INSTANCE`, so `INSTANCE=x reset` without a port would have killed golden. run now writes `local/$INSTANCE/port`, and reset kills only that port. Port files backfilled for golden (3003) and scale10000 (3004). Token lookup merged into one block.
- **Skipped (noted)**: replacing the scripts with `runner/src/pipeline.ts` (A owns the pipeline; the scripts are manual tools); consolidating the token lookup with `run-semantic-search.sh` (not mine); granting only restricted collections, relying on All Users root inheritance (depends on instance defaults); single-owner question for harness user (apply.ts vs contracts §5 "runner setup"), for A to decide; the "Sinance" collection-name glitch (fixing it changes the RNG stream, so the running 10k instance would no longer match its artifacts); `node:util` parseArgs (low value).
- **How verified**: root `npm run typecheck` exit 0 (corpus-gen now in root workspaces, done by D; F flagged a mid-refactor red, answered). validate passes. Regenerated golden + scale-1000 corpus.json byte-identical (cmp). Resolved golden scenarios semantically identical. **Fresh-instance run on :3005** (scale-100): apply 265 entities in 5.0 s, harness user gets 403 on the restricted collection and 200 on a normal collection and table. `INSTANCE=scale100 reset` took down only :3005 (3003/3004 still healthy).
- **Dead end**: the first :3005 boot failed with 1Password `promptError` (approval prompt not answered). Retry succeeded.
- **Not verified**: the new sync polling at 10k scale (only 100 tables tested).

## 2026-09-23 11:25 — DONE (build), confirmed by F
- **What**: F checked it independently (validate passes, root typecheck green, :3005 torn down) and confirmed B is complete. Status line added at the top of this worklog.
- **Handed over to A**: (a) who owns harness-user creation (apply.ts vs §5 runner setup); (b) arctic-embedder golden run (on A's run matrix); (c) re-verify the refactored sync polling at 10k (A's next 10k pipeline run covers it).
- **Reopen trigger**: a label dispute once arctic/cross-lingual or new-engine (sqlite-vec1, lucene) results arrive.
- **Left running**: golden on :3003 (local/golden), scale10000 on :3004 (A uses it for latency). scale1000 stopped but intact on disk.

## 2026-09-23 — Reopened: is the golden set representative? → real-data corpus
- **What**: Voytek asked whether 234 items / 56 questions is representative. My answer: the query count is on par with TREC's 50 topics, but per-category slices (n=4–13) are anecdotal, the corpus is ~20× smaller than the smallest BEIR set, and the judgments are shallow. Suggested pooled judging, distractors plus condensed lists, more queries, CIs, or real content. Voytek picked real content (Stats).
- **Research** (Notion + Slack, read-only): the raw Stats pg_dump route (Notion "Working with a Stats dump") has been closed since ~2026-09-03 (security discussion in #ama-engineering; REPL disabled). The sanctioned route is the **sanitized redacted-remapped snapshot** built for the Metabot evals (evals repo, BOT-2001), stored in S3 in the CoreDev AWS account.
- **AWS access**: self-serve per Notion "New User Account Creation & Access Provisioning" (SSO via Google, auto-assigned to CoreDev). Created `~/.aws/config` (SSO session `metabase`, profile `core_devs`, role `core_devs-coredev`, found via `aws sso list-account-roles`; the first guess `core_devs` was wrong). Voytek completed the browser login. Identity check OK.
- **Artifact** (listed only, nothing downloaded): latest version `2026-09-17-pg-custom-ab992524190a-e0ac6cbddc4d`: appdb.dump 44 MB, vector.dump 116 MB, manifest (counts: 16,318 cards, 1,805 collections, 22,171 tables, 22,212 semantic docs; migration head v64; own vectors from ai-service arctic-l-v2.0, not comparable to ours). `latest.json` pointer is missing (404).
- **Plan** sent to F (corpus id `stats-real-v1`, ~150 blind-written questions with a frozen split, local-only data handling). Voytek approved the plan and the size. **Waiting for F's go-ahead**; nothing downloaded or created yet.

## 2026-09-23 19:00–19:20 UTC — stats-real-v1: F go-ahead, restore, slots, blind questions
- **F's conditions**: queue hold for boot+indexing only (release right after); verify indexing with scheduler off; log migrations; port 3041 (added to START-HERE port table); first 60 questions before the full ~150.
- **Download**: `local/stats-real/{appdb.dump,manifest.json}` (chmod 600, git-ignored), sha256 matches the manifest.
- **Restore**: NEW DB `mb_stats_real` (+citext) via `docker exec -i … pg_restore --no-owner --no-privileges`: 6 s, 0 errors. Counts match the manifest (cards 16,318; collections 1,805; tables 22,171; databases 41), plus dashboards 2,610, documents 197, segments 64, measures 19, users 353. Migration head at restore: v64.2026-07-25T00:39:56. Also created NEW pgvector DB `mb_ss_stats_real` (+vector).
- **Launcher**: `local/run-stats-real.sh` (Postgres app DB, encryption key read from the local manifest and never printed, MB_DISABLE_SCHEDULER=true, :run alias, port 3041, minilm). Admin via config-file user with `is_superuser: true` (password in `local/stats-real/.admin-password`, 600). Unattended `local/stats-real/hold-boot-index.sh` waits for hold `190503-d10b`, boots, logs migration head, admin superuser flag and index progress (re-init fallback), then releases.
- **Catalogue**: `corpus-gen/stats-real/extract.ts` → `local/stats-real/catalogue.json`: 14,848 grantable entities (non-archived, outside personal collections): card 10,285, dataset 633, metric 72, dashboard 662, table 2,299, collection 730, document 101, segment 52, measure 14. ~18% of cards have a description.
- **Data note**: some document bodies name real customer companies, so the sanitization is not total. Everything stays under `local/stats-real/`; no names go into worklogs or messages.
- **Slots** (`local/stats-real/slots-v1.json`, frozen before any question text): 60 slots: sql-only 8, mbql-only 5, column-only 6, contained-card 5, same-name 4, body-only 3, contents 3, exact 8, paraphrase 11, typo 4, empty 3. Stratified split 37 dev / 23 held-out (tags split-dev/split-heldout, as in northwind-sql-v1). 56 targets (26 documented), 133 graded items, including grade-1/2 co-answers found by a keyword pass over the catalogue. Label version `v1-initial`; pooled judging comes next.
- **Blind questions**: a Sonnet subagent got only a one-line intent per slot (names only for the 16 exact/typo/same-name slots) and no tool access to content. Output in `local/stats-real/blind-queries-v1.json`. `corpus-gen/stats-real/assemble.ts` → `local/stats-real/scenarios-v1.json` (§3 shape, ids pinned to the snapshot, plus a `documented`/`undocumented` tag).
- **Run prep**: `corpus-gen/stats-real/setup.ts` (harness user + group, read on all shared collections chunked by 100, data perms on all DBs, writes `local/stats-real/manifest.runner.json`); `local/stats-real/runner.config.json` (A's recipe: engines semantic/appdb/in-place, pgvector probe mb_ss_stats_real, limit 10, 5 iterations, 2 warmup). Root typecheck exit 0.
- **Open**: the hold hasn't started yet (queued behind the lucene smoke). The engine run will be a separate quality job after release (F). Not yet verified: boot on migrated DB, admin superuser flag, indexing with scheduler off.

## 2026-09-23 19:15–19:25 UTC — Hold 1: boot OK, indexing blocked by disabled scheduler
- **Verified**: :3041 healthy after 85 s. The restored copy migrated forward **v64.2026-07-25 → v65.2026-09-11T12:00:03** (new DB mb_stats_real; only :3041 uses it). Config-file admin is a superuser.
- **Blocked**: with MB_DISABLE_SCHEDULER=true the semantic index stayed at 0/22,215 after 60 s and after POST /api/search/re-init. The semantic API has only /status; the indexer is a Quartz task. Released hold 190503-d10b early (19:21).
- **Safety check before enabling the scheduler** (local copy, counts and shapes only, no values printed): 0 SMTP settings, 0 Slack settings, 0 active channels, 0 active pulses, 7 active notifications (**set active=false in mb_stats_real only**). Of 33 syncing warehouses: 26 placeholder hosts, the rest scrubbed/missing/service-name, 1 unparseable, 0 real-looking. Metabase has no per-job disable (only MB_DISABLE_SCHEDULER), so scheduled syncs will just fail to connect.
- **Dead ends**: `/api/database?include_details=true` returns malformed JSON mid-stream (probably one DB's details fail to decrypt). Per-DB GETs work.
- **Next**: hold 192216-a9c2 → `local/stats-real/hold-boot-index-2.sh` restarts :3041 with STATS_REAL_DISABLE_SCHEDULER=false, indexes, releases. F and A informed.

## 2026-09-23 19:30 UTC — F's outbound guards before enabling the scheduler
- **Env** (local/run-stats-real.sh): MB_ANON_TRACKING_ENABLED=false, MB_CHECK_FOR_UPDATES=false, MB_SEND_NEW_SSO_USER_ADMIN_EMAIL=false. The snapshot's own settings had anon-tracking and check-for-updates ON.
- **Sync off (mb_stats_real only)**: 40 non-audit DBs → is_full_sync=false, is_on_demand=false, metadata_sync_schedule and cache_field_values_schedule = '0 0 0 1 1 ? 2099' (is_full_sync=false alone doesn't stop the scheduled metadata sync). Verified 0/0/0 afterwards. Old values: local/stats-real/db-sync-backup.csv.
- **Log check** added to hold-boot-index-2.sh (counts of sync / connect-fail / email / slack / snowplow lines before release). Hold 192216-a9c2 is slotted by A after the sqlite overlap probe (~19:40).

## 2026-09-23 19:35 UTC — Helped K (demo deck) set up a Stats demo copy
- K is building a throwaway semantic-duplicates demo (F-approved) and asked how to copy my setup. Answered: reuse `northwind_warehouse` read-only (never re-run warehouse.sql, which drops the schema); restore **mb_stats_demo from the pristine local/stats-real/appdb.dump (v64)**, never from mb_stats_real (already migrated to v65 by this worktree); key from manifest.json; config-file admin with is_superuser; scheduler caveat.
- New: `local/stats-real/guards.sql`, the idempotent, re-runnable outbound guards (notifications off, sync off plus 2099 schedules on non-audit DBs) with before/after counts. Verified idempotent on mb_stats_real (after: 0 / 0 0 0).
- Correction sent: migration changesets are in versioned subfolders (`grep -rl … resources/migrations/`), not `resources/migrations/*.yaml`.

## 2026-09-23 19:45–20:10 UTC — Hold 2, first stats-real-v1 run
- **Hold 192216-a9c2** (started 19:45): :3041 restarted with the scheduler ON plus guards; healthy after 115 s; migration head v65.2026-09-11; admin superuser OK. Indexing climbed (1,629 at boot), then **stalled at 22,158–22,161 / 22,215**: 59 long docs (849–3,190 chars) get Ollama minilm HTTP 500 and are retried forever (222 log lines). F's decision: accept 99.7%. Hold released ~20:05.
- **Outbound check** (run.log since restart): sync starts 0, email 0, snowplow/anon/version 0. "slack" = 11 migration filenames only. 9 connect failures, all from Metabase's **startup database health checks** (they run regardless of sync flags): Athena UnknownHost, BigQuery → metadata.google.internal. All failed. Snapshot hosts are scrambled / *.disabled.invalid.
- **Unindexed expected items**: 20 of 127 (18 grade-1 ARR cards in same-01, the para-07 grade-2 target table, one para-09 table). Noted in scenario notes; para-07 tagged `unindexed-target`. Indexed set exported to local/stats-real/indexed-ids.tsv.
- **setup.ts**: harness user 2015 (non-admin) in group 591, read on 731 collections, data on 40 DBs. Fix: GET /api/database returns malformed JSON on this snapshot, so DB ids now come from the permissions graph.
- **Runner**: run.ts preflight requires manifest `entities`; set it to the 107 indexed expected items (notes.indexedShort=59, expectedNotIndexed=20).
- **Run 20260923-200822-424419**: 180 observations, 0 errors, 2,762 metric rows. nDCG@10 semantic 0.249 / appdb 0.224 / in-place 0.188. Semantic zero-result rate 0.456. Undocumented targets ~0.03 for all engines; sql-only, mbql-only, contained-card and contents 0 for all. Semantic's edge is paraphrase only (0.28 vs 0.15). Full breakdown sent to F.
- **Not done**: pooled judging (labels are v1-initial); arctic; sqlite-vec1/lucene on this corpus.

## 2026-09-23 20:20 UTC — F's checks: silent fallback + cutoff
- **Silent appdb fallback**: 48 × "Error executing semantic search, falling back to appdb" in :3041's log, all inside run 20260923-200822-424419's window (20:08:22–20:09:33 UTC). Every one is the same kind of error: toucan2 `:model/Card` `result_metadata` schema validation, "disallowed key" (database_type 41, table_id 3, lib/source_column… 2, fk_field_name 1, inherited-temporal… 1). **The semantic column of that run is mostly appdb.** Real-data-only bug.
- **Cutoff check** (`local/stats-real/cutoff-check-v1.json`): embedded each answerable query with Ollama all-minilm and ran distances directly in pgvector (non-archived, no permission filter). All 26 semantic zero-result scenarios have ≥1 candidate under 0.7 (median best distance 0.409), and so do all 31 non-zero ones. So the zeros come from the fallback (appdb returns nothing), not the cutoff or the 59 unindexed docs.
- Proposed to F: report as-is, plus measure true semantic retrieval by stripping disallowed result_metadata keys in the LOCAL copy (or scoring pgvector directly), then rerun. Waiting for F.

## 2026-09-23 20:30 UTC — F: a + b. Run marked unpublishable; data patch blocked on permission
- Run 20260923-200822-424419: `notes.publishable=false`, `excludedReason="semantic silently fell back to appdb on 48/60 queries: result_metadata schema errors"` (one UPDATE on harness_run.notes, jsonb merge).
- Finding written to `local/stats-real/fallback-finding.md` (keys and code locations only). Error keys across the 48 messages: database_type 117, table_id 74, source 22, lib/source_column_alias 11, base_type 5, expression_name 4, lib/type 4, fk_field_name 1, inherited-temporal-unit 1 (plus field_ref, fingerprint, effective_type, coercion_strategy, unit, was_binned). The catch at semantic_search/core.clj:138 logs ex-message only, no stack trace.
- **Deviation from F's plan**: stripping the listed keys won't work, because every legacy snake_case key in the maps is reported as disallowed (a closed schema). 16,100 of 16,286 cards use that format. Plan: null `report_card.result_metadata` on the local copy (search uses name/description only). Backup: `local/stats-real/result-metadata-backup.csv` (600, 16,286 rows).
- **Blocked**: the bulk UPDATE on mb_stats_real was denied by the permission classifier ("mass delete"). Asked Voytek. Not attempted any other way.
