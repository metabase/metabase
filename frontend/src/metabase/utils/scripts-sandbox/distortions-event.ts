import { GLOBAL_BLOCKED_EVENT_TYPES } from "./blocklists";
import { coerceToString } from "./coerce";

export { GLOBAL_BLOCKED_EVENT_TYPES };

export const ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener;

function isGlobalEventTarget(target: unknown): boolean {
  return target instanceof Document || target instanceof Window;
}

export function addEventListenerDistortion(errorPrefix: string) {
  return function addEventListener(
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const eventType = coerceToString(type);
    if (
      isGlobalEventTarget(this) &&
      GLOBAL_BLOCKED_EVENT_TYPES.has(eventType.toLowerCase())
    ) {
      throw new Error(
        `[${errorPrefix}] blocked addEventListener for global event type: ${eventType}`,
      );
    }
    return ADD_EVENT_LISTENER.call(this, eventType, listener, options);
  };
}
