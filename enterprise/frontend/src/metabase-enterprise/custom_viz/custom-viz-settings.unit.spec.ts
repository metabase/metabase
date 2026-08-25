import type {
  CustomVisualizationMount,
  CustomVisualizationMountHandle,
  CustomVisualizationSettingDefinition,
  WidgetMount,
} from "custom-viz";
import type { ComponentType } from "react";

import { GOAL_SETTING_KEYS } from "metabase/visualizations/lib/dynamic-goals";
import { createMockCustomVizPluginRuntime } from "metabase-types/api/mocks";
import { isFunction, isObject } from "metabase-types/guards";

import { sanitizePluginSettings } from "./custom-viz-settings";
import { getWidgetMountPlugin, isWidgetMount } from "./widget-mount";

const PLUGIN = createMockCustomVizPluginRuntime();

function setupMount() {
  const handle: CustomVisualizationMountHandle<object> = {
    update: jest.fn(),
    unmount: jest.fn(),
  };

  const calls: {
    Component: unknown;
    container: unknown;
    initialProps: unknown;
  }[] = [];

  const mount: CustomVisualizationMount = (
    Component,
    container,
    initialProps,
  ) => {
    calls.push({ Component, container, initialProps });
    return handle;
  };

  return { mount, calls, handle };
}

function mockWarn() {
  return jest.spyOn(console, "warn").mockImplementation(() => undefined);
}

describe("sanitizePluginSettings", () => {
  it("returns undefined when the plugin declares no settings", () => {
    const { mount } = setupMount();

    expect(sanitizePluginSettings(undefined, mount, PLUGIN)).toBeUndefined();
  });

  it("passes built-in widget settings through unchanged", () => {
    const { mount } = setupMount();
    const threshold = definePluginSetting({
      title: "Threshold",
      widget: "number",
    });

    const sanitized = sanitizePluginSettings({ threshold }, mount, PLUGIN);

    expect(sanitized?.threshold).toEqual(threshold);
  });

  it("skips definitions that are not objects", () => {
    const { mount } = setupMount();

    const sanitized = sanitizePluginSettings(
      { broken: definePluginSetting("not-a-definition") },
      mount,
      PLUGIN,
    );

    expect(sanitized).toEqual({});
  });

  it("drops settings with reserved ids and warns, keeping the rest", () => {
    const warn = mockWarn();
    const { mount } = setupMount();
    const threshold = definePluginSetting({ widget: "number" });
    const reservedIds = ["column", "column_settings", ...GOAL_SETTING_KEYS];

    const sanitized = sanitizePluginSettings(
      {
        ...Object.fromEntries(
          reservedIds.map((id) => [
            id,
            definePluginSetting({ widget: "input" }),
          ]),
        ),
        threshold,
      },
      mount,
      PLUGIN,
    );

    expect(sanitized).toEqual({ threshold });
    expect(warn).toHaveBeenCalledTimes(reservedIds.length);
    for (const id of reservedIds) {
      expect(warn).toHaveBeenCalledWith(
        `Custom viz setting "${id}" uses a reserved id and was ignored.`,
      );
    }

    warn.mockRestore();
  });

  describe("getProps", () => {
    it("hands the plugin only the series and settings", () => {
      const { mount } = setupMount();
      const getProps = jest.fn(() => ({ placeholder: "Threshold" }));
      const series = [{ card: {}, data: {} }];
      const settings = { threshold: 1 };

      const sanitized = sanitizePluginSettings(
        { threshold: definePluginSetting({ widget: "number", getProps }) },
        mount,
        PLUGIN,
      );
      const definition = getRuntimeDefinition(sanitized?.threshold);

      expect(definition.widget).toBe("number");
      expect(
        definition.getProps?.(series, settings, jest.fn(), {}, jest.fn()),
      ).toEqual({ placeholder: "Threshold" });
      expect(getProps).toHaveBeenCalledWith(series, settings);
    });
  });

  describe("write and erase dependencies", () => {
    it("keeps the plugin's own settings and writable card settings, dropping the rest", () => {
      const warn = mockWarn();
      const { mount } = setupMount();

      const sanitized = sanitizePluginSettings(
        {
          threshold: definePluginSetting({
            widget: "number",
            writeDependencies: [
              "label",
              "card.title",
              "gauge.segments",
              "series_settings",
            ],
            eraseDependencies: ["label", "graph.goal_value", 42],
          }),
          label: definePluginSetting({ widget: "input" }),
        },
        mount,
        PLUGIN,
      );

      expect(getRuntimeDefinition(sanitized?.threshold)).toMatchObject({
        widget: "number",
        writeDependencies: ["label", "card.title"],
        eraseDependencies: ["label"],
      });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(
        'Custom viz setting "threshold" depends on settings it cannot write and they were ignored: gauge.segments, series_settings.',
      );
      expect(warn).toHaveBeenCalledWith(
        'Custom viz setting "threshold" depends on settings it cannot write and they were ignored: graph.goal_value.',
      );

      warn.mockRestore();
    });

    it("normalizes non-array dependencies to an empty list", () => {
      const { mount } = setupMount();

      const sanitized = sanitizePluginSettings(
        {
          threshold: definePluginSetting({
            widget: "number",
            writeDependencies: "label",
          }),
        },
        mount,
        PLUGIN,
      );

      expect(
        getRuntimeDefinition(sanitized?.threshold).writeDependencies,
      ).toEqual([]);
    });
  });

  describe("component widgets", () => {
    const Widget: ComponentType<Record<string, unknown>> = () => null;

    it("rewrites a component widget into a plugin-tagged WidgetMount", () => {
      const { mount } = setupMount();
      const original = definePluginSetting({ title: "Custom", widget: Widget });

      const sanitized = sanitizePluginSettings(
        { customWidget: original },
        mount,
        PLUGIN,
      );

      const definition = getRuntimeDefinition(sanitized?.customWidget);
      expect(definition.title).toBe("Custom");

      const widget = getMountWidget(sanitized?.customWidget);
      expect(isWidgetMount(widget)).toBe(true);
      expect(getWidgetMountPlugin(widget)).toBe(PLUGIN);

      expect(getRuntimeDefinition(original).widget).toBe(Widget);
    });

    it("delegates mounting, updating and unmounting to the plugin's shared mount function", () => {
      const { mount, calls, handle } = setupMount();
      const sanitized = sanitizePluginSettings(
        { customWidget: definePluginSetting({ widget: Widget }) },
        mount,
        PLUGIN,
      );

      const widget = getMountWidget(sanitized?.customWidget);
      const container = document.createElement("div");
      const initialProps = { id: "customWidget" };
      const mountHandle = widget(container, initialProps);

      expect(calls).toEqual([{ Component: Widget, container, initialProps }]);

      mountHandle.update({ id: "customWidget", value: 1 });
      expect(handle.update).toHaveBeenCalledWith({
        id: "customWidget",
        value: 1,
      });

      mountHandle.unmount();
      expect(handle.unmount).toHaveBeenCalledTimes(1);
    });

    it("lets the widget write only the plugin's own settings", () => {
      const warn = mockWarn();
      const { mount, calls } = setupMount();
      const onChangeSettings = jest.fn();
      const sanitized = sanitizePluginSettings(
        {
          customWidget: definePluginSetting({ widget: Widget }),
          threshold: definePluginSetting({ widget: "number" }),
        },
        mount,
        PLUGIN,
      );

      const widget = getMountWidget(sanitized?.customWidget);
      widget(document.createElement("div"), {
        id: "customWidget",
        onChangeSettings,
      });
      const mountedProps = calls[0].initialProps;
      if (!isObject(mountedProps)) {
        throw new Error("Expected the widget to be mounted with props");
      }
      getCallback(
        mountedProps,
        "onChangeSettings",
      )({
        customWidget: "a",
        threshold: 1,
        "gauge.segments": [{ min: { type: "card", id: 1, column: "x" } }],
      });

      expect(onChangeSettings).toHaveBeenCalledWith({
        customWidget: "a",
        threshold: 1,
      });
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockRestore();
    });
  });

  describe("widget validation", () => {
    it("throws for unsupported built-in widget names", () => {
      const { mount } = setupMount();

      expect(() =>
        sanitizePluginSettings(
          {
            threshold: definePluginSetting({ widget: "number" }),
            bad: definePluginSetting({ widget: "dropdown" }),
          },
          mount,
          PLUGIN,
        ),
      ).toThrow();
    });

    it("accepts every allowed built-in widget name", () => {
      const { mount } = setupMount();
      const allowedNames = [
        "input",
        "number",
        "radio",
        "select",
        "toggle",
        "segmentedControl",
        "field",
        "fields",
        "color",
        "multiselect",
      ];
      const settings = Object.fromEntries(
        allowedNames.map((name) => [
          `${name}Setting`,
          definePluginSetting({ widget: name }),
        ]),
      );

      expect(() =>
        sanitizePluginSettings(settings, mount, PLUGIN),
      ).not.toThrow();
    });
  });
});

