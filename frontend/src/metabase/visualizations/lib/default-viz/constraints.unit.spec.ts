import { applyHardConstraints } from "./constraints";
import {
  avgMeasure,
  candidate,
  categoryDim,
  countMeasure,
  makeProfile,
  makeRowStats,
  makeShape,
  timeDim,
} from "./test-fixtures";
import type { ColumnProfile, HardConstraintId, RowStats } from "./types";

const failureIds = (
  c: ReturnType<typeof candidate>,
  profiles: ColumnProfile[],
  rowStats: RowStats | null = null,
  ctx = {},
): HardConstraintId[] =>
  applyHardConstraints(c, makeShape(profiles, ctx), profiles, rowStats).map(
    (f) => f.id,
  );

describe("applyHardConstraints", () => {
  it("rejects a pie with too many slices or a non-additive metric", () => {
    const pie = candidate("pie", null, { x: [0], metrics: [1] });
    expect(
      failureIds(pie, [categoryDim(0, "cat", 12), countMeasure(1)]),
    ).toContain("pie-slices-or-additive-or-negative");
    expect(
      failureIds(pie, [categoryDim(0, "cat", 4), avgMeasure(1)]),
    ).toContain("pie-slices-or-additive-or-negative");
    expect(
      failureIds(pie, [categoryDim(0, "cat", 4), countMeasure(1)]),
    ).toEqual([]);
  });

  it("rejects stacking non-additive measures", () => {
    const stacked = candidate("bar", "stacked", {
      x: [0],
      series: [1],
      metrics: [2],
    });
    const profiles = [
      categoryDim(0, "a", 5),
      categoryDim(1, "b", 3),
      avgMeasure(2),
    ];
    expect(failureIds(stacked, profiles)).toContain("stacked-non-additive");
  });

  it("rejects a scalar unless there is exactly one row", () => {
    const scalar = candidate("scalar", null, { scalarField: [0] });
    expect(failureIds(scalar, [countMeasure(0)])).toEqual([]);
    expect(
      failureIds(scalar, [countMeasure(0), categoryDim(1, "c", 4)]),
    ).toContain("scalar-needs-n1");
    expect(
      failureIds(scalar, [countMeasure(0)], null, { aggregated: false }),
    ).toContain("scalar-needs-n1");
  });

  it("rejects extraction units on a timeseries axis and attributes on any axis", () => {
    const cyclic = makeProfile({
      index: 0,
      name: "dow",
      role: "DIM_CYCLIC",
      unit: "day-of-week",
      unitKind: "extraction",
    });
    expect(
      failureIds(candidate("line", null, { x: [0], metrics: [1] }), [
        cyclic,
        countMeasure(1),
      ]),
    ).toContain("extraction-not-timeseries");
    const attribute = makeProfile({ index: 0, name: "url", role: "ATTRIBUTE" });
    expect(
      failureIds(candidate("bar", null, { x: [0], metrics: [1] }), [
        attribute,
        countMeasure(1),
      ]),
    ).toContain("attribute-not-axis");
  });

  it("rejects region maps once row stats show junk keys", () => {
    const state = makeProfile({
      index: 0,
      name: "STATE",
      role: "DIM_GEO_REGION",
      geo: { kind: "state", region: "us_states" },
      cardinality: { estimate: 49, exact: false, source: "fingerprint" },
    });
    const region = candidate("map", "region", { region: [0], metrics: [1] });
    expect(failureIds(region, [state, countMeasure(1)])).toEqual([]);
    expect(
      failureIds(
        region,
        [state, countMeasure(1)],
        makeRowStats({ regionMatch: { 0: 0.6 } }),
      ),
    ).toContain("region-needs-keys");
  });

  it("requires coordinates for pin and binned coordinates for grid maps", () => {
    const lat = makeProfile({
      index: 0,
      name: "lat",
      role: "DIM_GEO_LATLON",
      type: "number",
      geo: { kind: "lat" },
    });
    const lon = makeProfile({
      index: 1,
      name: "lon",
      role: "DIM_GEO_LATLON",
      type: "number",
      geo: { kind: "lon" },
    });
    const pin = candidate("map", "pin", { lat: [0], lon: [1] });
    const grid = candidate("map", "grid", { lat: [0], lon: [1], metrics: [2] });
    expect(failureIds(pin, [lat, lon], null, { aggregated: false })).toEqual(
      [],
    );
    expect(failureIds(grid, [lat, lon, countMeasure(2)])).toContain(
      "grid-needs-binned-latlon",
    );
    expect(
      failureIds(candidate("map", "pin", { lat: [0] }), [lat], null, {
        aggregated: false,
      }),
    ).toContain("pin-needs-latlon");
  });

  it("rejects pivots for native queries and keys used as measures", () => {
    const profiles = [categoryDim(0, "a", 3), timeDim(1, "t"), countMeasure(2)];
    const pivot = candidate("pivot", null, {
      pivotColumns: [0],
      pivotRows: [1],
      metrics: [2],
    });
    expect(failureIds(pivot, profiles, null, { isNative: true })).toContain(
      "pivot-not-native",
    );
    const key = makeProfile({
      index: 1,
      name: "ID",
      role: "KEY",
      type: "number",
    });
    expect(
      failureIds(candidate("bar", null, { x: [0], metrics: [1] }), [
        categoryDim(0, "a", 3),
        key,
      ]),
    ).toContain("key-not-measure");
  });

  it("limits funnels to one dimension with 3-8 steps", () => {
    const funnel = candidate("funnel", null, { x: [0], metrics: [1] });
    expect(
      failureIds(funnel, [categoryDim(0, "step", 5), countMeasure(1)]),
    ).toEqual([]);
    expect(
      failureIds(funnel, [categoryDim(0, "step", 12), countMeasure(1)]),
    ).toContain("funnel-one-dim-one-measure");
  });
});
