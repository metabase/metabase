import type { WidgetMount } from "custom-viz";

import { checkNotNull } from "metabase/utils/types";

import { usePluginMount } from "../use-plugin-mount";
import { getWidgetMountPlugin } from "../widget-mount";

type Props = {
  mount: WidgetMount<Record<string, unknown>>;
  widgetProps: Record<string, unknown>;
};

/**
 * Host-side container for a custom-component setting widget.
 */
export function CustomVizSettingWidget({ mount, widgetProps }: Props) {
  const plugin = checkNotNull(getWidgetMountPlugin(mount));
  const containerRef = usePluginMount(mount, widgetProps, plugin);

  return (
    <div
      ref={containerRef}
      data-plugin-sandbox={plugin.id}
      style={{ width: "100%" }}
    />
  );
}
