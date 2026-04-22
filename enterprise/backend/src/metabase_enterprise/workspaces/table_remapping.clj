(ns metabase-enterprise.workspaces.table-remapping
  "Internal API for table-to-table remapping. Used by workspace isolation to redirect
   queries from production tables to workspace tables.

   Durability model. A remapping is only durable when it exists in *both* places:

   - The app-db [[:model/TableRemapping]] cache, consulted by the query processor
     middleware at query time.
   - The warehouse-side `_mb_remappings` ledger inside the workspace schema, the
     source of truth that survives an app-db reset.

   Transform code must therefore call [[record-remapping!]], which writes both. The
   low-level [[add-schema+table-mapping!]] only writes the app-db cache and is
   reserved for the poller replaying rows from the ledger."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.table-remapping.model]
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
  "App-db-only writer for a single `table_remapping` row. Do NOT call this from
   transform code — it bypasses the warehouse-side `_mb_remappings` ledger, so the
   mapping would vanish on the next app-db reset. Transforms must use
   [[record-remapping!]] instead, which writes the ledger and this cache together.

   The only production caller is [[metabase-enterprise.workspaces.remapping-poll]],
   which replays ledger rows that the ledger is already the source of truth for;
   writing back to the ledger would be circular.

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

(defn- write-ledger!
  "Open a pooled connection to the workspaced warehouse and insert the mapping into
   `workspace-schema._mb_remappings` inside a single transaction. Idempotent via
   ON CONFLICT DO NOTHING in [[ledger/record-remap!]]."
  [db-id workspace-schema from-schema from-table-name to-table-name]
  (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)]
    (jdbc/with-db-transaction [tx conn-spec]
      (ledger/ensure-ledger-table! tx workspace-schema)
      (ledger/record-remap! tx workspace-schema from-schema from-table-name to-table-name))))

(defn record-remapping!
  "Durably record a table remapping for a workspaced database: writes the workspace
   warehouse-side `_mb_remappings` ledger (the source of truth) and the app-db
   `table_remapping` cache in that order.

   Warehouse write first, app-db second — so that a mid-op failure leaves the
   ledger truthful and the poller will catch the app-db up on its next tick.

   Idempotent at the DB level on both sides: the ledger uses ON CONFLICT DO NOTHING;
   [[add-schema+table-mapping!]] swallows a SQLSTATE 23505 unique-constraint
   violation. Safe to call concurrently from multiple callers with the same mapping.

   Transaction boundary: the warehouse-side ledger writes happen in their own
   transaction, opened by this fn. They are NOT bundled with any transform-side
   transaction that produced the physical output table. If atomic co-commit with
   the transform's write is required, call [[ledger/ensure-ledger-table!]] and
   [[ledger/record-remap!]] directly inside that transaction, then call
   [[add-schema+table-mapping!]] for the app-db side.

   This is the function transform code must call for the ledger+cache pair. Do NOT
   call [[add-schema+table-mapping!]] directly from transform code — it updates
   only the app-db cache and bypasses the ledger.

   Throws when the database is not workspaced (`ws/db-workspace-schema` returns
   nil): a caller getting here in that case is a programming error — the
   transform path should gate on [[ws/active?]]/[[ws/db-workspace-schema]] first."
  [db-id from-schema from-table-name to-table-name]
  (let [workspace-schema (ws/db-workspace-schema db-id)]
    (when-not workspace-schema
      (throw (ex-info "Cannot record remapping: database is not workspaced"
                      {:db-id db-id
                       :from-schema from-schema
                       :from-table-name from-table-name
                       :to-table-name to-table-name})))
    (write-ledger! db-id workspace-schema from-schema from-table-name to-table-name)
    (add-schema+table-mapping! db-id
                               [from-schema from-table-name]
                               [workspace-schema to-table-name])))
