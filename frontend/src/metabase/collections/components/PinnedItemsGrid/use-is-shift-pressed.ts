import { useEffect, useState } from "react";

export function useIsShiftPressed(enabled = true): boolean {
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsShiftPressed(false);
      return;
    }

    const syncFromEvent = (event: KeyboardEvent) => {
      setIsShiftPressed(event.shiftKey);
    };
    const reset = () => setIsShiftPressed(false);

    window.addEventListener("keydown", syncFromEvent);
    window.addEventListener("keyup", syncFromEvent);
    window.addEventListener("blur", reset);

    return () => {
      window.removeEventListener("keydown", syncFromEvent);
      window.removeEventListener("keyup", syncFromEvent);
      window.removeEventListener("blur", reset);
    };
  }, [enabled]);

  return isShiftPressed;
}
