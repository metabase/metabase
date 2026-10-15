/**
 * A cross-origin frame throws a `SecurityError` (`DOMException`) on any window
 * access — reading `contentWindow`, patching its `history`, removing a listener,
 * etc. That happens expectedly when the data-app iframe navigates to an external
 * host, or lands on a blocked navigation's `chrome-error` page. Use this to
 * tolerate that case while letting real bugs surface.
 */
export function isCrossOriginError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "SecurityError";
}
