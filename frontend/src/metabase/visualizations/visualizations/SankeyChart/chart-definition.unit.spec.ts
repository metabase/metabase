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
  }),
];

describe("SANKEY_CHART_DEFINITION", () => {
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
              ["C", "A", 30], // Creates a cycle
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
  });
});
