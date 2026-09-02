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
   (when-let [g (t2/select-one [:model/ExplorationBlock :exploration_thread_id] 'id pk)]
     (mi/can-read? :model/ExplorationThread (:exploration_thread_id g)))))

(defmethod mi/can-write? :model/ExplorationBlock
  ([instance]
   (mi/can-write? :model/ExplorationThread (:exploration_thread_id instance)))
  ([_model pk]
   (when-let [g (t2/select-one [:model/ExplorationBlock :exploration_thread_id] 'id pk)]
     (mi/can-write? :model/ExplorationThread (:exploration_thread_id g)))))

(defn dimension-label
  "User-facing label for a dimension: the curated `:display-name` when set, else the raw
  `:dimension-id` (block snapshots) or `:name` (metric Card dimensions). Returns nil when
  none of those are present."
  [dim]
  (or (:display-name dim) (:dimension-id dim) (:name dim)))
