# Engine branches: status and integration

Living page, owned by Agent J (branch watch). Every verdict is pinned to a commit and cites `file:line` on that commit.
Read-only on GitHub: nothing here was pushed, commented or checked out into the shared worktree.

**Goal**: a comparison we can demo, with pgvector `semantic`, sqlite-vec1 and lucene on the golden set and the scale
tiers, from real pipeline runs.

| Engine | Owner | Branch | Pinned sha | Status | Distance to goal |
|---|---|---|---|---|---|
| sqlite-vec1 | Libor | `hackathon-2026-sqlite-vec1` | `571a489e13` (2026-09-23 15:49 UTC) | **run 1 done** (golden × minilm, as-is + pure): no proven quality difference from pgvector semantic | scale tiers (A, queued), arctic (step 3), BL-35 pairing, re-run when hybrid lands |
| lucene | Paolo | `lucene-semantic-search` | `917611d56a` (2026-09-23 18:36 UTC) | **smoke run 1 done** (golden × minilm, H2): MRR −0.060 ± 0.047 against pgvector (significant); ≈ sqlite-vec1 | A: `--lucene` flag + a live-vector-arm check; runs after ~19:05 UTC |

---

## sqlite-vec1 (Libor)

_Last checked: 2026-09-23 21:25 UTC (J; head unchanged at `571a489e13`). Branch: 15 ahead / 13 behind master, merge base `0509e1a5e2`._

### What it is

