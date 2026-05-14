import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { groupDimensionsByCategory, removeMetricFromSelection } from "./utils";

function makeDim(id: string): MetricDimension {
  return createMockMetricDimension({ id, display_name: id });
}

function makeMetric(
  id: number,
  name: string,
  dimension_ids: string[],
): ExplorationMetric {
  return createMockMetric({
    id,
    name,
    dimension_ids,
  }) as ExplorationMetric;
}

describe("removeMetricFromSelection", () => {
  const dimA = makeDim("dim-a");
  const dimB = makeDim("dim-b");
  const dimShared = makeDim("dim-shared");

  it("returns the inputs untouched (minus the dropped metric) when the metric isn't found", () => {
    const metrics = [makeMetric(1, "Revenue", ["dim-a"])];
    const dimensions = [dimA];
    const result = removeMetricFromSelection(metrics, dimensions, 999);
    expect(result.metrics).toEqual(metrics);
    expect(result.dimensions).toBe(dimensions);
  });

  it("drops the metric and the dimensions only it used", () => {
    const m1 = makeMetric(1, "Revenue", ["dim-a"]);
    const m2 = makeMetric(2, "Churn", ["dim-b"]);
    const result = removeMetricFromSelection([m1, m2], [dimA, dimB], 1);

    expect(result.metrics.map((m) => m.id)).toEqual([2]);
    expect(result.dimensions.map((d) => d.id)).toEqual(["dim-b"]);
  });

  it("keeps a dimension that the removed metric used IF another remaining metric still uses it", () => {
    const m1 = makeMetric(1, "Revenue", ["dim-a", "dim-shared"]);
    const m2 = makeMetric(2, "Churn", ["dim-b", "dim-shared"]);
    const result = removeMetricFromSelection(
      [m1, m2],
      [dimA, dimB, dimShared],
      1,
    );

    expect(result.metrics.map((m) => m.id)).toEqual([2]);
    // dim-a is dropped (only m1 used it), dim-shared survives (m2 uses it),
    // dim-b is untouched.
    expect(result.dimensions.map((d) => d.id).sort()).toEqual(
      ["dim-b", "dim-shared"].sort(),
    );
  });

  it("preserves dimensions that the removed metric never used (e.g. user-added orphans)", () => {
    const m1 = makeMetric(1, "Revenue", ["dim-a"]);
    const orphan = makeDim("dim-orphan");
    const result = removeMetricFromSelection([m1], [dimA, orphan], 1);

    expect(result.metrics).toEqual([]);
    // dim-a is dropped (it was used only by m1); dim-orphan is kept
    // because m1 didn't list it in dimension_ids.
    expect(result.dimensions.map((d) => d.id)).toEqual(["dim-orphan"]);
  });

  it("removing the only metric drops every dimension it used", () => {
    const m1 = makeMetric(1, "Revenue", ["dim-a", "dim-shared"]);
    const result = removeMetricFromSelection([m1], [dimA, dimShared], 1);

    expect(result.metrics).toEqual([]);
    expect(result.dimensions).toEqual([]);
  });

  it("returns the original `dimensions` reference when nothing was dropped", () => {
    // Removing Churn (only uses dim-shared, which Revenue still uses)
    // should not change the dimensions list — same reference returned so
    // callers can skip a redundant setState.
    const m1 = makeMetric(1, "Revenue", ["dim-shared"]);
    const m2 = makeMetric(2, "Churn", ["dim-shared"]);
    const dimensions = [dimShared];
    const result = removeMetricFromSelection([m1, m2], dimensions, 2);

    expect(result.metrics.map((m) => m.id)).toEqual([1]);
    expect(result.dimensions).toBe(dimensions);
  });
});

describe("groupDimensionsByCategory", () => {
  // The helper relies on type-checks (`isString`, `isCategory`, etc.)
  // to bucket dimensions. The test mocks below default to
  // `effective_type: "type/Text"` + `semantic_type: null`, which
  // lands every dimension in the `category` bucket — perfect for
  // isolating the sort behaviour from the bucketing logic.
  function makeSourcedDim(
    id: string,
    display_name: string,
    fieldId: number,
    interestingness: number | null,
  ): MetricDimension {
    return createMockMetricDimension({
      id,
      display_name,
      sources: [{ type: "field", "field-id": fieldId }],
      dimension_interestingness: interestingness,
    });
  }

  it("orders source-grouped pills within a category by descending dimension_interestingness", () => {
    // All three land in the `category` bucket (default type/Text);
    // their pill order should match interestingness desc.
    const dimensions = [
      makeSourcedDim("dim-low", "Low", 1, 0.1),
      makeSourcedDim("dim-high", "High", 2, 0.9),
      makeSourcedDim("dim-mid", "Mid", 3, 0.5),
    ];

    const [category] = groupDimensionsByCategory(dimensions);

    expect(category.pillGroups.map((p) => p.name)).toEqual([
      "High",
      "Mid",
      "Low",
    ]);
  });

  it("treats null / undefined dimension_interestingness as 0 and keeps input order among ties", () => {
    const dimensions = [
      makeSourcedDim("dim-1", "First", 1, null),
      makeSourcedDim("dim-2", "Second", 2, null),
      makeSourcedDim("dim-3", "Third", 3, 0.5),
    ];

    const [category] = groupDimensionsByCategory(dimensions);

    // "Third" (0.5) wins. "First" + "Second" both score 0 — their
    // relative order matches the input array order (Array.prototype
    // .sort is stable in ES2019+).
    expect(category.pillGroups.map((p) => p.name)).toEqual([
      "Third",
      "First",
      "Second",
    ]);
  });

  it("collapses same-source bucketings into a single pill, anchored by the most-interesting bucketing's position", () => {
    // Two bucketings of source 1 (boring + interesting) and one of
    // source 2 (mid). Expect source 1 to anchor at "interesting"
    // (highest among its members) and the pill list to be ordered
    // accordingly.
    const dimensions = [
      makeSourcedDim("dim-1a", "Source1 Low", 1, 0.1),
      makeSourcedDim("dim-2", "Source2 Mid", 2, 0.5),
      makeSourcedDim("dim-1b", "Source1 High", 1, 0.9),
    ];

    const [category] = groupDimensionsByCategory(dimensions);

    expect(category.pillGroups).toHaveLength(2);
    // Source 1's most-interesting bucketing (0.9) ranks first, then
    // Source 2 (0.5).
    expect(category.pillGroups[0].dimensions.map((d) => d.id)).toEqual([
      "dim-1b",
      "dim-1a",
    ]);
    expect(category.pillGroups[1].dimensions.map((d) => d.id)).toEqual([
      "dim-2",
    ]);
  });

  it("returns [] for an empty input", () => {
    expect(groupDimensionsByCategory([])).toEqual([]);
  });
});
