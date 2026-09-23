# Agent H: bugfixer worklog

Session: `metabase-sqlite-semantic-search-74 [511bff]`. Brief: `agents/H-bugfixer.md`.

## 2026-09-23 — Start: read brief, picked BL-21, synced with F
- **What**: read START-HERE, `_shared-context.md`, the brief and `BACKLOG.md`. Sent F a sync for BL-21 (files:
  `local/run-golden.sh`, new `local/README.md`, this worklog).
- **Why**: BL-06/07 belong to G (active), BL-08–10 are in A's queue, and BL-12 (the first free `todo`) is a pipeline run
  that boots an instance, which is A's domain. I asked F who should take BL-12. The brief names BL-21/BL-23 as first items.
- **How**: reproduced BL-21 read-only, changing nothing:
  - `ls local/.golden-token` → `No such file or directory`; `local/.mb-license-token` exists (64 bytes).
  - `run-golden.sh:25-26` reads `local/.golden-token`, then falls back to `op read`. `runner/src/pipeline.ts:44` reads
    `local/.mb-license-token`. The two launchers use different token paths.
  - `docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' semantic_search-postgres-1` → `no`.
- **Open**: waiting for F's go-ahead. I asked F whether to keep `.golden-token` as a fallback, and whether to change
  the container's restart policy or only document it.

## 2026-09-23 — BL-21: one token path + restore-after-restart runbook
- **What**: F approved (drop `.golden-token`; document the restart policy only; leave `run-semantic-search.sh` alone).
  Claimed BL-21 in `BACKLOG.md`.
  - `local/run-golden.sh:24-34`: the token now comes from `local/.mb-license-token` (the same file as
    `runner/src/pipeline.ts:46`). If the file is missing or empty, it prints `no license token in local/.mb-license-token
    (missing or empty); falling back to 1Password (op)` to stderr, then uses `op read` as before. The env var still wins.
  - New `local/README.md`: restore runbook covering postgres (`docker start`, with the `docker update --restart`
    one-liner marked optional for Voytek), Ollama, :3002 + :8090 (pointing at D's runbook), :3003/:3004 (re-run
    `run-golden.sh` against the intact app DBs, never `reset-golden.sh`), pipeline instances (not restored, re-run),
    what to do if the pgvector volume was lost, a token lookup table for all three launchers, and a final check.
  - New `BL-25` (found by H): with an empty token file, `pipeline.ts` fails but `run-golden.sh` falls back to `op`.
- **Why**: BL-21. The two launchers read different token files, and `local/.golden-token` never existed.
- **How** (verification):
  - `bash -n local/run-golden.sh` → `syntax ok`.
  - `grep -n "golden-token\|mb-license-token\|TOKEN_FILE" local/*.sh runner/src/pipeline.ts` → only
    `.mb-license-token` (run-golden.sh:25, pipeline.ts:46); `golden-token` no longer appears anywhere.
  - Tested the token block on its own (extracted to the scratchpad, `op` stubbed, no boot): file ` abc123 ` → `[abc123]`;
    file missing → the warning, then `op` called; env `envtok` set → `[envtok]`, file not read.
  - Checked the runbook facts live: the restart policy is `no`; the container mounts the named volume
    `semantic_search_pgvector17_data` (compose `pgvector17_data`); Ollama has `all-minilm` + `snowflake-arctic-embed2`;
    listeners on 3002/3003/3004/8090/11434/55432; `local/golden/port`=3003, `local/scale10000/port`=3004
    (scale10000's run.log confirms it was started with run-golden.sh).
  - `npm run typecheck` → exit 0 (no TS touched).
  - **Not verified**: I didn't boot anything. The runbook steps weren't run end to end after a real restart, and the
    `op` fallback wasn't run for real (stubbed). The claim that `run-semantic-search.sh` reindexes `mb_semantic_search`
    after volume loss comes from the compose `POSTGRES_DB` plus the script's `CREATE EXTENSION`, not from a test.
- **Closed**: F verified BL-21 → `done`. BL-25 → `wontfix (F)`. The FYI to B (`-b4`) failed to send twice (the session is
  listed idle but refuses delivery); I told F.

## 2026-09-23 — BL-23: contract note that `ann_recall@10` isn't emitted
- **What**: `01-contracts.md` §4, just after the metric-name conventions (line 271): three sentences saying `ann_recall@10`
  isn't emitted in HTTP-only mode, why (no exact brute-force reference engine over the API, so `annReference` is
  never set), and what would enable it (an exact-search endpoint or an in-process probe). Nothing else changed; the
  metric name stays in the conventions list.
- **Why**: BL-23, scoped by F to one or two sentences in §4.
- **How**: reproduced first: `select count(*) from harness_metric where metric='ann_recall@10'` → `0`;
  `grep annReference runner/src/*.ts` → no match (only `metrics.ts` and its test use it). After the edit,
  `grep -n "not emitted" 01-contracts.md` → line 271. No code touched, so no typecheck or test needed.
- **Closed**: F verified BL-23 → `done`.

