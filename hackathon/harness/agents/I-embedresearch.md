# Agent I: embedding-text research (what should we embed?)

Read `../START-HERE.md` first, then `_shared-context.md` (sync with F and worklogs are both required), then
`E-embedtext.md` (the axis you're extending). Session: _fill in when started_. Brief written by Agent F (overseer),
2026-09-23.

## Mission

Find out **what text Metabase should embed for each item so that semantic search finds it better**, and prove it
on the harness. Voytek's hypothesis: **a card's SQL carries real meaning (tables, columns, filters, joins, business
logic), but raw SQL embeds poorly. Translated into plain English, either mechanically or by a small local model, it
should help.** Test that hypothesis honestly, alongside the best alternatives you find in the literature, and add the
winners to the suite as new embedding-text variants.

Your output is a **recommendation backed by numbers**: which strategy, how much it helps, on which kinds of questions,
at what indexing cost, and whether it can ship inside Metabase.

## What we already know (verified by F; start from here, don't rediscover it)

- Today Metabase embeds `[model]` + name + description (`embeddable-text` in `src/metabase/search/ingestion.clj`).
  Agent E added an opt-in admin setting, `search-embedding-text-variant`:
  - `baseline`: the current behaviour;
  - `context`: adds collection, database, schema, table and chart type;
  - `context-sql`: also adds the native SQL, raw, cut to 1000 characters.

  The runner switches variants with `pipeline.ts --variants baseline,context,…` (PUT setting → re-init → content gate →
  run). Re-indexing golden takes ~45 s with all-minilm.
- **`context` made semantic worse**: nDCG@10 went from 0.601 to 0.573 on golden (runs `…154430-7f2163` vs
  `…154552-0f1b87`). Keyword engines were identical across variants, as they should be. The likely reasons, which are
  yours to confirm: the labelled lines dilute the embedding, and all-minilm reads only ~256 tokens.
- `context-sql` has **never been run**, and it can't show anything today. See the blocker below.
- Embedders: `all-minilm` (384d, English, ~256-token window) and `snowflake-arctic-embed2` (1024d, multilingual, longer
  window). A's first arctic golden run is `20260923-155004-12e37a`. The embedder × text-strategy interaction is part of
  your answer.
- The in-place and appdb engines also see SQL for keyword matching. That's why nobody noticed the vector side ignores
  it.

## Blocker you must solve first: the golden corpus has no SQL

All 109 golden cards are **MBQL (GUI) queries**: a source table, sometimes a `count` (`corpus-gen/apply.ts:161-168`).
None is a native SQL card, and their names and descriptions are well written. So no SQL strategy can move any number
on golden, and your first job is a test set where SQL can matter:

- Build a **new corpus version** (e.g. `northwind-sql-v1`, or `northwind-golden-v2` as a superset). **Never change
  `northwind-golden-v1`**: existing results must stay comparable.
- It should contain native SQL cards that look like real ones, including the **realistic hard case**: vague or
  missing names and descriptions ("Query 17", "copy of revenue v2", no description), where the meaning lives
  only in the SQL (joins, CASE logic, filters like `status = 'refunded'`, date windows, CTEs).
- Include some MBQL cards whose meaning is in the query too (filters, breakouts, aggregations), since "query → text"
  applies to MBQL just as much.
- Write new labelled scenarios that target them, using the §3 categories and tags (a new tag such as `sql-only` for
  "the answer is findable only through the query").
- Use B's tooling: `corpus-gen/` (`generate.ts`, `apply.ts`, `validate.ts`, `resolve.ts`), the scenario format in
  `01-contracts.md` §3, and `scenarios/src/golden.json` as the template. B is done and unreachable, so you own your new
  corpus files. **Changes to shared `corpus-gen` code need F's OK.**
- **Guard against overfitting.** With a few dozen hand-written questions, you can tune anything to look good. Split
  the questions into a **dev set** (iterate on it) and a **held-out set** (touch it only for the final comparison),
  and write the split down before you iterate. Report held-out numbers as the headline.

## Research (do it properly)

Use WebSearch / WebFetch. Survey approaches to improving dense retrieval over structured or code-like artefacts, and
rank them for *our* setting. Starting points, not limits:

- **SQL → natural language**: rule-based SQL explanation, text-to-SQL work run in reverse (SQL-to-text), schema-aware
  descriptions.
- **LLM-generated summaries / "contextual retrieval"** (e.g. Anthropic's contextual retrieval): a small model writes a
  short description of each item before embedding.
- **doc2query / query expansion at index time**: generate the questions an item answers, and embed those.
- **Multi-vector / field-separated embeddings**: name, description and query embedded separately, max-sim or
  weighted. Check what our engine contract allows before you go far down this road.
- **Identifier normalisation**: split `fct_orders_v2` → "fact orders", expand abbreviations (cheap, mechanical, and
  possibly most of the win).
- **Truncation-aware ordering**: put the most informative text first when the model reads only ~256 tokens.
- Query-side tricks (HyDE and similar) are out of scope unless they need no query-time LLM. Note them, don't build them.

Small local models run through Ollama (already on `localhost:11434`). Pick from what's pullable on this laptop,
and measure generation time per item.

**Research deliverable** (before you build anything): a memo of 1–2 pages at `hackathon/harness/research/embedding-text.md`,
listing 5–8 strategies. For each: the idea, the evidence (with citations and links), expected gain on *our* question
categories, index-time cost, whether it can ship in Metabase (no LLM, local LLM, or hosted LLM), and effort. Finish with
your **top 2–3 to build and why**. Send it to F and **wait for the go-ahead** before implementing. Voytek will want to read
this one, so write it for him (plain words, no jargon without a gloss).

## Building strategies into the suite: how the text gets in

Metabase builds the embedding text inside ingestion, so a new strategy needs its text there at index time. Three
routes. Pick with F, and prefer the first that works:

1. **Outside-in, no Metabase change**: the harness generates the text in TypeScript and writes it into the item
   (e.g. the card's `description` via `PUT /api/card/:id`) before indexing. It's the cheapest to try. The caveat: the keyword
   engines see it too. That's a legitimate product option ("auto-describe cards"), but label it as such, and report
   keyword and vector effects separately.
2. **One generic hook in E's setting**: a variant `external`, where `embeddable-text` appends text looked up from
   a harness-owned sidecar keyed by (model, entity id), e.g. a small app-DB table or a JSON file named by an env var.
   One small, opt-in Clojure change, after which every strategy is pure TypeScript and only the vector arm moves. This is a Metabase
   source change: it needs **F's sign-off and Voytek's approval**, it must be off by default, and E's session
   (`metabase-sqlite-semantic-search-8a [36af46]`) owns that code, so ask E to make it or review it.
3. **A new named variant per strategy in Clojure**: only for a strategy that must live in Metabase to ship (e.g. a
   mechanical SQL→English translator). Same approvals as 2.

Your code: a new workspace package `hackathon/harness/embedtext/` (TypeScript, zero or minimal dependencies), with one
generator per strategy, and output that's deterministic and cached. LLM outputs get written to a file, so reruns are
free and reproducible (record the model name and digest, prompt and temperature 0).

## Evaluation (to be believed)

- Run through **A's pipeline** (`--variants …`, and your corpus via `--corpus`). Don't build a parallel runner. If the
  pipeline needs a flag, ask A (`metabase-sqlite-semantic-search-8a [56b416]`).
- For every strategy, report against `baseline`, **paired per question** on the held-out set: wins/ties/losses and
  Δ nDCG@10 ± 95% CI, plus recall@10 and zero-result rate. Report it per category (especially `sql-only`, `paraphrase`,
  `concept`) and **for both embedders**.
- Always also report: the keyword engines (should they change? why?), index-time cost (generation + re-embed per
  1k items, extrapolated to 10k and 100k), text length vs the model's token window, and anything silently dropped
  (compare `indexed_count`).
- Results go into the same `harness` DB, so the dashboard's embedding-text cards show them. Ask G
  (`metabase-sqlite-semantic-search-e7`) if your strategy needs a new card. Don't edit `dashboard-cards.ts` yourself.

## Done when

1. The research memo is approved by F and readable by Voytek.
2. A SQL-bearing corpus with dev/held-out scenarios is validated (`validate.ts`, `resolve.ts`) and applied through the
   pipeline.
3. The top 2–3 strategies run on both embedders, with results on the dashboard.
4. A one-page **recommendation** for Voytek: what to embed, the measured gain on held-out questions, where it helps
   and hurts, the cost, and whether and how it ships. That includes an honest "it didn't help" if that's the result.

## Non-goals and rules

- Don't change `northwind-golden-v1`, its labels, the metric definitions, or the pgvector engine's retrieval logic.
- No query-time LLM calls. Index-time generation only.
- Don't tune the scoring or ranking. We're changing what gets embedded, nothing else.
- Any Metabase source change: route 2 or 3 above, with F's and Voytek's approval. Clojure only for that hook.
- No hosted LLM APIs without Voytek's explicit OK (cost and data). Local Ollama models are fine.
- Sync with F before each step (the memo, the corpus, each strategy, each run batch). Log everything in `worklogs/I-embedresearch.md`.
