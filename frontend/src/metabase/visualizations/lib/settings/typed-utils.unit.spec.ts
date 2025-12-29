import { registerVisualization } from "metabase/visualizations";
import { BarChart } from "metabase/visualizations/visualizations/BarChart";
import {
  createMockCard,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";

import {
  extendCardWithDashcardSettings,
  mergeSettings,
  sanitizeDashcardSettings,
} from "./typed-utils";

// @ts-expect-error: incompatible prop types with registerVisualization
registerVisualization(BarChart);

describe("mergeSettings (metabase#14597)", () => {
  it("should merge with second overriding first", () => {
    expect(
      mergeSettings({ foo: { a: 1 }, bar: { b: 1 } }, { foo: { c: 1 } }),
    ).toEqual({ foo: { c: 1 }, bar: { b: 1 } });
  });

  it("should merge column settings", () => {
    expect(
      mergeSettings(
        { column_settings: { col1: { set1: "val1", set2: "val2" } } },
        {
          column_settings: { col1: { set1: "val3" }, col2: { set3: "val4" } },
        },
      ),
    ).toEqual({
      column_settings: {
        col1: { set1: "val3", set2: "val2" },
        col2: { set3: "val4" },
      },
    });
  });

  it("should merge series settings", () => {
    expect(
      mergeSettings(
        { series_settings: { s1: { title: "val1", color: "val2" } } },
        { series_settings: { s1: { title: "val3" }, s2: { axis: "val4" } } },
      ),
    ).toEqual({
      series_settings: {
        s1: { title: "val3", color: "val2" },
        s2: { axis: "val4" },
      },
    });
  });

  it("should merge when only one setting has the nested key", () => {
    expect(
      mergeSettings({}, { column_settings: { col1: { set1: "val" } } }),
    ).toEqual({ column_settings: { col1: { set1: "val" } } });
  });

  describe("table.columns", () => {
    const ID_COLUMN = createMockTableColumnOrderSetting({
      name: "ID",
    });

    const QUANTITY_COLUMN = createMockTableColumnOrderSetting({
      name: "QUANTITY",
    });

    const TAX_COLUMN = createMockTableColumnOrderSetting({
      name: "TAX",
    });

    const DISCOUNT_COLUMN = createMockTableColumnOrderSetting({
      name: "DISCOUNT",
    });

    it("should remove columns that don't appear in the first settings", () => {
      expect(
        mergeSettings(
          {
            "table.columns": [ID_COLUMN, QUANTITY_COLUMN],
          },
          {
            "table.columns": [ID_COLUMN, QUANTITY_COLUMN, TAX_COLUMN],
          },
        ),
      ).toEqual({
        "table.columns": [ID_COLUMN, QUANTITY_COLUMN],
      });
    });

    it("should add new columns that don't appear in the second settings", () => {
      expect(
        mergeSettings(
          {
            "table.columns": [ID_COLUMN, QUANTITY_COLUMN, DISCOUNT_COLUMN],
          },
          {
            "table.columns": [ID_COLUMN, QUANTITY_COLUMN],
          },
        ),
      ).toEqual({
        "table.columns": [ID_COLUMN, QUANTITY_COLUMN, DISCOUNT_COLUMN],
      });
    });

    it("should preserve settings and order from the second settings", () => {
      expect(
        mergeSettings(
          {
            "table.columns": [ID_COLUMN, QUANTITY_COLUMN, DISCOUNT_COLUMN],
          },
          {
            "table.columns": [
              DISCOUNT_COLUMN,
              { ...ID_COLUMN, enabled: false },
              QUANTITY_COLUMN,
              TAX_COLUMN,
            ],
          },
        ),
      ).toEqual({
        "table.columns": [
          DISCOUNT_COLUMN,
          { ...ID_COLUMN, enabled: false },
          QUANTITY_COLUMN,
        ],
      });
    });
  });
});

describe("extendCardWithDashcardSettings", () => {
  it("should merge card settings with dashcard settings", () => {
    const card = createMockCard({
      visualization_settings: { foo: "bar", baz: "qux" },
    });
    const dashcardSettings = { foo: "updated", newSetting: "value" };

    const result = extendCardWithDashcardSettings(card, dashcardSettings);

    expect(result.visualization_settings).toEqual({
      foo: "updated",
      baz: "qux",
      newSetting: "value",
    });
  });

  it("should handle undefined dashcard settings", () => {
    const card = createMockCard({
      visualization_settings: { foo: "bar" },
    });

    const result = extendCardWithDashcardSettings(card, undefined);

    expect(result.visualization_settings).toEqual({ foo: "bar" });
  });

  it("should omit settings that are hidden on dashboards (metabase#61112)", () => {
    const card = createMockCard({
      display: "bar" as const,
      visualization_settings: { "graph.metrics": ["count"] },
    });

    const result = extendCardWithDashcardSettings(card, {
      // non-dashboard settings that should be filtered out
      "graph.dimensions": ["any_value"],
      "graph.metrics": ["avg"],
      // dashboard setting that should be preserved
      "graph.goal_label": "goal label",
    });

    expect(result.visualization_settings).toEqual({
      "graph.metrics": ["count"],
      "graph.goal_label": "goal label",
    });
  });
});

describe("sanitizeDashcardSettings", () => {
  it("should filter out settings with dashboard: false", () => {
    const settings = {
      "graph.dimensions": ["TAX"],
      "graph.metrics": ["count"],
      "graph.goal_label": "My Goal",
      "card.title": "Custom Title",
    };

    const vizSettingsDefs = {
      "graph.dimensions": { dashboard: false },
      "graph.metrics": { dashboard: false },
      "graph.goal_label": { dashboard: true },
      "card.title": { dashboard: true },
    } as any;

    const result = sanitizeDashcardSettings(settings, vizSettingsDefs);

    expect(result).toEqual({
      "graph.goal_label": "My Goal",
      "card.title": "Custom Title",
    });
  });

  it("should keep settings that have no definition", () => {
    const settings = {
      "graph.dimensions": ["TAX"],
      unknownSetting: "value",
    };

    const vizSettingsDefs = {
      "graph.dimensions": { dashboard: false },
    } as any;

    const result = sanitizeDashcardSettings(settings, vizSettingsDefs);

    expect(result).toEqual({
      unknownSetting: "value",
    });
  });

  it("should keep settings where dashboard is not explicitly false", () => {
    const settings = {
      "graph.dimensions": ["TAX"],
      "graph.goal_value": 100,
      "card.description": "Description",
    };

    const vizSettingsDefs = {
      "graph.dimensions": { dashboard: false },
      "graph.goal_value": {}, // no dashboard property
      "card.description": { dashboard: undefined },
    } as any;

    const result = sanitizeDashcardSettings(settings, vizSettingsDefs);

    expect(result).toEqual({
      "graph.goal_value": 100,
      "card.description": "Description",
    });
  });

  it("should return empty object when all settings are dashboard: false", () => {
    const settings = {
      "graph.dimensions": ["TAX"],
      "graph.metrics": ["count"],
    };

    const vizSettingsDefs = {
      "graph.dimensions": { dashboard: false },
      "graph.metrics": { dashboard: false },
    } as any;

    const result = sanitizeDashcardSettings(settings, vizSettingsDefs);

    expect(result).toEqual({});
  });

  it("should handle empty settings", () => {
    const settings = {};
    const vizSettingsDefs = {
      "graph.dimensions": { dashboard: false },
    } as any;

    const result = sanitizeDashcardSettings(settings, vizSettingsDefs);

    expect(result).toEqual({});
  });
});
