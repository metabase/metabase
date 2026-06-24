(ns metabase.explorations.query-plan.mechanical
  "Mechanical (deterministic) implementation of
  `metabase.explorations.query-plan.planner/QueryPlanner`. For every
  (metric, dimension) pair where the dimension resolves on the metric, emit
  the eligible variants — `default`, `top-n-other`, `temporal-pattern-day`,
  `temporal-pattern-hour`, `time-facet`. `default` and `top-n-other` are
  cardinality-banded: known-low → default only; known-mid → both; known-high
  or unknown → top-n-other only (the unbounded `default` shape must not be
  emitted when cardinality might be high).

  Used as a fallback when the LLM isn't configured, and as the implementation
  reachable by setting an explicit override. Always succeeds (outcome `:ok`
  or `:skip-not-applicable`); there is no LLM to fail on and no validation
  needed — every emitted item is well-formed by construction."
  (:require
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.explorations.query-plan.planner :as planner]))

(set! *warn-on-reflection* true)

(def ^:private time-facet-max-cardinality
  "Maximum distinct-count for a categorical dim to qualify for a time-faceted
  variant. Above this, a per-category line series would be unreadable.
  Matches the pre-LLM threshold."
  20)

(def ^:private default-max-cardinality
  "Maximum raw distinct-count for which the `default` variant emits a usable
  chart. Above this the bar count is unreadable AND the serialized result
  risks blowing the cache budget; top-n-other handles those cases. Unknown
  cardinality also disqualifies — top-n-other will pick it up instead,
  bounded by construction."
  100)

(defn- temporal-pattern-variants
  "Vector of `[variant unit]` pairs applicable to `dim`. Day-of-Week applies
  to any temporal dim (date or datetime). Hour-of-Day applies only to
  datetime — pure dates have no time-of-day component."
  [dim]
  (cond-> []
    (or (qp.mbql/dim-type-isa? dim :type/DateTime)
        (qp.mbql/dim-type-isa? dim :type/Date))
    (conj "temporal-pattern-day")

    (qp.mbql/dim-type-isa? dim :type/DateTime)
    (conj "temporal-pattern-hour")))

(defn- default-eligible?
  "Eligibility for the `default` variant on this dim:
   - Temporal: always — the breakout is bucketed by time unit, bounded.
   - Auto-binned numeric: always — eff = bin count, always ≤ 20.
   - Categorical: cardinality must be known AND ≤ `default-max-cardinality`.
     Unknown / high cardinality routes through `top-n-other-eligible?` instead,
     which is bounded by K."
  [dim]
  (or (qp.mbql/dim-type-isa? dim :type/Temporal)
      (some? (qp.mbql/default-bucket-for-dim dim))
      (let [eff (qp.mbql/effective-cardinality dim)]
        (and (some? eff) (<= eff default-max-cardinality)))))

(defn- time-facet-eligible?
  "Eligibility for the `time-facet` variant on this (metric, dim) pair:
   1. Dim is non-temporal (temporal dims belong to the `temporal-pattern-*`
      variants, not stacked-by-category line series).
   2. Metric Card carries a temporal breakout in its dataset_query
      (`metric :default-temporal-breakout-summary` set by `metric-and-dim-context`).
   3. The dim's *effective* cardinality — bin count for auto-binned numerics,
      raw distinct-count otherwise — is known and ≤ `time-facet-max-cardinality`.
      Using effective cardinality matters here: a numeric dim like `Subtotal`
      has thousands of distinct values but renders as ~8 bars after default
      binning, so it's a perfectly fine series-count for a per-bin line chart.
  Missing fingerprints fail closed — same conservative rule the pre-LLM code used."
  [metric dim]
  (let [eff (qp.mbql/effective-cardinality dim)]
    (and (not (qp.mbql/dim-type-isa? dim :type/Temporal))
         (:default-temporal-breakout-summary metric)
         (some? eff)
         (<= eff time-facet-max-cardinality))))

(def ^:private top-n-other-min-cardinality
  "Raw distinct-count above which a categorical dim is a candidate for the
  `top-n-other` variant. At or below this, the `default` variant already
  renders cleanly; above, the top-K + Other rollup is the readable form.
  Same 20-bar line as `time-facet-max-cardinality`."
  20)

