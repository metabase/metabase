import { reconcile, violatedCaps } from "./reconcile";
import {
  candidate,
  categoryDim,
  countMeasure,
  makeDecision,
  makeShape,
  scored,
  timeDim,
} from "./test-fixtures";

const profiles = [
  timeDim(0, "CREATED_AT"),
  categoryDim(1, "CATEGORY", 4),
  countMeasure(2),
];
const line = candidate("line", null, { x: [0], series: [1], metrics: [2] });
const pivot = candidate("pivot", null, {
  pivotColumns: [1],
  pivotRows: [0],
  metrics: [2],
});

describe("reconcile", () => {
  it("keeps stage 1 and merges display-preserving refinements", () => {
    const shape = makeShape(profiles);
    const stage1 = makeDecision({
      chosen: scored(line, 0),
      profiles,
      shape,
      settings: { "graph.dimensions": ["CREATED_AT", "CATEGORY"] },
    });
    const stage2 = makeDecision({
      chosen: scored(pivot, 5),
      candidates: [scored(pivot, 5), scored(line, 6)],
      profiles,
      shape,
      settings: {
        series_settings: { count: { "line.missing": "none", color: "red" } },
        "graph.show_values": true,
      },
      confidence: 0.9,
      stage: 2,
    });
    const final = reconcile(stage1, stage2);
    expect(final.display).toBe("line");
    expect(final.confidence).toBe(0.9);
    expect(final.settings).toEqual({
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.show_values": true,
      series_settings: { count: { "line.missing": "none" } },
    });
    expect(final.trace.chosenId).toBe(line.id);
    expect(final.trace.reconcile).toEqual({
      outcome: "kept-stage1",
      stage1Display: "line",
      stage2Display: "pivot",
      violatedCaps: [],
      mergedSettingKeys: [
        "graph.show_values",
        "series_settings.count.line.missing",
      ],
    });
  });

  it("switches to stage 2 when stage 1 was provisional", () => {
    const shape = makeShape(profiles);
    const stage1 = makeDecision({
      chosen: scored(line, 0),
      profiles,
      shape,
      provisional: true,
    });
    const stage2 = makeDecision({
      chosen: scored(pivot, 5),
      candidates: [scored(pivot, 5), scored(line, 6)],
      profiles,
      shape,
      stage: 2,
    });
    const final = reconcile(stage1, stage2);
    expect(final.display).toBe("pivot");
    expect(final.trace.reconcile?.outcome).toBe("switched-provisional");
  });

  it("switches when the stage 1 candidate is infeasible in stage 2", () => {
    const shape = makeShape(profiles);
    const stage1 = makeDecision({ chosen: scored(line, 0), profiles, shape });
    const stage2 = makeDecision({
      chosen: scored(pivot, 5),
      candidates: [scored(pivot, 5), scored(line, 0, false)],
      profiles,
      shape,
      stage: 2,
    });
    expect(reconcile(stage1, stage2).trace.reconcile?.outcome).toBe(
      "switched-infeasible",
    );
  });

  it("switches when exact counts violate a cap", () => {
    const manySeries = [
      timeDim(0, "CREATED_AT"),
      categoryDim(1, "STATE", 49),
      countMeasure(2),
    ];
    manySeries[1].cardinality = { estimate: 49, exact: true, source: "rows" };
    const shape = makeShape(manySeries, {
      rowCount: 2000,
      rowCountExact: true,
    });
    const stage1 = makeDecision({
      chosen: scored(line, 0),
      profiles: manySeries,
      shape,
    });
    const stage2 = makeDecision({
      chosen: scored(pivot, 5),
      candidates: [scored(pivot, 5), scored(line, 20)],
      profiles: manySeries,
      shape,
      stage: 2,
    });
    const final = reconcile(stage1, stage2);
    expect(final.display).toBe("pivot");
    expect(final.trace.reconcile?.outcome).toBe("switched-hard-cap");
    expect(final.trace.reconcile?.violatedCaps).toEqual([
      { cap: "K4_LINE_MAX_SERIES", value: 49, limit: 20 },
    ]);
  });

  it("falls back to stage 2 when the stage 1 candidate no longer exists", () => {
    const shape = makeShape(profiles);
    const stage1 = makeDecision({ chosen: scored(line, 0), profiles, shape });
    const stage2 = makeDecision({
      chosen: scored(pivot, 5),
      profiles,
      shape,
      stage: 2,
    });
    expect(reconcile(stage1, stage2).trace.reconcile?.outcome).toBe(
      "stage2-only",
    );
  });
});

describe("violatedCaps", () => {
  it("reports scalar and pin caps from the exact row count", () => {
    const scalarProfiles = [countMeasure(0)];
    const stage2 = makeDecision({
      chosen: scored(candidate("table", null, {}), 0),
      profiles: scalarProfiles,
      shape: makeShape(scalarProfiles, { rowCount: 3, rowCountExact: true }),
      stage: 2,
    });
    expect(
      violatedCaps(
        scored(candidate("scalar", null, { scalarField: [0] }), 0),
        stage2,
      ),
    ).toEqual([{ cap: "SCALAR_N", value: 3, limit: 1 }]);
  });
});
