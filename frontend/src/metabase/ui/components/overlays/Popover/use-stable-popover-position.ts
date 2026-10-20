import type { FloatingPosition, PopoverProps } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";

import { DEFAULT_POPOVER_MIDDLEWARES } from "./Popover.config";

type StablePopoverPositionProps = Required<
  Pick<PopoverProps, "position" | "middlewares" | "onClose">
>;

/**
 * Keeps a popover on the side it opened on until it closes, even when its content shrinks (e.g.
 * while searching) or grows. If it grows past the space on that side, it scrolls instead of moving.
 * Spread the result onto the `Popover`; a caller with its own `onClose` needs to call this one too.
 */
export function useStablePopoverPosition(
  defaultPosition: FloatingPosition = "bottom",
): StablePopoverPositionProps {
  const [lockedPosition, setLockedPosition] = useState<FloatingPosition>();

  const middlewares = useMemo<StablePopoverPositionProps["middlewares"]>(
    () => ({
      ...DEFAULT_POPOVER_MIDDLEWARES,
      flip: lockedPosition === undefined,
      // Mantine's `preventPositionChangeWhenVisible` can lock before the first flip resolves, and
      // `onPositionChange` doesn't fire when it reopens on the same side, so lock from `size` instead.
      size: {
        ...DEFAULT_POPOVER_MIDDLEWARES.size,
        apply: ({
          placement,
          rects,
          availableWidth,
          availableHeight,
          elements,
        }) => {
          // A custom `apply` replaces Mantine's default sizing, so cap the size ourselves
          Object.assign(elements.floating.style, {
            maxWidth: `${availableWidth}px`,
            maxHeight: `${availableHeight}px`,
          });
          // A `keepMounted` dropdown is still positioned while hidden, with no size
          const hasBeenMeasured = rects.floating.height > 0;
          if (hasBeenMeasured) {
            setLockedPosition((position) => position ?? placement);
          }
        },
      },
    }),
    [lockedPosition],
  );

  const onClose = useCallback(() => setLockedPosition(undefined), []);

  return {
    position: lockedPosition ?? defaultPosition,
    middlewares,
    onClose,
  };
}
