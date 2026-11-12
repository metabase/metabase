import { getOverflowAncestors } from "@floating-ui/dom";
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
  const [isOpen, setIsOpen] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<FloatingPosition>();
  // Mirrors `currentPosition`, but changes straight away rather than on the next render
  const currentPositionRef = useRef<FloatingPosition | undefined>(undefined);
  const referenceRef = useRef<Element | null>(null);

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
          referenceRef.current =
            elements.reference instanceof Element ? elements.reference : null;
          // A custom `apply` replaces Mantine's default sizing, so cap the size ourselves.
          Object.assign(elements.floating.style, {
            maxWidth: `${availableWidth}px`,
            maxHeight: `${availableHeight}px`,
          });
          // A `keepMounted` dropdown is still positioned while hidden, with no size, and an update
          // can finish just after the popover has closed and been removed
          const isOnScreen =
            rects.floating.height > 0 && elements.floating.isConnected;
          if (!isOnScreen) {
            return;
          }
          setIsOpen(true);
          const isStale =
            initialPlacement !==
            (currentPositionRef.current ?? defaultPosition);
          if (!isStale) {
            rememberPosition(placement);
          }
        },
      },
    }),
    [defaultPosition, rememberPosition],
  );

  useEffect(() => {
    const reference = referenceRef.current;
    if (!isOpen || !reference) {
      return;
    }

    const resetPreferredSide = () => rememberPosition(undefined);
    const scrollAncestors = getOverflowAncestors(reference);

    window.addEventListener("resize", resetPreferredSide);
    scrollAncestors.forEach((ancestor) =>
      ancestor.addEventListener("scroll", resetPreferredSide, {
        passive: true,
      }),
    );
    return () => {
      window.removeEventListener("resize", resetPreferredSide);
      scrollAncestors.forEach((ancestor) =>
        ancestor.removeEventListener("scroll", resetPreferredSide),
      );
    };
  }, [isOpen, rememberPosition]);

  const onClose = useCallback(() => {
    setIsOpen(false);
    rememberPosition(undefined);
  }, [rememberPosition]);

  return {
    position: currentPosition ?? defaultPosition,
    middlewares,
    onClose,
  };
}
