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

The exact blocklists ship with this package — read them directly:

- `skill/references/blocklists.mjs` — built from the sandbox source:
  `BLOCKED_TAGS`, `GLOBAL_BLOCKED_EVENT_TYPES`,
  `NAVIGATOR_BLOCKED_GETTERS`, `URL_VALUED_ATTRS`, `PURIFY_CONFIG`
- `skill/blocked-apis.mjs` — every blocked DOM API; each key is the
  `<label>` in the runtime error message, each value is how the API
  appears in code

For what to use **instead** of a blocked capability, read
`skill/references/sandbox-substitutes.md`.

## Blocked HTML tags

`BLOCKED_TAGS` are rejected by `createElement`/`createElementNS` and
stripped from sanitized HTML. Rendering them from JSX throws at runtime.
Anything else — `div`, `span`, `button`, `select`, `svg`, `g`, `path`,
`rect`, `circle`, `text`, `canvas`, `img` — is allowed.

## HTML string sanitization

`innerHTML`, `outerHTML`, `ShadowRoot.innerHTML`, and
`insertAdjacentHTML` are sanitized with DOMPurify using `PURIFY_CONFIG`.

## Blocked attribute assignments

`setAttribute`, `setAttributeNS`, `setAttributeNode(NS)`,
`setNamedItem(NS)`, and the `Attr.value` setter reject:

- any inline event handler attribute (name matching `/^on/i`)
- `javascript:` URLs in `URL_VALUED_ATTRS`

## Blocked global event listeners

`addEventListener` on `document` or `window` throws for
`GLOBAL_BLOCKED_EVENT_TYPES`, and so does assigning the matching `on<type>`
handler on `document`, `window` or `document.body` (e.g.
`document.onkeydown = …`). Listening on the viz's own elements is fine.