(def ^:private top-n-other-default-k
  "Default `k` for mechanically-emitted `top-n-other` items. Mid-range of the
  LLM's allowed 3–50 — broad enough to expose the head of the distribution,
  narrow enough to fit on a small chart."
  10)

(defn- top-n-other-eligible?
  "Eligibility for the `top-n-other` variant on this (metric, dim) pair:
   1. Dim is non-temporal — temporal dims belong to the `temporal-pattern-*`
      variants, not categorical rollups.
   2. Dim has no default bucket/binning — auto-binned numerics are already
      capped at `default-binning-max-bins` by `default`, so a top-K rollup
      would be redundant. Mechanical stays conservative here: the LLM
      planner allows numerics via `semantic_type`, but mechanical has no
      semantic signal to lean on.
   3. Dim's raw distinct-count is unknown OR > `top-n-other-min-cardinality`.
      Missing fingerprints fail *safe* into top-n-other (bounded by K) so a
      high-cardinality dim with no fingerprint doesn't fall through to the
      unbounded `default` variant."
  [dim]
  (let [eff (qp.mbql/effective-cardinality dim)]
    (and (not (qp.mbql/dim-type-isa? dim :type/Temporal))
         (nil? (qp.mbql/default-bucket-for-dim dim))
         (or (nil? eff)
             (> eff top-n-other-min-cardinality)))))

