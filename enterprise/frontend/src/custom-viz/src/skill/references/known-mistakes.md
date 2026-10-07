# Known mistakes

Bugs and contract violations in generated vizzes. Each entry: **Symptom**, **Why it's
wrong**, **Fix**, **Detector** (a mechanical rule; when it needs
judgment, it says so). Code that matches a detector is a bug.

Contents: Viz grows unbounded each render · Hover handler doesn't call
`onHover(null)` on leave · React error #310 · SVG `<title>` used in
place of the host `onHover` tooltip · Drills wired on some marks but not
others · Drill handler early-returns when one direction of a pair has no
row · Click object incomplete, or clickable mark without
`cursor: pointer` · Popover or overlay that cannot be closed ·
`checkRenderable` doesn't match the build statement · Hardcoded colors ·
`isStringLike` for a text column · `formatValue` number options without
`column`

## Viz grows unbounded each render

- **Symptom** — The viz starts at its dashboard cell size, then grows on
  every reflow; eventually it overlaps neighbouring cards or fills the
  page. The `width`/`height` props keep increasing each render.
- **Why it's wrong** — Metabase measures the viz's outer container and
  feeds the measured size back as the next `width`/`height` props. If the
  root's height is sized by its content (no height, `height: "auto"`) or
  the root is not block-level (`inline-block`, `inline-flex`, a root
  `<svg>` without size attributes) and its content scales with the props,
  the container grows → the host re-renders with bigger props → the
  content grows again — a runaway loop. A root pinned to the props breaks
  the loop even when its content overflows.
- **Fix** — Pin the outermost element: a block-level root gets `height`
  of `"100%"` or the `height` prop; an inline root (`<span>`,
  `display: "inline*"`) becomes block-level (`<div>`, `display: "flex"`),
  even with a pinned height; a root `<svg>` or
  `<canvas>` gets `width={width}` and `height={height}` attributes, not
  `viewBox` alone. Content that may not fit: `overflow: "hidden"` (or
  `"auto"` when scrolling is intended) and `boxSizing: "border-box"` when
  the root has padding or border.
- **Detector** — Inspect the outermost JSX element the component
  returns; when it is a local component, inspect what that component
  returns. A bug when any of: (a) a block-level root's `height` style
  is neither `"100%"`, the `height` prop, nor a value derived from either
  that cannot exceed it (`calc(100% - 8px)`, `height - 8`); (b) the root
  is inline (`<span>`, or `display` is `"inline"`, `"inline-block"`,
  `"inline-flex"`, `"inline-grid"`); (c) the root is an `<svg>` or
  `<canvas>` without both `width=` and `height=` attributes pinned to the
  props or derived from them as in (a). Do not skip because the content
  "should fit". Needs judgment: content can exceed the root (sizes
  derived from data or props, long labels) and the root has no
  `overflow` rule, or has padding/border without
  `boxSizing: "border-box"` (content spills visually; no loop).

## Hover handler doesn't call `onHover(null)` on leave

- **Symptom** — The tooltip stays pinned on the last hovered mark after
  the cursor moved off it (until the cursor leaves the whole viz, or
  forever). Often one kind of mark clears correctly and a sibling kind
  doesn't.
- **Why it's wrong** — The host keeps the tooltip open until the viz
  calls `onHover(null)`. A helper that handles the leave path but
  returns early without that call strands the popover on stale content.
- **Fix** — Every "the cursor left this mark" path calls `onHover(null)`
  before returning: the null-event branch of hover helpers, every
  hoverable mark's `onMouseLeave`, and the container's `onMouseLeave` as
  a backstop. Match the convention across all hover helpers in the file.
- **Detector** — For every function accepting a nullable mouse event or
  named like `handle*Hover`/`clear*Hover`, inspect the leave branch; if
  it can return without reaching `onHover(null)`, it is a bug. Also
  flag any mark with `onMouseEnter`/`onMouseMove` but no `onMouseLeave`
  that reaches `onHover(null)`. Do not skip because a sibling helper or
  the container "would eventually" clear it — the cursor can move from a
  mark into empty viz interior without leaving the container.

