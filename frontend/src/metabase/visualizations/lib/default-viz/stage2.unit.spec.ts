import {
  computeConfidence,
  computeRowStats,
  distinctCounts,
  flatness,
  groupedKeyUnique,
  kendallTau,
  logScaleCandidate,
  monotoneEvenlySpaced,
  nonIncreasingWithSlack,
  nullCategoryMetricShare,
  pearson,
  pieSliceCount,
  provisionalReasons,
  refineProfiles,
  regionMatch,
  timeSeriesSanity,
  topShare,
} from "./stage2";
import {
  candidate,
  categoryDim,
  countMeasure,
  eventLogRows,
  funnelRows,
  makeProfile,
  makeShape,
  monthlyRows,
  scored,
  stateRows,
  timeDim,
} from "./test-fixtures";

describe("row statistics", () => {
  it("counts distinct values per column and detects grouped keys", () => {
    const rows = [
      ["a", 1],
      ["b", 2],
      ["a", 3],
    ];
    expect(distinctCounts(rows, [0, 1], false)).toEqual({
      0: { count: 2, exact: true },
      1: { count: 3, exact: true },
    });
    expect(groupedKeyUnique(rows, [0])).toBe(false);
    expect(groupedKeyUnique(rows, [1])).toBe(true);
    expect(groupedKeyUnique(rows, [])).toBeNull();
  });

  it("matches state codes and names but not junk", () => {
    expect(regionMatch(["CA", "Texas", "ny", null], "us_states")).toBe(1);
    expect(regionMatch(["CA", "junk", "nowhere", "TX"], "us_states")).toBe(0.5);
    expect(regionMatch(["France", "de", "Brazil"], "world_countries")).toBe(1);
  });

  it("computes metric shares and pie slices with an Other bucket", () => {
    const rows = [
      ["a", 90],
      ["b", 5],
      ["c", 4],
      ["d", 1],
    ];
    expect(topShare(rows, 0, 1)).toBe(0.9);
    expect(pieSliceCount(rows, 0, 1)).toBe(4);
    expect(pieSliceCount(rows, 0, 1, 10)).toBe(2);
  });

  it("detects monotone, evenly spaced numeric x values", () => {
    expect(monotoneEvenlySpaced([1, 2, 3, 4])).toEqual({
      monotone: true,
      evenlySpaced: true,
    });
    expect(monotoneEvenlySpaced([1, 2, 10, 11])).toEqual({
      monotone: true,
      evenlySpaced: false,
    });
    expect(monotoneEvenlySpaced([3, 1, 2])).toEqual({
      monotone: false,
      evenlySpaced: false,
    });
  });

  it("measures rank correlation, pearson and funnel monotonicity", () => {
    expect(kendallTau([0, 1, 2, 3], [10, 8, 6, 4])).toBe(-1);
    expect(kendallTau([0, 1, 2, 3], [1, 2, 3, 4])).toBe(1);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [3, 3, 3])).toBe(0);
    expect(nonIncreasingWithSlack([1000, 640, 300, 120, 45])).toBe(true);
    expect(nonIncreasingWithSlack([100, 102, 90, 80])).toBe(true);
    expect(nonIncreasingWithSlack([100, 150, 90, 200])).toBe(false);
    expect(nonIncreasingWithSlack([5, 5, 5])).toBe(false);
  });

  it("checks time series regularity and missing buckets", () => {
    const regular = timeSeriesSanity(monthlyRows(12).map((row) => row[0]));
    expect(regular.sorted).toBe(true);
    expect(regular.regular).toBe(true);
    expect(regular.inferredUnit).toBe("month");
    expect(regular.missingBucketFrac).toBe(0);

    const gappy = timeSeriesSanity(
      monthlyRows(12)
        .map((row) => row[0])
        .filter((_, i) => i % 3 !== 1),
    );
    expect(gappy.missingBucketFrac).toBeGreaterThan(0.1);

    const events = timeSeriesSanity(eventLogRows(50).map((row) => row[0]));
    expect(events.allDistinct).toBe(true);
    expect(events.regular).toBe(false);
  });

  it("reports null category shares, flatness and log-scale candidates", () => {
    expect(
      nullCategoryMetricShare(
        [
          [null, 60],
          ["a", 40],
        ],
        0,
        1,
      ),
    ).toBe(0.6);
    expect(
      flatness(
        [
          ["a", 1],
          ["a", 1],
        ],
        0,
        1,
      ),
    ).toEqual({ allYEqual: true, singleX: true });
    expect(logScaleCandidate([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 100000])).toBe(
      true,
    );
    expect(logScaleCandidate([1, 2, 3])).toBe(false);
  });
});

describe("computeRowStats and refineProfiles", () => {
  it("only computes the stats relevant to the shape and refines cardinalities", () => {
    const profiles = [categoryDim(0, "status", 5), countMeasure(1)];
    const shape = makeShape(profiles);
    const stats = computeRowStats(funnelRows(), profiles, shape);
    expect(stats.rowCount).toBe(5);
    expect(stats.distinct[0]).toEqual({ count: 5, exact: true });
    expect(stats.nonIncreasing[0]).toBe(true);
    expect(stats.kendallTau[0]).toBe(-1);
    expect(stats.timeSeries).toEqual({});
    expect(stats.allNonNeg[1]).toBe(true);
    expect(stats.labelLength[0]).toBeGreaterThan(3);

    const [refined] = refineProfiles(profiles, stats);
    expect(refined.cardinality).toEqual({
      estimate: 5,
      exact: true,
      source: "rows",
    });
    expect(refined.labelLength).toBe(stats.labelLength[0]);
  });

  it("measures region key matches for region dimensions", () => {
    const state = makeProfile({
      index: 0,
      name: "STATE",
      role: "DIM_GEO_REGION",
      geo: { kind: "state", region: "us_states" },
    });
    const profiles = [state, countMeasure(1)];
    const stats = computeRowStats(
      stateRows(0.4),
      profiles,
      makeShape(profiles),
    );
    expect(stats.regionMatch[0]).toBeCloseTo(0.6);
    expect(refineProfiles(profiles, stats)[0].geo?.regionMatch).toBeCloseTo(
      0.6,
    );
  });
});

describe("computeConfidence and provisionalReasons", () => {
  it("multiplies axis role confidences by the rule factor", () => {
    const uncertain = makeProfile({
      index: 0,
      name: "c",
      role: "DIM_CATEGORY",
      roleConfidence: 0.8,
    });
    const profiles = [uncertain, countMeasure(1)];
    const chosen = scored(candidate("bar", null, { x: [0], metrics: [1] }), 0);
    expect(
      computeConfidence(chosen, profiles, makeShape(profiles)),
    ).toBeCloseTo(0.8);
    expect(
      computeConfidence(
        chosen,
        profiles,
        makeShape(profiles, { isNative: true }),
      ),
    ).toBeCloseTo(0.48);
  });

  it("flags estimated cardinalities and native raw rows in stage 1 only", () => {
    const profiles = [timeDim(0, "t"), countMeasure(1)];
    const chosen = scored(candidate("line", null, { x: [0], metrics: [1] }), 0);
    expect(
      provisionalReasons(
        chosen,
        makeShape(profiles, { isNative: true, aggregated: false }),
        profiles,
        null,
      ),
    ).toEqual(["cardinality-estimated", "native-raw"]);
    const stats = computeRowStats(
      monthlyRows(6),
      profiles,
      makeShape(profiles),
    );
    expect(
      provisionalReasons(
        chosen,
        makeShape(profiles),
        refineProfiles(profiles, stats),
        stats,
      ),
    ).toEqual([]);
  });
});
