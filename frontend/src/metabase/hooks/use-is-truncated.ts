import { useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

import resizeObserver from "metabase/lib/resize-observer";

type UseIsTruncatedProps = {
  disabled?: boolean;
  /** To avoid rounding errors, we can require that the truncation is at least a certain number of pixels */
  tolerance?: number;
};

export const useIsTruncated = <E extends HTMLElement>({
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

export const useAreAnyTruncated = <E extends HTMLElement>({
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
        setTruncationStatusByKey(statuses => {
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
      unsubscribeFns.forEach(fn => fn());
    };
  }, [disabled]);

  const areAnyTruncated = [...truncationStatusByKey.values()].some(Boolean);
  return { areAnyTruncated, ref };
};

const getIsTruncated = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const untruncatedRect = getUntruncatedBoundingClientRect(element);
  const isWidthTruncated = rect.width < untruncatedRect.width;
  const isHeightTruncated = rect.height < untruncatedRect.height;
  const isTruncated = isWidthTruncated || isHeightTruncated;

  return isTruncated;
};

const getUntruncatedBoundingClientRect = (element: HTMLElement): DOMRect => {
  const cloned = element.cloneNode(true);

  if (!(cloned instanceof HTMLElement)) {
    // this should never happen
    throw new Error("Cloned HTMLElement is not an HTMLElement");
  }

  cloned.style.textOverflow = "clip"; // disable ellipsis
  cloned.style.position = "absolute"; // remove element from the flow
  cloned.style.display = "inline-block"; // take only as much space as needed
  cloned.style.visibility = "hidden"; // prevent user from seeing this element
  // allow overflow
  cloned.style.width = "auto";
  cloned.style.height = "auto";
  cloned.style.maxWidth = "none";
  cloned.style.maxHeight = "none";

  const originalPosition = element.style.position;
  element.style.position = "relative";
  element.appendChild(cloned); // temporarily add element to the DOM so it can be measured
  const rect = cloned.getBoundingClientRect(); // measure it
  element.removeChild(cloned); // remove it from the DOM
  element.style.position = originalPosition;

  return rect;
};