## 2026-09-23 — BL-14: latency percentiles and stage shares skip errored iterations
- **What**: A released BL-14/15/20 (BL-18/19 stay with A; `runner/src/*` is off-limits). F approved, and widened the
  scope to `stageBreakdown` (same bug, same line). Claimed it in `BACKLOG.md`.
  - `metrics/src/metrics.ts` (latency block in `toMetricRows`): groups `observations.filter((o) => !o.error)`, so
    both `percentiles` and `stageBreakdown` see only successful iterations. Docstring at :352 updated.
  - `metrics/src/metrics.test.ts`: new `describe("toMetricRows latency skips errored iterations")`. Two OK
    iterations (100 ms, embed 40) plus one errored iteration (5000 ms, embed 4900), the way the runner records errors.
    Asserts p50/p95/p99 = 100 and embed_share = 0.4. (The existing toMetricRows fixture gave its errored row
    `latencyMs: null`, which hid the bug.)
- **Why**: BL-14. The runner sets `latencyMs` on errors, while the cards filter `error IS NULL`, so stored and shown
  percentiles diverge as soon as anything errors.
- **How**:
  - Red before the fix: `npm test` → `# tests 71 / # pass 69 / # fail 2` (both new cases). Green after:
    `# tests 71 / # pass 71 / # fail 0`. Root `npm run typecheck` → exit 0.
  - Done-when: no real run has an error (errors = 0 in all 6 non-fixture runs), so `scratchpad/bl14-check.ts` (not in
    the repo) reads golden run `20260923-145150-29002c`. It marks iteration 0 of the first 5 scenarios as errored for every
    engine with latency 10000 ms (in memory for toMetricRows, in a CTE for the card SQL; no writes to `harness`). It
    compares toMetricRows' p50/p95/p99 with the card SQL (dashboard-cards.ts:181-183: `percentile_cont … WHERE error IS
    NULL`):
    ```
    rows 840 injected errors 15
    appdb     p50 card    13.405 stored    13.405 MATCH | old (all iterations)    13.432
    appdb     p95 card    19.025 stored    19.025 MATCH | old (all iterations)    20.860
    appdb     p99 card    24.080 stored    24.080 MATCH | old (all iterations) 10000.000
    in-place  p50 card    36.426 stored    36.426 MATCH | old (all iterations)    36.473
    in-place  p95 card    55.403 stored    55.403 MATCH | old (all iterations)    69.024
    in-place  p99 card    75.253 stored    75.253 MATCH | old (all iterations) 10000.000
    semantic  p50 card    33.265 stored    33.265 MATCH | old (all iterations)    33.384
    semantic  p95 card    48.305 stored    48.305 MATCH | old (all iterations)    52.340
    semantic  p99 card    57.760 stored    57.760 MATCH | old (all iterations) 10000.000
    mismatches: 0
    ```
    "old" is the pre-fix behaviour (percentiles over every iteration), computed in the same script.
  - **Not verified**: stage shares against the stage-share card (dashboard-cards.ts:308) on real data (unit test only).
    Existing stored `harness_metric` rows weren't recomputed; they're unaffected anyway, since no stored run has errors.
    Side effect: an engine whose iterations all errored now gets no latency rows at all (before, it got null percentiles,
    which are skipped anyway).
- **Closed**: F verified BL-14 → `done`.

## 2026-09-23 — BL-15: `unscored_rate` metric (dashboard half handed to G)
- **What**: F approved the name `unscored_rate` in place of `error_rate`. Claimed it, and updated the item's Fix line in
  `BACKLOG.md`. Only additions; nothing renamed or removed (A's arctic run on :3013 is live).
  - `shared/types.ts`: `METRIC.unscoredRate = "unscored_rate"` (after `permissionLeak`), with a doc comment.
  - `metrics/src/metrics.ts` `toMetricRows`: in the existing group-by (engine, embedder, scenario) loop, emit
    `unscored_rate` = 1 when no iteration succeeded, else 0. `perScenario` is now declared before that loop. Run-level
    and per-tag means come from the existing `aggregateByTag`. Docstring updated.
  - `01-contracts.md` §4 (line 325): definition, plus "missing on older runs = unknown, not 0". A's concurrent BL-10
    edit to §1 is intact (checked with grep after the write).
  - `metrics/src/metrics.test.ts`: `describe("toMetricRows unscored_rate")` covers all-errored → 1, partly errored → 0,
    no ndcg row for the unscored scenario, and run and tag means 0.5 and 0.
- **Why**: BL-15. An engine that errors on a whole scenario quietly averages over fewer questions.
- **How**:
  - Red before: `# tests 74 / # pass 72 / # fail 2`. Green after: `# tests 74 / # pass 74 / # fail 0`. Root typecheck exit 0.
  - `scratchpad/bl15-check.ts` (not in the repo, no writes): golden `20260923-145150-29002c`, every iteration of the
    3 first-sorted scenarios marked errored for `semantic` only:
    ```
    scenarios 56 injected (semantic): ambig-01, ambig-02, ambig-03 errored rows 15
    appdb     unscored_rate 0.0000 (0/56) | scenarios with ndcg@10: 52
    in-place  unscored_rate 0.0000 (0/56) | scenarios with ndcg@10: 52
    semantic  unscored_rate 0.0536 (3/56) | scenarios with ndcg@10: 49
    ```
  - **Not verified**: the dashboard side (G's). Stored runs don't have the metric; nothing was recomputed or written.
- **BL-15 status**: F verified the metric half → `doing — G (card). Metric done — H, verified F`. Handed off to G (-e7) with the missing=unknown note.

## 2026-09-23 — BL-20: blocked on permission (nothing dropped)
- **What**: sent F the exact DB list (pg_database + pg_stat_activity, read-only). F approved dropping only
  `mb_ss_scale100` (7.7 MB) and `scale_100` (8.4 MB), both with 0 connections, and keeping `mb_ss_scale1000`/`scale_1000`
  (a restorable 1k tier; `local/scale1000/` still on disk). mb_pl_*/wh_pl_* left for BL-19 / A.
- **How**: the command (fresh 0-connection check, then `dropdb` without `--force`) was **refused by this session's
  permission check** before anything ran. Confirmed both DBs still exist. Didn't retry or work around it, and didn't
  ask another agent to run it.
- **Open**: needs Voytek, either to run the drop himself or to allow it for this session. Commands:
  `docker exec semantic_search-postgres-1 dropdb -U postgres mb_ss_scale100` and `… dropdb -U postgres scale_100`.
  Status set to `blocked: needs Voytek`.
- **BL-20 follow-up**: F agrees; it stays `blocked: needs Voytek`, and F is passing it on.

## 2026-09-23 — BL-18: provenance in run notes (code landed; smoke verification pending)
- **What**: F approved option A (a smoke run on :3002 plus the hash check, no new golden run). BL-15 marked `done — H + G`.
  Claimed BL-18. New item **BL-28** (`indexSize` always null, P3); BL-26/27 were already taken by someone else, so I renumbered.
  - `results/src/writer.ts`: new `updateRunNotes(runId, patch)` (a jsonb merge into `notes`). Additive; `finishRun` untouched.
  - `runner/src/config.ts`: optional `corpusFile?: string` on `RunnerConfig`.
  - `runner/src/run.ts`: new notes keys: `repo`, `gitDescribe` (`git describe --always --dirty`), `embedderModel`
    {model, digest} (Ollama `/api/tags`; `/api/show` has no digest; never throws, records a reason instead), `seed`
    {value, source} (from `-seed-N` in the corpusId), `corpusHash` (sha256 of `cfg.corpusFile ?? <manifest dir>/corpus.json`,
    or null plus a reason), and `scenariosHash`. Scorer names per engine column are collected from `allScores` during the
    loop and merged in as `scorers` just before `finishRun`.
- **Why**: BL-18. A run should say exactly what code, model and inputs produced it.
- **How**: A has pipeline runs going (1k on :3014, then 10k on :3015, which loads runner/src at launch), so every save
  had to typecheck. writer.ts went first (additive), then config.ts, then run.ts in a single write. Root
  `npm run typecheck` → exit 0 after each. Offline checks: the hash matches `shasum -a 256 artifacts/golden/corpus.json`
  (`2f6f8d1cc93c…d45e6f`). Ollama tags: `all-minilm:latest 1b226e2802dbb772…`, `snowflake-arctic-embed2:latest
  5de93a84837d0ff0…`. `git describe --always --dirty` → `embedding-sdk-0.64.0-alpha.4-25-g188c8f412f7-dirty`.
- **Open**: (1) The smoke run is held until A has a quiet window, so it doesn't skew A's latency. (2) In pipeline runs,
  corpus.json isn't next to the manifest, so corpusHash will be null with a reason until pipeline.ts passes
  `corpusFile`. I asked F whether that line goes in now or with BL-19. (3) Asked A to check the 10k run's notes.
- **BL-18 hardening** (F's concern: live code only typechecked): `sha256File` read wrapped in try/catch; String()
  guard in `embedderDigest`; the scorer loop tolerates a missing `allScores`; `updateRunNotes` gets `.catch` → a
  warning, so a failed notes write can't leave the run unfinished. Tested on the real helper code extracted from run.ts
  (`scratchpad/bl18-helpers.ts`): golden hash `2f6f8d1c…`; missing file → reason; directory → `EISDIR` reason;
  `ollama/all-minilm` → digest `1b226e28…`; provider `none` → reason; unknown model → `not in …/api/tags`;
  `OLLAMA_URL=http://localhost:1` → `TypeError: fetch failed` reason, exit 0; seed 42 / null. Typecheck exit 0.
  A added the `corpusFile` line to pipeline.ts itself and relaunched 1k (:3014) → 10k (:3015) after BL-18 landed. A will
  report their notes. My smoke run waits for A's "10k finished".

## 2026-09-23 — BL-19: plan approved, patch prepared (not applied yet)
- **What**: F approved the plan: a unique instance suffix `<HHMMSS><4hex>` plus a 63-char assert; `notes.instance`; on
  success (no --keep) a bounded ≤30 s wait for the JVM exit, then drop mb_pl_/wh_pl_ for that instance (never throws); on
  failure keep the DBs and dir; fix the misleading :408 message; no SIGKILL code (the child PID is java, since the
  `clojure` script ends in `exec java`). Claimed it in BACKLOG.
- **How**: the patch is `scratchpad/bl19-patch.py`; dry-run on a copy applied cleanly (diff reviewed). The only other
  reference to the naming is `local/README.md:95` (mine), which I'll update alongside. **Not applied**: waiting for A's
  "pipeline.ts free". Verification per F: A does it on its next normal launch ((b) no mb_pl_<instance> left after
  success; (a) SIGTERM on a short throwaway launch → no JVM on the port, or marked "not verified" if A declines). I'm
  not doing a special run from my session.
- **BL-19 applied** (after A's "pipeline.ts free"; the 10k process had already loaded runner/src). Rebased on A's
  11:56 edits: `src.scenarios` fix (now :380) and `corpusFile` (now :417) both intact. Typechecked the patched file first
  in a scratchpad mirror (runner tsc exit 0; control with the unpatched file exit 0; negative control with an injected typo
  exit 2). The live file was byte-identical to the checked copy after applying (`cmp`). Root `npm run typecheck` →
  exit 0. `local/README.md` step 6 updated for the new naming and drop behaviour.
  **Not verified yet**: A does (b) on its next normal run, and (a) SIGTERM on a throwaway launch after the latency tiers.
- **BL-18 closed**: F verified it on A's real scale-1000 run `20260923-155756-94d8c0` (repo, gitDescribe -dirty, digest
  1b226e28…, seed {42, corpusId}, corpusHash, scenariosHash, scorers). The smoke run was skipped at F's call → `done`.
- **BL-24 note added** (F's side finding, checked by me): on 155756-94d8c0, in-place's `notes.scorers` has 12 names, but
  0/1565 stored results have a non-zero score (appdb 290/290, semantic 2015/2015 non-zero). So in-place returns
  scorer entries without a numeric `contribution` (or under another key); not determined which. Not fixed (G's area).

## 2026-09-23 — BL-07: corrected SQL written and tested, handed to G as text (no file edits)
- **What**: G is restructuring dashboard-cards.ts/dashboard.ts, so G asked for tested SQL as text instead of an edit.
  F approved, and added a real-data check. Wrote two versions of the "Change vs baseline embedding text" card SQL:
  **A** = same columns; the self-join also pairs on `data_scale IS NOT DISTINCT FROM` and `embedder`, and
  `n = count(DISTINCT scenario_id)`. **B** (recommended) = A plus "Scale"/"Embedder" columns and one row per slice.
  Sent both to G (-e7), with B verbatim in G's template form.
- **Why**: BL-07. The self-join matched only engine/scenario/metric, so it multiplied pairs across scales and embedders.
- **How**: `scratchpad/bl07.py` renders old/A/B with the optional `[[…]]` clauses kept or dropped per filter, and runs
  them via psql (SELECT only). Semantic n for baseline/context on fixture:
  - scale=100 + minilm: old 38/38, A 38/38
  - scale empty + minilm: old **342**/114, A 38/38 (Δ context +0.041 in both)
  - scale=100 + embedder empty: old **152**/152, A 38/38 (old baseline Δ CI 0.062 ≠ 0)
  - both empty: old 1368/456, A 38/38; B 10 rows, all n=38, baseline Δ 0.000 ± 0.000
  Real golden (baseline 154430-7f2163 vs context 154552-0f1b87), embedder=minilm: n 52; semantic Δ nDCG −0.028 ± 0.051
  (F expected ≈ −0.03); appdb/in-place Δ 0.000 ± 0.000. With embedder cleared (an arctic run 155004-12e37a now exists),
  **old is wrong on real data**: semantic context Δ −0.066, n 104/208. A and B give −0.028 and n 52.
  A's residual flaw: with Embedder cleared, the baseline row pools minilm and arctic (0.639) while the context row is
  minilm-only, and the CI is computed over pooled pairs. B has neither problem.
- **Not verified**: the card in Metabase itself (G drops it in, then `npm run check`). BL-04's fixture delete waits for that.
- **BL-07 landed** (G, version B, Embedder short name): check 0 errors/0 empty; via API semantic context n 52, Δ −0.028 ± 0.051. Status set to 'fixed … awaiting F's verification'. Told A that BL-04's delete is unblocked.
- **BL-07 closed**: F verified it (7 rows, check 0/0) → `done — G + H (verified F)`. Passed F's follow-up to G (hide baseline-vs-baseline rows).
- **BL-18 extra confirmation (A)**: scale-1000 `94d8c0` and scale-10000 `20260923-160501-03ff76` both have gitDescribe (…-g188c8f412f7-dirty), embedderModel.digest, seed.value 42, corpusHash.sha256 (A's corpusFile line works) and scorers. The smoke run was skipped (F: already verified on a real run). BL-04's fixture delete is done by A (10 runs). A is now running BL-19 checks (a)/(b) on :3016.

## 2026-09-23 — BL-29 (found by H): log what an interrupted pipeline run keeps
- **What**: F approved the logging part only; `--gc` is deferred to after the hackathon, and leftover DBs go on Voytek's BL-20
  list. Patch (`scratchpad/bl29-patch.py`): one `log(...)` line in pipeline.ts's SIGINT/SIGTERM handler, before
  `stop()`, naming the kept mb_pl_/wh_pl_ DBs and the dir. Typechecked in the scratch mirror → exit 0. **Not applied
  yet**: waiting for A's "pipeline.ts free" (A has :3016 check launches going). Also relayed F's BL-04 verification
  to A for A to mark done.
- **BL-20 closed by Voytek**: he dropped the leftover DBs himself; F verified → done. Remaining pipeline DBs: A's live 10k pair and the BL-19 test pair `…_1612037c0e` (expected gone after A's check (b)).

## 2026-09-23 — BL-19 verified by A; BL-29 logging applied
- **BL-19 evidence (A, on :3016)**:
  - (b) throwaway run `20260923-161326-dd7047`: log "instance golden_all_minilm_1612037c0e", then "dropped
    mb_pl_golden_all_minilm_1612037c0e" and "dropped wh_pl_…"; notes.instance set; `count(*) … like '%1612037c0e%'` = 0.
    A then deleted that run's rows so it wouldn't become the latest golden appdb run.
  - (a) SIGTERM at scenario 8/56 of `20260923-161515-552b1e`: node exit 143, "stopping Metabase", JVM pid 11692 gone,
    `lsof -iTCP:3016 -sTCP:LISTEN` empty within 10 s; finished_at NULL, so it's excluded. It kept
    `mb_pl_golden_all_minilm_16135106f6` / `wh_pl_…_16135106f6` with no log line (the BL-29 case).
- **BL-29 applied** (A said pipeline.ts is free): the file was byte-identical to the post-BL-19 copy (`cmp`); patched; identical
  to the mirror copy that typechecked; root typecheck exit 0. Diff: +2 lines in the signal handler (comment + `log(…kept
  <pgvectorDb>, <warehouseDb> and <dir> (interrupted runs are not cleaned up))`). **Not verified live** (it needs another
  SIGTERM'd launch). Leftovers for Voytek's cleanup list: `mb_pl_golden_all_minilm_16135106f6`, `wh_pl_golden_all_minilm_16135106f6`.
- **BL-19 closed**: F verified it on A's (a)/(b) → done.
- **BL-29**: F accepted it as 'logging added, not verified live' → `todo (P3, --gc deferred)`. A has an arctic context run on :3017 and then edits pipeline/config/run/writer + SQL for Agent I for about an hour, so I'm staying out of those files.

## 2026-09-23 — BL-27 investigation (read-only; no changes)
- **How Metabase remembers**: `user_parameter_value` rows keyed by (user_id, dashboard_id, parameter_id)
  (`src/metabase/users/models/user_parameter_value.clj`), written on every filter change and hydrated into
  `GET /api/dashboard/:id` → `last_used_param_values`, which the frontend prefers over the parameter's default. It's gated
  by one global setting, `dashboards-save-last-used-parameters` (`src/metabase/dashboards/settings.clj`: default true,
  `:visibility :internal`, so the API can't write it; only an env var at boot). There's no per-dashboard or
  per-parameter switch.
- **Current state**: dashboard 12 as dev@: `last_used_param_values` = embedder, scenario, corpus, variant, **no scale**.
  Parameter id `scale`, no default. Corpora: golden and runner-smoke have only NULL `data_scale`; scale corpora have only
  non-null. No corpus mixes the two.
- **Options**: (1) SQL: the Scale condition becomes `[[AND (data_scale = {{scale}} OR data_scale IS NULL)]]`. Tested with
  SELECTs: golden with a stale Scale=100 → old 0 rows, new 2650 (harness_scenario_metric). scale-1000 corpus with
  Scale=1000 → old 780 = new 780; with Scale=100 → 0 (unchanged). The corpus filter is required, so NULL-scale rows never
  mix into a scale corpus. (2) Turn the global setting off: needs an env var plus a :3002 restart (forbidden), and it
  affects every dashboard and filter. Rejected. (3) Change the Scale parameter id: orphans today's stale values once, but
  the next pick sticks again. Partial. (4) Delete `user_parameter_value` rows: an app-DB write to the live H2. Rejected.
- **Recommendation**: option 1, in `whereFor` for the scale tag only (dashboard-cards.ts, G's file), plus a check that
  golden cards render with Scale=100. Note: the item's Done-when is technically already met by G's Start-here
  text; option 1 makes it a real fix.
- **BL-27 option 1 approved by F**, bundled with BL-24 once G frees dashboard-cards.ts. Verify with `npm run check` plus
  the stale-Scale SELECT repro. **Caveat to re-check**: G's BL-30 makes the latency-vs-size cards ignore Corpus, so
  golden (NULL scale) and scale-* tiers mix there, and "the corpus filter keeps NULL and non-NULL apart" doesn't hold for
  those two cards. With `OR data_scale IS NULL`, a Scale=1000 pick would also pull in golden rows there. Likely handling:
  keep the plain `data_scale = {{scale}}` on those cards (or skip the scale tag), decided after reading G's final SQL.

## 2026-09-23 — BL-24 + BL-27: edits made, waiting for F's OK to rebuild the dashboard
- **What**: G released dashboard-cards.ts and glossary.ts. Claimed both items.
  - `results/src/dashboard-cards.ts` `whereFor`: the scale tag emits `AND (<col> = {{scale}} OR <col> IS NULL)` (BL-27).
  - "Ranked results side by side": the score shows `n/a` when `bool_or(score <> 0) OVER (PARTITION BY engine)` is false
    (data-driven, BL-24). `read` and description updated ("n/a … in-place never does").
  - `results/src/glossary.ts`: the in-place line now says "shows as n/a".
- **How**: F's BL-30 caveat checked: the two `SIZE_SCOPE` cards (which ignore Corpus) have no scale tag, and a script shows
  every scale-tagged card has `{{corpus}}`. Typecheck exit 0. psql test on golden concept-01 (baseline, minilm, Scale=100):
  in-place 10/10 `·n/a`; semantic and semantic-pure numeric (13.54); appdb `∅ no results`. Before/after copies are in the scratchpad.
- **Open**: `npm run dashboard` rebuild on :3002 needs F's explicit OK (brief). Then `npm run check`.
- **BL-24 + BL-27 pushed** (F OK'd the rebuild; G chose "push now, mine on top"): `npm run dashboard` exit 0
  (http://localhost:3002/dashboard/12); `npm run check` → `0 error(s), 0 empty card(s)`.
  - Stale Scale on golden: `check '{"corpus":["northwind-golden-v1"],"scale":[100],"scenario":["concept-01"]}'` →
    `0 error(s), 0 empty card(s)`; "Ranked results side by side" rows=10. (Before: the SQL repro returned 0 rows under Scale=100.)
  - Scale corpus unchanged: scale-1000-seed-42 with Scale=null → 15 empty, Scale=1000 → 15 empty, the same 15 cards
    (`diff` identical). They're empty for data reasons: 0 `ndcg@10` rows for that corpus. A mismatched Scale=100 → 18 empty
    (+ Agreement Jaccard, Ranked results, Scenario), the same equality behaviour as before for non-NULL corpora.
  - `npm run serdes -- export` exit 0. `ranked_results_side_by_side.yaml` has the n/a SQL; 18 exported files carry `IS NULL)`.
  - Not verified: the drill-down in a browser (checked via psql and API row counts only).
- **BL-24 + BL-27 closed**: F verified them (stale Scale=100 on golden → check 0/0, Ranked results 10 rows) → done.

## 2026-09-23 — Backlog cleared for H; on standby
- Done by H (all verified by F): BL-21, BL-23, BL-14, BL-15 (metric; card by G), BL-18, BL-07 (SQL; card by G), BL-19,
  BL-24, BL-27, BL-29 (logging; `--gc` deferred). Found by H: BL-25 (wontfix), BL-28 (deferred), BL-29.
- Blocked elsewhere: BL-20 (Voytek did it), BL-08/09 (branches), BL-22 (Voytek), BL-28 (engine size source).
- On standby for J (branch watch) and I (embedding research). Nothing gets taken without syncing with F.

## 2026-09-23 — BL-35: keyword-arm switch for pgvector semantic (Clojure; exception approved by Voytek via F)
- **What**: F handed me BL-35 (E's session is gone). The BACKLOG item records Voytek's approval of a Metabase change;
  the Clojure exception covers this item only. The plan was approved by F, with one structural change reported to F:
  - `enterprise/.../semantic_search/settings.clj`: `semantic-search-keyword-arm-enabled` (boolean, default true,
    `:visibility :admin` so it's API-settable, `:export? false`, `:doc false`). Env `MB_SEMANTIC_SEARCH_KEYWORD_ARM_ENABLED`.
  - `enterprise/.../semantic_search/index.clj`: new `vector-only-search-query` (same projected columns; `keyword_rank`
    = `CAST(NULL AS BIGINT)` so the rrf scorer's arithmetic resolves); `scored-search-query` picks it when the setting is
    false. `hybrid-search-query` is **untouched**, so the default path is the unmodified code.
  - Tests: `index_test/keyword-arm-setting-test` (no DB) and `query_test/keyword-arm-setting-test` (pgvector mock DB),
    including F's two asks (the default goes through the unmodified function; the off state has a vector distance on every row).
- **How**: `./bin/mage -check-readable` on all 4 files → readable. `./bin/mage kondo` on the 4 files → 0 errors,
  0 warnings (after switching to `mt/with-dynamic-fn-redefs`, per the lint). Diff: +91/−1 across 4 files.
- **Not run yet**: the tests. The fixture needs `MB_PGVECTOR_DB_URL` and drops/creates `my_test_db` in the shared
  container; I asked F. `fix-modules-config` was not run, because it would piggyback on :3002's nREPL (`.nrepl-port` 50605);
  it's not needed (no new namespace or cross-module require); asked F. Nothing was hot-loaded; the REPL wasn't used.
- **BL-35 tests** (A's window; F approved; fix-modules-config skipped per F):
  - Run 1: 46 tests, 364/365 pass, **1 error in my own index_test**: `relation "idx_tbl" does not exist`, because the helper
    built real scorers and the view-count scorer reads the index table. Fixed by passing a constant `{:model [:inline 1]}`
    scorer map (only the query's structure is under test) and dropping the scoring require.
  - The two new tests alone: `17 assertions, 0 failures, 0 errors`.
  - Negative control: `scored-search-query` temporarily ignored the setting → `17 assertions, 6 failures` (all off-state
    checks). index.clj restored byte-identical (`cmp`).
  - Final: `Ran 46 tests in 15.663 seconds / 375 assertions, 0 failures, 0 errors.` Kondo 0/0. Diff +91/−1 in 4 files.
  - Leftover: the fixture's `my_test_db` stays in the container (cleanup is `:before`); asked F. Logs are in /tmp/bl35-*.log
    (the scratchpad dir was gone).
  - Not verified: behaviour on a real instance (A's pipeline run with the setting off is the item's Done-when).
- **BL-35 closed (Metabase side)**: F verified it → status 'Metabase side done — H (verified F); pipeline flag with A'. my_test_db kept (F). Setting handed to A.

## 2026-09-23 — BL-35 pipeline half: `--vector-only` (F moved it from A to me)
- **What** (F approved the plan; A's window, queue paused):
  - `runner/src/pipeline.ts`: `--vector-only` (implies pureVector; rejected with `--sqlite-vec1`), boot env
    `MB_SEMANTIC_SEARCH_KEYWORD_ARM_ENABLED=false`, instance suffix `_vec` (keeps the longest scale names ≤ 63 chars),
    `semanticLabel` → `semantic-vector`, `keywordArmEnabled(admin)` read back after indexing (fails if --vector-only
    and the instance doesn't report false, or if no flag and it reports false), `notes.keywordArm`, guard mode
    `vector-only` (with pure=true, so every response must have semantic-distance > 0: the BL-35 done-when per
    response), a header doc line.
  - `shared/types.ts`: ENGINES += `semantic-vector`. `results/src/fixtures.ts`: excluded from fixture engines, like the
    other pure variants (typecheck required it).
- **How**: root typecheck exit 0; metrics 74/74. Offline: `--vector-only --sqlite-vec1` → `FAILED: --vector-only is for
  pgvector semantic…` (exit 1, before any boot; parseOptions runs first). Dashboard rebuilt (F's OK): `npm run dashboard`
  exit 0, `npm run check` → `0 error(s), 0 empty card(s)`, serdes export (9 files mention semantic-vector).
- **Open**: evidence run: `queue.ts add --kind quality --label bl35-golden-vector --by H -- --corpus golden --vector-only`
  once A resumes the queue (A is adding MB_PLUGINS_DIR after a two-JVM plugins race broke run 1).
- **BL-35 evidence job queued**: `173030-33ba bl35-golden-vector` (golden --vector-only), pending behind A's sqlite retries. BL-33 plan sent to F, with the finding that `snowflake-arctic-embed2` matches neither default arctic prefix pattern (embedding.clj:697-698), so all arctic runs so far embedded queries with no prefix.
- **BL-33 caveat (F)**: arctic query-prefix caveat added to glossary.ts (snowflake-arctic-embed2 line) and Start-here CAVEATS_TEXT; typecheck 0. Rebuild bundled with the BL-33 window.
- **BL-35 evidence run 1 failed at the read-back** (`173030-33ba`, before any query): "reports … = null". Cause
  (setting.clj `user-facing-value`): the /api/setting endpoints return nothing (204) for env-set or default-valued
  settings. Fix (F approved): `keywordArmEnabled` reads `/api/session/properties` (`user-readable-values-map` includes env
  values; admin sees :admin settings), the same channel as configuredEmbedder. Applied in A's window, typecheck 0.
  Re-queued as `173607-80e9`. Kept DBs `mb_pl_/wh_pl_golden_all_minilm_vec_1732139217` + dir → Voytek's list (F tracks it).
- **BL-33 code applied** (A's window): adapter.ts (`ee-embedding-query-prefix` from session properties → `+qprefix`
  embedder and `queryPrefix`), preflight.ts (facts.queryPrefix), run.ts (notes.queryPrefix; digest lookup strips +qprefix),
  pipeline.ts (`--query-prefix`, env, `_qp` suffix, must read back equal). Mirror typecheck, then live typecheck 0;
  `--query-prefix ""` rejected offline. Evidence jobs `173458-3803` (golden) and `173458-53c4` (sql), arctic + "query: ".
- **Arctic caveat live** (F): glossary + Start-here "Arctic may be understated". Rebuild check 0/0, serdes.
- **BL-40 note live** (F): Start-here "No engine searched SQL text" + the appdb/in-place glossary lines. Rebuild check
  0/0, serdes. BL-38 moved to G (F).
- **BL-40 closed (note)**: F verified it.

## 2026-09-23 — BL-28 indexSize + BL-29 gc.ts
- **BL-28** (F approved, A's window): pipeline.ts `indexSizes`/`pgvectorIndexSize`/`sqliteStoreSize` (never throw),
  measured per variant just before runMatrix, logged, `notes.indexSize`. pgvector: whole active table via
  `pg_total_relation_size` + rows + `includes` from pg_indexes (F's note); sqlite: main/WAL/SHM separately (F's note).
  SQL tested read-only on mb_semantic_search: 1,376,256 bytes / 112 rows / gin+btree, no hnsw. Typecheck 0.
  Evidence pending the next queued run.
- **BL-29** (F approved): new read-only `runner/src/gc.ts`. Stale = 0 connections, no `keep` marker, metabase.log
  older than 10 min (F's rule), not a running queue job's instance. It prints the dropdb/rm commands; it never runs them.
  pipeline.ts `--keep` writes `<dir>/keep`. Typecheck 0. First output: 4 instances, 2 stale
  (golden_all_minilm_16135106f6, scale_10000_all_minilm); the vector leftover is live for <10 min, and A's sqlite 10k job
  is live on all three signals. Output sent to F for Voytek.
- **BL-29 closed**: F verified gc.ts (same output) → done.

## 2026-09-23 — Evidence runs for BL-35 / BL-33 / BL-28 (all exit 0, finished)
- BL-35 `20260923-180253-b809c0` (golden, minilm, --vector-only): keywordArm {false, "env at boot (--vector-only),
  read back"}; engines appdb, in-place, semantic-vector; "fallback guard: 280 vector-only responses checked, 0 violations".
- BL-33 `20260923-175015-9b2660` (golden) and `20260923-175021-7f6f47` (sql): embedder
  `ollama/snowflake-arctic-embed2+qprefix`, notes.queryPrefix "query: "; guard 0 violations.
- BL-28: notes.indexSize on all three (e.g. golden arctic pgvector 2,162,688 bytes / 250 rows / vectors+tsvector+gin).
- nDCG@10 golden: minilm semantic 0.601 / semantic-pure 0.597 / semantic-vector 0.575; arctic 0.676 (no prefix,
  155004) vs 0.648 (+qprefix): the prefix lowered hybrid semantic on golden (n=52, no CI). sql arctic+qprefix: semantic
  0.333, in-place 0.337, appdb 0.250. Flagged to F (it contradicts the "arctic may be understated" caveat for golden).
- Told A that b809c0 checks out (A's A-B-A hold). Sent F the evidence plus the BL-41 plan.
- **BL-33/35/28 closed**: F verified (paired: vector-only vs semantic −0.025 ± 0.023; arctic +qprefix golden
  −0.029 ± 0.054, sql −0.070 ± 0.048).
- **BL-41 + arctic caveat** (one rebuild): VERDICT_RUNS.scale10k → 175722-e82939 (+ sqlite10k 174357-3004e3); verdict #6
  from the clean run (semantic 292/866, appdb 67/161, in-place 163/382 ms, 1k→10k ~6×), plus F's sqlite-vec1 sentence;
  the arctic caveat is replaced ("the prefix didn't help": golden −0.03 ± 0.05, sql −0.07 ± 0.05) in Start-here + glossary.
  Rebuild exit 0, check 0/0, serdes; the grep for all stale numbers finds nothing. Flagged verdict #3 ("no switch for the word
  part") as stale given BL-35; waiting for F.
- **BL-41 closed** (F verified). **Verdict #3 + the hybrid caveat restated** (F's text): #3 "semantic's lead comes almost
  entirely from its embeddings … semantic-vector −0.03 ± 0.02 (3/42/7; run 180253-b809c0)"; caveat "semantic is hybrid by
  default; semantic-vector is the vector-only reference"; glossary adds semantic-vector and fixes semantic-pure. Rebuild
  exit 0, check 0/0, serdes. Flagged 2 more stale lines to F (CHANGES_TEXT :518 hybrid vs vector-only; sqlite-vec1
  glossary "blank until its runs land").
- **BL-41 follow-up logged**: 2 stale lines + the #6 sqlite sentence, fixed in the post-A-B-A rebuild (F).

## 2026-09-23 — Done (F)
- F closed H's brief. All my items are verified: BL-21, 23, 14, 15 (with G), 18, 07 (with G), 19, 24, 27, 29, 33, 35, 28
  (the sqlite part verifies on the next sqlite run), 40 (note), 41, plus the verdict #3 restatement. BL-20 was done by Voytek.
- Left as logged: BL-41's post-A-B-A follow-up (verdict #6 sqlite sentence, CHANGES_TEXT ~:518, sqlite-vec1 glossary
  line), to be folded into F's final verdict update (BL-39).
- Nothing of mine is queued or running; no files are mid-edit. The Metabase change (BL-35: settings.clj, index.clj + 2 test
  files) is uncommitted, like everything else (BL-22 is Voytek's).

## 2026-09-23 — Reopened by F: Stats demo (blocked) + final verdict update
- **Stats demo (:3051)**, Voytek said go. `restore-stats.sh` → new `mb_stats_demo` from B's pristine dump (9 s), guards 0 / 0 0 0.
  Read-only backup `local/stats-real/demo-report_card.before-strip.dump` (0600). **Blocked by this session's permission
  check** ("mass delete"): (1) the result_metadata strip (in-DB backup table + `UPDATE report_card SET result_metadata = NULL`;
  B's log shows every key of the failing entries rejected, so a selective strip won't work); (2) `launch.sh stats` (its
  retry path drops and recreates the vec DB). Not worked around, and not handed to another agent. Hold 201056-0d6c released.
  DEMO.md "## Stats (:3051)" section appended (marked not yet booted), with J's arctic + pgvector findings and the known issues.
- **Final verdict update** (F's numbers): VERDICT_RUNS + sqlite/lucene/lucenePure/lucene10k; #6 with lucene 10k (HNSW,
  approximate) and index sizes; new #7 (stores tie; pgvector's edge is its keyword part); new #8 (auto-describe 0.40 →
  0.93–0.97); caveats (three stores; BL-44 real-data line; "all-minilm only"); What would change (sqlite/lucene answered,
  Stats pending); lucene glossary. Rebuild exit 0, check 0/0, serdes; the grep for superseded phrases finds nothing. Asked F to
  confirm the sqlite golden run id (173209-5c468e and 202630-5b5dc1 are both 0.581; I used the later one).
