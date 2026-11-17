import { useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import type { LegendTitle } from "metabase/visualizations/components/types";

type LegendOverflowAxis = "vertical" | "horizontal";

const AXIS_EDGES = {
  vertical: { start: "top", end: "bottom", extent: "height" },
  horizontal: { start: "left", end: "right", extent: "width" },
} as const satisfies Record<
  LegendOverflowAxis,
  { start: keyof DOMRect; end: keyof DOMRect; extent: keyof DOMRect }
>;

interface UseLegendOverflowOptions {
  titles: LegendTitle[];
  minVisibleCount: number;
  axis: LegendOverflowAxis;
  isEnabled?: boolean;
}

/**
 * Measures how many legend items overflow the container along `axis`.
 * `visibleCount` is how many leading items to render, leaving one slot for the
 * overflow label but never fewer than `minVisibleCount`. New titles discard the
 * previous measurement. A disabled hook measures nothing and shows every item.
 */
export function useLegendOverflow({
  titles,
  minVisibleCount,
  axis,
  isEnabled = true,
}: UseLegendOverflowOptions) {
  const itemCount = titles.length;
  const [overflowCount, setOverflowCount] = useState(0);
  const [size, setSize] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLOListElement>(null);
  const itemRefs = useRef<Record<number, HTMLLIElement | null>>({});
  const prevOverflowCountRef = useRef(overflowCount);
  const prevItemsKeyRef = useRef<string | null>(null);

  // Runs after every render because the container can resize without any
  // prop or state change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!isEnabled || !container) {
      return;
    }

    const prevOverflowCount = prevOverflowCountRef.current;
    prevOverflowCountRef.current = overflowCount;
    const itemsKey = JSON.stringify(titles);
    const prevItemsKey = prevItemsKeyRef.current;
    prevItemsKeyRef.current = itemsKey;

    const { start, end, extent } = AXIS_EDGES[axis];
    const containerRect = container.getBoundingClientRect();

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
      return;
    }

    // only a full render, with no items folded, can be measured
    if (overflowCount > 0) {
      return;
    }

    const measuredOverflowCount = _.range(itemCount).filter((index) => {
      const itemRect = itemRefs.current[index]?.getBoundingClientRect();
      return (
        itemRect != null &&
        (containerRect[start] > itemRect[start] ||
          containerRect[end] < itemRect[end])
      );
    }).length;
    if (measuredOverflowCount > 0) {
      setOverflowCount(measuredOverflowCount);
      setSize(containerRect);
    }
  });

  const activeOverflowCount = isEnabled ? overflowCount : 0;
  const visibleCount =
    activeOverflowCount > 0
      ? Math.max(itemCount - activeOverflowCount - 1, minVisibleCount)
      : itemCount;

  return {
    overflowCount: activeOverflowCount,
    visibleCount,
    containerRef,
    itemRefs,
  };
}
