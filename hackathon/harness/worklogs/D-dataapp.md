# Agent D — results store + Metabase data app

Session: `metabase-sqlite-semantic-search-02`

Entries up to 10:33 were backfilled at 10:33; the times on them are approximate. (Run ids use UTC, so
they read about 4h ahead of these local times.)

## 2026-09-23 09:35 — Decisions with Voytek before starting (backfilled)
- **What**: Asked four questions before building. Answers: add a `harness_scenario` table (contract change); fixtures encode the hypothesised story but are labelled FIXTURE; all 5 engines; build the dashboard with a REST-API script rather than the UI.
- **Why**: §4 had nowhere to store scenario → tags/query text, and the tag slice and the drill-down both need them.

## 2026-09-23 09:40 — Contract §4: harness_scenario + metric names (backfilled)
- **What**: `01-contracts.md` §4. Added the `harness_scenario` table and the metric-name conventions. Later took on Agent C's `engine_b` column, C's convention for `false_positive_rate`/`zero_result_rate` on `:empty-expected` scenarios, `kendall_tau_n`, the `*_share` metrics, and an optional `name` field in `returned`.
- **Why**: The data app filters on exact metric strings; C and D needed to agree on them.
- **How**: Coordinated by message with A (8a) and C (c5). Both acked.

## 2026-09-23 09:45 — Schema (backfilled)
- **What**: `sql/01-schema.sql`, which is §4 made idempotent (named indexes, `IF NOT EXISTS`, `ALTER … ADD COLUMN IF NOT EXISTS` for `engine_b` and `embedding_text`). Created DB `harness` in `semantic_search-postgres-1`.
- **How**: Applied twice in a row, clean both times (verification item 1). Re-applied after each amendment.

