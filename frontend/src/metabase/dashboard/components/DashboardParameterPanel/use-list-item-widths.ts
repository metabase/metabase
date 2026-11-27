import { type RefObject, useLayoutEffect, useState } from "react";
import _ from "underscore";

export interface ListItemWidths {
  itemWidths: number[];
  availableWidth: number;
  gap: number;
}

interface UseListItemWidthsOptions {
  listRef: RefObject<HTMLElement | null>;
  itemCount: number;
  isEnabled: boolean;
}

/**
 * The widths of a list's first `itemCount` children, the width they share and
 * the gap between them, kept up to date as they resize. `null` when disabled.
 * The list's width must not depend on its items, or hiding some shrinks it.
 */
export function useListItemWidths({
  listRef,
  itemCount,
  isEnabled,
}: UseListItemWidthsOptions): ListItemWidths | null {
  const [measurement, setMeasurement] = useState<ListItemWidths | null>(null);
  const measuredItemCount = measurement?.itemWidths.length;

  // `measuredItemCount` re-subscribes once the items render, which can be after the list
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!isEnabled || !list) {
      setMeasurement(null);
      return;
    }

    const measure = () => {
      const next = measureList(list, itemCount);
      setMeasurement((previous) =>
        _.isEqual(previous, next) ? previous : next,
      );
    };
    measure();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // Widgets resize as their values change, and the list as the window does
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    Array.from(list.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [listRef, itemCount, isEnabled, measuredItemCount]);

  return measurement;
}

function measureList(list: HTMLElement, itemCount: number): ListItemWidths {
  return {
    itemWidths: Array.from(list.children)
      .slice(0, itemCount)
      .map((child) => child.getBoundingClientRect().width),
    availableWidth: list.getBoundingClientRect().width,
    gap: parseFloat(getComputedStyle(list).columnGap) || 0,
  };
}
