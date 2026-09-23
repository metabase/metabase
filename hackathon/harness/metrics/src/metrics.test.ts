import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { MetricRow, QueryResultRow, Scenario } from "../../shared/types.ts";

import {
  aggregateByTag,
  annRecallAtK,
  falsePositiveRate,
  intersectionSize,
  jaccardAtK,
  kendallTau,
  mrr,
  ndcgAtK,
  pairwiseAgreementMatrix,
  percentiles,
  permissionLeak,
  precisionAtK,
  rankDisplacement,
  recallAtK,
  stageBreakdown,
  toMetricRows,
  zeroResultRate,
  type Item,
} from "./metrics.ts";

function approx(actual: number | null | undefined, expected: number): void {
  assert.ok(typeof actual === "number", `expected a number close to ${expected}, got ${actual}`);
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);
}

const card = (id: number, score = 0.5) => ({ model: "card", id, score });
const dash = (id: number) => ({ model: "dashboard", id, score: 0.5 });
const rel = ({ model, id }: Item, grade: number) => ({ model, id, grade });

// ---------------------------------------------------------------------------------------------------
// Labelled quality

describe("recallAtK", () => {
  const expected = [rel(card(1), 2), rel(card(2), 1), rel(card(3), 1)];
  it("2 of 3 relevant items in the top 5", () =>
    approx(recallAtK([card(1), card(9), card(3), card(8), card(7)], expected, 5), 2 / 3));
  it("a relevant item below k does not count", () =>
    approx(recallAtK([card(1), card(9), card(3)], expected, 2), 1 / 3));
  it("k larger than the result list", () => approx(recallAtK([card(1)], expected, 100), 1 / 3));
  it("empty result list", () => assert.equal(recallAtK([], expected, 10), 0));
  it("grade 0 is not relevant", () =>
    approx(recallAtK([card(1)], [rel(card(1), 1), rel(card(2), 0)], 10), 1));
  it("undefined without relevant items", () => {
    assert.equal(recallAtK([card(1)], [], 10), null);
    assert.equal(recallAtK([], [], 10), null);
  });
});

describe("precisionAtK", () => {
  const expected = [rel(card(1), 2), rel(card(2), 1)];
  it("2 relevant of 4 in the top 4", () =>
    approx(precisionAtK([card(1), card(9), card(2), card(8)], expected, 4), 0.5));
  it("denominator is k even when fewer than k results come back", () =>
    approx(precisionAtK([card(1), card(2), card(9)], expected, 5), 2 / 5));
  it("single-element list", () => approx(precisionAtK([card(1)], expected, 1), 1));
  it("empty result list", () => assert.equal(precisionAtK([], expected, 10), 0));
  it("undefined without relevant items", () => assert.equal(precisionAtK([card(1)], [], 10), null));
});

describe("mrr", () => {
  const expected = [rel(card(2), 1), rel(card(3), 2)];
  it("first relevant hit at rank 3", () => approx(mrr([card(7), card(8), card(3), card(2)], expected), 1 / 3));
  it("first relevant hit at rank 1", () => approx(mrr([card(2)], expected), 1));
  it("no relevant hit is 0, not null", () => {
    assert.equal(mrr([card(7)], expected), 0);
    assert.equal(mrr([], expected), 0);
  });
  it("undefined without relevant items", () => assert.equal(mrr([card(1)], []), null));
});

describe("ndcgAtK", () => {
  // results: A (grade 2), X (irrelevant), B (grade 1); labels: A=2, B=1, C=1
  // DCG  = (2^2-1)/log2(2) + 0 + (2^1-1)/log2(4)              = 3 + 0.5
  // IDCG = (2^2-1)/log2(2) + (2^1-1)/log2(3) + (2^1-1)/log2(4) = 3 + 1/log2(3) + 0.5
  const expected = [rel(card(1), 2), rel(card(2), 1), rel(card(3), 1)];
  const idcg = 3 + 1 / Math.log2(3) + 0.5;
  it("worked example", () => approx(ndcgAtK([card(1), card(9), card(2)], expected, 3), 3.5 / idcg));
  it("ideal ordering is 1", () => approx(ndcgAtK([card(1), card(2), card(3)], expected, 3), 1));
  it("ideal DCG is cut at k: at k=1 only the top label counts", () => {
    approx(ndcgAtK([card(1), card(9)], expected, 1), 1);
    approx(ndcgAtK([card(2)], expected, 1), 1 / 3);
  });
  it("k larger than the result list", () => approx(ndcgAtK([card(1)], expected, 10), 3 / idcg));
  it("empty result list", () => assert.equal(ndcgAtK([], expected, 10), 0));
  it("undefined without relevant items", () => assert.equal(ndcgAtK([card(1)], [], 10), null));
});

