import type { RefObject } from "react";

/** True for an event from this bar, and not from a bar nested inside it. */
export function isOwnBarEvent(
  barRef: RefObject<HTMLDivElement | null>,
  target: EventTarget | null,
) {
  return (
    target instanceof Element &&
    target.closest("[data-expression-bar]") === barRef.current
  );
}

/** An input with text in it keeps the keys that work on that text. */
export function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement && target.value.length > 0;
}
