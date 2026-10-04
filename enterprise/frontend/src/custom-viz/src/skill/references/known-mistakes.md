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
  root is sized by its content (default block flow, `inline-block`, an
  `<svg>` without explicit width/height, unwrapped labels, padding
  outside `border-box`) and the content exceeds the props, the container
  grows → the host re-renders with bigger props → the content grows
  again — a runaway loop.
- **Fix** — Pin the outermost element to the props and clip: root gets
  `width`/`height` of `"100%"` (or the props), `overflow: "hidden"` (or
  `"auto"` when scrolling is intended), `boxSizing: "border-box"`. For
  `<svg>`, set both `width={width}` and `height={height}` attributes
  pinned to the props, not viewBox alone. Long labels: fixed-width
  container + `whiteSpace: "nowrap"`, `overflow: "hidden"`,
  `textOverflow: "ellipsis"`.
- **Detector** — Inspect the outermost JSX element the component
  returns. Emit the finding when any of: (a) no `overflow` rule on the
  root, (b) the root's width/height styles are neither `"100%"` nor the
  props, (c) an `<svg>` lacks both `width=` and `height=` pinned to the
  props. These conditions are non-negotiable — do not skip because the
  content "should fit"; the loop is driven by sub-pixel margins no
  static reading can rule out. The single allowed exemption: the root
  contains exactly one text node whose font size derives from
  `width`/`height` and nothing else.
- **Severity** — `blocker`.

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
- **Detector** — Walk the component body top to bottom; a `return`
  before any `useState`/`useMemo`/`useEffect`/`useRef`/`useCallback`/
  `useLayoutEffect` call is a finding, as is a hook inside a
  conditional/loop/ternary.
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
