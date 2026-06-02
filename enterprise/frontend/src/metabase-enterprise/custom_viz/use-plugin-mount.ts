import type { WidgetMountHandle } from "custom-viz";
import { useEffect, useRef } from "react";
import { useUnmount } from "react-use";

type PerformMount<P> = (container: Element, props: P) => WidgetMountHandle<P>;

export function usePluginMount<P>(performMount: PerformMount<P>, props: P) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetMountRef = useRef<WidgetMountHandle<P> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    if (!widgetMountRef.current) {
      widgetMountRef.current = performMount(containerRef.current, props);
    } else {
      widgetMountRef.current.update(props);
    }
  }, [performMount, props]);

  useUnmount(() => {
    widgetMountRef.current?.unmount();
    widgetMountRef.current = null;
  });

  return containerRef;
}
