# Sandbox substitutes — what to use instead

## Practical rules

- **The host page is invisible.** The viz mounts inside a subtree marked
  `data-plugin-sandbox="<pluginId>"`; DOM nodes outside it come back as
  detached decoys (`document.body`, sibling dashcards, tree walkers and
  MutationObservers rooted at `document`). Only query and observe inside
  your own mount. `document.activeElement` returns `null` while focus is
  on host UI.
- **Debugging:** a blocked call throws with the restriction's label in
  the message. DOMPurify strips content silently but logs
  `[plugin <id>] DOMPurify stripped content from <source>` to the host
  console — if content silently disappears, look there.
- **Allowed and commonly needed:** React rendering into your container;
  `addEventListener` on your own elements for any event type; canvas and
  OffscreenCanvas on the main thread; `setTimeout` /
  `requestAnimationFrame`; `Intl`; `structuredClone`; `console.log`
  (prefix your logs to find them).

## Substitutes

- **Text input (`<input>`):** never fake a text field. Discrete choices:
  `<select>` (allowed) or styled `<button>`s. Continuous value: a slider
  built from `<div>`s + pointer events. Free text that configures the viz:
  a `defineSetting` with the `input` widget (the settings sidebar renders
  outside the sandbox). Free text that filters data: a dashboard filter
  feeding the question. If none fits, ask the user.
- **Links and navigation (`<a>`, `window.open`, `history.*`):** use a
  `<button>` with a React `onClick`. To navigate from a data point, call
  the host `onClick` prop — the drill menu owns navigation.
- **Forms (`<form>`):** handle submission in a `<button>` `onClick`.
- **Styles (`<style>`, `adoptedStyleSheets`):** inline `style={{}}`
  objects.
- **SVG references (`<image>`, `<use>`, `<feImage>`, `<foreignObject>`):**
  inline the SVG content into JSX; embed rasters as `data:image/*` URIs in
  `<img>` (allowed). For text inside SVG use `<text>`.
- **Data and network (`fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `Worker`, `sendBeacon`):** all data arrives through the
  `series` prop. Need more data? Add it to the Metabase question.
- **Persistence (`localStorage`, `sessionStorage`, `indexedDB`,
  `caches`):** React state for the session; a `defineSetting` for anything
  that must survive reloads (persisted with the card).
- **Dialogs (`alert`, `confirm`, `prompt`, `Notification`, `showModal`,
  `requestFullscreen`):** render your own UI or an absolutely-positioned
  overlay inside the viz bounds.
- **HTML strings (`DOMParser`, `createContextualFragment`,
  `setHTMLUnsafe`, `document.write`, `execCommand`, `contentEditable`):**
  build DOM with React/JSX. `innerHTML` works but is DOMPurify-sanitized.
- **Synthetic clicks (`element.click()`):** let real user events drive
  behavior.
- **Fonts (`FontFace`):** use `renderingContext.fontFamily` and measure
  with `renderingContext.measureText`.
- **Keyboard and clipboard events on `document`/`window`:** attach the
  listener to your own focusable element (`tabIndex={0}`).
- **Host info (`document.cookie`, `referrer`, `URL`, `baseURI`,
  `performance.getEntries`):** not available and never needed — remove
  the code.
- **Everything else — `navigator.clipboard`, `geolocation`, `share` and
  other `navigator` APIs, `print`, `<iframe>`, `<video>`, `<audio>`:** no
  substitute; drop the feature or ask the user.
