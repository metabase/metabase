import { useLayoutEffect, useRef, useState } from "react";
import _ from "underscore";

// import resizeObserver from "metabase/lib/resize-observer";

type UseIsTruncatedProps = {
  disabled?: boolean;
  /** To avoid rounding errors, we can require that the truncation is at least a certain number of pixels */
  tolerance?: number;
};

export const useIsTruncated = <E extends Element>({
  disabled = false,
  tolerance = 0,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef<E | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || disabled) {
      return;
    }

    const handleResize = () => {
      setIsTruncated(getIsTruncated(element, tolerance));
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.unobserve(element);
    };
  }, [disabled, tolerance]);

  return { isTruncated, ref };
};

const getIsTruncated = (element: Element, tolerance: number): boolean => {
  return (
    element.scrollHeight > element.clientHeight + tolerance ||
    element.scrollWidth > element.clientWidth + tolerance
  );
};

export const useAreAnyTruncated = <E extends Element>({
  disabled = false,
  tolerance = 0,
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
        const isTruncated = getIsTruncated(element, tolerance);
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
  }, [disabled, tolerance]);

  const areAnyTruncated = [...truncationStatusByKey.values()].some(Boolean);
  return { areAnyTruncated, ref };
};
