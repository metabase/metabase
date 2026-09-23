# Agent G: explainer (make the results understandable)

Read `_shared-context.md` first (including **Worklogs**, which are required). Session: metabase-sqlite-semantic-search (main). **Status: DONE, 2026-09-23, confirmed by F (after BL-31/32/36/37 reopens and the final glossary lines).** Voytek's ruling: the reading guide lives in the dashboard itself. F owns the Text strategy tab check when I's first strategy run lands; any future card work (new engine columns, strategies) will be reopened by F or handed to H.
Brief written by Agent F (overseer), 2026-09-23.

## Mission

Voytek owns this harness, but he hasn't read any of its code and doesn't understand any of its charts. He won't read
code. He needs to **understand the results well enough to present and defend them.** Your job is to get him there.

Success is not a prettier dashboard. **Success is that Voytek, with no help, can answer the questions below from what
you give him.** Test it that way before you call it done.

## Who you're writing for

- A Metabase engineer. Technical, but not an information-retrieval person. "nDCG", "MRR", "Kendall tau", "Jaccard",
  "variance share" and "CI" mean nothing to him until you explain them.
- Has five minutes, not an hour. Lead with the answer, then the evidence.
- Will present this to other people. Give him sentences he can say out loud, and the caveats he'll be asked about.

## What the harness does, in plain words (verify it, then reuse it)

We have several search engines inside one Metabase instance. We load the same hand-made catalogue of ~234 items
(cards, dashboards, tables, and so on; the "golden corpus", Northwind Outdoor theme). We ask all the engines the same 56
questions. For each question we already know which items are the right answers, and how good each one is (grade 1 = relevant, 2 = highly relevant).
We record what each engine returned, and how fast, and score it.

- Engines today: **semantic** (pgvector + Ollama `all-minilm`, the shipping engine), **appdb** (keyword search in the
  app DB), **in-place** (naive keyword). Coming: **sqlite-vec1** (Libor) and **lucene** (Paolo).
- Other axes (comparison dimensions), not yet run on real data: embedder (`snowflake-arctic-embed2`), embedding-text
  variant (Agent E), and corpus scale (100 / 1k / 10k).
- Where things live: results DB `harness` in the `semantic_search-postgres-1` container. Dashboard "Search engine
  comparison" on :3002 (id 12). Definitions: `01-contracts.md`, `metrics/src/metrics.ts`,
  `sql/02-views.sql`, `results/src/dashboard-cards.ts`.

## What the real data says today (verified by F on run `20260923-145150-29002c`)

| Engine | nDCG@10 | Recall@10 | MRR | Returns nothing when an answer exists | p50 / p95 latency |
|---|---|---|---|---|---|
| semantic | 0.601 | 0.595 | 0.728 | 6% | 33 / 48 ms |
| in-place | 0.490 | 0.499 | 0.627 | 6% | 36 / 55 ms |
| appdb | 0.310 | 0.254 | 0.425 | **54%** | 13 / 19 ms |

Paired per question (nDCG@10), semantic beats in-place 26 times, loses 14, and ties 12 (Δ +0.111 ± 0.090). It beats appdb 33
times, loses 2, and ties 17 (Δ +0.291 ± 0.089). appdb finds exact names fine but returns nothing for most paraphrase, typo and
cross-lingual questions.
Caveat to carry: "semantic" is the shipping engine as-is. When it finds too few results, it **tops up with appdb keyword
hits**, so it is not pure vector search.

Re-check these numbers before you use them. More runs will land while you work.

## Known problems with the current results layer (from F's audit; fix or work around)

Correctness (these give wrong or misleading readings):
1. **Quality summary CI**: `dashboard-cards.ts:316,326-327`. It uses unpaired per-engine CIs on the same questions, so it says
   "don't call a winner" when the paired difference is real. It also divides by `count(*)` against `count(DISTINCT)`, which
   pools scale tiers. Replace it with a paired comparison: wins/ties/losses and Δ ± CI against a reference engine.
2. **"Change vs baseline" embedding-text card**: `:516`. The self-join ignores `data_scale` and `embedder`, and pairs
   wrongly when those filters are empty.
