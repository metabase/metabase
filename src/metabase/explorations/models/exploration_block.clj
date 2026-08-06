(ns metabase.explorations.models.exploration-block
  "A block is one Research-plan area the user assembled in the data picker — a set of
   metrics to be crossed with a set of dimensions. (\"Block\" is the frontend's word; it's
   also the sidebar group.) Each block is persisted verbatim, 1:1, as one of these rows,
   with no merging or dedup across the thread. The planners iterate blocks and only cross a
   block's metrics with that same block's dimensions. Immutable after create.

   `:metrics` and `:dimensions` are JSON snapshots of the user's selection — `:metrics`
   entries carry their `dimension_mappings`, `:dimensions` entries carry the dim type
   snapshot — so a block is self-contained for both planning and per-row materialization."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationBlock [_model] :exploration_block)

(doto :model/ExplorationBlock
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defn- keywordize-dim-types
  "The dim snapshot stores `effective-type`/`semantic-type` as JSON strings (`\"type/Date\"`),
   but every reader (the variant planner, the LLM context, `dim-type-isa?`) needs them as
   fully-qualified keywords. Normalize at the model boundary so downstream code can trust the
   shape."
  [dimensions]
  (when dimensions
    (mapv (fn [dim]
            (cond-> dim
              (:effective-type dim) (update :effective-type keyword)
              (:semantic-type dim)  (update :semantic-type keyword)))
          dimensions)))

(def ^:private transform-dimensions
  {:in  (:in mi/transform-json)
   :out (comp keywordize-dim-types (:out mi/transform-json))})

(t2/deftransforms :model/ExplorationBlock
  {:metrics    mi/transform-json
   :dimensions transform-dimensions})

(defmethod mi/can-read? :model/ExplorationBlock
  ([instance]
   (mi/can-read? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [g (t2/select-one [:model/ExplorationBlock :exploration_thread_id] :id pk)]
     (mi/can-read? :model/ExplorationThread (:exploration_thread_id g)))))

(defmethod mi/can-write? :model/ExplorationBlock
  ([instance]
   (mi/can-write? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [g (t2/select-one [:model/ExplorationBlock :exploration_thread_id] :id pk)]
     (mi/can-write? :model/ExplorationThread (:exploration_thread_id g)))))

(defn enrich-with-card-group
  "Look up `:group` for `dim` (a group dimension snapshot) on a `card-dim-by-id` map (the
  metric Card's `:dimensions` snapshot indexed by id) and `assoc` it onto the dim. Returns
  `dim` unchanged when no group is recorded. The group label is metadata authored on the
  Card's dimension; it doesn't live on the snapshot, so any consumer that wants to render it
  needs this lookup."
  [dim card-dim-by-id]
  (if-let [group (get-in card-dim-by-id [(:dimension-id dim) :group])]
    (assoc dim :group group)
    dim))

(defn- thread-blocks [thread-id]
  (t2/select :model/ExplorationBlock
             :exploration_thread_id thread-id
             {:order-by [[:position :asc] [:id :asc]]}))

(defn selected-metric-names
  "Distinct names of the metric Cards selected across `thread-id`'s blocks, in authoring order."
  [thread-id]
  (let [card-ids (distinct (mapcat #(map :card_id (:metrics %)) (thread-blocks thread-id)))
        names    (when (seq card-ids)
                   (t2/select-pk->fn :name [:model/Card :id :name] :id [:in card-ids]))]
    (keep names card-ids)))

(defn selected-dimension-names
  "Distinct display names (falling back to the raw `dimension-id`) of the dimensions
  selected across `thread-id`'s blocks, in authoring order."
  [thread-id]
  (->> (thread-blocks thread-id)
       (mapcat :dimensions)
       (keep (fn [d] (or (:display-name d) (:dimension-id d))))
       distinct))
