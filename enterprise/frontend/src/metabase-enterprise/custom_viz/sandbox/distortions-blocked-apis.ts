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

// Location & History — sandbox shouldn't navigate or rewrite the host
block(method(Location.prototype, "assign"), "Location.assign");
block(method(Location.prototype, "reload"), "Location.reload");
block(setter(Location.prototype, "href"), "Location.set href");
block(method(History.prototype, "pushState"), "History.pushState");
block(method(History.prototype, "replaceState"), "History.replaceState");
block(method(History.prototype, "go"), "History.go");
block(method(History.prototype, "back"), "History.back");
block(method(History.prototype, "forward"), "History.forward");

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
