import { checkNotNull } from "metabase/utils/types";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { TREEMAP_CHART_DEFINITION } from "./chart-definition";

const isSensible = checkNotNull(TREEMAP_CHART_DEFINITION.isSensible);

const columns = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "Amount",
    display_name: "Amount",
    base_type: "type/Number",
    semantic_type: "type/Number",
  }),
];

describe("TREEMAP_CHART_DEFINITION", () => {
  describe("isSensible", () => {
    it("returns true with at least one dimension, one metric, and one row", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 10],
          ["B", 20],
        ],
        cols: columns,
      });
      expect(isSensible(data)).toBe(true);
    });

    it("returns false when there are no rows", () => {
      const data = createMockDatasetData({ rows: [], cols: columns });
      expect(isSensible(data)).toBe(false);
    });

    it("returns false when there are no metric columns", () => {
      const noMetricCols = [
        createMockColumn({
          name: "Category",
          display_name: "Category",
          base_type: "type/Text",
        }),
        createMockColumn({
          name: "Other",
          display_name: "Other",
          base_type: "type/Text",
        }),
      ];
      const data = createMockDatasetData({
        rows: [["A", "X"]],
        cols: noMetricCols,
      });
      expect(isSensible(data)).toBe(false);
    });
  });

  describe("checkRenderable", () => {
    const validRawSeries = [
      {
        card: createMockCard(),
        data: createMockDatasetData({
          rows: [
            ["A", 10],
            ["B", 20],
          ],
          cols: columns,
        }),
      },
    ];

    it("does not throw for valid data and complete settings", () => {
      const settings = {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
      };
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(validRawSeries, settings),
      ).not.toThrow();
    });

    it("does not throw for empty data", () => {
      const emptyRawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({ rows: [], cols: columns }),
        },
      ];
      const settings = {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
      };
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(emptyRawSeries, settings),
      ).not.toThrow();
    });

    it("throws ChartSettingsError when required columns are unset", () => {
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(validRawSeries, {}),
      ).toThrow(
        new ChartSettingsError("Which columns do you want to use?", {
          section: "Data",
        }),
      );
    });

    it("throws ChartSettingsError when grouping setting points to a missing column", () => {
      const settings = {
        "treemap.grouping": "DoesNotExist",
        "treemap.value": "Amount",
      };
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(validRawSeries, settings),
      ).toThrow(ChartSettingsError);
    });
  });
});
