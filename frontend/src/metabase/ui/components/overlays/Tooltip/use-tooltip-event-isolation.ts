import type { TooltipProps } from "@mantine/core";
import { type ComponentPropsWithRef, type SyntheticEvent, useRef } from "react";

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

type TooltipEventIsolation = {
  /** Spread onto the tooltip. */
  tooltipProps: Pick<
    TooltipProps,
    | "onDoubleClick"
    | "onContextMenu"
    | "onPointerUp"
    | "onTouchStart"
    | "onPointerDown"
    | "onClickCapture"
    | "onMouseDownCapture"
    | "onMouseUpCapture"
  >;
  /** Spread onto an element wrapping the tooltip's label. */
  labelProps: Pick<
    ComponentPropsWithRef<"div">,
    "ref" | "onClick" | "onMouseDown" | "onMouseUp"
  >;
};

/**
 * Stops presses, clicks and touches on the tooltip from reaching the trigger's
 * React ancestors. Events on the trigger itself are untouched.
 */
export function useTooltipEventIsolation(): TooltipEventIsolation {
  const labelRef = useRef<HTMLDivElement>(null);

  // Mantine sends `onPointerDown` to the trigger as well as the tooltip.
  const stopPropagationUnlessOnTrigger = (event: SyntheticEvent) => {
    const isOnTooltip =
      labelRef.current != null &&
      event.currentTarget.contains(labelRef.current);
    if (isOnTooltip) {
      event.stopPropagation();
    }
  };

  // Mantine and floating-ui use the tooltip's `onClick`, `onMouseDown` and
  // `onMouseUp`, so the label stops those for its content and this covers the
  // padding and arrow.
  const stopPropagationOutsideLabel = (event: SyntheticEvent) => {
    const isInLabel =
      event.target instanceof Node && labelRef.current?.contains(event.target);
    if (!isInLabel) {
      event.stopPropagation();
    }
  };

  return {
    tooltipProps: {
      onDoubleClick: stopPropagation,
      onContextMenu: stopPropagation,
      onPointerUp: stopPropagation,
      onTouchStart: stopPropagation,
      onPointerDown: stopPropagationUnlessOnTrigger,
      onClickCapture: stopPropagationOutsideLabel,
      onMouseDownCapture: stopPropagationOutsideLabel,
      onMouseUpCapture: stopPropagationOutsideLabel,
    },
    labelProps: {
      ref: labelRef,
      onClick: stopPropagation,
      onMouseDown: stopPropagation,
      onMouseUp: stopPropagation,
    },
  };
}
