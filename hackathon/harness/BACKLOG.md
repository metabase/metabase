# Harness fix backlog

Maintained by Agent F (overseer). Sources: F's cohesion audit, 2026-09-23 (three read-only audits: data flow,
results/dashboard, pipeline/ops), checked against the live `harness` DB.

## How to work this backlog

1. Read `agents/_shared-context.md` first, including **Worklogs** (required) and **Non-goals**.
2. Take the **first `todo` item from the top** whose `Needs` are all `done`. **Sync with F first**: message
   `Typescript preference for agents` (overseer F) with the item id, the files you'll change and your verification, then wait for the go-ahead.
   Then set it to `doing — <your session name>` in this file. Never take an item another session has marked `doing`.
   (This applies to A too.) New here? Read `START-HERE.md` first.
3. Fix only what the item says. Anything else you find becomes a new item at the bottom (status `todo`, "found by
   <you>"). Don't fix it on the side.
4. The item is done when its **Done when** check passes. Paste the evidence (command plus output, or a query result) into your
   worklog, **send it to F**, and set the status to `done — <session>, <time>` after F confirms.
5. If you're blocked, set `blocked: <why>` and move on to the next item. If it needs Voytek, say so in the blocker.
6. Rules that always apply: TypeScript over Clojure. Never touch Metabase source (`src/`, `enterprise/`, `test/`).
   Never change the pgvector engine, metric definitions or labels unless an item says so. Never stop instances you
   didn't start (:3002 serves the data app, :3004 is A's 10k tier). Never commit or push unless an item says so.
7. Verify from outside where you can: the root `npm run typecheck`, `npm test`, `npm run check` in `results/`, and psql
   against `harness`.

Agent A (session `metabase-sqlite-semantic-search-8a [56b416]`) owns the runner end to end. Items marked `queued — A`
are in A's own queue. Take one only after A replies that it's released. The simplest way is to ask A by message and
take whatever A hands over. Items marked "Agent G's area" belong to the explainer agent, if one is running.
**Free for backlog agents now**: BL-06, BL-07, BL-16, BL-17, BL-24 (if no G is running), BL-21,
BL-23. BL-22 waits on Voytek.

Psql shortcut: `docker exec semantic_search-postgres-1 psql -U postgres -d harness -c "<sql>"`

---

## P0: wrong or unsafe numbers (fix before any demo)

### BL-01 · Latest-run view hides engines measured in separate runs
- **Status**: done — A, 15:45 (verified by F). Views now key on (run_id, engine) via `harness_latest_engine_run`; agreement stays within a run (Voytek chose (b)). **Follow-up for G**: the "Runs in view" card still reads `harness_latest_run` (one run per corpus/scale/embedder/variant), so a separate `--pure-vector` run won't be listed there; point it at `harness_latest_engine_run`. **Done — G, 2026-09-23**: "Runs in view" reads `harness_latest_engine_run` joined to `harness_run`, one row per run with an Engines column; `npm run check` 0 errors.
- **Area**: `sql/02-views.sql:15-20, :88`, `runner/src/pipeline.ts`
- **Problem**: `harness_latest_run` keeps one run per (corpus, scale, embedder, embedding_text). A later run with different
  engines (a `--pure-vector` run, or a lucene-only run from Libor's or Paolo's branch) replaces the earlier one, so those engine
  columns vanish from every card. `harness_agreement` joins `b.run_id = a.run_id`, so engines from different runs are
  never compared.
- **Decision (Voytek + A)**: (b). Pick the latest run per (corpus, scale, embedder, embedding_text, **engine**).
  `--pure-vector` needs its own instance (the threshold is fixed at boot), so "all engines in one run" can't hold.
  Agreement stays within a run; pairs across runs are not computed. Record this in `01-contracts.md` §4.
- **Done when**: two runs of the same slice with disjoint engine sets are both visible on the dashboard, the
  agreement cards say they cover within-run pairs only, and `npm run check` shows 0 errors.

### BL-02 · A run that fails the variant check still counts as a good run
- **Status**: done — A, 15:45 (verified by F). `run.ts` returns before `finishRun` when the variant check fails, so the run stays unfinished and `harness_valid_run` excludes it.
- **Area**: `runner/src/run.ts:134-137, :146`
- **Problem**: when the embedding-text variant changes mid-run, `exitCode` is set, but `finishRun` is still called and
  the pipeline treats the run as a success. A finished run with no metrics then becomes "latest".
- **Fix**: don't call `finishRun` on a failed run. Mark it unpublishable in `notes`, and make the pipeline exit non-zero.
- **Done when**: a forced mismatch (set the variant between start and end on a smoke run) leaves `finished_at` NULL or
  `publishable=false`, and the run doesn't appear in `harness_latest_run`.

### BL-03 · `--force` (unpublishable) runs appear on the dashboard
- **Status**: done — A, 15:45 (verified by F). New base view `harness_valid_run` excludes `notes.publishable = false`; `harness_latest_run` and `harness_latest_engine_run` read from it.
- **Needs**: BL-01 (same view)
- **Area**: `sql/02-views.sql:15-20`
- **Problem**: the view ignores `notes.publishable = false`.
- **Fix**: filter out unpublishable runs in `harness_latest_run`.
- **Done when**: a run with `publishable=false` is absent from `harness_latest_run`, and `npm run check` shows 0 errors.

### BL-04 · Fake fixture data includes fake sqlite-vec1 and lucene rows
- **Status**: done — A, 16:12 (verified F). Deleted the 10 fixture runs (42,492 metric / 10,000 observation / 400 scenario rows) in one transaction, after the 10k latency tier finished.
- **Area**: `harness` DB; corpus filter values in the dashboard
- **Problem**: 10 fixture runs (corpus_id `fixture`) hold about 2,000 fake rows each for lucene and sqlite-vec1, and they are the
  only arctic and context-variant runs. "fixture" appears in the Corpus filter. Someone will mistake them for results.
