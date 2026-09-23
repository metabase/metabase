# Worklog — Agent J (branch watch)

Session: `metabase-sqlite-semantic-search-35 [3e9092]`
Brief: `agents/J-branchwatch.md`

## 2026-09-23 — Onboarding; sync request to F
- **What**: read `START-HERE.md`, `agents/_shared-context.md`, `01-contracts.md` §1 (checklist) and §5, the brief, and the tails of F's and A's worklogs. Created this worklog.
- **Why**: required before any step.
- **How**: sent F the step-1 plan (read-only `gh api` review of Libor's `hackathon-2026-sqlite-vec1` against the §1 checklist; watch for Paolo's branch; write only `branches.md` and this worklog). Waiting for the go-ahead.
- **Open**: no go-ahead from F yet.

## 2026-09-23 ~16:40 UTC — Step 1: Libor's branch reviewed against §1; branches.md v1
- **What**: F's go-ahead received. Updated the J row in `START-HERE.md`. Reviewed `hackathon-2026-sqlite-vec1` at `571a489e13814e5599258a4ed74cdda5bacd98b9` via `gh api` (compare + raw contents saved to the scratchpad; no local checkout). Wrote `hackathon/harness/branches.md` (checklist table with file:line, plug-in facts, risks, draft integration plan). Looked for Paolo's branch.
- **Why**: brief deliverables 1 and 2 (draft), plus F's three questions.
- **How / findings**:
  - Top-up: `semantic-search-min-results-threshold` still governs it (same `results` fn, `core.clj:106-144`), so `--pure-vector` works unchanged.
  - Boot indexing: not Quartz. `init!` → `index-all-async!` future; `update!` embeds synchronously; failed embed batches are skipped silently.
  - `/api/ee/semantic-search/status` isn't forked (`api.clj:27-49`), so it returns `{}` with the SQLite store and the pipeline's `waitForIndexing` would time out. Proposed an outside-in sqlite3 probe instead.
  - Cutoff default 0.8, not 0.7 (`sqlite_config.clj:19-29`); env override exists.
  - Ranking is vector-only RRF + distance; pgvector semantic is hybrid (`index.clj:892-902` on master), so not a pure store swap.
  - LIMITATION_001: every write path is delete + insert, and no read projects `distance`.
  - Merge with E's change: no file overlap (a file-list check only, not an actual merge).
  - Local toolchain: arm64, Apple clang 21, `/usr/bin/sqlite3` 3.51.
  - Paolo: no lucene/paolo branch. Noticed `hackathon-2026-semantic-sqlite` (Mike Appleby, 09-19), a different SQLite store; flagged, out of scope.
- **Not verified**: nothing built or run; the sqlite3 CLI reading `search_vec_base` without vec1; the real merge.
- **Open**: agree the plan with A (needs F's go-ahead); send Libor's questions to F.

## 2026-09-23 ~16:45 UTC — Step 2: worktree created; plan v2 sent to A
- **What**: F's decisions: a real git worktree, the vec1 build in a gap A gives, cutoff 0.7 plus one 0.8 as-shipped run, the sqlite3 readiness probe marked unverified. Created a detached worktree `/Users/krever/Projects/metabase/.claude/worktrees/sqlite-vec1-libor` at `571a489e13814e5599258a4ed74cdda5bacd98b9` (ref fetched by F). Rewrote the plan in `branches.md` as v2; fixed the hybrid citation to `index.clj:902-934` (F's check). Sent the plan to A.
- **How**: `git worktree add --detach … 571a489e1381…` → HEAD verified, `git status` clean, `git describe` = `embedding-sdk-0.64.0-alpha.4-75-g571a489e138`. No branch created; shared worktree untouched.
- **Open**: A's confirmation and a build gap; A's answer on where the expected count comes from. The Paolo check is due every ~30 min.

