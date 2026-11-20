// @ts-check

/** @typedef {"typedScore" | "bestScore"} ScoreKey */
/** @typedef {{id: string, typedScore: {f1: number}, bestScore: {f1: number}}} GoalEngine */
/** @typedef {{kind: string, engines: readonly GoalEngine[]}} Goal */
/** @typedef {{kind: string, goals: readonly Goal[]}} GoalGroup */
/** @typedef {{typedScore: number, bestScore: number}} QueryScores */
/** @typedef {{typedScore: number | null, bestScore: number | null, gain: number | null}} EngineScores */

const epsilon = 1e-9;

/** @param {number} value */
export const clampWeight = (value) =>
  Math.min(2, Math.max(0, Math.round(10 * value) / 10));

/**
 * Serialize the weights that differ from the default of 1 as `kind:weight` pairs joined by commas.
 * @param {readonly string[]} kinds
 * @param {Readonly<Record<string, number>>} weights
 */
export const formatWeights = (kinds, weights) =>
  kinds
    .map((kind) => [kind, clampWeight(weights[kind] ?? 1)])
    .filter(([, weight]) => weight !== 1)
    .map(([kind, weight]) => `${kind}:${weight}`)
    .join(",");

/**
 * Parse `kind:weight` pairs joined by commas, dropping unknown kinds and malformed weights.
 * @param {readonly string[]} kinds
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function parseWeights(kinds, text) {
  /** @type {Record<string, number>} */
  const weights = {};
  for (const pair of text.split(",").filter(Boolean)) {
    const [kind, value] = pair.split(":");
    if (kinds.includes(kind) && /^\d(\.\d)?$/.test(value)) {
      weights[kind] = clampWeight(Number(value));
    }
  }
  return weights;
}

/**
 * Return nonempty goal groups in the supplied kind order.
 * @param {readonly string[]} kinds
 * @param {readonly Goal[]} goals
 * @returns {GoalGroup[]}
 */
export function groupGoals(kinds, goals) {
  return kinds
    .map((kind) => ({
      kind,
      goals: goals.filter((goal) => goal.kind === kind),
    }))
    .filter((group) => group.goals.length);
}

/**
 * Rank displayed scores, ordering a tie by its precise values and skipping unavailable scores.
 * @template {ScoreKey} Key
 * @param {Record<string, Record<Key, number | null>>} scores
 * @param {Key} key
 */
export function ranking(scores, key) {
  const scored = Object.entries(scores)
    .flatMap(([id, values]) => {
      const precise = values[key];
      return precise === null
        ? []
        : [{ id, precise, score: Math.round(100 * precise) / 100 }];
    })
    .sort(
      (left, right) => right.score - left.score || right.precise - left.precise,
    );
  const [first] = scored;
  if (!first) return [];
  const top = first.score;
  return scored.map((entry) => ({
    ...entry,
    rank:
      1 + scored.filter((other) => other.score > entry.score + epsilon).length,
    tied: scored
      .filter(
        (other) =>
          other.id !== entry.id &&
          Math.abs(other.score - entry.score) < epsilon,
      )
      .map((other) => other.id),
    leader: entry.score >= top - epsilon,
    behind: top - entry.score,
  }));
}

/**
 * Average each kind before weighting it.
 * All-zero weights produce null scores, which leave the rankings empty.
 * @param {readonly string[]} engines
 * @param {readonly GoalGroup[]} groups
 * @param {Readonly<Record<string, number>>} weights
 */
export function weightedScores(engines, groups, weights) {
  /** @type {Record<string, QueryScores>} */
  const totals = {};
  for (const id of engines) totals[id] = { typedScore: 0, bestScore: 0 };
  let totalWeight = 0;
  for (const { kind, goals } of groups) {
    const weight = clampWeight(weights[kind] ?? 1);
    totalWeight += weight;
    /** @type {Record<string, QueryScores>} */
    const sums = {};
    for (const id of engines) sums[id] = { typedScore: 0, bestScore: 0 };
    for (const goal of goals) {
      for (const engine of goal.engines) {
        const sum = sums[engine.id];
        if (!sum) throw new Error(`Goal names unknown engine ${engine.id}`);
        sum.typedScore += engine.typedScore.f1;
        sum.bestScore += engine.bestScore.f1;
      }
    }
    for (const id of engines) {
      totals[id].typedScore += weight * (sums[id].typedScore / goals.length);
      totals[id].bestScore += weight * (sums[id].bestScore / goals.length);
    }
  }
  /** @type {Record<string, EngineScores>} */
  const scores = {};
  for (const [id, values] of Object.entries(totals)) {
    if (!totalWeight) {
      scores[id] = { typedScore: null, bestScore: null, gain: null };
    } else {
      const typedScore = values.typedScore / totalWeight;
      const bestScore = values.bestScore / totalWeight;
      scores[id] = { typedScore, bestScore, gain: bestScore - typedScore };
    }
  }
  return {
    totalWeight,
    scores,
    rankings: {
      typedScore: ranking(scores, "typedScore"),
      bestScore: ranking(scores, "bestScore"),
    },
  };
}
