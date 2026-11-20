// @ts-check

import assert from "node:assert/strict";
import test from "node:test";

import {
  clampWeight,
  formatWeights,
  groupGoals,
  parseWeights,
  ranking,
  weightedScores,
} from "../resources/dev/search_semantics_report_model.mjs";

/**
 * @param {{kind: string, values: Record<string, [number, number]>}} options
 * @returns {Parameters<typeof groupGoals>[1][number]}
 */
const goal = ({ kind, values }) => ({
  kind,
  engines: Object.entries(values).map(([id, [typed, best]]) => ({
    id,
    typedScore: { f1: typed },
    bestScore: { f1: best },
  })),
});

test("goal groups preserve kind order and omit empty kinds", () => {
  const first = goal({ kind: "and", values: { mysql: [0, 1] } });
  const second = goal({ kind: "or", values: { mysql: [1, 1] } });
  assert.deepEqual(groupGoals(["or", "and", "typing"], [first, second]), [
    { kind: "or", goals: [second] },
    { kind: "and", goals: [first] },
  ]);
});

test("each kind is averaged before weights apply", () => {
  const groups = groupGoals(
    ["and", "title"],
    [
      goal({ kind: "and", values: { mysql: [0, 0] } }),
      goal({ kind: "and", values: { mysql: [0, 0] } }),
      goal({ kind: "title", values: { mysql: [1, 1] } }),
    ],
  );
  const model = weightedScores(["mysql"], groups, {});
  assert.deepEqual(model.scores.mysql, {
    typedScore: 0.5,
    bestScore: 0.5,
    gain: 0,
  });
  assert.equal(model.totalWeight, 2);
});

test("custom weights apply to typed and best queries independently", () => {
  const groups = groupGoals(
    ["and", "title"],
    [
      goal({ kind: "and", values: { mysql: [0, 1] } }),
      goal({ kind: "title", values: { mysql: [1, 1] } }),
    ],
  );
  const model = weightedScores(["mysql"], groups, { and: 2, title: 1 });
  assert.equal(model.scores.mysql.typedScore, 1 / 3);
  assert.equal(model.scores.mysql.bestScore, 1);
  assert.equal(model.scores.mysql.gain, 1 - 1 / 3);
});

test("zero-weight kinds contribute neither scores nor weight", () => {
  const groups = groupGoals(
    ["and", "title"],
    [
      goal({ kind: "and", values: { mysql: [0, 0] } }),
      goal({ kind: "title", values: { mysql: [1, 1] } }),
    ],
  );
  const model = weightedScores(["mysql"], groups, { and: 0 });
  assert.equal(model.totalWeight, 1);
  assert.equal(model.scores.mysql.bestScore, 1);
});

test("all-zero weights have unavailable scores and no ranking", () => {
  const groups = groupGoals(
    ["and"],
    [goal({ kind: "and", values: { mysql: [0, 1] } })],
  );
  const model = weightedScores(["mysql"], groups, { and: 0 });
  assert.deepEqual(model, {
    totalWeight: 0,
    scores: { mysql: { typedScore: null, bestScore: null, gain: null } },
    rankings: { typedScore: [], bestScore: [] },
  });
});

test("an empty goal corpus has unavailable scores", () => {
  assert.equal(weightedScores(["mysql"], [], {}).scores.mysql.bestScore, null);
});

test("ranking ties use displayed scores and precise values order the tie", () => {
  const rows = ranking(
    {
      first: { bestScore: 0.9801 },
      second: { bestScore: 0.9829 },
      third: { bestScore: 0.76 },
    },
    "bestScore",
  );
  assert.deepEqual(
    rows.map(({ id, rank, tied, leader }) => ({ id, rank, tied, leader })),
    [
      { id: "second", rank: 1, tied: ["first"], leader: true },
      { id: "first", rank: 1, tied: ["second"], leader: true },
      { id: "third", rank: 3, tied: [], leader: false },
    ],
  );
  assert.equal(rows[2].behind, 0.98 - 0.76);
});

test("typed and best rankings use their own scores", () => {
  const groups = groupGoals(
    ["and"],
    [goal({ kind: "and", values: { mysql: [0.4, 1], postgres: [0.8, 0.8] } })],
  );
  const model = weightedScores(["mysql", "postgres"], groups, {});
  assert.equal(model.rankings.typedScore[0].id, "postgres");
  assert.equal(model.rankings.bestScore[0].id, "mysql");
});

test("empty rankings stay empty", () => {
  assert.deepEqual(ranking({}, "bestScore"), []);
});

test("weights keep the existing bounds and tenth-step rounding", () => {
  assert.deepEqual(
    [-1, 0, 0.14, 0.16, 2, 3].map(clampWeight),
    [0, 0, 0.1, 0.2, 2, 2],
  );
});

test("unknown goal engines fail before scoring", () => {
  const groups = groupGoals(
    ["and"],
    [goal({ kind: "and", values: { other: [1, 1] } })],
  );
  assert.throws(
    () => weightedScores(["mysql"], groups, {}),
    /unknown engine other/,
  );
});

test("rankings omit unavailable scores", () => {
  assert.deepEqual(
    ranking(
      { missing: { bestScore: null }, available: { bestScore: 1 } },
      "bestScore",
    ).map((row) => row.id),
    ["available"],
  );
});

test("formatted weights list only kinds that differ from the default", () => {
  assert.equal(
    formatWeights(["or", "and", "typing"], { or: 1, and: 0.5, typing: 3 }),
    "and:0.5,typing:2",
  );
  assert.equal(formatWeights(["or"], {}), "");
});

test("parsed weights drop unknown kinds and malformed values", () => {
  assert.deepEqual(
    parseWeights(
      ["or", "and", "typing"],
      "and:0.5,typing:3,other:1,or:1.25,,or",
    ),
    { and: 0.5, typing: 2 },
  );
});

test("weights survive a format and parse round trip", () => {
  const kinds = ["or", "and", "typing"];
  const weights = { and: 0, typing: 1.7 };
  assert.deepEqual(parseWeights(kinds, formatWeights(kinds, weights)), weights);
});
