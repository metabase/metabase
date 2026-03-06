import { useEffect } from "react";
import { useLatest } from "react-use";

type EventType = keyof DocumentEventMap;

type Options = {
  enabled?: boolean;
};

/**
 * Captures an event at the document level during the capture phase.
 * Useful for intercepting events before they reach other handlers,
 * e.g. closing a nested popover before the parent modal.
 *
 * Call `e.stopImmediatePropagation()` in your handler to prevent
 * other listeners from receiving the event.
 */
export function useCaptureEvent<T extends EventType>(
  eventType: T,
  handler: (event: DocumentEventMap[T]) => void,
  { enabled = true }: Options = {},
) {
  const handlerRef = useLatest(handler);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const listener = (e: DocumentEventMap[T]) => {
      handlerRef.current(e);
    };

    document.addEventListener(eventType, listener, true);
    return () => document.removeEventListener(eventType, listener, true);
  }, [enabled, eventType, handlerRef]);
}
