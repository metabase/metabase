# Hackathon 2026-09: semantic search without pgvector: summary

Team: Voytek (harness and evals), Libor (sqlite-vec1 engine), Paolo (Lucene engine), Riley (duplicates and embedding
map features), Mike (vibes reranker). This directory holds Voytek's part: a comparison harness, the evals, research, and the
demo deck. Everything here was built by a team of Claude agents (A–K) coordinated by an overseer (F); see
`harness/START-HERE.md`.

## The question

Metabase's semantic search needs pgvector: a Postgres extension, a separate database, and operational setup. The starting
idea was a SQLite-backed store. We went further: we compared **three vector stores** (pgvector today, Libor's
**sqlite-vec1**, Paolo's **Lucene**) on the same questions, and asked **what should be embedded** in the first place.

## Results (all numbers verified against the results DB; run ids in `harness/worklogs/F-overseer.md`)

Embedder all-minilm unless noted; quality = nDCG@10 (0–1), paired per question with 95% CIs.

| | pgvector (today) | sqlite-vec1 (Libor) | Lucene (Paolo) |
|---|---|---|---|
| Golden quality (56 hand-labelled questions) | 0.601 | 0.581 | 0.579 |
| Vector-only quality | tie | tie (−0.002 ± 0.032) | tie (−0.004 ± 0.030) |
| p50 / p95 latency at 10k entities (~26k docs) | 292 / 866 ms | **222** / 1,084 ms | 238 / 953 ms |
| Index size at 10k | 117 MB | 156 MB | **50 MB** |
| Search | exact (brute force) | exact (flat) | approximate (HNSW) |
| Keyword part | Postgres full-text (hybrid) | none (vector only) | appdb keyword (hybrid; H2 in our runs) |

1. **The stores are interchangeable on quality.** Vector-only, all three tie. pgvector's small lead (+0.025 ± 0.023) is its
   Postgres keyword arm, not the store. With the same embeddings, sqlite-vec1 and pgvector return **identical candidate sets**
   (overlap 1.000 over 26,648 items at limit 1000).
2. **Both new stores are faster at the median** at 10k: sqlite-vec1 ~25–30% (vector-only, bracketed A-B-A runs, drift 3.7%),
   Lucene ~15–20%. Tails are within run-to-run noise.
3. **What we embed matters far more than where.** Today only name and description are embedded. On a SQL-heavy corpus with vague
   card names, **auto-describing undocumented cards** takes held-out nDCG@10 from **0.40 to 0.93–0.97**, and the gain holds
   with the keyword arm switched off. A no-AI version (Metabase's own query description for GUI cards plus rule-based
   SQL→English) gets 87–94% of a local LLM's gain. Embedding the raw SQL (`context-sql`) also helps a lot (+0.25 to +0.38) but
   can't cover GUI cards. See `harness/research/embedding-text-recommendation.md`.
4. **Embedder:** arctic-embed2 vs all-minilm helps only cross-lingual questions (0.17 → 0.68). Arctic's "query: " prefix,
   which Metabase never sends for the Ollama model name, didn't help on our corpora.
5. **Coverage gap:** almost everything we measured targets cards. Table-by-column, dashboard-by-card, document body,
   definitions, filters and permissions are unmeasured and not embedded. A costed plan is in `harness/research/coverage-plan.md`.

## Bugs and findings for other teams

- **Metabase (BL-44): on real data, semantic search silently falls back to keyword.** On a sanitized Stats app-DB snapshot, 48 of
  ~60 semantic queries failed schema validation on legacy card `result_metadata` keys (`semantic_search/core.clj:138`
  catch-all) and served appdb results under the "semantic" label. Real-data quality for semantic is therefore **unmeasured**:
  the corrected run (with the metadata nulled on a local copy) was blocked by a permission decision and didn't happen.
- **Metabase:** Ollama all-minilm rejects long texts (849–3,190 chars) with HTTP 500, and the indexer retries them forever
  (59 docs on real data never indexed).
- **Metabase:** arctic-embed2 via Ollama gets no query prefix (`embedding.clj:697-698` pattern miss). No measured cost here.
- **Lucene (Paolo):** a startup race: `init!` populates only an empty index (`lucene/core.clj:60`), so early event-driven embeds
  leave pre-existing docs unembedded until the hourly repair. Suggested fix: run `repair!` in `init!`.
- **Riley's duplicates branch:** the embedding map is pgvector-only; the SQLite backfill never passes its catch-up check;
  all-minilm finds 0 duplicate pairs (arctic works); same-language copies aren't flagged at 0.83.
- **sqlite-vec1 (Libor):** any SQL `UPDATE` on its flat index segfaults the JVM (his LIMITATION_001). His engine avoids it
  (delete plus insert), and we never hit it.

## Metabase source changes (opt-in, off by default)

- `search-embedding-text-variant` (`src/metabase/search/settings.clj`, `ingestion.clj`): `baseline` (default, byte-identical)
  | `context` | `context-sql`. Changes only what gets embedded. Tests in `ingestion_test.clj`.
- `semantic-search-keyword-arm-enabled` (`enterprise/…/semantic_search/settings.clj`, `index.clj`): default true = today's hybrid
  query, untouched; false = vector-only (`vector-only-search-query`). Tests in `index_test.clj`, `query_test.clj`.

## What's in here

| Path | What |
|---|---|
| `sqlite-semantic-search-brief.md` | The original design brief and research of alternatives (engines, embedders) |
| `brief.md` | Voytek's hackathon brief |
| `harness/START-HERE.md` | Onboarding, agent roster, environment, how to queue runs |
| `harness/00-plan.md`, `01-contracts.md` | Design and the interfaces between pieces (incl. §1 checklist for engine authors) |
| `harness/corpus-gen/` | Corpus generator and loader (golden, SQL corpus, scale tiers, stats-real extraction code) |
| `harness/scenarios/` | Golden (56) and SQL (60, blind-written, dev/held-out split) question sets |
| `harness/runner/` | Pipeline (boot → load → index → preflight → run), HTTP adapter, fairness preflight, fallback guards, job queue |
| `harness/metrics/` | Metrics library (nDCG, recall, MRR, zero-result, agreement, latency) and tests |
| `harness/results/` | Results DB writer, dashboard builder (`npm run dashboard`), card checker (`npm run check`) |
| `harness/sql/` | Results schema and views |
| `harness/dashboard/serdes/` | Serialized dashboard (import to restore) |
| `harness/embedtext/` | Text strategies (SQL→English, LLM summaries), frozen caches, replay and report scripts |
| `harness/research/` | Embedding-text memo, results and recommendation; coverage plan |
| `harness/branchwatch/`, `branches.md` | Engine-branch reviews (Libor, Paolo, Riley) and the result-set overlap tool |
| `harness/BACKLOG.md` | 44 items found and fixed (or deferred) during the build |
| `harness/agents/`, `worklogs/` | Every agent's brief and full worklog |
| `deck/` | reveal.js deck (`slides.md`), demo runbook (`DEMO.md`), demo scripts |

Not committed (regenerable or local): `harness/node_modules` (`npm install`), `harness/artifacts/scale-*`
(`node corpus-gen/generate.ts scale …`, seed 42, byte-identical), `harness/runner/queue/` (runtime), `deck/vendor/`
(`deck/fetch-vendor.sh`), and everything in `/local` (launch scripts, tokens, the real-data snapshot and its derivatives).

## Reproduce

```bash
cd hackathon/harness && npm install
./local/run-semantic-search.sh                       # results DB + pgvector + Ollama + :3002 (dashboard host)
node runner/src/pipeline.ts --corpus golden          # boots a fresh instance, loads, indexes, runs, writes results
node runner/src/queue.ts add --kind quality -- --corpus sql --vector-only   # or queue jobs (2 slots, latency exclusive)
(cd results && npm run dashboard && npm run check)   # rebuild the dashboard, verify every card
```
Engine branches run with `--repo <worktree>` (`--sqlite-vec1`, `--lucene`); see `harness/branches.md`.

## Open

- Real-data (Stats) quality: needs the BL-44 workaround on a local copy, then a guarded rerun.
- Lucene on a Postgres app DB, so its keyword arm is full-text too (BL-43).
- Coverage beyond cards (the coverage plan, Phases 0–3 ≈ 15–17 agent-hours).
- Upstream: BL-44, the Ollama long-text 500s, the Lucene startup race, and Riley's store issues.