## React error #310: hooks called after an early return

- **Symptom** — "Minified React error #310" once real data arrives, or
  when the data flips between empty and populated; the dashboard cell
  shows the error boundary.
- **Why it's wrong** — The component early-returns (e.g. for the empty
  state) before calling some hooks. React then sees a different hook
  count between renders and throws.
- **Fix** — Call every hook unconditionally at the top; branch on data
  only after the last hook. Never put `return`, `if`, loops, or `&&`
  between hook calls.
- **Detector** — Walk the component's own top-level statements top to
  bottom, skipping the bodies of nested functions (hook callbacks, event
  handlers, helpers). A `return` among those statements before any
  `use*` call is a bug, as is a `use*` call inside a
  conditional/loop/ternary/`&&` or inside a nested function, unless that
  nested function's own name starts with `use` (a custom hook). A
  `return` inside a nested function is never a bug.

## SVG `<title>` used in place of the host `onHover` tooltip

- **Symptom** — Hovering a mark shows nothing, or only the slow plain
  browser tooltip, instead of Metabase's styled popover. Source has
  `<title>` children inside SVG marks or `title="…"` attributes, and
  `onHover` is not used.
- **Why it's wrong** — Metabase's tooltip is driven by the `onHover`
  prop. SVG `<title>` triggers only the delayed native tooltip with no
  column-aware formatting; users read it as "no tooltips".
- **Fix** — Destructure `onHover`, call it on `onMouseEnter` with a
  hover object as in `api-contract.md` (onHover), clear with
  `onHover(null)` on leave, and remove the `<title>` elements / `title=`
  attributes.
- **Detector** — grep for `<title>` JSX children and `title=` attributes
  on rendered marks; if any match and `onHover` is never called, it is a bug.

## Drills wired on some marks but not others

