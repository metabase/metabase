import { checkNotNull } from "metabase/utils/types";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import type { RowValues } from "metabase-types/api/dataset";
import { createMockCard } from "metabase-types/api/mocks/card";
import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks/dataset";

import { TREEMAP_CHART_DEFINITION } from "./chart-definition";

const isSensible = checkNotNull(TREEMAP_CHART_DEFINITION.isSensible);

const baseColumns = [
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

const columnsWithSubgrouping = [
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

const makeSeries = (
  cols = baseColumns,
  rows: RowValues[] = [
    ["A", 10],
    ["B", 20],
  ],
) => [
  {
    card: createMockCard(),
    data: createMockDatasetData({ cols, rows }),
  },
];

describe("TREEMAP_CHART_DEFINITION", () => {
  describe("isSensible", () => {
    it("returns true with at least one row, one dimension, and one metric", () => {
      const data = createMockDatasetData({
        rows: [
          ["A", 10],
          ["B", 20],
        ],
        cols: baseColumns,
      });

      expect(isSensible(data)).toBe(true);
    });

    it("returns false when there are no rows", () => {
      const data = createMockDatasetData({ rows: [], cols: baseColumns });
      expect(isSensible(data)).toBe(false);
    });

    it("returns false when there is no metric", () => {
      const data = createMockDatasetData({
        rows: [["A", "X"]],
        cols: [
          createMockColumn({
            name: "Category",
            display_name: "Category",
            base_type: "type/Text",
          }),
          createMockColumn({
            name: "SubCategory",
            display_name: "SubCategory",
            base_type: "type/Text",
          }),
        ],
      });

      expect(isSensible(data)).toBe(false);
    });
  });

  describe("checkRenderable", () => {
    const settings = {
      "treemap.grouping": "Category",
      "treemap.value": "Amount",
    };

    it("does not throw for valid data", () => {
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(makeSeries(), settings),
      ).not.toThrow();
    });

    it("does not throw for empty data", () => {
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(
          makeSeries(baseColumns, []),
          settings,
        ),
      ).not.toThrow();
    });

    it("throws when required columns are unset", () => {
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(makeSeries(), {}),
      ).toThrow(
        new ChartSettingsError("Which columns do you want to use?", {
          section: "Data",
        }),
      );
    });

    it("throws when there is no available metric after grouping selection", () => {
      const metricAsGroupingCols = [
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

      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(
          makeSeries(metricAsGroupingCols),
          {
            "treemap.grouping": "Amount",
            "treemap.value": "Amount",
          },
        ),
      ).toThrow(
        new ChartSettingsError(
          "Add at least one metric column to use as the value.",
          {
            section: "Data",
          },
        ),
      );
    });

    it("allows valid two-level grouping", () => {
      expect(() =>
        TREEMAP_CHART_DEFINITION.checkRenderable(
          makeSeries(columnsWithSubgrouping, [
            ["A", "x", 10],
            ["B", "y", 20],
          ]),
          {
            "treemap.grouping": "Category",
            "treemap.sub_grouping": "SubCategory",
            "treemap.value": "Amount",
          },
        ),
      ).not.toThrow();
    });
  });

  describe("data setting defaults", () => {
    const groupingSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.grouping"],
    );
    const valueSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.value"],
    );
    const subGroupingSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.sub_grouping"],
    );

    it("defaults grouping to first non-metric dimension", () => {
      const getDefault = checkNotNull(groupingSetting.getDefault);
      expect(getDefault(makeSeries(baseColumns, [["A", 10]]), {})).toBe(
        "Category",
      );
    });

    it("defaults value to first metric that differs from grouping", () => {
      const getDefault = checkNotNull(valueSetting.getDefault);
      expect(
        getDefault(makeSeries(columnsWithSubgrouping, [["A", "x", 10]]), {
          "treemap.grouping": "Category",
        }),
      ).toBe("Amount");
    });

    it("defaults sub-grouping to second dimension", () => {
      const getDefault = checkNotNull(subGroupingSetting.getDefault);
      expect(
        getDefault(makeSeries(columnsWithSubgrouping, [["A", "x", 10]]), {
          "treemap.grouping": "Category",
          "treemap.value": "Amount",
        }),
      ).toBe("SubCategory");
    });

    it("defaults sub-grouping to undefined for one dimension", () => {
      const getDefault = checkNotNull(subGroupingSetting.getDefault);
      expect(
        getDefault(makeSeries(baseColumns, [["A", 10]]), {
          "treemap.grouping": "Category",
          "treemap.value": "Amount",
        }),
      ).toBeUndefined();
    });

    it("hides sub-grouping when no second dimension is available", () => {
      const getHidden = checkNotNull(subGroupingSetting.getHidden);
      expect(
        getHidden(makeSeries(baseColumns, [["A", 10]]), {
          "treemap.grouping": "Category",
          "treemap.value": "Amount",
        }),
      ).toBe(true);
      expect(
        getHidden(makeSeries(columnsWithSubgrouping, [["A", "x", 10]]), {
          "treemap.grouping": "Category",
          "treemap.value": "Amount",
        }),
      ).toBe(false);
    });

    it("excludes the main grouping column from sub-grouping options", () => {
      const getProps = checkNotNull(subGroupingSetting.getProps);
      const props = getProps(
        makeSeries(columnsWithSubgrouping, [["A", "x", 10]]),
        {
          "treemap.grouping": "Category",
          "treemap.value": "Amount",
        },
        () => undefined,
        undefined,
        () => undefined,
      );

      expect(props).toEqual(
        expect.objectContaining({
          options: expect.arrayContaining([
            expect.objectContaining({ value: "SubCategory" }),
          ]),
        }),
      );
      expect(props).not.toEqual(
        expect.objectContaining({
          options: expect.arrayContaining([
            expect.objectContaining({ value: "Category" }),
          ]),
        }),
      );
    });

    it("keeps sub-grouping unset when explicitly cleared", () => {
      const series = makeSeries(columnsWithSubgrouping, [["A", "x", 10]]);
      const storedSettings = {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
        "treemap.sub_grouping": null,
      };

      const computedSettings = getComputedSettings(
        {
          "treemap.grouping": groupingSetting,
          "treemap.value": valueSetting,
          "treemap.sub_grouping": subGroupingSetting,
        },
        series,
        storedSettings,
      );

      expect(computedSettings["treemap.sub_grouping"]).toBeNull();
    });
  });

  describe("display toggles", () => {
    const showParentLabelsSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.show_parent_labels"],
    );
    const showParentValuesSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.show_parent_values"],
    );
    const showLeafValuesSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.show_leaf_values"],
    );

    it("shows parent labels/value controls only when sub-grouping is selected", () => {
      const getParentLabelsHidden = checkNotNull(
        showParentLabelsSetting.getHidden,
      );
      const getParentValuesHidden = checkNotNull(
        showParentValuesSetting.getHidden,
      );

      expect(getParentLabelsHidden([], {}, {})).toBe(true);
      expect(
        getParentLabelsHidden(
          [],
          { "treemap.sub_grouping": "SubCategory" },
          {},
        ),
      ).toBe(false);
      expect(getParentValuesHidden([], {}, {})).toBe(true);
      expect(
        getParentValuesHidden(
          [],
          { "treemap.sub_grouping": "SubCategory" },
          {},
        ),
      ).toBe(false);
    });

    it("disables parent values when parent labels are off", () => {
      const getProps = checkNotNull(showParentValuesSetting.getProps);
      expect(
        getProps(
          [],
          { "treemap.show_parent_labels": false },
          jest.fn(),
          undefined,
          jest.fn(),
        ),
      ).toEqual({ disabled: true });
    });

    it("disables leaf values when leaf labels are off", () => {
      const getProps = checkNotNull(showLeafValuesSetting.getProps);
      expect(
        getProps(
          [],
          { "treemap.show_leaf_labels": false },
          jest.fn(),
          undefined,
          jest.fn(),
        ),
      ).toEqual({ disabled: true });
    });
  });

  describe("treemap.rows and rename settings", () => {
    const rowsSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["treemap.rows"],
    );
    const seriesSetting = checkNotNull(
      TREEMAP_CHART_DEFINITION.settings?.["series_settings"],
    );

    const rawSeries = makeSeries(baseColumns, [
      ["Phones", 10],
      ["Laptops", 30],
    ]);

    it("computes one row per grouping value, value-descending", () => {
      const getValue = checkNotNull(rowsSetting.getValue);
      const rows = getValue(rawSeries, {
        "treemap.grouping": "Category",
        "treemap.value": "Amount",
        column: () => ({}),
      });

      expect(rows).toMatchObject([{ key: "Laptops" }, { key: "Phones" }]);
      expect(rowsSetting.readDependencies).toEqual([
        "treemap.grouping",
        "treemap.sub_grouping",
        "treemap.value",
      ]);
    });

    it("erases saved rows when the grouping column changes", () => {
      const groupingSetting = checkNotNull(
        TREEMAP_CHART_DEFINITION.settings?.["treemap.grouping"],
      );
      const onChangeSettings = jest.fn();
      const widgets = getSettingsWidgets(
        { "treemap.grouping": groupingSetting },
        { "treemap.grouping": "Category" },
        { "treemap.grouping": "Category" },
        rawSeries,
        onChangeSettings,
      );
      const groupingWidget = checkNotNull(
        widgets.find((widget) => widget.id === "treemap.grouping"),
      );

      groupingWidget.onChange?.("Region");

      expect(onChangeSettings).toHaveBeenCalledWith(
        { "treemap.grouping": "Region", "treemap.rows": null },
        undefined,
      );
    });

    it("renames a treemap row through nested series settings", () => {
      const treemapRows = [
        {
          key: "Phones",
          name: "Phones",
          originalName: "Phones",
          color: "#509EE3",
          defaultColor: true,
          enabled: true,
          hidden: false,
        },
      ];
      const onChangeSettings = jest.fn();
      const getProps = checkNotNull(seriesSetting.getProps);
      const props = getProps(
        [],
        { "treemap.rows": treemapRows },
        jest.fn(),
        undefined,
        onChangeSettings,
      );

      props.updateRowName("Smartphones", "Phones");

      expect(onChangeSettings).toHaveBeenCalledWith({
        "treemap.rows": [
          expect.objectContaining({
            key: "Phones",
            name: "Smartphones",
            originalName: "Phones",
          }),
        ],
      });
    });
  });
});
