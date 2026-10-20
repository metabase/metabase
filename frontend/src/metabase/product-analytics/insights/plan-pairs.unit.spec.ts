import { indexCounts } from "./counts";
import { DEFAULT_INSIGHT_OPTIONS } from "./options";
import { getPairRowBound, planPairs } from "./plan-pairs";
import type { GroupCounts } from "./types";

const group = (
  attributeId: string,
  value: string,
  reached: number,
  converted = Math.round(reached * 0.3),
): GroupCounts => ({
  question: 1,
  conditions: [{ attributeId, value }],
  reached,
  converted,
});

const TOTAL: GroupCounts = {
  question: 1,
  conditions: [],
  reached: 10000,
  converted: 3000,
};

describe("getPairRowBound", () => {
  it("sums the value combinations of every pair of columns, per question", () => {
    // The plan's example: 8 columns over a 3-step funnel.
    expect(getPairRowBound([3, 5, 5, 10, 8, 6, 4, 8], 2)).toBe(2062);
  });

  it("is zero for a single column", () => {
    expect(getPairRowBound([20], 4)).toBe(0);
  });
});

describe("planPairs", () => {
  it("keeps only values big enough to be part of a reportable pair", () => {
    // The minimum group size is max(100, 1% of 10,000) = 100.
    const index = indexCounts({
      rows: [
        TOTAL,
        group("os", "iOS", 3000),
        group("os", "Android", 6950),
        group("os", "BeOS", 50),
        group("browser", "Safari", 4000),
        group("browser", "Chrome", 6000),
      ],
      singleAttributes: ["os", "browser"],
    });
    expect(planPairs(index, ["os", "browser"])).toEqual(
      new Map([
        ["os", ["Android", "iOS"]],
        ["browser", ["Chrome", "Safari"]],
      ]),
    );
  });

  it("puts the column with the strongest effect first", () => {
    const index = indexCounts({
      rows: [
        TOTAL,
        group("os", "iOS", 5000),
        group("os", "Android", 5000),
        group("browser", "Safari", 5000, 500),
        group("browser", "Chrome", 5000, 2500),
      ],
      singleAttributes: ["os", "browser"],
    });
    expect([...planPairs(index, ["os", "browser"]).keys()]).toEqual([
      "browser",
      "os",
    ]);
  });

  it("adds columns only while the most rows the query could return fits the budget", () => {
    const values = (attributeId: string, count: number) =>
      Array.from({ length: count }, (_, i) =>
        group(attributeId, `${attributeId}-${i}`, 10000 / count),
      );
    const index = indexCounts({
      rows: [TOTAL, ...values("a", 20), ...values("b", 20), ...values("c", 20)],
      singleAttributes: ["a", "b", "c"],
    });
    // Two columns: 400 rows. Three: 1,200.
    expect([
      ...planPairs(index, ["a", "b", "c"], {
        ...DEFAULT_INSIGHT_OPTIONS,
        pairRowBudget: 1000,
      }).keys(),
    ]).toEqual(["a", "b"]);
  });

  it("is empty when fewer than two columns have values to keep", () => {
    const index = indexCounts({
      rows: [TOTAL, group("os", "iOS", 5000), group("os", "Android", 5000)],
      singleAttributes: ["os"],
    });
    expect(planPairs(index, ["os"]).size).toBe(0);
  });
});
