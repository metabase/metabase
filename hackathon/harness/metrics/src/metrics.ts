/**
 * Pure metric functions for the search comparison harness. Rankings and labels in, numbers out.
 *
 * Conventions used throughout:
 * - An item's identity is the `(model, id)` pair; ids are only unique within a model.
 * - A ranked list is taken in array order (the engine's ranking); `score` is never used to re-sort, so
 *   score ties keep the order the engine returned. A repeated item counts only at its first position.
 * - Ranks are 1-based.
 * - A metric that is undefined for its input returns `null`, never 0. `toMetricRows` drops those rows.
 * - `recallAtK` measures retrieval of labelled relevant items; `annRecallAtK` measures index fidelity
 *   against an exact search. They are different metrics and are emitted under different names.
 *
 * See `hackathon/harness/01-contracts.md` §3 (scenarios) and §4 (`harness_metric` rows).
 */
import { METRIC, type MetricRow, type QueryResultRow, type ReturnedItem, type Scenario } from "../../shared/types.ts";

export type Item = Pick<ReturnedItem, "model" | "id">;
export type Graded = Item & { grade: number };
export type ScenarioResults = { results: Item[]; expected: Graded[] };

// ---------------------------------------------------------------------------------------------------
// Ranked-list helpers

const itemKey = ({ model, id }: Item): string => `${model}\u0000${id}`;

/** Distinct item keys of `results`, in rank order. */
function rankedKeys(results: Item[]): string[] {
  return [...new Set(results.map(itemKey))];
}

const topK = (results: Item[], k: number): string[] => rankedKeys(results).slice(0, k);

/** item key → 1-based rank. */
function rankIndex(results: Item[]): Map<string, number> {
  return new Map(rankedKeys(results).map((key, i) => [key, i + 1]));
}

/** item key → grade, for every expected item with a positive grade. */
function relevantGrades(expected: Graded[]): Map<string, number> {
  return new Map(expected.filter((e) => e.grade > 0).map((e) => [itemKey(e), e.grade]));
}

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Composite map key; parts may be null. */
const key = (...parts: unknown[]): string => JSON.stringify(parts);

const countIn = (keys: string[], set: { has(key: string): boolean }): number =>
  keys.filter((key) => set.has(key)).length;

// ---------------------------------------------------------------------------------------------------
// Labelled quality

/**
 * Fraction of the relevant expected items (any positive `grade`) found in the top `k` of `results`.
 * `null` when `expected` has no relevant items.
 */
export function recallAtK(results: Item[], expected: Graded[], k: number): number | null {
  const relevant = relevantGrades(expected);
  return relevant.size === 0 ? null : countIn(topK(results, k), relevant) / relevant.size;
}

/**
 * Relevant hits in the top `k` of `results`, divided by `k` — always `k`, so an engine returning fewer
 * than `k` results is not rewarded for it. `null` when `expected` has no relevant items.
 */
export function precisionAtK(results: Item[], expected: Graded[], k: number): number | null {
  const relevant = relevantGrades(expected);
  return relevant.size === 0 ? null : countIn(topK(results, k), relevant) / k;
}

/**
 * Reciprocal rank of the first relevant item in `results` for one scenario: 1/rank, or 0 if no relevant
 * item is returned. Not cut at any k. Averaging this over scenarios gives the mean reciprocal rank.
 * `null` when `expected` has no relevant items.
 */
export function mrr(results: Item[], expected: Graded[]): number | null {
  const relevant = relevantGrades(expected);
  if (relevant.size === 0) {
    return null;
  }
  const i = rankedKeys(results).findIndex((key) => relevant.has(key));
  return i === -1 ? 0 : 1 / (i + 1);
}

const gain = (grade: number): number => 2 ** grade - 1;
const discount = (rank: number): number => Math.log2(rank + 1);
const dcg = (grades: number[]): number =>
  grades.reduce((sum, grade, i) => sum + gain(grade) / discount(i + 1), 0);

/**
 * Normalised discounted cumulative gain at `k`.
 *
 * Gain is `2^grade − 1` and the discount is `log2(rank + 1)`, with 1-based ranks. Returned items that are
 * not in `expected` have grade 0. Ideal DCG is computed from every relevant expected item, sorted by grade
 * descending and cut at `k`, so a result list is judged against the labels rather than against what the
 * engine happened to retrieve. `null` when `expected` has no relevant items.
 */
export function ndcgAtK(results: Item[], expected: Graded[], k: number): number | null {
  const relevant = relevantGrades(expected);
  if (relevant.size === 0) {
    return null;
  }
  const actual = dcg(topK(results, k).map((key) => relevant.get(key) ?? 0));
  const ideal = dcg([...relevant.values()].sort((a, b) => b - a).slice(0, k));
  return actual / ideal;
}

