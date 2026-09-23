# Comparison harness — plan

Companion to `hackathon/brief.md`. Read this first; `01-contracts.md` has the interfaces.

## The one finding that changes the design

**Metabase already supports running several search engines side by side in one instance, and
selecting one per request.** We do not need three instances.

- `search.engine/results` is a multimethod dispatching on `:search-engine` in the search context
  (`src/metabase/search/engine.clj:38`).
- `additional-search-engines` keeps extra engines indexed *and* queryable per request
  (`src/metabase/search/settings.clj:34`).
- `/api/search?search_engine=<name>` selects one per call, and refuses engines not in that list
  (`src/metabase/search/api.clj:71`).

So the harness is: **one instance, one corpus, one permission model, N engines, every query issued
N times with a different `search_engine`.** Fairness is structural rather than something we have to
argue for — same rows, same filters, same scorers, same process.

This also fixes the integration contract for Libor and Paolo: implement the `search.engine`
multimethods for your keyword and the harness picks you up for free. **That is time-critical — send
it to them before they build an entry point we then have to adapt.** See `01-contracts.md` §1.

Fallback if the branches cannot be merged into one process: the runner also speaks HTTP to separate
instances. Same adapter interface, worse fairness guarantees. Design for it, do not build it first.

## What already exists (do not rebuild)

| Asset                                                                                                                              | Where                                                                      | Use                 |
|------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|---------------------|
| Corpus generator — scales cards, dashboards, collections, tables, documents, segments, measures, actions, users, permission groups | `dev/src/dev/search_perf.clj` → `create-test-environment! {:data-scale N}` | Task 4, scale tiers |
| Latency benchmark with warmup + p50/p95                                                                                            | same → `run-search-benchmark!`, `timed-search!`                            | Task 2, latency     |
| Search context builder for a given user                                                                                            | same → `search-context-for-user`                                           | Runner              |
| Recall methodology: nn-recall and score-recall vs an exhaustive ground truth                                                       | `dev/src/dev/semantic_search/recall.clj`                                   | Task 2, quality     |
| Raw strategy/latency/recall comparison over a generic vector table                                                                 | `dev/src/dev/semantic_search/shootout.clj`                                 | Reference           |
| Working local pgvector + Ollama instance                                                                                           | `local/run-semantic-search.sh`, `local/verify-semantic-search.sh`          | Baseline column     |

The baseline is already live: pgvector + Ollama `all-minilm`, 65 docs indexed, `search_engine=semantic`
answering. That is the harness's first column.

## Architecture

```
scenarios.edn ──┐
                ├──> runner ──> for each (engine × embedder × scenario × iteration)
corpus  ────────┘                   └─> search.engine/results  (in-process)
                                    └─> GET /api/search        (http fallback)
                                          │
                                          ▼
                                    raw observations
                                          │
                                    metrics library (pure)
                                          │
                                          ▼
                                 results Postgres  ──>  Metabase data app
```

Four decoupled pieces, joined only by the contracts in `01-contracts.md`. Each is one agent.

## The comparison matrix

**Axis 1 — engine.** `semantic` (pgvector, baseline) · `sqlite-vec1` (Libor) · `lucene` (Paolo) ·
`appdb` (keyword-only reference) · `in-place` (naive reference).

The last two are free, already work, and mean the dashboard has real columns from hour one even if
neither new engine lands. **Do not skip them — they are the insurance policy.**

**Axis 2 — embedder.** `ollama/all-minilm` (384, English, fast) · `ollama/snowflake-arctic-embed2`
(1024, multilingual, production model). Optionally the in-process plugin.

On task 5 — yes, include it, and the reason is stronger than "it's interesting". A different embedder
is a different embedding space, hence a different index, so it is genuinely orthogonal and costs us
only run time. The payoff is the most quotable result available: **how much of retrieval quality is
decided by the store versus the model.** My prior is the model dominates by a wide margin, which
reframes the whole project — it would mean store choice is free to optimise for deployability.

Cost warning: Ollama has no batch API, so Metabase embeds one document per HTTP call
(`embedding.clj`, `ollama-get-embeddings-batch`). Measure throughput before picking scale tiers.

**Axis 4 — embedding text** (Agent E, opt-in). `baseline` (name + description, today) · `context`
(+ collection, database, schema, parent table, chart type) · `context-sql` (+ native SQL). Switched by
the admin setting `search-embedding-text-variant` plus `POST /api/search/re-init`. A variant change is
a new run. Only the vector arm moves, so keyword engines should come out identical across variants.
See `agents/E-embedtext.md`.

**Axis 3 — scale.** `data-scale` 100 / 1k / 10k. Brute force and ANN do not diverge below ~10k, so
without a large tier the latency story is empty. Budget embedding time for this.

// Users have up to few milition entities. Not sure if we can replacate that but thats the scalability target

## Metrics

**Quality, needing labels** (from the golden set): recall@k, precision@k, MRR, nDCG@10.

**Quality, needing no labels** — cheap and highly demoable:
- *Agreement*: Jaccard@k and Kendall tau between each pair of engines. "The three agree on 94% of
  results; here are the 6% where they differ" is a better slide than any single number.
- *ANN recall vs exact*: pgvector `brute-force` is exact, so it is ground truth for the vector arm.
  Measures index fidelity, not usefulness — label it as such, per the reading companion.