describe("item identity is (model, id)", () => {
  it("card 1 and dashboard 1 are different items", () => {
    assert.equal(recallAtK([dash(1)], [rel(card(1), 1)], 10), 0);
    assert.equal(jaccardAtK([card(1)], [dash(1)], 10), 0);
  });
});

describe("score ties and duplicates", () => {
  const expected = [rel(card(2), 1)];
  it("equal scores keep the engine's order", () => {
    approx(mrr([card(1, 0.8), card(2, 0.8)], expected), 0.5);
    approx(mrr([card(2, 0.8), card(1, 0.8)], expected), 1);
  });
  it("the list is never re-sorted by score", () => approx(mrr([card(1, 0.1), card(2, 0.9)], expected), 0.5));
  it("a repeated item counts at its first position only", () => {
    approx(mrr([card(1), card(1), card(2)], expected), 0.5);
    approx(precisionAtK([card(1), card(1), card(1)], [rel(card(1), 1)], 3), 1 / 3);
  });
});

describe("zeroResultRate and falsePositiveRate", () => {
  const scenarios = [
    { expected: [rel(card(1), 1)], results: [card(1)] },
    { expected: [rel(card(1), 1)], results: [] },
    { expected: [], results: [] },
    { expected: [], results: [card(5)] },
  ];
  it("zero results among scenarios that expect something; empty-expected excluded", () =>
    approx(zeroResultRate(scenarios), 0.5));
  it("false positives among empty-expected scenarios", () => approx(falsePositiveRate(scenarios), 0.5));
  it("undefined when no scenario qualifies", () => {
    assert.equal(zeroResultRate([{ expected: [], results: [] }]), null);
    assert.equal(falsePositiveRate([{ expected: [rel(card(1), 1)], results: [] }]), null);
    assert.equal(zeroResultRate([]), null);
  });
});

describe("permissionLeak", () => {
  const forbidden = [card(163), dash(32)];
  it("a forbidden item anywhere in the list is a leak, regardless of rank", () => {
    const results = Array.from({ length: 30 }, (_, i) => card(1000 + i));
    assert.equal(permissionLeak([...results, dash(32)], forbidden), 1);
  });
  it("no forbidden item is 0", () => {
    assert.equal(permissionLeak([card(1), card(2)], forbidden), 0);
    assert.equal(permissionLeak([], forbidden), 0);
  });
  it("identity is (model, id): card 32 is not dashboard 32", () =>
    assert.equal(permissionLeak([card(32)], forbidden), 0));
  it("undefined when the scenario lists no forbidden items", () => {
    assert.equal(permissionLeak([card(163)], []), null);
    assert.equal(permissionLeak([card(163)], undefined), null);
    assert.equal(permissionLeak([card(163)], null), null);
  });
});

// ---------------------------------------------------------------------------------------------------
// Unlabelled agreement

describe("jaccardAtK", () => {
  it("{1 2 3} vs {2 3 4}: 2 shared of 4", () =>
    approx(jaccardAtK([card(1), card(2), card(3)], [card(2), card(3), card(4)], 3), 0.5));
  it("only the top k count", () =>
    approx(jaccardAtK([card(1), card(2), card(9)], [card(2), card(1), card(8)], 2), 1));
  it("k larger than both lists", () => approx(jaccardAtK([card(1), card(2)], [card(2), card(3)], 100), 1 / 3));
  it("one side empty is total disagreement", () => assert.equal(jaccardAtK([card(1)], [], 10), 0));
  it("both empty is undefined", () => assert.equal(jaccardAtK([], [], 10), null));
});