3. **Category heatmaps** (`:348-351, 459-462, 360-368`) mix topic tags (finance, hr, churn…) with the 8 query categories.
   That gives 25 rows, many with n=1. Filter to `CATEGORY_TAGS` (`shared/types.ts:100`), and add the "expected winner" per
   category from `01-contracts.md` §3.
4. **Variance share** (`sql/02-views.sql:96-126`) reports "100% Query" when there's only 1 engine family or 1 embedder.
   That reads like a finding. Hide it until there are ≥2 levels of each.
5. **Stale text**: "~40 scenarios" (:227; there are 56), fixture-default note (:37), and "0.7 cutoff shows up here" (:452; on
   golden it's appdb at 54%, not semantic).
6. Empty or degenerate on real data today (no tiers, variants or second embedder yet): the two latency-vs-size charts,
   "where the time goes" (always 100% Other over HTTP), both "store vs model" cards, and all 4 embedding-text cards.
   Duplicates: the recall box plot (nDCG is enough), and "spread within each category".
7. In-place scores are always 0 (the API returns no scores for it). The drill-down shows "·0" for every in-place row.
   Explain it or hide it.

**Not yours** (A owns them; ask A, don't change them): the `harness_latest_run` view key (a later run can hide earlier
engines), fixture-run deletion, and the runner/pipeline. A is fixing these now. Coordinate before you touch
`sql/02-views.sql`.

## Deliverables

> **Decision (Voytek, 2026-09-23):** the guide lives **in the dashboard itself**, with no separate artifact or doc. "I want the
> dashboard to be as self-explanatory as possible." Deliverable 1's content goes into a "Start here" tab plus per-tab
> "How to read this tab" cards. Numbers come from live query cards; any quoted number is stamped "as of run <id>".

1. **A one-page reading guide**, "How to read the search harness results". Publish it where Voytek reads it; ask him
   (doc or artifact), and default to an artifact. It needs:
   - The setup in 5 sentences, with one diagram at most.
   - A glossary in plain words, one line each, with "higher/lower is better" and a concrete example from our data:
     nDCG@10 ("ranking quality"), recall@10 ("share of right answers found"), MRR ("how high the first right answer
     is"), zero-result rate, false-positive rate, permission leak, Jaccard ("% of results two engines share"), p50/p95,
     CI and n.
   - For every card you keep: the question it answers, how to read it, and what it says right now.
   - The current verdict in 3–5 sentences he can say out loud, plus the caveats he'll be challenged on (the top-up, one
     embedder, H2 app DB, 56 hand-written questions, no scale tiers yet).
2. **A simpler dashboard.**
   - About ≤12 cards, with a "Verdict" text card at the top of the first tab and a glossary text card.
   - Plain-word metric names in titles and axes, and fixed or hidden broken cards (list above).
   - The drill-down "ranked results side by side" card near the front: it's the most understandable card there is.
   - Hide cards that need data we don't have yet. Don't delete their code; A's future runs will fill them.
   - You own `results/src/dashboard.ts` and `dashboard-cards.ts`. D is done but can answer questions (session
     `metabase-sqlite-semantic-search-02`). Use D's `npm run check` (results/) after every change: 0 errors.
3. **A "what would change the verdict" section**: what the new engines, arctic, variants and scale tiers could each
   show, and which card will show it. Then Voytek knows what to look at when those runs land.

## Done when

Hand Voytek the guide, the dashboard link and these questions, and confirm he can answer them from your material alone.
Before that, test it yourself with a fresh subagent that has only the guide and dashboard, no code:
- Which engine is best on our questions, by how much, and how sure are we?
- What kinds of questions does each engine fail on?
- What does "semantic" actually include, and why does that matter?
- How fast is each, and does speed matter at this size?
- What don't these results tell us yet?

## Non-goals

- Don't change metrics definitions, the runner, the corpus or the labels. If a number looks wrong, report it to F/A with
  evidence.
- Don't tune any engine.
- Don't write Clojure, and don't touch Metabase source.
- Don't ask Voytek to read code or SQL, ever.