- *Zero-result rate*: already exposed a real bug in the baseline (see Known findings).

**Performance**: query latency p50/p95/p99, split into embed / store / post-filter using the existing
waterfall (`index.clj`, `time-waterfall`, gated by `semantic-search-explain`); full index build time;
incremental update latency; index size on disk; RSS delta.

**Operational**: cold start to first query; rebuild-from-scratch time.

// lucene also might put pressure on memory footprint? If so we should measure that as well??

## Work breakdown

Contracts first, then four agents in parallel. The contracts are derived from existing code, not
invented, so they can be frozen immediately.

| # | Agent    | Deliverable                                                                  | Depends on              | Brief                 |
|---|----------|------------------------------------------------------------------------------|-------------------------|-----------------------|
| A | Runner   | Matrix runner, in-process + HTTP adapters, stub engine, fairness preflight   | contracts               | `agents/A-runner.md`  |
| B | Corpus   | Golden set with labels + tagged scenarios; scale tiers via `dev.search-perf` | —                       | `agents/B-corpus.md`  |
| C | Metrics  | Pure scoring library + tests                                                 | contracts (shapes only) | `agents/C-metrics.md` |
| D | Data app | Results schema, writer, Metabase dashboard                                   | contracts               | `agents/D-dataapp.md` |
| E | Embed text | **DONE (build).** Opt-in `search-embedding-text-variant` setting in ingestion (axis 4). Live on :3002, uncommitted. Reopens when A records `embeddingText` and switches variants in a real run | —                       | `agents/E-embedtext.md` |
| G | Explainer | Reading guide, glossary and simplified dashboard so Voytek can understand and present the results | real runs (A) | `agents/G-explainer.md` |
| H | Bugfixer | Works through BACKLOG.md one item at a time: reproduce, fix, verify, sync with F | BACKLOG.md | `agents/H-bugfixer.md` |
| I | Embed research | Research + build better embedding-text strategies (SQL → plain English etc.); SQL-bearing corpus; recommendation | E's axis, A's pipeline | `agents/I-embedresearch.md` |
| J | Branch watch | Tracks Libor's/Paolo's engine branches, checks them against contract §1, plans the integration runs with A, reports distance to goal | the branches | `agents/J-branchwatch.md` |
| K | Demo deck | reveal.js Markdown deck + Riley feature demo runbook | all results | `agents/K-deck.md` |
| F | Overseer | Checks all agents' worklogs against the repo and briefs Voytek; writes no harness code | worklogs             | `agents/F-overseer.md` |

B and C have no dependency on anyone's engine landing. Start them first.

## Risks

| Risk                                             | Mitigation                                                                                                                                       |
|--------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| Neither new engine lands in time                 | `appdb` + `in-place` + two embedders already make a full matrix. Plus a stub engine in Agent A.                                                  |
| Branches cannot be merged into one process       | HTTP adapter, same interface. Decide by midday, not at 17:00.                                                                                    |
| Embedding throughput caps the scale tier         | Measure first (Agent B, step 1). Fall back to injecting synthetic documents straight through `update-index!` rather than creating real entities. |
| Numbers that look precise but are not comparable | Fairness preflight in Agent A is a gate, not a nice-to-have.                                                                                     |
| Everyone edits the same namespaces               | One agent owns each file tree. Namespaces are assigned in the briefs.                                                                            |

## Answers to the brief's six questions

1. **Setup** — one instance, `additional-search-engines`, `search_engine` per request. Local stack
   already running via `local/run-semantic-search.sh`.
2. **Metrics** — above. Split labelled / unlabelled / performance; the unlabelled agreement metrics
   are the cheapest route to a compelling result.
3. **Presentation** — results into Postgres, Metabase data app on top. Dogfooding is the wow.
4. **Dataset** — two corpora: a small labelled golden set for quality, generated scale tiers for
   latency. Do not try to serve both purposes with one.
5. **Embedder axis** — yes. Orthogonal by construction, and likely the headline finding.
6. **The "???"** — three things the list is missing:
   - **The engine contract**, published to Libor and Paolo *today*. Highest-leverage item here.
   - **Fairness rules**, written down and enforced in code: identical corpus, identical filters,
     identical cutoff, warmup, cache state, pinned seeds. Without this the numbers are decoration.
   - **Differential testing**, not just metrics: same input, same embeddings — do the engines return
     the same rows? Finds bugs that aggregate scores hide.

## Known findings to carry in

- The `0.7` cosine cutoff (`index.clj:716`, `max-cosine-distance`) silently drops results. Measured
  on the live baseline: *"how much money did we bring in"* had every candidate at ≥0.748 and returned
  nothing. *"who buys our stuff"* had exactly one candidate under the cutoff, which the Clojure-side
  filter then removed — zero results. **Make zero-result rate a first-class metric**, and hold the
  cutoff constant across engines or the comparison is meaningless.
- Scoring is already split: in-store SQL scorers plus in-memory appdb scorers (`scoring.clj`). An
  engine that cannot express the SQL scorers will look worse for reasons unrelated to retrieval.
  Record which scorers each engine actually applied.
- H2 scores a literal `1` and MySQL has no search index, so `appdb` as a reference column behaves
  very differently by app DB type. Ours is H2 — note it on the chart.
