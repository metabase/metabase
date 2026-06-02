The `search_prompt_entities` tool matches the user's request against a small, hand-curated library of saved search prompts. Each saved prompt is mapped to the entities that answer it, so a hit is a vetted shortcut from "what the user asked" to "the data to use" — much higher signal than open-ended `search`.

Give it a single `user_search_prompt`: a natural-language description of the data the user wants, phrased like the saved prompt you'd expect a curator to have written (not keywords). It is embedded and matched by vector similarity, then results are ranked by a blended score.

# When to use it

**Reach for `search_prompt_entities` first, for data selection.** Before falling back to `search`, check whether a curator has already answered this request. Use it when the user wants an answer that depends on choosing the right table, model, or set of sources.

- "What's our monthly revenue by region?" → a curated prompt may map straight to the canonical table or model.
- "How many orders per customer last quarter?" → a curated prompt may hand you the exact source entities to join.

Then fall back to the general tools:
- Use `search` for open-ended discovery when no saved prompt matches — finding where something lives by topic.
- Use `read_resource` to drill into any entity a hit points at (its URI patterns: `metabase://table/{id}`, `metabase://model/{id}/fields`, `metabase://model/{id}/sources`, etc.) before building a query.

# Reading the results

Each result is `{saved_search_prompt, entities, score}`, sorted best-first.

- `saved_search_prompt` — the curated prompt that matched. Skim it to confirm the match is really about the same thing the user asked; a high score on a subtly different prompt is still the wrong data.
- `score` — a `{scores, total_score}` breakdown like regular search: `scores` is a list of weighted factors (`similarity` = 1 − cosine distance; `canonical` and `verified` indicators), each with its `score`, `weight`, and `contribution` (= score × weight). `total_score` is the sum of contributions and is what the list is sorted by. Treat it as relative ranking, not an absolute threshold.
- `entities` — what to actually use. There are two shapes:

## `entities.type = "canonical"`

A single specific entity that **directly answers** the request — `{"type":"canonical","entity":{"model":"table","id":42}}` (or a `card`/`model`/`metric`). Prefer these: the curator has already decided this is the right thing. Read it with `read_resource` (e.g. `metabase://table/42/fields`) to confirm its columns, then query it directly.

## `entities.type = "sources"`

A set of one or more source entities you are expected to combine yourself — `{"type":"sources","entities":[{"model":"table","id":1},{"model":"card","id":9}]}`. The curator is telling you *which* data to start from, not the finished answer. Read each source's fields and lineage (`read_resource` on `/fields` and `/sources`), then construct the query — filtering, aggregating, and joining as the request needs.

# Best practices

- **Prefer canonical hits** when their score is competitive — they skip the query-construction guesswork.
- **Don't trust score alone** — read `saved_search_prompt` to make sure the matched prompt is genuinely the user's intent before using its entities.
- **Drill before building.** Always `read_resource` the entities a hit points at to confirm fields and lineage; don't assume schema from the prompt text.
- **Phrase the query like a saved prompt**, not as keywords — this tool matches on meaning, so a full natural-language description retrieves better than terse terms.
- **Fall back gracefully.** If nothing matches (or the matches are off-topic), switch to `search` for open-ended discovery.
