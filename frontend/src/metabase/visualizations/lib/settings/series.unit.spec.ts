import {
  createMockCard,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";

import { getColors } from "./series";

describe("Series unit settings", () => {
  describe("getColors", () => {
    it("should work for a card with a name", () => {
      const series = [{ card: createMockCard({ name: "The card" }) }];
      const settings = createMockVisualizationSettings({
        "graph.metrics": ["count"],
        "graph.dimensions": ["CATEGORY"],
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        "The card": "#7172AD",
      });
    });

    it("should work for a card with a _seriesKey", () => {
      const series = [
        { card: { ...createMockCard({ name: "Count" }), _seriesKey: "count" } },
      ];
      const settings = createMockVisualizationSettings({
        "graph.metrics": ["count"],
        "graph.dimensions": ["CATEGORY"],
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        count: "#509EE3",
      });
    });

    it("should work for visualizer series", () => {
      const series = [
        {
          // columnValuesMapping is needed by the color assignment logic
          // because certain series have a specific color based on their name (count, for instance)
          // see frontend/src/metabase/lib/colors/groups.ts, getPreferredColor()
          columnValuesMapping: {
            COLUMN_1: [
              {
                sourceId: "card:124",
                originalName: "CATEGORY",
                name: "COLUMN_1",
              },
            ],
            COLUMN_2: [
              {
                sourceId: "card:124",
                originalName: "count",
                name: "COLUMN_2",
              },
            ],
          },
          card: {
            ...createMockCard({
              name: "Count",
            }),
            _seriesKey: "COLUMN_2",
          },
        },
      ];

      const settings = createMockVisualizationSettings({
        "card.title": "Bar chart with formatting options",
        "graph.metrics": ["COLUMN_2"],
        column_settings: {
          '["name","count"]': {
            number_style: "scientific",
            prefix: "Around ",
            suffix: "-ish",
          },
        },
        "graph.dimensions": ["COLUMN_1"],
        "graph.x_axis.scale": "ordinal",
      });

      const colors = getColors(series, settings);
      expect(colors).toEqual({
        COLUMN_2: "#509EE3", // This is the color for "count"
      });
    });
  });
});
