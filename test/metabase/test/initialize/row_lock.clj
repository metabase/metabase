(ns metabase.test.initialize.row-lock
  (:require
   [metabase.app-db.cluster-lock :as app-db.cluster-lock]
   [toucan2.core :as t2]))

(defn init!
  "Create the lock before these fixtures run. On mysql and mariadb attempting to concurrently create
  this lock inside an extremely nested transaction can fail rolling back the rest of the transaction
  Outside of the test environment this is fine because we can retry just the transaction the cluster
  lock is used in"
  []
  (let [lock-name-str (str (namespace app-db.cluster-lock/card-statistics-lock)
                           "/" (name app-db.cluster-lock/card-statistics-lock))]
      ;; Create cluster lock row before running tests
    (when-not (t2/exists? :metabase_cluster_lock :lock_name lock-name-str)
      (t2/query-one {:insert-into [:metabase_cluster_lock] :columns [:lock_name] :values [[lock-name-str]]}))))
