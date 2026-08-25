import type {
  CustomVisualization,
  CustomVisualizationMount,
  CustomVisualizationSettingDefinition,
  ReservedVisualizationSettingId,
  Widgets,
  WritableCommonVisualizationSettingId,
} from "custom-viz";
import type { ComponentType } from "react";
import { t } from "ttag";

import { GOAL_SETTING_KEYS } from "metabase/visualizations/lib/dynamic-goals";
import type { CustomVizPluginRuntime } from "metabase-types/api";
import { isFunction, isObject } from "metabase-types/guards";

import { wrapPluginWidget } from "./widget-mount";

const RESERVED_SETTING_IDS: ReadonlySet<string> =
  new Set<ReservedVisualizationSettingId>([
    "column",
    "column_settings",
    ...GOAL_SETTING_KEYS,
  ]);

const COMMON_WRITABLE_SETTING_IDS: readonly string[] = Object.keys({
  "card.title": true,
  "card.description": true,
  "card.hide_empty": true,
  click_behavior: true,
} satisfies Record<WritableCommonVisualizationSettingId, true>);

type PluginSettings = NonNullable<
  CustomVisualization<Record<string, unknown>>["settings"]
>;

type PluginSettingDefinition = CustomVisualizationSettingDefinition<
  Record<string, unknown>
>;

type RuntimeSettingDefinition = Record<string, unknown>;

type SanitizeContext = {
  allowedWriteKeys: ReadonlySet<string>;
  mount: CustomVisualizationMount;
  plugin: CustomVizPluginRuntime;
};

/**
 * Make a plugin's `vizDef.settings` host-safe: drop reserved ids, hand plugin
 * callbacks only their documented arguments, confine writes to the plugin's
 * own settings, and rewrite Component-shaped `widget`s into host-trusted
 * `WidgetMount`s that delegate to the plugin's `mount`.
 */
export function sanitizePluginSettings(
  settings: PluginSettings | undefined,
  mount: CustomVisualizationMount,
  plugin: CustomVizPluginRuntime,
): PluginSettings | undefined {
  if (!settings) {
    return settings;
  }

  const definitions: [string, RuntimeSettingDefinition][] = [];
  for (const [settingId, definition] of Object.entries(settings)) {
    if (RESERVED_SETTING_IDS.has(settingId)) {
      console.warn(
        `Custom viz setting "${settingId}" uses a reserved id and was ignored.`,
      );
    } else if (isObject(definition)) {
      definitions.push([settingId, definition]);
    }
  }

  assertValidSettingWidgets(definitions);

  const context: SanitizeContext = {
    allowedWriteKeys: new Set([
      ...definitions.map(([settingId]) => settingId),
      ...COMMON_WRITABLE_SETTING_IDS,
    ]),
    mount,
    plugin,
  };

  return Object.fromEntries(
    definitions.map(([settingId, definition]) => [
      settingId,
      sanitizeDefinition(settingId, definition, context),
    ]),
  );
}

function sanitizeDefinition(
  settingId: string,
  definition: RuntimeSettingDefinition,
  { allowedWriteKeys, mount, plugin }: SanitizeContext,
): PluginSettingDefinition {
  const { getProps, widget, writeDependencies, eraseDependencies } = definition;
  const pickWritable = (ids: unknown) =>
    pickWritableSettingIds(settingId, ids, allowedWriteKeys);

  return brandDefinition({
    ...definition,
    ...(isFunction(getProps) && {
      getProps: (series: unknown, settings: unknown) =>
        getProps(series, settings),
    }),
    ...(writeDependencies !== undefined && {
      writeDependencies: pickWritable(writeDependencies),
    }),
    ...(eraseDependencies !== undefined && {
      eraseDependencies: pickWritable(eraseDependencies),
    }),
    ...(isComponentWidget(widget) && {
      widget: wrapPluginWidget(
        (container, initialProps) => mount(widget, container, initialProps),
        plugin,
        allowedWriteKeys,
      ),
    }),
  });
}

function pickWritableSettingIds(
  settingId: string,
  ids: unknown,
  allowedWriteKeys: ReadonlySet<string>,
): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  const settingIds = ids.filter((id: unknown): id is string => {
    return typeof id === "string";
  });
  const dropped = settingIds.filter((id) => !allowedWriteKeys.has(id));
  if (dropped.length > 0) {
    console.warn(
      `Custom viz setting "${settingId}" depends on settings it cannot write and they were ignored: ${dropped.join(", ")}.`,
    );
  }

  return settingIds.filter((id) => allowedWriteKeys.has(id));
}

// Built-in widgets are names; by the public contract a function-shaped widget is a React component.
function isComponentWidget(
  widget: unknown,
): widget is ComponentType<Record<string, unknown>> {
  return typeof widget === "function";
}

function brandDefinition(
  definition: RuntimeSettingDefinition,
): PluginSettingDefinition {
  // The public definition type is an opaque brand over this runtime shape.
  return definition as unknown as PluginSettingDefinition;
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
  definitions: [string, RuntimeSettingDefinition][],
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
