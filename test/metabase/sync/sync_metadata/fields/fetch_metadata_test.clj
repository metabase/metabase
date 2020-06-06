(ns metabase.sync.sync-metadata.fields.fetch-metadata-test
  (:require [clojure
             [test :refer :all]
             [walk :as walk]]
            [medley.core :as m]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.sync.sync-metadata.fields.fetch-metadata :as sync-fields.fetch-metadata]
            [metabase.test.mock.toucanery :as toucanery]
            [toucan.db :as db]))

;; `our-metadata` should match up with what we have in the DB
(deftest does-metadata-match-test
  (mt/with-temp Database [db {:engine ::toucanery/toucanery}]
    (sync-metadata/sync-db-metadata! db)
    (is (= #{{:name          "id"
              :database-type "SERIAL"
              :base-type     :type/Integer
              :special-type  :type/PK
              :pk?           true
              :database-position 1}
             {:name          "buyer"
              :database-type "OBJECT"
              :base-type     :type/Dictionary
              :pk?           false
              :database-position 2
              :nested-fields #{{:name          "name"
                                :database-type "VARCHAR"
                                :base-type     :type/Text
                                :pk?           false
                                :database-position 2}
                               {:name          "cc"
                                :database-type "VARCHAR"
                                :base-type     :type/Text
                                :pk?           false
                                :database-position 2}}}
             {:name          "ts"
              :database-type "BIGINT"
              :base-type     :type/BigInteger
              :special-type  :type/UNIXTimestampMilliseconds
              :pk?           false
              :database-position 0}
             {:name          "toucan"
              :database-type "OBJECT"
              :base-type     :type/Dictionary
              :pk?           false
              :database-position 3
              :nested-fields #{{:name          "name"
                                :database-type "VARCHAR"
                                :base-type     :type/Text
                                :pk?           false
                                :database-position 3}
                               {:name          "details"
                                :database-type "OBJECT"
                                :base-type     :type/Dictionary
                                :pk?           false
                                :database-position 3
                                :nested-fields #{{:name          "weight"
                                                  :database-type "DECIMAL"
                                                  :base-type     :type/Decimal
                                                  :special-type  :type/Category
                                                  :pk?           false
                                                  :database-position 3}
                                                 {:name          "age"
                                                  :database-type "INT"
                                                  :base-type     :type/Integer
                                                  :pk?           false
                                                  :database-position 3}}}}}}

           (let [transactions-table-id   (u/get-id (db/select-one-id Table :db_id (u/get-id db), :name "transactions"))
                 remove-ids-and-nil-vals (partial walk/postwalk #(if-not (map? %)
                                                                   %
                                                                   (m/filter-vals some? (dissoc % :id))))]
             (remove-ids-and-nil-vals (#'sync-fields.fetch-metadata/our-metadata (Table transactions-table-id))))))))
