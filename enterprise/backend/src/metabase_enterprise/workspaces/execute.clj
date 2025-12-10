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
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.api.common :as api]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::execution-result
  [:map
   [:status [:enum :succeeded :failed]]
   [:start_time {:optional true} [:maybe some?]]
   [:end_time {:optional true} [:maybe some?]]
   [:message {:optional true} [:maybe :string]]
   [:table [:map
            [:name :string]
            [:schema {:optional true} [:maybe :string]]]]])

(defn- execution-results
  "Extract execution metadata from transform_run and synced table/fields.
   Must be called within the transaction before rollback."
  [{xf-id :id :keys [target]}]
  (let [run (t2/select-one :model/TransformRun :transform_id xf-id)]
    (merge
     (select-keys run [:status :start_time :end_time :message])
     {:table {:name   (:name target)
              :schema (:schema target)}})))

(defn- mock-mapping
  [ws target]
  (assoc target
         :schema (ws.u/isolation-namespace-name ws)
         :name (ws.u/isolated-table-name target)))

(defn run-workspace-transform!
  "Execute a workspace transform in preview mode using transaction rollback.

   Creates temp Transform/TransformRun records, executes using existing infrastructure,
   scrapes results, then rolls back the transaction. Warehouse DB changes persist
   in the isolated schema.

   Returns an ::execution-result map with status, timing, and table metadata."
  [workspace {:keys [target] :as transform} mapping]
  (isolation/with-workspace-isolation workspace
    (try
      (t2/with-transaction [_conn]
        (let [mapping (or mapping (partial mock-mapping workspace))
              new-xf  (-> (select-keys transform [:name :description :source])
                          (assoc :creator_id api/*current-user-id*
                                 :target (mapping target)))
              _       (assert (:target new-xf) "Are you missing mapping or what?")
              temp-xf (t2/insert-returning-instance! :model/Transform new-xf)]
          (transforms.i/execute! temp-xf {:run-method :manual})
          (throw (ex-info "rollback tx!" {::results (execution-results temp-xf)}))))
      (catch Exception e
        (or (::results (ex-data e))
            (throw e))))))
