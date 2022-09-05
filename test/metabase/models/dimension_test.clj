(ns metabase.models.dimension-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field :refer [Field]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]))

(deftest identity-hash-test
  (testing "Dimension hashes are composed of the proper field hash, and the human-readable field hash"
    (mt/with-temp* [Database  [db     {:name "field-db" :engine :h2}]
                    Table     [table  {:schema "PUBLIC" :name "widget" :db_id (:id db)}]
                    Field     [field1 {:name "sku" :table_id (:id table)}]
                    Field     [field2 {:name "human" :table_id (:id table)}]
                    Dimension [dim    {:field_id (:id field1) :human_readable_field_id (:id field2)}]]
      (is (= "d579f125"
             (serdes.hash/raw-hash [(serdes.hash/identity-hash field1) (serdes.hash/identity-hash field2)])
             (serdes.hash/identity-hash dim))))))
