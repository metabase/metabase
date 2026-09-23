# Agent B — corpus and scenarios

Read `_shared-context.md` first. **No dependency on any engine landing — start immediately.**

## Mission

Produce the two corpora and the labelled scenario set the whole comparison rests on.

You own: `hackathon/harness/scenarios/*.edn`, `dev/src/dev/harness/corpus.clj`.

## Deliverables

1. **Embedding throughput measurement — do this first, it gates everything.**
   Ollama has no batch API; Metabase embeds one document per HTTP call
   (`embedding.clj`, `ollama-get-embeddings-batch`). Measure docs/sec for `all-minilm` and for
   `snowflake-arctic-embed2`, then state the largest `data-scale` that fits a ~15 minute index build.
   Report this number early — the plan's scale tiers depend on it.

2. **Scale corpora.** Thin wrapper over `search-perf/create-test-environment! {:data-scale N}`
   (`dev/src/dev/search_perf.clj`) for tiers 100 / 1k / 10k. Pin the seed and record it. Do not write
   a new generator — that one already creates cards, dashboards, collections, tables, documents,
   segments, measures, actions, users and permission groups with a realistic distribution.

   If embedding throughput makes 10k impossible via real entities, fall back to injecting synthetic
   documents straight into the index through `search.engine/update!` with a document reducible,
   bypassing entity creation. Faster, but permission filtering and appdb scorers will misbehave for
   fake ids — so use that route for **latency only**, never for quality.

3. **Golden set** — 40–60 scenarios in the `01-contracts.md` §3 format, over a small realistic corpus
   (a few hundred entities), hand-labelled with graded relevance.
   - Cover every tag in the §3 category table. Roughly: 25% `:paraphrase`, 20% `:concept`,
     15% `:exact-name`, 10% `:rare-token`, 10% `:typo`, 10% `:cross-lingual`, 10% `:ambiguous` /
     `:empty-expected`.
   - The categories where *keyword should win* matter as much as the ones where semantic should.
     A set that only contains semantic-friendly queries proves nothing.
   - `:cross-lingual` needs content in one language and queries in another. Polish and Japanese are
     the interesting cases: Polish is absent from Metabase's Postgres stemming map, and Japanese has
     no whitespace tokenisation at all (`src/metabase/search/util.clj:53`). Note that these only work
     with a multilingual embedder — `all-minilm` is English-only, `snowflake-arctic-embed2` is not.
   - Label against the *actual* corpus you generate, so ids are real and stable.

4. **A loader** that reads scenarios, validates them against the schema, and resolves `:expected`
   entries to live ids — failing loudly on a stale label rather than silently scoring zero.

## Verification

- Every scenario validates; every `:expected` id exists in the corpus.
- Sanity check by hand: run 5 scenarios through the live baseline and confirm the labels are
  defensible. Bad labels are worse than no labels.
- Corpus generation is reproducible: same seed, same ids.

## Gotchas

- The Sample Database alone is 65 documents — far too small for latency work, and the source of the
  "everything is fast" illusion. It is fine for quality.
- Baseline measurements on this instance show the `0.7` cosine cutoff (`index.clj:716`) zeroing out
  plausible queries: *"how much money did we bring in"* had every candidate at ≥0.748. **Deliberately
  include several such near-miss queries** — zero-result rate is a headline metric, not a nuisance.
- Do not label from memory of what Metabase "should" return. Generate the corpus, look at it, label it.
