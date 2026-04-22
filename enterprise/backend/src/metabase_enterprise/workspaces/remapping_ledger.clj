(ns metabase-enterprise.workspaces.remapping-ledger
  "Driver-level helpers for the `_mb_remappings` ledger table that lives *inside each
   workspace schema* on the workspaced warehouse. The ledger is the source of truth for
   which production tables have been redirected to which workspace-local copies; the
   app-db `table_remapping` table is a cache rebuilt from it on every process start.

   Why it lives on the warehouse: the app-db in this deployment model is thrown away
   and recreated on boot, so app-db rows can't survive a fresh start. The workspace
   schema, however, is owned by the workspace user and persists across boots.

   All three helpers take a connectable (typically a pooled connection spec obtained
   via `sql-jdbc.conn/db->pooled-connection-spec`) plus the workspace schema name. The
   caller is responsible for transaction lifetimes. Two supported usage shapes:

   1. Bundle `ensure-ledger-table!` and `record-remap!` in the same
      `jdbc/with-db-transaction` as the transform's physical output-table write, so
      all three commit atomically. Then call
      `metabase-enterprise.workspaces.table-remapping/add-schema+table-mapping!`
      after the warehouse transaction commits to populate the app-db cache.

   2. Call `metabase-enterprise.workspaces.table-remapping/record-remapping!`, which
      wraps the two ledger ops in its own warehouse transaction (separate from any
      transform-side transaction) and then writes the app-db cache. Simpler at the
      cost of atomicity between the ledger write and the transform's physical write.

   Postgres-only for now (Redshift inherits via driver hierarchy).

   SQL identifier quoting is done via `driver.sql.util/quote-name` to keep consistency
   with sibling driver code (e.g. `grant-workspace-read-access-sqls` in
   `metabase.driver.postgres`). The `from_schema`, `from_table_name`, and `to_table_name`
   values are passed as bind parameters — never interpolated."
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase.driver.sql.util :as sql.u]))

(set! *warn-on-reflection* true)

(def ^:private ledger-table-name
  "Name of the per-workspace-schema ledger table."
  "_mb_remappings")

(defn- q
  "Double-quote an identifier for Postgres using the driver-agnostic quoter.
   `category` is one of `:schema`, `:table`, etc. — see `sql.u/quote-name`."
  [category ^String s]
  (sql.u/quote-name :postgres category s))

(defn- create-ledger-table-sql
  "Returns the CREATE TABLE IF NOT EXISTS statement that creates `_mb_remappings` inside
   `workspace-schema`. Pure; no IO. Private — tests reach it via the var."
  [^String workspace-schema]
  (format (str "CREATE TABLE IF NOT EXISTS %s.%s ("
               "from_schema TEXT NOT NULL, "
               "from_table_name TEXT NOT NULL, "
               "to_table_name TEXT NOT NULL, "
               "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
               "PRIMARY KEY (from_schema, from_table_name))")
          (q :schema workspace-schema)
          (q :table ledger-table-name)))

(defn- record-remap-sql
  "Returns the INSERT ... ON CONFLICT DO NOTHING statement (a `[sql & params]` vector).
   Pure; no IO. Private — tests reach it via the var."
  [^String workspace-schema ^String from-schema ^String from-table-name ^String to-table-name]
  [(format (str "INSERT INTO %s.%s (from_schema, from_table_name, to_table_name) "
                "VALUES (?, ?, ?) "
                "ON CONFLICT (from_schema, from_table_name) DO NOTHING")
           (q :schema workspace-schema)
           (q :table ledger-table-name))
   from-schema
   from-table-name
   to-table-name])

(defn- read-ledger-sql
  "Returns the SELECT statement (a `[sql]` vector) that reads all rows from the ledger
   in the given workspace schema. Pure; no IO. Private — tests reach it via the var."
  [^String workspace-schema]
  [(format "SELECT from_schema, from_table_name, to_table_name FROM %s.%s"
           (q :schema workspace-schema)
           (q :table ledger-table-name))])

(defn- undefined-table?
  "True if `e` or any cause is a Postgres SQLSTATE `42P01` (undefined_table). Used by
   [[read-ledger!]] to distinguish \"ledger doesn't exist yet\" from real errors."
  [^Throwable e]
  (loop [^Throwable cause e]
    (cond
      (nil? cause) false
      (instance? java.sql.SQLException cause)
      (or (= "42P01" (.getSQLState ^java.sql.SQLException cause))
          (recur (.getCause cause)))
      :else (recur (.getCause cause)))))

(defn ensure-ledger-table!
  "Idempotently create `_mb_remappings` inside `workspace-schema` on the connection.
   Safe to call repeatedly — CREATE TABLE IF NOT EXISTS is a no-op when present."
  [conn workspace-schema]
  (jdbc/execute! conn [(create-ledger-table-sql workspace-schema)]))

(defn record-remap!
  "Insert a (`from-schema`, `from-table-name` → `to-table-name`) mapping into the ledger.
   Idempotent via ON CONFLICT DO NOTHING — transform re-runs write the same deterministic
   name so there's nothing to update."
  [conn workspace-schema from-schema from-table-name to-table-name]
  (jdbc/execute! conn (record-remap-sql workspace-schema from-schema from-table-name to-table-name)))

(defn read-ledger!
  "Read all rows from `workspace-schema._mb_remappings`. Returns a sequence of maps with
   keys `:from_schema`, `:from_table_name`, `:to_table_name`.

   Returns `nil` if the ledger table does not exist yet (the workspace has never recorded
   a remap). Caller must treat nil like empty."
  [conn workspace-schema]
  (try
    (jdbc/query conn (read-ledger-sql workspace-schema))
    (catch Exception e
      (if (undefined-table? e)
        nil
        (throw e)))))
