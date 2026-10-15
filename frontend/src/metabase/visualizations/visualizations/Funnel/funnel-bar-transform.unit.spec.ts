import type { LegendPosition } from "metabase-types/api";
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
  it.each<LegendPosition>(["auto", "top", "bottom", "left", "right", "off"])(
    "should carry legend.position=%s to every bar series",
    (legendPosition) => {
      const barSeries = funnelToBarTransform(rawSeries, {
        "funnel.dimension": "step",
        "funnel.metric": "count",
        "legend.position": legendPosition,
      });

      expect(barSeries).toHaveLength(2);
      barSeries.forEach(({ card }) => {
        expect(card.visualization_settings["legend.position"]).toBe(
          legendPosition,
        );
      });
    },
  );
});
