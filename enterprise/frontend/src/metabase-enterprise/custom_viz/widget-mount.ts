import type { WidgetMount } from "custom-viz";

import type { CustomVizPluginId } from "metabase-types/api";

/**
 * Host-realm symbol that both brands a host-trusted mount and carries the
 * originating plugin id (used to stamp `data-plugin-sandbox=<id>` on the
 * container; without it the sandbox's DOM-scoping distortion swaps the
 * widget's Nodes for detached decoys and it renders invisible).
 */
const HOST_TRUSTED_MOUNT_PLUGIN_ID = Symbol(
  "metabase.host.trusted-widget-mount-plugin-id",
);

type TrustedMount = WidgetMount & {
  [HOST_TRUSTED_MOUNT_PLUGIN_ID]?: CustomVizPluginId;
};

/**
 * Stamp a plugin-supplied function-shaped widget into a host-trusted
 * `WidgetMount`.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  pluginId: CustomVizPluginId,
): WidgetMount {
  const mount: TrustedMount = (container, initialProps) =>
    pluginWidget(container, initialProps);

  Object.defineProperty(mount, HOST_TRUSTED_MOUNT_PLUGIN_ID, {
    value: pluginId,
    enumerable: false,
  });

  return mount;
}

export function isTrustedWidgetMount(value: unknown): value is TrustedMount {
  return typeof value === "function" && HOST_TRUSTED_MOUNT_PLUGIN_ID in value;
}

/**
 * Recover the plugin id stamped onto a host-trusted mount by
 * `wrapPluginWidget`.
 */
export function getWidgetMountPluginId(
  maybeWidgetMount: WidgetMount,
): CustomVizPluginId | undefined {
  if (!isTrustedWidgetMount(maybeWidgetMount)) {
    return undefined;
  }

  return maybeWidgetMount[HOST_TRUSTED_MOUNT_PLUGIN_ID];
}
