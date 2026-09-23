/**
 * Plain-words glossary for the Search Harness dashboard: one line per term, written for a reader who is
 * technical but not an information-retrieval person. It feeds two places, so they cannot drift apart:
 * the "Glossary" tab, and the terms appended to each card's description (the ⓘ tooltip).
 */

export const GLOSSARY = {
  "What we compare": {
    "Engine": "One search implementation under test. Every engine gets the same questions over the same catalogue.",
    "semantic": "Metabase's shipping semantic search. It is hybrid: its own index (pgvector, a separate Postgres, not the app DB) matches both by meaning and by words, and merges the two. On top of that it tops up with appdb keyword hits when it finds too few.",
    "semantic-pure": "semantic with the appdb top-up switched off. Still hybrid (meaning + words in its own index), so it is not pure vector search: semantic-vector is.",
    "semantic-vector": "semantic with both its keyword part and the appdb top-up switched off: pure vector search over its own index. The reference for how much of semantic comes from embeddings alone.",
    "appdb": "Metabase's regular keyword search index in the app DB. On H2 (as here) its text-match part can't tell good matches from weak ones, so its ranking leans on the other signals (recency, popularity). That's why it can differ slightly between two runs of the same questions. It never searched the text of SQL questions here: the harness doesn't set search_native_query, so SQL text went unsearched in every run.",
    "in-place": "Simple keyword search with no index. It orders results its own way but reports no score, so its score shows as n/a. It never searched the text of SQL questions here: the harness doesn't set search_native_query, so SQL text went unsearched in every run.",
    "sqlite-vec1": "Libor's engine: vector-only search (no keyword part) stored in SQLite (sqlite-vec1), no pgvector needed. Like semantic, it tops up with appdb keyword hits; sqlite-vec1-pure has the top-up off.",
    "lucene": "Paolo's engine: a Lucene index. Its vector part uses an approximate (HNSW) index; its keyword part is the appdb keyword search, which ran on H2 in our runs. lucene-pure has the appdb top-up off.",
    "Vector vs keyword engine": "A vector engine matches by meaning, using embeddings (semantic is hybrid: meaning and words). A keyword engine (appdb, in-place) matches words only.",
    "Hybrid": "Search that matches both by meaning (embeddings) and by words, then merges the two rankings (reciprocal rank fusion: an item near the top of either list ends up near the top). semantic, semantic-pure and lucene are hybrid; sqlite-vec1 and semantic-vector are vector-only.",
    "Top-up": "When semantic finds fewer than `semantic-search-min-results-threshold` results (100 by default, so almost always), it adds appdb keyword hits. It never does this when semantic finds nothing at all. So semantic's results can include appdb's; semantic-pure (top-up off) shows how much that matters.",
    "Cosine cutoff (0.7)": "semantic drops matches that are too far in meaning (cosine distance above 0.7). If everything is too far, it finds nothing.",
  },
  "The test set": {
    "Corpus": "The fixed catalogue of Metabase items (cards, dashboards, tables…) every engine searches, with its questions. `northwind-golden-v1`: 235 items, 56 hand-labelled questions. `northwind-sql-v1`: 60 labelled questions about SQL cards (36 dev + 24 held-out; the dashboard pools both). `scale-1000-seed-42` / `scale-10000-seed-42`: generated catalogues used only to time searches, no right answers.",
    "Scenario": "One test question plus its answer key. The golden corpus has 56; the SQL corpus 60.",
    "Answer key (expected, labelled answers)": "The items a person marked as right answers for a question.",
    "Grade": "How right an answer is: 2 = highly relevant (✓✓), 1 = relevant (✓).",
    "Must-not-read items (expectedAbsent)": "Items the test user has no permission to see. They must never appear in results.",
    "Category": "The kind of question a scenario tests. There are 8: paraphrase, concept, exact-name, rare-token, typo, cross-lingual, ambiguous, empty-expected. A question can have two (exact-07 is exact-name and ambiguous), so category counts add up to 53, not 52. empty-expected questions have no ranking score.",
    "paraphrase": "Asks in different words than the item's name (\"how much money did we bring in\").",
    "concept": "Asks about a topic rather than a name (\"customer churn\").",
    "exact-name": "Types the item's name as it is.",
    "rare-token": "Contains an unusual code or word that few items mention (\"SKU-4471\").",
    "typo": "Misspelled (\"retrun rate\").",
    "cross-lingual": "Asks in another language than the item is written in (Polish question, English item).",
    "ambiguous": "Could mean several things (\"Revenue\"), with look-alike wrong answers.",
    "empty-expected": "Nothing in the catalogue should match. The right response is no results.",
  },
  "Settings we vary": {
    "Embedding": "A text turned into a list of numbers, so that similar meanings get similar numbers.",
    "Embedder": "The model that makes embeddings. Measured so far: `all-minilm` (the one semantic uses today) and `snowflake-arctic-embed2`.",
    "all-minilm": "Small, English-focused embedding model: 384 numbers per text, and it reads at most about 512 tokens (a few hundred words); the rest is cut off.",
    "snowflake-arctic-embed2": "Larger, multilingual embedding model: 1,024 numbers per text, and it reads long text (up to 8,192 tokens). That's why it handles questions in other languages. Adding the 'query: ' prefix it expects (runs labelled +qprefix) didn't help here: golden no difference (−0.03 ± 0.05), SQL corpus slightly worse (−0.07 ± 0.05).",
    "Embedding text": "Which fields of an item get embedded. baseline = item type + name + description; context = + collection, table, chart type; context-sql = + the query's SQL.",
    "Text strategy": "What was written into the catalogue items' descriptions before the run. Each strategy is its own run; the filter picks one so runs never mix. The added text is also visible to keyword search, not only to embeddings.",
    "none": "Text strategy: the catalogue's descriptions as they are.",
    "mech-fill-empty": "Text strategy: cards with no description get a rule-based, no-AI translation of their query into English (e.g. what it counts, filters and groups by). Described cards are untouched.",
    "mech-fill-all": "Text strategy: the same rule-based translation, appended to every card's description, to see whether it hurts cards that were already described.",
    "llm-fill-empty": "Text strategy: cards with no description get one or two sentences written by a small local AI model (qwen3:8b) from the card's name, query and tables.",
    "llm-fill-all": "Text strategy: the same AI-written sentences, appended to every card's description.",
    "Scale": "Catalogue size tier. The golden set (235 items) has none; generated catalogues of 1k and 10k items are used only to time searches (they have no right answers).",
    "Run": "One pass of every question through every engine, under one combination of settings. Cards read the latest finished run for each combination and engine.",
  },
  "Quality metrics": {
    "@10": "Only the first 10 results count, like the first page of search results.",
    "nDCG@10 (ranking quality)": "0 to 1: how well the engine put the right answers near the top of its first 10 results. A grade-2 answer counts twice as much as a grade-1 answer. Higher is better.",
    "Recall@10 (share found)": "0 to 1: the share of right answers that appear in the first 10 results. Higher is better.",
    "MRR (first right answer)": "1 if the first result is right, ½ if the second, ⅓ if the third…, 0 if none; averaged over questions. Higher is better.",
    "Zero-result rate": "The share of questions that have a right answer where the engine returned nothing at all. Lower is better.",
    "False-positive rate": "The share of no-answer questions where the engine returned something anyway. Lower is better.",
    "Permission leak": "The engine showed an item the user is not allowed to see. Must be 0; if not, that engine's other numbers can't be trusted.",
    "Jaccard@10 (overlap)": "The share of top-10 results two engines have in common: 1 = identical lists, 0 = nothing shared. Says nothing about which one is right.",
    "Unscored": "The share of questions where every attempt errored, so the engine has no score for them and they're left out of its averages. Blank = not measured for these runs (the metric is newer than they are). Lower is better.",
    "Score": "The engine's own relevance number for a result. Every engine uses its own scale, so don't compare scores across engines.",
  },
  "Speed": {
    "Latency": "Time from sending a search to getting results back, in milliseconds (ms). Lower is better.",
    "p50 / p95 / p99": "Half / 95% / 99% of searches are faster than this. p50 is the typical search; p95 and p99 are the slow ones users notice. Lower is better.",
    "Iteration": "Each question is sent 5 times to time it (after unmeasured warm-up repeats); latency counts every timed repeat. So n = questions × 5.",
    "Log scale": "Each gridline is 10× the one below; use it to compare growth rates, not absolute gaps.",
    "Stages (Embed / Store / Filter / Other)": "Where the time goes: turning the question into an embedding, looking it up, permission filtering, everything else. Real runs only see total time, shown as Other.",
  },
  "Reading the statistics": {
    "n": "How many questions (or measurements) a number is based on. Below ~5, treat it as an anecdote.",
    "Mean / median": "The average / the middle value.",
    "p25 / p75": "A quarter of questions score below p25 and a quarter above p75; the middle half sits between.",
    "± 95% CI": "The range the true value probably falls in, given only this many questions (average ± 1.96 standard errors). A difference whose range includes 0 is not proven.",
    "Wins / ties / losses": "On how many questions one engine scored higher / the same / lower than the other.",
    "Δ (delta)": "The change between two setups, e.g. variant minus baseline. Positive = better.",
    "Paired": "Compare two setups on the same question first, then average, so that easy vs hard questions don't blur the result.",
    "Baseline": "The reference setup everything else is compared against.",
    "Box plot": "The box holds the middle half of the questions, the line inside is the median, whiskers show the range, dots are outliers.",
    "Variance share": "How much of the ups and downs in scores comes from each choice (engine, embedder, which question). Needs ≥2 engines and ≥2 embedders to mean anything.",
    "Main effect / interaction": "Main effect: what one choice changes on its own. Interaction: what only shows up in combination (e.g. an English-only model on Polish questions).",
    "Heatmap": "Cell colour tracks the value: stronger colour = higher. In red-to-green tables, green = better than baseline, red = worse. A red row flags something that should be 0.",
  },
} as const satisfies Record<string, Record<string, string>>;

