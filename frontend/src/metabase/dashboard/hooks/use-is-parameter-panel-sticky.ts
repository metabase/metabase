import { useEffect, useRef, useState } from "react";

export function useIsParameterPanelSticky() {
  const intersectionObserverTargetRef = useRef<HTMLElement>(null);
  const [isSticky, setIsSticky] = useState(false);
  const [isStickyStateChanging, setIsStickyStateChanging] = useState(false);

  useEffect(() => {
    if (
      intersectionObserverTargetRef.current &&
      // Allow this hook in tests, since Node don't have access to some Browser APIs
      typeof IntersectionObserver !== "undefined"
    ) {
      const settings: IntersectionObserverInit = {
        threshold: 1,
      };
      const observer = new IntersectionObserver(([entry]) => {
        setIsStickyStateChanging(true);

        setIsSticky(entry.intersectionRatio < 1);

        requestAnimationFrame(() => {
          setIsStickyStateChanging(false);
        });
      }, settings);
      observer.observe(intersectionObserverTargetRef.current);

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  return {
    isSticky,
    isStickyStateChanging,
    intersectionObserverTargetRef,
  } as const;
}
