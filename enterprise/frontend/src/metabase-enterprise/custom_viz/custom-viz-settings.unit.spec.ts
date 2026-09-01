import type {
  CustomVisualizationMount,
  CustomVisualizationMountHandle,
  CustomVisualizationSettingDefinition,
  WidgetMount,
} from "custom-viz";
import type { ComponentType } from "react";

import { getCustomPluginIdentifier } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import { getCustomVizSettingKeyPrefix } from "metabase/visualizations/custom-visualizations/setting-keys";
import type {
  CustomVizSettingWidgetProps,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";
import {
  createMockCustomVizPluginRuntime,
  createMockSingleSeries,
} from "metabase-types/api/mocks";
import { isFunction, isObject } from "metabase-types/guards";

import {
  type HostContext,
  sanitizePluginSettings,
} from "./custom-viz-settings";
import { getWidgetMountPlugin, isWidgetMount } from "./widget-mount";

const PLUGIN = createMockCustomVizPluginRuntime();
const PREFIX = getCustomVizSettingKeyPrefix(getCustomPluginIdentifier(PLUGIN));
const SERIES: Series = [
  createMockSingleSeries({ visualization_settings: { threshold: 1 } }),
];
const SETTINGS = {
  "card.title": "Title",
  [`${PREFIX}threshold`]: 1,
  "custom-viz:other:threshold": 2,
};

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

  const context: HostContext = { prefix: PREFIX, mount, plugin: PLUGIN };

  return { context, calls, handle };
}

function mockWarn() {
  return jest.spyOn(console, "warn").mockImplementation(() => undefined);
}

