import type { ExplorationMetric } from "metabase/explorations/types";
import type { MetricDimension } from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { removeMetricFromSelection } from "./utils";

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
