import type { FloatingPosition, PopoverProps } from "@mantine/core";
import { useCallback, useMemo, useState } from "react";

import { DEFAULT_POPOVER_MIDDLEWARES } from "./Popover.config";

type StablePopoverPositionProps = Required<
  Pick<PopoverProps, "position" | "middlewares" | "onClose">
>;

/**
 * Keeps a popover on the side it opened on until it closes, instead of flipping whenever its
 * content shrinks (e.g. while searching). Spread the result onto the `Popover`; a caller with its
 * own `onClose` needs to call this one too.
 */
// Mantine's `preventPositionChangeWhenVisible` can lock before the first flip resolves, and
// `onPositionChange` doesn't fire when it reopens on the same side, so read the placement from `size`,
// which runs after flip on every update.
export function useStablePopoverPosition(
  defaultPosition: FloatingPosition = "bottom",
): StablePopoverPositionProps {
  const [lockedPosition, setLockedPosition] = useState<FloatingPosition>();

  const middlewares = useMemo<StablePopoverPositionProps["middlewares"]>(
    () => ({
      ...DEFAULT_POPOVER_MIDDLEWARES,
      flip: lockedPosition === undefined,
      size: {
        ...DEFAULT_POPOVER_MIDDLEWARES.size,
        // a custom `apply` replaces Mantine's default sizing, so re-apply it
        apply: ({
          placement,
          rects,
          availableWidth,
          availableHeight,
          elements,
        }) => {
          Object.assign(elements.floating.style, {
            maxWidth: `${availableWidth}px`,
            maxHeight: `${availableHeight}px`,
          });
          // a `keepMounted` dropdown is still positioned while hidden, with no size
          const isVisible = rects.floating.height > 0;
          if (isVisible) {
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