describe("kendallTau", () => {
  it("one discordant pair of 6: (5 - 1) / 6", () =>
    approx(kendallTau([card(1), card(2), card(3), card(4)], [card(1), card(3), card(2), card(4)]), 2 / 3));
  it("identical and reversed orders", () => {
    approx(kendallTau([card(1), card(2), card(3)], [card(1), card(2), card(3)]), 1);
    approx(kendallTau([card(1), card(2), card(3)], [card(3), card(2), card(1)]), -1);
  });
  it("items in only one list are ignored", () => {
    const a = [card(1), card(9), card(2)];
    const b = [card(8), card(1), card(7), card(2)];
    approx(kendallTau(a, b), 1);
    assert.equal(intersectionSize(a, b), 2);
  });
  it("disjoint lists are undefined", () => {
    assert.equal(kendallTau([card(1), card(2)], [card(3), card(4)]), null);
    assert.equal(intersectionSize([card(1), card(2)], [card(3), card(4)]), 0);
  });
  it("a single shared item is undefined", () => {
    assert.equal(kendallTau([card(1)], [card(1)]), null);
    assert.equal(kendallTau([card(1), card(2)], [card(1), card(3)]), null);
  });
  it("empty lists are undefined", () => assert.equal(kendallTau([], []), null));
});

describe("rankDisplacement", () => {
  it("card 1 at ranks 1→2, card 3 at ranks 3→1: (1 + 2) / 2", () =>
    approx(rankDisplacement([card(1), card(2), card(3)], [card(3), card(1)]), 1.5));
  it("same order is 0", () => approx(rankDisplacement([card(1)], [card(1)]), 0));
  it("no shared items is undefined", () => {
    assert.equal(rankDisplacement([card(1)], [card(2)]), null);
    assert.equal(rankDisplacement([], []), null);
  });
});

describe("pairwiseAgreementMatrix", () => {
  const matrix = pairwiseAgreementMatrix(
    (a, b) => jaccardAtK(a, b, 10),
    new Map<string, Item[]>([
      ["a", [card(1), card(2)]],
      ["b", [card(2), card(3)]],
      ["c", []],
    ]),
  );
  const value = (a: string, b: string) => matrix.find(([x, y]) => x === a && y === b)?.[2];
  it("every ordered pair of distinct engines, no diagonal", () =>
    assert.deepEqual(
      new Set(matrix.map(([a, b]) => `${a}-${b}`)),
      new Set(["a-b", "b-a", "a-c", "c-a", "b-c", "c-b"]),
    ));
  it("values", () => {
    approx(value("a", "b"), 1 / 3);
    approx(value("b", "a"), 1 / 3);
    assert.equal(value("a", "c"), 0);
  });
});

// ---------------------------------------------------------------------------------------------------
// Fidelity

describe("annRecallAtK", () => {
  const exact = [card(1), card(2), card(3), card(4)];
  it("2 of the exact top 4 found", () => approx(annRecallAtK([card(1), card(3), card(8), card(9)], exact, 4), 0.5));
  it("both sides are cut at k", () => approx(annRecallAtK([card(1), card(3), card(2)], exact, 2), 0.5));
  it("empty approximate result", () => assert.equal(annRecallAtK([], exact, 4), 0));
  it("denominator is the exact list when it is shorter than k", () =>
    approx(annRecallAtK([card(1), card(5)], [card(1)], 10), 1));
  it("undefined without an exact result", () => assert.equal(annRecallAtK([card(1)], [], 10), null));
});

// ---------------------------------------------------------------------------------------------------
// Latency

describe("percentiles", () => {
  it("R-7 on 1..10: h = 9p, so p50 = 5.5, p95 = 9 + 0.55, p99 = 9 + 0.91", () => {
    const { p50, p95, p99 } = percentiles([7, 3, 10, 1, 5, 2, 9, 4, 8, 6]);
    approx(p50, 5.5);
    approx(p95, 9.55);
    approx(p99, 9.91);
  });
  it("single timing", () => assert.deepEqual(percentiles([7]), { p50: 7, p95: 7, p99: 7 }));
  it("null timings are ignored", () => assert.deepEqual(percentiles([null, 2, undefined]), { p50: 2, p95: 2, p99: 2 }));
  it("no timings", () => {
    assert.deepEqual(percentiles([]), { p50: null, p95: null, p99: null });
    assert.deepEqual(percentiles([null]), { p50: null, p95: null, p99: null });
  });
});

