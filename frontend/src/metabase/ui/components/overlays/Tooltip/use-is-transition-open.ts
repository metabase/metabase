import type { TransitionOverride } from "@mantine/core";
import { useMemo, useState } from "react";

/**
 * Tracks whether the tooltip is shown or fading in. Returns transition props
 * to pass on to Mantine, which still call any `onEnter`/`onExit` given.
 * Stays `false` for a tooltip that mounts already open.
 */
export function useIsTransitionOpen(
  transitionProps: TransitionOverride | undefined,
) {
  const [isOpen, setIsOpen] = useState(false);
  const resolvedTransitionProps = useMemo(
    () => ({
      ...transitionProps,
      onEnter: () => {
        setIsOpen(true);
        transitionProps?.onEnter?.();
      },
      onExit: () => {
        setIsOpen(false);
        transitionProps?.onExit?.();
      },
    }),
    [transitionProps],
  );
  return { isOpen, transitionProps: resolvedTransitionProps };
}
