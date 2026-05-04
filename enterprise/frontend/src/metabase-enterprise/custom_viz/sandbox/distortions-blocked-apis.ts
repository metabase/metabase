// Map<host-realm ref → friendly label> for native APIs that must never be
// invoked from a sandboxed plugin. distortionCallback is called by
// near-membrane with the blue-realm reference, so identity comparison against
// these captured refs is sufficient. Refs that don't exist in the running
// browser (e.g. Navigator.share on desktop Firefox) are skipped — there's
// nothing to block if the API isn't there.

const method = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.value as object | undefined;

const getter = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.get;

const setter = (proto: object, key: string): object | undefined =>
  Object.getOwnPropertyDescriptor(proto, key)?.set;

export const BLOCKED_NATIVE_REFS = new Map<object, string>();

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
