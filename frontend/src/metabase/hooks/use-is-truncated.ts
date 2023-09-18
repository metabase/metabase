import { useLayoutEffect, useRef, useState } from "react";

import resizeObserver from "metabase/lib/resize-observer";

export const useIsTruncated = <E extends Element>({
  skip = false,
}: { skip?: boolean } = {}) => {
  const ref = useRef<E | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || skip) {
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
  }, [skip]);

  return { isTruncated, ref };
};

const getIsTruncated = (element: Element): boolean => {
  return (
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth
  );
};
