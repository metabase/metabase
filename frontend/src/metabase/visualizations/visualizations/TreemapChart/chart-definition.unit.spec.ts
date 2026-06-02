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

const columnsWithSub = [
  createMockColumn({
    name: "Category",
    display_name: "Category",
    base_type: "type/Text",
  }),
  createMockColumn({
    name: "SubCategory",
    display_name: "Sub-Category",
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

    it("returns true with two dimensions, one metric, and one row", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", "x", 10],
          ["B", "y", 20],
        ],
        cols: columnsWithSub,
      });
      expect(isSensible(data)).toBe(true);
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

    it("does not throw for valid 2-dim data when sub_grouping setting is set", () => {
      const twoDimRawSeries = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [
              ["A", "x", 10],
              ["B", "y", 20],
            ],
            cols: columnsWithSub,
          }),
        },
      ];
      const settings = {
        "treemap.grouping": "Category",
        "treemap.sub_grouping": "SubCategory",
        "treemap.value": "Amount",
      };
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(twoDimRawSeries, settings),
      ).not.toThrow();
    });

    it("does not throw when sub_grouping setting points to a missing column (silent fallback to 1-level)", () => {
      const settings = {
        "treemap.grouping": "Category",
        "treemap.sub_grouping": "DoesNotExist",
        "treemap.value": "Amount",
      };
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(validRawSeries, settings),
      ).not.toThrow();
    });
  });

  describe("treemap.grouping setting", () => {
    const groupingSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.grouping"],
    );

    it("defaults to the first non-metric dimension in a 1-dim + 1-metric query", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", 10]],
            cols: columns,
          }),
        },
      ];
      const getDefault = checkNotNull(groupingSetting.getDefault);
      const result = getDefault(series, {});
      expect(result).toBe("Category");
    });

    it("defaults to the first non-metric dimension in a 2-dim + 1-metric query", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", "x", 10]],
            cols: columnsWithSub,
          }),
        },
      ];
      const getDefault = checkNotNull(groupingSetting.getDefault);
      const result = getDefault(series, {});
      expect(result).toBe("Category");
    });

    it("defaults to undefined when every column is a metric", () => {
      const allMetricCols = [
        createMockColumn({
          name: "MetricA",
          display_name: "Metric A",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "MetricB",
          display_name: "Metric B",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
      ];
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [[1, 10]],
            cols: allMetricCols,
          }),
        },
      ];
      const getDefault = checkNotNull(groupingSetting.getDefault);
      const result = getDefault(series, {});
      expect(result).toBeUndefined();
    });
  });

  describe("treemap.value setting", () => {
    const valueSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.value"],
    );

    it("defaults to the first metric column in a 1-dim + 1-metric query", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", 10]],
            cols: columns,
          }),
        },
      ];
      const getDefault = checkNotNull(valueSetting.getDefault);
      const result = getDefault(series, {});
      expect(result).toBe("Amount");
    });

    it("defaults to the metric column in a 2-dim + 1-metric query", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", "x", 10]],
            cols: columnsWithSub,
          }),
        },
      ];
      const getDefault = checkNotNull(valueSetting.getDefault);
      const result = getDefault(series, {
        "treemap.grouping": "Category",
      });
      expect(result).toBe("Amount");
    });

    it("skips a metric column that is already selected as grouping", () => {
      const numericGroupingCols = [
        createMockColumn({
          name: "Id",
          display_name: "Id",
          base_type: "type/Integer",
          semantic_type: "type/Number",
        }),
        createMockColumn({
          name: "Amount",
          display_name: "Amount",
          base_type: "type/Number",
          semantic_type: "type/Number",
        }),
      ];
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [[1, 10]],
            cols: numericGroupingCols,
          }),
        },
      ];
      const getDefault = checkNotNull(valueSetting.getDefault);
      const result = getDefault(series, {
        "treemap.grouping": "Id",
      });
      expect(result).toBe("Amount");
    });

    it("defaults to undefined when there are no metric columns", () => {
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
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", "X"]],
            cols: noMetricCols,
          }),
        },
      ];
      const getDefault = checkNotNull(valueSetting.getDefault);
      const result = getDefault(series, {
        "treemap.grouping": "Category",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("treemap.sub_grouping setting", () => {
    const subGroupingSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.sub_grouping"],
    );

    it("uses the field widget", () => {
      expect(subGroupingSetting.widget).toBe("field");
    });

    it("defaults to the second dimension when the data has two dimensions", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", "x", 10]],
            cols: columnsWithSub,
          }),
        },
      ];
      const getDefault = checkNotNull(subGroupingSetting.getDefault);
      const result = getDefault(series, {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
      });
      expect(result).toBe("SubCategory");
    });

    it("defaults to undefined when the data has only one dimension (numeric value column is excluded)", () => {
      const series = [
        {
          card: createMockCard(),
          data: createMockDatasetData({
            rows: [["A", 10]],
            cols: columns,
          }),
        },
      ];
      const getDefault = checkNotNull(subGroupingSetting.getDefault);
      const result = getDefault(series, {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("treemap.show_parent_labels setting", () => {
    const showParentLabelsSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.show_parent_labels"],
    );

    it("is a toggle in the Display section that defaults to true", () => {
      expect(showParentLabelsSetting.widget).toBe("toggle");
      expect(checkNotNull(showParentLabelsSetting.getDefault)([], {})).toBe(
        true,
      );
      expect(showParentLabelsSetting.getSection?.()).toBe("Display");
    });

    it("is hidden when no sub-grouping is selected", () => {
      const getHidden = checkNotNull(showParentLabelsSetting.getHidden);
      expect(getHidden([], {}, {} as never)).toBe(true);
    });

    it("is visible once a sub-grouping is selected", () => {
      const getHidden = checkNotNull(showParentLabelsSetting.getHidden);
      expect(
        getHidden([], { "treemap.sub_grouping": "SubCategory" }, {} as never),
      ).toBe(false);
    });
  });

  describe("treemap.show_leaf_labels setting", () => {
    const showLeafLabelsSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.show_leaf_labels"],
    );

    it("is a toggle in the Display section that defaults to true", () => {
      expect(showLeafLabelsSetting.widget).toBe("toggle");
      expect(checkNotNull(showLeafLabelsSetting.getDefault)([], {})).toBe(true);
      expect(showLeafLabelsSetting.getSection?.()).toBe("Display");
    });

    it("is always available (no sub-grouping requirement)", () => {
      expect(showLeafLabelsSetting.getHidden).toBeUndefined();
    });
  });
});