/** True when a scenario's correct answer is "nothing": `expected` has no positively graded items. */
const isEmptyExpected = (expected: Graded[]): boolean => relevantGrades(expected).size === 0;

/**
 * 1 if a scenario that expects something returned nothing, else 0. `null` for an `:empty-expected`
 * scenario, where an empty result is the correct answer; see `falsePositive`.
 */
export function zeroResult(results: Item[], expected: Graded[]): number | null {
  return isEmptyExpected(expected) ? null : Number(results.length === 0);
}

/** 1 if an `:empty-expected` scenario returned anything, else 0. `null` for any other scenario. */
export function falsePositive(results: Item[], expected: Graded[]): number | null {
  return isEmptyExpected(expected) ? Number(results.length > 0) : null;
}

/**
 * 1 if any `expectedAbsent` item appears anywhere in `results`, else 0. `expectedAbsent` lists items the
 * harness user must not be able to read, so any appearance is a permission leak regardless of rank.
 * `null` when the scenario lists no such items.
 */
export function permissionLeak(results: Item[], expectedAbsent: Item[] | null | undefined): number | null {
  if (!expectedAbsent?.length) {
    return null;
  }
  const forbidden = new Set(expectedAbsent.map(itemKey));
  return Number(results.some((r) => forbidden.has(itemKey(r))));
}

const meanOf =(xs: (number | null)[]): number | null => mean(xs.filter((x): x is number => x !== null));

/** Mean of `zeroResult` over the scenarios where it is defined. `null` when none are. */
export function zeroResultRate(scenarios: ScenarioResults[]): number | null {
  return meanOf(scenarios.map((s) => zeroResult(s.results, s.expected)));
}

/** Mean of `falsePositive` over the scenarios where it is defined. `null` when none are. */
export function falsePositiveRate(scenarios: ScenarioResults[]): number | null {
  return meanOf(scenarios.map((s) => falsePositive(s.results, s.expected)));
}

// ---------------------------------------------------------------------------------------------------
// Unlabelled agreement

/**
 * |A ∩ B| / |A ∪ B| over the top-`k` item sets of two ranked lists. `null` when both are empty: two
 * engines that both return nothing agree trivially, and that is reported by `zeroResultRate` instead.
 */
export function jaccardAtK(a: Item[], b: Item[], k: number): number | null {
  const setA = new Set(topK(a, k));
  const setB = new Set(topK(b, k));
  const unionSize = new Set([...setA, ...setB]).size;
  return unionSize === 0 ? null : countIn([...setB], setA) / unionSize;
}

/** `[rankA, rankB]` for every item present in both lists. */
function sharedRanks(a: Item[], b: Item[]): [number, number][] {
  const ranksB = rankIndex(b);
  return [...rankIndex(a)].flatMap(([key, rankA]) => {
    const rankB = ranksB.get(key);
    return rankB === undefined ? [] : [[rankA, rankB] as [number, number]];
  });
}

/** Number of distinct items present in both ranked lists. */
export function intersectionSize(a: Item[], b: Item[]): number {
  return sharedRanks(a, b).length;
}

/**
 * Kendall rank correlation between two ranked lists, computed only over the items both contain:
 * (concordant − discordant) / (n·(n−1)/2), in [−1, 1]. Items in only one list are ignored, so disjoint
 * lists or an overlap of one item give `null`, not 0. Report `intersectionSize` next to it — a tau over
 * two shared items means little. Ranks within a list are distinct, so there are no ties to correct for.
 */
export function kendallTau(a: Item[], b: Item[]): number | null {
  return tauOf(sharedRanks(a, b));
}

function tauOf(pairs: [number, number][]): number | null {
  const n = pairs.length;
  if (n < 2) {
    return null;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += Math.sign(pairs[i][0] - pairs[j][0]) * Math.sign(pairs[i][1] - pairs[j][1]);
    }
  }
  return sum / ((n * (n - 1)) / 2);
}

/** Mean absolute rank difference of the items present in both lists. `null` when they share none. */
export function rankDisplacement(a: Item[], b: Item[]): number | null {
  return displacementOf(sharedRanks(a, b));
}

const displacementOf = (pairs: [number, number][]): number | null =>
  mean(pairs.map(([rankA, rankB]) => Math.abs(rankA - rankB)));

/**
 * Apply `metric` to every ordered pair of distinct engines in `engineResults`. Returns
 * `[engineA, engineB, value]` triples, keeping `null` values.
 */
