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
      would be redundant. Key-typed numerics (PK/FK) have no default binning
      (the QP refuses to bin `:Relation/*` columns), so high-cardinality ids
      route here and get the bounded top-K + Other rollup.
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

(defn- fan-segments
  "Expand one plan item across `[nil + metric.segments]`, producing N+1
  copies — the bare unsegmented item plus one per available segment. Each
  segmented copy carries `:params.segment_id <id>`. `time-facet` skips the
  fan-out (per the pre-LLM rule: the per-category line series is already
  busy enough without splitting it further across segments)."
  [metric item]
  (if (= "time-facet" (:variant item))
    [item]
    (cons item
          (for [seg (:segments metric)]
            (update item :params assoc :segment_id (:id seg))))))

(defn- items-for-pair
  "Emit eligible variants for one applicable (metric, dim) pair: `default`
  when `default-eligible?`, `top-n-other` when `top-n-other-eligible?`, plus
  any temporal-pattern variants and `time-facet` when applicable. Each
  non-time-facet item is fanned out across the metric's
  available segments — one copy per `[nil + segments]` — matching the
  pre-LLM behavior. All items share the same `(metric_id, dimension_id)`,
  so items of one query_type reconcile onto the same page.

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
                              :params {:k top-n-other-default-k})])]
    (vec (mapcat (partial fan-segments metric)
                 (concat base patterns facet top-n-other)))))

(defn- run-plan!
  "Walk each block's metric × dim matrix and emit plan items per `items-for-pair`,
  stamping every item with its block's id. Metrics are only crossed with dimensions
  that co-occur in the same block (the block-scoped `:applicability` enforces this).
  Wrapped by `MechanicalPlanner` below — only consults `:metric-dim-ctx`; the thread
  prompt is ignored because the strategy is purely structural."
  [{:keys [metric-dim-ctx]}]
  (let [{:keys [blocks]} metric-dim-ctx
        items (vec
               (for [block           blocks
                     metric          (:metrics block)
                     [_ {:keys [dim]}] (:applicability metric)
                     item            (items-for-pair metric dim)]
                 (assoc item :block_id (:block-id block))))]
    (if (empty? items)
      {:outcome    :skip-not-applicable
       :transcript {:reason   "no applicable (metric, dimension) pairs"
                    :n-blocks (count blocks)}}
      {:outcome    :ok
       :plan       items
       :transcript {:strategy  "mechanical"
                    :n-items   (count items)
                    :n-blocks  (count blocks)}})))

(defrecord MechanicalPlanner []
  planner/QueryPlanner
  (planner-name [_] :mechanical)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `MechanicalPlanner` instance. The orchestrator references this
  directly when its setting / availability heuristic picks the mechanical
  planner. Tests can swap in a stub via `with-redefs`."
  (->MechanicalPlanner))