describe("stageBreakdown", () => {
  it("ratio of sums: embed 60/200, store 80/200, filter 20/200, remainder 40/200", () => {
    const shares = stageBreakdown([
      { latencyMs: 100, embedMs: 20, storeMs: 50, filterMs: 10 },
      { latencyMs: 100, embedMs: 40, storeMs: 30, filterMs: 10 },
      { latencyMs: 999, embedMs: null, storeMs: 1, filterMs: 1 },
    ]);
    approx(shares.embedShare, 0.3);
    approx(shares.storeShare, 0.4);
    approx(shares.filterShare, 0.1);
    approx(shares.otherShare, 0.2);
  });
  it("no waterfall data (the HTTP runner never has any)", () => {
    const none = { embedShare: null, storeShare: null, filterShare: null, otherShare: null };
    assert.deepEqual(stageBreakdown([{ latencyMs: 10 }]), none);
    assert.deepEqual(stageBreakdown([]), none);
  });
});

// ---------------------------------------------------------------------------------------------------
// Aggregation

describe("aggregateByTag", () => {
  const base = { engine: "semantic", engineB: null, embedder: "e", tag: null, metric: "mrr" };
  const rows = aggregateByTag([
    { ...base, scenarioId: "s1", tags: ["paraphrase", "typo"], value: 1 },
    { ...base, scenarioId: "s2", tags: ["paraphrase"], value: 0 },
    { ...base, engine: "appdb", scenarioId: "s1", tags: ["paraphrase", "typo"], value: 0.5 },
  ]);
  const value = (engine: string, tag: string | null) =>
    rows.find((r) => r.engine === engine && r.tag === tag)?.value;
  it("one row per tag plus an overall row, per engine", () => {
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => r.scenarioId === null));
  });
  it("means", () => {
    approx(value("semantic", "paraphrase"), 0.5);
    approx(value("semantic", "typo"), 1);
    approx(value("semantic", null), 0.5);
    approx(value("appdb", "paraphrase"), 0.5);
  });
});

describe("toMetricRows", () => {
  const scenarios: Scenario[] = [
    { id: "s1", query: "q1", tags: ["paraphrase"], expected: [rel(card(1), 2)] },
    { id: "s2", query: "q2", tags: ["empty-expected"], expected: [], expectedAbsent: [card(3)] },
  ];
  const obs = (engine: string, scenarioId: string, iteration: number, returned: Item[] | null,
    extra: Partial<QueryResultRow> = {}): QueryResultRow =>
    ({ engine, embedder: "e", scenarioId, iteration, latencyMs: 10, returned, ...extra });
  const rows = toMetricRows(scenarios, [
    obs("semantic", "s1", 0, null, { error: "boom", latencyMs: null }),
    obs("semantic", "s1", 1, [card(9), card(1)]),
    obs("semantic", "s2", 0, []),
    obs("exact", "s1", 0, [card(1), card(2)]),
    obs("exact", "s2", 0, [card(3)]),
  ], { annReference: "exact" });
  const lookup = (engine: string, engineB: string | null, scenarioId: string | null, metric: string) => {
    const found = rows.filter((r: MetricRow) =>
      r.engine === engine && (r.engineB ?? null) === engineB && (r.scenarioId ?? null) === scenarioId &&
      r.tag === null && r.metric === metric);
    assert.ok(found.length <= 1, `duplicate rows for ${engine}/${engineB}/${scenarioId}/${metric}`);
    return found[0]?.value;
  };

  it("every row has a finite value", () =>
    assert.ok(rows.every((r) => typeof r.value === "number" && Number.isFinite(r.value))));
  it("quality uses the first non-errored iteration", () => {
    approx(lookup("semantic", null, "s1", "mrr"), 0.5);
    assert.equal(lookup("semantic", null, "s1", "zero_result_rate"), 0);
  });
  it("empty-expected scenarios get false_positive_rate and nothing label-based", () => {
    assert.equal(lookup("semantic", null, "s2", "false_positive_rate"), 0);
    assert.equal(lookup("exact", null, "s2", "false_positive_rate"), 1);
    assert.equal(lookup("semantic", null, "s2", "zero_result_rate"), undefined);
    assert.equal(lookup("semantic", null, "s2", "recall@10"), undefined);
  });
  it("permission_leak only where expectedAbsent is set", () => {
    assert.equal(lookup("exact", null, "s2", "permission_leak"), 1);
    assert.equal(lookup("semantic", null, "s2", "permission_leak"), 0);
    assert.equal(lookup("semantic", null, "s1", "permission_leak"), undefined);
  });
  it("pairwise rows in both directions, undefined ones omitted", () => {
    approx(lookup("semantic", "exact", "s1", "jaccard@10"), 1 / 3);
    approx(lookup("exact", "semantic", "s1", "jaccard@10"), 1 / 3);
    assert.equal(lookup("semantic", "exact", "s1", "kendall_tau_n"), 1);
    assert.equal(lookup("semantic", "exact", "s1", "kendall_tau"), undefined);
    assert.equal(lookup("semantic", "exact", "s2", "jaccard@10"), 0);
  });
  it("ann recall against the reference only", () => {
    approx(lookup("semantic", null, "s1", "ann_recall@10"), 0.5);
    assert.equal(lookup("exact", null, "s1", "ann_recall@10"), undefined);
  });
  it("per-tag and overall aggregates", () => {
    const tags = rows.filter((r) => r.scenarioId === null && r.metric === "mrr" && r.engine === "semantic")
      .map((r) => r.tag);
    assert.deepEqual(new Set(tags), new Set([null, "paraphrase"]));
  });
  it("latency over every observation with a timing; no shares without a waterfall", () => {
    approx(lookup("semantic", null, null, "p95_ms"), 10);
    assert.equal(lookup("semantic", null, null, "embed_share"), undefined);
  });
});

