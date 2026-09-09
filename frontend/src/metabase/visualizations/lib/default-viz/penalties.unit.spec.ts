import { CAPS, K, W, seriesPenalty, xCardinalityPenalty } from "./constants";
import { pickAlternatives, rankCandidates, scoreCandidate } from "./penalties";
import {
  avgMeasure,
  candidate,
  categoryDim,
  countMeasure,
  makeProfile,
  makeShape,
  scored,
  timeDim,
} from "./test-fixtures";
import type { ColumnProfile, PenaltyId } from "./types";

const contributions = (
  c: ReturnType<typeof candidate>,
  profiles: ColumnProfile[],
  ctx = {},
): Partial<Record<PenaltyId, number>> =>
  Object.fromEntries(
    scoreCandidate(c, makeShape(profiles, ctx), profiles, null, 1).map((p) => [
      p.id,
      p.contribution,
    ]),
  );

describe("piecewise penalties", () => {
  it("xCardinalityPenalty stays under the table baseline until the row cap", () => {
    expect(xCardinalityPenalty(K.K6_BAR_MAX_CATEGORIES)).toBe(0);
    expect(xCardinalityPenalty(K.K6_BAR_MAX_CATEGORIES + 1)).toBeCloseTo(0.1);
    expect(xCardinalityPenalty(CAPS.ROW_PROVISIONAL_MAX)).toBeLessThan(
      W["table-when-chart"],
    );
    expect(xCardinalityPenalty(CAPS.ROW_PROVISIONAL_MAX + 1)).toBe(100);
  });

  it("seriesPenalty crosses the pivot baseline right after K4", () => {
    const pivotBaseline = W["table-when-chart"] + W["pivot-vs-table-bonus"];
    expect(seriesPenalty(K.K8_STACK_MAX_SERIES)).toBe(0);
    expect(seriesPenalty(K.K8_STACK_MAX_SERIES + 1)).toBeCloseTo(0.45);
    expect(seriesPenalty(K.K4_LINE_MAX_SERIES)).toBeLessThan(pivotBaseline);
    expect(seriesPenalty(K.K4_LINE_MAX_SERIES + 1)).toBeGreaterThan(
      pivotBaseline,
    );
    expect(seriesPenalty(CAPS.MAX_SERIES + 1)).toBe(100);
  });
});

describe("scoreCandidate", () => {
  const longLabels = makeProfile({
    index: 0,
    name: "vendor",
    role: "DIM_CATEGORY",
    labelLength: 20,
    cardinality: { estimate: 8, exact: false, source: "fingerprint" },
  });

  it("penalises vertical bars with long labels and rows with short ones", () => {
    expect(
      contributions(candidate("bar", null, { x: [0], metrics: [1] }), [
        longLabels,
        countMeasure(1),
      ]),
    ).toMatchObject({
      "long-labels-vertical-bar": W["long-labels-vertical-bar"],
    });
    expect(
      contributions(candidate("row", null, { x: [0], metrics: [1] }), [
        categoryDim(0, "c", 4),
        countMeasure(1),
      ]),
    ).toMatchObject({
      "row-vs-bar-short-labels": W["row-vs-bar-short-labels"],
    });
  });

  it("penalises lines on unordered x and time dimensions kept off the x axis", () => {
    const profiles = [timeDim(0, "t"), categoryDim(1, "c", 4), countMeasure(2)];
    const line = contributions(
      candidate("line", null, { x: [1], series: [0], metrics: [2] }),
      profiles,
    );
    expect(line["time-not-on-x"]).toBe(W["time-not-on-x"]);
    expect(line["line-unordered-x"]).toBe(W["line-unordered-x"]);
  });

  it("charges tables a baseline and gives pivots a bonus with two dimensions", () => {
    const profiles = [timeDim(0, "t"), categoryDim(1, "c", 4), countMeasure(2)];
    expect(contributions(candidate("table", null, {}), profiles)).toMatchObject(
      {
        "table-when-chart": W["table-when-chart"],
        "table-no-mini-bar": W["table-no-mini-bar"],
      },
    );
    expect(
      contributions(
        candidate("pivot", null, {
          pivotColumns: [1],
          pivotRows: [0],
          metrics: [2],
        }),
        profiles,
      ),
    ).toMatchObject({ "pivot-vs-table-bonus": W["pivot-vs-table-bonus"] });
  });

  it("charges dropped columns and mixed scales on a shared axis", () => {
    const profiles = [categoryDim(0, "c", 4), countMeasure(1), avgMeasure(2)];
    const single = contributions(
      candidate("bar", null, { x: [0], metrics: [1] }),
      profiles,
    );
    expect(single["measure-dropped"]).toBe(W["measure-dropped"]);
    const shared = contributions(
      candidate("bar", "grouped", { x: [0], metrics: [1, 2] }),
      profiles,
    );
    expect(shared["mixed-scale-shared-axis"]).toBe(
      W["mixed-scale-shared-axis"],
    );
    expect(
      contributions(
        candidate("combo", null, { x: [0], metrics: [1, 2] }),
        profiles,
      )["mixed-scale-shared-axis"],
    ).toBeUndefined();
  });

  it("scales the confidence penalty with uncertain axis roles", () => {
    const uncertain = makeProfile({
      index: 0,
      name: "c",
      role: "DIM_CATEGORY",
      roleConfidence: 0.8,
    });
    expect(
      contributions(candidate("bar", null, { x: [0], metrics: [1] }), [
        uncertain,
        countMeasure(1),
      ])["role-confidence"],
    ).toBeCloseTo(6);
  });
});

describe("rankCandidates and pickAlternatives", () => {
  it("sorts infeasible candidates last with an infinite score", () => {
    const profiles = [categoryDim(0, "c", 4), countMeasure(1)];
    const ranked = rankCandidates(
      [
        candidate("scalar", null, { scalarField: [1] }),
        candidate("bar", null, { x: [0], metrics: [1] }),
      ],
      makeShape(profiles),
      profiles,
      null,
      1,
    );
    expect(ranked.map((c) => c.display)).toEqual(["bar", "scalar"]);
    expect(ranked[1].score).toBe(Infinity);
    expect(ranked[1].feasible).toBe(false);
  });

  it("returns the next distinct feasible displays", () => {
    const bar = scored(candidate("bar", null, {}), 0);
    const ranked = [
      bar,
      scored(candidate("bar", "stacked", {}), 1),
      scored(candidate("row", null, {}), 2),
      scored(candidate("pie", null, {}), 3, false),
      scored(candidate("table", null, {}), 4),
    ];
    expect(pickAlternatives(ranked, bar, 5).map((c) => c.display)).toEqual([
      "row",
      "table",
    ]);
    expect(pickAlternatives(ranked, bar, 1).map((c) => c.display)).toEqual([
      "row",
    ]);
  });
});
