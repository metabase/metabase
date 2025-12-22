(ns metabase-enterprise.workspaces.isolation
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]))

;;;; Driver multimethods
;; Implementations are in metabase-enterprise.workspaces.driver.{postgres,h2,sql-jdbc}

(defmulti grant-read-access-to-tables!
  "Grant read access to these tables.
   `database-or-conn` can be a database map or {:connection conn} to reuse an existing connection."
  {:added "0.59.0" :arglists '([driver database-or-conn workspace tables])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti init-workspace-database-isolation!
  "Create database isolation for a workspace. Return the database details.
   `database-or-conn` can be a database map or {:connection conn} to reuse an existing connection."
  {:added "0.59.0" :arglists '([driver database-or-conn workspace])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti destroy-workspace-isolation!
  "Destroy all database resources created for workspace isolation.
  This includes dropping tables, schemas/databases, users, roles, and logins.
  Fails fast on first error. Should be called when deleting a workspace.
  `database-or-conn` can be a database map or {:connection conn} to reuse an existing connection."
  {:added "0.59.0" :arglists '([driver database-or-conn workspace])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;;;; Permission checking

(defmulti check-isolation-permissions
  "Check if database connection has sufficient permissions for workspace isolation.
   Runs test operations in a transaction that is always rolled back.

   `test-table` is an optional {:schema ... :name ...} map used to test GRANT SELECT.
   If nil, the grant test is skipped.

   Returns nil on success, or an error message string on failure.

   Default :sql-jdbc implementation tests CREATE SCHEMA, CREATE USER, GRANT, and DROP.
   Drivers can override for database-specific syntax."
  {:added "0.59.0" :arglists '([driver database test-table])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

;;;; Public API

(defn ensure-database-isolation!
  "Wrapper around the driver method, to make migrations easier in future."
  [workspace database]
  (init-workspace-database-isolation! (driver.u/database->driver database) database workspace))

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