It **isn't a separate engine**. It swaps the vector store under the existing `:search.engine/semantic` when
`MB_SEMANTIC_SEARCH_SQLITE_PATH` is set: vec1 (the SQLite project's vector extension, 0.7, a native `.dylib`), with a
flat, exhaustive, cosine index. Every write path, query path and diagnose path in `semantic_search/core.clj` forks on
`sqlite-config/enabled?`. Results still go through semantic's `results` function, which does the threshold, the appdb
top-up, the error fallback and the dedupe, unchanged.

Commits since the brief: none (the head is still `571a489e13`, "end-to-end run (PLAN_002 phase E)").

### §1 checklist

Evidence is at `571a489e13`. `sqlite.clj` = `enterprise/backend/src/metabase_enterprise/semantic_search/sqlite.clj`,
`core.clj` = `.../semantic_search/core.clj`.

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Loaded at startup | **met** | Same namespace as semantic: `core.clj:14-15` requires `sqlite` / `sqlite-config` |
| 2 | Named engine, enabled at boot | **met, as `semantic`** | No new keyword. `supported?` becomes true with only the env var + an embedder (`core.clj:57-59`). Turn it on with `MB_SEARCH_ENGINE=semantic` (already in the pipeline) |
| 3 | Filters collection permissions | **met** | `sqlite.clj:730-731`: `semantic.index/filter-read-permitted` + `apply-collection-id-filter`, the same functions pgvector uses (made public in `index.clj`). **Not yet shown at run time**: `empty-04` must come back with 0 leaks |
| 4 | Carries the fields the post-checks need | **met (by design)** | Returns the ingestion document's `legacy_input` verbatim (`sqlite.clj:371`, `708`), as pgvector does |
| 5 | Emits `:all-scores` | **met** | `sqlite.clj:705-710`: `:rrf` (from the vector rank only) and `:semantic-distance`, plus the appdb scorers (`sqlite.clj:733`). Scores won't be 0 |
| 6 | Honours the search-context filters | **partial, OK for our runs** | In the KNN: `models`, `archived?`, `verified`, `created-by`, `table-db-id` (`sqlite.clj:676-684`). After it: `ids`, `display-type` (`690-699`). **Ignored**: `last-edited-by`, `created-at`, `last-edited-at`, `curated?`, `filter-items-in-personal-collection` (`686-688`). The harness sends only `models` (`runner/src/adapter.ts:137`), so no scenario is affected |
| 7 | Index storage per instance | **met** | Path comes from the env var (`sqlite_config.clj:9-12`). The pipeline must pass a path inside the instance dir |
| 8 | Cosine cutoff, vector arms only | **met with the env var** | Default max distance is **0.8** (`sqlite_config.clj:19-29`), which Libor says isn't intentional: use 0.7. The harness always sets `MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE=0.7`. It is a vector-only engine, so the cutoff applies to everything it returns |
| 9 | Says whether it backfills | **met, same as semantic** | Same `results` path: appdb top-up below `semantic-search-min-results-threshold` (`core.clj:106-144`). `--pure-vector` (`MB_SEMANTIC_SEARCH_MIN_RESULTS_THRESHOLD=0`) turns it off exactly as for pgvector |
| 10 | Readiness + indexed set | **met (by harness probe)**: Libor accepts the outside `sqlite3 -readonly` read (via Voytek, 2026-09-23). Not via the API: | `/api/ee/semantic-search/status` isn't forked: it only reads pgvector (`semantic_search/api.clj:27-49`), so with this store it returns `{}`. **The pipeline's `waitForIndexing` would wait 60 min and then fail.** Workaround, no change to Libor's code: read the SQLite file from outside (see the plan below). `sqlite/stats` exists (`sqlite.clj:651-672`) but has no endpoint |
| 11 | Best-first, no early truncation | **met** | `k` = `semantic-search-results-limit` (1000), `sqlite.clj:722`; ordered by distance |

### How it plugs in

| | |
|---|---|
| Engine keyword | `semantic` (the response says `engine: semantic`). Needs its **own instance** and a **label** in the harness |
| Env vars | `MB_SEMANTIC_SEARCH_SQLITE_PATH=<instance dir>/semantic.sqlite` (required), `MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE=0.7` (fairness), `MB_VEC1_EXTENSION_PATH` (optional; defaults to the classpath `vec1/darwin-aarch64/vec1.dylib`) |
| pgvector | Not touched while the SQLite store is enabled (`util.clj:124,136` gates it off). The pgvector DB the pipeline creates is unused |
| Native deps | vec1 0.7 C source + SQLite 3.50.3 headers, downloaded from sqlite.org and checksum-pinned (`bin/fetch-vec1.sh:17-29`). `bin/build-vec1.sh darwin-aarch64` compiles into `resources/vec1/darwin-aarch64/vec1.dylib` of **that checkout**. This laptop: arm64 with Apple clang 21 (`/Library/Developer/CommandLineTools`), so it should build. Needs network to sqlite.org. The JDBC driver is already on master (`deps.edn:185`, sqlite-jdbc 3.50.3.0) |
| Boot indexing | **Not Quartz.** Startup's `SearchIndexInit` → `init!` → `index-all-async!` in a plain future (`core.clj:209-218`, `sqlite.clj:535-547`). After that, each `update!` embeds **synchronously** on the ingestion thread (`core.clj:157-160` → `sqlite.clj:475-486`). There's no "done" signal: a failed embedding batch is logged and **skipped** (`sqlite.clj:454-461`), and nothing is retried |
| Embedding text | `content` = the ingestion doc's `:embeddable_text` (`sqlite.clj:354`). The branch lacks E's variant setting, so the pipeline refuses `--variants` (A's guard, `pipeline.ts:427`), which is correct |

### Risks to the numbers

1. **Ranking isn't comparable to pgvector `semantic` as a pure store swap.** pgvector's `query-index` is **hybrid**:
   keyword and vector arms fused by RRF (`index.clj:902-934` on master; F verified, and there is no toggle). This store ranks by **vector only**
   (`sqlite.clj:705`, "no keyword rank"). Even `semantic-pure` against `sqlite-vec1-pure` still differs by pgvector's
   keyword arm. The dashboard must say "different engine", not "different store". Hybrid is Libor's iteration 2
   (`PLAN_002_engine.md:14-15`).
2. **The cutoff differs unless we set it** (0.8 against 0.7). Run with 0.7, and record the value on the run.
3. **A native crash takes the JVM down** (LIMITATION_001). Every write path follows the doc's rules: replace = delete +
   insert (`sqlite.clj:437-442`, `496-499`); reads never project `distance` outside a KNN (`sqlite.clj:399-402`, `648-649`).
   The harness's own write paths are safe: corpus apply and I's description writes go through `update!` →
   delete + insert, and E's variant re-init is refused on this branch. **Residual risk**: a vec1 bug the doc doesn't
   know about. The pipeline already detects a JVM exit during boot; mid-run it shows up as HTTP errors, and the
   run is failed, not published.
4. **Silent partial index.** Skipped batches leave the index short with no error. The readiness check must compare
   counts, not just wait until they stop changing.
5. **Latency isn't like-for-like either.** Embedding at index time is synchronous here, but that doesn't affect
   query latency. Query latency = Ollama embed + exact flat KNN, the same class as pgvector with our `brute-force`
   strategy, so the comparison is fair.
6. **Branch is 13 behind master.** A run records the branch sha (`--repo`). Merging with E's uncommitted change:
   **no file overlap** (E: `src/metabase/search/ingestion.clj`, `settings.clj`, and its test; Libor: `.clj-kondo/config.edn`,
   EE `semantic_search/{core,index,util}.clj`, new files). I checked only which files change, not a real merge,
   because `git fetch` can't reach the branch here.

### Integration plan (v2, F's decisions; **agreed with A 2026-09-23 ~16:50 UTC**)

1. **Checkout (done)**: a detached git worktree at the pinned sha, sibling of ours:
   `/Users/krever/Projects/metabase/.claude/worktrees/sqlite-vec1-libor` @ `571a489e13814e5599258a4ed74cdda5bacd98b9`
   (`git describe` = `embedding-sdk-0.64.0-alpha.4-75-g571a489e138`, clean). The ref came in via an HTTPS fetch with gh
   credentials (F). No branch was created, and the shared worktree is untouched. To move on:
   fetch the same way, then `git -C <that worktree> checkout --detach <sha>`, and record it here.
2. **Build vec1** in that worktree, **in a gap A gives us** (not during latency runs):
   `./bin/fetch-vec1.sh && ./bin/build-vec1.sh darwin-aarch64` → `resources/vec1/darwin-aarch64/vec1.dylib`.
   **Done 2026-09-23 16:47:53–16:48:03 UTC** (A said go. It overlapped only the arctic SQL control's apply + initial indexing; that run's timed queries started at 16:49:08 UTC, so no latency was affected, per A): exit 0, vec1 0.7 +
   SQLite 3500300 headers (checksums verified by the script), `vec1.dylib` Mach-O arm64, 154,392 bytes,
   sha256 `44d210b33f39036887d5025f5e2e965a09c7c28a7dd0aa93561d6cf7605d7950`. It's untracked (`?? resources/vec1/`),
   so `git describe --dirty` stays clean.
3. **Pipeline flag** (A implements): `--sqlite-vec1`, with `--repo <worktree above>`:
   - env `MB_SEMANTIC_SEARCH_SQLITE_PATH=<instance dir>/semantic.sqlite`
   - env `MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE=0.7` by default (fairness rule). `--sqlite-max-distance 0.8` for the
     one as-shipped run
   - labels (A's decision): `semantic` → `sqlite-vec1`; with `--pure-vector` → `sqlite-vec1-pure`; any distance ≠ 0.7
     appends it, e.g. `sqlite-vec1@0.8`, so it can't pool with the 0.7 runs
   - notes: `sqliteMaxDistance`, vec1 dylib sha256, `readiness: "sqlite3 file probe (unverified)"`
   - skip the pgvector DB and `variantContentGate` (record `"n/a: sqlite store"`); `--variants` stays refused
4. **Readiness (BL-09), first cut, marked unverified**: poll
   `sqlite3 -readonly <file> "select (select count(*) from search_doc), (select count(*) from search_vec_base)"`.
   **A's decision, amended after Libor's answer 3**: a failed batch drops docs *and* vectors together, so equal,
   stable counts can mean "done with a hole". Ready = docs = vectors **and every manifest entity is in `search_doc`**
   (poll the `sqlite` probe set, not only the counts), stable for 2 polls 5 s apart. Timeout → fail with the list of
   missing entities (a silent drop fails the run, it doesn't publish a thin index). Preflight's corpus check then
   re-asserts the same thing. Extra docs
   (Metabase built-ins) are recorded, as with pgvector. **Probe proven on a real vec1 store (J, 16:5x UTC)**, a
   throwaway store with Libor's DDL shape, written through the built dylib from Homebrew Python (SQLite 3.53) in WAL
   mode, and read with `/usr/bin/sqlite3 -readonly` while the writer was open: 50|50, then 100|100 correct;
   an uncommitted doc invisible; a committed doc without a vector → 51|50 (a mismatch, so readiness holds off);
   10 delete+insert replacements keep 100|100; the corpus query returns `card|1…`. Touching `search_vec` from the CLI
   gives a clean `no such module: vec1` (exit 1), not a crash. Shadow tables: `search_vec_{config,base,idx,idx_idx,model,meta}`.
   **Proven on a JVM-written store** (A's smoke, scratch results DB, run `20260923-172107-9ace74`): `/usr/bin/sqlite3`
   read 250 = 250 from the store Metabase wrote with sqlite-jdbc 3.50.3; F accepted it as BL-09 proof. A long run is
   still to come (run 1). Script: appendix
   "BL-09 probe proof" at the end of this page. Both are ordinary tables
   (`search_vec_base` = vec1's shadow table, counted by `sqlite/stats`, `sqlite.clj:664`). **Never** touch `search_vec`
   from the probe. Timeout → fail the run with the last counts.
5. **Corpus probe (#10)**: probe kind `sqlite` → `SELECT model, model_id FROM search_doc`. Within a run every engine
   is on one instance, so §5 rule 1 works as usual. Across instances, per-model counts against the pgvector run on
   the same corpus and embedder go into the notes.
6. **Run matrix**, one at a time, never alongside a build or another pipeline:
   1. golden × minilm @0.7: as-is, then pure (**first look**)
   2. ~~golden × minilm @0.8 as-shipped~~ dropped (Libor: 0.8 unintended)
   3. golden × arctic @0.7: as-is, then pure
   4. scale-1000 × minilm, then scale-10000 × minilm (latency; as-is)
   5. arctic scale tiers, if time allows
   6. **When hybrid (iteration 2) lands**: re-run 1 and 3 at the new sha (`notes.engineSha`)
   7. **The fair store pairing, once BL-35 lands** (Voytek approved 2026-09-23: an opt-in setting that turns off pgvector's
      keyword arm): `semantic-vector` (keyword arm off + top-up off) against `sqlite-vec1-pure`, golden × {minilm, arctic}
      on the same corpus and embedder. See "The BL-35 pairing" below for what it does and doesn't equalise.
7. **First-run sanity checks** (J verifies): `empty-04` leaks = 0; 0 errors; indexed = corpus count; results not
   identical to pgvector `semantic` (they shouldn't be, given risk 1); scores ≠ 0; no `hs_err_pid*.log` in the
   instance dir.

### Diff-review checklist for A's `--sqlite-vec1` change (J, prepared 2026-09-23 ~17:00 UTC)

I go through this against A's diff before F verifies. **Must** items block run 1.

**Wrong-engine guards (must)**. Verified: the response's `engine` is the requested one even on fallback
(`src/metabase/search/impl.clj:506` takes it from the search context).
- [ ] `--sqlite-vec1` requires `--repo`, and refuses a repo without the store: `enterprise/backend/src/metabase_enterprise/semantic_search/sqlite.clj`
      **and** `resources/vec1/darwin-aarch64/vec1.dylib` must exist. Otherwise the env var does nothing, semantic runs on a
      missing pgvector, and the rows get the label `sqlite-vec1`.
- [ ] **Silent-fallback guard.** When the store throws, semantic's `results` catches it and answers with appdb
      (`core.clj:145-151`), and the response still says `engine: semantic`, so the adapter's engine check
      (`adapter.ts:143`) passes. Needed: after the run, `metabase.log` contains 0 `Error executing semantic search` lines,
      **or** every non-top-up result carries a `semantic-distance` contribution > 0. A violation fails the run
      (unpublishable), not just a note.
- [ ] Boot proof: `metabase.log` has `Opened SQLite semantic search store at <dir>/semantic.sqlite`, and the path
      matches the env var.
- [ ] No `MB_PGVECTOR_DB_URL` in the env (the pipeline also creates no pgvector DB), so nothing can quietly use
      pgvector. `dropDatabases` gets only the warehouse DB (it's `IF EXISTS` anyway).

**Fairness (must)**
- [ ] `MB_SEMANTIC_SEARCH_SQLITE_MAX_DISTANCE` is always set explicitly (0.7 default), never left to the branch's
      0.8. `notes.sqliteMaxDistance` records it. Also `notes.engineSha` (= `git -C <repo> rev-parse HEAD`) for the
      pre/post-hybrid re-runs.
- [ ] Same embedder: the store's `meta` table (`sqlite3 -readonly … "select k, v from meta"`, an ordinary table) has
      `model_name` = `--embed-model` and `vector_dimensions` = the derived dims. Recorded, and a mismatch fails.
- [ ] `--pure-vector` still sets `MB_SEMANTIC_SEARCH_MIN_RESULTS_THRESHOLD=0`, and `semanticMinResultsThreshold` is
      recorded as for pgvector.
- [ ] `--variants` other than baseline is still refused (the branch lacks E's setting).

**Labels (must)**
- [ ] `engineLabels.semantic`: `sqlite-vec1`; `sqlite-vec1-pure` with `--pure-vector`; for d ≠ 0.7 the distance goes
      in the label (`sqlite-vec1@0.8`, `sqlite-vec1-pure@0.8`). Deterministic formatting (`0.8`, not `0.80`).
- [ ] Every label that can be produced is in `shared/types.ts` `ENGINES`, or A has checked that the dashboard's
      `engineOrder` (`array_position`, `dashboard-cards.ts:195`) and the cards handle an unknown label (NULL sorts
      last). `isVectorEngine` treats them as vector (it does: not in `KEYWORD_ENGINES`).
- [ ] The instance name/dir includes a sqlite marker (e.g. `_sqlite`), so dirs, the log and a leftover file are
      identifiable, and it stays under the 63-char identifier limit (`pipeline.ts:345`).

**Readiness + probe (must)**
- [ ] The readiness poll uses exactly `/usr/bin/sqlite3 -readonly <file> "select (select count(*) from search_doc), (select count(*) from search_vec_base)"`.
      It **never** names `search_vec`. A missing file (not created yet) → keep polling, not crash. Ready = docs = vectors
      > 0 **and the manifest set ⊆ `search_doc` (model, model_id)**, unchanged for 2 polls 5 s apart. Timeout fails and
      lists the missing entities. Counts alone can't see a dropped batch (Libor answer 3).
- [ ] Probe kind `sqlite` in `config.ts` `CorpusProbe` and `probeCorpus` (`preflight.ts:29`): `select model, model_id from search_doc`,
      parsed safely (split on `|`, and names can't contain `|` because only model/model_id are selected); the path comes from
      the pipeline, not user text. The preflight corpus check requires every manifest entity; extras are recorded.
- [ ] `variantContentGate` is skipped and `embeddingTextCheck` = `"n/a: sqlite store"`.
- [ ] `notes.readiness = "sqlite counts (unverified)"` until the first run proves it; then J/F flip the wording.

**Provenance (should)**
- [ ] `notes`: vec1 dylib path + sha256 (expected `44d210b3…d7950`), the `--repo` `git describe` (clean), the branch sha
      `571a489e1381…`, the sqlite file size at the end of the run.
- [ ] Crash visibility: when the JVM exits mid-run, the pipeline fails the run and says to look for
      `hs_err_pid*.log` in the repo/instance dir.
- [ ] `npm run typecheck` = 0; the existing pgvector path (no `--sqlite-vec1`) is unchanged. A dry run of the
      argument parsing, or a golden appdb-only smoke test on a scratch results DB, as A did for text_strategy.

### The BL-35 pairing: what it equalises and what it doesn't (J, 2026-09-23 ~17:12 UTC)

With BL-35's keyword arm off, both sides retrieve **vector-only, with exact (brute-force / flat) cosine KNN, the same
embeddings, the 0.7 cutoff and no top-up**. So:

- **Candidate sets should be identical.** For each scenario, the *set* of returned `(model, id)` within the cutoff should
  match exactly between `semantic-vector` and `sqlite-vec1-pure`, up to float ties at the boundary. That's a strong
  correctness test of the store. Any systematic difference points to different embedding text, different doc sets
  (filters) or a store bug. Embedding text is checked: both store `:embeddable_text` (sqlite `sqlite.clj:354`,
  pgvector `index.clj:172`). The search code between Libor's merge base `0509e1a5e2` and our HEAD `188c8f412f7`
  changes only `search/config.clj` (`exploration` excluded; model order, used by pgvector's `:model` scorer only),
  `spec.clj` (a transforms lookup) and an `api.clj` scope annotation: nothing that changes the embedded text. E's
  uncommitted variant change is byte-identical at `baseline` (E's claim, not re-checked by J).
  **HARD GATE (F, 2026-09-23)**: no quality number from this pairing is published until the per-scenario overlap has
  been computed and reported. Tool: `node branchwatch/overlap.ts <run_a> <eng_a> <run_b> <eng_b> [--manifest-a p]
  [--manifest-b p]`. It compares top-10 sets from `returned` (last error-free iteration). Items are keyed by corpus
  **ref**, via each run's instance manifest (`local/pipeline/<notes.instance>/manifest.json`, found automatically),
  because ids differ between instances and names can repeat. Items outside the manifest fall back to model + name,
  and it reports the number of fallbacks and name collisions (F's requirement). Output: Jaccard per scenario with the
  items only in A / only in B, the total, and the gate line. Validated (J, ~17:18 UTC):
  - a run against itself → 1.000
  - `semantic` 154430-7f2163 against `semantic-pure` 154059-044bd9 (separate instances, manifests passed explicitly
    because those runs predate `notes.instance`) → **0.997**, 0 fallbacks; the only difference is xling-04,
    onlyA=`card/ja-return-rate` (a top-up row)
  - `context-sql` 164504-a41556 against `context` 164625-8dcef1 (same instance, manifest found automatically) → 0.511,
    FAIL, as it should: different embedding text Proposed pass bar: total ≥ 0.95, and every
  scenario < 1.0 explained (ties at the 0.7 cutoff, or rank 10/11 ties). Anything systematic goes to F as a
  possible store bug for Libor. Note that ranking differs (next bullet), so two identical *sets* can still be cut
  differently at top 10. Where overlap < 1 because of that, a probe run with a larger `limit` settles it.
- **GATE RESULT (J, 2026-09-23 19:41 UTC): PASSED, identical candidate sets.**
  - 10k top-10 comparison (sqlite-vec1-pure `185610-54a159` against semantic-vector `184533-8c5914` and `190845-9f9e5b`):
    0.604. Every difference was cut at the limit, and they're systematic by type, i.e. ranking. The pgvector control run
    against itself was 1.000.
  - The large-limit probes settle it: pgvector `--vector-only` `20260923-192801-990967` against sqlite-vec1-pure
    `20260923-193557-9dff53` (scale-10000, minilm, `limit 1000`, 1 iteration, `publishable=false`). **Jaccard 1.000,
    26,648 / 26,648 items, all 52 scenarios**, keyed by ref with 0 name fallbacks.
  - Identical shapes on both sides: the same mean 512.5 results per query, the same 10 queries capped at 1000, the same
    5 empty. Even the capped sets match, because both take the 1000 nearest by exact KNN before re-ranking.
  - **Conclusion**: on the same embeddings, the sqlite vec1 flat index and pgvector brute-force return exactly the same
    items. Every quality or order difference between them comes from ranking (scorers), not the store.
- **Ranking is still not equal.** pgvector adds 10 in-store scorers on top of rrf + semantic-distance
  (`scoring.clj:83-113`: view-count, pinned, recency, dashboard, model, mine, **exact**, **prefix**, library, data-layer).
  sqlite-vec1 has only rrf + semantic-distance + the appdb scorers bookmarked and user-recency (`sqlite.clj:705-710`,
  `733`; `appdb_scoring.clj:8-14`). `exact`/`prefix` (name matches) matter most. So nDCG/MRR differences in this
  pairing are **scorer set**, not store. Libor's plan defers the pgvector scorers to iteration 2
  (`PLAN_002_engine.md:14-15`).
- **Latency is like-for-like**: same embedder call; exact KNN in both, pgvector `brute-force` against vec1 flat.

### Run 1: golden × all-minilm @0.7 (verified by J, 2026-09-23 17:40 UTC; F verified the quality numbers)

Runs: **`20260923-173209-5c468e`** (`sqlite-vec1`, as-is) and **`20260923-173138-6fd341`** (`sqlite-vec1-pure`). Both are
at engine sha `571a489e1381…`, cutoff 0.7, vec1 dylib `44d210b3…`. Compared with the pgvector runs on the same corpus and
embedder: `semantic` `20260923-154430-7f2163` and `semantic-pure` `20260923-154059-044bd9`.

**Sanity checks (all pass)**

| Check | Result |
|---|---|
| Finished, publishable | both `finished_at` set; `fallbackGuard` vector-only, 280 responses, 0 violations, 0 log lines (pure: all rows > 0) |
| Errors | 0 of 840 observations per run |
| Permission leak, `empty-04` | 0 for every engine in both runs |
| Indexed set = corpus | readiness 250 docs = 250 vectors, all 235 manifest entities + 15 built-ins (A's log) |
| Scores ≠ 0 | min 7.29 (as-is), 10.0 (pure); 0 zero-score rows |
| Not identical to pgvector | top-10 overlap with `semantic` = **0.814** Jaccard (19/56 scenarios differ); pure against pure 0.811 |
| JVM-written store read by `/usr/bin/sqlite3` | consistent on every poll (A); BL-09 proven |
| Native crash | no `hs_err_pid*.log` |

**Quality** (n = 52 answerable scenarios, paired per scenario, 95% CI):

| | sqlite-vec1 | semantic (pgvector, hybrid) | Δ |
|---|---|---|---|
| nDCG@10 | 0.581 | 0.601 | **−0.019 ± 0.031** |
| MRR | 0.676 | 0.728 | −0.052 ± 0.056 |
| recall@10 | 0.597 | 0.595 | +0.001 ± 0.009 |
| zero-result rate / false-positive rate | 0.058 / 0.250 | 0.058 / 0.250 | same |

The pure pair (sqlite-vec1-pure against semantic-pure) is the same within 0.001 (nDCG −0.020 ± 0.030). **No proven
difference on golden.** It finds the same things (recall is equal) and ranks them a little differently (MRR −0.05,
not significant).

**Why the lists differ** (from `branchwatch/overlap.ts`): sqlite-vec1 surfaces **collections** (sales, wholesale,
logistics, …) where pgvector ranks **metrics, dashboards and documents**. That's pgvector's `:model` scorer (type order)
and its other in-store scorers, which sqlite-vec1 lacks. Several pgvector-only hits are **documents** found through
their body text, which only pgvector's keyword arm can do (documents embed their name only). Both are the known
scorer and hybrid gaps, not a store bug. The ≥ 0.95 overlap gate applies to the BL-35 pairing, not to this one.

**Latency** (p50 / p95 ms, whole `/api/search` round trip, including the Ollama query embedding):

| | sqlite-vec1 | pgvector |
|---|---|---|
| as-is | 28.6 / 44.1 | semantic 34.4 / 49.6 |
| pure | 18.7 / 30.6 ⚠ | semantic-pure 26.3 / 43.3 |

⚠ **The pure run's latency isn't clean.** A booted both instances concurrently. The as-is instance applied its corpus
(17:31:47–17:31:53 UTC) and embedded it through the shared Ollama **during the pure run's timed window**
(17:31:38–17:32:09). The as-is run's window (17:32:09–17:32:44) overlaps only the pure JVM shutting down. Quality is
unaffected. Recommendation: re-time the pure run on its own before using its latency. **Handled
structurally (A, 17:45 UTC)**: `harness_job` records both jobs' whole windows (17:30:17–17:32:47 overlaps the other job's timed
window), and BL-38 (H) derives "overlapped" from job windows, so the latency cards exclude **both** run-1 latencies (more
conservative than the timing above, which only proves the pure one). Whether to re-time either one solo is F's call. On golden (250 docs) both
engines are dominated by the embedding call. The scale tiers (step 4, queued as exclusive jobs) are where the
store's latency shows.

### Diff review of A's flags (J, 2026-09-23 ~17:22 UTC)

Reviewed `runner/src/{pipeline,run,preflight,config,sqlite}.ts`, `shared/types.ts`, `results/src/fixtures.ts`. Root
typecheck is clean. Every **must** above is met in code, except **one new must**: `--sqlite-max-distance` must be validated
(finite, 0 < d ≤ 2). Otherwise "abc" → NaN → the store silently uses 0.8 while the label says `@NaN`; "" → 0.
Shoulds: fail on `--sqlite-max-distance` without `--sqlite-vec1`; fix the "preflight refused" message when the
guard fails; optionally refuse `--variants` early. A's smoke (scratch results DB, run `20260923-172107-9ace74`, dropped
afterwards) meets the first-run sanity bar: `empty-04` leaks 0, 0 errors, readiness 250 = 250 (235 manifest + 15
built-ins) read by `/usr/bin/sqlite3` from the **JVM-written** store, meta minilm/384, guard 56 responses / 0
violations / 0 log lines, scores ≥ 7.3, no `hs_err`, 16/56 top-10 lists identical to pgvector `semantic`.
BL-34 mid-run test proposed: rename `search_doc` in the scratch store after readiness. Tested on J's throwaway store:
no vec1 needed for the rename, and the KNN then fails with a plain `no such table` (no native crash).

### Answers from Libor (source: Voytek, 2026-09-23 ~17:05 UTC)

1. **Cutoff**: 0.8 isn't intentional; use 0.7. The as-shipped @0.8 run is **dropped** from the matrix. The label rule
   (a distance ≠ 0.7 goes in the label) stays, in case a later commit changes the default.
2. **Reading the SQLite file from outside is fine.** The `sqlite3 -readonly` probe is the accepted readiness and
   indexed-set check (#10 → met by harness probe).
3. **Is a skipped embedding batch retried?** Libor said to work it out from the code. **Answer (J): no. It's lost until
   the next boot (or a manual force-reindex), and it's invisible to a counts-only check.**
   - On an embedding exception, `upsert-batch!` returns `{:failed n}` and writes **nothing** for the batch: no
     `search_doc` rows, no vectors (`sqlite.clj:454-461`, `write-rows!` is only reached on success). Rows with no
     usable embedding are skipped the same way (`465-466`). **So docs = vectors stays true**, and only a comparison
     with the expected set shows the hole.
   - `update!` doesn't retry; the entity comes back only if it changes again.
   - The hourly repair job (`task/index_repair.clj:47-58`, which calls `repair-index!` → `index-all!` with pruning) is
     **never scheduled** with the SQLite store. `task/init!` gates on `semantic-search-configured?`, which is false
     when `MB_SEMANTIC_SEARCH_SQLITE_PATH` is set (`util.clj:124`). The same goes for the indexer, cleanup and usage jobs.
   - `init!` at boot re-runs `index-all-async!` over every searchable document (`core.clj:209-218`), which would fill
     the hole on the next restart; the pipeline doesn't restart.
   - **Consequence for readiness**: see the amended step 4 of the plan. Readiness must wait for the **manifest set**,
     not for stable counts.
4. **Hybrid keyword ranking (iteration 2) is probably landing today.** Run 1 goes ahead now, vector-only and clearly
   labelled. J watches the branch. When iteration 2 lands: fetch, move the worktree (`checkout --detach <sha>`),
   rebuild vec1 if `bin/*vec1*` / `native/vec1` changed, and re-run with `notes.engineSha` so G can show the version.
   Tell F at once.
5. **No known macOS build gotchas.** The build already worked.

### Open questions

- **For A**: does `--repo` need `.git` (tarball checkout)? Where should expected-count for readiness come from (the
  manifest's entity count, or the count pgvector reported for the same corpus)?
- **For Libor** (via F): see the list sent to F on 2026-09-23.

---

## lucene (Paolo)

_Found 2026-09-23 ~18:43 UTC (Voytek pointed to it; my `lucene|paolo` tick hadn't flagged it, see the worklog). Last checked
21:25 UTC (head unchanged). Branch `lucene-semantic-search` (no `hackathon-` prefix), head **`917611d56a`** (2026-09-23 18:36 UTC),
10 commits by Paolo Rascuna, 10 ahead / 4 behind master, merge base `cdc7f386af`._

### What it is

Like sqlite-vec1, it **isn't a separate engine**. It swaps the store under `:search.engine/semantic`. A new internal
setting **`semantic-search-backend`** (`:lucene` | `:pgvector`) **defaults to `:lucene`** (`settings.clj`), so this branch
runs Lucene unless told otherwise. Vectors are written to a new app-DB table `semantic_search_embedding` (migration
`065/20260923_semantic_search_embedding.yaml`) and then into a per-node Lucene HNSW index
(`<plugins dir>/semantic-search/<space>`, `lucene/index.clj:57-80`). Other nodes sync from the table every 10 s
(`lucene/sync.clj:24`). Pure JVM (`org.apache.lucene/lucene-core 10.5.1` in `deps.edn`): **no native build**.

**It's hybrid**, unlike sqlite-vec1. Every query runs a Lucene kNN arm **and the OSS appdb keyword engine**, fused with
RRF using pgvector's weights: 0.49 semantic, 0.51 keyword, k = 60 (`lucene/query.clj:38-43, 160-213`).

### §1 checklist (at `917611d56a`; `q` = `lucene/query.clj`)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Loaded at startup | **met** | the semantic namespace forks on `lucene-backend?` (`core.clj`); `init.clj` +1 |
| 2 | Named engine, enabled at boot | **met, as `semantic`** | the backend setting defaults to `:lucene`; set `MB_SEMANTIC_SEARCH_BACKEND=lucene` explicitly anyway |
| 3 | Filters collection permissions | **met** | `q:263-265` `filter-read-permitted` + `apply-collection-id-filter` (shared with pgvector); the keyword arm is appdb, which filters in SQL |
| 4 | Carries the fields | **met** | returns the stored `legacy_input` (`q:171-181`), timestamps rehydrated |
| 5 | Emits `:all-scores` | **met** | `:rrf` + `:semantic-distance` (`q:191-200`) + appdb scorers (`q:266-269`). The keyword arm's own scores are dropped (`q:187`) |
| 6 | Search-context filters | **met (the most complete of the three)** | `q:82-100`: personal-collection, archived, verified, curated, models, created-by, last-edited-by, table-db-id, ids, display-type. A date filter → keyword arm only (`q:111-117, 230-232`) |
| 7 | Storage per instance | **met with the pipeline's per-instance `MB_PLUGINS_DIR`** | the index root is the plugins dir. On a lock clash it silently falls back to a private tmp dir (`index.clj:129-134`) |
| 8 | Cutoff, vector arm only | **met** | score floor 0.65 on Lucene's `(1+cos)/2` ≡ cosine distance 0.7 (`q:30-36`). The keyword arm has no cutoff |
| 9 | Backfill | **same as semantic** | the same `results` path and threshold. The top-up reuses the keyword rows already fetched (`core.clj` `keyword-results`) |
| 10 | Readiness + indexed set | **readiness met via the API; set: not observable** | `/api/ee/semantic-search/status` **is forked**: `indexed_count` = embedding-table rows, `total_est` as before (`api.clj` `lucene-status`), so the existing `waitForIndexing` works. The single node writes table then index synchronously (`lucene/core.clj:18-23`). The `(model, id)` set lives in the H2 app DB, which the JVM locks, so there's no outside probe → "corpus unverified" unless Paolo exposes one |
| 11 | Best-first, no early cut | **met** | k = `semantic-search-results-limit` (`q:258, 137`) |

### How it plugs in

| | |
|---|---|
| Engine keyword / label | `semantic` → harness label **`lucene`**; with `--pure-vector` → **`lucene-pure`** (top-up off; the keyword arm stays, like `semantic-pure`) |
| Env | `MB_SEMANTIC_SEARCH_BACKEND=lucene` (explicit), per-instance `MB_PLUGINS_DIR` (already in the pipeline), **no** `MB_PGVECTOR_DB_URL`, no pgvector DB |
| Boot proof | `metabase.log`: `Opened semantic search Lucene index at <plugins dir>/semantic-search/…` (`index.clj:189`), and **no** `Another process holds the semantic search Lucene index` |
| Readiness | existing `waitForIndexing` (status endpoint forked) |
| App DB | the migration creates `semantic_search_embedding` on the instance's **fresh per-instance H2**. It's forward-only there. Never point this branch at a shared app DB (:3002/:3003): the extra changesets would stay behind |
| Dims | max 1024 (Lucene's default codec, `index.clj:45-49`): minilm 384 and arctic2 1024 both fit |
| Retries | the hourly repair job **is** scheduled under Lucene (`task/index_repair.clj`: `available?`), and failed embeds are backfilled, unlike sqlite-vec1 |
| Variants | no E setting on this branch → `--variants` refused (correct) |
| Merge with E | no file overlap: Paolo touches `search/{core,util}.clj` and `appdb/core.clj`, E touches `ingestion.clj` and `settings.clj` (file-list check) |

### Risks to the numbers

1. **The keyword arm is the harness's app-DB engine, which is H2 here.** pgvector's keyword arm is Postgres tsvector
   (with stemming) over its own index table. Lucene's is `search.engine/results :appdb`, and on our per-instance H2
   app DB that's the H2 appdb engine: the `appdb` column, our weakest keyword engine (no stemming). **So "lucene vs
   semantic" on the harness also compares H2 keyword against Postgres keyword.** On a Postgres app DB (Paolo's design
   target: "works on every app-DB type") its keyword arm would be Postgres FTS. A fair headline needs a Postgres
   app-DB run: pipeline work for A (`MB_DB_TYPE=postgres`, a per-instance DB in the container).
   **F's decision (18:50 UTC)**: lucene run 1 goes on **H2, as-is**, labelled `lucene` with `notes.appDb = "h2"`, and every
   lucene number carries this caveat until a Postgres app-DB run exists. **BL-43** (a Postgres app-DB pipeline option)
   is logged; A judges feasibility after run 1, and F is asking Voytek whether it's worth doing.
2. **Scorer gap (as for sqlite-vec1).** Vector hits carry only rrf + semantic-distance + the appdb scorers. pgvector's
   in-store scorers (exact, prefix, model, recency, …) are absent, and the keyword arm's own scores are dropped when
   fused (`q:187`).
3. **HNSW is approximate.** pgvector (our `brute-force`) and vec1 (flat) are exact. At 250 docs that's irrelevant, but
   at 10k a recall loss is possible. `ann_recall@10` exists in the metrics but was never emitted (BL-23).
4. **Dead-vector-arm blind spot in BL-34** (→ **BL-42**, A; must be in place **before** lucene run 1 is published). If the Lucene index is empty (`q:235-238`) or the query has a date filter, the
   answer is keyword-only. Every row then has `semantic-distance` = 0 (the entry is present), so the fallback guard
   passes, and the debug log line isn't visible at INFO. **Needed**: a run-level check that nearly every non-empty
   response has at least one row with `semantic-distance` > 0. An embed failure still throws → the `results` catch →
   appdb rows without the entry → BL-34 catches it as usual.
6. **Readiness hang: a real lucene bug, root-caused (J, 2026-09-23 19:50 UTC).** lucene-pure job `191742-20f2` (instance
   `golden_all_minilm_lucene_pure_1921357b59`, kept by A) sat at 249/250 for 22 min with nothing logged as skipped.
   I read a **copy** of the stopped instance's H2 app DB offline (H2 2.1.214 shell, scratchpad):
   - Active appdb index `search_index__y1hzr8…`: 250 docs. `semantic_search_embedding`: 249 rows (one space, 0 archived).
     Missing from the embedding table: **`collection 1` "Trash"**, nothing else; nothing extra the other way.
   - Timeline:
     - **15:22:20**: migrations create Trash.
     - **15:22:32**: the pipeline's admin setup creates a personal collection. The event-driven `update!` embeds it as
       embedding **row 1** and opens the Lucene index (`metabase.log`: `Opened semantic search Lucene index` 15:22:32.485).
     - More event-driven writes follow (the Usage-analytics dashboards).
     - **15:22:55**: startup `SearchIndexInit` → "Initializing search indexes" → Lucene `init!`.
   - **Cause**: `lucene/core.clj:60` populates only when the space is empty (`(zero? (:n (space-stats space)))`). Because
     event writes got there first, `init!` skipped the initial population, so every searchable document that existed
     before and wasn't touched again afterwards (here only Trash) stays unembedded until the **hourly repair** job.
     `lucene-status` then reports `indexed_count < total_est`, and readiness waits.
   - It depends on timing (setup events against `SearchIndexInit`), so it's intermittent: the as-is run
     `191515-da3f42` reached 250/250. pgvector's `init!` gates every searchable document unconditionally, so this is
     Lucene-only. User impact: pre-existing content invisible to vector search for up to an hour after first boot.
   - **Suggested fix (Paolo's call)**: have `init!` backfill instead of skipping when rows exist, e.g. call `repair!`
     (missing-only, cheap), or populate when `n < total`.
   - Harness side: A's `waitForIndexing` now fails after 5 min without progress. **F's decision (19:52 UTC), corrected by A:
     lucene retries use re-init after apply** (`init!` with `:force-reset? true`). `force-reindex` would **not** work:
     semantic's `reindex!` is a no-op, which I'd missed. **Verified live**: the lucene-pure retry `20260923-200842-0f90cf`
     re-initialised at 20:08:21 → 250/250 at 20:08:31, guard 280/0, live vector arm 250/250, metrics identical to `da3f42`.
     The fix suggestion (`repair!` in `init!`) went to Voytek for Paolo as question 6.
5. **No vector-only arm.** There's no setting to switch the keyword arm off (it's skipped only when appdb isn't supported,
   `q:150-151`), so no `lucene-vector` against `semantic-vector` / `sqlite-vec1-pure` pairing without a change from Paolo.

### Integration plan (draft for A; F's order: after A's current latency bracket, ~19:05 UTC; quality first)

1. **Checkout (done, J, 19:02 UTC)**: HTTPS fetch with the gh credential helper →
   `refs/remotes/origin/lucene-semantic-search` = `917611d56a`, then a detached worktree
   `/Users/krever/Projects/metabase/.claude/worktrees/lucene-paolo` at `917611d56a` (clean;
   `git describe` = `embedding-sdk-0.64.0-alpha.4-81-g917611d56a4`). A's shell can't fetch (SSH publickey). No native
   build: the first boot pulls `lucene-core` from Maven.
2. **Pipeline flag** `--lucene` (A): repo guard (`…/semantic_search/lucene/query.clj` must exist); env as above; label
   `lucene` / `lucene-pure`; boot proof (log line); readiness = existing `waitForIndexing`; corpus probe none →
   "unverified"; guard = BL-34 `fallback` mode **plus** the run-level live-vector-arm check (risk 4); notes: backend,
   `appDb: "h2"`, `engineSha`, the Lucene index path from the boot line. The live-vector-arm check is BL-42.
3. **Runs, one at a time**: (1) golden × minilm as-is (quality first), then pure; (2) golden × arctic as-is and pure;
   (3) scale-1000 and scale-10000 × minilm as exclusive latency jobs; (4) if A adds a Postgres app DB: golden × minilm
   as-is on Postgres (the fair keyword-arm comparison).
4. **First-run sanity**, the same as sqlite plus: the boot line present, no "Another process holds…" line, the
   live-vector-arm share ≈ 100%.

### Smoke run 1: golden × all-minilm, as-is, app DB H2 (verified by J, 2026-09-23 19:18 UTC)

Run **`20260923-191515-da3f42`** (`lucene`, engine sha `917611d56a49…`, `notes.appDb = "h2"`), compared with pgvector
`semantic` `20260923-154430-7f2163` and sqlite-vec1 `20260923-173209-5c468e` (same corpus and embedder). Checked with
`branchwatch/lucene-sanity.sh` and `branchwatch/overlap.ts`.

**Sanity (all pass)**:
- finished;
- fallback guard 280 responses / 0 violations / 0 log lines;
- **live vector arm 250/250 = 1.00** (BL-42, required 0.95);
- 0 keyword-arm failures and 0 skipped embed batches;
- 0 errors of 840 observations;
- `empty-04` leaks 0 for every engine;
- min score 4.11, 0 zero-score rows;
- boot line present (index under `<instance>/plugins/semantic-search/emb_v1_sha256_5caea…`), 0 "Another process holds…", 0 hs_err;
- index 434 KB (A);
- latency is clean: the only job overlapping the timed window (19:15:15–19:15:47) is the run's own.

**Quality** (n = 52, paired, 95% CI):

| | lucene | semantic (pgvector) | Δ lucene − semantic | Δ lucene − sqlite-vec1 |
|---|---|---|---|---|
| nDCG@10 | 0.579 | 0.601 | **−0.021 ± 0.019** | −0.002 ± 0.022 |
| MRR | 0.668 | 0.728 | **−0.060 ± 0.047** | −0.008 ± 0.038 |
| recall@10 | 0.594 | 0.595 | −0.001 ± 0.012 | |

Per tag (nDCG, lucene − semantic): ambiguous −0.092 (n = 4), **exact-name −0.056 (n = 8)**, paraphrase −0.041 (13),
rare-token −0.020 (6), concept, cross-lingual and near-miss ≈ 0, typo +0.013 (5).

**Reading**:
- lucene finds the same items as pgvector (recall equal) but ranks the right one lower. Unlike sqlite-vec1's, this
  gap is **statistically significant** (MRR and nDCG CIs exclude 0), and it sits in exact-name and ambiguous questions.
- **lucene ≈ sqlite-vec1 on golden**: top-10 overlap **0.978** (3/56 scenarios differ, by one or two documents or metrics), and
  nDCG Δ −0.002. So Lucene's keyword arm (the H2 appdb engine) barely changes the ranking here.
- Top-10 overlap with pgvector `semantic` is 0.814, the same pattern as sqlite-vec1 (pgvector puts dashboards and metrics
  ahead of collections, tables and cards).
- ~~The likely cause is pgvector's in-store scorers~~ **Refuted (F tested it, J re-computed it, 19:19 UTC).** With the
  golden `semantic-vector` run `20260923-180253-b809c0` (pgvector scorers kept, keyword arm off, read back as
  `keywordArm: false`), paired nDCG@10, n = 52:

  | Pair | better / tie / worse | Δ |
  |---|---|---|
  | semantic-vector − sqlite-vec1-pure | 12 / 28 / 12 | −0.002 ± 0.032 |
  | semantic-vector − lucene | 14 / 27 / 11 | −0.004 ± 0.030 |
  | semantic − semantic-vector | 7 / 42 / 3 | **+0.025 ± 0.023** |

  With the same scorers and no keyword arm, pgvector **ties** both new engines. Its lead comes from its **Postgres
  tsvector keyword arm**, not the in-store scorers. (semantic-vector also has the top-up off, but the top-up's effect on
  golden is ≈ 0: semantic vs semantic-pure ≈ 0.004.) Lucene's own keyword arm is the **H2** appdb engine here and adds
  ≈ nothing (lucene ≈ sqlite-vec1). **BL-43 (a Postgres app DB, so lucene's keyword arm is tsvector too) is therefore
  the fair test of lucene's hybrid design**; F is raising it with Voytek.
- Caveats: the keyword arm is H2 (BL-43 would test Postgres), and the HNSW index is approximate (irrelevant at 250 docs).

**Latency** p50 / p95 ms: lucene 24.7 / 38.5; pgvector semantic 34.4 / 49.6 (a 15:44 UTC run); sqlite-vec1 28.6 / 44.1
(a concurrent-boot run, excluded by BL-38). These are whole round trips dominated by the Ollama query embedding at
250 docs. The store latency story is in the 10k tier.

### Questions for Paolo (F → Voytek, 2026-09-23 ~18:50 UTC; #6 added 19:50)

1. Can the keyword arm be switched off (a setting), for a vector-only comparison against `semantic-vector` and `sqlite-vec1-pure`?
2. Could the status endpoint (or a sibling) list the indexed `(model, model_id)` set, so the harness can verify the corpus (§5 rule 1)?
3. Is H2 an intended target for the keyword arm? On H2 the appdb engine has no stemming, so should we measure on a Postgres app DB?
4. Any HNSW parameters (M, beam width) worth recording, or are Lucene's defaults intended?
5. Anything still landing today that we should wait for (e.g. the vector-arm scorers)?
6. **Bug**: `init!` skips the initial population when event-driven writes reached the embedding table first
   (`lucene/core.clj:60`), so pre-existing documents (here the Trash collection) stay unembedded until the hourly repair,
   and `/status` shows 249/250. Evidence is in risk 6 above. Would a backfill in `init!` be the fix?

## Other branches noticed (not in scope; FYI)

- `hackathon-2026-sqlite-vec1-vibes` (**Mike Appleby**, 1 commit `dec0b90fc4`, 2026-09-23 17:07 UTC), first seen by J at 17:25 UTC. It is
  **stacked on Libor's head** `571a489e13` (1 ahead, 0 behind): "Order by vibes: rerank SQLite semantic search with a
  Jev judgement". It adds an LLM reranker (TypeSafe Jev, external API) over the top `vibes-rerank-k` (50) sqlite-vec1
  candidates, with a 2 s timeout falling back to vector order. **Opt-in twice**: the `vibes-enabled` setting (default false)
  and a per-request `vibes=true` param on `/api/search`; it also needs `vibes-api-key`. It touches shared files
  (`search/api.clj`, `impl.clj`, `config.clj`, metabot search tool, FE search sidebar) and `semantic_search/sqlite.clj`
  (+98 −32). **Not Libor's hybrid iteration 2**, and it doesn't change our pinned worktree. If we ever measure it,
  it's its own column (e.g. `sqlite-vec1+vibes`), and it needs network, a key, and latency that includes an
  external LLM call. Reported to F.
  **17:55 UTC**: force-pushed. The single commit is now 6 commits `efccfbbd82`…`869a57312e` (17:30 UTC), with the
  same files and the same +/− counts: a history split, not a content change.

- `hackathon-2026-semantic-sqlite` (Mike Appleby, 6 commits dated 2026-09-19, 6 ahead / 28 behind): another SQLite
  store for semantic search (`semantic_search/db/sqlite.clj`, store health, migrations, CI). It's **not** Libor's
  branch and isn't one of our engines. Reported to F so nobody confuses the two.

---

## Appendix: BL-09 probe proof (`probe_test.py`, J, 2026-09-23 ~16:55 UTC)

Run: `/opt/homebrew/bin/python3 probe_test.py <scratch>/probe-store.sqlite` (it needs a Python whose `sqlite3` can
`enable_load_extension`; Apple's `/usr/bin/sqlite3` can't load extensions, which is why the probe itself uses it).
It writes a throwaway store only. The schema is Libor's shape, trimmed to the columns the vec1 table mirrors.

Output:

```
vec1: version 0.7 (NEON, multi-threaded)
after 50 (writer open, WAL): (0, '50|50', '')
mid-transaction (1 doc uncommitted, no vector): (0, '50|50', '')
committed doc without vector: (0, '51|50', '')
after 100: (0, '100|100', '')
after replacing 10: (0, '100|100', '')
corpus probe: 0 ['card|1', 'card|2', 'card|3']
knn via vec1 (in-process): [(67, 0.2011…), (39, 0.2163…), (91, 0.2206…)]
CLI touching search_vec (expected clean error, no crash): 1 Error: in prepare, no such module: vec1
shadow tables: ['search_vec', 'search_vec_config', 'search_vec_base', 'search_vec_idx', 'search_vec_idx_idx', 'search_vec_model', 'search_vec_meta']
```

```python
import sqlite3, struct, subprocess, sys, os, random
DYLIB="/Users/krever/Projects/metabase/.claude/worktrees/sqlite-vec1-libor/resources/vec1/darwin-aarch64/vec1"
path=sys.argv[1]
for s in ["","-wal","-shm"]:
    if os.path.exists(path+s): os.remove(path+s)
c=sqlite3.connect(path, isolation_level=None)
c.enable_load_extension(True); c.load_extension(DYLIB)
c.execute("PRAGMA journal_mode=WAL")
print("vec1:", c.execute("select vec1_info()").fetchone()[0])
c.execute("BEGIN")
c.execute("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)")
c.execute("CREATE TABLE search_doc (id INTEGER PRIMARY KEY, model TEXT NOT NULL, model_id TEXT NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL, archived BOOLEAN DEFAULT FALSE, verified BOOLEAN, database_id INTEGER, creator_id INTEGER, collection_id INTEGER, UNIQUE(model, model_id))")
cols=["model","archived","verified","database_id","creator_id","collection_id"]
c.execute("CREATE VIRTUAL TABLE search_vec USING vec1(vector, %s)" % ", ".join(cols))
c.execute("""INSERT INTO search_vec(cmd, arg) VALUES ('rebuild', '{index:"flat", distance:"cos"}')""")
c.execute("COMMIT")
D=384; random.seed(1)
def blob(v): return struct.pack("<%df"%len(v),*v)
def write(n0,n):
    c.execute("BEGIN")
    for i in range(n0,n0+n):
        c.execute("INSERT INTO search_doc(id,model,model_id,name,content,archived,verified,database_id,creator_id,collection_id) VALUES (?,?,?,?,?,0,0,1,1,NULL)",(i,"card",str(i),"n%d"%i,"c"))
        # mirrors write-rows!: delete + insert, never UPDATE
        c.execute("DELETE FROM search_vec WHERE rowid=?",(i,))
        c.execute("INSERT INTO search_vec(rowid, vector, %s) VALUES (?,?,?,?,?,?,?,?)"%", ".join(cols),(i,blob([random.random() for _ in range(D)]),"card",0,0,1,1,None))
    c.execute("COMMIT")
def probe():
    q="select (select count(*) from search_doc), (select count(*) from search_vec_base)"
    r=subprocess.run(["/usr/bin/sqlite3","-readonly",path,q],capture_output=True,text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()
write(1,50);  print("after 50 (writer open, WAL):", probe())
c.execute("BEGIN"); c.execute("INSERT INTO search_doc(id,model,model_id,name,content) VALUES (999,'card','999','x','c')")
print("mid-transaction (1 doc uncommitted, no vector):", probe()); c.execute("COMMIT")
print("committed doc without vector:", probe())
c.execute("DELETE FROM search_doc WHERE id=999")
write(51,50); print("after 100:", probe())
# re-upsert rows 1..10 (replace path)
c.execute("BEGIN")
for i in range(1,11):
    c.execute("DELETE FROM search_vec WHERE rowid=?",(i,)); c.execute("INSERT INTO search_vec(rowid, vector, %s) VALUES (?,?,?,?,?,?,?,?)"%", ".join(cols),(i,blob([random.random() for _ in range(D)]),"card",0,0,1,1,None))
c.execute("COMMIT"); print("after replacing 10:", probe())
r=subprocess.run(["/usr/bin/sqlite3","-readonly",path,"select model, model_id from search_doc order by id limit 3"],capture_output=True,text=True); print("corpus probe:", r.returncode, r.stdout.split())
print("knn via vec1 (in-process):", c.execute("SELECT v.rowid, v.distance FROM search_vec(?, '{k: 3}') v ORDER BY v.distance",(blob([random.random() for _ in range(D)]),)).fetchall())
r=subprocess.run(["/usr/bin/sqlite3","-readonly",path,"select count(*) from search_vec"],capture_output=True,text=True); print("CLI touching search_vec (expected clean error, no crash):", r.returncode, r.stderr.strip())
print("shadow tables:", subprocess.run(["/usr/bin/sqlite3","-readonly",path,"select name from sqlite_master where name like 'search_vec%'"],capture_output=True,text=True).stdout.split())
```
