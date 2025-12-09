(ns metabase-enterprise.workspaces.isolation
  (:require
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;;; Driver multimethods
;; Implementations are in metabase-enterprise.workspaces.driver.{postgres,h2}

(defn dispatch-on-engine
  "Take engine from database `db` and dispatch on that."
  [database & _args]
  (driver.u/database->driver database))

(defmulti grant-read-access-to-tables!
  "Grant read access to these tables."
  {:added "0.59.0" :arglists '([database username tables])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmulti init-workspace-database-isolation!
  "Create database isolation for a workspace. Return the database details."
  {:added "0.59.0" :arglists '([database workspace])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmulti duplicate-output-table!
  "Create an isolated copy of the given output tables, for a workspace transform to write to.

  TODO: Consider removing this method once we have 'remap-on-execute' semantics, where
  transforms write directly to the isolated location without needing to duplicate existing tables."
  {:added "0.59.0" :arglists '([database workspace output])}
  #'dispatch-on-engine
  :hierarchy #'driver/hierarchy)

(defmulti drop-isolated-tables!
  "Drop isolated tables"
  {:added "0.59.0" :arglists '([database s+t-tuples])}
  #'dispatch-on-engine)

;;;; Public API

(defn create-isolated-output-tables!
  "Create new _isolated tables_ to correspond to the outputs of the upstream graph.
   Decorate the graph outputs with the mapping to the new tables.
   For outputs where the table doesn't exist yet (id=nil), includes them in the graph with the intended
   isolated table location, but skips actual table duplication."
  ;; TODO: Should be part of mirroring!
  [workspace database ctx]
  (let [graph               (:graph ctx)
        existing-output-ids (keep :id (:outputs graph))
        ;; TODO (Chris 2025-11-20) Avoid querying again here, let's have this data passed down as part of the graph
        table-by-id         (when (seq existing-output-ids)
                              (t2/select-fn->fn :id identity [:model/Table :id :name :schema] :id [:in existing-output-ids]))
        isolated-schema     (driver.common/isolation-namespace-name workspace)
        isolated-table->id  (t2/select-fn->fn :name :id [:model/Table :id :name] :db_id (:id database) :schema isolated-schema)
        outputs             (for [global-output (:outputs graph)]
                              (let [isolated-table  (driver.common/isolated-table-name global-output)
                                    isolated-id     (isolated-table->id isolated-table)
                                    upstream-output (if (:id global-output)
                                                      (merge global-output (get table-by-id (:id global-output)))
                                                      global-output)]
                                ;; TODO name and schema of this table is changing
                                #_(when isolated-id
                                    (t2/insert! :model/WorkspaceMappingTable
                                                {:workspace_id  (:id workspace)
                                                 :upstream_id   (:id upstream-output)
                                                 :downstream_id isolated-id}))
                                (assoc upstream-output :mapping {:id     isolated-id
                                                                 :schema isolated-schema
                                                                 :name   isolated-table})))
        src-output-id->dst-output
        (u/for-map [{:keys [id mapping]} outputs :when id]
          [id mapping])

        src-schema+table->dst->schema+table
        (u/for-map [{:keys [mapping] :as output} outputs]
          (let [src-schema (:schema output)
                src-table  (:name output)
                dst-schema (:schema mapping)
                dst-table  (:name mapping)]
            [[src-schema src-table]
             [dst-schema dst-table]]))]
    (-> ctx
        (update :graph assoc :outputs (vec outputs))
        (assoc :src-output-id->dst-output src-output-id->dst-output)
        (assoc :src-schema+table->dst->schema+table src-schema+table->dst->schema+table))))

(defn ensure-database-isolation!
  "Wrapper around the driver method, to make migrations easier in future."
  [workspace database]
  (init-workspace-database-isolation! database workspace))

(defn do-with-workspace-isolation
  "Impl of* with-workspace-isolation*."
  [workspace thunk]
  (driver/with-swapped-connection-details (:database_id workspace)
    (:database_details workspace)
    (thunk)))

(defmacro with-workspace-isolation
  "Execute body with necessary isolation."
  [workspace & body]
  `(do-with-workspace-isolation ~workspace (fn [] ~@body)))
