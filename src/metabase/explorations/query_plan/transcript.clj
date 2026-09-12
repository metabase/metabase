(ns metabase.explorations.query-plan.transcript
  "Schema for `exploration_thread.query_plan_transcript`."
  (:require
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::plan-item
  "One item a planner emits — chart this metric against this dimension, in this variant."
  [:map
   [:block_id     :int]
   [:metric_id    :int]
   [:dimension_id :string]
   [:variant      :string]
   [:params       {:optional true} [:maybe :map]]
   [:rationale    {:optional true} [:maybe :string]]])

(mr/def ::planner-transcript
  "A planner's own account of its run, nested under the orchestrator's `:transcript`."
  [:map
   [:outcome      {:optional true} [:maybe :keyword]]
   [:rationale    {:optional true} [:maybe :string]]
   [:plan         {:optional true} [:maybe [:sequential ::plan-item]]]
   [:planner-notes {:optional true} [:maybe :map]]])

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
