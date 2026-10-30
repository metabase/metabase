import { useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import resizeObserver from "metabase/utils/resize-observer";

type UseIsTruncatedProps = {
  disabled?: boolean;
  ignoreHeightTruncation?: boolean;
  /** Pixels the content may overflow before it counts as truncated. */
  tolerancePx?: number;
};

export const useIsTruncated = <E extends Element>({
  disabled = false,
  ignoreHeightTruncation = false,
  tolerancePx = 0,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef<E | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || disabled) {
      return;
    }

    const handleResize = () => {
      setIsTruncated(
        getIsTruncated(element, ignoreHeightTruncation, tolerancePx),
      );
    };

    handleResize();
    resizeObserver.subscribe(element, handleResize);

    return () => {
      resizeObserver.unsubscribe(element, handleResize);
    };
  }, [disabled, ignoreHeightTruncation, tolerancePx]);

  return { isTruncated, ref };
};

const getIsTruncated = (
  element: Element,
  ignoreHeightTruncation = false,
  tolerancePx = 0,
): boolean => {
  const range = document.createRange();
  range.selectNodeContents(element);
  const elementRect = element.getBoundingClientRect();
  const rangeRect = range.getBoundingClientRect();
  const isWidthTruncated = rangeRect.width > elementRect.width + tolerancePx;

  if (ignoreHeightTruncation) {
    return isWidthTruncated;
  }

  return (
    rangeRect.height > elementRect.height + tolerancePx || isWidthTruncated
  );
};

export const useAreAnyTruncated = <E extends Element>({
  disabled = false,
  ignoreHeightTruncation = false,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef(new Map<string, E>());
  const [truncationStatusByKey, setTruncationStatusByKey] = useState<
    Map<string, boolean>
  >(new Map());

  useLayoutEffect(() => {
    const elementsMap = ref.current;

    if (!elementsMap.size || disabled) {
      return;
    }
    const unsubscribeFns: (() => void)[] = [];

    [...elementsMap.entries()].forEach(([elementKey, element]) => {
      const handleResize = () => {
        const isTruncated = getIsTruncated(element, ignoreHeightTruncation);
        setTruncationStatusByKey((statuses) => {
          const newStatuses = new Map(statuses);
          newStatuses.set(elementKey, isTruncated);
          return newStatuses;
        });
      };
      const handleResizeDebounced = _.debounce(handleResize, 200);
      resizeObserver.subscribe(element, handleResizeDebounced);
      unsubscribeFns.push(() =>
        resizeObserver.unsubscribe(element, handleResizeDebounced),
      );
    });

    return () => {
      unsubscribeFns.forEach((fn) => fn());
    };
  }, [disabled, ignoreHeightTruncation]);

  const areAnyTruncated = [...truncationStatusByKey.values()].some(Boolean);
  return { areAnyTruncated, ref };
};
