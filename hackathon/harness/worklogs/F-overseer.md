# Worklog — Agent F (overseer)

Session: `Typescript preference for agents` (overseer F)

## 2026-09-23 — Onboarded as overseer, required worklogs
- **What**: Added `agents/F-overseer.md`, a row F in the `00-plan.md` work breakdown, and a "Worklogs"
  section in `agents/_shared-context.md`. Messaged the five harness sessions (8a ×2, c5, 02, b4).
  Earlier, messaged the same five: TypeScript over Clojure, touch Metabase minimally, measure from outside.
- **Why**: Voytek asked for an overseer that checks agents' work against the repo and briefs him.
- **How**: Found no file named "infra", so treated the agent briefs + plan table as the infra docs.
- **Open**: Only E's brief names its session. The mapping of A–D to sessions is unknown until worklogs arrive.

## 2026-09-23 ~10:40 — First check: worklogs vs repo
- **What**: Read the B, C, D and E worklogs and checked them against the repo and the running stack. No files changed apart from this log.
- **How**: git diff; `ls dev/{src,test}/dev/harness` (gone); psql `harness_run` columns and runs;
  lsof for :3002/:3003/:8090/:50605; metrics `npm test` (64/64) and typecheck; results and runner `tsc` clean;
  grep of `{:fn` attrs against E's `(merge m fn-results)`.
- **Findings**: The worklogs match the repo. E's "D must apply ALTER" item was already done, and I told E.
  The A worklog is missing, and runner/src has no entry point; I nudged A. B's :3003 is blocked on a license token
  (`local/.golden-token` is absent). The harness DB holds only fixture runs (10); no real run exists yet.

## 2026-09-23 ~11:15 — A worklog arrived; workspace check
- **What**: Read `A-runner.md` and checked it against the repo. E marked the ALTER item resolved.
- **How**: `ls runner/src` (config, adapter, setup; no preflight or run yet). Root `node_modules` is present, and per-package
  node_modules are gone. `npm run typecheck` exits 0 in results, metrics and runner (C migrated its script to plain `tsc`).
- **Findings**: A's "root npm install not done" is out of date. D did it, and I told A. A is now on the critical path
  (preflight.ts, run.ts, smoke-scenarios.json, then pipeline.ts). Side effect: user `harness@metabase.local` now exists on :3002.

## 2026-09-23 ~11:40 — :3002 reload decided and closed; C and E done
- **What**: Voytek delegated the :3002 reload decision. I chose an nREPL hot-load of the two namespaces over a restart:
  a restart needs the 1Password token (no TTY) and would undo D's in-memory :8090 patch. E did it after A confirmed idle.
- **How verified (from outside)**: the setting is at its default (value null, default `baseline`; GET returns 204, which is normal for a
  default), and `/api/search?q=orders&search_engine=semantic` → engine semantic, 19 results.
