import type { WidgetMountHandle } from "custom-viz";
import { useEffect, useRef } from "react";
import { useUnmount } from "react-use";

type PerformMount<P> = (container: Element, props: P) => WidgetMountHandle<P>;

export function usePluginMount<P>(performMount: PerformMount<P>, props: P) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<WidgetMountHandle<P> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    if (!handleRef.current) {
      handleRef.current = performMount(containerRef.current, props);
    } else {
      handleRef.current.update(props);
    }
  });

  useUnmount(() => {
    handleRef.current?.unmount();
    handleRef.current = null;
  });

  return containerRef;
}
