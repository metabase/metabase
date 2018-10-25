// NOTE: need to load visualizations first for getSettings to work
import "metabase/visualizations/index";

import {
  getComputedSettings,
  getSettingsWidgets,
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
    it("should not return stored settings for settings without setting definition ", () => {
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
      // expect(getProps.mock.calls).toEqual([[null, {}, FIXME, {}]]);
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
    // FIXME: is writeDependencies broken or is this test wrong?
    xit("should include writeDependencies in onChangeSettings", () => {
      const defs = {
        foo: { widget: "input", writeDependencies: ["bar"] },
        bar: { default: "foo" },
      };
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
      expect(onChangeSettings.mock.calls).toEqual([
        [{ foo: "bar", bar: "bar" }],
      ]);
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