- **Symptom** — Clicking some visual elements opens the drill menu,
  clicking others does nothing (ribbons drill but arcs don't; bars drill
  but category labels don't).
- **Why it's wrong** — Users can't tell which marks are clickable. Every
  element that visually represents data — including aggregating marks
  like category arcs and legend swatches — is a "mark" in the user's
  mental model.
- **Fix** — Wire `onClick` on every kind of data mark. For an
  aggregating mark, set `dimensions` to the aggregating dimension only.
  `cursor: pointer` on everything clickable.
- **Detector** — (1) For each SVG/DOM mark element rendered from data,
  confirm `onClick=` or that it is pure decoration (axis, grid). (2) If
  drills were not opted out and the viz renders more than one kind of
  mark, a bug when only one kind has `onClick`.

## Drill handler early-returns when one direction of a pair has no row

- **Symptom** — In pairwise vizzes (chord, sankey, adjacency, network)
  some clicks do nothing: the row lookup for that direction returns
  `-1`/`undefined` even though the mark represents real data (the
  reverse direction's row exists).
- **Why it's wrong** — The mark is drawn from the combined value
  (`matrix[i][j] + matrix[j][i]`), so it represents data even when only
  one direction has an input row; silently skipping the click looks
  broken.
- **Fix** — Look up both directions and fall back to the reverse row
  (swapping source/target dimensions); return early only when both are
  missing.
- **Detector** — In a click handler of a mark drawn from a pair
  (source/target, row/column of a matrix), find the row lookup keyed by
  the pair `(i, j)`. Emit when a missing result (`-1`, `undefined`,
  `null`) returns early without first trying the swapped pair `(j, i)`.

## Click object incomplete, or clickable mark without `cursor: pointer`

- **Symptom** — The drill menu opens at the wrong spot, lacks "filter
  by" actions, or formats the value wrongly; users don't notice a mark
  is clickable.
- **Why it's wrong** — The host builds the drill menu from the click
  object (`api-contract.md`, onClick); missing fields silently drop
  actions or the anchor.
- **Fix** — Pass `value`, `column`, `dimensions`, `element` and `event`
  as in `api-contract.md`; set `cursor: pointer` on every element with
  `onClick`.
- **Detector** — For each `onClick(` call with a non-null object, a bug
  when `value`, `column`, `element` or `event` is missing, or when
  `dimensions` is missing and the viz has a dimension column. For each
  data mark with an `onClick=` prop, a bug when its style has no
  `cursor: "pointer"`. A background handler that only calls
  `onClick(null)` to close the menu takes no pointer cursor.

## Popover or overlay that cannot be closed

- **Symptom** — A popover, overlay, menu or expanded panel the viz opens
  stays open; the user has to reload the dashboard.
- **Why it's wrong** — Global listeners are blocked
  (`sandbox-restrictions.md`) and clicks on host UI never reach the viz,
  so "click anywhere / press Escape" patterns don't work.
- **Fix** — Give it a close button, close on a click elsewhere inside
  the viz, or handle `Escape` on its own focusable element
  (`tabIndex={0}`).
- **Detector** — Needs judgment: every piece of UI the viz opens from
  state has at least one of those close paths.

## `checkRenderable` doesn't match the build statement

- **Symptom** — Wrong data crashes the component or renders garbage
  instead of Metabase showing a readable error; or the component shows
  its own "unsupported data" message.
- **Why it's wrong** — `checkRenderable` is the single place for
  data-shape and settings constraints (`api-contract.md`).
- **Fix** — Enforce in `checkRenderable`, with a user-readable `Error`,
  what the code needs to draw: column count and types, non-empty rows,
  valid settings. Descriptive words in the statement ("integer",
  "one row per pair", "sorted") are not constraints: a viz that rejects
  valid data after the user switches to `avg` or adds a row is broken.
- **Detector** — Compare `checkRenderable` against the data shape in
  `.claude/build-statement.md`: a column count or type the code relies
  on but does not check is a bug, and so is a check of a value property
  (`Number.isInteger`, uniqueness, order) the code can draw without.

## Hardcoded colors

- **Symptom** — The viz looks wrong in dark mode (dark text on dark
  background) or off-palette next to native charts.
- **Why it's wrong** — Only `renderingContext.getColor` and
  `colorScheme` follow the current Metabase theme.
- **Fix** — Follow the statement's `Colors` (`api-contract.md`,
  Colors); user-picked colors from a setting are fine.
- **Detector** — Every `getColor(` argument and every
  `var(--mb-color-…)` name is from the `api-contract.md` Colors list.
  Text, backgrounds and lines use those names, never literals (`#…`,
  `rgb(`, `hsl(`, named CSS colors).
  `Colors: theme` → no literals at all. `Colors: own` → mark literals
  are exactly the statement's values.

## `isStringLike` for a text column

- **Symptom** — Metabase shows the viz's "needs a text column" error on
  data that has one, typically from a native SQL question.
- **Why it's wrong** — `isStringLike` matches only special text types
  (IP addresses, BSON ids); ordinary text fails it (`api-contract.md`,
  Column types).
- **Fix** — Use `isString` for text, labels and categories.
- **Detector** — Any `isStringLike(` call where the statement's column is
  plain text or a category.

## `formatValue` number options without `column`

- **Symptom** — Percentages, decimals or currency show as raw numbers
  (`0.09019645825262144` instead of `9.0%`).
- **Why it's wrong** — The host applies number options only together
  with a numeric `column` (`api-contract.md`, formatValue).
- **Fix** — Pass `column: col`; for a number with no column, build the
  string with `Intl.NumberFormat`.
- **Detector** — A `formatValue(` call with `number_style`, `decimals`,
  `scale`, `currency`, `prefix`, `suffix` or `compact` and no `column`.