- **Fix**: delete all `corpus_id='fixture'` rows (metric, query_result, scenario, run). Remove "fixture" from the
  filter's values. Keep `results/src/fixtures.ts` so they can be regenerated into a separate DB if the layout needs them.
  **Check with Agent G first**: G may want the fixtures while real runs are missing.
- **Done when**: `select count(*) from harness_run where corpus_id='fixture'` = 0, the filter no longer offers it, and
  `npm run check` shows 0 errors.

### BL-05 · The "semantic-pure" engine label is invisible in pivot cards
- **Status**: done — A, 15:45 (verified by F). `semantic-pure` added to `ENGINES` (shared/types.ts); fixtures use their own `FIXTURE_ENGINES` without it; dashboard rebuilt and exported.
- **Area**: `runner/src/run.ts:111`, `shared/types.ts:88`
- **Problem**: `--pure-vector` runs write `engine = "semantic-pure"`, which isn't in `ENGINES`, so every pivot card (built with
  `wide(ENGINES, …)`) drops it.
- **Fix**: add `semantic-pure` to `ENGINES` (after `semantic`), or drop the label. Pure-vector semantic is the fairest
  comparison to the new engines, so keeping it is preferred.
- **Done when**: a smoke run with `--pure-vector` shows a semantic-pure column in the pivot cards.

### BL-06 · Quality summary says "don't call a winner" when there is one
- **Status**: done — G, 2026-09-23 (verified by F). New card "Is semantic really better? Paired, question by question" on the Quality tab: semantic vs in-place 26/12/14, Δ +0.110 ± 0.090; vs appdb 33/17/2, Δ +0.292 ± 0.089 (latest baseline run 20260923-154430-7f2163); vs semantic-pure 1/49/2, Δ +0.003 ± 0.008 → no proven difference. The unpaired CI column was removed from Quality summary; it now groups by scale too.
- **Area**: `results/src/dashboard-cards.ts:316, 326-327`
- **Problem**: each engine's CI is computed on its own (unpaired), but all engines answer the same questions, so the
  intervals overlap and the card says "no winner". On the golden run, the paired semantic − in-place nDCG@10 is
  +0.111 ± 0.090 (26 wins, 14 losses, 12 ties). The CI also divides by `count(*)` while n uses `count(DISTINCT)`, which pools
  scale tiers.
- **Fix**: replace it with a paired comparison against a reference engine: wins/ties/losses and mean Δ ± 95% CI per
  engine, with n = distinct scenarios.
- **Done when**: on golden, the card shows semantic vs in-place 26/14/12 with Δ +0.111 ± 0.090, and vs appdb 33/2/17 with
  Δ +0.291 ± 0.089.

### BL-07 · "Change vs baseline" embedding-text card pairs the wrong rows
- **Status**: done — G + H (verified F). H's tested SQL (version B: pairs within scale+embedder, one row per slice), dropped in by G. Follow-up to G: hide baseline-only rows
- **Area**: `results/src/dashboard-cards.ts:516`
- **Problem**: the self-join matches on engine, scenario and metric only. With Scale empty, fixture shows n=342 instead of 38.
  With Embedder cleared, it shows 152.
- **Fix**: also join on `data_scale` (NULL-safe) and `embedder`.
- **Done when**: the card shows n = the number of distinct scenarios for any filter combination (check against fixture data
  before BL-04 deletes it, or against a real variant run).

---

## P1: blocks the new engines or axes

### BL-08 · The pipeline can only boot this worktree
- **Status**: done — A, 16:45 (verified F). The variant refusal on a repo without E's setting is not verified live until J's Libor checkout.
- **Area**: `runner/src/pipeline.ts:147`
- **Problem**: `spawn("clojure", ["-M:run:drivers:ee"], {cwd: REPO})` has no `--repo`, `--jar` or branch option. Libor's and
  Paolo's engines can't be run unless they're merged here.
- **Fix**: add `--repo <path>` (a worktree of the engine branch) and record which repo and sha ran. Integrating the
  branches, and in which worktree, is Voytek's call; this item only adds the option.
- **Done when**: `pipeline.ts --repo <this worktree>` still works, and the run's notes record the repo path and
  `git describe --dirty`.

### BL-09 · New engines get queried before their index is built
- **Status**: queued — A batch 4 (after the branches arrive). Take it only after A confirms by message that it has released it
- **Area**: `runner/src/pipeline.ts:167-186`, `runner/src/preflight.ts:98-101`
- **Problem**: `waitForIndexing` only polls `/api/ee/semantic-search/status`. Preflight marks unprobed engines
  "unverified" but still publishable.
- **Fix**: wait until each engine answers a known exact-name query with the expected item (engine-agnostic readiness,
  from outside). Make a run with any engine that isn't ready unpublishable.
- **Done when**: preflight output lists every engine as ready or not ready, and a run with a not-ready engine has
  `publishable=false`.

### BL-10 · Engine contract is missing what Libor and Paolo need
- **Status**: done — A, 16:55 (verified F; relayed to Voytek for Libor/Paolo)
- **Area**: `01-contracts.md` §1
- **Problem**: §1 lists only the multimethods. It doesn't say:
  - the engine namespace must be required from `src/metabase/search/init.clj` (or the EE init);
  - result rows need permission fields (collection_id, archived, database/table ids), because they pass through
    `impl.clj` `normalize-result` → `check-permissions-for-model`;
  - an engine must emit `:all-scores`, or its scores show as 0;
  - index storage must be per instance;
  - the 0.7 cosine rule doesn't apply to BM25.
  The example `score: 0.83` is also wrong: real scores are sums of contributions, and in-place has none.
