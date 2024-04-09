/* eslint-disable import/order */
import { createMockTableColumnOrderSetting } from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import {
  getClickBehaviorSettings,
  getComputedSettings,
  getSettingsWidgets,
  mergeSettings,
} from "metabase/visualizations/lib/settings";

describe("settings framework", () => {
  const mockObject = "[mockObject]";

  describe("getComputedSettings", () => {
    it("should return stored settings for setting definitions", () => {
      const defs = { foo: {} };
      const stored = { foo: "foo" };
      const expected = { foo: "foo" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should not return stored settings for settings without setting definition", () => {
      const defs = {};
      const stored = { foo: "foo" };
      const expected = {};
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should use `default` if no stored setting", () => {
      const defs = { foo: { default: "foo" } };
      const stored = {};
      const expected = { foo: "foo" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should use `getDefault` if no stored setting", () => {
      const defs = { foo: { getDefault: () => "foo" } };
      const stored = {};
      const expected = { foo: "foo" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should use `getValue` if provided", () => {
      const defs = { foo: { getValue: () => "bar" } };
      const stored = { foo: "foo" };
      const expected = { foo: "bar" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should use default if `isValid` returns false", () => {
      const defs = { foo: { default: "bar", isValid: () => false } };
      const stored = { foo: "foo" };
      const expected = { foo: "bar" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should use stored value if `isValid` returns true", () => {
      const defs = { foo: { default: "bar", isValid: () => true } };
      const stored = { foo: "foo" };
      const expected = { foo: "foo" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
    });
    it("should compute readDependencies first if provided", () => {
      const getDefault = jest.fn().mockReturnValue("foo");
      const defs = {
        foo: { getDefault, readDependencies: ["bar"] },
        bar: { default: "bar" },
      };
      const stored = {};
      const expected = { foo: "foo", bar: "bar" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
      expect(getDefault.mock.calls[0]).toEqual([
        mockObject,
        { bar: "bar" },
        {},
      ]);
    });
    it("should pass the provided object to getDefault", () => {
      const getDefault = jest.fn().mockReturnValue("foo");
      const defs = { foo: { getDefault } };
      const stored = {};
      const expected = { foo: "foo" };
      expect(getComputedSettings(defs, mockObject, stored)).toEqual(expected);
      expect(getDefault.mock.calls[0]).toEqual([mockObject, {}, {}]);
    });
  });

  describe("getSettingsWidgets", () => {
    it("should return widget", () => {
      const defs = { foo: { title: "Foo", widget: "input" } };
      const stored = { foo: "foo" };
      const widgets = getSettingsWidgets(
        defs,
        stored,
        stored,
        mockObject,
        () => {},
      );
      widgets.map(deleteFunctions);
      expect(widgets).toEqual([
        {
          id: "foo",
          title: "Foo",
          disabled: false,
          hidden: false,
          props: {},
          value: "foo",
          set: true,
        },
      ]);
    });
    it("should return disabled widget when `disabled` is true", () => {
      const defs = { foo: { widget: "input", disabled: true } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].disabled).toEqual(true);
    });
    it("should return disabled widget when `getDisabled` returns true", () => {
      const getDisabled = jest.fn().mockReturnValue(true);
      const defs = { foo: { widget: "input", getDisabled } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].disabled).toEqual(true);
      expect(getDisabled.mock.calls).toEqual([[mockObject, {}, {}]]);
    });
    it("should return hidden widget when `hidden` is true", () => {
      const defs = { foo: { widget: "input", hidden: true } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].hidden).toEqual(true);
    });
    it("should return hidden widget when `getHidden` returns true", () => {
      const getHidden = jest.fn().mockReturnValue(true);
      const defs = { foo: { widget: "input", getHidden } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].hidden).toEqual(true);
      expect(getHidden.mock.calls).toEqual([[mockObject, {}, {}]]);
    });
    it("should return props when `props` is provided", () => {
      const defs = { foo: { widget: "input", props: { hello: "world" } } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].props).toEqual({ hello: "world" });
    });
    it("should compute props when `getProps` is provided", () => {
      const getProps = jest.fn().mockReturnValue({ hello: "world" });
      const defs = { foo: { widget: "input", getProps } };
      const widgets = getSettingsWidgets(defs, {}, {}, mockObject, () => {});
      expect(widgets[0].props).toEqual({ hello: "world" });
    });
    it("should call onChangeSettings with new value", () => {
      const defs = { foo: { widget: "input" } };
      const stored = { foo: "foo" };
      const onChangeSettings = jest.fn();
      const widgets = getSettingsWidgets(
        defs,
        stored,
        stored,
        mockObject,
        onChangeSettings,
      );
      widgets[0].onChange("bar");
      expect(onChangeSettings.mock.calls).toEqual([[{ foo: "bar" }]]);
    });
  });

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
          { series_settings: { s1: { set1: "val1", set2: "val2" } } },
          { series_settings: { s1: { set1: "val3" }, s2: { set3: "val4" } } },
        ),
      ).toEqual({
        series_settings: {
          s1: { set1: "val3", set2: "val2" },
          s2: { set3: "val4" },
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
        fieldRef: ["field", ORDERS.ID, null],
      });

      const QUANTITY_COLUMN = createMockTableColumnOrderSetting({
        name: "QUANTITY",
        fieldRef: ["field", ORDERS.QUANTITY, null],
      });

      const TAX_COLUMN = createMockTableColumnOrderSetting({
        name: "TAX",
        fieldRef: ["field", ORDERS.TAX, null],
      });

      const DISCOUNT_COLUMN = createMockTableColumnOrderSetting({
        name: "DISCOUNT",
        fieldRef: ["field", ORDERS.DISCOUNT, null],
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

  describe("getClickBehaviorSettings", () => {
    it("should clone only click_behavior from column_settings", () => {
      expect(
        getClickBehaviorSettings({
          column_settings: {
            col1: {
              click_behavior: { type: "stub" },
              not_click_behavior: { type: "another stub" },
            },
          },
        }),
      ).toEqual({
        column_settings: { col1: { click_behavior: { type: "stub" } } },
      });
    });

    it("should clone only click_behavior from root settings", () => {
      expect(
        getClickBehaviorSettings({
          click_behavior: { type: "stub" },
          not_click_behavior: { type: "another stub" },
        }),
      ).toEqual({
        click_behavior: { type: "stub" },
      });
    });

    it("should return an empty object if there are no click behaviors set", () => {
      expect(
        getClickBehaviorSettings({
          not_click_behavior: { type: "stub" },
          column_settings: {
            col1: {
              not_click_behavior: { type: "stub" },
            },
          },
        }),
      ).toEqual({});
    });
  });
});

function deleteFunctions(object) {
  for (const property in object) {
    if (typeof object[property] === "function") {
      delete object[property];
    }
  }
}