(def ^:private no-segment-fan-variants
  "Variants that are NOT fanned out across the metric's segments — the
  per-series line charts (`time-facet` and the time-series transforms) are
  already busy enough without splitting each further across segments."
  #{"time-facet" "cumulative" "offset-mom" "offset-yoy" "pct-change"})

(defn- fan-segments
  "Expand one plan item across `[nil + metric.segments]`, producing N+1
  copies — the bare unsegmented item plus one per available segment. Each
  segmented copy carries `:params.segment_id <id>`. Variants in
  `no-segment-fan-variants` skip the fan-out."
  [metric item]
  (if (no-segment-fan-variants (:variant item))
    [item]
    (cons item
          (for [seg (:segments metric)]
            (update item :params assoc :segment_id (:id seg))))))

(def ^:private offset-yoy-min-span-days
  "Minimum temporal span (days) for an `offset-yoy` variant — need at least one
  prior-year point to compare against. ~13 months."
  380)

(def ^:private offset-mom-min-span-days
  "Minimum temporal span (days) for an `offset-mom` variant. ~2 months."
  60)

(defn- faceted-transform-dim?
  "A dim qualifies as the *series* of a faceted transform when it's `time-facet`
  eligible AND categorical (non-numeric). A binned numeric makes an unreadable
  series — and the chart renders the binned numeric as the x-axis, displacing
  the temporal axis the transform exists to show. Numeric dims therefore get no
  time-series transform at all (they're not temporal either)."
  [metric dim]
  (and (time-facet-eligible? metric dim)
       (not (qp.mbql/dim-type-isa? dim :type/Number))))

(defn- transform-axis
  "Which temporal axis a time-series transform would use for this (metric, dim)
  pair, or nil if neither applies:
   - `:temporal-dim` — the dim is itself temporal (single series over the dim);
   - `:faceted`      — a categorical, `time-facet`-eligible dim (the metric's own
                       default temporal breakout on the x-axis, dim as series)."
  [metric dim]
  (cond
    (qp.mbql/dim-type-isa? dim :type/Temporal) :temporal-dim
    (faceted-transform-dim? metric dim)        :faceted))

(defn- axis-span-days
  "Temporal span (days) of the axis a transform would use, or nil when unknown
  (fingerprint missing / unanalyzed) — callers fail open on nil."
  [metric dim axis]
  (case axis
    :temporal-dim (:temporal-span-days dim)
    :faceted      (:default-temporal-span-days metric)
    nil))

(defn- axis-grain-month?
  "True when the transform's natural axis grain is already month — used to drop
  `offset-mom` (which forces month grain) as a duplicate of `pct-change`."
  [metric dim axis]
  (case axis
    :temporal-dim (= :month (second (qp.mbql/default-bucket-for-dim dim)))
    :faceted      (= "month" (:unit (:default-temporal-breakout-summary metric)))
    false))

(defn- transform-variants
  "Time-series transform variants applicable to this (metric, dim) pair. All
  require a single aggregation and an eligible temporal axis; cumulative needs a
  count/sum metric; offset/pct-change need window-function support; the offset
  variants are span-gated (fail open on unknown span) and `offset-mom` is dropped
  when it would duplicate `pct-change` (month-grain axis)."
  [metric dim]
  (when-let [axis (transform-axis metric dim)]
    (let [single?    (:single-aggregation? metric)
          window?    (and single? (:supports-window-functions? metric))
          span       (axis-span-days metric dim axis)
          span-ok?   (fn [min-days] (or (nil? span) (>= span min-days)))]
      (cond-> []
        (:cumulable-aggregation? metric)
        (conj "cumulative")

        window?
        (conj "pct-change")

        (and window? (not (axis-grain-month? metric dim axis)) (span-ok? offset-mom-min-span-days))
        (conj "offset-mom")

        (and window? (span-ok? offset-yoy-min-span-days))
        (conj "offset-yoy")))))

(defn items-for-pair
  "Emit eligible variants for one applicable (metric, dim) pair: `default`
  when `default-eligible?`, `top-n-other` when `top-n-other-eligible?`, plus
  any temporal-pattern variants and `time-facet` when applicable. Each
  non-time-facet item is fanned out across the metric's
  available segments — one copy per `[nil + segments]` — matching the
  pre-LLM behavior. All items share the same `(metric_id, dimension_id)`
  so the auto-groups sidebar collapses them under one leaf.

  No `:rationale` is emitted: every mechanical item's rationale is a direct
  consequence of its (variant, dim-type) pair — a per-item explanation adds
  noise without adding signal. Rationales are valuable on LLM items, where
  the model made a judgement that isn't otherwise visible."
  [metric dim]
  (let [metric-id   (:metric-id metric)
        dim-id      (:dimension_id dim)
        item        (fn [variant]
                      {:metric_id    metric-id
                       :dimension_id dim-id
                       :variant      variant
                       :params       {}})
        base        (when (default-eligible? dim) [(item "default")])
        patterns    (mapv item (temporal-pattern-variants dim))
        facet       (when (time-facet-eligible? metric dim) [(item "time-facet")])
        top-n-other (when (top-n-other-eligible? dim)
                      [(assoc (item "top-n-other")
                              :params {:k top-n-other-default-k})])
        transforms  (mapv item (transform-variants metric dim))]
    (vec (mapcat (partial fan-segments metric)
                 (concat base patterns facet top-n-other transforms)))))

(defn group-matrix-items
  "Plan items for one group's full depth-1 matrix: `items-for-pair` for every
  applicable `(metric, selected dim)` pair, stamped with the group id. Metrics are
  only crossed with dimensions that co-occur in the same group (the group-scoped
  `:applicability` enforces this).

  The shared source of truth for \"the full selected matrix.\" The mechanical
  planner emits exactly this; the adaptive planner prepends it so every selected
  pair is surfaced at depth 1 regardless of split gain, with its gain-gated descent
  layered on top (see `query-plan.adaptive/plan-group`)."
  [group]
  (vec
   (for [metric            (:metrics group)
         [_ {:keys [dim]}] (:applicability metric)
         item              (items-for-pair metric dim)]
     (assoc item :group_id (:group-id group)))))

(defn- run-plan!
  "Walk each group's metric × dim matrix and emit plan items per
  [[group-matrix-items]], stamping every item with its group's id. Wrapped by
  `MechanicalPlanner` below — only consults `:metric-dim-ctx`; the thread prompt is
  ignored because the strategy is purely structural."
  [{:keys [metric-dim-ctx]}]
  (let [{:keys [groups]} metric-dim-ctx
        items (vec (mapcat group-matrix-items groups))]
    (if (empty? items)
      {:outcome    :skip-not-applicable
       :transcript {:reason   "no applicable (metric, dimension) pairs"
                    :n-groups (count groups)}}
      {:outcome    :ok
       :plan       items
       :transcript {:strategy  "mechanical"
                    :n-items   (count items)
                    :n-groups  (count groups)}})))

(defrecord MechanicalPlanner []
  planner/QueryPlanner
  (planner-name [_] :mechanical)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `MechanicalPlanner` instance. The orchestrator references this
  directly when its setting / availability heuristic picks the mechanical
  planner. Tests can swap in a stub via `with-redefs`."
  (->MechanicalPlanner))
