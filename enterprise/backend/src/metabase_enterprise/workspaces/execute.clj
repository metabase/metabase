(ns metabase-enterprise.workspaces.execute
  "Workspace transform execution using transaction-rollback pattern.

   This module provides preview execution of workspace transforms by:
   1. Creating temporary Transform/TransformRun records in a transaction
   2. Executing using existing transform infrastructure
   3. Scraping metadata (execution stats + table schema)
   4. Rolling back the transaction (no app DB records persist)

   The warehouse DB changes (actual table data) DO persist in the isolated schema."
  (:require
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.api.common :as api]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- execution-results
  "Extract execution metadata from transform_run and target table info.
   Must be called within the transaction before rollback."
  [{xf-id :id :keys [target]}]
  (let [run (t2/select-one :model/TransformRun :transform_id xf-id)]
    (merge
     (select-keys run [:status :start_time :end_time :message])
     {:table {:name   (:name target)
              :schema (:schema target)}})))

(defn run-workspace-transform!
  "Execute a workspace transform in preview mode using transaction rollback.

   Creates temp Transform/TransformRun records, executes using existing infrastructure,
   scrapes results, then rolls back the transaction. Warehouse DB changes persist
   in the isolated schema.

   Returns an ::ws.t/execution-result map with status, timing, and table metadata."
  [workspace {:keys [target] :as transform} mapping]
  (isolation/with-workspace-isolation workspace
    (try
      (t2/with-transaction [_conn]
        (let [new-xf  (-> (select-keys transform [:name :description :source])
                          (assoc :creator_id api/*current-user-id*
                                 :target (mapping target)))
              _       (assert (:target new-xf) "Target mapping must not be nil")
              temp-xf (t2/insert-returning-instance! :model/Transform new-xf)]
          (transforms.i/execute! temp-xf {:run-method :manual})
          (throw (ex-info "rollback tx!" {::results (execution-results temp-xf)}))))
      (catch Exception e
        (or (::results (ex-data e))
            (throw e))))))
