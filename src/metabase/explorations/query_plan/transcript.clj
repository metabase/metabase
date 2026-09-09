(ns metabase.explorations.query-plan.transcript
  "Schema for `exploration_thread.query_plan_transcript`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::planner-transcript
  "A planner's own account of its run, nested under the orchestrator's `:transcript`. Free-form apart
  from the outcome it reported — `metabase.explorations.query-plan.planner/plan!` defines it."
  [:map
   [:outcome      {:optional true} [:maybe :keyword]]
   [:rationale    {:optional true} :any]
   [:plan         {:optional true} :any]
   [:final-errors {:optional true} :any]
   [:planner      {:optional true} :any]])

(mr/def ::transcript
  "One planning run, as persisted. Open: `:rows-count`, `:error` and anything else an outcome carries
  ride through as-is."
  [:map
   [:generated-at {:optional true} :string]
   [:thread-id    {:optional true} :int]
   [:planner      {:optional true} [:maybe :keyword]]
   [:outcome      {:optional true} [:maybe :keyword]]
   [:note         {:optional true} [:maybe :keyword]]
   [:transcript   {:optional true} [:maybe ::planner-transcript]]])