## 2026-09-23 ~16:55 UTC — vec1 built; readiness probe proven on a real store; plan agreed with A
- **Timestamps**: my two earlier entries said ~17:45/17:55 "UTC". Wrong: they were ~16:40/16:45 UTC. Fixed here and in branches.md.
- **Plan**: A agreed (labels `sqlite-vec1`, `sqlite-vec1-pure`, `sqlite-vec1@<d>` for d ≠ 0.7; readiness = docs = vectors stable for 2 polls, then the preflight corpus check with probe kind `sqlite`). Recorded in branches.md.
- **Build**: in `/Users/krever/Projects/metabase/.claude/worktrees/sqlite-vec1-libor`, `./bin/fetch-vec1.sh && ./bin/build-vec1.sh darwin-aarch64`, 16:47:53–16:48:03 UTC, exit 0. `resources/vec1/darwin-aarch64/vec1.dylib`, Mach-O arm64, 154,392 B, sha256 `44d210b33f39036887d5025f5e2e965a09c7c28a7dd0aa93561d6cf7605d7950`. It's untracked, and `git status` shows only `?? resources/vec1/`. The log is in the scratchpad (`vec1-build.log`). A said go during its SQL queue, and it has the times to flag overlap.
- **Probe proof**: a scratchpad script (`probe_test.py`) builds a throwaway store with Libor's DDL shape via the built dylib (Homebrew Python, SQLite 3.53, WAL) and reads it with `/usr/bin/sqlite3 -readonly` while the writer is open. Results: 50|50; an uncommitted doc invisible; a doc without a vector → 51|50; 100|100; delete+insert ×10 keeps 100|100; the corpus query ok; CLI on `search_vec` → `no such module: vec1`, exit 1 (no crash). The store is in the scratchpad only.
- **Not verified**: a store written by the JVM / sqlite-jdbc 3.50.3; nothing booted from Libor's worktree yet.

## 2026-09-23 ~17:00 UTC — Review checklist; Libor's answers; skipped-batch analysis
- **What**: added "Diff-review checklist" (must/should) and "Answers from Libor" to `branches.md`; amended plan step 4 (readiness) and the matrix (dropped @0.8; step 6 re-runs after hybrid). Sent A the must-items and the changes; reported to F. A will add `notes.concurrentActivity` for the build overlap to the two arctic sql control runs.
- **Findings (code-read, at 571a489e13)**:
  - A skipped embedding batch writes neither docs nor vectors (`sqlite.clj:454-461`), so docs = vectors can't detect it. It's never retried: the repair Quartz job is unscheduled with the sqlite store (`task/index_repair.clj:47-58` gated by `semantic-search-configured?` → false, `util.clj:124`). Readiness therefore needs the manifest set ⊆ search_doc.
  - The response `engine` comes from the search context (`src/metabase/search/impl.clj:506`), so semantic's error fallback to appdb (`core.clj:145-151`) is invisible to `adapter.ts:143`. A metabase.log guard is a must-have.
- **Not verified**: nothing run on Libor's code yet.

## 2026-09-23 ~17:04 UTC — BL-34 filed; A accepted the checklist musts
- **What**: A accepted every must-item (see branches.md checklist). I sent A how to tell the kinds of row apart: store rows have semantic-distance > 0; top-up rows get an appended 0 (`core.clj:82-97`, `:142`) and come after the store rows; error-fallback rows have no entry. On F's request, filed **BL-34** in `BACKLOG.md` (the silent semantic→appdb fallback, guarded via metabase.log for all pipeline runs, queued — A). F found 0 hits in the 15 existing pipeline logs.
- **Open**: waiting for A's ping for the diff review (after the SQL chain, ~20 min).