describe("sanitizePluginSettings", () => {
  it("returns no definitions when the plugin declares no settings", () => {
    const { context } = setupMount();

    expect(sanitizePluginSettings(undefined, context)).toEqual({});
  });

  it("namespaces setting ids and copies the documented fields", () => {
    const { context } = setupMount();
    const threshold = definePluginSetting({
      title: "Threshold",
      group: "Limits",
      index: 2,
      inline: true,
      persistDefault: true,
      widget: "number",
    });

    const sanitized = sanitizePluginSettings({ threshold }, context);

    expect(Object.keys(sanitized)).toEqual([`${PREFIX}threshold`]);
    const definition = getHostDefinition(sanitized, `${PREFIX}threshold`);
    expect(definition).toMatchObject({
      title: "Threshold",
      group: "Limits",
      index: 2,
      inline: true,
      persistDefault: true,
      widget: "number",
    });
    expect(definition).not.toBe(threshold);
  });

  it("leaves out fields that are not part of the plugin API", () => {
    const { context } = setupMount();

    const sanitized = sanitizePluginSettings(
      {
        threshold: definePluginSetting({
          widget: "number",
          dashboard: false,
          getHidden: () => true,
          onUpdate: () => undefined,
        }),
      },
      context,
    );

    const definition = getHostDefinition(sanitized, `${PREFIX}threshold`);
    expect(definition).not.toHaveProperty("dashboard");
    expect(definition).not.toHaveProperty("getHidden");
    expect(definition).not.toHaveProperty("onUpdate");
  });

  it("skips definitions that are not objects", () => {
    const { context } = setupMount();

    const sanitized = sanitizePluginSettings(
      { broken: definePluginSetting("not-a-definition") },
      context,
    );

    expect(sanitized).toEqual({});
  });

  it("drops settings with reserved ids and warns, keeping the rest", () => {
    const warn = mockWarn();
    const { context } = setupMount();

    const sanitized = sanitizePluginSettings(
      {
        column: definePluginSetting({ widget: "input" }),
        column_settings: definePluginSetting({ widget: "input" }),
        threshold: definePluginSetting({ widget: "number" }),
      },
      context,
    );

    expect(Object.keys(sanitized)).toEqual([`${PREFIX}threshold`]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      'Custom viz setting "column" uses a reserved id and was ignored.',
    );
    expect(warn).toHaveBeenCalledWith(
      'Custom viz setting "column_settings" uses a reserved id and was ignored.',
    );

    warn.mockRestore();
  });

  describe("dependencies", () => {
    it("namespaces read, write and erase dependencies to the plugin's own settings", () => {
      const { context } = setupMount();

      const sanitized = sanitizePluginSettings(
        {
          threshold: definePluginSetting({
            widget: "number",
            readDependencies: ["label"],
            writeDependencies: ["label", "goalColumn"],
            eraseDependencies: ["segments"],
          }),
          label: definePluginSetting({ widget: "input" }),
          goalColumn: definePluginSetting({ widget: "input" }),
          segments: definePluginSetting({ widget: "input" }),
        },
        context,
      );

      expect(getHostDefinition(sanitized, `${PREFIX}threshold`)).toMatchObject({
        readDependencies: [`${PREFIX}label`],
        writeDependencies: [`${PREFIX}label`, `${PREFIX}goalColumn`],
        eraseDependencies: [`${PREFIX}segments`],
      });
    });

    it("drops dependencies that don't name the plugin's own settings", () => {
      const { context } = setupMount();

      const sanitized = sanitizePluginSettings(
        {
          threshold: definePluginSetting({
            widget: "number",
            readDependencies: ["card.title"],
            writeDependencies: ["label", "card.title"],
          }),
          label: definePluginSetting({ widget: "input" }),
        },
        context,
      );

      const definition = getHostDefinition(sanitized, `${PREFIX}threshold`);
      expect(definition.readDependencies).toEqual([]);
      expect(definition.writeDependencies).toEqual([`${PREFIX}label`]);
    });

    it("drops dependencies that are not lists of ids", () => {
      const { context } = setupMount();

      const sanitized = sanitizePluginSettings(
        {
          threshold: definePluginSetting({
            widget: "number",
            readDependencies: "label",
            writeDependencies: ["label", 42],
          }),
          label: definePluginSetting({ widget: "input" }),
        },
        context,
      );

      const definition = getHostDefinition(sanitized, `${PREFIX}threshold`);
      expect(definition.readDependencies).toBeUndefined();
      expect(definition.writeDependencies).toEqual([`${PREFIX}label`]);
      expect(definition.eraseDependencies).toBeUndefined();
    });
  });

  describe("callbacks", () => {
    it.each(["getDefault", "getValue", "isValid", "getProps"])(
      "calls %s with the plugin's view of the series and settings only",
      (name) => {
        const { context } = setupMount();
        const callback = jest.fn<boolean, [Series, ...unknown[]]>(() => true);

        const sanitized = sanitizePluginSettings(
          {
            threshold: definePluginSetting({
              widget: "number",
              [name]: callback,
            }),
          },
          context,
        );
        getCallback(getHostDefinition(sanitized, `${PREFIX}threshold`), name)(
          SERIES,
          SETTINGS,
          {},
          jest.fn(),
          jest.fn(),
        );

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(SERIES, {
          "card.title": "Title",
          threshold: 1,
        });
        const [series] = callback.mock.calls[0];
        expect(series[0].card).not.toBe(SERIES[0].card);
      },
    );

    it("calls getSection without arguments", () => {
      const { context } = setupMount();
      const getSection = jest.fn(() => "Display");

      const sanitized = sanitizePluginSettings(
        { threshold: definePluginSetting({ widget: "number", getSection }) },
        context,
      );

      expect(
        getCallback(
          getHostDefinition(sanitized, `${PREFIX}threshold`),
          "getSection",
        )(SERIES, SETTINGS, {}),
      ).toBe("Display");
      expect(getSection).toHaveBeenCalledWith();
    });
  });

  describe("component widgets", () => {
    const Widget: ComponentType<Record<string, unknown>> = () => null;

    it("rewrites a component widget into a plugin-tagged WidgetMount", () => {
      const { context } = setupMount();
      const original = definePluginSetting({ title: "Custom", widget: Widget });

      const sanitized = sanitizePluginSettings(
        { customWidget: original },
        context,
      );

      const definition = getHostDefinition(sanitized, `${PREFIX}customWidget`);
      expect(definition.title).toBe("Custom");

      const widget = getMountWidget(definition);
      expect(isWidgetMount(widget)).toBe(true);
      expect(getWidgetMountPlugin(widget)).toBe(PLUGIN);
    });

    it("delegates mounting to the plugin's shared mount function with the plugin's setting id", () => {
      const { context, calls, handle } = setupMount();
      const sanitized = sanitizePluginSettings(
        { customWidget: definePluginSetting({ widget: Widget }) },
        context,
      );

      const widget = getMountWidget(
        getHostDefinition(sanitized, `${PREFIX}customWidget`),
      );
      const container = document.createElement("div");
      const mountHandle = widget(container, {
        id: `${PREFIX}customWidget`,
        value: null,
        onChange: jest.fn(),
        onChangeSettings: jest.fn(),
      });

      expect(calls).toMatchObject([{ Component: Widget, container }]);
      expect(calls[0].initialProps).toMatchObject({ id: "customWidget" });

      mountHandle.unmount();
      expect(handle.unmount).toHaveBeenCalledTimes(1);
    });

    it("namespaces the settings a widget writes", () => {
      const { context, calls } = setupMount();
      const onChangeSettings = jest.fn();
      const sanitized = sanitizePluginSettings(
        { customWidget: definePluginSetting({ widget: Widget }) },
        context,
      );

      const widget = getMountWidget(
        getHostDefinition(sanitized, `${PREFIX}customWidget`),
      );
      widget(document.createElement("div"), {
        id: `${PREFIX}customWidget`,
        value: null,
        onChange: jest.fn(),
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
        "gauge.segments": [],
      });

      expect(onChangeSettings).toHaveBeenCalledWith({
        [`${PREFIX}customWidget`]: "a",
        [`${PREFIX}gauge.segments`]: [],
      });
    });
  });

  describe("widget validation", () => {
    it("throws for unsupported built-in widget names", () => {
      const { context } = setupMount();

      expect(() =>
        sanitizePluginSettings(
          {
            threshold: definePluginSetting({ widget: "number" }),
            bad: definePluginSetting({ widget: "dropdown" }),
          },
          context,
        ),
      ).toThrow();
    });

    it("accepts every allowed built-in widget name", () => {
      const { context } = setupMount();
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

      expect(() => sanitizePluginSettings(settings, context)).not.toThrow();
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

function getHostDefinition(
  definitions: VisualizationSettingsDefinitions,
  id: string,
): VisualizationSettingDefinition<Series> {
  const definition = definitions[id];

  if (!isObject(definition)) {
    throw new Error(`Expected a definition for "${id}"`);
  }

  return definition;
}

function getCallback(source: object, name: string) {
  const callback = Reflect.get(source, name);

  if (!isFunction(callback)) {
    throw new Error(`Expected "${name}" to be a function`);
  }

  return callback;
}

function getMountWidget(
  definition: VisualizationSettingDefinition<Series>,
): WidgetMount<CustomVizSettingWidgetProps> {
  const { widget } = definition;

  if (!isWidgetMount(widget)) {
    throw new Error(`Expected a WidgetMount, got widget "${String(widget)}"`);
  }

  return widget;
}
