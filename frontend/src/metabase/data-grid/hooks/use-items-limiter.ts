import { type RefObject, useEffect, useMemo, useState } from "react";

export interface UseItemsLimiterProps {
  containerRef: RefObject<HTMLElement | null>;
  dimension: "width" | "height";
  sizes: number[];
  isEnabled?: boolean;
  maxRatio?: number;
}

export const useItemsLimiter = ({
  containerRef,
  dimension,
  sizes,
  maxRatio = 0.5,
  isEnabled = false,
}: UseItemsLimiterProps): number => {
  const [containerSize, setContainerSize] = useState<number | null>(null);

  /**
   * DataGrid is rendered conditionally and containerRef.current is not stable.
   * It should be stable, but it'd require a refactoring in TableInteractive and in other components.
   * So we need this hack instead. It relies on the fact that someone outside is going to trigger re-render.
   * It does now, but it's kinda fragile and that's why it's a hack.
   */
  const [element, setElement] = useState<HTMLElement | null>(null);
  const currentElement = containerRef.current;
  if (currentElement !== element) {
    setElement(currentElement);
  }

  useEffect(() => {
    if (!element) {
      return;
    }
    const measure = () => {
      const size = element.getBoundingClientRect()[dimension];
      setContainerSize(size);
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [element, dimension]);

  return useMemo(() => {
    if (isEnabled || containerSize === null) {
      return sizes.length;
    }
    return computeEffectiveCount(sizes, containerSize, maxRatio);
  }, [isEnabled, sizes, containerSize, maxRatio]);
};

const computeEffectiveCount = (
  sizes: number[],
  availableSpace: number,
  maxRatio: number,
): number => {
  let total = 0;
  for (let i = 0; i < sizes.length; i++) {
    total += sizes[i];
    if (total > availableSpace * maxRatio) {
      return i;
    }
  }
  return sizes.length;
};
