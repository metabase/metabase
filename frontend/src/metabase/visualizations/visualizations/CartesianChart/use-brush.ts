import type { EChartsType } from "echarts/core";
import {
  type MutableRefObject,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { isTouchDevice } from "metabase/utils/browser";

const LONG_PRESS_DURATION_MS = 500;
const TOUCH_MOVE_THRESHOLD_PX = 10;

type Point = { x: number; y: number };

export const hasMovedBeyondThreshold = (
  start: Point,
  current: Point,
  threshold = TOUCH_MOVE_THRESHOLD_PX,
) => {
  const dx = current.x - start.x;
  const dy = current.y - start.y;

  return dx * dx + dy * dy > threshold * threshold;
};

export const createZrenderMousedownEvent = (
  point: Point,
  containerRect: DOMRect,
) => ({
  offsetX: point.x - containerRect.left,
  offsetY: point.y - containerRect.top,
  target: null,
  event: {
    preventDefault: () => {},
  },
});

const addPointerListeners = (
  el: HTMLElement,
  listeners: Record<string, (e: PointerEvent) => void>,
) => {
  for (const [event, handler] of Object.entries(listeners)) {
    el.addEventListener(event, handler as EventListener);
  }

  return () => {
    for (const [event, handler] of Object.entries(listeners)) {
      el.removeEventListener(event, handler as EventListener);
    }
  };
};

/**
 * Manages brush (range selection) for cartesian charts.
 *
 * Delegates to `useDesktopBrush` or `useTouchBrush` depending on device.
 */
export const useBrush = (
  chartRef: MutableRefObject<EChartsType | undefined>,
  containerRef: RefObject<HTMLDivElement>,
  canBrushChart: boolean,
  isBrushable: boolean,
  // ECharts option object — used as a signal dep to re-enable brush after
  // chart model changes (ECharts resets the cursor state on re-render).
  option?: unknown,
) => {
  const isTouch = useRef(isTouchDevice()).current;

  const enableBrush = useCallback(() => {
    chartRef.current?.dispatchAction({
      type: "takeGlobalCursor",
      key: "brush",
      brushOption: { brushType: "lineX", brushMode: "single" },
    });
  }, [chartRef]);

  const disableBrush = useCallback(() => {
    chartRef.current?.dispatchAction({ type: "takeGlobalCursor" });
  }, [chartRef]);

  useDesktopBrush({ isTouch, isBrushable, enableBrush, disableBrush, option });
  useTouchBrush({
    chartRef,
    containerRef,
    isTouch,
    canBrushChart,
    enableBrush,
    disableBrush,
  });
};

/** Desktop: brush is always on while `isBrushable` is true. */
function useDesktopBrush({
  isTouch,
  isBrushable,
  enableBrush,
  disableBrush,
  option,
}: {
  isTouch: boolean;
  isBrushable: boolean;
  enableBrush: () => void;
  disableBrush: () => void;
  option?: unknown;
}) {
  useEffect(() => {
    if (isTouch) {
      return;
    }

    const timeout = setTimeout(() => {
      if (isBrushable) {
        enableBrush();
      } else {
        disableBrush();
      }
    }, 0);

    return () => clearTimeout(timeout);
  }, [isBrushable, isTouch, enableBrush, disableBrush, option]);
}

/**
 * Touch: long press activates brush for a single gesture.
 * The user continues dragging horizontally to select a range, and brush
 * is deactivated on pointer up.
 */
function useTouchBrush({
  chartRef,
  containerRef,
  isTouch,
  canBrushChart,
  enableBrush,
  disableBrush,
}: {
  chartRef: MutableRefObject<EChartsType | undefined>;
  containerRef: RefObject<HTMLDivElement>;
  isTouch: boolean;
  canBrushChart: boolean;
  enableBrush: () => void;
  disableBrush: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const startRef = useRef<Point | null>(null);
  const activeRef = useRef(false);

  // Track container element via state so the effect re-runs once when the
  // ref becomes available (ExplicitSize hasn't measured on first render).
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally no deps: syncs ref → state on every render
  useEffect(() => {
    const container = containerRef.current;

    if (container && container !== containerEl) {
      setContainerEl(container);
    }
  });

  useEffect(() => {
    if (!containerEl || !canBrushChart || !isTouch) {
      return;
    }

    disableBrush();

    // Prevent selection highlight, callout, and tap highlight on long-press.
    // Applied as inline styles so only brushable charts on touch are affected.
    // Save originals to restore on cleanup.
    const svg = containerEl.querySelector("svg");

    // Removes highlight on tap on android
    containerEl.style.setProperty("-webkit-tap-highlight-color", "transparent");

    // Removes text selection on long tap
    svg?.style.setProperty("user-select", "none");
    svg?.style.setProperty("-webkit-user-select", "none");
    svg?.style.setProperty("-webkit-touch-callout", "none");

    const cancel = () => {
      clearTimeout(timerRef.current);

      timerRef.current = undefined;
      startRef.current = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      // A second finger means pinch-to-zoom, not a long press.
      // Cancel whether the timer is still pending or brush is already active.
      if (!event.isPrimary) {
        cancel();

        if (activeRef.current) {
          activeRef.current = false;
          // Defer so ECharts finishes processing the current pointer event
          // before we yank brush mode away. Without this, ECharts can get
          // stuck with brush enabled after both fingers are released.
          setTimeout(disableBrush, 0);
        }

        return;
      }

      if (activeRef.current) {
        return;
      }

      startRef.current = { x: event.clientX, y: event.clientY };

      timerRef.current = setTimeout(() => {
        activeRef.current = true;
        enableBrush();

        // Trigger mousedown directly on zrender's internal event bus.
        // BrushController missed the real pointerdown (brush wasn't enabled
        // yet), so we feed it the start position to anchor the selection.
        const zrender = chartRef.current?.getZr();

        if (zrender && startRef.current) {
          zrender.trigger(
            "mousedown",
            createZrenderMousedownEvent(
              startRef.current,
              containerEl.getBoundingClientRect(),
            ),
          );
        }
      }, LONG_PRESS_DURATION_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!startRef.current || activeRef.current) {
        return;
      }

      if (hasMovedBeyondThreshold(startRef.current, event)) {
        cancel();
      }
    };

    const onPointerEnd = () => {
      cancel();

      if (activeRef.current) {
        activeRef.current = false;

        // ECharts processes pointerup synchronously through its DOM handler
        // chain (zrender pointerup → mouseup → brush end). All of this runs
        // in the current microtask before any setTimeout(0) callback fires,
        // so deferring by one macrotask is enough to guarantee brushEnd has
        // already completed.
        setTimeout(disableBrush, 0);
      }
    };

    // Prevent browser scroll ONLY when brush is active (after long-press).
    // Must be non-passive to allow preventDefault(). Before the long-press
    // fires, touchmove is not prevented and the browser scrolls normally.
    const onTouchMove = (e: TouchEvent) => {
      if (activeRef.current) {
        e.preventDefault();
      }
    };
    containerEl.addEventListener("touchmove", onTouchMove, { passive: false });

    const removeListeners = addPointerListeners(containerEl, {
      pointerdown: onPointerDown,
      pointermove: onPointerMove,
      pointerup: onPointerEnd,
      pointercancel: onPointerEnd,
    });

    return () => {
      cancel();
      removeListeners();

      containerEl.style.setProperty("-webkit-tap-highlight-color", "none");
      svg?.style.setProperty("user-select", "none");
      svg?.style.setProperty("-webkit-user-select", "none");
      svg?.style.setProperty("-webkit-touch-callout", "none");
    };
  }, [
    containerEl,
    chartRef,
    canBrushChart,
    isTouch,
    enableBrush,
    disableBrush,
  ]);
}
