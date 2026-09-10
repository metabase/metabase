import {
  estimateN,
  isAdditive,
  labelsLong,
  primaryTime,
  sameScale,
  seriesDim,
  summarizeShape,
} from "./shape";
import {
  AGGREGATED_CONTEXT,
  avgMeasure,
  categoryDim,
  countMeasure,
  makeProfile,
  timeDim,
} from "./test-fixtures";

describe("summarizeShape", () => {
  it("buckets profiles by role and estimates N from cardinalities", () => {
    const profiles = [
      timeDim(0, "CREATED_AT"),
      categoryDim(1, "CATEGORY", 4),
      countMeasure(2),
      makeProfile({ index: 3, name: "ID", role: "KEY", source: "fields" }),
      makeProfile({
        index: 4,
        name: "URL",
        role: "ATTRIBUTE",
        source: "fields",
      }),
    ];
    const shape = summarizeShape(profiles, AGGREGATED_CONTEXT);
    expect(shape.M.map((m) => m.name)).toEqual(["count"]);
    expect(shape.Dt.map((d) => d.name)).toEqual(["CREATED_AT"]);
    expect(shape.Dcat.map((d) => d.name)).toEqual(["CATEGORY"]);
    expect(shape.D).toHaveLength(2);
    expect(shape.K).toHaveLength(1);
    expect(shape.A).toHaveLength(1);
    expect(shape.N).toBe(96);
    expect(shape.nExact).toBe(false);
    expect(shape.allAdditive).toBe(true);
    expect(shape.allColsAggOrBreakout).toBe(false);
  });

  it("prefers exact row counts", () => {
    const shape = summarizeShape([countMeasure(0)], {
      ...AGGREGATED_CONTEXT,
      rowCount: 1,
      rowCountExact: true,
    });
    expect(shape.N).toBe(1);
    expect(shape.nExact).toBe(true);
  });
});

describe("estimateN", () => {
  it("is 1 for an aggregate with no dimensions and null when unknown", () => {
    expect(estimateN([], [countMeasure(0)], AGGREGATED_CONTEXT).N).toBe(1);
    expect(
      estimateN([], [], { ...AGGREGATED_CONTEXT, aggregated: false }).N,
    ).toBeNull();
    expect(
      estimateN(
        [categoryDim(0, "x", 3), timeDim(1, "t")],
        [],
        AGGREGATED_CONTEXT,
      ).N,
    ).toBe(72);
  });
});

describe("primaryTime and seriesDim", () => {
  it("picks the finest truncation unit as the primary time axis", () => {
    const year = timeDim(0, "year", "year");
    const day = timeDim(1, "day", "day");
    expect(primaryTime([year, day])).toBe(day);
    expect(primaryTime([])).toBeNull();
  });

  it("picks the lowest-cardinality other dimension as the series", () => {
    const axis = categoryDim(0, "axis", 30);
    const small = categoryDim(1, "small", 3);
    const big = categoryDim(2, "big", 50);
    expect(seriesDim([axis, big, small], axis)).toBe(small);
    expect(seriesDim([axis], axis)).toBeNull();
  });
});

describe("measure helpers", () => {
  it("knows additivity and scale families", () => {
    expect(isAdditive(countMeasure(0))).toBe(true);
    expect(isAdditive(avgMeasure(1))).toBe(false);
    expect(sameScale([countMeasure(0), countMeasure(1, "count_2")])).toBe(true);
    expect(sameScale([countMeasure(0), avgMeasure(1)])).toBe(false);
    expect(sameScale([avgMeasure(0)])).toBe(true);
  });

  it("flags long labels above the threshold", () => {
    expect(
      labelsLong(
        makeProfile({
          index: 0,
          name: "x",
          role: "DIM_CATEGORY",
          labelLength: 13,
        }),
      ),
    ).toBe(true);
    expect(labelsLong(categoryDim(0, "x", 3))).toBe(false);
  });
});
