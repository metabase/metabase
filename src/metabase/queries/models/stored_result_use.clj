(ns metabase.queries.models.stored-result-use
  "Tracks references to a `stored_result` snapshot. Each row records the `exploration_id`
  (the exploration that produced the snapshot). Used for lifecycle/GC and serdes — not
  for read authorization. Lives in the queries module alongside `:model/StoredResult`."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResultUse [_model] :stored_result_use)

(doto :model/StoredResultUse
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/define-before-insert :model/StoredResultUse
  [row]
  (when-not (:exploration_id row)
    (throw (ex-info "stored_result_use requires :exploration_id to be set"
                    {:exploration_id (:exploration_id row)})))
  row)