export function pairwiseAgreementMatrix<T>(
  metric: (a: Item[], b: Item[]) => T,
  engineResults: Map<string, Item[]>,
): [string, string, T][] {
  const out: [string, string, T][] = [];
  for (const [engineA, a] of engineResults) {
    for (const [engineB, b] of engineResults) {
      if (engineA !== engineB) {
        out.push([engineA, engineB, metric(a, b)]);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// Fidelity

/**
 * Fraction of the exact top-`k` (`exact`, e.g. pgvector brute force) that the approximate index also
 * returned in its own top `k`. The denominator is the size of the exact top-k, which may be under `k`.
 *
 * This measures **index fidelity, not usefulness**: an index can score 1.0 here and still return nothing
 * a user wanted. Do not compare it with `recallAtK`. `null` when `exact` is empty.
 */
export function annRecallAtK(results: Item[], exact: Item[], k: number): number | null {
  const exactTop = topK(exact, k);
  return exactTop.length === 0 ? null : countIn(exactTop, new Set(topK(results, k))) / exactTop.length;
}

// ---------------------------------------------------------------------------------------------------
// Latency

export type Percentiles = { p50: number | null; p95: number | null; p99: number | null };

function percentile(sorted: number[], p: number): number {
  // R-7: linear interpolation between the closest ranks at position (n − 1)·p
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * p50/p95/p99 of `timings`, using linear interpolation between closest ranks (R-7, the numpy/Excel
 * default). `null`/`undefined` timings (e.g. errored queries) are ignored. Every value is `null` when no
 * timings remain.
 */
export function percentiles(timings: (number | null | undefined)[]): Percentiles {
  const sorted = timings.filter((t): t is number => t != null).sort((a, b) => a - b);
  const at = (p: number) => (sorted.length === 0 ? null : percentile(sorted, p));
  return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
}

export type StageObservation = Pick<QueryResultRow, "latencyMs" | "embedMs" | "storeMs" | "filterMs">;
export type StageShares = {
  embedShare: number | null;
  storeShare: number | null;
  filterShare: number | null;
  otherShare: number | null;
};

/**
 * Share of total latency spent in each stage, as the ratio of sums over `observations`. `otherShare` is
 * the remainder, which is negative if the stages overlap or were timed outside `latencyMs`. Only
 * observations with every field present count; every share is `null` when none do (e.g. an engine that
 * exposes no time waterfall).
 */
export function stageBreakdown(observations: StageObservation[]): StageShares {
  const complete = observations.filter(
    (o) => o.latencyMs != null && o.embedMs != null && o.storeMs != null && o.filterMs != null,
  );
  const sum = (field: keyof StageObservation) => complete.reduce((acc, o) => acc + o[field]!, 0);
  const total = sum("latencyMs");
  if (total <= 0) {
    return { embedShare: null, storeShare: null, filterShare: null, otherShare: null };
  }
  const embedShare = sum("embedMs") / total;
  const storeShare = sum("storeMs") / total;
  const filterShare = sum("filterMs") / total;
  return { embedShare, storeShare, filterShare, otherShare: 1 - embedShare - storeShare - filterShare };
}

// ---------------------------------------------------------------------------------------------------
// Aggregation

export type TaggedMetricRow = MetricRow & { tags: string[] };

/**
 * Roll per-scenario metric rows up into run-level rows: one row per scenario tag plus one overall
 * (`tag: null`) row, for each `(engine, engineB, embedder, metric)`. The value is the mean over the
 * scenarios that have that metric. Output rows have `scenarioId: null`.
 */
export function aggregateByTag(rows: TaggedMetricRow[]): MetricRow[] {
  const withTag = rows.flatMap(({ tags, engine, engineB = null, embedder, metric, value }) =>
    value == null
      ? []
      : [null, ...new Set(tags)].map((tag) => ({ engine, engineB, embedder, tag, metric, value })));
  return [...Map.groupBy(withTag, (r) => key(r.tag, r.engine, r.engineB, r.embedder, r.metric)).values()]
    .map((group) => ({ ...group[0], scenarioId: null, value: mean(group.map((r) => r.value)) }));
}

// ---------------------------------------------------------------------------------------------------
// Metric rows

export type MetricRowOptions = {
  /** Cut-off for the @k metrics. Default 10. */
  k?: number;
  /** Engine whose results are exact (pgvector brute force). When given, `ann_recall@k` rows are emitted
   * for every other engine against it. */
  annReference?: string;
};

type Base = Omit<MetricRow, "metric" | "value">;

function toRows(base: Base, metrics: Record<string, number | null>): MetricRow[] {
  return Object.entries(metrics)
    .filter((entry): entry is [string, number] => entry[1] != null)
    .map(([metric, value]) => ({ ...base, metric, value }));
}

function pairwiseMetrics(a: Item[], b: Item[], k: number): Record<string, number | null> {
  const pairs = sharedRanks(a, b);
  return {
    [`jaccard@${k}`]: jaccardAtK(a, b, k),
    [METRIC.kendallTau]: tauOf(pairs),
    [METRIC.kendallTauN]: pairs.length,
    [METRIC.rankDisplacement]: displacementOf(pairs),
  };
}

/**
 * Compute every harness metric for one run and return `harness_metric` rows (§4, long format) ready for
 * `recordMetrics`. Rows whose value is undefined are omitted.
 *
 * Quality and agreement metrics use one observation per `(engine, embedder, scenario)`: the lowest
 * iteration that did not error. Latency percentiles and stage shares use every iteration that did not error.
 * Every `(engine, embedder, scenario)` also gets `unscored_rate`: 1 when no iteration succeeded, else 0.
 *
 * Emits per-scenario rows (`scenarioId` set, `tag: null`), and run-level rows (`scenarioId: null`):
 * per-tag and overall means of the per-scenario rows, latency percentiles and stage shares.
 */
export function toMetricRows(
  scenarios: Scenario[],
  observations: QueryResultRow[],
  { k = 10, annReference }: MetricRowOptions = {},
): MetricRow[] {
  const scenarioById = new Map(scenarios.map((s) => [s.id, s]));

  const perScenario: MetricRow[] = [];

  // One representative ranked list per (engine, embedder, scenario), keyed the same way. A scenario with no
  // successful iteration gets no quality rows, so `unscored_rate` records it.
  const representative = new Map<string, QueryResultRow & { results: Item[] }>();
  for (const [repKey, obs] of Map.groupBy(observations, (o) => key(o.engine, o.embedder, o.scenarioId))) {
    const ok = obs.filter((o) => !o.error).sort((a, b) => a.iteration - b.iteration)[0];
    if (ok !== undefined) {
      representative.set(repKey, { ...ok, results: ok.returned ?? [] });
    }
    const { engine, embedder, scenarioId } = obs[0];
    perScenario.push(...toRows({ engine, engineB: null, embedder, scenarioId, tag: null },
      { [METRIC.unscoredRate]: ok === undefined ? 1 : 0 }));
  }

  // Labelled quality and index fidelity, one engine at a time.
  for (const { engine, embedder, scenarioId, results } of representative.values()) {
    const scenario = scenarioById.get(scenarioId);
    const exact = annReference === undefined || engine === annReference
      ? undefined
      : representative.get(key(annReference, embedder, scenarioId));
    perScenario.push(...toRows({ engine, engineB: null, embedder, scenarioId, tag: null }, {
      ...(scenario && {
        [`recall@${k}`]: recallAtK(results, scenario.expected, k),
        [`precision@${k}`]: precisionAtK(results, scenario.expected, k),
        [`ndcg@${k}`]: ndcgAtK(results, scenario.expected, k),
        [METRIC.mrr]: mrr(results, scenario.expected),
        [METRIC.zeroResultRate]: zeroResult(results, scenario.expected),
        [METRIC.falsePositiveRate]: falsePositive(results, scenario.expected),
        [METRIC.permissionLeak]: permissionLeak(results, scenario.expectedAbsent),
      }),
      ...(exact && { [`ann_recall@${k}`]: annRecallAtK(results, exact.results, k) }),
    }));
  }

  // Agreement between engines sharing an embedder and a scenario.
  for (const entries of Map.groupBy(representative.values(), (r) => key(r.embedder, r.scenarioId)).values()) {
    const { embedder, scenarioId } = entries[0];
    const engineResults = new Map(entries.map((r) => [r.engine, r.results]));
    for (const [engine, engineB, metrics] of pairwiseAgreementMatrix((a, b) => pairwiseMetrics(a, b, k),
      engineResults)) {
      perScenario.push(...toRows({ engine, engineB, embedder, scenarioId, tag: null }, metrics));
    }
  }

  const aggregates = aggregateByTag(
    perScenario.map((row) => ({ ...row, tags: scenarioById.get(row.scenarioId ?? "")?.tags ?? [] })),
  );

  // Errored iterations still carry timings; the cards filter `error IS NULL`, so do the same here.
  const timed = observations.filter((o) => !o.error);
  const latency = [...Map.groupBy(timed, (o) => key(o.engine, o.embedder)).values()].flatMap((obs) => {
    const { engine, embedder } = obs[0];
    const { p50, p95, p99 } = percentiles(obs.map((o) => o.latencyMs));
    const shares = stageBreakdown(obs);
    return toRows({ engine, engineB: null, embedder, scenarioId: null, tag: null }, {
      [METRIC.p50Ms]: p50,
      [METRIC.p95Ms]: p95,
      [METRIC.p99Ms]: p99,
      [METRIC.embedShare]: shares.embedShare,
      [METRIC.storeShare]: shares.storeShare,
      [METRIC.filterShare]: shares.filterShare,
      [METRIC.otherShare]: shares.otherShare,
    });
  });

  return [...perScenario, ...aggregates, ...latency];
}
