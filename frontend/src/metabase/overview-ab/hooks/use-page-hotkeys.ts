import { useEffect } from "react";

import { isTypingTarget } from "metabase/viz-ab/VerdictButtons";

type Hotkeys = Record<string, (() => void) | undefined>;

/** Single-letter hotkeys that fire outside inputs and without modifiers. */
export function usePageHotkeys(hotkeys: Hotkeys, enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }
      const handler = hotkeys[event.key.toLowerCase()];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hotkeys, enabled]);
}
