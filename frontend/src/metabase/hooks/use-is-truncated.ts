import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import { callLater, callNow } from "metabase/common/utils/lazy";
import resizeObserver from "metabase/lib/resize-observer";

type UseIsTruncatedProps = {
  disabled?: boolean;
  /** To avoid rounding errors, we can require that the truncation is at least a certain number of pixels */
  tolerance?: number;
  /** If true, will perform key operations only during the browser's idle period */
  lazy?: boolean;
};

export const useIsTruncated = <E extends Element>({
  disabled = false,
  tolerance = 0,
  lazy = false,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef<E | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const call = lazy ? callLater : callNow;

  useEffect(
    function startCheckingOnResize() {
      const element = ref.current;

      if (!element || disabled) {
        return;
      }

      const handleResize = () => {
        call(() => {
          setIsTruncated(getIsTruncated(element, tolerance));
        });
      };

      handleResize();
      () => resizeObserver.subscribe(element, handleResize);
      return () => {
        resizeObserver.unsubscribe(element, handleResize);
      };
    },
    [disabled, tolerance, call],
  );

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
  lazy = false,
}: UseIsTruncatedProps = {}) => {
  const ref = useRef(new Map<string, E>());
  const [truncationStatusByKey, setTruncationStatusByKey] = useState<
    Map<string, boolean>
  >(new Map());

  const call = lazy ? callLater : callNow;

  useEffect(
    function startCheckingOnResize() {
      const elementsMap = ref.current;

      if (!elementsMap.size || disabled) {
        return;
      }
      const unsubscribeFns: (() => void)[] = [];

      elementsMap.forEach((element, elementKey) => {
        const handleResize = () => {
          call(() => {
            const isTruncated = getIsTruncated(element, tolerance);
            setTruncationStatusByKey(statuses => {
              const newStatuses = new Map(statuses);
              newStatuses.set(elementKey, isTruncated);
              return newStatuses;
            });
          });
        };
        const handleResizeDebounced = _.debounce(handleResize, 200);
        call(() => resizeObserver.subscribe(element, handleResizeDebounced));
        unsubscribeFns.push(() =>
          resizeObserver.unsubscribe(element, handleResizeDebounced),
        );
      });

      return () => {
        unsubscribeFns.forEach(fn => fn());
      };
    },
    [disabled, tolerance, call],
  );

  const areAnyTruncated = [...truncationStatusByKey.values()].some(Boolean);
  return { areAnyTruncated, ref };
};
