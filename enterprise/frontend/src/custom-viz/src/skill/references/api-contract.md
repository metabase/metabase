# API behavioral contract

What the host does with your callbacks — the part the `.d.ts` files cannot
express. For the types themselves read
`node_modules/@metabase/custom-viz/dist/types/`.

## onClick → the drill-through menu

Calling the `onClick` prop with a click object opens Metabase's standard
drill menu ("See these records", "Filter by this value", "Break out
by…"). Drills are not automatic: a viz that never calls `onClick` is a
static picture. Do not reimplement drills — no custom popovers, no
self-filtering, no synthesized navigation: `onClick` gets all of
Metabase's drill logic (permissions, actions available for the question's
data source) for free.

The shape (the one snippet in this file):

```tsx
onClick({
  value: row[measureIndex], // the clicked cell value
  column: cols[measureIndex], // its column metadata — what to filter on
  dimensions: [
    // identifies the row; drives "filter by"
    { value: row[dimIndex], column: cols[dimIndex] },
  ],
  element: event.currentTarget, // the drill popover anchors to this node
  event: event.nativeEvent, // fallback anchor
});
```

- `element` anchors the popover; without it the menu opens at the event
  coordinates.
- `dimensions` drives the "filter by this dimension" actions. For a mark
  that aggregates several rows (a category arc, a band), pass only the
  aggregating dimension.
- `onClick(null)` closes the menu — use it for background clicks that
  clear selection.
- Give every clickable mark `cursor: pointer`.

## onHover → the tooltip

Metabase renders its styled tooltip while a hover object is active and
keeps it open **until you call `onHover(null)`**. The contract is
symmetric: every mouse-enter that calls `onHover(...)` needs a leave path
that reaches `onHover(null)` — including moving from a mark into empty
viz interior without leaving the container. Provide `data` (rows of
`{ key, value, col }`) for multi-line tooltips; `col` drives value
formatting. Never use SVG `<title>` children or `title=` attributes for
hover info — they produce the delayed plain browser tooltip, not
Metabase's.

## renderingContext

Host helpers so your output matches the host exactly: `getColor(name)`
resolves Metabase palette colors for the current theme, `colorScheme` is
`"light" | "dark"`, `fontFamily` is the font Metabase renders with, and
`measureText(text, style)` returns real rendered pixel sizes — use it for
label truncation and fitting instead of guessing character widths.

## checkRenderable vs the component

`checkRenderable(series, settings)` runs before render. Throw a plain
`Error` with a user-readable message for every data-shape or settings
constraint; Metabase shows the message instead of rendering. The
component may then assume the constraints hold — do not duplicate the
checks. Keep runtime guards in the component only for what
`checkRenderable` cannot see: `width` and `height` are `null` until the
first measure — return `null` then.

## Other host behavior worth knowing

- The host measures your outer container and feeds the size back as the
  next `width`/`height` props. A content-sized root creates a feedback
  loop (see known-mistakes: unbounded growth). Pin the root to the props.
- `formatValue` and the column-type predicates exported by the package
  delegate to the host at runtime (`__METABASE_VIZ_API__`) — they work
  only inside a running Metabase.
- Setting ids `column` and `column_settings` are reserved by the host.
  Read the per-column formatting users pick in the popover via
  `settings.column?.(col)` and pass the result to `formatValue`.
- Custom vizzes are not rendered in emails or Slack — static contexts
  fall back to a default visualization.
- Images: the plugin is a single JS bundle; inline SVG in JSX or embed
  rasters as `data:image/*` URIs. The only file served by the instance is
  the manifest icon.
