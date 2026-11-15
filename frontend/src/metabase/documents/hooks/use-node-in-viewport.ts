import { useIntersection, useMergedRef } from "@mantine/hooks";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { useCurrentRef } from "metabase/common/hooks/use-current-ref";
import { usePrefetchQueue } from "metabase/documents/contexts/PrefetchQueueContext";
import { usePrintContext } from "metabase/documents/contexts/PrintContext";
import { useScrollContainer } from "metabase/documents/contexts/ScrollContainerContext";

const noopSubscribe = () => () => {};

/**
 * Detects whether a node view element is near the viewport (always true while
 * printing). With an `id`, the node also joins the prefetch queue
 */
export function useNodeInViewport(id?: string) {
  const scrollContainer = useScrollContainer();
  const { isPrinting } = usePrintContext();
  const prefetchQueue = usePrefetchQueue();

  const { ref: ioRef, entry } = useIntersection({
    root: scrollContainer,
    // 200% margin: IO fires when the card is up to 2 viewport heights
    // away from visible, giving React + ECharts time to mount before
    // the user can see the card during normal scrolling. Trade-off:
    // more visualizations stay mounted in the buffer, but bounded
    // (~5-8 cards in a typical doc).
    rootMargin: "200%",
    threshold: 0,
  });

  const elementRef = useRef<HTMLElement | null>(null);
  const ref = useMergedRef(elementRef, ioRef);

  const ioIntersecting = entry?.isIntersecting ?? false;

  // Only nodes with an id can hold prefetch tickets, so id-less nodes
  // (text blocks) skip the store subscription instead of being notified
  // on every ticket grant.
  const subscribe = useCallback(
    (onChange: () => void) =>
      id != null && prefetchQueue
        ? prefetchQueue.subscribe(onChange)
        : noopSubscribe(),
    [prefetchQueue, id],
  );
  const hasPrefetchTicket = useSyncExternalStore(
    subscribe,
    () => (id != null && prefetchQueue ? prefetchQueue.hasTicket(id) : false),
    () => false,
  );

  const isInViewport = isPrinting || ioIntersecting;
  const isInViewportRef = useCurrentRef(isInViewport);

  useEffect(() => {
    if (!prefetchQueue || id == null) {
      return;
    }
    return prefetchQueue.register({
      id,
      getElement: () => elementRef.current,
      isInViewport: () => isInViewportRef.current,
    });
  }, [prefetchQueue, id, isInViewportRef]);

  // Re-run the idle prefetch pass whenever any node's intersection state
  // changes, so the coordinator can re-rank candidates by distance.
  useEffect(() => {
    prefetchQueue?.notifyViewportChange();
  }, [prefetchQueue, ioIntersecting]);

  const shouldLoadData = isInViewport || hasPrefetchTicket;

  return { ref, isInViewport, shouldLoadData };
}

/**
 * Companion to `useNodeInViewport`: reports the node's data-fetch state to
 * the prefetch coordinator so it can limit concurrent prefetches and answer
 * "is anything still loading?" for print readiness. Any node view that
 * fetches data gated by `shouldLoadData` must also call this.
 */
export function useReportPrefetchLoading(id: string, isLoading: boolean) {
  const prefetchQueue = usePrefetchQueue();

  useEffect(() => {
    if (!prefetchQueue) {
      return;
    }
    prefetchQueue.reportLoading(id, isLoading);
    return () => prefetchQueue.reportLoading(id, false);
  }, [prefetchQueue, id, isLoading]);
}
