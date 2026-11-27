import { type RefObject, useLayoutEffect, useState } from "react";
import _ from "underscore";

import resizeObserver from "metabase/utils/resize-observer";

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

  // `measuredItemCount` measures again before paint once the items render, which can be after the list
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

    // Widgets resize as their values change, and the list as the window does
    let observedElements: Element[] = [];
    const unobserveAll = () =>
      observedElements.forEach((element) =>
        resizeObserver.unsubscribe(element, measure),
      );
    const observeListAndItems = () => {
      unobserveAll();
      observedElements = [list, ...Array.from(list.children)];
      observedElements.forEach((element) =>
        resizeObserver.subscribe(element, measure),
      );
    };
    observeListAndItems();

    // Widgets can be swapped for others without their count changing, like on a tab switch
    const mutationObserver = new MutationObserver(observeListAndItems);
    mutationObserver.observe(list, { childList: true });

    return () => {
      mutationObserver.disconnect();
      unobserveAll();
    };
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
