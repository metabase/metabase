# What should semantic search embed? Research memo

Agent I, 2026-09-23. For Voytek, via F. Status: **proposal, nothing built yet.**

## The short version

- Today each item is embedded (turned into a vector that captures its meaning) from `[card]` + name + description.
  For a card called "Query 17" with no description, the vector carries almost no meaning, even when the SQL clearly
  says "refunded orders by country, last quarter".
- Research on code search and table search agrees: **embed a short plain-English description of what the item
  computes, not the raw code and not a pile of metadata lines.** Keep the text short and on one topic, and put the
  most important words first.
- Our own `context` variant got worse (0.601 → 0.573). I traced most of that to **one line, `chart: table`**. Details below.
- Proposal: build **(1) a mechanical query → English translator** (no AI model) and **(2) a local-model summary**
  (qwen3:8b through Ollama). Test both **outside-in**: we write the text into empty card descriptions over the API,
  with no Metabase code change. Keep **(3) raw SQL (`context-sql`)** as the control to beat.

## Why `context` made semantic search worse (F's question 1)

I replayed the 56 golden questions as plain vector search against the embedder directly. It's a scratch diagnostic;
nothing was written to the results DB. Its absolute numbers run lower than the harness's, because Metabase re-ranks
with its own scorers, so compare the rows with each other only. Metric: nDCG@10, a 0–1 score for "are the right
items near the top of the first 10?".

| Embedded text | all-minilm | arctic-embed2 |
|---|---|---|
| baseline (name + description) | 0.561 | 0.627 |
| `context` as shipped | 0.547 (wins/losses vs baseline 14/20) | 0.640 (18/10) |
| `context` **without the `chart:` line** | **0.571** (17/17) | **0.660** (22/6) |
| baseline without the `name:` / `description:` labels | 0.521 | 0.612 |

What this says:

1. **It's not the length.** The longest golden text is 339 characters, about 80 tokens, well inside all-minilm's
   256-token window (the most text the model reads; the rest is cut off). The window matters for SQL, not here.
2. **It's one noisy line.** `chart: table` is identical on most items, so it pulls all vectors toward each other. Short
   typo queries suffer most ("retrun rate" dropped from 0.61 to 0.00 in the real run). Take the line away and
   `context` beats baseline on both models.
3. **The labels aren't the problem.** Removing `name:` / `description:` hurt on both models.
4. **Model × text interaction.** Extra context helps the bigger arctic model clearly (+0.033) and the small all-minilm
   barely (+0.010). With 56 questions, gaps of about 0.01–0.02 are within noise.
