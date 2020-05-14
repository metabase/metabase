(ns metabase.test.sync
  (:require [clojure.test :refer :all]
            [metabase
             [sync :as sync]
             [test :as mt]]
            [metabase.models
             [database :refer [Database]]
             [task-history :refer [TaskHistory]]]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(defn sync-steps-run-to-completion
  "Returns the number of sync steps that run succesfully by counting entries in `TaskHistory`"
  []
  (data/with-temp-copy-of-db
    ;; `sync-database!` does both sync an analysis steps
    (sync/sync-database! (Database (data/id)))
    (db/count TaskHistory :db_id (data/id))))

(defn crash-fn
  "A function that always crashes"
  [& _]
  (throw (Exception. "simulated exception")))

(defmacro sync-survives-crash?
  "Can sync process survive `f` crashing?"
  [f]
  `(is (= (sync-steps-run-to-completion)
          (mt/suppress-output
            (with-redefs [~f crash-fn]
              (sync-steps-run-to-completion))))))
