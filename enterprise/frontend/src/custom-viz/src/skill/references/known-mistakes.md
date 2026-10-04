# Known mistakes

Bugs seen in real generated vizzes. Each entry: **Symptom**, **Why it's
wrong**, **Fix**, **Detector** (a mechanical rule; when it needs
judgment, it says so), **Severity** (`blocker` = throws, produces wrong
output, or breaks a default — drills, hover, theme — that was not opted
out; `warning` = works but degrades UX).

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
  returns. `blocker` when any of: (a) a block-level root's `height` style
  is neither `"100%"`, the `height` prop, nor a value derived from either
  that cannot exceed it (`calc(100% - 8px)`, `height - 8`); (b) the root
  is inline (`<span>`, or `display` is `"inline"`, `"inline-block"`,
  `"inline-flex"`, `"inline-grid"`); (c) the root is an `<svg>` or
  `<canvas>` without both `width=` and `height=` attributes pinned to the
  props or derived from them as in (a). Do not skip because the content
  "should fit". Needs judgment: content can exceed the root (sizes
  derived from data or props, long labels) and the root has no
  `overflow` rule, or has padding/border without
  `boxSizing: "border-box"` → `warning` (content spills visually; no
  loop).
- **Severity** — `blocker` for (a)–(c); `warning` for overflow.

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
  it can return without reaching `onHover(null)`, emit the finding. Also
  flag any mark with `onMouseEnter`/`onMouseMove` but no `onMouseLeave`
  that reaches `onHover(null)`. Do not skip because a sibling helper or
  the container "would eventually" clear it — the cursor can move from a
  mark into empty viz interior without leaving the container.
- **Severity** — `blocker`.

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
  `use*` call is a finding, as is a `use*` call inside a
  conditional/loop/ternary/`&&` or inside a nested function, unless that
  nested function's own name starts with `use` (a custom hook). A
  `return` inside a nested function is never a finding.
- **Severity** — `blocker`.

## SVG `<title>` used in place of the host `onHover` tooltip

- **Symptom** — Hovering a mark shows nothing, or only the slow plain
  browser tooltip, instead of Metabase's styled popover. Source has
  `<title>` children inside SVG marks or `title="…"` attributes, and
  `onHover` is not used.
- **Why it's wrong** — Metabase's tooltip is driven by the `onHover`
  prop. SVG `<title>` triggers only the delayed native tooltip with no
  column-aware formatting; users read it as "no tooltips".
- **Fix** — Destructure `onHover`, call it on `onMouseEnter` with
  `{ data: [{ key, value, col }, …], element: event.currentTarget,
event: event.nativeEvent }`, clear with `onHover(null)` on leave, and
  remove the `<title>` elements / `title=` attributes.
- **Detector** — grep for `<title>` JSX children and `title=` attributes
  on rendered marks; if any match and `onHover` is never called, emit.
- **Severity** — `blocker`; `warning` if hover was opted out.

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
  mark, emit when only one kind has `onClick`.
- **Severity** — `warning`; `blocker` when no mark has `onClick` and
  drills were not opted out.

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
- **Detector** — grep for an index lookup like `cellRowIndex[…]?.[…]`
  followed by `if (… < 0) return` / `if (… == null) return` without a
  swapped-indices fallback.
- **Severity** — `warning`.
