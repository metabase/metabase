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
  it.each([true, false])(
    "should carry legend.is_visible=%s to every bar series",
    (isLegendVisible) => {
      const barSeries = funnelToBarTransform(rawSeries, {
        "funnel.dimension": "step",
        "funnel.metric": "count",
        "legend.is_visible": isLegendVisible,
      });

      expect(barSeries).toHaveLength(2);
      barSeries.forEach(({ card }) => {
        expect(card.visualization_settings["legend.is_visible"]).toBe(
          isLegendVisible,
        );
      });
    },
  );
});