## 2026-09-23 09:50 — Clojure writer + fixtures (later REVERTED) (backfilled)
- **What**: Wrote `dev/src/dev/harness/results.clj` and `fixtures.clj`, loaded them into the :3002 JVM over nREPL (port 50605, via a small Python nREPL client in my scratchpad, since `clj-nrepl-eval` isn't installed), and smoke-tested with a throwaway `writer-smoke` corpus, which I then deleted.
- **Dead end**: The first fixtures drew randomness independently per engine, so semantic vs sqlite-vec1 Jaccard came out at 0.41 instead of about 0.9. Fixed with common random numbers per engine family.
- **Reverted**: Both files deleted after the TypeScript/outside-in direction change. Voytek confirmed the port. The namespaces were removed from the running JVM. A's `adapter.clj` and C's `metrics.clj` were not touched.

## 2026-09-23 10:00 — Views (backfilled)
- **What**: `sql/02-views.sql`. Latest finished run per (corpus, scale, embedder, embedding_text); observations; per-scenario and per-tag metrics; ranked lists; ranked results with grades; Jaccard recomputed from `returned`; variance-share decomposition (vector engines only).
- **Why**: Contract §5.2 says one run = one embedder, so the dashboard can't filter on a single run_id. It filters on corpus + scale and picks the latest runs.
- **How**: Applied twice. Sanity-checked every view with psql.

## 2026-09-23 10:05 — Fixture noise question (backfilled)
- **What**: Per-tag cells are noisy (n = 2–10 per tag). Voytek chose to keep the noise and show n and spread, not to sharpen the fixtures.
- **Why**: The real ~40-scenario golden set will be exactly this noisy.

## 2026-09-23 10:10 — Port to TypeScript (backfilled)
- **What**: `results/` package: `src/writer.ts` (startRun/recordScenarios/recordQueryResults/recordMetrics/finishRun), `src/fixtures.ts`, `src/schema.ts`. Node ≥ 22.18 type stripping, no build step, only dependency `pg`.
- **How**: `tsc --noEmit` clean; fixtures regenerate in under 0.5s; the planted effects re-checked in SQL. A and C were told the new API.

## 2026-09-23 10:15 — Metabase data app (backfilled)
- **What**: Added `harness` to Metabase as warehouse DB "Search Harness" (it is not the app DB). `results/src/dashboard.ts` + `dashboard-cards.ts` build the collection, cards and dashboard over the REST API, idempotently (matched by name). The Python prototype `dashboard/build_dashboard.py` was deleted after the TS port.
- **How**: A script ran every dashcard through `/api/dashboard/:id/dashcard/:dc/card/:c/query` with the default filters; all return rows (verification item 2, at the API level).

## 2026-09-23 10:20 — Serdes round-trip (backfilled)
- **What**: `results/src/serdes.ts` exports and imports via `/api/ee/serialization/*`. The export lives in `dashboard/serdes/` (collection only; instance-global python libraries and transform tags are pruned).
- **Dead end**: Node fetch got an empty body because the server gzips the tar.gz a second time. Fixed with `Accept-Encoding: identity`.
- **How**: Export → hard-deleted all 23 cards, the dashboard and the collection → import → every card returns rows again, and the tabs and filters are intact. Verification item 3 passes. The dashboard id changed 11 → 12.

## 2026-09-23 10:25 — Frontend for visual check (backfilled)
- **What**: The :3002 backend had no frontend. With Voytek's OK, ran `bun install` + `MB_FRONTEND_DEV_PORT=8090 bun run build-hot` in this worktree, in the background. 8080 is taken by Voytek's ssbudget app; 3000/3001 were left alone.
- **How**: The backend's CSP only allowed :8080. I changed `metabase.server.middleware.security/frontend-dev-port` and `frontend-address` to 8090 in the running JVM (alter-var-root over nREPL). That is runtime-only and reverts on restart. No source change.
- **Open**: The browser shows the login page. I don't type passwords, so Voytek has to sign in before I can screenshot the tabs. **Visual rendering is NOT verified yet** (pivot heatmaps, box plots, log axes).

## 2026-09-23 10:30 — Axis 4 (embedding text, Agent E) + C cleanups
- **What**: Added `embedding_text` to the writer (`RunInfo.embeddingText`), the schema, and every view. The "latest run" key now includes it. Every card got an "Embedding text" filter (default baseline). New tab "Embedding text" with 4 cards: box plot by engine × variant; paired Δ vs baseline with CI; Δ by category; a sanity check that keyword engines don't change across variants. Fixtures now write 10 runs (the context/context-sql variants only at scale 100).
- **What (C cleanups, Voytek approved)**: fixtures now use C's `toMetricRows` (`../metrics/src/metrics.ts`) instead of my stand-in metrics. Tags are canonical in the `Scenario` type and the writer no longer strips `:`. `results/tsconfig.json` target raised to ES2024 for `Map.groupBy`.
- **How**: tsc clean; 23/23 cards return rows; appdb's nDCG is identical across variants (0.328 ×3).
- **Open**: Shared npm workspace (Voytek approved it) still to do. It touches A's and C's packages, so I'll coordinate before touching their files.

## 2026-09-23 10:40 — Shared npm workspace (root files + install)
- **What**: Added `hackathon/harness/package.json` (workspaces results/metrics/runner; typescript, @types/node and @types/pg at the root), `tsconfig.base.json` (ES2024, NodeNext, strict), and `shared/types.ts` (row types + `METRIC` name constants). `results/tsconfig.json` now extends the base, and `writer.ts` re-exports the types. Removed results' devDependencies, lockfile and node_modules. Ran `npm install` at `hackathon/harness/`.
- **Why**: Voytek approved it. It removes C's borrowing of results/node_modules and gives the metric names one home.
- **How**: A and C OK'd it; each migrates their own package. results typechecks from the root; fixtures and the dashboard rebuild both still work.
- **Open**: runner/ (A) and metrics/ (C) aren't migrated yet; both were pinged. **The browser visual check is still blocked**: the Chrome tab stays on the login page, and screenshots fail because another extension's UI (probably the password manager) is covering the page.

## 2026-09-23 10:50 — permission_leak (Agent C) + visual check + fixes
- **What**: Added `METRIC.permissionLeak` to `shared/types.ts` and a note to §4. New "Permission leaks" card at the top of the About tab (any row with Leaks > 0 is highlighted red). The fixtures' two empty-expected scenarios got an expectedAbsent item that is never returned, so the fixture state shows all clear.
- **What (visual check, all 8 tabs in Chrome after Voytek signed in)**: Found and fixed: (1) both latency line charts collapsed onto one x position with a log axis on data_scale → switched to an ordinal axis labelled 100/1k/10k; (2) Metabase's legacy table pivot doesn't apply conditional formatting to the columns it creates, so the 4 heatmaps had no colour and the drill-down had no ✓ highlight → pivoted in SQL instead (a `wide()` helper generates one column per engine/variant); (3) several cards were too short → resized. Default drill-down scenario changed to fx-concept-01 "customer churn", which shows highlights.
- **How**: Screenshots of every tab before and after the fixes; 24/24 cards return rows through the API; serdes re-exported (`dashboard/serdes/`, 31 files). Confirmed :8090 still loads after E's hot-load.
- **Not verified**: I didn't re-run the destructive serdes round-trip after these changes. The earlier round-trip passed, and the export format hasn't changed.
- **Open**: The C message about permissionLeak (constant is ready) may not have reached C: my earlier send was cut off. A still has to migrate runner/ to the workspace.

## 2026-09-23 11:03 — /simplify pass (4 parallel reviews: reuse, simplification, efficiency, altitude)
- **What**:
  - **shared/types.ts** now holds ENGINES, KEYWORD_ENGINES/isVectorEngine, EMBEDDING_TEXT_VARIANTS, CATEGORY_TAGS and RunInfo.embedder.
  - **harness_run.embedder** is a new column, backfilled; the writer stamps it and rejects batches that mix embedders (§5.2 is now enforced). The redundant (run_id, engine) index is dropped.
  - **Views:** they no longer scan all observations per card; the DISTINCT ON keys lead with the corpus/scale/embedder/variant columns so filters push down; top10 is built after dedup; the ranked view emits a NULL-rank row for empty lists.
  - **Cards:** built via `card()`/`where()`, so each card's SQL clauses come from its tags. Added categoryHeat/latencyLine/metricBox/rateBars/HEAT/FLAG helpers, a palette, and METRIC names in the SQL. The agreement diagonal no longer recomputes the view; the Scenario name lookup is one join; the per-engine p50 is scoped to the latest runs.
  - **Filters:** a single FILTERS table. The Scenario filter uses value=scenario_id with a label_field (no more string parsing). Embedding text is required.
  - **mb.ts:** one Metabase client shared by dashboard.ts and serdes.ts. **is-main.ts:** robust entry check. **writer:** withTransaction. Unused exports removed; ensurePgDatabase/ensureMetabaseDatabase renamed.
- **Skipped**: reusing runner's MetabaseSession/isMain (results would depend on runner); an engine-family table (a list constant gets most of the benefit without a contract change); reading stored latency/Jaccard rows instead of recomputing in SQL (changes displayed numbers); parallel card upserts (one-off CLI).
- **How**: typecheck + 64 tests pass; schema applied twice; 24/24 cards return rows; agreement numbers unchanged (0.96/0.72); embedder guard rejects both bad cases (tested with a throwaway run, then deleted); drill-down and label dropdown checked in the browser; serdes re-exported.

## 2026-09-23 11:10 — Per-run labels (#1), F's rulings (#2, #3), NULL-scale fix
- **What (#1, Voytek approved)**: `harness_scenario` is now keyed (run_id, scenario_id) with an FK to harness_run. The migration in 01-schema.sql copies each corpus's labels onto its runs; the golden run's 56 rows were kept. `recordScenarios(runId, scenarios)` takes the corpus from the run. Views join labels on run_id. The Scenario card follows the Scale/Embedder/Embedding-text filters to the runs in view. §4 amended. Fixtures record labels per run; clearFixtures deletes labels before runs (FK).
- **What (#2, F ruled)**: A owns the dashboard defaults; D ships an app that works for any corpus. Filter.default is optional, and A has the exact FILTERS edits.
- **Bug found and fixed**: optional card template tags carried a card-level default (Scale 100). When a dashboard filter is cleared, Metabase falls back to that default, so an empty Scale silently meant scale=100 and hid NULL-scale (golden) runs. Card defaults now apply only to required tags. The agreement view and 2 card joins now compare data_scale with IS NOT DISTINCT FROM.
- **What (#3, F ruled)**: no relabel. Added a sentence to the About tab and SEMANTIC_NOTE to the cards comparing semantic with appdb, stating the appdb top-up below semantic-search-min-results-threshold.
- **Also**: added corpus-gen to the root workspaces (B, via A). The harness_run.embedder note is in §4.
- **How**: F's done-check through the API, with Corpus=northwind-golden-v1, Scale empty and scenario concept-01: 22/24 cards return rows. The other 2 (variant Δ by category, keyword sanity) correctly have no data with no non-baseline golden run. The fixture defaults still give 24/24. Schema applied twice; typecheck OK; serdes re-exported.
- **Open**: A must change runner/src/run.ts:98 to recordScenarios(runId, …); A has been told. It would currently fail loudly at runtime, not silently.

## 2026-09-23 11:14 — DONE (build), confirmed by F
- **What**: Added the "Bring the data app back after a restart" runbook to `agents/D-dataapp.md` (boot with MB_FRONTEND_DEV_PORT=8090, dev server, schema/dashboard/serdes restore, checks). Added `npm run check` (results/src/check.ts), a durable version of my scratchpad card checker. Marked D **DONE (build)** at the top of the brief.
- **Why**: F's condition. The app depended on runtime state (the :8090 dev server and an in-JVM CSP patch); the runbook makes a restart recoverable without the patch.
- **How**: `npm run check` → 0 errors, 0 empty cards on the fixture defaults. Runbook commands were **not executed** (F: don't restart anything). The boot-env path was verified by reading local/run-semantic-search.sh (it sources the env file and execs clojure with the caller's env) and security.clj (reads MB_FRONTEND_DEV_PORT).
- **Handed over**: dashboard defaults → A; run.ts recordScenarios fix → A (F verified it's done). Reopen trigger: the first variant or arctic golden run.
- **Note**: root `npm run typecheck` currently fails in corpus-gen/resolve.ts (B's code, now in the workspace). results/ typechecks on its own.

## 2026-09-23 16:18 — REOPENED by Voytek: Headline tab
- **Why**: Voytek couldn't find a chart showing that descriptions improve retrieval. It existed only as a Text-strategy table that pools dev + held-out questions and hides behind the default corpus. Voytek wanted: latency (shows the same workload across stores), a model comparison, and an embedding-text comparison. I asked F about priorities (message held for Voytek's approval in F's session) and built without waiting, per Voytek.
- **What**: New first tab "Headline" in results/src/dashboard-cards.ts. Four charts, each paired with a numbers table, all pinned to fixed configurations (no filters):
  - Speed: median ms per store × size (golden 235 / 1k / 10k), plus a p50/p95 table.
  - Store quality: nDCG@10 per engine on golden (minilm), plus a like-for-like paired table (vector-only: X-pure vs semantic-vector; as shipped: vs semantic; keyword floor).
  - Model: minilm vs arctic per engine measured with both, plus a paired table.
  - What we embed: gain vs none on northwind-sql-v1, held-out only, semantic-vector, per embedder (context-sql, mech-fill-empty, llm-fill-all), plus a paired table with before/after.
- **Also**: glossary.ts (G's) had stale lines for sqlite-vec1 ("blank until runs land") and lucene ("not yet available") shown in the headline tooltips; corrected. A's harness_latest_engine_run already solves "engines in separate runs", so I dropped a duplicate view I had started.
- **How**: every table reproduces the published numbers. Text: +0.544/+0.513, +0.462/+0.419, +0.377/+0.250 = research/embedding-text-recommendation.md. Store vector-only +0.002/+0.004 = F 15:19. 10k median sqlite-vec1-pure 198 vs semantic-vector 267 = deck. `npm run check` 0 errors / 0 empty; serdes re-exported.
- **Not verified**: the visual rendering. The Chrome extension disconnected, so the charts are checked through the API only.
- **Findings on the charts**: the model effect is +0.076 ± 0.078 for semantic on golden, "no proven difference" (just); keyword engines 0, as expected. Store: "as shipped" lucene is −0.021 ± 0.019 worse vs semantic (the keyword arm, per F), while vector-only is a tie.
