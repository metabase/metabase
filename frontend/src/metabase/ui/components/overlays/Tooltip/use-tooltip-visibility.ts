import type { TransitionOverride } from "@mantine/core";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

type TooltipPhase = "closed" | "entering" | "open" | "exiting";

type ShownTooltip = { id: string; isExiting: boolean };

/**
 * In the order they appeared, so closing a tooltip reveals the one it replaced.
 * Multiple tooltips can be "active" at the same time if e.g. one is hovered
 * and another is focused.
 */
let shownTooltips: ShownTooltip[] = [];
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
  const [phase, setPhase] = useState<TooltipPhase>("closed");
  const [isReplacing, setIsReplacing] = useState(false);
  const isShown = phase !== "closed";
  const isReplaced = useSyncExternalStore(
    subscribe,
    () => !isControlled && isShown && isOtherTooltipActive(id),
  );

  // A tooltip removed while it's showing never reaches `onExited`.
  useEffect(() => () => releaseTooltip(id), [id]);

  const resolvedTransitionProps = useMemo(
    () => ({
      ...transitionProps,
      onEnter: () => {
        setPhase("entering");
        if (!isControlled) {
          setIsReplacing(isOtherTooltipActive(id));
          showTooltip(id);
        }
        transitionProps?.onEnter?.();
      },
      onEntered: () => {
        setPhase("open");
        transitionProps?.onEntered?.();
      },
      onExit: () => {
        setPhase("exiting");
        exitTooltip(id);
        transitionProps?.onExit?.();
      },
      onExited: () => {
        setPhase("closed");
        releaseTooltip(id);
        transitionProps?.onExited?.();
      },
    }),
    [transitionProps, id, isControlled],
  );

  return {
    isHoverable: !isControlled && (phase === "entering" || phase === "open"),
    isReplaced,
    isEnteringInstantly: isReplacing && phase === "entering",
    transitionProps: resolvedTransitionProps,
  };
}

// The newest tooltip that isn't closing, or the newest closing one if they all are.
function isOtherTooltipActive(id: string) {
  const activeTooltip =
    shownTooltips.findLast(({ isExiting }) => !isExiting) ??
    shownTooltips.at(-1);
  return activeTooltip !== undefined && activeTooltip.id !== id;
}

function setShownTooltips(nextShownTooltips: ShownTooltip[]) {
  shownTooltips = nextShownTooltips;
  listeners.forEach((listener) => listener());
}

function showTooltip(id: string) {
  setShownTooltips([...withoutTooltip(id), { id, isExiting: false }]);
}

function exitTooltip(id: string) {
  if (shownTooltips.some((tooltip) => tooltip.id === id)) {
    setShownTooltips(
      shownTooltips.map((tooltip) =>
        tooltip.id === id ? { ...tooltip, isExiting: true } : tooltip,
      ),
    );
  }
}

function releaseTooltip(id: string) {
  if (shownTooltips.some((tooltip) => tooltip.id === id)) {
    setShownTooltips(withoutTooltip(id));
  }
}

function withoutTooltip(id: string) {
  return shownTooltips.filter((tooltip) => tooltip.id !== id);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
