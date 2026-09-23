# Frozen text caches (Agent I)

Frozen 2026-09-23 12:39 BEFORE any strategy run. No strategy result has been seen. (Baseline per-tag numbers mixing dev and held-out were seen once; disclosed in the worklog, 14:40.)
Nothing in this directory may change after this point; a change means a new prompt/cache version and a note in the worklog.

| file | sha256 |
|---|---|
| `mbql-describe.json` | `5e085f81746212dc…` |
| `llm-qwen3_8b.json` | `e7fb033f2d924c46…` |
| `sql2text.ts` (mech rules) | `4a8592211394932a…` |
| `../artifacts/sql-text/*/corpus.json` | llm-fill-all `d25fe2527a92…` llm-fill-empty `f47135ba1a7f…` mech-fill-all `7872da872e7c…` mech-fill-empty `b9e4e57308eb…`  |

- qwen3:8b prompt v2, temperature 0, seed 1, think:false, digest in each entry. v1 output was rejected on format (boilerplate
  "Measure: … Filters: None" and invented breakdowns), before any measurement: kept in `rejected-llm-qwen3_8b.prompt-v1.json`.
- Known factual slips in v2 (spot check, not exhaustive): card/question-7 adds "in the last 30 days" (no such filter).

## Alias-blind robustness check (frozen 2026-09-23 12:54, before running anything on it)

| file | sha256 |
|---|---|
| `embedtext/aliasblind.ts` (rule in its header) | `87cb75a18b6ced92…` |
| `artifacts/sql-aliasblind/corpus.json` (61/64 SQL cards changed; EXPLAIN 64/64 ok) | `6ac5aa77693ed149…` |
| `artifacts/sql-aliasblind-text/mech-fill-empty/corpus.json` | `4df700f37cc82754…` |
| `cache/llm-qwen3_8b.aliasblind.json` (prompt v2, 104 entries, 0.46 s/card) | `dbc1dd1dcad069c6…` |
| `artifacts/sql-aliasblind-text/llm-fill-empty/corpus.json` | `3ad22d92e1b26cc1…` |

- Rule amended once before any use: the first draft also renamed aliases followed by FROM and CTE names, which broke 3
  statements under EXPLAIN. Fixed with a look-behind for `extract(` and a CTE-name exclusion. No results were involved.
- Three computed aliases stay by rule because they are real column or CTE names: commission, gross, spend.
