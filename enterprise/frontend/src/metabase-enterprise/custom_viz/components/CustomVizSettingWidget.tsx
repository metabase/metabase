import type { WidgetMount } from "custom-viz";

import { usePluginMount } from "../use-plugin-mount";
import { getWidgetMountPluginId } from "../widget-mount";

type Props = {
  mount: WidgetMount<Record<string, unknown>>;
  widgetProps: Record<string, unknown>;
};

/**
 * Host-side container for a custom-component setting widget.
 */
export function CustomVizSettingWidget({ mount, widgetProps }: Props) {
  const pluginId = getWidgetMountPluginId(mount);
  const containerRef = usePluginMount(mount, widgetProps);

  return (
    <div
      ref={containerRef}
      data-plugin-sandbox={pluginId}
      style={{ width: "100%" }}
    />
  );
}
