import { useLayoutEffect, useRef, useState } from "react";

type LegendOverflowAxis = "vertical" | "horizontal";

const AXIS_EDGES = {
  vertical: { start: "top", end: "bottom", extent: "height" },
  horizontal: { start: "left", end: "right", extent: "width" },
} as const satisfies Record<
  LegendOverflowAxis,
  { start: keyof DOMRect; end: keyof DOMRect; extent: keyof DOMRect }
>;

interface UseLegendOverflowOptions {
  itemCount: number;
  itemsKey: string;
  minVisibleCount: number;
  axis: LegendOverflowAxis;
  isEnabled?: boolean;
}

/**
 * Measures how many legend items overflow the container along `axis`.
 * `visibleCount` is how many leading items to render, leaving one slot for the
 * overflow label but never fewer than `minVisibleCount`. A new `itemsKey`
 * discards the previous measurement.
 */
export function useLegendOverflow({
  itemCount,
  itemsKey,
  minVisibleCount,
  axis,
  isEnabled = true,
}: UseLegendOverflowOptions) {
  const [overflowCount, setOverflowCount] = useState(0);
  const [size, setSize] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const prevOverflowCountRef = useRef(overflowCount);
  const prevItemsKeyRef = useRef(itemsKey);
  const { start, end, extent } = AXIS_EDGES[axis];

  // Runs after every render because the container can resize without any
  // prop or state change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const prevOverflowCount = prevOverflowCountRef.current;
    prevOverflowCountRef.current = overflowCount;
    const prevItemsKey = prevItemsKeyRef.current;
    prevItemsKeyRef.current = itemsKey;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!isEnabled || !containerRect) {
      return;
    }

    // check only the extent along the axis, the other one may fluctuate depending on the browser causing an infinite loop
    // check overflowCount, because after setting overflowCount the extent changes and it causing an infinite loop too
    const isResized =
      size != null &&
      containerRect[extent] !== size[extent] &&
      prevOverflowCount === overflowCount;
    // a count measured for other items is stale even when the container keeps its size
    const hasStaleCount = overflowCount > 0 && itemsKey !== prevItemsKey;
    if (isResized || hasStaleCount) {
      setOverflowCount(0);
      setSize(containerRect);
    } else if (overflowCount === 0) {
      let currentOverflowCount = 0;
      for (let i = 0; i < itemCount; i++) {
        const itemRect = itemRefs.current[i]?.getBoundingClientRect();
        if (
          itemRect &&
          (containerRect[start] > itemRect[start] ||
            containerRect[end] < itemRect[end])
        ) {
          currentOverflowCount++;
        }
      }
      if (currentOverflowCount !== overflowCount) {
        setOverflowCount(currentOverflowCount);
        setSize(containerRect);
      }
    }
  });

  const enabledOverflowCount = isEnabled ? overflowCount : 0;
  const visibleCount =
    enabledOverflowCount > 0
      ? Math.max(itemCount - enabledOverflowCount - 1, minVisibleCount)
      : itemCount;

  return {
    overflowCount: enabledOverflowCount,
    visibleCount,
    containerRef,
    itemRefs,
  };
}
