(ns metabase.models.dimension-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest identity-hash-test
  (testing "Dimension hashes are composed of the proper field hash, and the human-readable field hash"
    (let [now #t "2022-09-01T12:34:56Z"]
      (mt/with-temp [:model/Database  db     {:name "field-db" :engine :h2}
                     :model/Table     table  {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     :model/Field     field1 {:name "sku" :table_id (:id table)}
                     :model/Field     field2 {:name "human" :table_id (:id table)}
                     :model/Dimension dim    {:field_id                (:id field1)
                                              :human_readable_field_id (:id field2)
                                              :created_at              now}]
        (is (= "0f5162d3"
               (serdes/raw-hash [(serdes/identity-hash field1) (serdes/identity-hash field2) (:created_at dim)])
               (serdes/identity-hash dim)))))))
