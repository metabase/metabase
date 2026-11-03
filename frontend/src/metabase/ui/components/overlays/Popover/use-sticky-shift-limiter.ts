import {
  type Placement,
  type ReferenceElement,
  type ShiftOptions,
  limitShift,
} from "@floating-ui/dom";
import { useWindowEvent } from "@mantine/hooks";
import { useState } from "react";

type ShiftLimiter = NonNullable<ShiftOptions["limiter"]>;

export type StickyShiftLimiter = ShiftLimiter & { reset: () => void };

/**
 * A `shift` limiter for a `*-start` popover. While the popover is open, it
 * keeps the popover where it is when its size changes, and moves it only to
 * keep it inside the viewport. A new dropdown element (a new opening), a new
 * anchor, a moved anchor and `reset()` place the popover next to its anchor
 * again. Other placements get the default `limitShift()` behavior.
 */
export function createStickyShiftLimiter(): StickyShiftLimiter {
  const keepAttached = limitShift();
  let lastPosition:
    | {
        anchor: ReferenceElement;
        dropdown: HTMLElement;
        anchorStart: number;
        start: number;
      }
    | undefined;

  return {
    reset: () => {
      lastPosition = undefined;
    },
    fn: (state) => {
      if (!state.placement.endsWith("-start")) {
        return keepAttached.fn(state);
      }

      const axis = getShiftAxis(state.placement);
      const anchor: ReferenceElement = state.elements.reference;
      const dropdown: HTMLElement = state.elements.floating;
      const anchorStart = state.rects.reference[axis];
      const previous = lastPosition;
      const coords =
        previous?.anchor === anchor &&
        previous.dropdown === dropdown &&
        previous.anchorStart === anchorStart
          ? {
              x: state.x,
              y: state.y,
              [axis]: Math.min(previous.start, state[axis]),
            }
          : keepAttached.fn(state);
      lastPosition = { anchor, dropdown, anchorStart, start: coords[axis] };
      return coords;
    },
  };
}

/** Same as `createStickyShiftLimiter`, and also resets on window resize. */
export function useStickyShiftLimiter(): StickyShiftLimiter {
  const [limiter] = useState(createStickyShiftLimiter);
  useWindowEvent("resize", limiter.reset);
  return limiter;
}

// `shift` moves a popover along the side it sits on
function getShiftAxis(placement: Placement): "x" | "y" {
  const side = placement.split("-")[0];
  return side === "top" || side === "bottom" ? "x" : "y";
}
