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
 */
export const useClickOutsideFirst = (onClickOutside: () => void) => {
  const pressOriginRef = useRef<PressOrigin | null>(null);
  const onClickOutsideRef = useLatest(onClickOutside);

  useEffect(() => {
    // A click, not a press: what `onClickOutside` changes often moves the
    // layout, e.g. an editor collapses. On a press, that moves what's under
    // the pointer before it's released, and the button the user pressed
    // never gets its click.
    //
    // Capture listeners on document run before React's, so the press is
    // marked outside here first. React events bubble through portals but DOM
    // events don't, so the element's `onPointerDownCapture` then re-marks
    // presses in it and its portals as inside.
    //
    // flushSync, so the click's own handler reads the committed state rather
    // than the state from before it.
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
