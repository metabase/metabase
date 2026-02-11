import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { SANKEY_CHART_DEFINITION } from "./chart-definition";

const columns = [
  createMockColumn({
    name: "Source",
    display_name: "Source",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Target",
    display_name: "Target",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Amount",
    display_name: "Amount",
    base_type: "type/Number",
    semantic_type: "type/Number",
  }),
];

describe("SANKEY_CHART_DEFINITION", () => {
  describe("getSensibility", () => {
    it("should return recommended for valid data", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", "B", 10],
          ["B", "C", 20],
        ],
        cols: columns,
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("recommended");
    });

    it("should return nonsensible when there are no rows", () => {
      const data = createMockDatasetData({
        rows: [],
        cols: columns,
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when there are not enough columns", () => {
      const data = createMockDatasetData({
        rows: [["A", "B"]],
        cols: columns.slice(0, 2),
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when there are not enough dimension columns", () => {
      const columnsWithoutDimensions = [
        createMockColumn({
          name: "Date",
          display_name: "Date",
          base_type: "type/DateTime",
        }),
        createMockColumn({
          name: "Target",
          display_name: "Target",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Amount",
          display_name: "Amount",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
      ];

      const data = createMockDatasetData({
        rows: [
          ["2023-01-01", "B", 10],
          ["2023-01-02", "C", 20],
        ],
        cols: columnsWithoutDimensions,
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when there are not enough metric columns", () => {
      const columnsWithoutMetrics = [
        createMockColumn({
          name: "Source",
          display_name: "Source",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Target",
          display_name: "Target",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Category",
          display_name: "Category",
          base_type: "type/Text",
        }),
      ];

      const data = createMockDatasetData({
        rows: [
          ["A", "B", "Cat1"],
          ["B", "C", "Cat2"],
        ],
        cols: columnsWithoutMetrics,
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });

    it("should return nonsensible when data contains cycles", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", "B", 10],
          ["B", "C", 20],
          ["C", "A", 30],
        ],
        cols: columns,
      });

      expect(SANKEY_CHART_DEFINITION.getSensibility!(data)).toBe("nonsensible");
    });
  });

  describe("checkRenderable", () => {
    it("should not throw error for valid data and settings", () => {
      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", "B", 10],
              ["B", "C", 20],
            ],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).not.toThrow();
    });

    it("should not throw error for empty data", () => {
      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).not.toThrow();
    });

    it("should throw error when required columns are not selected", () => {
      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", "B", 10],
              ["B", "C", 20],
            ],
            cols: columns,
          }),
        },
      ];

      const settings = {};

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).toThrow(
        new ChartSettingsError("Which columns do you want to use?", {
          section: "Data",
        }),
      );
    });

    it("should throw error when source and target columns are the same", () => {
      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", "B", 10],
              ["B", "C", 20],
            ],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Source",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).toThrow(
        new ChartSettingsError(
          "Select two different columns for source and target to create a flow.",
          { section: "Data" },
        ),
      );
    });

    it("should throw error when data contains cycles", () => {
      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", "B", 10],
              ["B", "C", 20],
              ["C", "A", 30],
            ],
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).toThrow(
        new ChartSettingsError(
          "Selected columns create circular flows. Try picking different columns that flow in one direction.",
          { section: "Data" },
        ),
      );
    });

    it("should throw error when there are too many nodes", () => {
      const rows = Array.from({ length: 76 }, (_, i) => [
        `Source${i}`,
        `Target${i}`,
        10,
      ]);

      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows,
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).toThrow(
        new ChartSettingsError(
          "Sankey chart doesn't support more than 150 unique nodes.",
        ),
      );
    });

    it("should not throw error when node count is at the limit", () => {
      const rows = Array.from({ length: 75 }, (_, i) => [
        `Source${i}`,
        `Target${i}`,
        10,
      ]);

      const rawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows,
            cols: columns,
          }),
        },
      ];

      const settings = {
        "sankey.source": "Source",
        "sankey.target": "Target",
        "sankey.value": "Amount",
      };

      expect(() =>
        SANKEY_CHART_DEFINITION.checkRenderable(rawSeries, settings),
      ).not.toThrow();
    });
  });
});
