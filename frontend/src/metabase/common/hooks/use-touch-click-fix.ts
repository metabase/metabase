import { useEffect, useRef } from "react";

import { isTouchDevice } from "metabase/lib/browser";

const TAP_THRESHOLD = 10;

/**
 * iOS Safari may not synthesize `mousedown`/`click` on the first tap when
 * the element is inside a container with certain CSS (overflow, transform).
 *
 * This hook attaches listeners to the given container that detect taps
 * (touch with < 10px movement) and dispatch a real `click` event.
 * Scrolls are not affected.
 *
 * @see https://github.com/facebook/react/issues/7635
 */
export function useTouchClickFix<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!isTouchDevice()) {
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);

      if (dx < TAP_THRESHOLD && dy < TAP_THRESHOLD) {
        e.preventDefault();
        e.target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchend", onTouchEnd);

    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return ref;
}
