import type {
  CustomVisualizationMount,
  CustomVisualizationMountHandle,
  CustomVisualizationSettingDefinition,
  WidgetMount,
} from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginId } from "metabase-types/api";

import { sanitizePluginSettings } from "./custom-viz-settings";
import { getWidgetMountPluginId, isWidgetMount } from "./widget-mount";

const PLUGIN_ID: CustomVizPluginId = 1;

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

describe("sanitizePluginSettings", () => {
  it("returns undefined when the plugin declares no settings", () => {
    const { mount } = setupMount();

    expect(sanitizePluginSettings(undefined, mount, PLUGIN_ID)).toBeUndefined();
  });

  it("passes built-in widget settings through unchanged", () => {
    const { mount } = setupMount();
    const threshold = definePluginSetting({
      title: "Threshold",
      widget: "number",
    });

    const sanitized = sanitizePluginSettings({ threshold }, mount, PLUGIN_ID);

    expect(sanitized?.threshold).toBe(threshold);
  });

  it("skips definitions that are not objects", () => {
    const { mount } = setupMount();

    const sanitized = sanitizePluginSettings(
      { broken: definePluginSetting("not-a-definition") },
      mount,
      PLUGIN_ID,
    );

    expect(sanitized).toEqual({});
  });

  it("drops settings with reserved ids and warns, keeping the rest", () => {
    const warn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { mount } = setupMount();
    const threshold = definePluginSetting({ widget: "number" });

    const sanitized = sanitizePluginSettings(
      {
        column: definePluginSetting({ widget: "input" }),
        column_settings: definePluginSetting({ widget: "input" }),
        threshold,
      },
      mount,
      PLUGIN_ID,
    );

    expect(sanitized).toEqual({ threshold });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Custom viz setting "column" uses a reserved id and was ignored.',
    );
    expect(warn).toHaveBeenCalledWith(
      'Custom viz setting "column_settings" uses a reserved id and was ignored.',
    );

    warn.mockRestore();
  });

  describe("component widgets", () => {
    const Widget: ComponentType<Record<string, unknown>> = () => null;

    it("rewrites a component widget into a plugin-tagged WidgetMount", () => {
      const { mount } = setupMount();
      const original = definePluginSetting({ title: "Custom", widget: Widget });

      const sanitized = sanitizePluginSettings(
        { customWidget: original },
        mount,
        PLUGIN_ID,
      );

      const definition = getRuntimeDefinition(sanitized?.customWidget);
      expect(definition.title).toBe("Custom");

      const widget = getMountWidget(sanitized?.customWidget);
      expect(isWidgetMount(widget)).toBe(true);
      expect(getWidgetMountPluginId(widget)).toBe(PLUGIN_ID);

      expect(getRuntimeDefinition(original).widget).toBe(Widget);
    });

    it("delegates mounting to the plugin's shared mount function", () => {
      const { mount, calls, handle } = setupMount();
      const sanitized = sanitizePluginSettings(
        { customWidget: definePluginSetting({ widget: Widget }) },
        mount,
        PLUGIN_ID,
      );

      const widget = getMountWidget(sanitized?.customWidget);
      const container = document.createElement("div");
      const initialProps = { id: "customWidget" };
      const mountHandle = widget(container, initialProps);

      expect(calls).toEqual([{ Component: Widget, container, initialProps }]);
      expect(mountHandle).toBe(handle);
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
          PLUGIN_ID,
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
        sanitizePluginSettings(settings, mount, PLUGIN_ID),
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
  widget: WidgetMount | string;
};

function getRuntimeDefinition(
  definition:
    | CustomVisualizationSettingDefinition<Record<string, unknown>>
    | undefined,
): RuntimeSettingDefinition {
  // The branded type is opaque by design; at runtime it's a plain
  // definition object, which is what these assertions inspect.
  return definition as unknown as RuntimeSettingDefinition;
}

function getMountWidget(
  definition:
    | CustomVisualizationSettingDefinition<Record<string, unknown>>
    | undefined,
): WidgetMount {
  const { widget } = getRuntimeDefinition(definition);

  if (typeof widget === "string") {
    throw new Error(`Expected a WidgetMount, got widget name "${widget}"`);
  }

  return widget;
}
