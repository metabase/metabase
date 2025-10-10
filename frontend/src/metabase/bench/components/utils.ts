import { useCallback, useLayoutEffect, useState } from "react";
import _ from "underscore";

/**
 * react-resizable-panels sizes are in percentages,
 * but we want to be able to specify some sizes in fixed pixel terms
 */
export const useAbsoluteSize = ({ groupId }: { groupId: string }) => {
  const [width, setWidth] = useState(1200);

  useLayoutEffect(() => {
    const panelGroup = document.querySelector(
      `[data-panel-group-id="${groupId}"]`,
    ) as HTMLElement | null;
    if (!panelGroup) {
      return;
    }

    const debouncedSetWidth = _.debounce(setWidth, 250);

    const observer = new ResizeObserver(() => {
      const { width } = panelGroup.getBoundingClientRect();
      debouncedSetWidth(width);
    });

    observer.observe(panelGroup);

    return () => {
      observer.disconnect();
    };
  }, [groupId]);

  const getSizeFn = useCallback((px: number) => (px / width) * 100, [width]);

  return getSizeFn;
};
