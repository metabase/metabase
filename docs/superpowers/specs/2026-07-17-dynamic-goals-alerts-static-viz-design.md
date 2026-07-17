# Dynamic goals in alerts and static viz (GDGT-2828)

Branch: `gdgt-2828-dynamic-goals-alerts-static-viz` (based on `gdgt-2825-referenced-cards-engine`).
Issue: [GDGT-2828](https://linear.app/metabase/issue/GDGT-2828). Parent: GDGT-2824 (Option 5 of the
dynamic-goals tech doc).

## Problem

A chart's goal can now be a reference to another card's value — `{:card_id N :column "total"}` in
viz settings — instead of a literal number. The base branch (GDGT-2825/2826) already runs the
referenced queries and delivers their values under `[:data :referenced_cards]` in every card query
result, including the notification `card_part` (via the `execute-card` →
`qp.card/process-query-for-card` → `maybe-wrap-qp-for-card` seam).

Two backend consumers still assume the goal setting is a plain number and break on a map:

1. **Alerts** — `goal-met?` / `ui-logic/find-goal-value` compare result rows against the goal to
   decide whether a `:goal_above` / `:goal_below` alert fires.
2. **Static viz** — email/Slack/subscription/PDF rendering passes viz settings to the JS renderer
   (and uses them Clojure-side for scalar segment coloring), where a `{card_id, column}` map is
   garbage where a number is expected.

This branch teaches both consumers to look up the already-resolved values. No new queries run.

## Design

### 0. Pre-refactor: single source of truth for goal-bearing settings

Today `qp.referenced-cards/viz-settings->specs` hardcodes which viz settings carry `GoalValue`s
(`:graph.goal_value`, `:gauge.segments`/`:scalar.segments` min/max). The substitution step below
needs the same knowledge; two copies in two modules would let derivation and substitution drift
(a setting in one but not the other either runs queries nobody consumes, or hard-fails on a ref
nobody resolved).

Before the feature work, one behavior-identical refactor commit extracts the declaration and a
generic walk into a shared util namespace (`metabase.util.dynamic-goals`):

- `goal-values [viz-settings]` — yields every GoalValue in the settings with its path.
- `update-goal-values [viz-settings f]` — rewrites each GoalValue in place via `f`.
- `viz-settings->specs` is rewritten as a thin consumer: collect map-shaped refs from
  `goal-values`, group by card. Pinned by the existing `referenced_cards_test` tests.

### 1. Shared resolver — `metabase.util.dynamic-goals`

The Clojure twin of the FE's `resolveGoalValue` (`frontend/src/metabase/visualizations/lib/dynamic-goals.ts`),
in the same namespace as the walk it builds on:

- `resolve-goal-value [goal referenced-cards]`
  - number → returned as-is; self-column string → returned as-is (downstream code already handles
    both).
  - `{:card_id N :column "col"}` → look up `(get referenced-cards (str N))` — the seam keys the map
    by **string** card id with **string** statuses (`"completed"` / `"failed"`) so it serializes to
    JSON cleanly. Require `"completed"` status, find the column by `:name`, take the first row's
    value, require a finite number.
  - Any miss throws `ex-info` carrying the FE's error taxonomy as data:
    `{:type ::unresolved-goal, :reason :query-failed | :column-not-found | :not-a-number, :card-id N, :column "col"}`.
- `resolve-dynamic-goals [viz-settings referenced-cards]`
  - `update-goal-values` with the resolver: substitutes a resolved number for every GoalValue in
    the declared settings (`:graph.goal_value`, `:progress.goal`, and the `:min`/`:max` of each
    `:gauge.segments` / `:scalar.segments` entry).
  - No-op (returns settings unchanged) when no map-shaped refs are present.
  - Because derivation (`viz-settings->specs`) and substitution share the one declaration from the
    pre-refactor, a future goal-bearing setting is **one entry in one place**.

### 2. Alerts — `metabase.notification.payload.impl.card` / `metabase.util.ui-logic`

`find-goal-value` resolves the goal setting through `resolve-goal-value`, taking refs from the
card_part's `[:result :data :referenced_cards]`. An unresolvable ref propagates the throw — the
alert send fails loudly, consistent with the existing throw when a goal can't be compared
(`goal-met?`'s "Unable to compare results to goal"). The email channel's goal display
(`channel/impl/email.clj` calls `find-goal-value` on the same payload shape) is fixed by the same
change.

### 3. Static viz — one substitution choke point

In `render-pulse-card-body` (`src/metabase/channel/render/card.clj`), before dispatching to
`body/render`: rewrite the `card`'s and `dashcard`'s `:visualization_settings` with
`resolve-dynamic-goals`, using `(:referenced_cards data)`.

- One site covers every static-viz surface: email, Slack, subscriptions, PDF export, previews — all
  funnel through `render-pulse-card` / `render-pulse-card-body`.
- The JS bundle never learns about `referenced_cards`; it keeps receiving plain numbers. Precedent:
  the `:region_map` render method embeds resolved GeoJSON into settings the same way.
- Covers all three render paths in one move: `:javascript_visualization` (goal lines, progress),
  the legacy `gauge` kind (passes `card` to `js.svg/gauge`), and the Clojure-side
  `get-color-from-segment` for scalar.
- **Failure semantics (per tech doc: static viz fails hard):** the resolver's throw lands in
  `render-pulse-card-body`'s existing catch → the standard **per-card error box**. A dashboard
  subscription still sends with that one card broken; a single-card alert email shows the error
  box. Matches how a failed main query already degrades in dashboards.

### 4. Derivation — add `:progress.goal` to the shared declaration

Adding `:progress.goal` to the goal-settings declaration makes the existing seam run the
referenced query for progress charts with a card-ref goal, and the substitution step resolve it.
(Decision: progress is fully in scope even though the FE MVP hasn't wired it yet — the FE's
`GoalValue` union and goal input widget are already generalized.)

## Out of scope

- FE changes of any kind (the FE resolves refs client-side via `dynamic-goals.ts`; static-viz TSX
  stays untouched because substitution happens before the renderer).
- Serialization (GDGT-2829), dependency graph (GDGT-2830), permission tests (GDGT-2827).
- Multi-level refs, >10 refs, caching semantics — fixed by the engine on the base branch.

## Testing

- **Pre-refactor**: existing `referenced_cards_test` passes unchanged after `viz-settings->specs`
  is rewritten on the shared walk.
- **Resolver unit tests** (`metabase.util.dynamic-goals-test`): number/string passthrough; successful
  ref resolution; each failure reason (`:query-failed` for missing/failed entry, `:column-not-found`,
  `:not-a-number` for nil/non-numeric/infinite); `resolve-dynamic-goals` substitution across all
  four settings and no-op when refs are absent.
- **Alert integration** (`metabase.notification.payload.impl.card-test`): a goal-line card with
  `graph.goal_value` as a card ref — `goal-met?` fires/skips against the referenced value with
  `referenced_cards` present in the result; a `"failed"` referenced entry → the send errors.
- **Static viz integration** (`metabase.channel.render.card-test` or `body_test`): a gauge card
  whose segment bound is a card ref renders with the substituted number (assert via the captured
  args of the JS renderer, as existing tests do); a failed ref renders the error box instead.
- Existing `goal-met?` / `find-goal-value` tests pin the numeric/self-column paths unchanged.
