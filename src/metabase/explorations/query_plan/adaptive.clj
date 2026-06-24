(ns metabase.explorations.query-plan.adaptive
  "The adaptive (greedy best-first) exploration query planner.

  A decision policy that *augments* the mechanical matrix walk: it emits the full
  depth-1 selected matrix (so the mechanical guarantee — select N dims, see N
  charts — always holds) and layers gain-gated drilled survivors on top, found by
  measuring candidate splits eagerly in-loop and descending into the
  differentiating ones. It implements the `QueryPlanner` protocol, so the
  orchestrator's transcript / failure / terminal scaffolding and the
  `insert-plan-rows!` materialization are reused unchanged; it is the first
  planner to run QP queries inside `plan!`."
  (:require
   [metabase.explorations.query-plan.mechanical :as qp.mechanical]
   [metabase.explorations.query-plan.planner :as planner]))

(set! *warn-on-reflection* true)

(defn- plan-group
  "Plan one group: the full depth-1 matrix (every applicable selected pair,
  surfaced unconditionally via the shared `group-matrix-items`). Later slices
  append gain-gated descent survivors here."
  [group]
  (qp.mechanical/group-matrix-items group))

(defn- run-plan!
  [{:keys [metric-dim-ctx]}]
  (let [groups (:groups metric-dim-ctx)
        items  (vec (mapcat plan-group groups))]
    (if (empty? items)
      {:outcome    :skip-not-applicable
       :transcript {:strategy "adaptive" :reason "no survivors" :n-groups (count groups)}}
      {:outcome    :ok
       :plan       items
       :transcript {:strategy "adaptive" :n-items (count items) :n-groups (count groups)}})))

(defrecord AdaptivePlanner []
  planner/QueryPlanner
  (planner-name [_] :adaptive)
  (plan!        [_ ctx] (run-plan! ctx)))

(def planner
  "Singleton `AdaptivePlanner`. Referenced by `pick-planner!` when the
  `explorations-query-planner` setting is `:adaptive`."
  (->AdaptivePlanner))
