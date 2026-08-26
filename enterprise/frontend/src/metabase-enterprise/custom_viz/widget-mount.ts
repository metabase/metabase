import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginRuntime } from "metabase-types/api";

/**
 * A host-allocated `WidgetMount` tagged with the plugin it renders.
 */
type WidgetMountWithPlugin = WidgetMount & {
  plugin: CustomVizPluginRuntime;
};

/**
 * Wrap a plugin-supplied function-shaped widget in a host-allocated
 * `WidgetMount` tagged with its plugin.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  plugin: CustomVizPluginRuntime,
): WidgetMountWithPlugin {
  const mount: WidgetMount = (container, initialProps) =>
    pluginWidget(container, initialProps);

  return Object.assign(mount, { plugin });
}

export function isWidgetMount(
  value:
    | string
    | WidgetMount
    | ComponentType<{
        id: string;
      }>,
): value is WidgetMountWithPlugin {
  return typeof value === "function" && "plugin" in value;
}

/**
 * Recover the plugin tagged onto a host-allocated mount by
 * `wrapPluginWidget`.
 */
export function getWidgetMountPlugin(
  maybeWidgetMount: WidgetMount,
): CustomVizPluginRuntime | undefined {
  if (!isWidgetMount(maybeWidgetMount)) {
    return undefined;
  }

  return maybeWidgetMount.plugin;
}
