(ns metabase-enterprise.workspaces.table-remapping
  "Internal API for table-to-table remapping. Used by workspace isolation to redirect
   queries from production tables to workspace tables.

   A remapping is a single row in the app-db `table_remapping` table, consulted by the
   query processor middleware at query time. Two writers:

   - [[add-schema+table-mapping!]] — the primary writer. Inserts a row directly with
     idempotent upsert semantics.
   - [[record-remapping!]] — a thin wrapper for transform code that resolves the
     destination schema from the database's provisioned `WorkspaceDatabase` row before
     delegating to [[add-schema+table-mapping!]]."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn remap-table
  "Given a database ID, schema name, and table name, returns the remapped [schema, table-name]
   pair if a remapping exists, otherwise nil.

     (remap-table 6 \"my-schema\" \"my-table\")
     ;; => nil                              ; no remapping
     ;; => [\"new-schema\" \"new-table-name\"] ; remapped"
  [database-id from-schema from-table-name]
  (when-let [mapping (t2/select-one :model/TableRemapping
                                    :database_id database-id
                                    :from_schema from-schema
                                    :from_table_name from-table-name)]
    [(:to_schema mapping) (:to_table_name mapping)]))

(defenterprise workspace-remap-schema+name
  "Enterprise impl of the sync hook. Returns `[to-schema to-name]` for the
   isolated warehouse table when a `TableRemapping` row exists — sync asks the
   driver there, while app-db rows keep their logical identity. Deliberately
   ungated on premium features: if rows exist they must be respected, regardless
   of current token state (matches the rationale for
   `reconcile-workspace-database-refs-before-delete!`)."
  :feature :none
  [db-id schema table-name]
  (remap-table db-id schema table-name))

(defn- unique-violation?
  "True if `e` or any cause is a SQL unique-constraint violation. Handles Postgres and H2
   via SQLSTATE `23505` (SQL:2003 standard) and MySQL/MariaDB via SQLSTATE `23000` plus
   vendor error code 1062. Walks past non-matching `SQLException`s in the cause chain so
   a shallow wrap can't mask a deeper constraint violation."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? java.sql.SQLException cause)
      (let [sql-ex ^java.sql.SQLException cause]
        (or (case (.getSQLState sql-ex)
              "23505" true
              "23000" (= 1062 (.getErrorCode sql-ex))
              false)
            (recur (.getCause cause))))
      :else (recur (.getCause cause)))))

(defn add-schema+table-mapping!
  "Insert a single `table_remapping` row.

   Idempotent: a duplicate insert (unique-constraint violation on the
   `(database_id, from_schema, from_table_name)` constraint) is swallowed and the fn
   returns nil. Makes concurrent writers race-free at the DB level — no check-then-
   insert TOCTOU window.

     (add-schema+table-mapping! 6
       [\"my-schema\" \"my-table\"]
       [\"new-schema\" \"new-table-name\"])"
  [database-id [from-schema from-table-name] [to-schema to-table-name]]
  (try
    (t2/insert! :model/TableRemapping
                {:database_id     database-id
                 :from_schema     from-schema
                 :from_table_name from-table-name
                 :to_schema       to-schema
                 :to_table_name   to-table-name})
    (catch Exception e
      (if (unique-violation? e)
        nil
        (throw e)))))

(defn remove-schema+table-mapping!
  "Remove a table remapping by database ID and source [schema, table-name]."
  [database-id [from-schema from-table-name]]
  (t2/delete! :model/TableRemapping
              :database_id database-id
              :from_schema from-schema
              :from_table_name from-table-name))

(defn all-mappings-for-db
  "Return all remappings for a given database as a map of
   [from-schema, from-table-name] -> [to-schema, to-table-name]."
  [database-id]
  (into {}
        (map (fn [m]
               [[(:from_schema m) (:from_table_name m)]
                [(:to_schema m) (:to_table_name m)]]))
        (t2/select :model/TableRemapping :database_id database-id)))

(defn clear-mappings-for-db!
  "Remove all remappings for a given database."
  [database-id]
  (t2/delete! :model/TableRemapping :database_id database-id))

(defn record-remapping!
  "Record a table remapping for a workspaced database. Resolves the destination schema
   from the database's provisioned `WorkspaceDatabase` row, then delegates to
   [[add-schema+table-mapping!]] (which is itself idempotent).

   Throws when the database is not workspaced (`ws/db-workspace-schema` returns nil):
   a caller getting here in that case is a programming error — the transform path
   should gate on [[ws/db-workspace-schema]] first."
  [db-id from-schema from-table-name to-table-name]
  (let [workspace-schema (ws/db-workspace-schema db-id)]
    (when-not workspace-schema
      (throw (ex-info "Cannot record remapping: database is not workspaced"
                      {:db-id db-id
                       :from-schema from-schema
                       :from-table-name from-table-name
                       :to-table-name to-table-name})))
    (add-schema+table-mapping! db-id
                               [from-schema from-table-name]
                               [workspace-schema to-table-name])))

