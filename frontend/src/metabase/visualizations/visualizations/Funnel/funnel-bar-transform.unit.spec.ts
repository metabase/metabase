import {
  createMockColumn,
  createMockDatasetData,
  createMockNumericColumn,
  createMockSingleSeries,
} from "metabase-types/api/mocks";

import { funnelToBarTransform } from "./funnel-bar-transform";

const rawSeries = [
  createMockSingleSeries(
    { display: "funnel" },
    {
      data: createMockDatasetData({
        cols: [
          createMockColumn({ name: "step", display_name: "Step" }),
          createMockNumericColumn({ name: "count", display_name: "Count" }),
        ],
        rows: [
          ["Visited", 100],
          ["Purchased", 10],
        ],
      }),
    },
  ),
];

describe("funnelToBarTransform", () => {
  it("should carry legend.position to every bar series", () => {
    const barSeries = funnelToBarTransform(rawSeries, {
      "funnel.dimension": "step",
      "funnel.metric": "count",
      "legend.position": "off",
    });

    expect(barSeries).toHaveLength(2);
    barSeries.forEach(({ card }) => {
      expect(card.visualization_settings["legend.position"]).toBe("off");
    });
  });
});
