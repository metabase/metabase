import {
  GLOBAL_BLOCKED_EVENT_TYPES,
  NAVIGATOR_BLOCKED_GETTERS,
} from "./references/blocklists.mjs";

const NAVIGATOR_GETTER_INTERFACES = {
  storage: "NavigatorStorage",
  locks: "NavigatorLocks",
};

export const SANDBOX_BLOCKED_APIS = {
  "window.fetch": "fetch",
  "window.XMLHttpRequest": "XMLHttpRequest",
  "window.WebSocket": "WebSocket",
  "window.EventSource": "EventSource",
  "window.Worker": "Worker",
  "window.SharedWorker": "SharedWorker",
  "window.RTCPeerConnection": "RTCPeerConnection",
  WebTransport: "WebTransport",
  BroadcastChannel: "BroadcastChannel",
  "Navigator.sendBeacon": "Navigator.sendBeacon",
  "FontFace.load": "FontFace.load",

  "Document.get adoptedStyleSheets": "DocumentOrShadowRoot.adoptedStyleSheets",
  "Document.set adoptedStyleSheets": "DocumentOrShadowRoot.adoptedStyleSheets",
  "ShadowRoot.get adoptedStyleSheets":
    "DocumentOrShadowRoot.adoptedStyleSheets",
  "ShadowRoot.set adoptedStyleSheets":
    "DocumentOrShadowRoot.adoptedStyleSheets",
  "CSSStyleSheet.replace": "CSSStyleSheet.replace",
  "CSSStyleSheet.replaceSync": "CSSStyleSheet.replaceSync",

  "Document.write": "Document.write",
  "Document.writeln": "Document.writeln",
  "Document.open": "Document.open",
  "Document.close": "Document.close",
  "Document.execCommand": "Document.execCommand",
  "Document.set designMode": "Document.designMode",
  "HTMLElement.set contentEditable": "ElementContentEditable.contentEditable",

  "Document.get cookie": "Document.cookie",
  "Document.set cookie": "Document.cookie",
  "Document.set domain": "Document.domain",
  "Window.get cookieStore": "cookieStore",
  "CookieStore.get": "CookieStore.get",
  "CookieStore.getAll": "CookieStore.getAll",
  "CookieStore.set": "CookieStore.set",
  "CookieStore.delete": "CookieStore.delete",

  ...Object.fromEntries(
    [...GLOBAL_BLOCKED_EVENT_TYPES].flatMap((type) => [
      [`Document.set on${type}`, `document.on${type}`],
      [`window.set on${type}`, `on${type}`],
      [`HTMLBodyElement.set on${type}`, `document.body.on${type}`],
      [`HTMLFrameSetElement.set on${type}`, `document.body.on${type}`],
    ]),
  ),

  "Document.get referrer": "Document.referrer",
  "Document.get URL": "Document.URL",
  "Document.get documentURI": "Document.documentURI",
  "Node.get baseURI": "Node.baseURI",

  "Window.get localStorage": "localStorage",
  "Window.get sessionStorage": "sessionStorage",
  "Window.get indexedDB": "indexedDB",
  "Window.get caches": "caches",
  "StorageEvent.get key": "StorageEvent.key",
  "StorageEvent.get oldValue": "StorageEvent.oldValue",
  "StorageEvent.get newValue": "StorageEvent.newValue",
  "StorageEvent.get url": "StorageEvent.url",
  "StorageEvent.get storageArea": "StorageEvent.storageArea",

  "window.open": "open",
  "window.close": "close",
  "window.alert": "alert",
  "window.confirm": "confirm",
  "window.prompt": "prompt",
  "window.print": "print",
  "window.Notification": "Notification",

  "HTMLDialogElement.showModal": "HTMLDialogElement.showModal",
  "Element.requestFullscreen": "Element.requestFullscreen",
  PaymentRequest: "PaymentRequest",

  ...Object.fromEntries(
    NAVIGATOR_BLOCKED_GETTERS.map((key) => [
      `Navigator.get ${key}`,
      `${NAVIGATOR_GETTER_INTERFACES[key] ?? "Navigator"}.${key}`,
    ]),
  ),
  "Navigator.share": "Navigator.share",

  "History.pushState": "History.pushState",
  "History.replaceState": "History.replaceState",
  "History.go": "History.go",
  "History.back": "History.back",
  "History.forward": "History.forward",
  "History.get state": "History.state",

  "Performance.getEntries": "Performance.getEntries",
  "Performance.getEntriesByType": "Performance.getEntriesByType",
  "Performance.getEntriesByName": "Performance.getEntriesByName",
  PerformanceObserver: "PerformanceObserver",

  "Document.caretRangeFromPoint": "Document.caretRangeFromPoint",
  "Document.caretPositionFromPoint": "Document.caretPositionFromPoint",

  "Range.createContextualFragment": "Range.createContextualFragment",
  "DOMParser.parseFromString": "DOMParser.parseFromString",
  "Element.setHTMLUnsafe": "Element.setHTMLUnsafe",
  "ShadowRoot.setHTMLUnsafe": "ShadowRoot.setHTMLUnsafe",
  "Document.parseHTMLUnsafe": "parseHTMLUnsafe",

  XSLTProcessor: "XSLTProcessor",
  "XSLTProcessor.importStylesheet": "XSLTProcessor.importStylesheet",
  "XSLTProcessor.transformToFragment": "XSLTProcessor.transformToFragment",
  "XSLTProcessor.transformToDocument": "XSLTProcessor.transformToDocument",

  "HTMLElement.click": "HTMLElement.click",
  "HTMLAnchorElement.set href": "HTMLHyperlinkElementUtils.href",
  "HTMLAnchorElement.set target": "HTMLAnchorElement.target",
  "HTMLFormElement.submit": "HTMLFormElement.submit",
  "HTMLFormElement.requestSubmit": "HTMLFormElement.requestSubmit",
};

export const BLOCKED_DOM_APIS = new Set(Object.values(SANDBOX_BLOCKED_APIS));