describe("toMetricRows latency skips errored iterations", () => {
  // The runner records latencyMs (and stage timings) on errored queries too; the cards filter `error IS NULL`.
  const scenarios: Scenario[] = [{ id: "s1", query: "q1", tags: [], expected: [rel(card(1), 2)] }];
  const obs = (iteration: number, latencyMs: number, embedMs: number, extra: Partial<QueryResultRow> = {}) =>
    ({ engine: "semantic", embedder: "e", scenarioId: "s1", iteration, latencyMs, embedMs, storeMs: 10,
      filterMs: 10, returned: [card(1)], ...extra }) as QueryResultRow;
  const rows = toMetricRows(scenarios, [
    obs(0, 100, 40),
    obs(1, 100, 40),
    obs(2, 5000, 4900, { error: "timeout", returned: null }),
  ]);
  const run = (metric: string) =>
    rows.find((r) => r.scenarioId === null && r.tag === null && r.metric === metric)?.value;

  it("percentiles", () => {
    approx(run("p50_ms"), 100);
    approx(run("p95_ms"), 100);
    approx(run("p99_ms"), 100);
  });
  it("stage shares", () => approx(run("embed_share"), 0.4));
});

describe("toMetricRows unscored_rate", () => {
  const scenarios: Scenario[] = [
    { id: "s1", query: "q1", tags: ["paraphrase"], expected: [rel(card(1), 2)] },
    { id: "s2", query: "q2", tags: ["paraphrase"], expected: [rel(card(2), 2)] },
  ];
  const obs = (engine: string, scenarioId: string, iteration: number, extra: Partial<QueryResultRow> = {}) =>
    ({ engine, embedder: "e", scenarioId, iteration, latencyMs: 10, returned: [card(1)], ...extra }) as QueryResultRow;
  const rows = toMetricRows(scenarios, [
    obs("semantic", "s1", 0),
    obs("semantic", "s2", 0, { error: "boom", returned: null }),
    obs("semantic", "s2", 1, { error: "boom", returned: null }),
    obs("appdb", "s1", 0),
    obs("appdb", "s2", 0, { error: "boom", returned: null }),
    obs("appdb", "s2", 1),
  ]);
  const value = (engine: string, scenarioId: string | null, metric: string, tag: string | null = null) =>
    rows.find((r) => r.engine === engine && (r.scenarioId ?? null) === scenarioId && r.tag === tag &&
      r.metric === metric)?.value;

  it("1 when every iteration errored, 0 when any succeeded", () => {
    assert.equal(value("semantic", "s1", "unscored_rate"), 0);
    assert.equal(value("semantic", "s2", "unscored_rate"), 1);
    assert.equal(value("appdb", "s2", "unscored_rate"), 0);
  });
  it("the unscored scenario has no quality rows", () => assert.equal(value("semantic", "s2", "ndcg@10"), undefined));
  it("run-level and per-tag means are the share of unscored questions", () => {
    approx(value("semantic", null, "unscored_rate"), 0.5);
    approx(value("semantic", null, "unscored_rate", "paraphrase"), 0.5);
    approx(value("appdb", null, "unscored_rate"), 0);
  });
});
