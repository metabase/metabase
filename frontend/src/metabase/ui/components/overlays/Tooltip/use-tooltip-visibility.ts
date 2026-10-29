import type { TransitionOverride } from "@mantine/core";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

type TooltipPhase = "closed" | "entering" | "open" | "exiting";

/**
 * Uncontrolled tooltips that are open, oldest first, so closing one reveals
 * the one it replaced. Several can be open at once if e.g. one is hovered and
 * another is focused.
 */
let openTooltipIds: string[] = [];
/** The tooltip fading out, which shows only while no other tooltip is open. */
let fadingOutTooltipId: string | null = null;
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
    () => !isControlled && isShown && isOtherTooltipVisible(id),
  );

  // A tooltip removed while it's showing never reaches `onExited`.
  useEffect(() => () => releaseTooltip(id), [id]);

  const resolvedTransitionProps = useMemo(
    () => ({
      ...transitionProps,
      onEnter: () => {
        setPhase("entering");
        if (!isControlled) {
          setIsReplacing(isOtherTooltipVisible(id));
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

function isOtherTooltipVisible(id: string) {
  const visibleTooltipId = openTooltipIds.at(-1) ?? fadingOutTooltipId;
  return visibleTooltipId !== null && visibleTooltipId !== id;
}

function setTooltips(
  nextOpenTooltipIds: string[],
  nextFadingOutTooltipId: string | null,
) {
  openTooltipIds = nextOpenTooltipIds;
  fadingOutTooltipId = nextFadingOutTooltipId;
  listeners.forEach((listener) => listener());
}

function showTooltip(id: string) {
  setTooltips(
    [...withoutTooltip(id), id],
    fadingOutTooltipId === id ? null : fadingOutTooltipId,
  );
}

function exitTooltip(id: string) {
  if (openTooltipIds.includes(id)) {
    const remainingTooltipIds = withoutTooltip(id);
    // Only the last open tooltip fades out. Closing any other one reveals a
    // tooltip that's still open, so it hides at once instead.
    const isLastOpenTooltip = remainingTooltipIds.length === 0;
    setTooltips(
      remainingTooltipIds,
      isLastOpenTooltip ? id : fadingOutTooltipId,
    );
  }
}

function releaseTooltip(id: string) {
  if (openTooltipIds.includes(id) || fadingOutTooltipId === id) {
    setTooltips(
      withoutTooltip(id),
      fadingOutTooltipId === id ? null : fadingOutTooltipId,
    );
  }
}

function withoutTooltip(id: string) {
  return openTooltipIds.filter((openTooltipId) => openTooltipId !== id);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
