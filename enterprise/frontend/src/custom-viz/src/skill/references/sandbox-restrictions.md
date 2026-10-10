# Sandbox restrictions

Custom visualizations run inside a `@locker/near-membrane-dom` sandbox.
Everything listed below fails **at runtime**, not at compile time —
TypeScript will not catch any of it. When code hits a restriction, the host
console shows one of:

- `[plugin <id>] blocked API call: <label>`
- `[plugin <id>] blocked createElement: <tag>`
- `[plugin <id>] blocked setAttribute for inline event handler: <name>`
- `[plugin <id>] blocked setAttribute with javascript: URL: <name>`
- `[plugin <id>] blocked addEventListener for global event type: <type>`
- `[plugin <id>] DOMPurify stripped content from <source>: […]` (a log, not
  an exception — content silently disappears)

This file is the complete list. For what to use **instead**, read
`skill/references/sandbox-substitutes.md`.

## Blocked tags

Rejected by `createElement`/`createElementNS` and stripped from sanitized
HTML; rendering them from JSX throws at runtime:

`script`, `iframe`, `object`, `embed`, `link`, `meta`, `base`, `frame`,
`form`, `a`, `map`, `area`, `style`, `video`, `audio`, `source`, `track`,
`input`, `use`, `image`, `feimage`, `foreignobject`

## Allowed tags

Every tag not listed above, including the commonly needed:

`div`, `span`, `button`, `select`, `option`, `label`, `svg`, `g`, `path`,
`rect`, `circle`, `line`, `polyline`, `polygon`, `text`, `tspan`, `canvas`,
`img`

## HTML string sanitization

`innerHTML`, `outerHTML`, `ShadowRoot.innerHTML`, and `insertAdjacentHTML`
are sanitized with DOMPurify: the blocked tags above plus `form`, `a`,
`style`, `frame`, `map`, `area` are stripped, as are the `target`,
`formaction` and `action` attributes; URLs other than `#…`, `/…`,
`http(s):` and `data:image/(png|jpeg|gif|svg+xml|webp)` are removed.

## Blocked attribute assignments

`setAttribute`, `setAttributeNS`, `setAttributeNode(NS)`,
`setNamedItem(NS)`, and the `Attr.value` setter reject:

- any inline event handler attribute (name matching `/^on/i`)
- `javascript:` URLs in `href`, `src`, `xlink:href`, `action`,
  `formaction`, `poster`, `cite`, `background`, `manifest`

## Blocked global event listeners

`addEventListener` on `document` or `window` throws for these types:

`keydown`, `keyup`, `keypress`, `beforeinput`, `input`, `paste`, `copy`,
`cut`, `beforepaste`, `beforecopy`, `beforecut`, `compositionstart`,
`compositionupdate`, `compositionend`, `storage`

Assigning the matching `on<type>` handler is blocked too (labels
`Document.set on<type>`, `window.set on<type>`,
`HTMLBodyElement.set on<type>`, `HTMLFrameSetElement.set on<type>`).
Listening on the viz's own elements is fine.

## Blocked API calls

Each `<label>` is exactly what follows `blocked API call:` in the console.

- Network and workers: `window.fetch`, `window.XMLHttpRequest`,
  `window.WebSocket`, `window.EventSource`, `window.Worker`,
  `window.SharedWorker`, `window.RTCPeerConnection`, `WebTransport`,
  `BroadcastChannel`, `Navigator.sendBeacon`, `FontFace.load`
- Stylesheets: `Document.get adoptedStyleSheets`,
  `Document.set adoptedStyleSheets`, `ShadowRoot.get adoptedStyleSheets`,
  `ShadowRoot.set adoptedStyleSheets`, `CSSStyleSheet.replace`,
  `CSSStyleSheet.replaceSync`
- Document writing and editing: `Document.write`, `Document.writeln`,
  `Document.open`, `Document.close`, `Document.execCommand`,
  `Document.set designMode`, `HTMLElement.set contentEditable`
- Cookies: `Document.get cookie`, `Document.set cookie`,
  `Document.set domain`, `Window.get cookieStore`, `CookieStore.get`,
  `CookieStore.getAll`, `CookieStore.set`, `CookieStore.delete`
- Host location: `Document.get referrer`, `Document.get URL`,
  `Document.get documentURI`, `Node.get baseURI`
- Storage: `Window.get localStorage`, `Window.get sessionStorage`,
  `Window.get indexedDB`, `Window.get caches`, `StorageEvent.get key`,
  `StorageEvent.get oldValue`, `StorageEvent.get newValue`,
  `StorageEvent.get url`, `StorageEvent.get storageArea`
- Windows and dialogs: `window.open`, `window.close`, `window.alert`,
  `window.confirm`, `window.prompt`, `window.print`,
  `window.Notification`, `HTMLDialogElement.showModal`,
  `Element.requestFullscreen`, `PaymentRequest`
- Navigator: `Navigator.share`, and `Navigator.get <key>` for `clipboard`,
  `geolocation`, `mediaDevices`, `serviceWorker`, `credentials`,
  `permissions`, `usb`, `bluetooth`, `share`, `hid`, `serial`, `xr`,
  `wakeLock`, `locks`, `storage`, `presentation`
- History: `History.pushState`, `History.replaceState`, `History.go`,
  `History.back`, `History.forward`, `History.get state`
- Performance: `Performance.getEntries`, `Performance.getEntriesByType`,
  `Performance.getEntriesByName`, `PerformanceObserver`
- Caret: `Document.caretRangeFromPoint`, `Document.caretPositionFromPoint`
- HTML parsing: `Range.createContextualFragment`,
  `DOMParser.parseFromString`, `Element.setHTMLUnsafe`,
  `ShadowRoot.setHTMLUnsafe`, `Document.parseHTMLUnsafe`, `XSLTProcessor`,
  `XSLTProcessor.importStylesheet`, `XSLTProcessor.transformToFragment`,
  `XSLTProcessor.transformToDocument`
- Synthetic clicks and navigation: `HTMLElement.click`,
  `HTMLAnchorElement.set href`, `HTMLAnchorElement.set target`,
  `HTMLFormElement.submit`, `HTMLFormElement.requestSubmit`

Global event handler assignments (`… set on<type>`) are listed under
Blocked global event listeners.