## 2026-09-23 ~17:07 UTC — Pre-review of A's runner/src/sqlite.ts: a false positive on pgvector
- **What**: read A's unwired `runner/src/sqlite.ts`. It matches the checklist, except that `semanticDistanceViolation`'s prefix/suffix and pure rules would false-fire on pgvector (BL-34 extends it to all runs). Sent A the fix (missing entry = fallback for all; prefix/suffix and pure only for sqlite-vec1) plus 2 small notes (pin `/usr/bin/sqlite3`; put the counts in the timeout message). Updated BL-34's fix text.
- **How**: code: pgvector keyword-only hits → `semantic-distance` = coalesce(NULL, 0) (`scoring.clj:93`), interleaved by the RRF full join (`index.clj:902-917`). Live, 5 read-only GET `/api/search?search_engine=semantic` on B's golden :3003 (dev login): 'orders' 54 results `+×41 00 +×8 000`; 'fct_orders_v2' 31 with one interleaved 0; no result lacked the entry.
- **Not verified**: whether the interleaved 0s at 'orders' 42-43 are keyword-only hits rather than something else (the code says so; I didn't inspect the rows).

## 2026-09-23 ~17:09 UTC — A's must-fix to sqlite.ts checked
- **What**: re-read `runner/src/sqlite.ts`. `fallbackViolation` (all semantic-family columns: violation only for a missing `semantic-distance` entry) and `vectorOnlyViolation` (sqlite-vec1: fallback + prefix/suffix + pure) are correct as written. `SQLITE3` is pinned to `/usr/bin/sqlite3` (the version goes into notes), and the timeout message carries the last counts. Still unwired; the full diff review happens when A pings.
- **Note for the review**: an error fallback that returns 0 rows passes `fallbackViolation` (nothing to inspect); only the log scan catches it, so the log scan must stay mandatory.

## 2026-09-23 ~17:12 UTC — BL-35 pairing added to the sqlite-vec1 matrix
- **What**: F (now session `Typescript preference for agents`) relayed Voytek's approval of BL-35 (pgvector keyword arm off). Added matrix step 7 (`semantic-vector` vs `sqlite-vec1-pure`) and a section "The BL-35 pairing" to branches.md.
- **Findings**: it equalises retrieval (exact KNN, same text, cutoff, no top-up), so the candidate **sets** should match, which makes a strong store-correctness test. It doesn't equalise ranking: pgvector has 10 extra in-store scorers (`scoring.clj:83-113`, incl. exact/prefix), and sqlite has rrf + semantic-distance + bookmarked/user-recency. Embedding text is the same source in both (`index.clj:172`, `sqlite.clj:354`). The search diff between Libor's merge base and our HEAD doesn't touch the embedded text (`git diff 0509e1a5e27b 188c8f412f7`).
- **Open**: repoint the branch-watch cron at F's new session name.

## 2026-09-23 ~17:15 UTC — Candidate-overlap hard gate + tool
- **What**: F made the candidate-set overlap a hard gate for the BL-35 pairing. Wrote `hackathon/harness/sql/10-candidate-overlap.sql` (a new file, read-only query; params run_a/eng_a/run_b/eng_b; top-10 sets keyed by model+name; per-scenario Jaccard + total). Recorded the gate and a proposed pass bar in branches.md.
- **How verified**: self-check `semantic` 154430-7f2163 vs itself → 1.000 (360/360). `semantic` 154430-7f2163 vs `semantic-pure` 154059-044bd9 → 0.997 (359/360), with the only difference in xling-04 4 vs 3 (a top-up row).
- **Caveat**: a ranking difference can cut identical sets differently at top 10, so a low overlap needs a larger-limit probe before it's called a store bug.

## 2026-09-23 ~17:18 UTC — Overlap tool keyed by manifest ref (F's robustness ask)
- **What**: replaced my `sql/10-candidate-overlap.sql` (deleted; created by me earlier today, nobody used it) with `hackathon/harness/branchwatch/overlap.ts`. It keys items by corpus ref via each run's instance manifest (auto-found from `notes.instance`, or `--manifest-a/-b`), falls back to model+name outside the manifest, and reports fallbacks and collisions. Read-only against the harness DB.
- **How verified**: self → 1.000; semantic vs semantic-pure (golden, minilm, explicit manifests) → 0.997, 0 fallbacks, the diff = `card/ja-return-rate` in xling-04 (top-up); sql context-sql vs context (auto manifest) → 0.511 FAIL (different text; this shows the gate discriminates). `tsc --noEmit --strict` on the file: ok. It isn't in an npm workspace, so root `npm run typecheck` doesn't cover it.
- **Caveat**: the old fixed-name dirs (`golden_all_minilm`, `_pure`) may hold a manifest from a later run reusing the dir; 0 fallbacks suggests the refs line up, but I didn't prove it's the exact manifest of those runs.

## 2026-09-23 ~17:22 UTC — Diff review of A's sqlite-vec1 flags
- **What**: reviewed A's changes (pipeline/run/preflight/config/sqlite.ts, shared/types.ts, fixtures.ts) against the branches.md checklist. Result: 1 new must (validate `--sqlite-max-distance`: NaN would make Libor's `parse-double` return nil → silent 0.8), 3 shoulds; every other must met. Sent to A and F; recorded in branches.md.
- **How**: read the code paths (`pipeline.ts` 129-139, 186-221, 264-272, 440-541; `run.ts` 150-242; `preflight.ts:31`; `config.ts:16-20,55`); `node -e` for Number() edge cases; root `npm run typecheck` clean. BL-34 mid-run idea tested on my scratch store: `/usr/bin/sqlite3 … "alter table search_doc rename to search_doc_broken"` exit 0; Libor-shaped KNN → `OperationalError: no such table: search_doc`; renamed back.
- **Not verified by me**: A's smoke run itself (I have its numbers, not its log; the scratch DB was dropped).

