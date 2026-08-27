import type {
  CreateDefineSetting,
  CustomVisualization,
  CustomVisualizationMount,
  ReservedVisualizationSettingId,
  Widgets,
} from "custom-viz";
import type { ComponentType } from "react";
import { t } from "ttag";

import {
  getCustomPluginIdentifier,
  getCustomVizSettingKeyPrefix,
} from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type {
  ComputedVisualizationSettings,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { CustomVizPluginRuntime, Series } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { toPluginSeries, toPluginVizSettings } from "./plugin-view";
import { wrapPluginWidget } from "./widget-mount";

const RESERVED_SETTING_IDS: ReadonlySet<string> = new Set(
  Object.keys({
    column: true,
    column_settings: true,
  } satisfies Record<ReservedVisualizationSettingId, true>),
);

type PluginSettings = CustomVisualization<Record<string, unknown>>["settings"];

// What a plugin passes to `defineSetting`: the shape we hold plugin definitions to.
type PluginSettingDefinition = Parameters<
  ReturnType<CreateDefineSetting<Record<string, unknown>>>
>[0];

type HostContext = {
  prefix: string;
  mount: CustomVisualizationMount;
  plugin: CustomVizPluginRuntime;
};

/**
 * Turn a plugin's `vizDef.settings` into host definitions. Setting ids and
 * dependency ids get the plugin's namespace, every callback sees the plugin's
 * view of the series and settings, and Component widgets are rewrapped into
 * host-allocated `WidgetMount`s that delegate to the plugin's `mount`.
 */
export function sanitizePluginSettings(
  settings: PluginSettings | undefined,
  mount: CustomVisualizationMount,
  plugin: CustomVizPluginRuntime,
): VisualizationSettingsDefinitions {
  if (!settings) {
    return {};
  }

  const definitions = Object.entries(settings).flatMap(
    ([settingId, definition]): [string, PluginSettingDefinition][] => {
      if (RESERVED_SETTING_IDS.has(settingId)) {
        console.warn(
          `Custom viz setting "${settingId}" uses a reserved id and was ignored.`,
        );
        return [];
      }
      if (!isObject(definition)) {
        return [];
      }
      // Definitions leave the sandbox as opaque branded values; at runtime they are the `defineSetting` argument.
      return [[settingId, definition as unknown as PluginSettingDefinition]];
    },
  );

  assertValidSettingWidgets(definitions);

  const context: HostContext = {
    prefix: getCustomVizSettingKeyPrefix(getCustomPluginIdentifier(plugin)),
    mount,
    plugin,
  };

  return Object.fromEntries(
    definitions.map(([settingId, definition]) => [
      `${context.prefix}${settingId}`,
      toHostDefinition(definition, context),
    ]),
  );
}

function toHostDefinition(
  definition: PluginSettingDefinition,
  { prefix, mount, plugin }: HostContext,
): VisualizationSettingDefinition<Series> {
  const {
    title,
    group,
    index,
    inline,
    persistDefault,
    getSection,
    widget,
    readDependencies,
    writeDependencies,
    eraseDependencies,
    isValid,
    getDefault,
    getProps,
    getValue,
  } = definition;
  const pluginArgs = (
    series: Series,
    settings: ComputedVisualizationSettings,
  ) => [toPluginSeries(series), toPluginVizSettings(settings, prefix)] as const;

  return {
    title,
    group,
    index,
    inline,
    persistDefault,
    getSection: getSection && (() => getSection()),
    readDependencies: prefixSettingIds(readDependencies, prefix),
    writeDependencies: prefixSettingIds(writeDependencies, prefix),
    eraseDependencies: prefixSettingIds(eraseDependencies, prefix),
    isValid:
      isValid &&
      ((series, settings) => isValid(...pluginArgs(series, settings))),
    getDefault:
      getDefault &&
      ((series, settings) => getDefault(...pluginArgs(series, settings))),
    getValue:
      getValue &&
      ((series, settings) => getValue(...pluginArgs(series, settings))),
    getProps:
      getProps &&
      ((series, settings) => getProps(...pluginArgs(series, settings))),
    widget: isComponentWidget(widget)
      ? wrapPluginWidget(
          (container, initialProps) => mount(widget, container, initialProps),
          plugin,
          prefix,
        )
      : widget,
  };
}

function prefixSettingIds(
  ids: string[] | undefined,
  prefix: string,
): string[] | undefined {
  if (!Array.isArray(ids)) {
    return undefined;
  }
  return ids
    .filter((id): id is string => typeof id === "string")
    .map((id) => `${prefix}${id}`);
}

// Built-in widgets are names; by the public contract a function-shaped widget is a React component.
function isComponentWidget(
  widget: unknown,
): widget is ComponentType<Record<string, unknown>> {
  return typeof widget === "function";
}

const ALLOWED_WIDGET_NAMES: Array<keyof Widgets> = [
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
] as const;

function assertValidSettingWidgets(
  definitions: [string, PluginSettingDefinition][],
): void {
  for (const [settingId, { widget }] of definitions) {
    if (
      typeof widget === "string" &&
      !ALLOWED_WIDGET_NAMES.some((name) => name === widget)
    ) {
      throw new Error(
        t`Setting "${settingId}" has unsupported widget ${widget}. Use one of: ${ALLOWED_WIDGET_NAMES.join(", ")}.`,
      );
    }
  }
}
