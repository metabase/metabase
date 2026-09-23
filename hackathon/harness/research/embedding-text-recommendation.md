# What should semantic search embed? Recommendation

Agent I, 2026-09-23. For Voytek. Status: **FINAL for this study (harness, vector-only harness and replay all in).**
Background and literature: `research/embedding-text.md`. Full tables: `research/embedding-text-results.md` (harness)
and `research/embedding-text-replay.md` (supplementary vector-only replay).

## The answer in four lines

1. **Auto-describe undocumented cards.** Write a one-sentence plain-English description of what each card's query does
   into cards that have none. Cards named "Query 17" go from nearly unfindable to found: on held-out questions,
   semantic search improved by +0.43 to +0.54 nDCG@10 (0.40 → 0.93–0.97), and keyword search by nearly as much.
2. **The gain is in the embedding itself.** With pgvector's keyword arm switched off (BL-35), results are the same: 55–60
   of 60 questions score identically, and the gains are +0.42 to +0.54. The supplementary replay agrees.
3. **Why describe rather than just embed the SQL** (E's `context-sql`, which already works well): a description also
   covers GUI cards, beats raw SQL on arctic, and helps keyword search. For SQL cards on all-minilm, raw SQL is about as good.
4. **Start with the no-AI version**: Metabase's own query description for GUI cards, plus rule-based SQL → English. It gets
   87–94% of the local model's gain for free. A local model (qwen3:8b, ~0.4 s/card) adds a little more, mostly on SQL-only questions.

## What we tested

Many real cards have names like "Query 17" and no description. Their meaning is only in the query, so semantic search
can't find them. We tested writing a short plain-English description of each card's query into its description field,
two ways:

- **mech**: a mechanical translation, no AI model. SQL cards go through our rules (`embedtext/sql2text.ts`), e.g. "Percent
  late by carrier, where with a delivered date. From Shipments." GUI cards get **Metabase's own wording**: the same
  `describe-query` text the product already shows, read through the MCP `get_content` tool.
- **llm**: a small local model (qwen3:8b through Ollama, about 0.4 s per card on this laptop) writes one or two sentences.

Each ran two ways: **fill-empty** (only cards with no description get text: "auto-describe undocumented cards") and
**fill-all** (text appended to every card's description, to see if it hurts well-described cards). The controls were
today's behaviour (`baseline`), and the embedding variants `context` and `context-sql` (raw SQL embedded).

## How we made sure the numbers can be believed

- **A new test set where SQL matters**: `northwind-sql-v1`, 112 items. 44 SQL cards with vague names and no description,
  20 well-described SQL cards, 24 GUI cards with real filters, and 24 distractors. The golden set has no SQL cards, so it
  couldn't test this.
- **The questions were written blind.** A separate agent saw only a one-line intent per card, never the SQL, the card
  names or any generated text.
- **The dev/held-out split and the right answers were frozen before any question existed.** 36 dev questions for building,
  24 held-out for the headline.
- **The generated texts were frozen (hashed) before any strategy was measured.** The analysis script and the rule for
  picking the pure-vector strategy were also written in advance.
- **The statistics are the dashboard's**: paired per question, Δ nDCG@10 ± 95% CI, "better" only when the whole
  interval clears zero.
- **Disclosed**: before the freeze I saw baseline-only numbers per category (mixing dev and held-out). Nothing was tuned
  on them. I rejected qwen's first prompt on output format alone (boilerplate lines, invented breakdowns), before measuring.
  Known flaws in the kept text: 38/104 start with "This chart", and one invented filter.

## Attribution: is it the embedding or the keyword search?

A description is read by keyword search too. The `semantic` engine is always hybrid: vector plus keyword, merged
(`index.clj:902-916`). So a gain there could be keyword-driven. We separate the two three ways:
1. the keyword engines (`appdb`, `in-place`) on their own;
2. `semantic-pure` runs (they remove the appdb top-up, but pgvector's own keyword arm stays);
3. a **supplementary vector-only replay** (cosine only, exact embedded text);
4. **`semantic-vector` harness runs** (BL-35: pgvector with its keyword arm switched off). On golden, switching the keyword
   arm off changed semantic by −0.025 ± 0.023. On the SQL corpus, 55–60 of 60 questions scored identically in every arm (mean
   difference 0 to −0.02). **The gains are vector gains.** Keyword engines (appdb, in-place) gain separately from the same description text.

## Results (held-out questions: 24 never used while building)

Δ = change in nDCG@10 (0–1 ranking quality) vs today, ± 95% range. "Better" means the whole range is above zero.

| What gets embedded | semantic, all-minilm | semantic, arctic | vector-only harness (BL-35), minilm / arctic | vector-only replay, minilm / arctic |
|---|---|---|---|---|
| Raw SQL (`context-sql`, E's variant) | +0.38 ± 0.15 | +0.26 ± 0.13 | +0.38 / +0.25 | +0.36 / +0.19 |
| Mechanical description, empty cards only | +0.47 ± 0.16 | +0.43 ± 0.17 | +0.46 / +0.42 | +0.47 / +0.41 |
| Local-model description, empty cards only | +0.54 ± 0.16 | +0.50 ± 0.16 | – | +0.50 / +0.47 |
| Local-model description, all cards | +0.56 ± 0.17 | +0.53 ± 0.17 | +0.54 / +0.51 | +0.49 / +0.51 |

- **Where it helps**: questions answerable only through the query (SQL-only: +0.59 to +0.76; GUI-only: large but only 3
  held-out questions). Raw SQL can't help GUI cards at all. Describing the query can.
- **Where it doesn't hurt**: well-described cards stay at the top (no proven change in any arm). The replay hinted that on
  minilm, appending model text to good descriptions might dip them (−0.12 ± 0.21, 6 questions). The vector-only harness
  run **did not confirm it** (+0.03). Filling empty descriptions is still the safer product default.
- **vs raw SQL, vector only** (harness with the keyword arm off, confirmed by the replay): raw SQL is a strong baseline,
  stronger than the literature suggested. Harness numbers: local-model description vs raw SQL, minilm +0.17 ± 0.12 overall
  (SQL-only +0.13 ± 0.16, not proven); arctic +0.26 ± 0.10 overall, SQL-only +0.28 ± 0.14. Mechanical description vs raw SQL,
  minilm +0.09 (not proven); arctic +0.17 ± 0.10 overall, SQL-only not proven.
  - **all-minilm**: for SQL cards, a description is *not* proven better than raw SQL (+0.01 to +0.08). It wins overall
    (+0.13) only because raw SQL can't help GUI cards.
  - **arctic**: the local-model description beats raw SQL clearly (+0.28 to +0.31), and still does in the replay with the
    `query: ` prefix added (+0.20; SQL-only +0.13), though the harness shows the prefix doesn't help overall (see BL-33 below). The mechanical description is then no longer proven better on SQL-only questions.
  - On today's hybrid engine the numbers are nearly the same (+0.18 minilm, +0.27 arctic): the keyword arm barely changes
    the ranking on this corpus.
  - Not supported: my guess that minilm gains more from SQL because it reads only the SELECT list. Keeping just the
    SELECT list is slightly *worse* on both models.
- **Keyword engines move too** (in-place +0.40, appdb +0.11 on held-out): the description is ordinary text, so every engine benefits.
- **Messier SQL**: with the analysts' output aliases blanked (`as c1`), descriptions keep 70–80% of their gain, and raw
  SQL keeps 95% (minilm) or 70% (arctic). So raw SQL's strength isn't just tidy naming. The mechanical translator depends
  on aliases more than the local model does.
- **Ceiling**: most held-out questions reach a perfect score with descriptions, so small differences between strategies
  aren't meaningful at this corpus size.

## Cost

- mech: milliseconds per card, no model.
- llm (qwen3:8b, this laptop, one Ollama): 0.40 s/card → ~7 min per 1k cards, ~67 min per 10k, ~11 h per 100k,
  plus re-embedding. Only query-bearing items (cards, models, metrics) need it.
- Nothing silently dropped: every run indexed 160 documents, the same as baseline. Descriptions are 10–40 words, well inside
  all-minilm's window.

## Does it ship?

- **Mechanical, yes, with no AI.** GUI cards: Metabase already computes the text (`lib/describe-query`, used by the UI
  and the MCP `get_content` tool). SQL cards: a small rule-based translator (ours is ~200 lines of TypeScript; a
  Clojure port, or a SQL parser Metabase already ships, would do). It can run at card save or as a background backfill.
- **Local or hosted model: optional.** A background job per card, cached until the query changes. Metabot's LLM is a natural host.
  Needs a review of invented details (a spot check found one of 104 texts adding a filter that wasn't there; not a full audit).
- **Product shape**: either write the text into the description (visible, editable, helps every engine; that's what we
  tested), or keep it as hidden embedding-only text (needs a small ingestion change; vector-only effect per the replay).

## Next strategies (not tested)

- **Tables**: embed column names (today a table's vector has no columns at all).
- **Dashboards**: embed the names of the cards on them.
- **The content of every item type (the biggest gap in this study)**: we enriched and tested *questions* only. Tables
  (columns), dashboards (their cards), segments/measures (definitions), models (columns), documents (body) and collections
  (contents) are embedded by name and description only, so undocumented ones are as invisible as "Query 17" was. Testing it
  needs a corpus with undocumented items of every type, questions targeting each, and one content→text generator per type.
- **Separate vectors** per field (name, description, query summary, generated questions): best in the literature,
  but it changes the pgvector engine.

## Also found along the way

- `context` hurt mostly because of one repeated line (`chart: table`), not text length (see the research memo).
- **BL-33**: Metabase sends no `query: ` prefix to arctic-embed2 (its name matches neither pattern in `embedding.clj:697-698`),
  which contradicts the model's own guidance. **But adding it didn't help on our corpora** in real harness runs: arctic +
  "query: " vs without was −0.029 ± 0.054 on golden and **−0.070 ± 0.048 on the SQL corpus** (baseline text). The replay
  agrees at baseline (≈0) and hinted at small gains only with rich descriptions (+0.04 to +0.05, unconfirmed in the harness).
  So arctic is not understated by it here. It's still worth fixing the pattern for correctness, but not for a gain.