## 2026-09-23 17:25 UTC — Branch-watch tick: new branch `hackathon-2026-sqlite-vec1-vibes`; timestamps corrected
- **What**: Libor's head is unchanged (`571a489e13`); no lucene/paolo refs. New ref `hackathon-2026-sqlite-vec1-vibes` (Mike Appleby, 1 commit `dec0b90fc4` at 17:07 UTC, stacked on Libor's head): an opt-in LLM reranker (TypeSafe Jev) over the sqlite-vec1 top 50. It isn't hybrid iteration 2. Recorded in branches.md "Other branches"; F told. BL-09 marked "proven on a JVM-written store" (F's ruling on A's smoke).
- **Timestamps corrected**: `date -u` read 17:24 UTC at this tick, so my stamps from "~17:15" through "~18:25" were estimates running ahead of the clock. Re-stamped them to ~17:00–17:22 in this worklog and branches.md. From now on I read `date -u` before stamping.
- **How**: `gh api …/matching-refs/heads/hackathon-2026` (the first call timed out on the network; the retry succeeded), `compare/hackathon-2026-sqlite-vec1...hackathon-2026-sqlite-vec1-vibes`, `vibes/settings.clj` and the api/impl patches at `dec0b90fc4`.

## 2026-09-23 17:35 UTC — Coverage research: started, then handed to I
- **What**: F assigned Voytek's coverage research at ~17:28. I ran two read-only Explore subagents (search specs; harness capabilities). At 17:32 F corrected it: the task is I's. Both subagents had already finished. I saved their raw findings as `research/coverage-plan-notes-J.md` (marked PARTIAL, no plan), told I the path, and did not create `coverage-plan.md`.
- **Not verified**: the subagents' file:line citations weren't individually re-checked (the notes say so).

## 2026-09-23 17:42 UTC — Run 1 verified (golden × minilm @0.7, sqlite-vec1 as-is + pure)
- **What**: independently verified A's runs `20260923-173209-5c468e` / `20260923-173138-6fd341` against pgvector `154430-7f2163` / `154059-044bd9` and wrote the "Run 1" section in branches.md (status table updated). F and A told.
- **How**: harness DB queries (run notes, obs/errors, empty-04 permission_leak, returned scores, per-scenario paired Δ with 1.96·sd/√n); `node branchwatch/overlap.ts` (0.814 / 0.811; diffs = collections vs metrics/dashboards/documents); instance logs and manifests for timing.
- **Result**: all sanity checks pass. nDCG Δ −0.019 ± 0.031, MRR −0.052 ± 0.056, recall +0.001 ± 0.009 (n = 52): no proven difference.
- **Problem found**: the concurrent boots put the as-is instance's corpus apply and embedding (17:31:47–17:31:53+ UTC) inside the pure run's timed window, so pure's latency isn't clean. Recommended a solo re-time; F decides.
- **Not verified**: A's readiness log lines themselves (I relied on A's report for 250 = 250).

## 2026-09-23 17:55 UTC — Branch-watch tick
- Libor's head is unchanged (`571a489e13`; the first call timed out, the retry succeeded); no lucene/paolo refs. `hackathon-2026-sqlite-vec1-vibes` was force-pushed: `dec0b90fc4` split into 6 commits ending `869a57312e`, with an identical file list and line counts. Noted in branches.md; no message (no content change).

