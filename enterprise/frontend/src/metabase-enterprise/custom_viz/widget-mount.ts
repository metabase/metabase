import type { WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import type { CustomVizPluginRuntime } from "metabase-types/api";
import { isFunction, isObject } from "metabase-types/guards";

import { toHostSettings } from "./plugin-view";

/**
 * A host-allocated `WidgetMount` tagged with the plugin it renders.
 */
type WidgetMountWithPlugin = WidgetMount & {
  plugin: CustomVizPluginRuntime;
};

type WidgetProps = Record<string, unknown>;

/**
 * Wrap a plugin-supplied function-shaped widget in a host-allocated
 * `WidgetMount` tagged with its plugin. Props are translated on the way in,
 * so the plugin sees its own setting ids and never holds a raw host callback.
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount,
  plugin: CustomVizPluginRuntime,
  prefix: string,
): WidgetMountWithPlugin {
  const mount: WidgetMount = (container, initialProps) => {
    const handle = pluginWidget(
      container,
      toPluginWidgetProps(initialProps, prefix),
    );
    return {
      update: (props) => handle.update(toPluginWidgetProps(props, prefix)),
      unmount: () => handle.unmount(),
    };
  };

  return Object.assign(mount, { plugin });
}

// The host's callbacks take extra host-only arguments (e.g. a question) that a plugin must not be able to supply.
function toPluginWidgetProps(props: WidgetProps, prefix: string): WidgetProps {
  const { id, onChange, onChangeSettings } = props;
  const pluginProps = { ...props };

  if (typeof id === "string" && id.startsWith(prefix)) {
    pluginProps.id = id.slice(prefix.length);
  }
  if (isFunction(onChange)) {
    pluginProps.onChange = (value: unknown) => onChange(value);
  }
  if (isFunction(onChangeSettings)) {
    pluginProps.onChangeSettings = (settings: unknown) =>
      onChangeSettings(
        toHostSettings(isObject(settings) ? settings : {}, prefix),
      );
  }

  return pluginProps;
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
