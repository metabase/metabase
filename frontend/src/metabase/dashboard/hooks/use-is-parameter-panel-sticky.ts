import { type RefObject, useEffect, useState } from "react";

export function useIsParameterPanelSticky({
  parameterPanelRef,
  disabled = false,
}: {
  parameterPanelRef: RefObject<HTMLElement>;
  disabled?: boolean;
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

    if (parameterPanelRef.current) {
      parameterPanelRef.current.insertBefore(
        sentinel,
        parameterPanelRef.current.firstChild,
      );
    }

    const settings: IntersectionObserverInit = {
      threshold: 0, // We only need to know when sentinel is out of view
    };

    const observer = new IntersectionObserver((entries) => {
      // Entries queue up oldest-first (e.g. during a window resize), so only the
      // last one reflects the current state
      const entry = entries[entries.length - 1];

      setIsStickyStateChanging(true);
      setIsSticky(isScrolledPastTop(entry));

      requestAnimationFrame(() => {
        setIsStickyStateChanging(false);
      });
    }, settings);

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      sentinel.remove();
    };
  }, [parameterPanelRef, disabled]);

  return {
    isSticky,
    isStickyStateChanging,
  } as const;
}

// The sentinel also leaves the viewport when it's below the fold (e.g. in a short
// window), but the sticky element is only stuck once the sentinel has scrolled up
// past the top.
function isScrolledPastTop(entry: IntersectionObserverEntry) {
  if (entry.isIntersecting) {
    return false;
  }

  const viewportBottom = entry.rootBounds?.bottom ?? window.innerHeight;
  return entry.boundingClientRect.top < viewportBottom;
}
