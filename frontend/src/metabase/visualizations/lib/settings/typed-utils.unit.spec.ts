import {
  createMockCard,
  createMockTableColumnOrderSetting,
} from "metabase-types/api/mocks";

import { extendCardWithDashcardSettings, mergeSettings } from "./typed-utils";

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
});
