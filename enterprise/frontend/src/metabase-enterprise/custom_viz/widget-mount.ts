import type { BaseWidgetProps, WidgetMount } from "custom-viz";

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
 * A host-allocated `WidgetMount` tagged with the plugin it renders and its
 * settings-key prefix.
 */
type WidgetMountWithPlugin = WidgetMount<CustomVizSettingWidgetProps> & {
  plugin: CustomVizPluginRuntime;
  prefix: string;
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

  return Object.assign(mount, { plugin, prefix });
}

function toPluginWidgetId(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/**
 * DOM id a plugin widget renders for a host setting id: the plugin's own bare
 * id for a plugin mount, the id unchanged otherwise. Keeps the host label's
 * htmlFor paired with the widget's control.
 */
export function getSettingWidgetDomId(widget: unknown, id: string): string {
  return isWidgetMount(widget) ? toPluginWidgetId(id, widget.prefix) : id;
}

function toPluginWidgetProps(
  {
    id,
    value,
    onChange,
    onChangeSettings,
    ...extraProps
  }: CustomVizSettingWidgetProps,
  prefix: string,
): PluginWidgetProps {
  return {
    ...extraProps,
    id: toPluginWidgetId(id, prefix),
    value: structuredClone(value),
    onChange: (value) => onChange(value),
    onChangeSettings: (settings) =>
      onChangeSettings(
        toHostSettings(isObject(settings) ? settings : {}, prefix),
      ),
  };
}

export function isWidgetMount(value: unknown): value is WidgetMountWithPlugin {
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
