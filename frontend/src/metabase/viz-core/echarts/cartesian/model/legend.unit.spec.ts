import {
  createMockBreakoutSeriesModel,
  createMockSeriesModel,
} from "__support__/echarts";

import { getLegendItems } from "./legend";

describe("getLegendItems", () => {
  it("should return an empty array when there is only one series and it is not a breakout series", () => {
    const legendItems = getLegendItems([createMockSeriesModel()]);
    expect(legendItems).toEqual([]);
  });

  it("should return legend items when there are multiple series", () => {
    const legendItems = getLegendItems([
      createMockSeriesModel({ name: "Series 1", color: "red", visible: true }),
      createMockSeriesModel({
        name: "Series 2",
        color: "blue",
        visible: false,
      }),
    ]);
    expect(legendItems).toStrictEqual([
      { name: "Series 1", color: "red", key: "dataKey", visible: true },
      { name: "Series 2", color: "blue", key: "dataKey", visible: false },
    ]);
  });

  it("should return legend items when there is a single breakout series", () => {
    const legendItems = getLegendItems([
      createMockBreakoutSeriesModel({ name: "breakout series" }),
    ]);
    expect(legendItems).toEqual([
      { name: "breakout series", color: "red", key: "dataKey", visible: true },
    ]);
  });
});
