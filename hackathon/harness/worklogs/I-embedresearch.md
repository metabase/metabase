# Agent I — embedding-text research

Session: `metabase-sqlite-semantic-search-b8 [4886d0]`. Brief: `agents/I-embedresearch.md`.

## 2026-09-23 — Started
- **What**: read START-HERE, _shared-context, E-embedtext, own brief. Created this worklog.
- **Why**: onboarding.
- **How**: no code or data touched yet. Step 1 is the research memo at `research/embedding-text.md`; synced with F before starting.
- **Open**: waiting on F for go-ahead on the memo step.

## 2026-09-23 12:10 — F go-ahead; diagnosis of why `context` hurt
- **What**: F approved the memo step (read-only). Launched a background literature survey. Built a scratch diagnostic
  (scratchpad `diag.py`, not in the repo): exported the 250 `context` texts from `mb_pl_golden_all_minilm` and the 56
  golden scenarios from run `…154430-7f2163`, rebuilt other text variants from them, and replayed every question as
  **pure vector** top-10 cosine against Ollama directly. It's a diagnostic only; nothing was written to `harness`.
- **Why**: F asked for an explicit reason `context` hurt, so no later strategy repeats it.
- **How / findings** (pure-vector nDCG@10, graded 2^g−1; not the harness's blended `semantic` engine number):
  | text | minilm | arctic |
  |---|---|---|
  | baseline | 0.561 | 0.627 |
  | context (as shipped) | 0.547 (W/L 14/20) | 0.640 (18/10) |
  | context minus `chart:` line | **0.571** (17/17) | **0.660** (22/6) |
  | baseline without labels | 0.521 | 0.612 |
  | context as a sentence | 0.563 | 0.630 |
  - The texts are at most 339 chars (~80 tokens), so the **256-token window is NOT the cause on golden**.
  - The `chart: table|scalar` line is the main culprit: an identical, meaningless line on most docs pulls them together.
    Typo questions suffer most (minilm typo 0.72 → 0.61). Harness per-question deltas agree (typo-01 0.61 → 0, typo-05 0.84 → 0.20).
  - Dropping the `field:` labels hurts on both embedders. The labels aren't the noise; a low-information line is.
  - Context helps arctic more than minilm (the embedder × text interaction).
  - Caveat: 56 questions, deltas of ~0.01–0.02 are within noise. No CIs computed for the diagnostic.
- **Also**: timed local SQL→English generation (warm, temp 0): llama3.2:1b ≈ 0.2 s/card, 220 tok/s, but it
  hallucinated "top 3" in a sample; qwen3:8b (`think:false`) ≈ 1.0 s/card, 68 tok/s, accurate. Ollama has
  llama3.2:1b, qwen3:8b, all-minilm and arctic-embed2 pulled.

## 2026-09-23 12:25 — Research memo written, sent to F
- **What**: `research/embedding-text.md` (new). 7 strategies with outside-in feasibility; proposal: build #1 (mechanical
  query→English) and #2 (qwen3:8b summary), with `context-sql` as control, each as fill-empty and fill-all, on both embedders.