function definePluginSetting(
  definition: unknown,
): CustomVisualizationSettingDefinition<Record<string, unknown>> {
  // The branded definition type is produced by the same identity cast in
  // production (`defineSetting` in custom-viz-plugins.tsx). `unknown` also
  // lets tests feed malformed definitions the way a plugin bundle could.
  return definition as CustomVisualizationSettingDefinition<
    Record<string, unknown>
  >;
}

type RuntimeSettingDefinition = {
  title?: string;
  widget?: WidgetMount | string;
  getProps?: (...args: unknown[]) => unknown;
  writeDependencies?: string[];
  eraseDependencies?: string[];
};

function getRuntimeDefinition(definition: unknown): RuntimeSettingDefinition {
  // The branded type is opaque by design; at runtime it's a plain
  // definition object, which is what these assertions inspect.
  return definition as RuntimeSettingDefinition;
}

function getCallback(source: Record<string, unknown>, name: string) {
  const callback = source[name];
  if (!isFunction(callback)) {
    throw new Error(`Expected "${name}" to be a function`);
  }

  return callback;
}

function getMountWidget(
  definition:
    | CustomVisualizationSettingDefinition<Record<string, unknown>>
    | undefined,
): WidgetMount {
  const { widget } = getRuntimeDefinition(definition);

  if (typeof widget !== "function") {
    throw new Error(`Expected a WidgetMount, got widget "${String(widget)}"`);
  }

  return widget;
}
