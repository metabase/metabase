import type {
  CreateDefineSetting,
  CustomVisualization,
  CustomVisualizationMount,
  ReservedVisualizationSettingId,
  Widgets,
} from "custom-viz";
import type { ComponentType } from "react";
import { t } from "ttag";

import type {
  ComputedVisualizationSettings,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type { CustomVizPluginRuntime, Series } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { toPluginSeries, toPluginSettings } from "./plugin-view";
import { wrapPluginWidget } from "./widget-mount";

const RESERVED_SETTING_IDS: ReadonlySet<string> = new Set(
  Object.keys({
    column: true,
    column_settings: true,
  } satisfies Record<ReservedVisualizationSettingId, true>),
);

type PluginSettingDefinitions = CustomVisualization<
  Record<string, unknown>
>["settings"];

type PluginSettingDefinition = Parameters<
  ReturnType<CreateDefineSetting<Record<string, unknown>>>
>[0];

export type HostContext = {
  prefix: string;
  mount: CustomVisualizationMount;
  plugin: CustomVizPluginRuntime;
};

/**
 * Turns plugin's `vizDef.settings` into host definitions. Setting ids and
 * dependency ids get the plugin's namespace, every callback sees the plugin's
 * view of the series and settings, and custom setting widgets are rewrapped into
 * host-side `WidgetMount`s.
 */
export function sanitizePluginSettings(
  settings: PluginSettingDefinitions | undefined,
  context: HostContext,
): VisualizationSettingsDefinitions {
  if (!settings) {
    return {};
  }

  const objectDefinitions = Object.entries(settings).flatMap(
    ([settingId, definition]): [string, PluginSettingDefinition][] => {
      if (!isObject(definition)) {
        return [];
      }
      // Definitions leave the sandbox as opaque branded values.
      return [[settingId, definition as unknown as PluginSettingDefinition]];
    },
  );

  assertValidSettingWidgets(objectDefinitions);

  const definitions = objectDefinitions.flatMap(
    ([settingId, definition]): [string, PluginSettingDefinition][] => {
      if (RESERVED_SETTING_IDS.has(settingId)) {
        console.warn(
          `Custom viz setting "${settingId}" uses a reserved id and was ignored.`,
        );
        return [];
      }
      return [[settingId, definition]];
    },
  );

  const declaredIds = new Set(definitions.map(([settingId]) => settingId));

  return Object.fromEntries(
    definitions.map(([settingId, definition]) => [
      `${context.prefix}${settingId}`,
      toHostDefinition(definition, context, declaredIds),
    ]),
  );
}

function toHostDefinition(
  definition: PluginSettingDefinition,
  { prefix, mount, plugin }: HostContext,
  declaredIds: ReadonlySet<string>,
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
  ) => [toPluginSeries(series), toPluginSettings(settings, prefix)] as const;

  return {
    title,
    group,
    index,
    inline,
    persistDefault,
    getSection: getSection && (() => getSection()),
    readDependencies: prefixSettingIds(readDependencies, prefix, declaredIds),
    writeDependencies: prefixSettingIds(writeDependencies, prefix, declaredIds),
    eraseDependencies: prefixSettingIds(eraseDependencies, prefix, declaredIds),
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
  declaredIds: ReadonlySet<string>,
): string[] | undefined {
  if (!Array.isArray(ids)) {
    return undefined;
  }

  // Dependencies may only reference the plugin's own settings - drop anything else.
  return ids.flatMap((id) => {
    return typeof id === "string" && declaredIds.has(id)
      ? [`${prefix}${id}`]
      : [];
  });
}

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
    if (typeof widget === "string") {
      if (!ALLOWED_WIDGET_NAMES.some((name) => name === widget)) {
        throw new Error(
          t`Setting "${settingId}" has unsupported widget ${widget}. Use one of: ${ALLOWED_WIDGET_NAMES.join(", ")}.`,
        );
      }
    } else if (widget && !isComponentWidget(widget)) {
      throw new Error(
        t`Setting "${settingId}" has an unsupported widget. Use a component or one of: ${ALLOWED_WIDGET_NAMES.join(", ")}.`,
      );
    }
  }
}
