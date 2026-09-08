(ns metabase.explorations.query-plan.transcript
  "The shape of `exploration_thread.query_plan_transcript`.

  The schema exists so the *column* format does not get to decide the shape of the data model. The
  orchestrator speaks the same keywords the planner protocol does — `:ok`, `:skip-empty`, `:failed`
  — and [[metabase.models.interface/transform-json-with-schema]] translates at the storage boundary
  instead of the call sites spelling outcomes as strings next to code that returns them as
  keywords.

  It is deliberately permissive everywhere else. `:map` is open in malli, so a field a planner adds
  rides through untouched; only the keyword-valued fields are declared, because those are the ones
  JSON cannot carry on its own. The cost of that permissiveness is the usual one: a *new*
  keyword-valued field added here without being declared comes back a string, silently."
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
   [:generated-at {:optional true} :any]
   [:thread-id    {:optional true} :any]
   [:planner      {:optional true} [:maybe :keyword]]
   [:outcome      {:optional true} [:maybe :keyword]]
   [:note         {:optional true} [:maybe :keyword]]
   [:transcript   {:optional true} [:maybe ::planner-transcript]]])
