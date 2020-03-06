(ns metabase.cmd.change-card-source-test
  (:require [metabase.cmd.change-card-source :as sut]
            [metabase.models :refer [Card Database Field Table]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [clojure.test :refer :all]
            [toucan.util.test :as tt]))

(deftest remap-cards
  (tt/with-temp* [Database [db-1 {}]
                  Database [db-2 {}]
                  Table    [table-1 {}]
                  Table    [table-2 {}]
                  Field    [field-1 {:table_id (u/get-id table-1) :name "field 1"}]
                  Field    [field-2 {:table_id (u/get-id table-1) :name "field 2"}]
                  Field    [field-3 {:table_id (u/get-id table-2) :name "field 3"}]
                  Field    [field-4 {:table_id (u/get-id table-2) :name "field 4"}]
                  Card     [card {:database_id   db-1
                                  :table_id      table-1
                                  :dataset_query {:query    (str {:source-table table-1
                                                                  :filter       [:time-interval [:field-id field-1]]
                                                                  :aggregation  [[:sum [:field-id field-2]]]})
                                                  :database db-1}}]]

    (is (= []
           (sut/remap-cards {:database {:old db-1 :new db-2}
                             :table    {:old table-1 :new table-2}
                             :fields   {"field 1" "field 3"}})))))
