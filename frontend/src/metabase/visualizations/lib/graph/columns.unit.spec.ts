import { createMockColumn } from "metabase-types/api/mocks";

import { getCartesianChartColumns, getReferencedColumns } from "./columns";

describe("getCartesianChartColumns", () => {
  it("should ignore duplicated metrics in settings while preserving the order", () => {
    const dimensionColumn = createMockColumn({ name: "dimension" });
    const metricColumn = createMockColumn({ name: "metric" });
    const metricColumn2 = createMockColumn({ name: "metric2" });
    const columns = [dimensionColumn, metricColumn, metricColumn2];

    expect(
      getCartesianChartColumns(columns, {
        "graph.dimensions": ["dimension"],
        "graph.metrics": ["metric2", "metric2", "metric", "metric", "metric"],
      }),
    ).toStrictEqual({
      bubbleSize: undefined,
      dimension: { column: dimensionColumn, index: 0 },
      metrics: [
        { column: metricColumn2, index: 2 },
        { column: metricColumn, index: 1 },
      ],
    });
  });
});

describe("getReferencedColumns", () => {
  const dimension = createMockColumn({ name: "created_at" });
  const breakout = createMockColumn({ name: "category" });
  const metric = createMockColumn({ name: "count" });
  const metric2 = createMockColumn({ name: "sum" });
  const extra = createMockColumn({ name: "extra" });
  const cols = [dimension, breakout, metric, metric2, extra];

  it("returns columns referenced by graph.dimensions and graph.metrics", () => {
    expect(
      getReferencedColumns(cols, {
        "graph.dimensions": ["created_at"],
        "graph.metrics": ["count"],
      }),
    ).toEqual([dimension, metric]);
  });

  it("returns dimensions before metrics", () => {
    expect(
      getReferencedColumns(cols, {
        "graph.dimensions": ["created_at"],
        "graph.metrics": ["count", "sum"],
      }),
    ).toEqual([dimension, metric, metric2]);
  });

  it("only includes the first metric in breakout shape (2 dimensions)", () => {
    // With 2 dimensions only metrics[0] is rendered; the rest stay available
    // as additional columns.
    expect(
      getReferencedColumns(cols, {
        "graph.dimensions": ["created_at", "category"],
        "graph.metrics": ["count", "sum"],
      }),
    ).toEqual([dimension, breakout, metric]);
  });

  it("filters out names that don't resolve against the dataset", () => {
    expect(
      getReferencedColumns(cols, {
        "graph.dimensions": ["created_at", "missing_dimension"],
        "graph.metrics": ["count", "missing_metric"],
      }),
    ).toEqual([dimension, metric]);
  });

  it("returns resolved metrics when the stored dimension is missing", () => {
    // Regression test for UXW-4069: this is the scenario where
    // getCartesianChartColumns would return null (no chart shape), but
    // referenced columns still need to reflect what's spoken for.
    expect(
      getReferencedColumns(cols, {
        "graph.dimensions": ["missing_dimension"],
        "graph.metrics": ["count"],
      }),
    ).toEqual([metric]);
  });

  it("returns an empty array when no settings are provided", () => {
    expect(getReferencedColumns(cols, {})).toEqual([]);
  });

  it("returns an empty array when cols is empty", () => {
    expect(
      getReferencedColumns([], {
        "graph.dimensions": ["created_at"],
        "graph.metrics": ["count"],
      }),
    ).toEqual([]);
  });

  it("ignores null entries in settings arrays", () => {
    // The filter(isNotNull) in getReferencedColumns is defensive against
    // legacy settings data where arrays could contain nulls. The current type
    // disallows it, so cast through unknown to verify the runtime behavior.
    const settingsWithNulls = {
      "graph.dimensions": ["created_at", null],
      "graph.metrics": [null, "count"],
    } as unknown as Parameters<typeof getReferencedColumns>[1];

    expect(getReferencedColumns(cols, settingsWithNulls)).toEqual([
      dimension,
      metric,
    ]);
  });
});
