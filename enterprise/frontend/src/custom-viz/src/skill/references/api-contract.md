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
  data: cols.map((col, i) => ({ col, value: row[i] })), // every column of the row
  origin: { row, cols }, // the source row
  element: event.currentTarget, // the drill popover anchors to this node
  event: event.nativeEvent, // fallback anchor
});
```

- `data` decides which drills Metabase offers (row details, foreign
  keys); pass it and `origin` when the mark comes from one row.
- `element` anchors the popover; without it the menu opens at the event
  coordinates. Canvas libraries have no node per mark: pass `event`
  only.
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
`onClick`. On a canvas, build the anchor event at the mark's position:
`new MouseEvent("mouseover", { clientX, clientY })` from the chart's
bounding rect plus the mark's pixel coordinates.

## renderingContext

Host helpers so your output matches the host exactly: `getColor(name)`
resolves a Metabase palette color for the current theme (Colors below),
`colorScheme` is `"light" | "dark"`, `fontFamily` is the font Metabase renders with, and
`measureText(text, style)` returns real rendered pixel sizes — use it for
label truncation and fitting instead of guessing character widths.

## Colors

Use the names below two ways. In DOM and SVG styles, write the CSS
variable `var(--mb-color-<name>)`: it follows the theme by itself. Where
a literal value is needed (canvas libraries, color math), call
`renderingContext.getColor("<name>")`. Any other name renders black:
`getColor` returns an unknown name unchanged, and an unknown variable
resolves to nothing.

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

Text, surfaces and lines always use these names. The statement's
`Colors` decides data marks only:

- `theme` → marks use these names too; a color setting's default is one
  of them.
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

## Column types

Predicates check `base_type`/`effective_type` and `semantic_type`.
Native SQL columns have no `semantic_type`; query-builder columns
usually do. Pick predicates that hold for both:

- Text, labels, categories → `isString`. `isStringLike` is only for
  special text types (IP addresses, BSON ids) and is false for ordinary
  text. `isCategory` is false for native SQL text.
- Numbers → `isNumeric`. `isNumber` is false for date-part breakouts;
  `isFloat` is false for a plain float.
- Dates → `isDate`. A date-part breakout (`day-of-week`, `hour-of-day`)
  is an integer column with `col.unit` set, and `isDate` is false for
  it.
- `isDate` and `isNumeric` can both hold (a numeric timestamp). A metric
  is `isNumeric && !isDate`.

## formatValue

Number options (`number_style`, `decimals`, `scale`, `currency`,
`prefix`, `suffix`, `compact`, …) take effect only when `column` is
passed and is numeric; without it the value comes back as
`String(value)`. Always pass `column: col`, merged with
`settings.column?.(col)` when the user can format the column. To format
a number that has no column (a computed share, a delta), build the
string yourself with `Intl.NumberFormat`.

## Settings widgets

`widget` takes a built-in name (the catalog in `types/viz-settings.d.ts`)
or your own React component typed with `BaseWidgetProps<Value, Settings>`;
it receives `value`, `onChange` and `onChangeSettings`. Use your own only
when no built-in widget fits; it renders in the settings sidebar under
the same sandbox rules.

## Imperative libraries

Charting libraries that own their DOM or canvas (ECharts, Chart.js, d3
with event handlers):

- Create the chart once in an effect and dispose it in the cleanup.
- Register its event handlers once. `onClick`, `onHover`, `series` and
  `settings` change on every render, so read them through a ref that
  each render updates.
- Push new options when data or settings change, and call the library's
  resize when `width` or `height` changes.

## Other host behavior

- The host feeds your measured root size back as `width`/`height`; pin
  the root to the props (known-mistakes: unbounded growth).
- `defineConfig` renders the component inside an error boundary: an
  exception during render leaves the viz blank and logs
  `[plugin] … render failed` to the browser console, with no message in
  Metabase. A data problem the user should see belongs in
  `checkRenderable`.
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
