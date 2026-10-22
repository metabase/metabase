import type { TransitionOverride } from "@mantine/core";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

type TooltipPhase = "closed" | "entering" | "open" | "exiting";

let activeTooltipId: string | null = null;
const listeners = new Set<() => void>();

/**
 * Lets only one uncontrolled tooltip show at a time: a new one hides any other
 * and skips its fade-in. Pass the returned `transitionProps` to Mantine, or the
 * flags for styling the tooltip never change.
 */
export function useTooltipVisibility(
  transitionProps: TransitionOverride | undefined,
  { isControlled }: { isControlled: boolean },
) {
  const id = useId();
  const activeId = useSyncExternalStore(subscribe, getActiveTooltipId);
  const [phase, setPhase] = useState<TooltipPhase>("closed");
  const [isReplacing, setIsReplacing] = useState(false);

  // A tooltip removed while it's showing never reaches `onExited`.
  useEffect(() => () => releaseActiveTooltipId(id), [id]);

  const resolvedTransitionProps = useMemo(
    () => ({
      ...transitionProps,
      onEnter: () => {
        setPhase("entering");
        if (!isControlled) {
          setIsReplacing(activeTooltipId !== null && activeTooltipId !== id);
          setActiveTooltipId(id);
        }
        transitionProps?.onEnter?.();
      },
      onEntered: () => {
        setPhase("open");
        transitionProps?.onEntered?.();
      },
      onExit: () => {
        setPhase("exiting");
        transitionProps?.onExit?.();
      },
      onExited: () => {
        setPhase("closed");
        releaseActiveTooltipId(id);
        transitionProps?.onExited?.();
      },
    }),
    [transitionProps, id, isControlled],
  );

  const isShown = phase !== "closed";

  return {
    isHoverable: !isControlled && (phase === "entering" || phase === "open"),
    isReplaced:
      !isControlled && isShown && activeId !== null && activeId !== id,
    isEnteringInstantly: isReplacing && phase === "entering",
    transitionProps: resolvedTransitionProps,
  };
}

function setActiveTooltipId(id: string | null) {
  activeTooltipId = id;
  listeners.forEach((listener) => listener());
}

function releaseActiveTooltipId(id: string) {
  if (activeTooltipId === id) {
    setActiveTooltipId(null);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getActiveTooltipId() {
  return activeTooltipId;
}
