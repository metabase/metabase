(ns metabase.models.dimension-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest identity-hash-test
  (testing "Dimension hashes are composed of the proper field hash, and the human-readable field hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [:model/Database  db     {:name "field-db" :engine :h2}
                     :model/Table     table  {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     :model/Field     field1 {:name "sku" :table_id (:id table)}
                     :model/Field     field2 {:name "human" :table_id (:id table)}
                     :model/Dimension dim    {:field_id                (:id field1)
                                              :human_readable_field_id (:id field2)
                                              :created_at              now}]
        (is (= "c52f8889"
               (serdes/raw-hash [(serdes/identity-hash field1) (serdes/identity-hash field2) now])
               (serdes/identity-hash dim)))))))
