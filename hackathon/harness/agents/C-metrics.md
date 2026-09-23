# Agent C — metrics library

**Status: DONE (build)** — confirmed by Agent F (overseer) on 2026-09-23 10:55.

Reopen triggers (not open work):
- (a) D adds `METRIC.permissionLeak`: swap the `permission_leak` string literal for the constant.
- (b) A wires `annReference`: check that `ann_recall@10` rows appear for non-reference engines.
- (c) The first real run lands: inspect its `harness_metric` rows. This is the real check of `toMetricRows`.
- (d) Voytek decides the four open convention choices (lowest-iteration pick, Jaccard of two empty lists, tau over full lists, `other_share` clamp). F has raised them with Voytek.

Read `_shared-context.md` first. **Pure functions, no I/O, no engine dependency — start immediately.**

You own: `hackathon/harness/metrics/` (TypeScript, zero deps: `src/metrics.ts`, `src/metrics.test.ts`). Ported from Clojure after the TS/outside-in direction change.

## Mission

Turn raw observations into the numbers the dashboard shows. Every function is pure: rankings and
labels in, numbers out. No database, no search context, no side effects. That is what makes this
fully parallel with everyone else and trivially testable.

## Deliverables

### Labelled quality metrics
Inputs: a ranked result list `[{:model :id :score}]` and a scenario's `:expected`
`[{:model :id :grade}]`.

- `recall-at-k`, `precision-at-k` — any positive grade counts as relevant
- `mrr` — reciprocal rank of the first relevant hit
- `ndcg-at-k` — uses `:grade` for gain; state your discount and ideal-DCG convention in the docstring
- `zero-result-rate` — fraction of scenarios returning nothing. **First-class, not an afterthought:
  the live baseline already returns zero for plausible queries because of the `0.7` cutoff.**

### Unlabelled agreement metrics
Inputs: two ranked lists for the same scenario from different engines. These need no labels, so they
work from the first run — likely the most demoable output of the whole harness.

- `jaccard-at-k` — set overlap of the top k
- `kendall-tau` — rank correlation over the intersection; document how you handle disjoint lists
- `rank-displacement` — for items in both, mean absolute rank change
- `pairwise-agreement-matrix` — engine × engine, for a heatmap

### Fidelity
- `ann-recall-at-k` — overlap with an exact ground-truth top-k. pgvector `brute-force` is exact, so
  it is the reference. Docstring must say plainly that this measures **index fidelity, not
  usefulness** — the reading companion is explicit that conflating the two caused real confusion.

### Latency
- `percentiles` — p50/p95/p99 from a seq of timings; state the interpolation method
- `stage-breakdown` — embed / store / filter shares of total

### Aggregation
- `aggregate-by-tag` — roll per-scenario metrics up by scenario tag, so the dashboard can show
  "semantic wins `:paraphrase`, keyword wins `:rare-token`". This slice is the most interesting
  output of the project; make it easy.
- `->metric-rows` — emit `harness_metric` rows (`01-contracts.md` §4) in long format.

## Verification

Unit tests only — no instance needed. `cd hackathon/harness/metrics && npm test && npm run typecheck`.

Cover the cases that actually bite:
- empty result list; empty expected list; both empty
- ties in score
- k larger than the result list
- disjoint lists for `kendall-tau`
- single-element lists
- a known worked example per metric with the expected value computed by hand in the test

## Gotchas

- Fix a convention for ranked-list identity and use it everywhere: `[model id]` pairs, not ids alone.
  Ids are only unique within a model.
- Do not silently coerce a missing metric to 0. Return `nil` and let the writer skip the row —
  a zero and an absence mean very different things on a chart.
- Recall and ANN-recall are different metrics with the same name in casual speech. Name them
  distinctly in code and in the emitted `metric` column.
