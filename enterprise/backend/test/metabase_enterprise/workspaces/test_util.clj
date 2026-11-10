(ns metabase-enterprise.workspaces.test-util
  "Shared test helpers for the workspaces module."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(defn driver-loadable?
  "True iff `engine`'s driver class is on the test classpath. Wraps
   `driver/the-initialized-driver` so tests that walk all workspace-capable
   drivers can `(when (driver-loadable? :sqlserver) ...)` to silently skip
   rows for drivers absent from the current `DRIVERS` env. Used by per-driver
   corpus / remapping tests where most drivers are off-classpath on the
   default H2-only run."
  [engine]
  (try (driver/the-initialized-driver engine) true
       (catch Throwable _ false)))

(defn with-workspace-db!
  "Make this instance a workspace in which the Database `db-id` writes to `schema`
   (its `database-workspace-schema`), run `thunk`, then turn workspace mode off and
   restore the database's settings."
  [db-id schema thunk]
  (mt/with-temp-vals-in-db :model/Database db-id {:settings {:database-workspace-schema schema}}
    (ws.settings/workspaces-enabled! true)
    (try (thunk)
         (finally (ws/clear-instance-workspace!)))))
