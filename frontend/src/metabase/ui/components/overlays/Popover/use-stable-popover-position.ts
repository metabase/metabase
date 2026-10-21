import type { FloatingPosition, PopoverProps } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_POPOVER_MIDDLEWARES } from "./Popover.config";

type StablePopoverPositionProps = Required<
  Pick<PopoverProps, "position" | "middlewares" | "onClose">
>;

/**
 * Keeps a popover on the side it opened on until it closes, even when its content shrinks (e.g.
 * while searching) or grows. If it grows past the space on that side, it becomes scrollable instead of moving.
 * Scrolling the page or resizing the window repositions it as usual.
 */
export function useStablePopoverPosition(
  defaultPosition: FloatingPosition = "bottom",
): StablePopoverPositionProps {
  const [currentPosition, setCurrentPosition] = useState<FloatingPosition>();
  // Mirrors `currentPosition`, but changes straight away rather than on the next render
  const currentPositionRef = useRef<FloatingPosition>();
  const floatingRef = useRef<HTMLElement | null>(null);

  const rememberPosition = useCallback((position?: FloatingPosition) => {
    currentPositionRef.current = position;
    setCurrentPosition(position);
  }, []);

  const middlewares = useMemo<StablePopoverPositionProps["middlewares"]>(
    () => ({
      ...DEFAULT_POPOVER_MIDDLEWARES,
      // Mantine's `onPositionChange` doesn't fire when it reopens on the same side, so read the
      // placement from `size`, which runs after flip on every update
      size: {
        ...DEFAULT_POPOVER_MIDDLEWARES.size,
        apply: ({
          placement,
          initialPlacement,
          rects,
          availableWidth,
          availableHeight,
          elements,
        }) => {
          floatingRef.current = elements.floating;
          // A custom `apply` replaces Mantine's default sizing, so cap the size ourselves.
          Object.assign(elements.floating.style, {
            maxWidth: `${availableWidth}px`,
            maxHeight: `${availableHeight}px`,
          });
          // A `keepMounted` dropdown is still positioned while hidden, with no size
          const hasBeenMeasured = rects.floating.height > 0;
          const isStale =
            initialPlacement !==
            (currentPositionRef.current ?? defaultPosition);
          if (hasBeenMeasured && !isStale) {
            rememberPosition(placement);
          }
        },
      },
    }),
    [defaultPosition, rememberPosition],
  );

  useEffect(() => {
    const resetPreferredSide = (event: Event) => {
      const isInsidePopover =
        event.target instanceof Node &&
        floatingRef.current?.contains(event.target);
      if (!isInsidePopover) {
        rememberPosition(undefined);
      }
    };

    window.addEventListener("resize", resetPreferredSide);
    document.addEventListener("scroll", resetPreferredSide, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("resize", resetPreferredSide);
      document.removeEventListener("scroll", resetPreferredSide, {
        capture: true,
      });
    };
  }, [rememberPosition]);

  const onClose = useCallback(
    () => rememberPosition(undefined),
    [rememberPosition],
  );

  return {
    position: currentPosition ?? defaultPosition,
    middlewares,
    onClose,
  };
}
