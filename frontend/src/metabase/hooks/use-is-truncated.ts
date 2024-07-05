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

const cloneAndMeasure = (element: HTMLElement) => {
  const cloned = element.cloneNode(true);

  if (!(cloned instanceof HTMLElement)) {
    throw new Error();
  }

  cloned.style.textOverflow = "clip";
  cloned.style.position = "fixed";

  element.parentElement?.appendChild(cloned);
  const measured = cloned.getBoundingClientRect();
  element.parentElement?.removeChild(cloned);

  return measured;
};

const getIsTruncated = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  const realRect = cloneAndMeasure(element);
  const isTruncated =
    rect.width !== realRect.width || rect.height !== realRect.height;

  return isTruncated;
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
