(ns metabase.explorations.models.exploration-thread-group
  "A group is one Research-plan area the user assembled in the data picker — a set of
   metrics to be crossed with a set of dimensions. (\"Block\" is the frontend's word for the
   same thing — `ExplorationBlock` in the data picker; each block is persisted verbatim, 1:1,
   as one of these rows, with no merging or dedup across the thread.) The planners iterate
   groups and only cross a group's metrics with that same group's dimensions. Immutable
   after create.

   `:metrics` and `:dimensions` are JSON snapshots of the user's selection — `:metrics`
   entries carry their `dimension_mappings`, `:dimensions` entries carry the dim type
   snapshot — so a group is self-contained for both planning and per-row materialization."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadGroup [_model] :exploration_thread_group)

(doto :model/ExplorationThreadGroup
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- keywordize-dim-types
  "The dim snapshot stores `effective_type`/`semantic_type` as JSON strings (`\"type/Date\"`),
   but every reader (the variant planner, the LLM context, `dim-type-isa?`) needs them as
   fully-qualified keywords. Normalize at the model boundary so downstream code can trust the
   shape — mirrors the old per-column `transform-keyword` on `ExplorationThreadDimension`."
  [dimensions]
  (when dimensions
    (mapv (fn [dim]
            (cond-> dim
              (:effective_type dim) (update :effective_type keyword)
              (:semantic_type dim)  (update :semantic_type keyword)))
          dimensions)))

(def ^:private transform-dimensions
  {:in  (:in mi/transform-json)
   :out (comp keywordize-dim-types (:out mi/transform-json))})

(t2/deftransforms :model/ExplorationThreadGroup
  {:metrics    mi/transform-json
   :dimensions transform-dimensions})

(defmethod mi/can-read? :model/ExplorationThreadGroup
  ([instance]
   (mi/can-read? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [g (t2/select-one [:model/ExplorationThreadGroup :exploration_thread_id] :id pk)]
     (mi/can-read? :model/ExplorationThread (:exploration_thread_id g)))))

(defmethod mi/can-write? :model/ExplorationThreadGroup
  ([instance]
   (mi/can-write? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [g (t2/select-one [:model/ExplorationThreadGroup :exploration_thread_id] :id pk)]
     (mi/can-write? :model/ExplorationThread (:exploration_thread_id g)))))

(defn enrich-with-card-group
  "Look up `:group` for `dim` (a group dimension snapshot) on a `card-dim-by-id` map (the
  metric Card's `:dimensions` snapshot indexed by id) and `assoc` it onto the dim. Returns
  `dim` unchanged when no group is recorded. The group label is metadata authored on the
  Card's dimension; it doesn't live on the snapshot, so any consumer that wants to render it
  needs this lookup."
  [dim card-dim-by-id]
  (if-let [group (get-in card-dim-by-id [(:dimension_id dim) :group])]
    (assoc dim :group group)
    dim))

(defn- thread-groups [thread-id]
  (t2/select :model/ExplorationThreadGroup
             :exploration_thread_id thread-id
             {:order-by [[:position :asc] [:id :asc]]}))

(defn selected-metric-names
  "Distinct names of the metric Cards selected across `thread-id`'s groups, in authoring order."
  [thread-id]
  (let [card-ids (distinct (mapcat #(map :card_id (:metrics %)) (thread-groups thread-id)))
        names    (when (seq card-ids)
                   (t2/select-pk->fn :name [:model/Card :id :name] :id [:in card-ids]))]
    (keep names card-ids)))

(defn selected-dimension-names
  "Distinct display names (falling back to the raw `dimension_id`) of the dimensions
  selected across `thread-id`'s groups, in authoring order."
  [thread-id]
  (->> (thread-groups thread-id)
       (mapcat :dimensions)
       (keep (fn [d] (or (:display_name d) (:dimension_id d))))
       distinct))
