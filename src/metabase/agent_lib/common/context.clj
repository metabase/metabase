(ns metabase.agent-lib.common.context
  "Helpers derived from the evaluation context.")

(set! *warn-on-reflection* true)

(defn source-metric-id
  "Return the current context source metric id when the source entity is a metric."
  [context]
  (let [source-entity (:source-entity context)
        source-id     (:id source-entity)]
    (when (and (= "metric" (:model source-entity))
               (pos-int? source-id))
      source-id)))

(defn source-table-id
  "Return the current context source table id when the source entity is a table."
  [context]
  (let [source-entity (:source-entity context)
        source-id     (:id source-entity)]
    (when (and (= "table" (:model source-entity))
               (pos-int? source-id))
      source-id)))
