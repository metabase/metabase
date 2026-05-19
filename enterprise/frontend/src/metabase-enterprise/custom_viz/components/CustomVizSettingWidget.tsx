import type { WidgetMount, WidgetMountHandle } from "custom-viz";
import { useEffect, useRef } from "react";
import { useUnmount } from "react-use";

import { getWidgetMountPluginId } from "../widget-mount";

type Props = {
  mount: WidgetMount<Record<string, unknown>>;
  widgetProps: Record<string, unknown>;
};

/**
 * Host-side driver for a custom-component setting widget.
 *
 * The plugin's `mount` function lives inside the near-membrane sandbox
 * (handed to us as a proxy). This component renders a container `<div>`,
 * calls `mount` once with the container and initial props, then drives
 * `update` on subsequent renders and `unmount` on teardown. The plugin's
 * widget React tree is reconciled by the plugin's own React instance —
 * never by the host — preserving the sandbox boundary.
 *
 * The container `<div>` carries `data-plugin-sandbox=<pluginId>` so the
 * sandbox's DOM-scoping distortion (see `sandbox/distortions-dom-read.ts`)
 * recognises it as part of the plugin's allowed subtree.
 *
 * `pluginId` is recovered from the host-trusted mount itself rather than
 * passed as a prop, so that ChartSettingsWidget (which renders this
 * driver) doesn't need to know about plugin identity.
 */
export function CustomVizSettingWidget({ mount, widgetProps }: Props) {
  const pluginId = getWidgetMountPluginId(mount);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<WidgetMountHandle<Record<string, unknown>> | null>(
    null,
  );

  // No deps array — same pattern as createCustomVizWrapper in
  // custom-viz-plugins.tsx. Every host render pushes fresh widgetProps
  // through the membrane via update().
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

  // Use the same `data-plugin-sandbox` attribute as the main viz so the
  // sandbox's DOM-scoping distortion (see distortions-dom-read.ts) treats
  // this container as being inside the plugin's allowed subtree. Without
  // this, every Node crossing the membrane gets swapped for a detached
  // decoy and React's createRoot reconciles into nothing visible.
  return (
    <div
      ref={containerRef}
      data-plugin-sandbox={pluginId}
      style={{ width: "100%" }}
    />
  );
}
