(ns metabase-enterprise.workspaces.isolation
  (:require
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
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
  (let [graph (:graph ctx)
        existing-output-ids (keep :id (:outputs graph))
        ;; TODO (Chris 2025-11-20) Avoid querying again here, let's have this data passed down as part of the graph
        table-by-id         (when (seq existing-output-ids)
                              (into {}
                                    (map (juxt :id identity))
                                    (t2/select [:model/Table :id :name :schema] :id [:in existing-output-ids])))
        outputs             (for [upstream-output (:outputs graph)]
                              (if (:id upstream-output)
                                ;; Table exists, duplicate it
                                (let [hydrated-output (merge upstream-output (get table-by-id (:id upstream-output)))
                                      isolated-table  (duplicate-output-table! database workspace hydrated-output)]
                                  (t2/insert! :model/WorkspaceMappingTable
                                              {:upstream_id   (:id upstream-output)
                                               :downstream_id (:id isolated-table)
                                               :workspace_id  (:id workspace)})
                                  (assoc hydrated-output :mapping isolated-table))
                                ;; Table doesn't exist yet, provide the intended isolated location
                                (let [isolated-schema (driver.common/isolation-namespace-name workspace)
                                      isolated-name   (driver.common/isolated-table-name upstream-output)]
                                  (assoc upstream-output :mapping {:id     nil
                                                                   :schema isolated-schema
                                                                   :name   isolated-name}))))
        src-output-id->dst-output
        (into {}
              (comp (filter :id)
                    (map (fn [{:keys [id mapping]}]
                           [id mapping])))
              outputs)
        src-schema+table->dst->schema+table
        (into {}
              (map (fn [{:keys [mapping] :as output}]
                     (let [src-schema (:schema output)
                           src-table (:name output)
                           dst-schema (:schema mapping)
                           dst-table (:name mapping)]
                       [[src-schema src-table]
                        [dst-schema dst-table]])))
              outputs)]
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
