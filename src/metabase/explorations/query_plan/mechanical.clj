(ns metabase.explorations.query-plan.mechanical
  "Mechanical (deterministic) implementation of
  `metabase.explorations.query-plan.planner/QueryPlanner`. For every
  (metric, dimension) pair where the dimension resolves on the metric, emit
  a `default` plan item plus eligible `temporal-pattern-day`,
  `temporal-pattern-hour`, and `time-facet` variants. This mirrors the
  pre-LLM `candidates-for-pair` strategy that lived in `api.clj`.

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

(defn- time-facet-eligible?
  "Eligibility for the `time-facet` variant on this (metric, dim) pair:
   1. Dim is non-temporal (temporal dims belong to the `temporal-pattern-*`
      variants, not stacked-by-category line series).
   2. Metric Card carries a temporal breakout in its dataset_query
      (`metric :default-temporal-breakout` set by `metric-and-dim-context`).
   3. The dim's *effective* cardinality — bin count for auto-binned numerics,
      raw distinct-count otherwise — is known and ≤ `time-facet-max-cardinality`.
      Using effective cardinality matters here: a numeric dim like `Subtotal`
      has thousands of distinct values but renders as ~8 bars after default
      binning, so it's a perfectly fine series-count for a per-bin line chart.
  Missing fingerprints fail closed — same conservative rule the pre-LLM code used."
  [metric dim]
  (let [eff (qp.mbql/effective-cardinality dim)]
    (and (not (qp.mbql/dim-type-isa? dim :type/Temporal))
         (:default-temporal-breakout metric)
         (some? eff)
         (<= eff time-facet-max-cardinality))))

(defn- items-for-pair
  "Emit the baseline `default` plan item for one applicable (metric, dim)
  pair, plus any eligible temporal-pattern / time-facet variants. All items
  share the same `(metric_id, dimension_id)` so the auto-groups sidebar
  collapses them under one leaf, matching the pre-LLM grouping behavior.

  No `:rationale` is emitted: every mechanical item's rationale is a direct
  consequence of its (variant, dim-type) pair — a per-item explanation adds
  noise without adding signal. Rationales are valuable on LLM items, where
  the model made a judgement that isn't otherwise visible."
  [metric dim]
  (let [metric-id (:metric-id metric)
        dim-id    (:dimension_id dim)
        item      (fn [variant]
                    {:metric_id    metric-id
                     :dimension_id dim-id
                     :variant      variant
                     :params       {}})
        base      [(item "default")]
        patterns  (mapv item (temporal-pattern-variants dim))
        facet     (when (time-facet-eligible? metric dim) [(item "time-facet")])]
    (vec (concat base patterns facet))))

(defn- run-plan!
  "Walk the metric × dim matrix and emit plan items per `items-for-pair`.
  Wrapped by `MechanicalPlanner` below — only consults `:metric-dim-ctx`;
  the thread prompt is ignored because the strategy is purely structural."
  [{:keys [metric-dim-ctx]}]
  (let [{:keys [metrics]} metric-dim-ctx
        items (vec
               (mapcat
                (fn [metric]
                  (mapcat (fn [[_ {:keys [dim]}]]
                            (items-for-pair metric dim))
                          (:applicability metric)))
                metrics))]
    (if (empty? items)
      {:outcome    :skip-not-applicable
       :transcript {:reason    "no applicable (metric, dimension) pairs"
                    :n-metrics (count metrics)}}
      {:outcome    :ok
       :plan       items
       :transcript {:strategy  "mechanical"
                    :n-items   (count items)
                    :n-metrics (count metrics)}})))

(defrecord MechanicalPlanner []
  planner/QueryPlanner
  (planner-name [_] :mechanical)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `MechanicalPlanner` instance. The orchestrator references this
  directly when its setting / availability heuristic picks the mechanical
  planner. Tests can swap in a stub via `with-redefs`."
  (->MechanicalPlanner))