## 2026-09-23 18:50 UTC — Paolo's lucene branch: found (via Voytek), reviewed, plan to A
- **What**: Voytek pointed to `lucene-semantic-search` (no `hackathon-` prefix), head `917611d56a` (18:36 UTC). Told F immediately. Reviewed it against §1 read-only via gh (the patches + lucene/*.clj saved to the scratchpad) and wrote the "lucene (Paolo)" section in branches.md: checklist, plug-in facts, 5 risks, integration plan, 5 questions. Sent F answers to its 5 questions and A the plan.
- **Findings**: it swaps the store under `semantic`; `semantic-search-backend` defaults to `:lucene`. Hybrid: Lucene HNSW + the **appdb keyword engine**, which is H2 on our pipeline (risk 1). The status endpoint is forked, so the existing readiness works. The indexed set isn't observable (H2 locked). Cutoff 0.65 score ≡ 0.7 distance. Repair is scheduled. No native build. A blind spot: an empty index → keyword-only answers pass BL-34 (→ BL-42).
- **Decisions (F)**: run 1 on H2 as-is, `notes.appDb=h2`; BL-42 before publishing; BL-43 (Postgres app DB) later, if Voytek wants it.
- **Miss**: my tick's `lucene|paolo` regex over all heads should have matched this branch. Its commits date from 14:51, and I don't know the push time. Either it was pushed after 18:24, or a paginated listing failed quietly during the network timeouts. I replaced the cron job: it now fetches named heads directly and requires the full listing to contain `master` + `lucene-semantic-search` before trusting a "nothing new" result.
- **Not verified**: nothing built or run from Paolo's branch; `lucene/sync.clj` and `index.clj` were skimmed, not read fully.

## 2026-09-23 18:50 UTC — Paolo's lucene branch: found (via Voytek), reviewed, plan to A
- **What**: Voytek pointed to `lucene-semantic-search` (no `hackathon-` prefix), head `917611d56a` (18:36 UTC). Told F immediately. Reviewed it against §1 read-only via gh (the patches + lucene/*.clj saved to the scratchpad) and wrote the "lucene (Paolo)" section in branches.md: checklist, plug-in facts, 5 risks, integration plan, 5 questions. Sent F answers to its 5 questions and A the plan. F's decisions are recorded there (18:54): run 1 on H2 as-is with `notes.appDb=h2`; BL-42 (live-vector-arm check + boot proof) before publishing; BL-43 (Postgres app DB) later, if Voytek wants it; Paolo's questions go to Voytek.
- **Findings**: it swaps the store under `semantic`; `semantic-search-backend` defaults to `:lucene`. Hybrid: Lucene HNSW + the **appdb keyword engine**, which is H2 on our pipeline. The status endpoint is forked, so the existing readiness works. The indexed set isn't observable (H2 locked). Cutoff 0.65 score ≡ 0.7 distance. Repair is scheduled. No native build. A blind spot: an empty index → keyword-only answers pass BL-34.
- **Miss**: my tick's `lucene|paolo` regex over all heads should have matched this branch; the commits date from 14:51 and I don't know the push time. Either it was pushed after 18:24, or a paginated listing failed quietly during network timeouts. The cron job now fetches named heads directly and requires the full listing to contain `master` + `lucene-semantic-search` before trusting "nothing new".
- **Not verified**: nothing built or run from Paolo's branch; `lucene/sync.clj` and `index.clj` were skimmed, not read fully.

## 2026-09-23 18:58 UTC — Lucene prioritised; sanity script ready
- **What**: F reports that Voytek prioritises lucene; A does a lucene smoke run before the remaining latency jobs. A has had the plan since ~18:48 (confirmed to F). Wrote `branchwatch/lucene-sanity.sh <run_id> [instance]` (read-only): run record + guard notes (incl. the BL-42 note), obs/errors per engine, empty-04 and overall leaks, lucene score min and zero-score rows, boot-proof log lines (Opened…, no "Another process holds…", no "Error executing semantic search", keyword-arm and embed failures), hs_err, and the index dir under `<instance>/plugins/semantic-search` (the pipeline sets `MB_PLUGINS_DIR=<dir>/plugins`, pipeline.ts:217).
- **How verified**: dry run on sqlite run 1 `20260923-173209-5c468e`: all sections print; the lucene-specific ones are empty, as expected.
- **Limit**: the live-vector-arm share can't be computed from `harness_query_result.returned` (it keeps the total score only), so it comes from A's BL-42 note.

## 2026-09-23 19:02 UTC — Lucene worktree created (A was blocked on fetch)
- **What**: A couldn't fetch (its shell's git uses SSH: publickey denied). Using F's sqlite method: `git -c credential.helper='!gh auth git-credential' fetch https://github.com/metabase/metabase.git lucene-semantic-search:refs/remotes/origin/lucene-semantic-search` → `917611d56a49…`. Then `git worktree add --detach /Users/krever/Projects/metabase/.claude/worktrees/lucene-paolo 917611d56a49…`: HEAD verified, `git status` clean, `lucene/query.clj` present. Told A and F; branches.md plan step 1 marked done.
- **Why me**: lucene is top priority, A was blocked, and it's the same non-destructive step F approved for sqlite (a remote-tracking ref + a sibling detached worktree; no branch, the shared worktree untouched).

## 2026-09-23 19:03 UTC — Review of A's --lucene diff
- **What**: reviewed `pipeline.ts` (guards, env, boot proof, readiness, labels, BL-42 wiring) and `run.ts` (live-vector-arm count and verdict). It matches the plan. **Must**: `notes.appDb = "h2"` (F's decision) isn't recorded. **Shoulds**: a keyword-arm failure is silent (WARN at `query.clj:154-156` → vector-only answers labelled hybrid), so scan the log for it; BL-42 `share = null` passes (treat it as a failure for lucene); log embed-skip counts. Sent to A.
- **State**: the smoke instance `golden_all_minilm_lucene_190214de81` is booting (no harness_run yet at 19:03).

## 2026-09-23 19:10 UTC — A's lucene review fixes confirmed; first smoke failed at boot
- A's first smoke (job 190213-eb98) died at boot: UnknownHostException for repo1.maven.org while resolving lucene-core. A pre-fetched deps (`clojure -P -M:run:drivers:ee` in lucene-paolo). The retry is queued after ABA-4.
- Spot-checked the fixes: `appDb: "h2"` (pipeline.ts:754), `failLogPatterns` "Keyword arm of semantic search failed" (pipeline.ts:774, run.ts:235), `share === null` fails (run.ts:244), `countLogPatterns` for embed skips (pipeline.ts:777). Root typecheck clean.

## 2026-09-23 ~19:14 UTC — 10k store-vs-store overlap gate (F's request)
- **Ran**: `node branchwatch/overlap.ts 20260923-185610-54a159 sqlite-vec1-pure <A> semantic-vector` for A3 `184533-8c5914` and A4 `190845-9f9e5b`. Both **0.604** (338/560), 31/52 < 1.0 → **gate FAIL**. Control A3 vs A4 = 1.000 (449/449).
- **Analysis**: all 31 diffs are 10/10 (cut at the limit). Diffs are systematic by type: sqlite = collections/tables/datasets, pgvector = dashboards/metrics/segments, i.e. pgvector's `:model` scorer order plus its other in-store scorers (the scorer gap). Result counts are equal in every scenario (44 both = 10, 8 both < 10, 0 mixed); the 8 untruncated ones match exactly (5 empty; concept-07/para-01/exact-05 with 1/2/6 items).
- **Verdict sent to F**: gate not passed, sets unverified; no evidence of a store bug. Proposed a large-limit probe pair (limit 1000) to compare full candidate sets. A's "same exact results" doesn't hold at top 10.

## 2026-09-23 19:18 UTC — Lucene smoke run 1 verified
- **Run** `20260923-191515-da3f42`. `branchwatch/lucene-sanity.sh`: everything passes (guard 280/0, live vector arm 250/250, 0 errors, 0 leaks, min score 4.11, boot line, 0 lock/fallback/keyword-arm/embed-skip lines, no hs_err, index under the instance plugins dir). The only overlapping `harness_job` is its own, so latency is clean.
- **Quality** (paired n = 52): vs semantic nDCG −0.021 ± 0.019, MRR −0.060 ± 0.047 (both significant), recall −0.001 ± 0.012. Per tag the deficit sits in exact-name (−0.056) and ambiguous (−0.092, n = 4). vs sqlite-vec1: overlap 0.978, nDCG −0.002 ± 0.022, so Lucene's H2 keyword arm barely matters here.
- Written up in branches.md; F and A told.

## 2026-09-23 19:20 UTC — Scorer hypothesis refuted (F's test, J re-computed)
- F used the golden `semantic-vector` run `20260923-180253-b809c0` (keyword arm off, read back). I recomputed the paired nDCG@10 (n = 52): semantic-vector − sqlite-vec1-pure 12/28/12, −0.002 ± 0.032; semantic-vector − lucene 14/27/11, −0.004 ± 0.030; semantic − semantic-vector 7/42/3, +0.025 ± 0.023. It matches F's numbers. pgvector's lead is its Postgres tsvector keyword arm, not its scorers. Recorded in branches.md (lucene smoke reading); BL-43 is the fair lucene test.

## 2026-09-23 19:30 UTC — Worktree for K's demo instance (Riley's duplicates branch)
- **What**: at K's request (K says F approved): HTTPS fetch (gh credential helper) of `hackathon-2026-semantic-duplicates` → `5d4df152771e…` (Riley Thompson, 19:03 UTC); `git worktree add --detach /Users/krever/Projects/metabase/.claude/worktrees/riley-duplicates 5d4df152771e…`. HEAD verified, 0 changes, `git describe` = `embedding-sdk-0.64.0-alpha.4-97-g5d4df152771`. No branch created.
- **vec1**: Riley's branch is stacked on Libor's `571a489e13` (22 ahead, 0 behind), and `git diff --quiet` shows the vec1 build scripts, `native/vec1` and the sqlite store code identical, so K may copy Libor's dylib (sha256 `44d210b3…d7950`) instead of rebuilding.
- **Not reviewed**: Riley's 22 commits (out of scope; told K the LIMITATION_001 rule still applies).

## 2026-09-23 19:41 UTC — Full-set overlap gate: PASSED (1.000)
- A's large-limit probes (scale-10000, minilm, limit 1000, 1 iteration, publishable=false): pgvector `--vector-only` `20260923-192801-990967` vs sqlite-vec1-pure `20260923-193557-9dff53`. `overlap.ts`: **Jaccard 1.000, 26,648/26,648 items, 0 scenarios < 1.0**, 0 name fallbacks/collisions. Result counts identical (mean 512.5, 10 capped at 1000, 5 empty on both sides).
- So the 0.604 top-10 was ranking only. Recorded in branches.md (BL-35 pairing). Also recorded F/A's report of the lucene-pure 249/250 readiness hang (A investigating; not verified by me).

## 2026-09-23 19:50 UTC — Lucene 249/250 root-caused: an init! race (for Paolo)
- **What**: read a **copy** of A's kept, stopped instance H2 (`golden_all_minilm_lucene_pure_1921357b59/app.db.mv.db` → scratchpad `h2copy/`) with `java -cp ~/.m2/…/h2-2.1.214.jar org.h2.tools.Shell`. Active appdb index 250 vs `semantic_search_embedding` 249; missing = `collection 1 "Trash"` only.
- **Timeline** (DB created_at + metabase.log): Trash 15:22:20 (migration); embedding row 1 = the admin's personal collection at 15:22:32 (event update!, Lucene index opened 15:22:32.485); `SearchIndexInit` "Initializing search indexes" 15:22:55. `lucene/core.clj:60` only populates an empty space, so init! skipped and Trash waits for the hourly repair.
- **Written up**: branches.md lucene risk 6 + question 6 for Paolo. F and A told, with the harness options (force-reindex preferred; F decides).
- **Not verified**: that force-reindex fixes it on a live instance (inferred from `init!` with `:force-reset?`, `lucene/core.clj:52-61`).
- 19:52 UTC — F chose force-reindex for lucene retries (recorded in notes by A); the init! fix went to Voytek as Paolo question 6. branches.md updated.

## 2026-09-23 20:00 UTC — Voytek: pull Riley; deck?; Stats corpus?
- **Riley**: moved `riley-duplicates` 5d4df15277 → **d0c7bb95e9** (1 commit, "color clustering", 19:51 UTC) after checking nothing ran from it (no JVM cwd there; :3050/:3051 not listening). HTTPS fetch + `checkout --detach`; clean except the untracked `resources/vec1/` (dylib sha 44d210b3… intact). No vec1/sqlite/deps/migrations/package.json changes. F and K told.
- **Deck**: K's reveal.js deck at `hackathon/deck/` (17 slides, speaker notes, offline-capable); served on :8077 (`python3 -m http.server 8077 -d hackathon/deck`, already listening). 3 `{{TBD}}` placeholders remain (Stats row + result, Mike's part).
- **Stats (B's stats-real-v1)**: hold 192216-a9c2 is stuck at 22,156/22,215 (99.7%) since 19:54. 59 docs with long texts fail in Ollama with 500 (142 errors; lengths 849–3,190), and the DLQ retries them forever. Reported to F (not touching B's instance).
- 20:12 UTC — Correction (A): force-reindex is a no-op for semantic (reindex! no-op); the lucene retry used re-init (init! :force-reset? true). Retry 20260923-200842-0f90cf verified 250/250. branches.md fixed.

## 2026-09-23 20:17 UTC — Riley :3050 demo up (Voytek's ask; F assigned it to me)
- **Build**: `bun install && bun run build` in riley-duplicates @ d0c7bb95e9 (20:02:51–20:04:16 UTC, exit 0). A's hold 200403-08fe covered build + boot; released 20:15.
- **First boot on sqlite** (K's launch.sh as-is): READY, corpus loaded (load-northwind.sh wasn't executable, so I ran it via bash and then chmod +x). The backfill failed: "SQLite semantic index has not caught up" (expected 184 = 109 corpus + 75 Usage-analytics cards; the store has 109 cards). `/projection` is pgvector-only. So I switched to pgvector: launch.sh gets `DEMO_STORE` (default pgvector, DB `mb_demo_<which>_vec`, reset on a token retry); the loader follows it.
- **pgvector + minilm**: 250/250, backfill 184/184, **0 pairs**. Stored-vector sims: Revenue vs Copy of Revenue 0.849, Revenue (old) vs Copy 0.861 (threshold 0.83), but the backfill's re-embedded query scores lower.
- **pgvector + arctic2** (same app DB, restarted): 250/250, backfill succeeded 184/184, **4 cross-lingual pairs**; projection 109 points at 1024 dims; UI routes 200.
- **DEMO.md** written (`hackathon/deck/DEMO.md`); H appends Stats. F, H told. Riley's code and threshold untouched.
- **Not verified**: the UI in a browser (only HTTP 200 on the SPA routes + API results); the sidebar Duplicates card.

## 2026-09-23 20:24 UTC — Riley demo: EE frontend rebuild (Voytek: "monitor needs pro")
- **Cause**: my first build ran without `MB_EDITION=ee` (`rspack.main.config.js:45`), so it was the OSS frontend and Monitor showed the upsell. The token was fine: `semantic_search` is on, and that's the gate in `monitor/related-questions/index.ts:7`.
- **Fix**: `MB_EDITION=ee bun run build:js` (20:21:33–20:21:54, exit 0); `index.html` → `app-main.9fc08a935348a909.js` (it contains the related-questions backfill call). Restarted :3050 (same app DB and pgvector DB): 250/250, 4 pairs intact, CPU idle (~1%). DEMO.md start section now says EE.
- **Queue**: my running JVM (~140% CPU after boot) collided with A's latency job at 20:21; A stopped it (no run written) and gave me hold 202222-6ddd, now released. **Not verified**: the Monitor UI in a browser (I don't type passwords into browsers); only the served bundle.

## 2026-09-23 20:32 UTC — Riley demo seeded (Voytek: a cluster for the map + a question with duplicates)
- `hackathon/deck/demo/seed-riley-demo.py` (new, idempotent): collection 22 "Demo: map + duplicates" with 10 MBQL questions on fct_shipments/fct_subscriptions. The first backfill ran too early (the status total_est is memoised 5 min → 250/250); waited for indexed ≥ 260; one "has not caught up" failure, then succeeded: **194 questions, 12 pairs**. MRR by plan has all 3 duplicates (6 pairs); shipping gives 2 pairs; the 4 cross-lingual pairs remain.
- Map check from /projection (119 points): shipping cluster mean cos 0.646 (min 0.477) vs all-pairs 0.399; every shipping question's top-3 NN are in the group. DEMO.md updated (seed section, click path). Not verified in a browser.

## 2026-09-23 20:45 UTC — Riley map: clusters made visible (Voytek)
- **Diagnosis**: replayed Riley's EmbeddingMapPage (umap-js from the riley worktree, seed 42, nNeighbors = clamp(n/10, 5, 15), minDist 0.1, cosine; DBSCAN eps = 4 × median NN, minPts 3) on the live /projection: 119 points → **1 cluster**.
- **Design offline**: embedded 18 candidate questions (3 topics) through Ollama arctic2 in the index's `[card]\nname:\ndescription:` form. Replay: demo 10 + 18 → 5 clean clusters; + the 8 cross-lingual → 5 clusters (the cross-lingual ones merge with ads).
- **Applied** with `hackathon/deck/demo/focus-riley-map.py --apply` (new; `--restore` undoes it): 18 questions created; 101 corpus questions archived (ids in riley-duplicates/local/demo-northwind-pg/archived.json). Live: /projection 36 points → replay 5 clusters (14/6/6/6/4). Backfill 111 questions, 15 pairs. DEMO.md updated.
- **Not verified**: the rendered map in a browser (the replay uses `fit`, the page uses `fitAsync`, with the same seed and params).