- **Fix**: add a "Checklist for engine authors" to §1 and correct the example.
- **Done when**: §1 has the checklist, and F has sent it to Voytek to pass to Libor and Paolo.

### BL-11 · Embedding dimensions don't follow the model
- **Status**: done — A, 16:10 (verified F)
- **Area**: `runner/src/pipeline.ts:215`
- **Problem**: `--embed-dims` defaults to 384 for every model. Arctic (1024) without the flag misconfigures the instance,
  and the likely result is about a 60-minute hang in the wait loop.
- **Fix**: derive the dims from a model map (all-minilm → 384, snowflake-arctic-embed2 → 1024), fail on an unknown
  model, and keep the flag as an override.
- **Done when**: `--embed-model snowflake-arctic-embed2` alone boots and indexes. Proven by BL-12.

### BL-12 · First real arctic run on golden
- **Status**: done — A, 17:00 (verified F)
- **Needs**: BL-11, BL-01
- **Problem**: no real run with the second embedder exists. It's needed for the "store vs model" question and to test
  the cross-lingual labels.
- **Fix**: `pipeline.ts --corpus golden --embed-model snowflake-arctic-embed2` with all available engines.
- **Done when**: a finished, publishable arctic golden run exists, and the "store vs model" cards show two embedders.

### BL-13 · The embedding-text variant switch has never run end to end
- **Status**: done — A, 16:35 (verified F). Note: the context run's notes (20260923-154552-0f1b87) carry the first gate's numbers (share 0.9 over 210 docs incl. collections); the gate now excludes collections (189/189 = 1.00).
- **Needs**: BL-02
- **Area**: `runner/src/pipeline.ts:188-193`
- **Problem**: PUT the setting + `POST /api/search/re-init` is untested, and nothing checks that the new text was actually
  embedded. At 10k, re-init may exceed undici's 300 s header timeout.
- **Fix**: after switching, check that the active index table's `content` contains `collection:` (for `context`) before
  running. Raise or bypass the timeout for re-init.
- **Done when**: a golden `context` run exists, the check passed in the log, and the embedding-text cards show
  baseline vs context.

---

## P2: latent correctness (0 errors today, would bite later)

### BL-14 · Latency percentiles include errored queries
- **Status**: done — H, 2026-09-23 (verified F). Latency percentiles and stage shares (scope widened by F) skip errored iterations; test at `metrics.test.ts:355`
- **Area**: `runner/src/run.ts:116`, `metrics/src/metrics.ts:411`
- **Problem**: `latencyMs` is set even on error, and the metrics percentiles don't filter errors, but the cards do (`error IS NULL`).
  The stored and displayed percentiles diverge as soon as anything errors.
- **Fix**: exclude errored iterations in `metrics.ts` percentiles, and add a unit test.
- **Done when**: the new test passes (`npm test`), and stored and card percentiles match on a run containing an error.

### BL-15 · An engine that errors silently drops questions from its quality average
- **Status**: done — H + G (verified F). `unscored_rate` metric (H) + "Unscored" column on Quality summary (G, no coalesce: blank = not measured)
- **Area**: `metrics/src/metrics.ts:367`, dashboard
- **Problem**: a scenario with no successful iteration gets no quality rows, so that engine's mean covers fewer
  questions, and nothing shows it.
