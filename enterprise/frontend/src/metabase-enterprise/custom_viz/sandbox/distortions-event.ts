import type { CustomVizPluginId } from "metabase-types/api";

export const ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener;

// Event types that, when listened for on `document` or `window`, give the
// plugin a global keylogger / clipboard sniffer. There's no legitimate
// reason for a viz plugin to listen for typed text or clipboard activity
// outside its own subtree — listening on plugin-owned elements still
// works, and that's where the plugin's own UI events live.
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
  // `selectionchange` is intentionally NOT blocked: legitimate viz code
  // (e.g. calendar heatmap) listens for it. The residual risk — pairing
  // it with `window.getSelection()` to track host text selection — is
  // gated on the user actively selecting text and is the same narrow
  // residual we accepted in `distortions-dom-read.ts`.
]);

function isGlobalEventTarget(target: unknown): boolean {
  return target instanceof Document || target instanceof Window;
}

export function addEventListenerDistortion(pluginId: CustomVizPluginId) {
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
        `[plugin ${pluginId}] blocked addEventListener for global event type: ${type}`,
      );
    }
    return ADD_EVENT_LISTENER.call(this, type, listener, options);
  };
}
