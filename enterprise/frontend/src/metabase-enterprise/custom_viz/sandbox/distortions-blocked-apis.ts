// Native APIs that must never be invoked from a sandboxed plugin. Matched
// by `getFunctionName` output, which returns either a friendly name from
// FUNCTION_NAMES (e.g. "Document.write") for host-realm refs, or the bare
// .name property (e.g. "write") for cross-realm refs that don't match the
// host weakmap. Both forms are listed here so blocking works regardless of
// whether near-membrane preserved identity.
//
// Only blocks NATIVE functions (the isUserDefinedFunction check above lets
// user code freely define functions of the same name). The bare-name match
// is broad on purpose: every native function that ends up named "fetch",
// "open", "write" in any realm is dangerous in this context.
export const BLOCKED_NATIVE_NAMES = new Set([
  // ---- Bare names (cross-realm or unrecognized refs) ----

  // Network exfiltration
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "sendBeacon",

  // Document destruction / navigation
  "write",
  "writeln",
  "open", // window.open, document.open, XMLHttpRequest.open
  "close", // window.close, document.close
  "execCommand",
  "navigate",

  // Cookie / session / domain
  "get cookie",
  "set cookie",
  "set domain",

  // Storage exfiltration
  "get localStorage",
  "get sessionStorage",
  "get indexedDB",
  "get caches",

  // Hardware / device APIs
  "get clipboard",
  "get geolocation",
  "get mediaDevices",
  "get serviceWorker",
  "get credentials",
  "get permissions",
  "get usb",
  "get bluetooth",
  "get share",
  "share",
  "get hid",
  "get serial",
  "get xr",
  "get wakeLock",
  "get locks",
  "get storage",
  "get presentation",

  // Location / History — sandbox shouldn't navigate or rewrite the host
  "assign", // location.assign
  "reload",
  "pushState",
  "replaceState",
  "go", // history.go
  "back",
  "forward",
  "set href", // location.href setter

  // ---- Friendly names from FUNCTION_NAMES (host-realm matches) ----

  "window.fetch",
  "window.XMLHttpRequest",
  "window.WebSocket",
  "window.EventSource",
  "window.open",
  "window.close",
  "Window.open",
  "Window.close",
  "Document.write",
  "Document.writeln",
  "Document.open",
  "Document.close",
  "Document.execCommand",
  "Document.get cookie",
  "Document.set cookie",
  "Document.set domain",
  "Navigator.sendBeacon",
  "Navigator.share",
  "Navigator.get clipboard",
  "Navigator.get geolocation",
  "Navigator.get mediaDevices",
  "Navigator.get serviceWorker",
  "Navigator.get credentials",
  "Navigator.get permissions",
  "Navigator.get usb",
  "Navigator.get bluetooth",
  "Navigator.get share",
  "Navigator.get presentation",
  "Navigator.get hid",
  "Navigator.get serial",
  "Navigator.get xr",
  "Navigator.get wakeLock",
  "Navigator.get locks",
  "Navigator.get storage",
  "Window.get localStorage",
  "Window.get sessionStorage",
  "Window.get indexedDB",
  "Window.get caches",
]);
