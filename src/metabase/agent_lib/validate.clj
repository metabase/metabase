(ns metabase.agent-lib.validate
  "Structural and semantic validation for structured MBQL programs."
  (:require
   [metabase.agent-lib.repair :as repair]
   [metabase.agent-lib.schema :as schema]
   [metabase.agent-lib.validate.semantic :as semantic]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private ContextEntitySummary
  "Schema for a single entity summary in the evaluation context."
  [:map
   [:model :string]
   [:id pos-int?]])

(def EvaluationContext
  "Schema for the evaluation context passed to validation and evaluation.
  `:source-entity` identifies the primary data source.
  `:surrounding-tables` provides join candidates visible in the current scope."
  [:map
   [:source-entity       ContextEntitySummary]
   [:referenced-entities [:sequential ContextEntitySummary]]
   [:surrounding-tables  [:sequential [:map [:id pos-int?]]]]])

(mu/defn validated-program :- :map
  "Repair and validate a structured program, returning the repaired program on success."
  [program :- :map
   context :- EvaluationContext]
  (log/debug "Repairing structured program")
  (let [program (-> program
                    repair/repair-program
                    (repair/repair-program-for-context context))]
    (log/debug "Validating repaired program structure")
    (schema/validated-structure program)
    (log/debug "Validating repaired program semantics")
    (semantic/validate-program program context)))
