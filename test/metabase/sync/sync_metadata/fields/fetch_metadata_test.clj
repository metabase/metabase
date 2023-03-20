(ns metabase.sync.sync-metadata.fields.fetch-metadata-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.sync.sync-metadata.fields.fetch-metadata :as fetch-metadata]
   [metabase.test :as mt]
   [metabase.test.mock.toucanery :as toucanery]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; `our-metadata` should match up with what we have in the DB
(deftest does-metadata-match-test
  (mt/with-temp Database [db {:engine ::toucanery/toucanery}]
    (sync-metadata/sync-db-metadata! db)
    (is (= #{{:name              "id"
              :database-type     "SERIAL"
              :base-type         :type/Integer
              :effective-type    :type/Integer
              :semantic-type     :type/PK
              :pk?               true
              :database-required false
              :database-is-auto-increment true}
             {:name              "buyer"
              :database-type     "OBJECT"
              :base-type         :type/Dictionary
              :effective-type    :type/Dictionary
              :pk?               false
              :database-required false
              :database-is-auto-increment false
              :nested-fields     #{{:name              "name"
                                    :database-type     "VARCHAR"
                                    :base-type         :type/Text
                                    :effective-type    :type/Text
                                    :pk?               false
                                    :database-required false
                                    :database-is-auto-increment false}
                                   {:name              "cc"
                                    :database-type     "VARCHAR"
                                    :base-type         :type/Text
                                    :effective-type    :type/Text
                                    :pk?               false
                                    :database-required false
                                    :database-is-auto-increment false}}}
             {:name              "ts"
              :database-type     "BIGINT"
              :base-type         :type/BigInteger
              :effective-type    :type/DateTime
              :coercion-strategy :Coercion/UNIXMilliSeconds->DateTime
              :pk?               false
              :database-is-auto-increment false
              :database-required false}
             {:name              "toucan"
              :database-type     "OBJECT"
              :base-type         :type/Dictionary
              :effective-type    :type/Dictionary
              :pk?               false
              :database-required false
              :database-is-auto-increment false
              :nested-fields     #{{:name              "name"
                                    :database-type     "VARCHAR"
                                    :base-type         :type/Text
                                    :effective-type    :type/Text
                                    :pk?               false
                                    :database-required false
                                    :database-is-auto-increment false}
                                   {:name              "details"
                                    :database-type     "OBJECT"
                                    :base-type         :type/Dictionary
                                    :effective-type    :type/Dictionary
                                    :pk?               false
                                    :database-required false
                                    :database-is-auto-increment false
                                    :nested-fields     #{{:name              "weight"
                                                          :database-type     "DECIMAL"
                                                          :base-type         :type/Decimal
                                                          :effective-type    :type/Decimal
                                                          :semantic-type     :type/Category
                                                          :pk?               false
                                                          :database-required false
                                                          :database-is-auto-increment false}
                                                         {:name              "age"
                                                          :database-type     "INT"
                                                          :base-type         :type/Integer
                                                          :effective-type    :type/Integer
                                                          :pk?               false
                                                          :database-required false
                                                          :database-is-auto-increment false}}}}}}

           (let [transactions-table-id   (u/the-id (t2/select-one-pk Table :db_id (u/the-id db), :name "transactions"))
                 remove-ids-and-nil-vals (partial walk/postwalk #(if-not (map? %)
                                                                   %
                                                                   ;; database-position isn't stable since they are
                                                                   ;; defined in sets. changing keys will change the
                                                                   ;; order in the set implementation
                                                                   (m/filter-vals some? (dissoc % :id :database-position))))]
             (remove-ids-and-nil-vals (#'fetch-metadata/our-metadata (t2/select-one Table :id transactions-table-id))))))))
