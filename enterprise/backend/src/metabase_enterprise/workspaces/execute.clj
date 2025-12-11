(ns metabase-enterprise.workspaces.execute
  "Workspace transform execution using transaction-rollback pattern.

   This module provides preview execution of workspace transforms by:
   1. Creating temporary Transform/TransformRun records in a transaction
   2. Executing using existing transform infrastructure
   3. Scraping metadata (execution stats + table schema)
   4. Rolling back the transaction (no app DB records persist)

   The warehouse DB changes (actual table data) DO persist in the isolated schema."
  (:require
   [metabase-enterprise.transforms.core :as transforms]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase.api.common :as api]
   [metabase.util :as u]
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

(defn- remap-python-source [_table-mapping source]
  ;; TODO (sanya 2025/12/11) busy with this
  source)

(defn- remap-sql-source [_table-mapping source]
  ;; TODO (sanya 2025/12/11) busy with this
  source)

(defn- remap-mbql-source [_table-mapping _field-map source]
  (throw (ex-info "Remapping MBQL queries is not supported yet" {:source source})))

(defn- remap-source [table-map field-map source-type source]
  (case source-type
    :mbql (remap-mbql-source table-map field-map source)
    ;; TODO make sure it's actually a SQL dialect though..
    :native (remap-sql-source table-map source)
    :python (remap-python-source table-map source)))

;; You might prefer a multi-method? I certainly would.

(defn- remap-target [table-map {d :database, s :schema, t :name :as target}]
  (if-let [replacement (table-map [d s t])]
    ;; Always fallback to tables for re-mapped outputs, regardless of the type used in the original target.
    {:type     (:type replacement "table")
     :database (:db-id replacement)
     :schema   (:schema replacement)
     :name     (:table replacement)}
    target))

(defn run-transform-with-remapping
  "Execute a given collection with the given table and field re-mappings.

  This is used by Workspaces to re-route the output of each transform to a non-production table, and
  to re-write their queries where these outputs transitively become inputs to other transforms.



   Returns an ::ws.t/execution-result map with status, timing, and table metadata."
  [{:keys [source target] :as transform} table-map field-map]
  (try
    (t2/with-transaction [_conn]
      (let [s-type (transforms/transform-source-type source)
            new-xf  (-> (select-keys transform [:name :description :source])
                        (assoc :creator_id api/*current-user-id*
                               :source (remap-source table-map field-map s-type source)
                               :target (remap-target table-map target)))
            _       (assert (:target new-xf) "Target mapping must not be nil")
            temp-xf (t2/insert-returning-instance! :model/Transform new-xf)]
        (transforms.i/execute! temp-xf {:run-method :manual})
        (u/prog1 (execution-results temp-xf)
          (t2/delete! :model/Transform (:id temp-xf)))
        #_ ;; this just deletes also writes to :model/Table and actual output table too
          (throw (ex-info "rollback tx!" {::results (execution-results temp-xf)}))))
    (catch Exception e
      (or (::results (ex-data e))
          (throw e)))))
