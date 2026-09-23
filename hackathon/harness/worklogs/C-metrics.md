# Worklog — Agent C (metrics)

Session: `metabase-sqlite-semantic-search-c5`. Owns `hackathon/harness/metrics/`.

**Status: DONE (build)** — confirmed by Agent F (overseer) on 2026-09-23 10:55.

Reopen triggers (not open work):
- (a) D adds `METRIC.permissionLeak`: swap the `permission_leak` string literal for the constant.
- (b) A wires `annReference`: check that `ann_recall@10` rows appear for non-reference engines.
- (c) The first real run lands: inspect its `harness_metric` rows. This is the real check of `toMetricRows`.
- (d) Voytek decides the four open convention choices (lowest-iteration pick, Jaccard of two empty lists, tau over full lists, `other_share` clamp). F has raised them with Voytek.

Entries before 10:33 were backfilled at 10:33. Their times are approximate (reconstructed from file mtimes).

## 2026-09-23 09:50 — Read brief, settled metric conventions with Voytek
- What: read `agents/C-metrics.md`, `_shared-context.md`, `00-plan.md` and `01-contracts.md`. No files touched.
- Why: several conventions change the numbers, so Voytek decided them rather than me.
- How: asked four questions and got four answers:
  - nDCG gain is `2^g−1`, the discount is `log2(rank+1)`, and ideal DCG is built from the full expected list cut at k.
  - precision@k divides by k even when fewer than k results come back.
  - `:empty-expected` scenarios get their own `false_positive_rate`, and the headline `zero_result_rate` excludes them.
  - Percentiles use linear interpolation (R-7).
- Also decided without asking (stated to Voytek):
  - Item identity is `[model id]`.
  - Lists are used in the engine's order and never re-sorted by score.
  - An undefined metric is null, never 0.
  - `dev/src/dev/search_perf.clj` percentiles are inconsistent (p50 uses n·0.5, p95 uses (n−1)·0.95), so ours won't match its output.

## 2026-09-23 09:53 — Contract change: `harness_metric.engine_b`
- What: added a nullable `engine_b` column to §4 of `01-contracts.md`.
- Why: pairwise agreement metrics (Jaccard, Kendall tau, rank displacement) involve two engines, and the table had only one engine column. Voytek chose this over encoding the pair in the metric name or engine string.
- How: edited the contract and messaged sessions `-02` and `-b4`, not knowing which one was D. D (`-02`) confirmed it, added the column to the DB and schema, and added my extra metric names and the empty-expected rule to §4.

## 2026-09-23 10:05 — Clojure metrics library (later deleted)
- What: `dev/src/dev/harness/metrics.clj` and `dev/test/dev/harness/metrics_test.clj`.
- How: loaded the namespace in the dev nREPL and checked a few values by hand. `./bin/test-agent :only '[dev.harness.metrics-test]'` passed with 16 tests and 101 assertions. `clj-kondo` was clean apart from the "test must live in a known module" warning, which the existing `dev/test` files also get.
- This is a dead end: it was superseded by the next entry.

## 2026-09-23 10:15 — Direction change → ported to TypeScript, deleted the Clojure version
- What: created `metrics/src/metrics.ts`, `metrics/src/metrics.test.ts`, `metrics/package.json` and `metrics/tsconfig.json`. Deleted both Clojure files and their empty directories. The Metabase repo now has no changes from me.
- Why: peer session `-a8` announced the "TypeScript, outside-in" direction. I stopped and asked Voytek, who chose to port, and also chose zero dependencies with Node's built-in test runner.
- How:
  - Kept the same conventions and ported the tests one-to-one.
  - Imported D's `Scenario`, `QueryResultRow` and `MetricRow` types from `results/src/writer.ts`. The imports are type-only, so there's no runtime dependency on `pg`.
  - `toMetricRows(scenarios, rows, {k, annReference})` returns rows ready for D's `recordMetrics`.
  - Verified: `npm test` passed 64 tests and `npm run typecheck` exited 0.
  - Told A how to call `toMetricRows` and told D the metrics are now TypeScript.
- Open:
  - `typecheck` borrows `tsc` and `@types/node` from `results/node_modules`. D agreed to keep those dependencies.
  - `ann_recall@10` is emitted only if A passes `annReference`, the engine name of the brute-force pgvector column. I don't know that name yet.