- **Fix**: emit a per-engine `unscored_rate` metric (0/1 per scenario: 1 when every iteration errored; the mean is the share of questions missing from the quality averages) and show it next to quality (G's card).
- **Done when**: a run with an injected error shows the reduced count next to that engine's quality.

### BL-16 · Variance-share view reports "100% Query" on degenerate data
- **Status**: worked around — G, 2026-09-23. Both "Model vs engine" variance cards (variance share, swap embedder vs engine) are hidden, with the reason on the tab, until ≥2 vector engines × ≥2 embedders exist. The view itself is unchanged (A's file).
- **Area**: `sql/02-views.sql:96-126`, the "store vs model" cards
- **Problem**: with fewer than 2 engine families or embedders, the output looks like a finding.
- **Fix**: return nothing, or show "needs ≥2 engines and ≥2 embedders", when that's not met.
- **Done when**: on golden (1 embedder), the card shows the "needs…" message rather than percentages.

### BL-17 · Category heatmaps mix topic tags with question categories
- **Status**: done — G, 2026-09-23 (verified by F). `categoryHeat` keeps only the 8 CATEGORY_TAGS, in contract order; the nDCG heatmap has an "Expected winner" column from 01-contracts §3. Golden: 7 rows (empty-expected has no nDCG), down from 25.
- **Area**: `results/src/dashboard-cards.ts:348-351, 360-368, 459-462`
- **Problem**: 25 rows (finance, hr, churn… mixed with paraphrase, typo…), many with n=1.
- **Fix**: filter to `CATEGORY_TAGS` (`shared/types.ts:100`), and add the "expected winner" column from `01-contracts.md` §3.
- **Done when**: the heatmaps show exactly the 8 categories, with n per cell.

---

## P3: provenance and hygiene

### BL-18 · Runs don't record exactly what code and models ran
- **Status**: done — H (verified F on run 155756-94d8c0). Notes carry repo, gitDescribe (--dirty), embedderModel digest, seed, corpusHash, scenariosHash and per-engine scorers; `indexSize` split out to BL-28
- **Area**: `runner/src/run.ts:89, :122`
- **Problem**: `git_sha` is HEAD with no dirty flag (the running code is HEAD plus E's uncommitted change). Ollama model digests
  aren't recorded, `indexSize` is always null, `allScores` is dropped (so the scorer set isn't known), and the seed is only
  implicit in the corpus id.
- **Fix**: record `git describe --dirty` and the repo path, the Ollama model digest (`/api/show`), the scorer names seen,
  the seed, and a golden content hash in `notes`.
- **Done when**: a new run's `notes` contain all of these.

### BL-19 · Pipeline leaves JVMs and DBs behind
- **Status**: done — H (verified F on A's checks: run 161326-dd7047 dropped its `_1612037c0e` DBs; SIGTERM on 161515-552b1e freed :3016 in <10 s). Unique instance names plus drop-on-success; interrupted runs keep their DBs (logging: BL-29)
- **Area**: `runner/src/pipeline.ts:245, 253-255, 274, 342`
- **Problem**: only SIGINT is handled, so SIGTERM or SIGKILL orphans the JVM and the next run refuses the port. Instance names are
  corpus + model only, so concurrent runs clobber each other's dirs and DBs (`DROP DATABASE … WITH (FORCE)`). Old
  `mb_pl_*`/`wh_pl_*` DBs are never dropped. The message at :342 says "left as-is", but the `finally` block kills it.
- **Fix**: (SIGTERM handling done by A.) Add the run id to instance names, drop the pipeline DBs at the end (unless `--keep`), and fix the message.
- **Done when**: a SIGTERM mid-run leaves no JVM on the port, and after a normal run no `mb_pl_*` DB remains.

### BL-20 · Stray databases from finished instances
- **Status**: done — Voytek ran the drop himself, 2026-09-23 (verified F: all 10 listed DBs gone; scale1000 + all 10000 DBs kept)
- **Problem**: `mb_ss_scale100`/`scale_100` (from the torn-down :3005) and `mb_ss_scale1000`/`scale_1000` (stopped instance)
  remain in the postgres container.
- **Fix**: confirm with B (`metabase-sqlite-semantic-search-b4`) that nothing uses them, then drop them. **Don't drop**
  `mb_ss_scale10000`/`scale_10000` (A's :3004), `mb_ss_golden`, `northwind_warehouse`, `harness` or
  `mb_semantic_search`.
- **Done when**: `select datname from pg_database` shows none of the four.

### BL-21 · A laptop restart loses the running setup
- **Status**: done — H, 2026-09-23 (verified F). `run-golden.sh` reads `local/.mb-license-token` (same as pipeline.ts); runbook in `local/README.md`
- **Problem**: :3003 and :3004 are orphan JVMs that don't come back. :8090 and D's CSP patch are runtime-only. The postgres
  container has restart policy `no`. `run-golden.sh` reads `local/.golden-token`, but only `pipeline.ts` reads
  `local/.mb-license-token`.
- **Fix**: write `local/README.md` with a "restore after restart" runbook (postgres, :3002 plus the data app from D's
  runbook, how to recreate the tiers with the pipeline), and make both launchers read the same token file.
- **Done when**: the runbook exists, and both launchers read one token path.

### BL-22 · Nothing is committed
- **Status**: blocked: needs Voytek's yes
- **Problem**: E's `src/`/`test/` change and all of `hackathon/` are uncommitted, in a worktree whose branch has no
  upstream. Removing the worktree loses everything.
- **Fix**: a local WIP commit (no push). Use `git add hackathon/ src/metabase/search/ test/metabase/search/`, excluding
  `node_modules`, `artifacts/` larger than 1 MB and `local/`.
- **Done when**: Voytek has said yes, the commit exists locally, and `git status` shows no harness changes left.

### BL-23 · `ann_recall` is never emitted
- **Status**: done — H, 2026-09-23 (verified F). Stated in `01-contracts.md` §4 (lines 271-273)
- **Area**: `runner/src/run.ts:141`, `01-contracts.md:265`
- **Problem**: the contract lists `ann_recall@10`, but no run passes `annReference`, since exact brute force isn't reachable over HTTP.
- **Fix**: document in §4 that it's unavailable in HTTP-only mode (or implement it if a brute-force engine becomes
  available).
- **Done when**: the contract states it.

### BL-24 · In-place scores are always 0
- **Status**: done — H (verified F). The drill-down shows n/a when an engine reports no non-zero score for the question (data-driven); read, description and glossary updated
- **Area**: `runner/src/adapter.ts:101`, the drill-down card
- **Problem**: the API returns no scores for in-place, so every in-place row shows "·0".
- **Fix**: show "n/a" for engines without scores, and say why in the card description.
- **Done when**: the drill-down shows n/a for in-place.
- **Note (H, from BL-18 provenance, run 20260923-155756-94d8c0)**: "the API returns no scores" is imprecise. In-place
  *does* return scorer entries (notes.scorers lists 12 names: text-exact-match, text-prefix, recency, …), but every one of
  its 1,565 stored results has score 0, while appdb (290/290) and semantic (2015/2015) are all non-zero. The adapter
  sums numeric `contribution`s (`adapter.ts:101`), so in-place's entries either carry no numeric `contribution` or keep
  their value under another key. Not checked which: `allScores` isn't stored. Display-only, as before; not fixed.

### BL-25 · `pipeline.ts` and `run-golden.sh` handle an empty token file differently
- **Status**: wontfix (F): harmless edge case. An empty file is an operator error either way, and both launchers say so (found by H)
- **Area**: `runner/src/pipeline.ts:88-90`, `local/run-golden.sh:25-31`
- **Problem**: with an empty `local/.mb-license-token`, `pipeline.ts` fails ("… is empty"), but `run-golden.sh` warns and
  falls back to `op`. Minor, but the two launchers still behave differently in that edge case.
- **Fix**: pick one behaviour (probably fail with the file named, as the pipeline does) and apply it to both.
- **Done when**: both launchers do the same thing with an empty token file.

### BL-26 · Drill-down cards still read `harness_latest_run`
- **Status**: done — G, 2026-09-23 (verified by F). "This scenario, per engine" filters latency on (run_id, engine) ∈ harness_latest_engine_run; semantic-pure now shows p50 32.2 ms on concept-01. The "Scenario" card reads all engine runs and lists answers by `ref` (instance-independent). The old per-id name lookup could attach the wrong name across instances, so it was dropped.
- **Area**: `results/src/dashboard-cards.ts`, the "This scenario, per engine" card (`lat` CTE) and the drill-down "Scenario" card
- **Problem**: both look up the latest run per slice, not per engine, so an engine from a separate run (e.g. `semantic-pure`,
  run `20260923-154059-044bd9`) is missing from their latency and answer-key lookups.
- **Fix**: read `harness_latest_engine_run` (as the "Runs in view" card now does).
- **Done when**: with golden selected, semantic-pure appears in "This scenario, per engine" with latency, and `npm run check` shows 0 errors.

### BL-27 · A remembered Scale filter empties the golden cards
- **Status**: done — H (verified F). The Scale filter is `(data_scale = {{scale}} OR data_scale IS NULL)`, so a remembered Scale no longer empties golden; scale corpora unchanged
- **Area**: dashboard 12 filters
- **Problem**: Metabase remembers each viewer's last filter values. A viewer who once picked Scale=100 sees every golden card empty (golden has NULL scale).
- **Fix**: pick one of: a "no scale" option, disable remembered values for Scale, or a note on the About tab. The simplest one that works wins.
- **Done when**: a viewer with a stale Scale value either still sees golden, or sees an explanation at the top of the first tab.

### BL-28 · `indexSize` is always null
- **Status**: done — H (verified F on 175015/175021/180253; the sqlite part verifies on the next sqlite run). notes.indexSize per engine (pgvector whole table + includes; sqlite main/WAL/SHM; appdb/in-place null with a reason)
- **Area**: `runner/src/adapter.ts:131` (`describe()` returns `indexSize: null`)
- **Problem**: no run records how big each engine's index is, so scale tiers can't be compared with index size.
- **Fix**: needs a source per engine (e.g. the semantic status endpoint's `indexed_count`, a pgvector table size, or
  what Libor's and Paolo's engines expose; see §1 checklist item 10). Then record it in `describe()`.
- **Done when**: a new run's `describe` output and notes carry a non-null index size for each engine that exposes one.

### BL-29 · Interrupted pipeline runs now leave their databases behind for good
- **Status**: done — H (verified F). Logging of kept DBs on interrupt, plus `runner/src/gc.ts`: list only (stale = no connections, no --keep marker, log >10 min old, no running queue job); drops by Voytek
- **Area**: `runner/src/pipeline.ts` (signal handlers, `dropDatabases`)
- **Problem**: BL-19 made instance names unique per invocation. Before, the next run with the same corpus+model reused
  the names and dropped the old DBs at start, so an interrupted run's leftovers got cleaned up by the next one. Now a
  run stopped by SIGINT/SIGTERM (its handler calls `process.exit`, skipping the `finally`) or SIGKILL keeps its
  `mb_pl_*`/`wh_pl_*` DBs and `local/pipeline/<name>/` forever, with no log line saying so.
- **Fix**: log "kept <dbs>" in the signal handler, and add an explicit cleanup (e.g. `pipeline.ts --gc`) that drops
  `mb_pl_*`/`wh_pl_*` DBs whose instance has no listening JVM and no `--keep` marker. Run it by hand only: a drop is
  irreversible and needs F's OK.
- **Done when**: an interrupted run logs what it kept, and `--gc` removes only stale pipeline DBs (shown on a list first).

### BL-30 · Latency-vs-size charts can never show more than one tier
- **Status**: done — G, 2026-09-23 (verified by F). Latency-vs-size lines and the latency table read the selected corpus plus every `scale-%` corpus; golden is plotted at 235 items. The 10k result is in the verdict; the cross-instance latency caveat is on every latency card.
- **Area**: `results/src/dashboard-cards.ts:204-224` (both latency-vs-corpus-size cards)
- **Problem**: the SQL filters `corpus_id = {{corpus}}`, but each scale tier is its own corpus (`scale-1000-seed-42`,
  `scale-10000-seed-42`, golden has NULL scale). So the size curve is structurally one point, even though real 1k/10k
  runs exist (`20260923-155756-94d8c0`, `20260923-160501-03ff76`). G's done-test agent concluded "scale unknown".
- **Fix**: for these two cards, ignore the Corpus filter and include golden + all `scale-*` corpora (keep the Embedder/
  variant filters). Put the scale result in the Start-here verdict: at 10k, semantic p50/p95 454/1,422 ms vs appdb 94/275.
- **Done when**: the chart shows 3 points per engine (golden, 1k, 10k), and the verdict states the scale result with its as-of runs.

### BL-31 · Dashboard cards ignore `text_strategy`, so I's runs would pool with baseline
- **Status**: done — G, 2026-09-23 (verified by F). Required "Text strategy" filter (default `none`) on all 22 run-reading cards; text_strategy added to every pairing join; new "Text strategy" tab with "Change vs text strategy 'none'"; a Text strategy column in Runs in view; glossary line. Tested with a smoke-test copy of run 7f2163 inserted in a transaction and ROLLED BACK (no shared rows written): 20 cards unchanged; only Runs in view and the new card change, with smoke-test rows separate (semantic 0.541, Δ −0.060 ± 0.010, matching the ×0.9 fake). Shared DB: 0 non-none runs afterwards.
- **Area**: `results/src/dashboard-cards.ts` (0 references to `text_strategy` today), `dashboard.ts` filters
- **Problem**: the views key on `text_strategy` (A's (3)), but no card filters or groups on it. The moment a run with
  `text_strategy ≠ 'none'` lands, cards grouping by (engine, embedder) mix it with the baseline, the same bug class as BL-07.
- **Fix**: add a "Text strategy" filter (default `none`) to every card that reads runs, and pair the embedding-text Δ cards on
  it (the Δ vs `none` for the same corpus/scale/embedder/embedding_text). Glossary line for "Text strategy".
- **Done when**: with a scratch run (text_strategy = `smoke-test`, in a scratch DB or deleted afterwards with F's OK),
  default cards are unchanged, and the Δ card shows the smoke-test row separately. `npm run check` shows 0/0.

### BL-32 · "semantic-pure" is described as pure vector search, but it isn't
- **Status**: done — G, 2026-09-23 (verified by F). Glossary: semantic is hybrid (meaning + words in its pgvector index, merged by RRF, `index.clj` hybrid-search-query); semantic-pure = top-up off, still hybrid; new "Hybrid" line (on the Start here/Quality term lists); sqlite-vec1 vector-only. Verdict #3 rewritten (the top-up doesn't matter, but semantic's index is hybrid, so its lead can't be credited to embeddings alone); new caveat; the "what would change" sqlite-vec1 bullet says engine vs engine, not store vs store.
- **Area**: `results/src/glossary.ts:11` and :16, verdict text, `shared/types.ts` comment at :88
- **Problem**: pgvector `semantic` is hybrid **internally**: a vector search and a keyword (tsvector) search merged with RRF
  (`semantic_search/index.clj:902-934`), with no setting to turn the keyword arm off. `--pure-vector` only removes
  the appdb top-up. The glossary says semantic-pure is "pure meaning-based search", and the verdict leans on that.
- **Fix**: describe semantic-pure as "semantic without the appdb top-up (still vector + keyword internally)", and add a glossary
  line "Hybrid". State in the verdict that pgvector semantic is hybrid while Libor's sqlite-vec1 is vector-only, so their
  comparison is engine vs engine, not store vs store.
- **Done when**: no card or text on the dashboard calls semantic or semantic-pure "pure vector". `npm run check` shows 0/0.

### BL-33 · Arctic v2 queries run without their "query: " prefix (possible product bug)
- **Status**: done — H (verified F). `--query-prefix`; embedder `<model>+qprefix` from the instance's reported ee-embedding-query-prefix; notes.queryPrefix. Runs 175015-9b2660 (golden), 175021-7f6f47 (sql)
- **Area**: `enterprise/backend/src/metabase_enterprise/semantic_search/embedding.clj:697-698` (product), `runner/src/pipeline.ts` (harness)
- **Problem**: the query-prefix patterns are `snowflake-arctic-embed-\w+-v[2-9]` → "query: " and `snowflake-arctic-embed(?:-|$)`
  → the v1 instruction. Ollama's model name `snowflake-arctic-embed2` matches **neither**, so Metabase embeds arctic v2
  queries with no prefix, though the model is trained to expect "query: ". Every arctic number so far measures this
  as-shipped behaviour, which may understate the model. `ee-embedding-query-prefix` overrides it even without a match (:713),
  so the harness can supply it via env (`MB_EE_EMBEDDING_QUERY_PREFIX`).
- **Fix (harness)**: a pipeline flag `--query-prefix <s>` that sets the env var and records it. Label the embedder distinctly
  (e.g. `ollama/snowflake-arctic-embed2+qprefix`), so it's its own slice. Then one golden run plus one sql-corpus run with it.
- **Fix (product)**: not ours. Report to Voytek: the pattern should also match `snowflake-arctic-embed2` (Ollama naming).
- **Done when**: an arctic run with the prefix exists and the dashboard shows it next to arctic without the prefix.

### BL-34 · A silent semantic→appdb fallback can't be detected from the API
- **Status**: queued — A (found by J, confirmed by F, 2026-09-23). F checked all 15 existing pipeline `metabase.log`s: 0 hits, so no published run is affected.
- **Area**: `runner/src/pipeline.ts` (every run, all engines), `runner/src/adapter.ts:143`
- **Problem**: the shared semantic `results` fn catches any store exception and answers with the fallback engine
  (appdb) (`enterprise/.../semantic_search/core.clj`, the `catch Exception` branch; on master and on Libor's branch). The
  `/api/search` response's `engine` comes from the search context (`src/metabase/search/impl.clj:506`), so it still
  says `semantic`, and the adapter's engine check passes. A broken store (pgvector down, vec1 failing, embedder
  errors at query time) would be published as that engine's numbers.
- **Fix**: after each run and before `finishRun`, scan the instance's `metabase.log` for
  `Error executing semantic search`. Any hit fails the run (left unfinished, so it's invisible). Also, for semantic-family
  engines: fallback rows from the error path carry **no** `semantic-distance` score, and that rule is safe for every
  semantic-family column. **Only for vector-only sqlite-vec1**: store rows > 0 as a prefix, then top-up rows = 0, and
  pure = all > 0. On pgvector (hybrid), keyword-only hits score 0 **interleaved** with vector hits (`scoring.clj:93`
  coalesce → 0), e.g. live 'orders' on :3003 = `+…+00++++++++000`, so that rule would give false violations (J, pre-review).
- **Done when**: the guard runs for every pipeline run; a deliberately broken store (e.g. a bad
  `MB_VEC1_EXTENSION_PATH` in a scratch run; never stop the shared Ollama) makes the run fail with the log line cited; the existing
  pgvector path still passes; `npm run typecheck` = 0.

### BL-35 · pgvector semantic can't be run vector-only (the keyword arm has no switch)
- **Status**: done — H (verified F). Setting `semantic-search-keyword-arm-enabled` + pipeline `--vector-only` (label semantic-vector, read back via session properties). Evidence run 20260923-180253-b809c0: keywordArm false, 280 vector-only responses / 0 violations
- **Area**: `enterprise/backend/src/metabase_enterprise/semantic_search/index.clj:902-934` (`hybrid-search-query`), a new setting
- **Problem**: semantic always merges a vector search and a tsvector keyword search (RRF). `--pure-vector` only removes the appdb
  top-up, so no run can say how much of semantic's quality is the embeddings. It also confounds I's description strategies and
  the sqlite-vec1 comparison (vector-only vs hybrid).
- **Fix**: an opt-in admin setting (off by default = today's behaviour, byte-for-byte), e.g. `semantic-search-keyword-arm-enabled`
  (default true; env `MB_SEMANTIC_SEARCH_KEYWORD_ARM_ENABLED`). When false, the query uses the vector results only; scorers,
  filters and the cutoff are unchanged. Tests. Then a pipeline flag in A's code that sets it at boot, records it in notes, and labels
  the engine (e.g. `semantic-vector` = keyword arm off + top-up off).
- **Done when**: with the setting at default, golden semantic results are identical to today (ranked-list diff on a baseline run);
  with it off, every returned item has a semantic distance (no 0-score keyword-only hits); a `semantic-vector` golden run is on the dashboard.

### BL-36 · Dashboard text describes stale corpora
- **Status**: done — G, 2026-09-23 (verified by F). Corpus glossary line per real corpus; fixture text removed. runner-smoke deleted in one transaction after Voytek's direct yes: harness_metric 0, harness_query_result 180, harness_scenario 12, harness_run 2. Corpora now: golden 8 runs, sql 13, scale-1000 1, scale-10000 1.
- **Area**: `results/src/glossary.ts:21`, `results/src/dashboard-cards.ts:455`, the Corpus filter's value list
- **Problem**: the text names `northwind-golden-v1` and `fixture` (deleted under BL-04), and doesn't mention `northwind-sql-v1`,
  `scale-1000-seed-42`, `scale-10000-seed-42` or `runner-smoke`.
- **Fix**: describe every real corpus in one line each (golden = 56 hand-labelled questions; sql = 60 questions on SQL cards,
  dev/held-out; scale-* = generated catalogues for latency only, no quality labels). Delete the 2 `runner-smoke` runs (pipeline
  smoke tests, not measurements; F approved). Drop `fixture` from the text and from the filter's values.
- **Done when**: the glossary and filter description list exactly the corpora in `harness_run`, `runner-smoke` is gone, and `npm run check` shows 0/0.

### BL-37 · Runs are strictly sequential; the queue is the bottleneck
- **Status**: done — A, 17:40 (verified F). The concurrency measurement stays open for the next pgvector pair.
- **G's half, done 2026-09-23 (verified by F)**: view `harness_run_concurrency` (sql/02-views.sql, additive, A's OK): overlapped = timed window intersects another run's, unfinished run = start instant. Latency lines and table exclude overlapped runs (`SIZE_SCOPE`); LATENCY_CAVEAT says so; Runs in view has an "Overlapped" column. Today 0/24 overlap. Rollback test: forcing 1k/10k to overlap flags both and removes their observations. To do when A loads `harness_job`: key on other jobs' whole windows (boot and indexing included).
- **Problem**: every pipeline run waits for the previous one. Quality runs don't need a quiet machine; only latency does.
  Machine: 18 cores, 36 GB; each Metabase JVM is well under 1 GB RSS. The shared bottleneck is Ollama (all embedding).
- **Fix**:
  1. `runner/src/queue.ts`, a small scheduler: a job list (pipeline args plus `kind: quality | latency`), up to N concurrent
     (default 2), `latency` jobs run **exclusively** (wait for an empty slot pool, block new starts). Jobs are logged to a queue
     file, so agents can append instead of chaining. Ports and instance names are already unique (BL-19).
  2. A view `harness_run_concurrency`: per run, whether its [started_at, finished_at] overlapped any other run. Latency
     cards read only non-overlapping runs, and say so in their description.
- **Done when**: two quality jobs run at once and both finish with 0 errors; a latency job waits for them and runs alone;
  the latency cards exclude the overlapped runs; `npm run check` shows 0/0.

### BL-38 · Key "overlapped" on queue job windows, not just run windows
- **Status**: done — G, 2026-09-23 (verified by F). `harness_run_concurrency` flags a run when another run's timed phase OR another queue job's whole window (harness_job; running jobs until now()) overlaps its timed phase, with strict <. Own job excluded via run_ids. Rollback tests: finished 1k sqlite latency job → not overlapped; other job ending exactly at run start → not; +1 ms → overlapped; pre-queue run + inserted job → overlapped. Known transient: run_ids is written at job end, so a run is flagged by its own job until the job finishes.
- **Area**: `sql/02-views.sql` (`harness_run_concurrency`)
- **Problem**: overlap is computed from harness_run [started_at, finished_at] only. A job's boot and indexing, which put the heaviest load on Ollama, happen before its run starts.
- **Fix**: once `harness_job` exists, a run is overlapped if any *other job's* whole window intersects its run window. Same view name and columns, so no card changes.
- **Done when**: a test with two overlapping jobs flags the run whose timing overlapped the other job's indexing; `npm run check` shows 0/0.

### BL-39 · The Start-here verdict has no SQL-corpus section
- **Status**: todo (handed from G). **Needs**: BL-35 semantic-vector runs on the SQL corpus
- **Area**: `results/src/dashboard-cards.ts` (Start here verdict and caveats)
- **Problem**: the verdict covers golden only. The SQL-corpus results (context-sql, and I's text strategies) are strong but partly
  keyword-driven: the strategies write into descriptions, which keyword search reads.
- **Fix**: add a section framed as F set it for I: (1) "auto-describing cards makes every engine find them"; (2) the vector-only
  comparison from the semantic-vector runs; (3) caveats (the corpus was written by us with tidy aliases, a held-out n of 24, a ceiling near 1.0).
  Numbers come from cards, stamped with run ids.
- **Done when**: a fresh agent can answer from the dashboard "does describing SQL cards help, and is it the embeddings or the keywords?".

### BL-40 · Keyword engines never searched SQL (search_native_query is never set)
- **Status**: note done — H (verified F): Start-here caveat + appdb/in-place glossary lines (includes semantic's keyword arm). Axis (`--search-native-query` runner flag) is Voytek's call
- **Problem**: `/api/search` only searches native SQL when the request sets `search_native_query=true`. The runner never sets it,
  so in every run so far no engine's keyword side searched SQL text. E's brief assumed otherwise. No stored result is wrong,
  but the dashboard should say so, and "keyword with SQL search on" is a cheap extra axis.
- **Fix**: a one-line note in the Start-here caveats and on the glossary lines for appdb/in-place. Optionally a runner flag `--search-native-query`, recorded in notes and part of the engine label.
- **Done when**: the note is live (check 0/0); the axis is decided by Voytek.

### BL-41 · Verdict #6 quotes stale pgvector 10k latency, and has no sqlite-vec1
- **Status**: done — H (verified F). scale10k → 175722-e82939 (292/866; appdb 67/161; in-place 163/382; ~6×), sqlite-vec1 sentence; arctic caveat restated. Final update after A's A-B-A
- **Follow-up (post-A-B-A, H, one rebuild)**: restate verdict #6's sqlite sentence with the A-B-A result; fix CHANGES_TEXT (dashboard-cards.ts ~:518, "semantic vs sqlite-vec1 compares … hybrid vs vector-only": semantic-vector vs sqlite-vec1 is now the like-for-like pair); fix the sqlite-vec1 glossary line ("Blank until its runs land": its runs have landed). F: harmless until then.
- **Area**: `results/src/dashboard-cards.ts:483-487` (verdict #6), `VERDICT_RUNS.scale10k`
- **Problem**: it says semantic at 10k is ~450 / 1,400 ms (run 160501-03ff76, measured on a busy machine). The clean exclusive re-time
  175722-e82939 gives 292 / 866 ms. sqlite-vec1 at 1k/10k (4350df, 3004e3) isn't mentioned.
- **Fix now**: point VERDICT_RUNS.scale10k at 175722-e82939, restate #6 with the corrected numbers, and add one sentence: "sqlite-vec1 at 10k: ~25–30% faster at the median, tail inconclusive; the store-vs-store (vector-only) comparison is running". Numbers stay stamped with run ids.
  **Fix later** (after A's A-B-A vector-only latency sequence): replace that sentence with the store-vs-store result.
- **Done when**: no card or text shows 454 / 1,422; `npm run check` shows 0/0.

### BL-42 · Fallback guard misses "vector arm silently empty"
- **Status**: todo (found by J on the lucene branch, 2026-09-23). Owner: A
- **Area**: `runner/src/run.ts` / the semantic guard
- **Problem**: BL-34's guard catches rows with no semantic distance. On lucene, if the vector index is empty (lucene/query.clj:235-238) or a
  date filter is present, answers are keyword-only but still carry entries with semantic-distance = 0, and the log line is DEBUG, so the guard passes.
  The same failure could hide a broken vector arm in any hybrid engine.
- **Fix**: a run-level "live vector arm" check. For semantic-family columns, nearly every non-empty response (e.g. ≥ 95%) must have
  at least one row with semantic-distance > 0; otherwise the run fails with the count. For lucene, also require the boot-proof log line
  "Opened semantic search Lucene index at …" and the absence of "Another process holds…".
- **Done when**: a scratch run with an emptied vector index fails the check; normal runs pass on all semantic-family engines.

### BL-43 · Hybrid engines' keyword arm differs by app DB (H2 vs Postgres)
- **Status**: todo (found by J). Owner: A (pipeline), decision: Voytek
- **Problem**: lucene fuses Lucene vectors with the appdb keyword engine, which on our pipeline's H2 app DB is weak (no stemming). pgvector's
  keyword arm is Postgres tsvector. So lucene vs semantic on H2 also compares H2 keyword against PG keyword.
- **Fix**: a pipeline option to boot with a Postgres app DB (a per-instance DB in the shared container), recorded in notes/labels; run
  lucene and semantic on it for the fair headline.
- **Done when**: a golden lucene + semantic pair on a Postgres app DB is on the dashboard, labelled.

### BL-44 · PRODUCT BUG: semantic search silently falls back to appdb on real data (legacy card result_metadata)
- **Status**: finding (B, verified by log; F). Not ours to fix: report to Voytek / the product.
- **Evidence**: stats-real run 20260923-200822-424419 (now unpublishable). 48 × "Error executing semantic search, falling back to appdb" on ~60
  queries: `Invalid input: (toucan2.instance/instance :model/Card {:result_metadata [{:database_type … disallowed key`. By key: database_type 41,
  table_id 3, lib/source_column 2, fk_field_name 1, inherited-temporal 1. Synthetic corpora never hit it (cards created fresh via the API).
- **Impact**: on an instance with legacy card result_metadata, the shipping semantic search mostly serves keyword results under the "semantic"
  label, with no error to the user. Every real-data quality claim for semantic needs a 0-fallback guard (BL-34).
- **Harness action**: re-run on a local copy with the offending keys stripped (B), guard enforced.
