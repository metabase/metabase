(ns metabase.driver.hooks
  "Hooks that let a driver know that the details of a Database changed, which the SQL JDBC drivers use to close its
  connection pools (see `metabase.driver/notify-database-updated`). The model tells it when a Database is deleted."
  (:require
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [metabase.util.write-batch :as write-batch]
   [toucan2.protocols :as t2.protocols]))

(set! *warn-on-reflection* true)

(defn- connection-state
  "What of `database` the resources of its driver depend on, which leaves out the settings that do not change what
  they serve (metabase#27877)."
  [database]
  (cond-> (perf/select-keys database [:engine :details :settings])
    (map? (:settings database)) (m/dissoc-in [:settings :database-enable-actions])))

(defn- notify-later!
  "Have the driver of the Database `engine` `id` notified once the batch of writes ends, with the Database
  `(lib-database)` gives."
  [engine id lib-database]
  (write-batch/mark! [::database id]
                     (constantly nil)
                     (fn [_]
                       (try
                         (driver/notify-database-updated engine (lib-database))
                         (catch Throwable e
                           (log/warnf "Failed to notify the driver of Database %s: %s" id (ex-message e)))))))

(defn before-update
  "Hook for `row` of `model` before it is updated."
  [model row]
  (when (and (= model :model/Database)
             (not= (connection-state (t2.protocols/original row)) (connection-state row)))
    (notify-later! (:engine row) (:id row) #(driver.u/lib-database (:id row)))))

(mi/define-hook-trait :hook/driver
  {:before-update before-update})
