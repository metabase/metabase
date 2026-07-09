import * as Urls from "metabase/urls";

import { isCrossOriginError } from "./is-cross-origin-error";

/**
 * The `Window` members the URL mirror touches. Narrower than `Window` so a test
 * can pass a small typed fake without an unsafe cast — a real `Window` satisfies
 * it.
 */
export interface UrlMirrorWindow {
  readonly location: Pick<Location, "pathname">;
  history: Pick<History, "pushState" | "replaceState">;
  addEventListener: (type: "popstate", listener: () => void) => void;
  removeEventListener: (type: "popstate", listener: () => void) => void;
}

/**
 * Mirrors the iframe's URL into the parent's URL bar (no page reload).
 *
 * Same-origin frame, so we monkey-patch the iframe's `History` methods
 * directly — no `postMessage` bridge. Wrapping `pushState`/`replaceState`
 * catches programmatic nav; `popstate` catches browser back/forward
 * inside the iframe. Each change is mirrored via the parent's
 * `replaceState` (not `pushState`) so iframe-internal navigations don't
 * clutter the parent's back-history with one entry each.
 *
 * Returns a cleanup that restores the originals.
 */
export function attachIframeUrlMirror(
  iframeWindow: UrlMirrorWindow,
  parentName: string,
): () => void {
  const iframePrefix = `${Urls.DATA_APP_EMBED_PREFIX}/${encodeURIComponent(parentName)}`;
  const parentPrefix = Urls.dataApp(parentName);

  const mirror = () => {
    const iframePath = iframeWindow.location.pathname;
    const tail = iframePath.startsWith(iframePrefix)
      ? iframePath.slice(iframePrefix.length)
      : "";
    const parentTarget =
      parentPrefix + tail + window.location.search + window.location.hash;
    const parentCurrent =
      window.location.pathname + window.location.search + window.location.hash;
    if (parentCurrent !== parentTarget) {
      window.history.replaceState(window.history.state, "", parentTarget);
    }
  };

  const history = iframeWindow.history;
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    origPush.apply(this, args);
    mirror();
  };
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    mirror();
  };
  iframeWindow.addEventListener("popstate", mirror);

  return () => {
    try {
      history.pushState = origPush;
      history.replaceState = origReplace;
      iframeWindow.removeEventListener("popstate", mirror);
    } catch (error) {
      // Expected only when the frame navigated cross-origin: its window can no
      // longer be touched, and the patched history/listeners are gone with the old
      // document anyway. Rethrow anything else so real bugs surface.
      if (!isCrossOriginError(error)) {
        throw error;
      }
    }
  };
}
