(ns metabase.explorations.models.exploration-thread-dimension
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadDimension [_model] :exploration_thread_dimension)

(doto :model/ExplorationThreadDimension
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ExplorationThreadDimension
  ;; The snapshot type fields are stored as `varchar`s (`"type/DateTime"`) but every reader
  ;; (the variant planner, the LLM context, `dim-type-isa?`) needs them as fully-qualified
  ;; keywords. Normalize at the model boundary so downstream code can trust the shape.
  {:effective_type mi/transform-keyword
   :semantic_type  mi/transform-keyword})