type Glossary = typeof GLOSSARY;
export type Term = { [S in keyof Glossary]: keyof Glossary[S] }[keyof Glossary];

const LINES = new Map<string, string>(
  Object.values(GLOSSARY).flatMap((section) => Object.entries(section)),
);

const line = (term: Term) => `**${term}**: ${LINES.get(term)}`;

/** A card description followed by the one-line explainer of every term the card uses. */
export const explain = (description: string | undefined, terms: Term[]) =>
  [description, terms.map(line).join("\n\n")].filter(Boolean).join("\n\n");

/** The terms one tab uses, as markdown for a text card at the bottom of that tab. */
export const termsMarkdown = (terms: Term[]) =>
  "### Terms on this tab\n\n" + terms.map((t) => `- ${line(t)}`).join("\n") + "\n\nAll terms: **Glossary** tab.";

/** The full glossary as markdown, for a dashboard text card. */
export const glossaryMarkdown = () =>
  "# Glossary\n\nEvery term on this dashboard, in one line. Each tab also ends with the terms its cards use.\n\n" +
  Object.entries(GLOSSARY)
    .map(([heading, terms]) => `### ${heading}\n\n` + Object.entries(terms).map(([t, l]) => `- **${t}**: ${l}`).join("\n"))
    .join("\n\n");
