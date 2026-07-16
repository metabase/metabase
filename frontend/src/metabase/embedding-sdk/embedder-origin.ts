let embedderOrigin: string | undefined;

/**
 * Remembers the browser-attested origin of the host page embedding this
 * iframe, taken from a `MessageEvent` sent by the parent. Unlike
 * `document.referrer`, `event.origin` is unaffected by the host page's
 * Referrer-Policy, so it stays available on hardened customer sites.
 */
export function captureEmbedderOriginFromEvent(event: MessageEvent) {
  if (
    event.source === window.parent &&
    event.origin &&
    event.origin !== "null"
  ) {
    embedderOrigin = event.origin;
  }
}

export function getCapturedEmbedderOrigin(): string | undefined {
  return embedderOrigin;
}

export function _resetCapturedEmbedderOriginForTests() {
  embedderOrigin = undefined;
}
