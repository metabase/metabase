import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginRuntime } from "metabase-types/api";
import { isFunction, isObject } from "metabase-types/guards";

/**
 * A host-allocated `WidgetMount` tagged with the plugin it renders.
 */
type WidgetMountWithPlugin = WidgetMount & {
  plugin: CustomVizPluginRuntime;
};

type WidgetProps = Record<string, unknown>;

/**
 * Wrap a plugin-supplied function-shaped widget in a host-allocated
 * `WidgetMount` tagged with its plugin. Props cross into the sandbox only
 * through `guardWidgetProps`, so the plugin never holds a raw host callback.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  plugin: CustomVizPluginRuntime,
  allowedWriteKeys: ReadonlySet<string>,
): WidgetMountWithPlugin {
  const guard = (props: WidgetProps) =>
    guardWidgetProps(props, allowedWriteKeys, plugin);

  const mount: WidgetMount = (container, initialProps) => {
    const handle = pluginWidget(container, guard(initialProps));
    return {
      update: (props) => handle.update(guard(props)),
      unmount: () => handle.unmount(),
    };
  };

  return Object.assign(mount, { plugin });
}

function guardWidgetProps(
  props: WidgetProps,
  allowedWriteKeys: ReadonlySet<string>,
  plugin: CustomVizPluginRuntime,
): WidgetProps {
  const { onChange, onChangeSettings } = props;

  return {
    ...props,
    ...(isFunction(onChange) && {
      onChange: (value: unknown) => onChange(value),
    }),
    ...(isFunction(onChangeSettings) && {
      onChangeSettings: (settings: unknown) =>
        onChangeSettings(
          pickWritableSettings(settings, allowedWriteKeys, plugin),
        ),
    }),
  };
}

// `settings` is a sandbox proxy whose getters run plugin code, so read it once.
function pickWritableSettings(
  settings: unknown,
  allowedWriteKeys: ReadonlySet<string>,
  plugin: CustomVizPluginRuntime,
): WidgetProps {
  if (!isObject(settings)) {
    return {};
  }

  const entries = Object.entries(settings);
  const dropped = entries.flatMap(([key]) =>
    allowedWriteKeys.has(key) ? [] : [key],
  );
  if (dropped.length > 0) {
    console.warn(
      `Custom viz "${plugin.display_name}" tried to write settings it does not own and they were ignored: ${dropped.join(", ")}.`,
    );
  }

  return Object.fromEntries(
    entries.filter(([key]) => allowedWriteKeys.has(key)),
  );
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
