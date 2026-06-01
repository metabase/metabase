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

(defn enrich-with-card-group
  "Look up `:group` for `thread-dim` on a `card-dim-by-id` map (the metric Card's `:dimensions`
  snapshot indexed by id) and `assoc` it onto the thread dim. Returns `thread-dim` unchanged
  when no group is recorded. The group label is metadata authored on the Card's dimension; it
  doesn't live on the thread-dim row itself, so any consumer that wants to render it needs
  this lookup."
  [thread-dim card-dim-by-id]
  (if-let [group (get-in card-dim-by-id [(:dimension_id thread-dim) :group])]
    (assoc thread-dim :group group)
    thread-dim))

(defn selected-names
  "Display names (falling back to the raw `dimension_id`) of the dimensions selected on
  `thread-id`, in position order."
  [thread-id]
  (->> (t2/select [:model/ExplorationThreadDimension :display_name :dimension_id]
                  :exploration_thread_id thread-id
                  {:order-by [[:position :asc]]})
       (keep (fn [d] (or (:display_name d) (:dimension_id d))))))
