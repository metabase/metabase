(ns metabase-enterprise.workspaces.isolation
  "Workspace database isolation functions.

  The actual driver-specific implementations are now in the driver files:
  - metabase.driver.h2
  - metabase.driver.postgres
  - metabase.driver.redshift
  - metabase.driver.snowflake
  - metabase.driver.sqlserver
  - metabase.driver.clickhouse
  - metabase.driver.bigquery-cloud-sdk

  This namespace provides the public API for workspace isolation."
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]))

;;;; Delegation to driver methods
;; The actual multimethod implementations are now in the individual driver files.
;; These functions dispatch through the driver multimethods.

(defn grant-read-access-to-tables!
  "Grant read access to these tables.
   Delegates to driver/grant-workspace-read-access!"
  [database workspace tables]
  (driver/grant-workspace-read-access! (driver.u/database->driver database) database workspace tables))

(defn destroy-workspace-isolation!
  "Destroy all database resources created for workspace isolation.
   This includes dropping tables, schemas/databases, users, roles, and logins.
   Fails fast on first error. Should be called when deleting a workspace.
   Delegates to driver/destroy-workspace-isolation!"
  [database workspace]
  (driver/destroy-workspace-isolation! (driver.u/database->driver database) database workspace))

;;;; Public API

(defn ensure-database-isolation!
  "Wrapper around the driver method, to make migrations easier in future."
  [workspace database]
  (driver/init-workspace-isolation! (driver.u/database->driver database) database workspace))

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
