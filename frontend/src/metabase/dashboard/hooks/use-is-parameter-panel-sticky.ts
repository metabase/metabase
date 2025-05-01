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

    // Create a sentinel element to place right before our sticky element
    const sentinel = document.createElement("div");
    sentinel.style.height = "1px";
    sentinel.style.width = "100%";
    sentinel.style.position = "absolute";
    sentinel.style.top = "0";
    sentinel.style.visibility = "hidden";

    // Insert sentinel before the parent of our sticky element
    const parent = parameterPanelRef.current.parentElement;
    if (parent) {
      parent.insertBefore(sentinel, parameterPanelRef.current);
    }

    const settings: IntersectionObserverInit = {
      threshold: 0, // We only need to know when sentinel is out of view
    };

    const observer = new IntersectionObserver(([entry]) => {
      setIsStickyStateChanging(true);

      // If sentinel is not intersecting viewport, sticky element is stuck
      setIsSticky(!entry.isIntersecting);

      requestAnimationFrame(() => {
        setIsStickyStateChanging(false);
      });
    }, settings);

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, [parameterPanelRef]);

  return {
    isSticky,
    isStickyStateChanging,
  } as const;
}
