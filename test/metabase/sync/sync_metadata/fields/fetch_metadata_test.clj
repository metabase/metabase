(ns metabase.sync.sync-metadata.fields.fetch-metadata-test
  (:require [clojure.walk :as walk]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.sync.sync-metadata.fields.fetch-metadata :as sync-fields.fetch-metadata]
            [metabase.test.mock.toucanery :as toucanery]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; `our-metadata` should match up with what we have in the DB
(expect
  #{{:name          "id"
     :database-type "SERIAL"
     :base-type     :type/Integer
     :special-type  :type/PK
     :pk?           true}
    {:name          "buyer"
     :database-type "OBJECT"
     :base-type     :type/Dictionary
     :pk?           false
     :nested-fields #{{:name          "name"
                       :database-type "VARCHAR"
                       :base-type     :type/Text
                       :pk?           false}
                      {:name          "cc"
                       :database-type "VARCHAR"
                       :base-type     :type/Text
                       :pk?           false}}}
    {:name          "ts"
     :database-type "BIGINT"
     :base-type     :type/BigInteger
     :special-type  :type/UNIXTimestampMilliseconds
     :pk?           false}
    {:name          "toucan"
     :database-type "OBJECT"
     :base-type     :type/Dictionary
     :pk?           false
     :nested-fields #{{:name          "name"
                       :database-type "VARCHAR"
                       :base-type     :type/Text
                       :pk?           false}
                      {:name          "details"
                       :database-type "OBJECT"
                       :base-type     :type/Dictionary
                       :pk?           false
                       :nested-fields #{{:name          "weight"
                                         :database-type "DECIMAL"
                                         :base-type     :type/Decimal
                                         :special-type  :type/Category
                                         :pk?           false}
                                        {:name          "age"
                                         :database-type "INT"
                                         :base-type     :type/Integer
                                         :pk?           false}}}}}}
  (tt/with-temp* [Database [db {:engine ::toucanery/toucanery}]]
    (sync-metadata/sync-db-metadata! db)
    (let [transactions-table-id   (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
          remove-ids-and-nil-vals (partial walk/postwalk #(if-not (map? %)
                                                            %
                                                            (m/filter-vals some? (dissoc % :id))))]
      (remove-ids-and-nil-vals (#'sync-fields.fetch-metadata/our-metadata (Table transactions-table-id))))))
