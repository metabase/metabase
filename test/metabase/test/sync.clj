(ns metabase.test.sync
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [Database]]
   [metabase.models.task-history :refer [TaskHistory]]
   [metabase.sync :as sync]
   [metabase.test.data :as data]
   [toucan2.core :as t2]))

(defn sync-steps-run-to-completion
  "Returns the number of sync steps that run succesfully by counting entries in `TaskHistory`"
  []
  (data/with-temp-copy-of-db
    ;; `sync-database!` does both sync an analysis steps
    (sync/sync-database! (t2/select-one Database :id (data/id)))
    (t2/count TaskHistory :db_id (data/id))))

(defn crash-fn
  "A function that always crashes"
  [& _]
  (throw (Exception. "simulated exception")))

(defmacro sync-survives-crash?
  "Can sync process survive `f` crashing?"
  [f]
  `(is (= (sync-steps-run-to-completion)
          (with-redefs [~f crash-fn]
            (sync-steps-run-to-completion)))))
