import { type RefObject, useEffect, useState } from "react";

export function useIsParameterPanelSticky({
  parameterPanelRef,
}: {
  parameterPanelRef: RefObject<HTMLElement>;
}) {
  const [isSticky, setIsSticky] = useState(false);
  const [isStickyStateChanging, setIsStickyStateChanging] = useState(false);

  useEffect(() => {
    if (
      !parameterPanelRef.current ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

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
    observer.observe(parameterPanelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [parameterPanelRef]);

  return {
    isSticky,
    isStickyStateChanging,
  } as const;
}