5. Published work agrees. Embedders weight the **start** of the text most: irrelevant text at the start costs up to
   12.3% more similarity than at the end ([Lee et al. 2024](https://arxiv.org/abs/2412.15241)). all-minilm was trained
   on texts of 128 tokens at most ([model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)).

**Rule for every strategy below:** name first, then a short plain-English meaning. No repeated boilerplate lines.
Stay under about 100 tokens for all-minilm.

A side finding for E, not built: `context` without the `chart:` line would be a free improvement. It needs a
one-line Clojure change, so it's Voytek's call. I'm not proposing it here.

## The strategies

"Outside-in" means we can test it without touching Metabase code (F's question 2): the harness writes the generated
text into the card's **description** before indexing. The catch: keyword search sees the description too. That's a
real product option ("auto-describe cards"), and we'd report keyword and vector effects separately.

| # | Strategy | Evidence | Expected gain for us | Cost to index | Ships as | Outside-in? | Effort |
|---|---|---|---|---|---|---|---|
| 1 | **Query → English, mechanical.** MBQL: "Count of Orders where Status is refunded, by Created At: Quarter". SQL: tables, filters, grouping, time windows turned into words by rules | Query vs plain description scored 0.815 similarity against 0.728 for query vs raw code ([Greptile 2025](https://www.greptile.com/blog/semantic)). SQL→question generation is a solved-enough task ([Guo et al. 2018](https://aclanthology.org/D18-1188/)) | High for vague-name cards, `sql-only` and `concept` questions. None for well-named cards | Milliseconds per card | **No AI model.** A Clojure function eventually; MBQL is easy (Metabase already renders MBQL as English in the UI). SQL is harder: parse it or use rules | Yes: fill empty descriptions | Medium |
| 2 | **Local-model summary.** qwen3:8b writes one or two sentences on what the card answers, from name + SQL/MBQL + table names | Anthropic's "contextual retrieval" cut retrieval failures by 35% from embeddings alone ([Anthropic 2024](https://www.anthropic.com/engineering/contextual-retrieval)). LLM enrichment can also hurt: it fell below baseline on 2 of 3 datasets ([Harris et al. 2024](https://arxiv.org/html/2404.12283v1)) | Highest on SQL-heavy cards (it understands CASE logic and CTEs). Risk: invented meaning | Measured here: qwen3:8b ≈ 1 s/card, accurate; llama3.2:1b ≈ 0.2 s/card but invented a "top 3" | Local or hosted LLM, as a background job. Metabot's LLM is a natural host | Yes | Low (TypeScript + cache) |
| 3 | **Generated questions (doc2query).** The model writes 3–5 questions each card answers | Works best when the questions get **their own vectors**. Appending them to the document "harms dense retrieval" ([Doc2Query++ 2025](https://arxiv.org/abs/2510.09557)). Separate question vectors gained up to 42 points in precision ([HyPE 2026](https://arxiv.org/abs/2607.29402)) | High for paraphrase questions, **if** separate vectors were possible | ~1–2 s/card | LLM + engine change | Only the "append" form, which the evidence says hurts | Low to try, high to do right |
| 4 | **Separate vectors per field** (name, meaning, questions), best score wins | Beat a single vector on the STaRK benchmark, average Hit@1 0.50 vs 0.36 ([mFAR, ICLR 2025](https://arxiv.org/abs/2410.20056), Table 1; its field weights are learned) | Likely the best design long term | More vectors per item | Changes the pgvector engine | **No.** Our rules forbid changing the engine; I can only simulate it offline | High |
| 5 | **Identifier clean-up.** `fct_orders_v2` → "orders", expand abbreviations | A text-to-SQL model's accuracy fell from 74.9% to 64.7% when column names were abbreviated ([Dr.Spider 2023](https://arxiv.org/pdf/2301.08881), [NameGuess 2023](https://arxiv.org/abs/2310.13196)). No direct study for embedders | Small. Metabase already shows human display names; this matters inside SQL | Negligible | No AI model | Folds into #1 | Low |
| 6 | **Order and length discipline.** Most informative text first, cut the boilerplate | Start-of-text bias ([Lee et al. 2024](https://arxiv.org/abs/2412.15241)), plus our chart-line result | Protects every other strategy | None | No AI model | Applied inside #1–#3 | None |
| 7 | **Raw SQL (`context-sql`, exists)** | Code embeds worse than its description (Greptile, above). SQL tokens and 1000 characters overflow all-minilm's window | Control. Probably small, maybe negative on all-minilm | Re-embed only | Already built (E) | Needs only the SQL corpus | None |

Out of scope, noted only: query-side tricks like HyDE (a model rewrites the user's question at search time). They
need an LLM call per search, which the brief rules out.

## Proposal: build #1 and #2, with #7 as the control

1. **#1, mechanical query → English.** It's the cheapest and ships with no AI model. If it gets most of #2's gain,
   that's the headline.
2. **#2, local-model summary (qwen3:8b, temperature 0, cached with model digest and prompt).** It shows the ceiling
   for "understand the SQL". llama3.2:1b is too loose on facts.
3. **#7, `context-sql`**, which already exists. It answers "can we skip the translation and just embed the SQL?".

Each runs in two forms:
- **fill-empty**: only cards with no description get text. This is the product option.
- **fill-all**: generated text is appended to every card's description. It shows whether the text hurts well-described cards.

Each runs on both embedders, on a new SQL-bearing corpus (next step, to be agreed with F). That corpus gets a dev
set and a held-out set, written down before any tuning; the held-out set gives the headline. #3 and #4 go into the
final recommendation as "next, needs an engine change", backed by an offline simulation only if time allows.

What the outside-in route can't separate: the text reaches both the vector and the keyword index. We report both and
state it plainly. If Voytek wants a vector-only number later, that needs route 2 of the brief (a small opt-in hook).
