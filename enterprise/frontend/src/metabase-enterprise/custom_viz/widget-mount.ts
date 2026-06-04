import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginId } from "metabase-types/api";

/**
 * A host-allocated `WidgetMount` tagged with the id of the plugin it renders.
 */
type WidgetMountWithPlugin = WidgetMount & {
  pluginId: CustomVizPluginId;
};

/**
 * Wrap a plugin-supplied function-shaped widget in a host-allocated
 * `WidgetMount` tagged with its plugin id.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  pluginId: CustomVizPluginId,
): WidgetMountWithPlugin {
  const mount: WidgetMount = (container, initialProps) =>
    pluginWidget(container, initialProps);

  return Object.assign(mount, { pluginId });
}

export function isWidgetMount(
  value:
    | string
    | WidgetMount
    | ComponentType<{
        id: string;
      }>,
): value is WidgetMountWithPlugin {
  return typeof value === "function" && "pluginId" in value;
}

/**
 * Recover the plugin id tagged onto a host-allocated mount by
 * `wrapPluginWidget`.
 */
export function getWidgetMountPluginId(
  maybeWidgetMount: WidgetMount,
): CustomVizPluginId | undefined {
  if (!isWidgetMount(maybeWidgetMount)) {
    return undefined;
  }

  return maybeWidgetMount.pluginId;
}
