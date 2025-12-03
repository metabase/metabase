import { createMockSeriesModel } from "__support__/echarts";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { getStackModels } from "./stack";

describe("getStackModels", () => {
  it("should exclude hidden series from stack models (#66149)", () => {
    const seriesModels = [
      createMockSeriesModel({ dataKey: "series1", visible: true }),
      createMockSeriesModel({ dataKey: "series2", visible: false }),
      createMockSeriesModel({ dataKey: "series3", visible: true }),
    ];
    const mockSettings: ComputedVisualizationSettings = {
      "stackable.stack_type": "stacked",
      series: () => ({ display: "bar" }),
    };

    const result = getStackModels(seriesModels, mockSettings);

    expect(result).toHaveLength(1);
    expect(result[0].seriesKeys).toEqual(["series1", "series3"]);
  });
});
