(ns metabase.warehouse-index-manager.models.index-request
  "Records of CREATE INDEX statements queued/executed against transform-managed
  warehouse tables.

  One row per Metabase-managed index. `statement` is the validated source of
  truth — it's what gets replayed on transform-rerun. `structured` is a
  JSON-encoded round-trip-edit hint stored alongside; when the user pasted
  raw SQL it is nil.

  Status state machine:

      pending  → running → succeeded
                        → failed
      <any>    → dropped       (drop-index request issued)

  `pending` rows mean a quick-task has been submitted but hasn't acquired the
  warehouse connection yet. `running` is held only for the duration of the
  DDL execution. `succeeded` / `failed` / `dropped` are terminal."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def statuses
  "Allowed values for the `status` column."
  #{:pending :running :succeeded :failed :dropped})

(methodical/defmethod t2/table-name :model/IndexRequest [_model] :metabase_index_request)

(doseq [trait [:metabase/model :hook/timestamped?]]
  (derive :model/IndexRequest trait))

(t2/deftransforms :model/IndexRequest
  {:status     mi/transform-keyword
   :structured mi/transform-json})
