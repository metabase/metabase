import type { BaseWidgetProps, WidgetMount } from "custom-viz";
import type { ComponentType } from "react";

import { clone } from "metabase/utils/clone";
import type { CustomVizSettingWidgetProps } from "metabase/visualizations/types";
import type { CustomVizPluginRuntime } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { toHostSettings } from "./plugin-view";

// What the plugin's setting widget receives: the SDK base props + whatever setting definition's `getProps` adds.
export type PluginWidgetProps = BaseWidgetProps<
  unknown,
  Record<string, unknown>
> &
  Record<string, unknown>;

/**
 * A host-allocated `WidgetMount` tagged with the plugin it renders.
 */
type WidgetMountWithPlugin = WidgetMount<CustomVizSettingWidgetProps> & {
  plugin: CustomVizPluginRuntime;
};

/**
 * Wrap a plugin-supplied function-shaped widget in a host-allocated
 * `WidgetMount` tagged with its plugin. Props are translated on the way in,
 * so the plugin sees its own setting ids (i.e. non-prefixed ones).
 */
export function wrapPluginWidget(
  pluginWidget: WidgetMount<PluginWidgetProps>,
  plugin: CustomVizPluginRuntime,
  prefix: string,
): WidgetMountWithPlugin {
  const mount: WidgetMount<CustomVizSettingWidgetProps> = (
    container,
    initialProps,
  ) => {
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

function toPluginWidgetProps(
  { value, onChange, onChangeSettings, ...rest }: CustomVizSettingWidgetProps,
  prefix: string,
): PluginWidgetProps {
  return {
    ...rest,
    value: clone(value),
    onChange: (value) => onChange(value),
    onChangeSettings: (settings) =>
      onChangeSettings(
        toHostSettings(isObject(settings) ? settings : {}, prefix),
      ),
  };
}

export function isWidgetMount(
  value:
    | string
    | WidgetMount<CustomVizSettingWidgetProps>
    | ComponentType<{
        id: string;
      }>
    | undefined,
): value is WidgetMountWithPlugin {
  return typeof value === "function" && "plugin" in value;
}

/**
 * Recover the plugin tagged onto a host-allocated mount by
 * `wrapPluginWidget`.
 */
export function getWidgetMountPlugin(
  maybeWidgetMount: WidgetMount<CustomVizSettingWidgetProps>,
): CustomVizPluginRuntime | undefined {
  if (!isWidgetMount(maybeWidgetMount)) {
    return undefined;
  }

  return maybeWidgetMount.plugin;
}
