(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.resolve-source-table :as resolve-source-table]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(defn- resolve-source-table [query]
  ((resolve-source-table/resolve-source-table identity) query))

;; does `resolve-source-table` resolve source tables?
(expect
  {:id (data/id :venues), :name "VENUES", :schema "PUBLIC"}
  (qp.store/with-store
    (qp.store/store-database! (data/db))
    (resolve-source-table {:database (data/id)
                           :type     :query
                           :query    {:source-table (data/id :venues)}})
    (qp.store/table (data/id :venues))))

;; If the Table does not belong to the current Database, does it throw an Exception?
(expect
  Exception
  (qp.store/with-store
    (qp.store/store-database! (data/db))
    (tt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]]
      (resolve-source-table {:database (data/id)
                             :type     :query
                             :query    {:source-table table-id}})
      (qp.store/table table-id))))
