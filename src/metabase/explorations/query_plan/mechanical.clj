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
   1. Dim is non-temporal AND non-numeric (no default bucket/binning fires).
   2. Metric Card carries a temporal breakout in its dataset_query
      (`metric :default-temporal-breakout` set by `metric-and-dim-context`).
   3. Dim's fingerprint distinct-count is known and ≤ `time-facet-max-cardinality`.
  Missing fingerprints fail closed — same conservative rule the pre-LLM code used."
  [metric dim]
  (let [bucket   (qp.mbql/default-bucket-for-dim dim)
        distinct (get-in dim [:fingerprint :global :distinct-count])]
    (and (nil? bucket)
         (:default-temporal-breakout metric)
         (some? distinct)
         (<= distinct time-facet-max-cardinality))))

(defn- items-for-pair
  "Emit the baseline `default` plan item for one applicable (metric, dim)
  pair, plus any eligible temporal-pattern / time-facet variants. All items
  share the same `(metric_id, dimension_id)` so the auto-groups sidebar
  collapses them under one leaf, matching the pre-LLM grouping behavior."
  [metric dim]
  (let [metric-id (:metric-id metric)
        dim-id    (:dimension_id dim)
        base      [{:metric_id    metric-id
                    :dimension_id dim-id
                    :variant      "default"
                    :params       {}
                    :rationale    "Default single-breakout chart for this metric × dimension pair."}]
        patterns  (mapv (fn [variant]
                          {:metric_id    metric-id
                           :dimension_id dim-id
                           :variant      variant
                           :params       {}
                           :rationale    (case variant
                                           "temporal-pattern-day"  "Day-of-week pattern surfaces weekly seasonality."
                                           "temporal-pattern-hour" "Hour-of-day pattern surfaces intra-day rhythm.")})
                        (temporal-pattern-variants dim))
        facet     (when (time-facet-eligible? metric dim)
                    [{:metric_id    metric-id
                      :dimension_id dim-id
                      :variant      "time-facet"
                      :params       {}
                      :rationale    "Stacked line over the metric's temporal axis, faceted by this low-cardinality dim."}])]
    (vec (concat base patterns facet))))

(defn- run-plan!
  "Walk the metric × dim matrix and emit plan items per `items-for-pair`.
  Wrapped by `MechanicalPlanner` below — only consults `:metric-dim-ctx`;
  the thread prompt and timeline section are ignored because the strategy
  is purely structural."
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
       :transcript {:reason     "no applicable (metric, dimension) pairs"
                    :n-metrics  (count metrics)}}
      {:outcome    :ok
       :plan       items
       :rationale  (str "Deterministic plan: one `default` chart per applicable (metric, dimension) pair "
                        "plus temporal-pattern and time-facet variants where eligible. "
                        (count items) " items across " (count metrics) " metric(s).")
       :transcript {:strategy "mechanical"
                    :n-items  (count items)
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
