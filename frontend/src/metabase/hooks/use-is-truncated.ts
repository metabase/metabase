import { useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import resizeObserver from "metabase/lib/resize-observer";

type UseIsTruncatedProps = {
  disabled?: boolean;
};

/** To avoid false positives, the text may exceed the container horizontally by
 * this many pixels without triggering ellipsification */
const HORIZONTAL_OVERFLOW_TOLERANCE = 0.01;

/** To avoid false positives, the text may exceed the container vertically by
 * this many pixels without triggering ellipsification. When vertical overflow
 * occurs, it happens because the text wraps to the next line. So the vertical
 * overflow tolerance can be larger than the horizontal one. */
const VERTICAL_OVERFLOW_TOLERANCE = 5;

export const useIsTruncated = <E extends Element>({
  disabled = false,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef<E | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || disabled) {
      return;
    }

    const handleResize = () => {
      setIsTruncated(getIsTruncated(element));
    };

    handleResize();
    resizeObserver.subscribe(element, handleResize);

    return () => {
      resizeObserver.unsubscribe(element, handleResize);
    };
  }, [disabled]);

  return { isTruncated, ref };
};

const getIsTruncated = (element: Element): boolean => {
  // Get the text node and its dimensions
  const range = document.createRange();
  range.selectNodeContents(element);
  const textRect = range.getBoundingClientRect();

  // Get the dimensions of the element containing the text
  const elementRect = element.getBoundingClientRect();

  // Calculate how much the text node overflows its container
  const verticalOverflow = textRect.height - elementRect.height;
  const horizOverflow = textRect.width - elementRect.width;

  // NOTE: To debug truncation, you can add something here like:
  // if (element.innerHTML.match(/Doohickey/g)) {
  //   console.log(horizOverflow);
  // }

  const isTextTooTall = verticalOverflow > VERTICAL_OVERFLOW_TOLERANCE;
  const isTextTooWide = horizOverflow > HORIZONTAL_OVERFLOW_TOLERANCE;
  return isTextTooTall || isTextTooWide;
};

export const useAreAnyTruncated = <E extends Element>({
  disabled = false,
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
        const isTruncated = getIsTruncated(element);
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
  }, [disabled]);

  const areAnyTruncated = [...truncationStatusByKey.values()].some(Boolean);
  return { areAnyTruncated, ref };
};