## 2026-09-23 10:30 — /simplify pass
- What: refactored `metrics/src/metrics.ts` and set the tsconfig target to ES2024 so `Map.groupBy` is available.
- Why: Voytek ran /simplify, which launched four reviewers covering reuse, simplification, efficiency and altitude.
- How:
  - The empty-expected rule now lives only in `zeroResult` and `falsePositive`.
  - Used the built-in `Map.groupBy`, a single `key()` helper, and one quality+ANN loop.
  - The ranks two engines share are computed once per pair.
  - `aggregateByTag` is 6 lines.
  - Verified: 64/64 tests pass and the typecheck exits 0.
- Skipped:
  - Precomputing each scenario's relevant set: under 1 ms per run.
  - Un-exporting `intersectionSize`: the tests use it.
  - Suggestions for D's files, which I sent to D: `fixtures.ts` can drop its stand-in metrics, tag colon-stripping happens in three places, and a harness npm workspace would give shared types and metric-name constants.
- NOT verified: `toMetricRows` has not run against a real run's rows, because no real run exists yet. Only unit fixtures have been tested.

## Open questions for Voytek
Stated in chat. No answer yet; they're unchanged from the first summary:
1. Quality metrics use the lowest non-errored iteration, so instability across iterations isn't detected.
2. When both engines return nothing, Jaccard is null rather than 1.
3. Kendall tau is computed over the full returned lists, not the top k.
4. `other_share` isn't clamped. It's moot now, because the HTTP runner has no stage timings, so share rows are never emitted.

## 2026-09-23 10:40 — Dropped stripColon; agreed shared workspace with D
- What: removed `stripColon` from `metrics/src/metrics.ts` and changed the `:paraphrase` test case in `metrics.test.ts`.
- Why: D made `Scenario.tags` canonical, so `writer.ts` no longer strips colons. D also switched `fixtures.ts` to `toMetricRows`.
- How: `npm test` passes 64/64 and the typecheck exits 0.
- Workspace: D proposed a harness npm workspace with a root `package.json`, `tsconfig.base.json` and `shared/types.ts`. Voytek approved it. D builds the root files, and I migrate `metrics/` once D confirms they're in place.

## 2026-09-23 10:50 — Migrated metrics/ into the harness npm workspace
- What:
  - `metrics/tsconfig.json` now extends `../tsconfig.base.json`.
  - `metrics/package.json` typecheck is now plain `tsc --noEmit`, using the hoisted binary. The `../results/node_modules` borrowing is gone.
  - `metrics.ts` and its test import types from `shared/types.ts` instead of `results/src/writer.ts`.
  - The fixed metric names now come from D's `METRIC` constant.
- Why: this is the workspace Voytek approved. D built the root, `shared/types.ts` and the install.
- How:
  - `@k` names (`recall@${k}` etc.) stay as templates because `METRIC` only has the k=10 strings. They match whenever k=10, which is the default.
  - Verified: `npm run typecheck` and `npm test` at the workspace root both pass: all packages typecheck and metrics passes 64/64. Results and runner currently have no test scripts.

## 2026-09-23 10:46 — Added `permission_leak`
- What: added `permissionLeak(results, expectedAbsent)` to `metrics/src/metrics.ts`. `toMetricRows` now emits a `permission_leak` row. Five new tests in `metrics.test.ts`.
- Why: Agent B redefined `expectedAbsent` to mean "items the harness user must not be able to read". It's used only by `empty-04` in `scenarios/northwind-golden-v1.json`. Precision and nDCG can't see such leaks. Voytek approved adding the metric.
- How:
  - The value is 1 if any forbidden `(model, id)` appears at any rank, else 0. It's null (no row) when a scenario has no `expectedAbsent`.
  - Verified: 69/69 tests pass and the typecheck is clean.
- Open: the name is still a string literal until D adds `METRIC.permissionLeak` and updates §4. I also asked D to show a non-zero value as a red flag on the dashboard.

## 2026-09-23 10:55 — Marked DONE (build)
- What: asked Agent F (overseer, session `-a1`) whether C is done. F agreed. Added the status and the reopen triggers to the top of this worklog and to `agents/C-metrics.md`.
- How: F independently checked the deliverables, `npm test -w metrics` (69/69), the typecheck and the absence of any Metabase diff. Per F, I stay available and take on no new scope until a reopen trigger fires.

## 2026-09-23 ~11:50 — (edit by Agent F; C's session had closed) permissionLeak constant
- **What**: `metrics/src/metrics.ts:389` now uses `[METRIC.permissionLeak]` instead of the `permission_leak` literal. Reopen trigger (a) is closed.
- **How**: `npm test -w metrics` and the typecheck, results below in F's worklog. The emitted string is unchanged (`permission_leak`).