- **Why**: brief deliverable 1; F's asks (why `context` hurt; outside-in column).
- **How**: literature via a background subagent. I spot-checked the load-bearing citations myself: Doc2Query++ (the
  abstract confirms concatenation harms dense retrieval, but has no numbers, so I cite no numbers), Greptile 0.8152 vs
  0.7280, Lee et al. 12.3%, HyPE up to 42 pp. A SQL-to-text "57%" claim was dropped as unverified. Not independently
  opened: mFAR, Harris et al., Dr.Spider, NameGuess numbers (taken from the subagent's report).
- **Open**: waiting for F's approval before the corpus step.

## 2026-09-23 12:50 — Memo approved; citations verified; MBQL→English found; corpus plan sent
- **What**: fixed 2 citations in `research/embedding-text.md`: mFAR is now 0.50 vs 0.36 (Table 1; the subagent had 0.41),
  and Harris et al. is cited without numbers (the fetched numbers were inconsistent). Dr.Spider's 74.9→64.7 is confirmed in Table 3.
  Every link was opened by me.
- **Found**: MCP v2 `get_content` (`POST /api/mcp`, session auth) returns `query_summary` = `lib/describe-query` for
  MBQL cards (`src/metabase/mcp/v2/tools/content.clj:133`). Tested read-only on :3003 (card 38 → "Query log, Percentile
  90 and Percentile 50, Grouped by Started At: Week, Filtered by …"). For native cards it returns only the SQL head, so SQL
  needs my own rules. `GET /api/card` also sets `query_description`, but only for metrics (`queries/models/card.clj:628`).
- **Plan sent to F**: corpus `northwind-sql-v1`, standalone on the golden warehouse and collections. 64 SQL cards
  (32 vague, 12 half-named, 20 well-described), 24 MBQL-rich cards, ~24 distractors. ~60 scenarios with `sql-only` /
  `mbql-only` as extra tags. A 60/40 dev/held-out split via `split-*` tags, frozen before any generation. The held-out
  questions are written by a separate subagent (leakage guard). Additive shared-code changes (lib.ts, apply.ts,
  generate.ts) need F's OK; pipeline asks go to A.
- **Open**: waiting for F.

## 2026-09-23 13:40 — corpus-gen change (F-approved), SQL corpus and scenarios built
- **What**:
  - `corpus-gen/lib.ts`: `EntityDef` gains optional `sql`, `mbql` (columns by name) and `display`, plus the
    `MbqlDef` types and `mbqlColumns`. `validateCorpus` checks that sql and mbql are exclusive, that sql is non-empty,
    that mbql columns exist in the card's table, and that these fields appear only on card-likes.
  - `corpus-gen/apply.ts`: `cardQuery` builds a native query from `sql`, or MBQL clauses from `mbql` with columns
    resolved to synced field ids (`mbqlClauses`). Cards without either are unchanged. `display` overrides the default.
  - (c) `generate.ts --source` already existed, so no change.
  - New `scenarios/corpus/northwind-sql.json` (`northwind-sql-v1`, 112 entities): 32 vague SQL cards, 12 half-named,
    20 well-described, 16 vague MBQL, 8 named MBQL, 24 distractors (12 cards, 4 metrics, 8 dashboards). Golden tables
    and the 12 collections used.
  - New `scenarios/src/sql-intents.json`: a one-line intent per entity. Only the blind writer uses it.
  - New `scenarios/src/sql-slots.json`: 60 slots with **split rule and labels frozen before any question existed**.
  - New `scenarios/src/sql.json`: 60 scenarios. Queries were written by a blind subagent that saw only the intents,
    never the SQL or names (except exact-name slots).
- **How / verified**:
  - Golden and scale-100 artifacts are **byte-identical** before and after (`diff -r`). `npm run typecheck` is clean.
  - All 64 SQL statements pass `EXPLAIN` read-only against `northwind_warehouse`.
  - `generate.ts golden --source …northwind-sql.json` validates (145 items).
  - `validate.ts` on sql.json: valid. 26 paraphrase, 16 concept, 8 exact-name, 4 rare-token, 6 ambiguous;
    36 dev / 24 held-out.
  - Authoring script kept in the scratchpad (`author_sql_corpus.py`); the JSON is the source of truth.
- **Not verified**: `apply.ts`'s native and MBQL paths against a live instance (needs A's `--corpus sql` run), and
  `resolve.ts` (needs its manifest).
- **Open**: A has fixed the flags (`--corpus sql`, `--corpus-file`, `--text-strategy` → `harness_run.text_strategy`)
  and is implementing them.

## 2026-09-23 14:30 — embedtext/ package built (no generation run yet)
- **What**: new workspace `embedtext/` (zero deps), added to root `package.json` workspaces (a one-line shared edit).
  - `sql2text.ts`: rule-based SQL→English. Handles aggregate aliases, GROUP BY (incl. positional), WHERE and HAVING,
    date windows, month and quarter extracts, CASE buckets, anti-joins ("excluding any in X"), ratios, LIMIT, and
    identifier normalisation with an abbreviation list. It leaves out what it doesn't understand.
    On the 64 corpus SQL cards: 5–23 words, mean 11.9.
  - `sql2text.test.ts`: 4 tests (normalisation, joins and window, anti-join, CASE, determinism). **4/4 pass.**
  - `llm.ts`: qwen3:8b through Ollama with temp 0, seed 1, `think:false`, at most 120 tokens. Prompt `v1` gets the
    title, main table and the SQL or GUI query. Cache `cache/llm-<model>.json` is keyed by sha256(digest, prompt)
    and records the model, digest, options and ms.
  - `harvest-mbql.ts`: MCP `get_content` → `query_summary` per GUI card, read-only, into `cache/mbql-describe.json`
    with the source url, version, time and manifest.
  - `derive.ts`: writes `artifacts/sql-text/<strategy>-<mode>/corpus.json` (strategy mech|llm, mode
    fill-empty|fill-all). Only card descriptions change. Fails if any card lacks text.
- **Also**: `artifacts/sql/{corpus.json,warehouse.sql}` generated with an explicit `--out`; `artifacts/golden` unchanged (md5).
- **How**: `npm run typecheck`: 5 workspaces, 0 errors. The translator output was reviewed by eye on all 64 cards.
  Fixes were driven by SQL patterns only (anti-join, CTE aliases, ratios, CASE, `x.name`), not by the questions.
- **Not run**: `llm.ts` (Ollama is held free for A's baselines) and `harvest-mbql.ts` (needs A's `--keep` instance on :3018).

## 2026-09-23 14:40 — MBQL harvest done; mech corpora derived; baseline sanity
- **What**: A's `--corpus sql` minilm baseline is run `20260923-163103-6ee999` (900 obs, 0 errors). apply.ts's new
  native and MBQL paths worked on the first live try (145 entities, 0 card errors), and resolve.ts resolved 60/60.
  `harvest-mbql.ts` against A's `--keep` instance :3018 gave 40/40 `query_summary` (28 MBQL + 12 plain distractors) →
  `cache/mbql-describe.json`, recording url, version, gitHead 188c8f41 (+2 uncommitted src files: E's), manifest and run.
  Told A it can drop :3018.
- `derive.ts --strategy mech`: fill-empty → 60 descriptions (exactly the 32+12+16 undescribed cards, no non-cards),
  mean 13.7 words; fill-all → 104, mean 10.6 words appended. Output in `artifacts/sql-text/mech-*/corpus.json`.
- **Disclosure**: I queried baseline per-tag nDCG@10 and saw rows for `sql-only`, `mbql-only` and `described`, which
  mix dev and held-out. They're baseline numbers only, with no strategy tuned on them. semantic: described 0.976, sql-only
  0.106, mbql-only 0.099. in-place: 0.953 / 0.102 / 0.077. appdb: 0.842 / 0 / 0. The corpus behaves as designed. From now on I look only at `split-dev` until the caches are frozen.

## 2026-09-23 14:55 — qwen3:8b summaries generated; caches FROZEN; 4 strategy corpora derived
- **What**: `llm.ts` over the 104 card-likes. Prompt v1 (0.58 s/card) was rejected on **format only**: "Measure: X
  Breakdown: None Filters: None" boilerplate (the chart-line problem again) and invented breakdowns on plain listings.
  v2 asks for prose and says what a plain listing is: 104 entries, 11–39 words (mean 20), **0.40 s/card warm**.
  Remaining flaws kept on purpose (no further prompt iteration, to avoid tuning): 38/104 start "This chart", 5 say
  "without any filters", and question-7 invents "in the last 30 days".
- **Frozen**: `embedtext/cache/FROZEN.md` holds the sha256 of mbql-describe.json, llm-qwen3_8b.json, sql2text.ts and the
  4 derived corpora. v1 output is kept in `cache/rejected-llm-qwen3_8b.prompt-v1.json`.
- **Derived**: `artifacts/sql-text/{mech,llm}-{fill-empty,fill-all}/corpus.json`. fill-empty: 60 cards each; fill-all: 104.
- **Cost so far** (for the recommendation): mech = milliseconds for 104 cards; qwen3:8b = 0.40 s/card on this laptop →
  ~7 min per 1k cards, ~67 min per 10k, ~11 h per 100k (one Ollama, sequential; re-embed cost comes on top).

## 2026-09-23 15:05 — Analysis script fixed in advance
- **What**: `embedtext/report.ts` writes `research/embedding-text-results.md`. It reads `harness_scenario_metric` (the dashboard's
  view). For each arm (variant/strategy) vs a reference (baseline/none and context-sql/none), per embedder × engine × slice
  (ALL, sql-only, mbql-only, described, 6 categories), split held-out (headline) then dev, it reports n, W/T/L,
  Δ nDCG@10 ± 1.96·sd/√n, a verdict (same rule, tie and MIN_N as dashboard-cards.ts), recall@10 ref→arm, and the
  zero-result rate. The run table includes `notes.corpus.semantic` (indexed count) to catch silent drops.
- **How**: dry-run on the 2 baselines. It lists both runs (indexed 160 each) and makes no comparisons yet. Typecheck is clean.
- **Concern for F**: per the run notes, `semantic` backfills with appdb when too few results pass the cosine cutoff, and
  appdb sees descriptions. So a description strategy's semantic gain may be partly keyword. Proposed pure-vector runs for the winners.

## 2026-09-23 15:15 — Pre-registered rule for the pure-vector runs (F: 4 runs, --pure-vector × {none, best} × {minilm, arctic})
- **Rule** (in `report.ts --select`, written before any strategy result exists): among the 4 strategies (variant baseline),
  engine `semantic`, all questions, **dev split only**; score = mean over both embedders of paired Δ nDCG@10 vs
  baseline/none. The highest wins. Ties within 0.005 go to the cheaper strategy (mech before llm, fill-empty before
  fill-all). `--select` prints dev numbers only.

## 2026-09-23 15:25 — Attribution caveat (from F, verified)
- pgvector `semantic` is always hybrid: `hybrid-search-query` (index.clj:902-916) full-joins `vector_results` with
  `keyword-search-query` and ranks with RRF. `--pure-vector` only removes the appdb top-up. Description text therefore
  reaches the ranking through pgvector's own keyword arm even in `semantic-pure`. The 4 pure-vector runs stay (they remove one
  of two keyword paths), and the method will say they can't fully isolate the vector gain.
- Clean vector-only check: Libor's sqlite-vec1 (distance only) once J and A have it in the matrix. It's the planned attribution check in the recommendation.
- Proposed to F: an out-of-harness vector-only replay now (cosine over the exact baseline embeddable text built from each derived corpus, the same method as the 12:10 diagnostic), labelled as supplementary.

## 2026-09-23 15:45 — Vector-only replay built (F-approved; not run yet, waiting for a gap from A)
- **What**: `embedtext/embeddable.ts` rebuilds the exact baseline embeddable text (mirrors `ingestion.clj` `embeddable-text`,
  with spec search-terms cited per model). **Verified 235/235 byte-identical** to `content` in the live golden index
  `mb_pl_golden_all_minilm_16135106f6` (the other 15 live docs are instance items, not corpus).
  `embedtext/replay.ts`: vector-only cosine ranking per arm × model, using C's `ndcgAtK`/`recallAtK`, paired stats as
  report.ts, held-out first. Writes `research/embedding-text-replay.md`, labelled SUPPLEMENTARY everywhere. Typecheck is clean.
- **Found (for F / backlog)**: `embedding.clj:697-698` query-prefix patterns match neither `snowflake-arctic-embed2`
  (Ollama's name) nor its v2 family, so Metabase sends arctic-v2 queries **without** the `query: ` prefix the model
  expects. The replay mirrors that (no prefix). Possibly a product bug. Not verified whether the pipeline sets `ee-embedding-query-prefix`.
- **A**: minilm controls landed: context-sql `20260923-164504-a41556`, context `20260923-164625-8dcef1` (gate 121/121).

## 2026-09-23 16:00 — Controls in; strategy runs started; recommendation draft
- Controls on sql/none (gate 1.00 each): minilm context-sql `20260923-164504-a41556`, context `20260923-164625-8dcef1`;
  arctic context-sql `20260923-164908-449ccb`, context `20260923-165035-eed3b1`.
- A started the 8 strategy runs (mech-fill-empty minilm first). The replay window is after the queue (A: no safe gap inside the chain).
- `research/embedding-text-recommendation.md`: method, safeguards, attribution and cost written before results; results pending.

## 2026-09-23 16:25 — Alias-blind check prepared (F-approved); first strategy run in
- **Why**: F reported that context-sql beats baseline strongly (held-out semantic: minilm +0.375 ± 0.154, arctic +0.260 ± 0.132).
  Threat: my SQL has tidy aliases (`chargeback_rate`), and the intents and questions echo them, so raw SQL may be flattered.
- **What**: `embedtext/aliasblind.ts` renames computed output aliases to c1, c2, … (rule in its header).
  `artifacts/sql-aliasblind/corpus.json`: 61/64 SQL cards changed, **EXPLAIN 64/64 ok**. The rule's first draft broke 3
  statements (it skipped aliases followed by FROM and renamed a CTE), fixed before any use.
  `llm.ts`/`derive.ts` gained `--cache-tag` so the alias-blind qwen cache is a separate file (the frozen one is never appended to).
  Alias-blind mech derived: sql2text degrades to "C1, c2 by method". **mech depends on analyst aliases** (a finding;
  sql2text stays frozen). Hashes in FROZEN.md.
- **Runs**: mech-fill-empty × minilm `20260923-165241-51bcdd`: corpusHash matches FROZEN, **indexed 160 = baseline 160**.
- **Pending** (A's Ollama window after the queue): alias-blind qwen batch → freeze → replay with arms none /
  context-sql / mech / llm on original vs alias-blind, plus a mechanism arm (arctic, SQL cut to the SELECT list).
  Then A's kept context-sql instance for the byte-check.
- 16:35 Replay reworked: generic arms (none, sql-text/*, blind:*, context-sql read verbatim from a kept live index,
  blind:context-sql with only the sql line swapped, probe:context-sql-select-only), each vs none and vs context-sql,
  a side-by-side original vs alias-blind table, and the BL-33 prefix section. Typecheck is clean. Not run yet.
- Seen (sent by F, after the freeze): the first strategy's held-out numbers (mech-fill-empty × minilm, semantic: vs none
  +0.474 ± 0.163; vs context-sql +0.099 ± 0.105). All texts, rules and the selection rule were already frozen, so nothing can be tuned on them.

## 2026-09-23 17:15 — All 8 strategy runs in; selection; held-out headline (hybrid semantic)
- Runs (all indexed 160 = baseline, corpusHash = FROZEN): fill-empty minilm mech `165241-51bcdd`, llm `165502-5049af`;
  arctic mech `165707-b24850`, llm `165916-c8e111`; fill-all minilm mech `170141-1b675d`, llm `170434-24cad1`;
  arctic mech `170646-75d430`, llm `170902-0ed38a`.
- `report.ts --select` (dev only, pre-registered): llm-fill-all 0.4796 > llm-fill-empty 0.4697 (gap 0.0099 > 0.005)
  > mech-fill-empty 0.4528 > mech-fill-all 0.4511 → **llm-fill-all** selected for the vector-only runs.
- `report.ts` → `research/embedding-text-results.md`. Held-out, engine semantic (hybrid), Δ nDCG@10 ± 95% CI:
  | arm | minilm vs none | arctic vs none | minilm vs context-sql | arctic vs context-sql |
  |---|---|---|---|---|
  | context-sql | +0.375 ± 0.154 B | +0.260 ± 0.132 B | – | – |
  | mech-fill-empty | +0.474 ± 0.163 B | +0.430 ± 0.168 B | +0.099 ± 0.105 n.d. | +0.170 ± 0.103 B |
  | mech-fill-all | +0.466 ± 0.160 B | +0.423 ± 0.163 B | +0.092 ± 0.094 n.d. | +0.163 ± 0.094 B |
  | llm-fill-empty | +0.542 ± 0.162 B | +0.495 ± 0.162 B | +0.168 ± 0.129 B | +0.235 ± 0.103 B |
  | llm-fill-all | +0.559 ± 0.165 B | +0.526 ± 0.171 B | +0.184 ± 0.122 B | +0.266 ± 0.105 B |
  (B = better, n.d. = no proven difference.) `described` slice (harm check): no proven diff for any arm, all Δ ≥ 0.
  mbql-only has n=3 held-out ("too few"), directionally +0.54 to +0.80.
- **Red flag for attribution**: the arms reach IDENTICAL means on both embedders (llm 0.969, mech 0.927 on each), and
  in-place reaches 0.927 with llm-fill-all. Two very different embedders landing on the same numbers suggests the hybrid's
  keyword arm (RRF) dominates once the description carries the words. The vector-only replay and BL-35 runs decide it.
- 17:25 **Retracted** the "identical means ⇒ keyword dominance" red flag (F's correction). Per question on held-out,
  llm-fill-all: 17/24 equal across embedders (14 both at 1.0), 7 differ. Even `none` is 20/24 equal (mostly shared zeros).
  It's a ceiling effect. report.ts now has a "questions at nDCG 1.0 ref → arm" column and a CEILING + ATTRIBUTION note in the
  header (analysis logic unchanged). Framing per F: the headline is "auto-describe (fill-empty) helps every engine", and
  "llm beats context-sql" is stated as hybrid + description vs vector-only SQL.

## 2026-09-23 17:45 — Replay part 1 (supplementary, vector-only) + alias-blind qwen; user question answered
- qwen alias-blind batch: 104 entries, 0.46 s/card; FROZEN (`llm-qwen3_8b.aliasblind.json` dbc1dd1d…, derived 3ad22d92…).
- `replay.ts` without context arms → `research/embedding-text-replay.md`. Held-out, cosine only, vs none:
  - minilm: mech-fill-empty +0.472 ± 0.154, llm-fill-empty +0.500 ± 0.170, llm-fill-all +0.494 ± 0.189 (all BETTER).
  - arctic: mech-fill-empty +0.411 ± 0.165, llm-fill-empty +0.471 ± 0.168, llm-fill-all +0.505 ± 0.176 (all BETTER).
  - Replay `none` ≈ harness baseline (minilm 0.404 vs 0.399; arctic 0.441 vs 0.441): a good fidelity check.
  - **The gain is in the vector itself**, about the same size as in the hybrid runs.
  - Alias-blind: translations keep ~70–80% of their gain (minilm mech 0.472→0.374, llm 0.500→0.412; arctic mech
    0.411→0.283, llm 0.471→0.388), all still BETTER. The raw-SQL comparison is pending (context-sql arm).
  - Watch item: minilm llm-fill-all on `described` is −0.116 ± 0.207 (n=6, not proven); mech has no such effect.
  - BL-33: arctic + "query: " is ≈0 on none (−0.031 ± 0.079 held-out), +0.04 to +0.08 on the strategy arms (several CIs clear 0).
- Answered Voytek's question (what is embedded): all search models are indexed and compete. Embedded text per
  spec = [model] + name/description (tables + display_name; collections and documents name only). SQL/MBQL,
  columns and dashboard contents are not embedded. Only cards and metrics change across arms. Table columns and
  dashboard card names are candidate next strategies (untested).

## 2026-09-23 18:05 — Replay part 2 (context-sql arms); recommendation draft 3
- context-sql text read verbatim from A's kept index `mb_pl_sql_all_minilm_1717563f59` (run `20260923-172027-626b30`;
  64 sql lines, max 652 chars). Told A to drop it.
- Held-out, vector-only: context-sql vs none: minilm +0.362 ± 0.161, arctic +0.191 ± 0.174, arctic+prefix +0.347 ± 0.169.
  Translation vs raw SQL: minilm sql-only not proven (llm +0.05/+0.08, mech +0.005), ALL llm +0.13 BETTER (GUI cards);
  arctic all BETTER (+0.16 to +0.31); arctic+prefix llm BETTER (+0.20 ALL, +0.13 to +0.14 sql-only), mech sql-only n.d.
- Alias-blind raw SQL keeps 95% (minilm) / 69% (arctic) / 73% (arctic+prefix) of its gain: below F's "drops by half"
  line, so no harness alias-blind run is needed. The alias-flattery threat is mostly refuted.
- Probe SELECT-only < full SQL on all models (−0.03 to −0.06, n.s.): the minilm truncation hypothesis is not supported.
- The recommendation (draft 3) now has four lines, the nuanced raw-SQL comparison, and "content of every item type" as the main limitation and next step.
- Voytek asked whether all item types' content is embedded and tested: answered **no** (cards only). Offered a follow-up phase; awaiting his call.

## 2026-09-23 18:40 — Coverage plan for Voytek (research only, F's task)
- `research/coverage-plan.md`: per-type gaps (spec-based), missing question kinds, suite size (~320 questions,
  30/type + 4 cross-cutting sets of 20), apply.ts gaps (field metadata, dashcards, real segment/measure definitions,
  users/verified/archived, model indexes, actions), engine-only vs opt-in-embedding split, and a phased cost (phases 0–3
  ≈ 15–17 agent-h + <1 h runs; phase 4 ≈ 4–6 agent-h per type). Recommend Phase 0, then 1+2.
- Used J's partial notes and rechecked in code: `search_native_query` is opt-in per request (api.clj:232) and our runner
  never sets it, so **keyword engines in all our runs never searched SQL** (E's brief assumed they did; no result
  changes). No Field search spec, so table columns aren't searchable by any engine. Transforms are superuser-only.
- 18:50 Note: the first coverage-plan correction script failed (a string mismatch) and wrote nothing, and my F/J messages went out before I saw the error. I reapplied all 10 corrections atomically and aligned the summary hours (15–17) with the phase table.

## 2026-09-23 19:10 — semantic-vector confirmation queued; BL-33 wording revised
- Queued 6 quality jobs (vector-only, sql corpus): minilm/arctic × {none+context-sql (one instance, --variants
  baseline,context-sql), llm-fill-all, mech-fill-empty}. Ids 180909-70cb/-181b/-99e5/-cf86/-bd31/-b964. Behind A's hold + 3 latency jobs.
- F's harness facts: golden semantic-vector vs semantic −0.025 ± 0.023 (the keyword arm contributes little). BL-33
  prefix in the harness: golden −0.029 ± 0.054, sql −0.070 ± 0.048. **Retracted "arctic is understated"** in the recommendation:
  the prefix doesn't help on our corpora; the replay's small gains with rich descriptions are unconfirmed.

## 2026-09-23 19:55 — Vector-only harness confirmation (BL-35) in; recommendation FINAL
- 8 semantic-vector runs (all indexed 160, corpusHash = FROZEN): minilm none `182959-4e79e6`, context-sql `183122-866466`,
  llm-fill-all `182919-1f87c6`, mech-fill-empty `183132-19e92f`; arctic none `183339-1af849`, context-sql `183554-29034d`,
  llm-fill-all `183351-269a0a`, mech-fill-empty `183655-51b14c`. report.ts gained the `semantic-vector` engine.
- semantic (hybrid) vs semantic-vector, per question, same arm: 55–60/60 identical nDCG in every arm; mean diff 0 to −0.021.
  **The gains are vector gains.** The keyword arm barely changes the ranking on this corpus. (Top-10 IDs can't be compared
  across runs: each instance assigns its own IDs.)
- Held-out, vector-only vs none: llm-fill-all +0.544 / +0.513, mech-fill-empty +0.462 / +0.419, context-sql +0.377 / +0.250
  (minilm / arctic, all BETTER). vs context-sql: llm minilm +0.167 ± 0.119 B (sql-only n.d.), arctic +0.263 ± 0.103 B
  (sql-only +0.279 B); mech minilm n.d., arctic +0.169 B (sql-only n.d.).
- The replay's minilm "described" dip (−0.116) is **not confirmed** (vector-only harness +0.029).
- Recommendation marked FINAL, with a vector-only harness column added.

## 2026-09-23 20:05 — Recommendation approved by F
- F reproduced all 10 held-out vector-only comparisons exactly, approved the recommendation and is passing it to Voytek.
- Session is now also named "J-researcher"; I sign messages "Agent I". B (session …-f2) is building a corpus from a real
  Metabase instance, a possible source for coverage-plan Phase 2. Expect contact.
