import { useCallback, useRef, useState } from "react";

const SDK_MOBILE_BREAKPOINT = 640;

export function useMobileLayout() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();

    if (node) {
      const observer = new ResizeObserver(([entry]) => {
        setWidth(entry.contentBoxSize[0].inlineSize);
      });
      observer.observe(node);
      observerRef.current = observer;
    }
  }, []);

  const isMobile = width > 0 && width < SDK_MOBILE_BREAKPOINT;

  return { ref, isMobile };
}
