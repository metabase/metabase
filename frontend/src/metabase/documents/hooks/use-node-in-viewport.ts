import { useIntersection } from "@mantine/hooks";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

import { usePrefetchQueue } from "metabase/documents/contexts/PrefetchQueueContext";
import { usePrintContext } from "metabase/documents/contexts/PrintContext";
import { useScrollContainer } from "metabase/documents/contexts/ScrollContainerContext";

const noopSubscribe = () => () => {};

/**
 * Detects whether a node view element is near the viewport.
 * Uses IntersectionObserver with a 200% rootMargin buffer on all sides.
 *
 * entry === null (initial state before first observation) is treated as
 * out-of-viewport so callers can defer expensive work (e.g. card queries)
 * until IntersectionObserver confirms visibility. Visible nodes briefly
 * show a placeholder for ~1 frame before IO fires its first callback,
 * which is preferable to firing N redundant queries on mount.
 *
 * While printing we force in-viewport so off-screen cards are rendered
 * into the print output instead of staying as skeletons.
 *
 * When an `id` is provided AND a PrefetchQueueProvider is mounted, the
 * node registers with the prefetch coordinator so its data can be
 * preloaded in the background while the user is idle. `shouldLoadData`
 * is true when the node is either in viewport OR has been granted a
 * prefetch ticket — callers use it to gate data fetches without delaying
 * rendering of the actual visualization (gated by `isInViewport`).
 */
export function useNodeInViewport(id?: string) {
  const scrollContainer = useScrollContainer();
  const { isPrinting } = usePrintContext();
  const prefetchQueue = usePrefetchQueue();

  const options = useMemo(
    () => ({
      root: scrollContainer,
      // 200% margin: IO fires when the card is up to 2 viewport heights
      // away from visible, giving React + ECharts time to mount before
      // the user can see the card during normal scrolling. Trade-off:
      // more visualizations stay mounted in the buffer, but bounded
      // (~5-8 cards in a typical doc).
      rootMargin: "200%",
      threshold: 0,
    }),
    [scrollContainer],
  );

  const { ref: ioRef, entry } = useIntersection(options);

  const elementRef = useRef<HTMLElement | null>(null);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      elementRef.current = el;
      ioRef(el);
    },
    [ioRef],
  );

  const ioIntersecting = entry?.isIntersecting ?? false;

  const subscribe = useCallback(
    (onChange: () => void) =>
      prefetchQueue ? prefetchQueue.subscribe(onChange) : noopSubscribe(),
    [prefetchQueue],
  );
  const hasPrefetchTicket = useSyncExternalStore(
    subscribe,
    () => (id != null && prefetchQueue ? prefetchQueue.hasTicket(id) : false),
    () => false,
  );
  const isForceVisible = useSyncExternalStore(
    subscribe,
    () =>
      id != null && prefetchQueue ? prefetchQueue.isForceVisible(id) : false,
    () => false,
  );

  const isInViewport = isPrinting || ioIntersecting || isForceVisible;

  const isInViewportRef = useRef(isInViewport);
  isInViewportRef.current = isInViewport;

  useEffect(() => {
    if (!prefetchQueue || id == null) {
      return;
    }
    return prefetchQueue.register({
      id,
      getElement: () => elementRef.current,
      isInViewport: () => isInViewportRef.current,
    });
  }, [prefetchQueue, id]);

  useEffect(() => {
    if (id != null && prefetchQueue) {
      prefetchQueue.notifyIntersectionState(id, ioIntersecting);
    } else {
      prefetchQueue?.notifyViewportChange();
    }
  }, [prefetchQueue, id, ioIntersecting, isPrinting]);

  const shouldLoadData = isInViewport || hasPrefetchTicket;

  return { ref, isInViewport, shouldLoadData };
}
