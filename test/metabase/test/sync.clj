(ns metabase.test.sync
  (:require [metabase.models.task-history :refer [TaskHistory]]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(defmacro sync-steps-run-to-competion
  "Runs `body` presumably containing calls to sync steps and counts the number of completed steps"
  [& body]
  `(data/with-temp-copy-of-db
     ~@body
     (db/count TaskHistory :db_id (data/id))))

(defn crash-fn
  "A function that always crashes"
  [& _]
  (throw (Exception. "simulated exception")))
