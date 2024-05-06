import { createMockColumn } from "metabase-types/api/mocks";

import { getCartesianChartColumns } from "./columns";

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
