import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { useLatest } from "react-use";

type PressOrigin = "inside" | "outside";

/**
 * Calls `onClickOutside` for a click whose press started outside an element,
 * before anything else handles that click, and renders its updates before the
 * click goes on. Attach the returned handler to the element as
 * `onPointerDownCapture`. Presses in the element's portals, such as popovers,
 * count as inside. Clicks without a press, such as from the keyboard, are
 * ignored.
 *
 * Meant for committing an inline edit when the user moves on to something
 * else, such as a button that opens the next edit.
 */
export const useClickOutsideFirst = (onClickOutside: () => void) => {
  const pressOriginRef = useRef<PressOrigin | null>(null);
  const onClickOutsideRef = useLatest(onClickOutside);

  useEffect(() => {
    // Why a click, not a press: committing usually changes the layout, e.g. an
    // editor collapses. On a press, that moves what's under the pointer before
    // it's released, and the browser sends the click to the closest element
    // containing both the pressed and the released element, so the button the
    // user pressed never gets it.
    //
    // Why capture listeners on document: they run before React, which handles
    // events from its root container, further down. React events bubble
    // through portals but DOM events don't, so the press is marked outside
    // here first, then React's `onPointerDownCapture` re-marks it inside for
    // the element and its portals.
    //
    // Why flushSync: the click's own handler then reads the committed state.
    // Otherwise it would act on the state from before the commit, e.g. remove
    // an item from a list that doesn't have the edit yet, overwriting it.
    const handlePointerDown = () => {
      pressOriginRef.current = "outside";
    };
    const handleClick = () => {
      const pressOrigin = pressOriginRef.current;
      pressOriginRef.current = null;
      if (pressOrigin === "outside") {
        flushSync(() => onClickOutsideRef.current());
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [onClickOutsideRef]);

  return () => {
    pressOriginRef.current = "inside";
  };
};
