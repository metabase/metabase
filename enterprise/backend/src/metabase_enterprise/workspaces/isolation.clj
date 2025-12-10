(ns metabase-enterprise.workspaces.isolation
  (:require
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]))

;;;; Driver multimethods
;; Implementations are in metabase-enterprise.workspaces.driver.{postgres,h2}

(defn dispatch-on-engine
  "Take engine from database `db` and dispatch on that."
  [database & _args]
  (driver.u/database->driver database))

(defmulti grant-read-access-to-tables!
  "Grant read access to these tables."
  {:added "0.59.0" :arglists '([database workspace tables])}
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