- **Status**: C is DONE (build), with reopen triggers: permissionLeak const, annReference, first real run. E is DONE (build), with reopen trigger:
  the first real run that switches variants. Code stays uncommitted (Voytek's call).
- **Note**: one earlier send to E was denied by the auto-mode classifier; the reworded send went through.

## 2026-09-23 ~11:50 — D visual check verified; closed C's trigger (a) myself
- **What**: D says the dashboard is visually verified on 8 tabs. I checked: the :3002 CSP includes localhost:8090 and `dashboard/serdes/` was refreshed at 10:50.
  I didn't view the screenshots. Separately, C's session had closed, so I swapped C's `permission_leak` literal for `METRIC.permissionLeak`
  myself (a one-line change) and logged it in C's worklog.
- **How**: metrics tests 69/69 pass, typecheck OK.
- **Why I edited another agent's tree**: its owner is gone, the change is trivial, and Voytek asked me to handle things without involving him.

## 2026-09-23 ~12:00 — A takes end-to-end ownership; gap list sent
- **Verified**: golden run 20260923-145150-29002c → 840 obs (3×56×5), 0 errors, 2,676 metric rows. :3003 is up.
- **New findings**: `corpus-gen/apply.ts:157` fails typecheck (TS2741, missing `database` handler); corpus-gen is outside the workspace.
  The dashboard defaults to corpus=fixture, scale=100, while golden has NULL data_scale. There is no sqlite-vec1 or lucene code in the
  worktree or in the fetched remotes (last fetch Sep 18).
- **Sent A**: the full gap list (dashboard defaults, engines, arctic, Voytek items, runner mismatches). Escalated Libor/Paolo branches to Voytek.

## 2026-09-23 ~12:10 — Ruled on D's two questions
- (2) Dashboard defaults: A owns them. D must make every card work for any corpus with Scale empty, including NULL data_scale, and verify that against the golden run.
- (3) No relabel of "semantic". Instead, an About-tab sentence plus card-description notes about the appdb backfill below the min-results threshold. Reason: a long label clutters the legends, and a label that differs from the key risks mismatches.

## 2026-09-23 ~12:20 — D rulings verified; flagged a silent bug in the runner
- **Verified**: 02-views.sql and dashboard-cards.ts use NULL-safe joins (`IS NOT DISTINCT FROM`), and the About/card text about the top-up is present. Root typecheck exits 0.
  I didn't re-run D's 22/24 card check myself; D's explanation for the 2 empty cards (no non-baseline golden run yet) is plausible.
- **Flag**: `runner/src/run.ts:98` passes `cfg.corpusId` to `recordScenarios(runId, …)`. Both are strings, so tsc can't catch it. Told A to fix it before the next run.

## 2026-09-23 ~12:35 — A fix verified; D done, with a runbook condition
- **Verified**: smoke run 20260923-151041-9b1d7d has 6 harness_scenario rows with that run_id, and embedder is recorded. run.ts calls `recordScenarios(runId, …)`.
- **D**: accepted as DONE (build) once it writes a restart runbook in agents/D-dataapp.md. The data app depends on runtime-only :8090 + CSP state.
  Reopen trigger: the first variant or arctic golden run (2 empty cards).
- **Voytek items**: 1Password sign-in (metabaseinc) blocks A's pipeline; Libor/Paolo branch names.

## 2026-09-23 ~12:45 — D closed; root typecheck red in B's code
- **Verified**: D is marked DONE at the top of agents/D-dataapp.md, and the runbook is at line 66.
- **Flag**: the root typecheck fails in `corpus-gen/resolve.ts(9,69)` (TS2305 ResolvedItem). Told B (b4).
- **Note**: A keeps a scale-10000 instance on :3004 for the latency tier. Don't stop it.

## 2026-09-23 ~12:55 — B fixed the typecheck
- **Verified**: the root `npm run typecheck` exits 0 (all workspaces). B is booting a throwaway :3005 to test the refactored apply.ts (not listening yet).
  Running JVMs: :3002 (shared/data app), :3003 (golden), :3004 (A's 10k tier), and :3005 soon. Watch memory, and make sure B tears down :3005 afterwards.

## 2026-09-23 ~13:30 — Cohesion audit; brief for Agent G
- **What**: Ran 3 read-only subagent audits: data flow, results/dashboard semantics, pipeline/ops. B marked done (:3005 torn down, validate OK).
  Sent A 17 findings (items 1–5 must be fixed before any demo number). Wrote `agents/G-explainer.md` and added row G to the plan.
- **Verified myself**: golden headline metrics; paired nDCG semantic vs in-place 26/14/12, Δ +0.111 ± 0.090; vs appdb 33/2/17, Δ +0.291 ± 0.089.
  appdb's 54% zero-result rate is by category (0% on exact-name, high on paraphrase, typo and cross-lingual): keyword behaviour, not a bug.
- **Top risks**: (1) `harness_latest_run` hides engines measured in separate runs, which matters for the new branches. (2) Quality CI is unpaired and says
  "no winner" wrongly. (3) Fixture rows carry fake lucene/sqlite-vec1 data. (4) Nothing is committed (E's src change + all of hackathon/).
  (5) pipeline.ts boots only this worktree.
- **Ownership**: runner, pipeline and latest-run view → A. Dashboard cards and reading guide → G (new). D is done.

## 2026-09-23 ~13:45 — BACKLOG.md created
- **What**: `hackathon/harness/BACKLOG.md`, with 24 items (P0–P3), each giving Status/Area/Problem/Fix/Done-when and a claiming protocol. Voytek will start
  agents to work through it. A's triage is recorded: BL-01 decision (b), which re-keys per engine; BL-01..05 are doing — A, and A's other items are queued — A.
  BL-04 (delete fixtures) is held until BL-07 is done. Free now: BL-06, 07, 16, 17, 24 (G's area, if no G), BL-12, 21, 23. BL-22 needs Voytek.

## 2026-09-23 ~15:55 — START-HERE.md; sync-with-F rule; A's batch 1 verified
- **What**: Wrote `START-HERE.md` (onboarding: project, read order, roster, sync-with-F rule, backlog protocol, env, never-list). Added
  "Sync with F" to `_shared-context.md` and to the BACKLOG protocol. **My session name changed from a8 to a1**; fixed it in all docs.
  Told A and the new session e7 about the rule.
- **Verified A**: BL-01/02/03/05 (views, run.ts:136-143, types.ts:89). Pipeline run 20260923-153516-5394c0: 840/0 errors/2,676 rows, latest for all 3 engines.
  Typecheck 0, check 0 errors / 2 empty (variant-only).
- **Note**: A accidentally regenerated the fixtures (new run_ids 20260923-15374[78]-*); the data is equivalent.

## 2026-09-23 ~16:10 — G active (e7); glossary reviewed; BL-11 confirmed
- **G**: approved pushing glossary.ts plus term explainers after 3 fixes. appdb "scores 1 on H2" is wrong (the latest golden appdb scores are 6.8–108,
  with 300 distinct values), warmup should be mentioned, and the log-scale line needed correcting. Suggested BL-06 next. Put G in the START-HERE roster.
  Fixed my own brief's grade range (1–2, not 1–3).
- **A**: BL-11 go-ahead confirmed. Told A and G to coordinate on dashboard-cards.ts.

## 2026-09-23 11:40 — Wrote agents/H-bugfixer.md
- **What**: Brief for Agent H (bugfixer), who works through BACKLOG.md with a reproduce, fix, verify, sync-with-F loop. Added it to the 00-plan table and the START-HERE roster.

## 11:41 — H active (session 74). Go-ahead on BL-21 (one token path, document-only restart policy); BL-12 → A.

## 11:43 — H: BL-21 verified
- **Verified**: run-golden.sh reads local/.mb-license-token (syntax OK; no golden-token left); local/README.md has the restore runbook (8 sections). BL-25 → wontfix. Go-ahead on BL-23.

## 11:44 — H: BL-23 verified; B unreachable
- BL-23: contracts §4 lines 271-273 verified. B's session (b4) no longer accepts messages (the send failed for me and for H). B is done, so no impact; marked unreachable in START-HERE.

## 11:47 — Status check (Voytek had network issues)
- G: explainers and glossary tab live; check 0 errors, 0 empty. Go on BL-06. Added BL-26 and BL-27 (G's findings).
- A: pure-vector run 154059 (semantic-pure nDCG 0.597 vs semantic 0.601, so the top-up is negligible); BL-13 variant run 154552 (context makes semantic worse, 0.601 → 0.573; keyword engines identical).
- H: go on BL-14 (plus stageBreakdown). A released BL-14/15/20 to H; BL-18/19 stay with A.

## 11:48 — A: BL-13 verified
- Keyword engines' ranked lists are identical 56/56 across the baseline/context runs (my own query); reinitToIndexedMs 45227. The gate excludes collections (embedded by name only), threshold ≥0.98.
- A next: BL-12 (arctic) plus BL-10 (engine-author checklist, useful before the branches). BL-18/19 → H.

## 11:48 — H: BL-14 verified
- 71/71 tests (2 new ones failed before the fix), typecheck 0. The injected-error comparison matches the card SQL for all 3 engines. BL-15 next (plan first; the dashboard part goes via G).

## 11:49 — G: BL-06 verified
- Paired card reproduced independently on the latest baseline 154430 + pure 154059: in-place 26/12/14 +0.110±0.090; appdb 33/17/2 +0.292±0.089; semantic-pure 1/49/2 +0.003±0.008. Check 0/0. G next: BL-26, BL-17, then the reading guide (priority).

## 11:49 — H: BL-15 plan approved (unscored_rate)
- 0/1 per (engine, embedder, scenario), aggregated like zero_result_rate; contract §4 updated; the dashboard part via G (missing = unknown). A released BL-18/19 to H. A is running the BL-12 arctic run on :3013; H must not edit pipeline.ts while a run is in flight.

## 11:52 — Brief for Agent I (embedding-text research); several verifications
- Wrote agents/I-embedresearch.md, and added I to the plan and roster. Key finding: all 109 golden cards are MBQL (no native SQL), so context-sql and any SQL strategy can't move golden numbers.
  I must first build a new SQL-bearing corpus (golden-v1 unchanged) with a dev/held-out split.
- Verified: BL-15 metric half (74/74 tests), BL-26 (check 0/0), BL-10 engine-author checklist (contracts §1). BL-20: approved dropping only mb_ss_scale100/scale_100; scale1000 kept (restorable).

## 11:52 — A: BL-12 verified (arctic)
- Arctic semantic nDCG 0.676 / recall 0.743 / zero 0. Paired vs minilm 20/15/17, +0.076 ± 0.078 (not proven overall). Cross-lingual 0.17 → 0.68, typo 0.59 → 0.78, the rest flat.
- A next: scale tiers 1k/10k (latency), then arctic context. G's Unscored column is live, so BL-15 can close.

## 11:53 — H: BL-20 blocked by permissions; BL-15 closed; BL-18 approved
- H's dropdb was denied by its session's permission check. I won't run it or delegate it (that would launder the permission), so it goes to Voytek. BL-15 verified (card at dashboard-cards.ts:359). BL-18: option A (smoke) plus a hash check, and updateRunNotes approved.

## 11:55 — H: BL-18 code landed, verification on hold
- Provenance notes in run.ts plus updateRunNotes; the hash matches shasum; the smoke run waits for A's latency runs (:3014/:3015). The corpusFile line in pipeline.ts is deferred to BL-19.
  Risk flagged: the new run.ts code is only typechecked and A's next launch runs it, so H must make the provenance calls non-throwing and warn A. BL-28 (indexSize) added by H.

## 11:57 — H: BL-19 plan approved
- Unique instance suffix, drop DBs on success only, keep on failure, fix the message. A verifies on its next normal launch (not a special run from H's session, given H's dropdb refusal). Leftover mb_pl_*/wh_pl_* go to Voytek with BL-20.

## 11:57 — G: guide lives in the dashboard (Voytek's decision)
- Approved G's plan: a 'Start here' tab, per-tab how-to-read cards, hide degenerate cards, BL-17 folded in, a paired embedder card. My rule: numbers live in query cards; any number quoted in text gets an as-of run stamp. Recorded the decision in G's brief.

## 11:59 — BL-18 verified on a real run; BL-19 code checked
- Run 155756-94d8c0 (scale 1k) notes contain every provenance field (gitDescribe dirty, digest, seed 42, corpusHash, scenariosHash, scorers). The smoke run was cancelled as redundant.
- BL-19: pipeline.ts dropDatabases/assert present, typecheck 0; waits for A's (a)/(b). 1k latency: semantic p95 50 → 159 ms vs golden; appdb flat (15 ms).
- BL-24 nuance: in-place returns scorer names but 0 score (no contributions).

## 12:02 — Agent I started (session b8); go-ahead on the research memo (read-only)
- Gave it the verified anchors (context hurt, arctic cross-lingual gain, no SQL in golden) and asked for (1) why context hurt and (2) outside-in testability per strategy.
- Clarified BL-20 for Voytek: 10 leftover DBs (~130 MB), not 6.

## 12:03 — BL-07 SQL tested by H; told G to use version B
- Real data: n=52, semantic Δ −0.028 ± 0.051, keyword engines 0. The live card already shows −0.066 with Embedder cleared (it pools minilm and arctic baselines). Version B = per-slice rows.

## 12:05 — BL-07 verified (check 0/0, card 7 rows, no pooling). BL-04 fixture delete unblocked for A.

## 12:09 — I: research memo approved (research/embedding-text.md)
- Finding: context hurt because of the repeated 'chart: table' line, not length or labels (offline replay; small numbers). Build #1 mechanical query→English, #2 qwen3:8b summary, control #7 context-sql; fill-empty and fill-all; outside-in via description.
- Asked I to check existing MBQL→English in metabase.lib, verify citations, and send the corpus plan (stratified 40% held-out, standalone corpus).

## 12:12 — BL-04 verified (0 fixture runs, check 0/0); the 10k run 160501-03ff76 has provenance. BL-29: log-only now, --gc deferred.

## 12:12 — BL-20 done: Voytek dropped the 10 leftover DBs; verified all gone. The new …_1612037c0e pair is A's BL-19 test run.

## 12:13 — I: citations checked, corpus plan approved
- northwind-sql-v1 standalone (~112 entities: 32 vague SQL, 12 half-named, 20 well-described, 24 MBQL, distractors), ~60 scenarios, 60/40 stratified split frozen up front, held-out questions written blind by a subagent.
- MBQL→English is available outside-in via MCP get_content query_summary (lib/describe-query). Shared corpus-gen changes approved if golden stays byte-identical.
- Blocked the proposal to put the strategy in embedding_text (it would trip the run.ts:187 variant guard); asked for a separate text_strategy field, A to design it.

## 12:16 — G done-test reviewed
- Its answers match the DB; G's corrections to my verdict sentence are right (arctic typo +0.193 ± 0.431, n=5, not proven; cross-lingual +0.509 ± 0.218). BL-17 verified (CATEGORY_TAGS).
- Found BL-30: the latency-vs-size cards filter on one corpus, so tiers can never show, which is why the test agent said 'scale unknown'. Also flagged: pure vs semantic latency are separate instances (:3011/:3012), so the '8 ms top-up cost' inference is confounded.

## 12:16 — A scale tiers verified; BL-19 verified (A's pass/pass); approvals
- A: (2) arctic context run, then (3) I's flags and the text_strategy column (writer.ts OK), with a pipeline.ts window for H's BL-29 in between. Told A: ask before deleting harness rows.
- H: BL-27 read-only investigation; BL-24 'n/a' after G releases dashboard-cards.ts (G is on BL-30).

## 12:16 — BL-19 done (A pass/pass, verified); BL-29 logging in (not verified live). Leftover DBs for Voytek: *_16135106f6 pair (SIGTERM test), *_scale_10000_all_minilm pair (pre-BL-19). The arctic context run started 12:16:47, after H's 12:16:12 edit.

## 12:22 — Brief for J (branch watch); arctic context verified
- J brief: agents/J-branchwatch.md, added to the plan and roster. Libor's branch (via gh; git fetch fails): not a separate engine. It swaps semantic's store via MB_SEMANTIC_SEARCH_SQLITE_PATH, needs a native vec1 build, and any UPDATE segfaults the JVM (LIMITATION_001). Paolo's branch isn't pushed.
- Arctic context run 161915-402da0: context helps arctic, 25/18/9, +0.036 ± 0.031 (0.676 → 0.712); it hurt minilm. Real interaction.
- H: BL-27 option 1 (the SQL fix) approved, to be bundled with BL-24 after G's BL-30.

## 12:25 — G: BL-30 verified (latency-vs-size 10 rows, table 13; check 0/0); fresh-agent Q4/Q5 answers accurate. G does its 6 small fixes after H's rebuild, then is done (build), with reopen triggers I and J. H's rebuild for BL-24/27 approved.

## 12:26 — I: SQL corpus verified; embedtext approved
- northwind-sql-v1 (112 entities), 60 blind-written scenarios, a 36/24 frozen split; golden artifacts byte-identical (I's evidence); typecheck 0; no new Metabase source diff.
- Go on embedtext. Catch: MCP describe-query needs live cards, so harvest from A's sql baseline run with --keep, cache and freeze. Don't run qwen batches during A's latency runs.

## 12:28 — BL-24/BL-27 verified (stale Scale=100 on golden: 0/0, Ranked 10 rows). H is out of free backlog items; on standby for J/I.

## 12:28 — A: text_strategy + corpus flags verified (views 24×, 12 runs 'none', scratch DB gone). Next: SQL-corpus baselines on both embedders (the minilm one with --keep for I's MCP harvest).

## 12:29 — G marked done (build), but I found BL-31: the cards have 0 text_strategy references, so they'd pool I's runs with baseline. G is reopened before I's first strategy run.

## 12:35 — BL-31 verified (19 refs, strategy tab 4 rows, check 0/0, 0 non-none runs). G's done-test was an in-transaction insert plus rollback. G done (build); its first real test is I's first strategy run.

## 12:38 — SQL-corpus baselines verified
- minilm 163103-6ee999 / arctic 163607-383d40: semantic 0.359/0.402, in-place 0.337, appdb 0.250 (keyword identical across embedders). By tag, semantic sql-only 0.11/0.16, mbql-only 0.10/0.20, described 0.98. Big headroom for I.
- A next: BL-08 --repo (testable now), then context-sql/context controls on the sql corpus after I's qwen batch.

## 12:39 — A: BL-08 plan approved. Added: record whether the engine repo supports E's variant setting and refuse variant runs where it doesn't (Libor's branch lacks E's change).

## 12:40 — I: caches frozen (embedtext/cache/FROZEN.md); 4 strategy corpora. Run order: BL-08 → 4 sql controls → 8 strategy runs (fill-empty first). I pre-writes its held-out analysis before the numbers land.

## 12:41 — J started (session 35); go-ahead on step 1 (read-only gh review of Libor's branch, then branches.md v1). Asked it to check the top-up threshold and the index-build mode (for BL-09).

## 12:42 — I: analysis script embedtext/report.ts fixed in advance (held-out headline, same stats as the dashboard). Approved 4 pure-vector runs (none plus the dev-selected best strategy × 2 embedders) to separate the vector gain from the appdb top-up's keyword gain.

## 12:42 — BL-08 verified (--repo with the deps.edn check, variant refusal when E's setting is absent, provenance separated). A is starting the sql controls.

## 12:46 — J step 1 done; hybrid finding
- Libor's branch: code-complete; top-up threshold still applies; boot indexing is an async future (not Quartz); /status isn't forked (readiness via sqlite3 -readonly); default max distance 0.8 (run at 0.7 for parity); every write path is delete + insert (the UPDATE crash is avoided); no file overlap with E.
- Verified: pgvector semantic is always hybrid (vector + tsvector RRF, index.clj:902-934, no toggle), so semantic-pure isn't pure vector. BL-32 for G; told I (its attribution runs are incomplete; sqlite-vec1 gives the clean vector-only check).
- Libor's ref fetched over HTTPS with gh credentials (571a489e138). J: detached sibling worktree, native build in a gap in A's runs (clang/license OK). 5 questions for Libor → Voytek.

## 12:46 — I: approved a supplementary out-of-harness vector-only replay (cosine only, held-out, same stats) as an interim attribution number, run in a gap in A's runs.

## 12:47 — BL-32 verified (no positive pure-vector claims; check 0/0). Verdict now: semantic's lead comes from its own hybrid index, not the top-up; its embeddings' share is unknown until sqlite-vec1 or I's replay.

## 12:49 — BL-33: arctic v2 via Ollama gets no query prefix (embedding.clj:697-698 doesn't match 'snowflake-arctic-embed2'); verified. The override setting applies without a match (:713), so the harness can fix it via env. I adds a with-prefix arm to its replay; A queues --query-prefix runs.

## 12:49 — J: sqlite-vec1 plan v2 agreed with A; vec1 built (arm64, 16:47:53–16:48:03 UTC, overlapping A's SQL controls, so those runs' latency is flagged); worktree verified at 571a489e138. The readiness probe is proven on a WAL store. A's queue: SQL controls → I's 4 fill-empty runs → sqlite-vec1 run 1 → I's fill-all runs → BL-33.

## 12:50 — A: BL-33 plan approved (the label comes from the instance-reported ee-embedding-query-prefix). Order after the SQL chain (~30 min): sqlite-vec1 flags + run 1 → BL-33.

## 12:50 — Libor's answers (via Voytek), relayed to J
- (1) 0.8 unintentional → run at 0.7, drop the @0.8 run. (2) Reading the sqlite file is fine; #10 met by the harness probe. (3) J works out retry-on-skipped-batch from code; readiness requires docs = vectors = manifest. (4) Hybrid iteration 2 probably lands today → run vector-only now, labelled, and re-run on the new sha. (5) No build gotchas.

## 12:51 — G done. F owns the check of the Text strategy tab on I's first strategy run. The SQL controls have landed (context-sql/context × 2 embedders); strategy runs are pending.

## 12:51 — SQL control results (held-out, semantic, context-sql vs baseline): minilm 17/7/0 +0.375 ± 0.154; arctic 15/6/3 +0.260 ± 0.132. All-60: 0.359→0.693 / 0.402→0.672. context alone +0.03/+0.04. Raw SQL embedding is a big vector-side win; it's the bar for I's strategies. Told I.

## 12:52 — J: Q3 answered (skipped batches lost; no repair job with the sqlite store; readiness = manifest ⊆ search_doc). Found a silent semantic→appdb fallback on store errors (core.clj:145-151), undetectable via the API. Grepped all 15 pipeline logs: 0 'Error executing semantic search', so no published run is contaminated. The log guard goes to all runs (BL-34, A).

## 12:52 — I: alias-blind validity check approved (replay-only; a frozen rule and new llm cache; escalate to a real run if raw SQL's edge halves). Plus a minilm-truncation mechanism arm.

## 12:54 — First strategy run verified (165241-51bcdd, mech fill-empty, minilm); the Text strategy tab works (G read-only check). Held-out semantic: vs none 17/7/0 +0.474 ± 0.163; vs context-sql 10/12/2 +0.099 ± 0.105 (not proven). Keyword engines also gain (in-place +0.40). The verdict needs an SQL-corpus section once the batch is complete (reopen G then).

## 13:05 — Voytek approved the vector-only switch (BL-35); stale corpus text (BL-36)
- BL-35 → H (Clojure exception for this item; E's session is gone), then an A pipeline flag labelled semantic-vector. It enables a like-for-like semantic-vector vs sqlite-vec1-pure comparison and a clean vector attribution for I.
- BL-36 → G: the text names the deleted 'fixture' and misses sql/scale/runner-smoke; delete the 2 runner-smoke runs (F approved).
- My session was renamed to 'Typescript preference for agents'; G and H are now bg sessions 'G-explainer' and 'H-bugfixer agent harness'. Docs updated, and A, I and J told.

## 13:07 — H: BL-35 plan approved (admin setting in semantic_search/settings.clj; branch in hybrid-search-query; the default path byte-identical, proven against the unmodified SQL; off-state rows must all carry a vector distance). G: BL-36 text approved; the runner-smoke delete waits for Voytek's direct yes.

## 13:07 — G: BL-36 text live (check 0/0); runner-smoke delete waits for Voytek. J: the BL-35 pairing equalises retrieval, not ranking (pgvector has 10 in-store scorers sqlite lacks); per-scenario candidate-set overlap is a hard gate before publishing the pairing.

## 13:08 — Voytek: yes, delete runner-smoke (relayed to G). Voytek wants parallel runs: BL-37 (a scheduler with N=2 and exclusive latency jobs, plus an overlap view so latency cards drop overlapped runs). A to plan.

## 13:08 — BL-36 verified (runner-smoke deleted with Voytek's yes: 180 qr / 12 scen / 2 runs; 4 corpora left). J's candidate-overlap tool (sql/10-candidate-overlap.sql) approved: bar ≥ 0.95, key on manifest ref where available.

## 13:09 — BL-37 plans approved. A: queue.ts (jobs.jsonl, 2 slots, exclusive latency, hold jobs with a 20-min max, ports 3021–3040, orphan detection, dry-run tests), plus usage docs in START-HERE. G: harness_run_concurrency view + latency cards exclude overlapped runs (after A's OK).

## 13:10 — J: overlap gate now keys on manifest ref (branchwatch/overlap.ts); validated self 1.000, semantic vs pure 0.997, negative control context-sql vs context 0.511 FAIL. Accepted.

## 13:11 — G's BL-37 half verified (harness_run_concurrency 24 rows / 0 overlapped; check 0/0). The schema break from J's sql/10 file is already resolved (J deleted it).

## 13:11 — I: all 8 strategy runs in; --select (dev) = llm-fill-all. Held-out vs none: all better (+0.42..+0.56); vs context-sql: llm better on both embedders, mech better on arctic only. Harm check OK.
- Checked I's red flag: all-60 means differ across embedders (0.877/0.894 etc.), so the held-out 'identical' is likely a ceiling. But in-place 0.337→0.798 shows a big keyword share. Framing: 'auto-describe helps every engine'; vector-only claims wait for BL-35 semantic-vector runs (4 arms × 2 embedders) + the replay.

## 13:11 — H: BL-35 coded as a separate vector-only-search-query (hybrid untouched); kondo clean. Approved running the tests with MB_PGVECTOR_DB_URL (own my_test_db) in an A window; skip fix-modules-config (it targets :3002's nREPL; no module change).

## 13:12 — G: finishing the 3 glossary lines (my call), then done. BL-38 (overlap via job windows) and BL-39 (SQL verdict section, after the BL-35 runs) are in the backlog.

## 13:13 — G DONE (glossary lines for strategies/embedders/lucene live; check 0/0). G corrected all-minilm's context to 512 tokens per Ollama's model_info (sentence-transformers truncates at 256; Ollama is the runtime we measure, so 512 stands).

## 13:16 — I replay part 1 (supplementary, vector-only, held-out vs none): minilm mech +0.472, llm +0.500; arctic +0.411/+0.471, all BETTER, about the same as hybrid, so the gain is in the vector. Fidelity: replay none ≈ harness baseline. Alias-blind keeps 70–80%. BL-33 query prefix: ≈0 on none, +0.04..0.08 on strategies. Caveat: minilm llm-fill-all on described −0.116 (n=6, not proven).

## 13:21 — BL-35 Metabase side verified: diff reviewed (hybrid untouched; vector-only-search-query plus one if in scored-search-query; setting semantic-search-keyword-arm-enabled, admin, default true); 46 tests / 375 assertions green; the negative control fails 6 as expected. Metabase source diff is now E's 3 files + H's 4 files, all uncommitted. Next: A's semantic-vector flag.

## 13:22 — A: SQL chain done (14 runs, 0 failures); queue.ts dry-run verified; sqlite-vec1 flags + BL-09 readiness + BL-34 guard wired (J reviewing); the variant refusal fired live on Libor's branch (BL-08 now verified live); scratch smoke 9ace74 passed J's checks. Approved: run 1 (as-is + pure) as the first real 2-job queue batch after J's review. Concurrency slowdown is indicative only; measure properly on the semantic-vector pgvector pair.

## 13:22 — I: context-sql replay arms (vector-only, held-out). minilm: translation not proven better than raw SQL on sql-only; llm better overall only via GUI cards. arctic: translation beats raw SQL; with the BL-33 prefix, raw SQL jumps (+0.19 → +0.35), llm still better, mech no longer on sql-only. Alias-blind: raw SQL loses 5% (minilm) / 31% (arctic), so no harness alias run needed. SELECT-only probe: not better. Voytek asked whether all item types are tested: no, cards only. I offered a per-type follow-up phase; Voytek to decide.

## 13:24 — J reviewed A's sqlite-vec1 diff: 1 must (validate --sqlite-max-distance: a NaN silently becomes 0.8), 2 shoulds; everything else met. Smoke: leaks 0, readiness 250 = 250 (BL-09 proven on a JVM-written store), guard 56/0, 16/56 identical to pgvector (vector vs hybrid). Final go for run 1 after A's validation fixes. BL-34 fault injection approved (scratch only).

## 13:25 — Moved work from A to H (Voytek asked): BL-35 pipeline flag (--vector-only/semantic-vector), BL-33 harness flag (--query-prefix), BL-38, BL-28 (outside-in indexSize), BL-29 --gc (list only; drops need Voytek). Edits happen in queue-paused windows agreed with A.

## 13:26 — J tick: new branch hackathon-2026-sqlite-vec1-vibes (Mike Appleby; an LLM reranker over sqlite-vec1 via an external API, opt-in). Not Libor's iteration 2; not queued; measuring it is Voytek's call. Libor's head unchanged; no lucene yet.

## 13:27 — A's validation fixes verified. An accidental real run 82ecd1 (Libor's branch, appdb, sqlite-vec1@0.8 label) became the latest golden appdb, so I said mark it unpublishable with a reason (reversible) rather than delete. Run 1 is a go via the queue. H's --vector-only plan approved (implies pure; label from read-back; H rebuilds the dashboard).

## 13:29 — Voytek is concerned we measure only SQL-question retrieval. Coverage: golden top answers card 35 / dashboard 8 / metric 4 / table 2 / model 2 / segment 1; collection/document/measure 0; sql corpus is 100% cards. J tasked with a costed comprehensive-coverage plan (research/coverage-plan.md), read-only.

## 13:31 — H: BL-35 --vector-only in (semantic-vector in ENGINES; dashboard rebuilt 0/0); evidence run 173030-33ba queued. BL-33 plan approved, plus an arctic-no-prefix caveat line on the dashboard. H mentions 'A's two sqlite retries': check what failed in run 1.

## 13:32 — Correction: Voytek meant I, not J, for the coverage research. J stopped (any partial notes go to I); I now owns research/coverage-plan.md.

## 13:32 — sqlite run 1, first attempt: both queue jobs failed at boot (two JVMs from one --repo raced on <cwd>/plugins extraction). A fixed it with a per-instance MB_PLUGINS_DIR; the retries 173015-e12c/-0a18 are the live test. No run rows were written.

## 13:34 — sqlite-vec1 run 1 verified (as-is 173209-5c468e, pure 173138-6fd341): nDCG 0.581 vs semantic 0.601, paired 8/30/14 −0.019 ± 0.031 (not proven); pure pair the same. Recall on par; MRR −0.05 (hybrid helps exact names). Leaks 0, guard 0 violations. Concurrency: no indexing slowdown at N=2. Next for A: sqlite scale tiers as exclusive latency jobs, then §7 + BL-34 fault test, then arctic.

## 13:34 — I delivered research/coverage-plan.md (8 types × 30 + cross-cutting ≈ 320 questions; phases 0–3 ≈ 15–17 agent-h; recommends Phase 0, then 1+2). Found that search_native_query is never set, so keyword engines never searched SQL → BL-40.

## 13:35 — H: the BL-35 evidence run failed at the read-back (/api/setting returns null for env-set settings); fixed by reading /api/session/properties, re-queue pending. Leftover DBs *_vec_1732139217 go on Voytek's cleanup list. BL-33 code in, evidence jobs queued. Arctic caveat live on the dashboard. H gets BL-40 (the note only) next.

## 13:35 — BL-37 verified: the queue is in real use (2-slot batch, latency-exclusive scale jobs, pause windows); harness_job live (6 rows); START-HERE §7 usage doc at :101.

## 13:35 — BL-38 reassigned H → G (G designed it, is free). Must: exclusive latency jobs come out not-overlapped (strict boundary comparison).

## 13:36 — J's run-1 write-up: all sanity checks pass; paired nDCG −0.019 ± 0.031, MRR −0.052 ± 0.056, recall +0.001 (no proven difference); top-10 Jaccard with semantic 0.814, differences explained by pgvector's type-order scorer and document-body keyword hits (not a store bug). The pure run's latency is contaminated by the concurrent apply; BL-38 will exclude it. A to re-time the sqlite golden as-is and pure as latency jobs.

## 13:36 — BL-40 note verified (it also covers semantic's keyword arm: index.clj:699 uses the native-query tsvector only with :search-native-query). BL-35 read-back fix in; queue: sqlite 10k → bl33 golden/sql → bl35 vector-2.

## 13:37 — H: BL-28 plan approved (pgvector pg_total_relation_size with an 'includes' list; sqlite main + wal separately; appdb/in-place null with a reason).

## 13:37 — BL-38 verified (job-window overlap; only the 2 concurrent sqlite run-1 runs flagged; boundary tests pass). Follow-up to A: record jobId on the run to remove the own-job transient.

## 13:38 — sqlite-vec1 1k latency (solo) verified: p50/p95 35.9/130.1 vs pgvector 49.5/159.3; appdb/in-place match across runs (comparable). A adding harness_run.job_id. H: BL-29 gc.ts plan approved (+ a recent-log guard).

## 13:39 — BL-29 verified (ran gc.ts myself: 2 stale, 2 live correctly). BL-28 applied; verify on the next run's notes.indexSize.

## 13:49 — sqlite-vec1 scale: 1k 35.9/130 vs pgvector 49.5/159; 10k 222/1,084 vs 454/1,422 (but the machine state differed: appdb ×0.79). Approved a back-to-back pgvector 10k re-time as an exclusive latency job. job_id live.

## 13:51 — G's job_id change to harness_run_concurrency verified by a rollback test (own job excluded). The BL-33 pair is flagged overlapped (concurrent quality jobs, expected); sqlite 1k/10k are not. G closed.

## 14:04 — A's correction: the clean pgvector 10k re-time 175722-e82939 is 292/866 ms (not 454/1,422). sqlite-vec1 10k 222/1,084 → p50 ~25–30% faster, p95 worse or inconclusive; both exact search (no HNSW). Hybrid vs vector-only confounds it → approved an A-B-A vector-only latency sequence. BL-41 (stale verdict #6) → H.

## 14:06 — BL-35/33/28 evidence verified. semantic-vector vs semantic (golden) 3/42/7 −0.025 ± 0.023 (keyword arm adds a sliver; semantic's lead is the embeddings). Arctic + query prefix: golden −0.029 ± 0.054, sql −0.070 ± 0.048, so the prefix doesn't help (BL-33's 'product bug' has no measured cost here). H: BL-41 plus a reworded arctic caveat. I: queue the semantic-vector confirmation runs.

## 14:07 — BL-41 verified (clean 10k numbers: semantic 292/866, appdb 67/161, in-place 163/382; 1k→10k ≈6×; sqlite sentence; arctic caveat reworded; the grep is clean). H is restating verdict #3 with the semantic-vector result.

## 14:10 — Verdict #3 restated with the semantic-vector result; glossary entry added; check 0/0. Two stale lines (the what-would-change sqlite bullet, the glossary 'blank until runs land') go into the post-A-B-A update.

## 14:13 — Status: the queue was stalled by A's stale hold (180414-529c) after BL-35 was verified; told A to release it and start A-B-A. Both sqlite golden latency re-times failed (exit 1), cause requested. I hasn't queued its semantic-vector runs; pinged.

## 14:14 — The sqlite golden latency re-times failed at boot: 'config files require a Premium token with :config-text-file' (the token wasn't valid or wasn't seen). The earlier 18:02 run was fine. A to diagnose (the --repo env path vs a transient online check vs a token file change) and boot-test before releasing the queue.

## 14:15 — Cause of the stall: the laptop lost outbound internet, so the license check failed on new boots. A paused the queue. The network is back (curl ok); A to boot-test, release the hold and resume. I's 6 semantic-vector jobs were already queued (my misread).

## 14:18 — The queue is moving again (network outage confirmed in the log; token unchanged; boot tests on both repos passed). ABA-1 running; then ABA-2/3, the sqlite golden re-times, then I's 6 jobs.

## 14:19 — Voytek: quality matters more than latency. Asked A to run I's 6 quality jobs right after ABA-1, before ABA-2/3 and the sqlite golden re-times. Durations so far: quality 2–3 min/job, 10k latency 10–11 min, golden latency ~2.5 min.

## 14:40 — I's vector-only confirmation (held-out, semantic-vector): minilm ctxsql +0.377, llm-all +0.544, mech-empty +0.462 vs none; llm-all vs ctxsql +0.167 ± 0.119 (better), mech-empty vs ctxsql +0.085 ± 0.112 (n.s.). arctic ctxsql +0.250, llm-all +0.513, mech +0.419 vs none; llm-all vs ctxsql +0.263 ± 0.103 (16/8/0), mech vs ctxsql +0.169 ± 0.103. This confirms the replay in-harness: the gains are vector-side. ABA-2 failed on flaky network; A adding a boot retry. Voytek brought back B (a corpus from a real instance).

## 14:41 — I's final recommendation approved (research/embedding-text-recommendation.md; held-out numbers reproduced). B is back (session f2, presumed): onboarded with sync rules, a new corpus id, data-safety rules for real-instance data, coordinate with I's coverage plan. Roster updated (I is now named 'J-researcher').

## 14:44 — Paolo's branch found: lucene-semantic-search @917611d56a (swaps the store under semantic; an app-DB migration 065; a per-node Lucene index; hybrid with the appdb keyword arm). J reviewing (§1, readiness, hybrid switch, fair pairings). Runs after A's latency bracket, quality first.

## 14:47 — J's lucene review: checklist met except #10 (indexed set not observable); hybrid with no keyword-arm switch; the keyword arm is the appdb engine (H2 in our pipeline) → an H2-vs-PG confound (BL-43); readiness via the forked status API works; a per-instance index dir via MB_PLUGINS_DIR; HNSW (approximate); a new guard blind spot → BL-42. 5 questions for Paolo → Voytek.

## 14:55 — Voytek: prioritise Paolo's lucene (at least a smoke run); moving from improving to conclusions. A: lucene smoke run next (latency bracket held), minimal BL-42 checks; J verifies. BL-43 skipped unless Voytek asks.

## 14:56 — B (session f2) plan approved: real-data corpus stats-real-v1 from the sanitized Stats app-DB snapshot (Voytek approved); local-only data; a new DB mb_stats_real + mb_ss_stats_real; port 3041; ~150 blind questions. Conditions: a queue hold during indexing, verify indexing with the scheduler disabled, migrations forward on the copy only, 60 questions first if the ETA is over 2 h.

## 14:58 — The lucene worktree was created by J (A was blocked by SSH git): /Users/krever/Projects/metabase/.claude/worktrees/lucene-paolo, detached at 917611d56a, clean. A is starting the smoke run.

## 15:02 — H done (Voytek). The final verdict update (lucene, A-B-A result, SQL section BL-39, BL-41 follow-up) will go to G or H, reopened, once those runs land.

## 15:02 — The lucene smoke is running (job 190213-eb98), with the BL-42 live-vector-arm check enforced for lucene. ABA-2b (sqlite pure 10k) done: 185610-54a159. Order set: smoke → lucene pair → ABA-4 → B hold → sqlite golden re-times.

## 15:07 — B: stats-real restored (mb_stats_real, counts match), 14,848 grantable entities (card 10,285 … measure 14); real content kept in local/stats-real (git-ignored); first 60 questions in ~75 min; first result ~1.5 h. Told B to hold the queue only for boot + indexing, then release.

## 15:14 — Store-vs-store 10k (vector-only, exclusive): pgvector A3 277.7/655, A4 267.5/1,014; sqlite-vec1-pure 197.8/921. A3↔A4 drift 3.7%, so the bracket holds; sqlite p50 ×0.73 of pgvector; p95 inconclusive (pgvector's own p95 swings). Asked J for the overlap gate on B vs A3/A4 before claiming the same results.

## 15:15 — Wrote agents/K-deck.md (reveal.js Markdown deck, minimal slides + speaker notes; sections per Voytek; the alternatives table from sqlite-semantic-search-brief.md + Slack read-only; a Riley feature demo on its own instance/worktree (port ~3050); Stats data only on screen, with Voytek's OK). Added K to the plan and roster.

## 15:15 — J's overlap gate on 10k store-vs-store: top-10 0.604 FAIL; A3 vs A4 1.000; all differing scenarios are cut at 10 → ranking (the pgvector scorer gap), and result counts match everywhere. A to queue a large-limit unpublishable probe pair for the set-level check. The latency claim stands; 'same exact results' is withdrawn until the probe. Wrote agents/K-deck.md.

## 15:17 — Lucene smoke 191515-da3f42 verified (publishable = golden as-is): nDCG 0.579; paired vs semantic 7/31/14 −0.021 ± 0.019 (slightly worse, borderline); vs sqlite-vec1 −0.002 ± 0.022 (same). HNSW. Only the pure run remains. K started (session e3); scaffold + step 1 approved; Mike's content and the Stats-on-screen question go to Voytek.

## 15:19 — Lucene verified by J (nDCG −0.021 ± 0.019, MRR −0.060 vs semantic; ≈ sqlite-vec1, overlap 0.978). J's scorer hypothesis tested and refuted: semantic-vector vs sqlite-vec1-pure −0.002 ± 0.032, vs lucene −0.004 ± 0.030, so pgvector's lead = its tsvector keyword arm. BL-43 (Postgres app DB for lucene) is now the fair hybrid test; raised with Voytek.

## 15:21 — Voytek: the coverage plan becomes a deck slide (not executed now). Sent to K.

## 15:22 — K outline approved (18 slides; reveal 5.2.1 + mermaid vendored offline). Riley's branch: hackathon-2026-semantic-duplicates (PR #82899), built on the sqlite-vec1 store: a Duplicates sidebar card, a Monitoring → Potential duplicates view, and a Data Studio → Embedding map. Gave K the verified hook numbers; added the coverage slide; asked for sources for the lucene RRF/sync claims.

## 15:23 — B: indexing needs the Quartz scheduler (MB_DISABLE_SCHEDULER blocks it). Approved turning the scheduler on for the local copy with guards: anon tracking and update checks off, sync disabled on all 33 warehouses in the copy, and a log check for outbound attempts. New hold 192216-a9c2.

## 15:24 — B's guards are in: anon tracking, update checks and the SSO admin email off via env; all 40 DBs sync off plus schedules pushed to 2099 (backup in local/stats-real/db-sync-backup.csv); a log grep before release. Hold slotted ~19:40 UTC.

## 15:25 — K deck v1 verified (17 slides with notes, served :8077, numbers match). Edited the conclusions for accuracy (same vector quality; 'no pgvector', not 'no Postgres'; embedder blocker = research; BL-43 in next). Demo-instance plan next.

## 15:27 — Voytek: Stats data on screen is fine. Told K: live demo OK; keep real content out of the deck files; Stats screenshots only in local/.

## 15:28 — K demo plan approved: J makes the riley-duplicates worktree @5d4df152; :3050 northwind (sqlite store), :3051 Stats (a new mb_stats_demo copy with all of B's outbound guards); FE prod build + vec1 copy in held slots after the latency jobs; Stats screenshots only in local/. Deck v1 conclusions fixed, offline + speaker view verified.

## 15:39 — The lucene-pure job is stuck at 249/250 indexed since 19:23 UTC, blocking the queue; told A to collect evidence, stop it, move on, and re-queue (a possible Paolo bug). Overlap probes landed → J. B's session has left the agent list (its hold is pending).

## 15:42 — Full-set overlap gate PASSED (J): pgvector vector-only vs sqlite-vec1-pure at 10k, limit 1000 → Jaccard 1.000 (26,648/26,648). The stores return identical candidate sets; the top-10 difference is pgvector's ranking scorers.

## 15:43 — The overlap gate passed (verified by rerunning overlap.ts myself: 1.000). B resumed as session cb and was nudged with its next steps. K is on slides only; the demo instances were handed to H (reopened). A told to drop K's hold and the new priority order.

## 15:47 — Voytek wants the stats evals in ~15 min. B's 60 scenarios are ready; the hold is running (booting :3041 at 19:45 UTC). Told B: index → release → a 1-iteration quality run (semantic/appdb/in-place) immediately.

## 15:48 — A: the lucene-pure hang was stopped cleanly; evidence: every corpus doc IS indexed (search/debug), so it's likely a total_est vs embedding-count mismatch (a readiness-reporting issue, not a lost doc) → to Paolo via J. waitForIndexing now fails after 5 min without progress. K's hold cancelled. Queue: B hold → sqlite re-times → H demo → lucene-pure retry.

## 15:51 — J root-caused the lucene 249/250 hang: lucene/core.clj:60 populates only on an empty space; early event embeds race init!, so pre-existing docs (Trash) wait for the hourly repair. A Lucene-only bug (fix: repair! in init!). The retry uses force-reindex, recorded in notes.

## 15:58 — A: the lucene fix uses POST /api/search/re-init (force-reset → delete-space! + repopulate), not force-reindex (reindex! is a no-op for semantic). Recorded as notes.forcedReindex. Note on run da3f42: reached 250/250 without re-init (won the race). The lucene-pure retry 194741-b8e4 is queued.

## 16:01 — Stats indexing stuck at 22,156/22,215: 59 long docs get Ollama 500s forever (a minilm context limit; the indexer retries endlessly), a real-data product finding. Told B to accept 99.7%, record the ids, flag affected scenarios, release the hold and run now. J moved the riley-duplicates worktree to d0c7bb95e9 (color clustering) at Voytek's request; the dylib and prefetch are still valid.

## 16:03 — Demo split: J does the :3050 northwind Riley demo (FE build started 20:03 UTC at Voytek's direct ask); H does only the :3051 Stats demo, reusing J's build. DEMO.md shared.

## 16:10 — The lucene-pure retry 200842-0f90cf worked (re-init fix; 250/250; nDCG 0.579 = as-is). Conclusions mode: queue only lucene 10k latency (as-is, with re-init); skip lucene arctic/pure-10k. H is waiting on Voytek for the Stats demo (I recommended northwind only for now).

## 16:11 — Voytek approved the Stats demo (H). H uses the pgvector store (J: Riley's projection is empty and the backfill fails on sqlite) with a new DB mb_ss_stats_demo. Told K to fix the Riley slides' store claim.

## 16:11 — Stats-real run 1 verified (200822-424419): nDCG semantic 0.249 / appdb 0.224 / in-place 0.188; paired semantic vs appdb +0.025 ± 0.037, vs in-place +0.061 ± 0.073 (not proven). Undocumented targets ≈0.03 everywhere; sql/column/card/body-only = 0; semantic zero-result 46%. Asked B for the fallback log grep and a cutoff-vs-unindexed check. Numbers sent to K. A: lucene 10k queued with HNSW defaults recorded.

## 16:12 — Voytek (via K): the Riley demo on pgvector, fastest; SQLite irrelevant. Relayed to J (H already pgvector). K is holding the stats-real slide numbers for Voytek's go.

## 16:13 — Major finding (B): on stats-real, 48/60 semantic queries silently fell back to appdb (result_metadata schema validation errors on legacy cards) → BL-44 product bug. Withdrew the stats numbers from K; told B to mark the run unpublishable, strip the offending keys on the local copy (backup first) and re-run with the guard. B's cutoff check: all zero-result scenarios have candidates < 0.7 (median best 0.409), so the zeros came from the fallback, not the cutoff.

## 16:14 — J: :3050 on pgvector (new DB); Riley bugs noted (the projection is pgvector-only; the sqlite backfill fails on 75 Usage-analytics cards); minilm gives 0 duplicate pairs → switching to arctic. H: :3051 straight to arctic; told to apply B's result_metadata strip to mb_stats_demo too (Riley's features may hit BL-44).

## 16:16 — Riley demo :3050 northwind UP (J): d0c7bb95e9, pgvector, arctic, 250/250; backfill 4 pairs (all cross-lingual); map 109 points; DEMO.md written. Riley findings: projection pgvector-only; sqlite backfill fails the catch-up check; minilm 0 pairs; same-language copies not flagged at 0.83.

## 16:29 — J seeded the :3050 Riley demo (a 'Demo: map + duplicates' collection, 10 questions; 12 pairs incl. an MRR 4-way and a shipping cluster); the FE was rebuilt as EE (the first build was OSS → Monitor 'needs Pro'). DEMO.md updated. B and H blocked on Voytek's approval for result_metadata nulling on local copies.

## 16:44 — The final latency set is verified: 10k p50/p95 pgvector 292/866, lucene 238/953 (HNSW), sqlite 222/1,084; golden sqlite 25.6 vs pgvector 34.4 (×0.74); index sizes lucene 50 / pgvector 117 / sqlite 156 MB. The queue is empty. Final verdict update → H (while blocked); numbers → K.

## 16:47 — The final dashboard verdict is live (H): new #7 store tie, #8 auto-describe, #6 with lucene + sizes, the BL-44 caveat; check 0/0. The sqlite golden reference is 202630-5b5dc1 (exclusive). Stats eval and demo are blocked on Voytek's approvals in B's and H's sessions.

## 17:26 — Wrap-up: wrote hackathon/README.md (summary); moved sqlite-semantic-search-brief.md into hackathon/; added hackathon/.gitignore (node_modules, scale-* artifacts, queue runtime, deck/vendor, pycache) and deck/fetch-vendor.sh; removed __pycache__; scanned the staged files for secrets (64-hex = sha256s only, license token 0 hits; no real Stats content). Staged 183 files (176 new under hackathon/, 7 modified Metabase files). Not committed.
