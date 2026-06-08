export const ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener;

// Event types that, when listened for on `document` or `window`, give the
// sandboxed script a global keylogger / clipboard sniffer. There's no
// legitimate reason for it to listen for typed text or clipboard activity
// outside its own subtree — listening on script-owned elements still
// works, and that's where the script's own UI events live.
const GLOBAL_BLOCKED_EVENT_TYPES = new Set([
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "copy",
  "cut",
  "beforepaste",
  "beforecopy",
  "beforecut",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "storage",
]);

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
    if (
      isGlobalEventTarget(this) &&
      GLOBAL_BLOCKED_EVENT_TYPES.has(String(type).toLowerCase())
    ) {
      throw new Error(
        `[${errorPrefix}] blocked addEventListener for global event type: ${type}`,
      );
    }
    return ADD_EVENT_LISTENER.call(this, type, listener, options);
  };
}
