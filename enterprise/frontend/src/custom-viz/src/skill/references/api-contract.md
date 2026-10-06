# API behavioral contract

Host behavior the `.d.ts` files cannot express. Types:
`node_modules/@metabase/custom-viz/dist/types/`.

## onClick → the drill-through menu

`onClick(clickObject)` opens Metabase's drill menu with permissions and
source-aware actions. Drills are not automatic — no `onClick`, no drills.
Never reimplement them (custom popovers, self-filtering, navigation).

Shape:

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

## onHover → the tooltip

Metabase renders its styled tooltip while a hover object is active and
keeps it open **until you call `onHover(null)`**. The contract is
symmetric: every mouse-enter that calls `onHover(...)` needs a leave path
that reaches `onHover(null)` (known-mistakes: hover leave). Provide
`data` (rows of `{ key, value, col }`) for multi-line tooltips; `col`
drives value formatting. Pass `element` and `event` to anchor it, as for
`onClick`.

## renderingContext

Host helpers so your output matches the host exactly: `getColor(name)`
resolves a Metabase palette color for the current theme (Colors below),
`colorScheme` is `"light" | "dark"`, `fontFamily` is the font Metabase renders with, and
`measureText(text, style)` returns real rendered pixel sizes — use it for
label truncation and fitting instead of guessing character widths.

## Colors

`getColor` accepts only the names below; any other string comes back
unchanged and usually renders black.

- Text: `text-primary` (labels, values), `text-secondary` (axis
  labels, captions), `text-tertiary` (hints)
- Surfaces: `background-primary` (viz background),
  `background-secondary` (bands, alternate rows)
- Lines: `border` (gridlines, axes, separators)
- Emphasis: `brand` (single-series marks, selection)
- Status: `success`, `error`, `warning` (up/down, thresholds)
- Series, one per category in order: `accent0`, `accent1`, `accent2`,
  `accent3`, `accent4`, `accent5`, `accent6`, `accent7`
- Series variants: `accent0-light`, `accent1-light`, `accent2-light`,
  `accent3-light`, `accent4-light`, `accent5-light`, `accent6-light`,
  `accent7-light`, `accent0-dark`, `accent1-dark`, `accent2-dark`,
  `accent3-dark`, `accent4-dark`, `accent5-dark`, `accent6-dark`,
  `accent7-dark`

Text, surfaces and lines always come from `getColor`. The statement's
`Colors` decides data marks only:

- `theme` → marks use `getColor` names too; a color setting's default
  is one of them.
- `own` → marks use the statement's values as literals; a value with a
  separate dark-theme entry is picked by `colorScheme`.

Deriving from a base color the way Metabase does (HSL lightness, 0–100):

- light variant: lightness + 12.5; dark variant: lightness − 12.5
- hover: a dark color gets lightness × 1.5, a light one lightness × 0.75
- dark theme: same value as light — Metabase keeps series colors
  unchanged across themes
- text on a filled mark: white, unless the mark is so light that dark
  text contrasts more

## checkRenderable vs the component

`checkRenderable(series, settings)` runs before render. Throw a plain
`Error` with a user-readable message for every data-shape or settings
constraint; Metabase shows the message instead of rendering. The
component may then assume the constraints hold — do not duplicate the
checks. Keep runtime guards in the component only for what
`checkRenderable` cannot see: `width` and `height` are `null` until the
first measure — return `null` then, after the last hook call
(known-mistakes: React error #310).

## Other host behavior

- The host feeds your measured root size back as `width`/`height`; pin
  the root to the props (known-mistakes: unbounded growth).
- `formatValue` and the column-type predicates exported by the package
  delegate to the host at runtime (`__METABASE_VIZ_API__`) — they work
  only inside a running Metabase.
- Setting ids `column` and `column_settings` are reserved by the host.
  Read the per-column formatting users pick in the popover via
  `settings.column?.(col)` and pass the result to `formatValue`.
- Custom vizzes are not rendered in emails or Slack — static contexts
  fall back to a default visualization.
- The plugin is a single JS bundle; the only served asset is the manifest
  icon. Images: `sandbox-substitutes.md`, SVG references.
