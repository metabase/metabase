import type { WidgetMount, WidgetMountHandle } from "custom-viz";
import { useEffect, useRef } from "react";
import { useUnmount } from "react-use";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<WidgetMountHandle<Record<string, unknown>> | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    if (!handleRef.current) {
      handleRef.current = mount(containerRef.current, widgetProps);
    } else {
      handleRef.current.update(widgetProps);
    }
  });

  useUnmount(() => {
    handleRef.current?.unmount();
    handleRef.current = null;
  });

  return (
    <div
      ref={containerRef}
      data-plugin-sandbox={pluginId}
      style={{ width: "100%" }}
    />
  );
}
