import type { WidgetMountHandle } from "custom-viz";
import { useEffect, useRef } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import type { CustomVizPluginRuntime } from "metabase-types/api";

import { getCustomVizPluginWarningMessage } from "./components/warning-messages";

type PerformMount<P> = (container: Element, props: P) => WidgetMountHandle<P>;

export function usePluginMount<P>(
  performMount: PerformMount<P>,
  props: P,
  plugin: CustomVizPluginRuntime,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetMountRef = useRef<WidgetMountHandle<P> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    try {
      if (!widgetMountRef.current) {
        widgetMountRef.current = performMount(containerRef.current, props);
      } else {
        widgetMountRef.current.update(props);
      }
    } catch (error) {
      console.error(
        t`Failed to render plugin "${plugin.display_name}":`,
        error,
      );
      if (plugin.warnings.length > 0) {
        console.error(
          t`The plugin has version warnings that may explain the failure:`,
          plugin.warnings.map(getCustomVizPluginWarningMessage).join(" "),
        );
      }
      throw error;
    }
  }, [performMount, props, plugin]);

  useUnmount(() => {
    widgetMountRef.current?.unmount();
    widgetMountRef.current = null;
  });

  return containerRef;
}
