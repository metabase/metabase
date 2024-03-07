(ns metabase.test.persistence
  (:require
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.task.persist-refresh :as task.persist-refresh]
   [metabase.test.data :as data]
   [metabase.test.util :as tu]))

(defn with-persistence-enabled*
  [f]
  (tu/with-temporary-setting-values [:persisted-models-enabled true]
    (ddl.i/check-can-persist (data/db))
    (persisted-info/ready-database! (data/id))
    (let [persist-fn (fn persist-fn []
                       (#'task.persist-refresh/refresh-tables!
                        (data/id)
                        (var-get #'task.persist-refresh/dispatching-refresher)))]
      (f persist-fn))))

(defmacro with-persistence-enabled
  "Does the necessary setup to enable persistence on the current db. Provide a binding for a function to persist
  everything.

  (with-persisted [persist-models!]
    (let [mbql-query (mt/mbql-query categories)]
      (mt/with-temp [Card model {:name \"model\"
                                 :type :model
                                 :dataset_query mbql-query
                                 :database_id (mt/id)}]
        (persist-models!))
        ...))"
  [[persist-fn-binding] & body]
  `(with-persistence-enabled* (fn [~persist-fn-binding] ~@body)))
