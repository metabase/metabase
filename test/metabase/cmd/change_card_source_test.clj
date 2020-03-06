(ns metabase.cmd.change-card-source-test
  (:require [clojure.test :refer :all]
            [metabase.cmd.change-card-source :as sut]
            [metabase.models :refer [Card Database Field Table]]
            [toucan.util.test :as tt]))

(deftest add-field-mapping
  (tt/with-temp* [Table [{table-1-id :id} {}]
                  Field [{field-1-id :id} {:table_id table-1-id :name "field 1"}]
                  Field [{field-2-id :id} {:table_id table-1-id :name "field 2"}]]

    (is (= {:table  {:old table-1-id :new table-1-id}
            :fields {"field 1"  "field 2"
                     field-1-id field-2-id
                     field-2-id field-2-id}}
           (sut/add-field-mapping {:table  {:old table-1-id :new table-1-id}
                                   :fields {"field 1" "field 2"}})))))

(deftest remap-cards
  (tt/with-temp* [Database [{db-1-id :id} {}]
                  Database [{db-2-id :id} {}]
                  Table    [{table-1-id :id} {}]
                  Table    [{table-2-id :id} {}]
                  Field    [{field-1-id :id} {:table_id table-1-id :name "field 1"}]
                  Field    [{field-2-id :id} {:table_id table-1-id :name "field 2"}]
                  Field    [{field-3-id :id} {:table_id table-2-id :name "field 3"}]
                  Field    [{field-4-id :id} {:table_id table-2-id :name "field 4"}]
                  Card     [card {:database_id   db-1-id
                                  :table_id      table-1-id
                                  :dataset_query {:query    {:source-table table-1-id
                                                             :filter       [:time-interval [:field-id field-1-id] "-30" :day]
                                                             :aggregation  [[:sum [:field-id field-2-id]]]}
                                                  :database db-1-id}}]]

    (is (= [{:database_id   db-2-id
             :table_id      table-2-id
             :dataset_query {:query    {:source-table table-2-id
                                        :filter       [:time-interval [:field-id field-3-id] :-30 :day]
                                        :aggregation  [[:sum [:field-id field-2-id]]]}
                             :database db-2-id}}]
           (map #(select-keys % [:database_id :table_id :dataset_query])
                (sut/remap-cards {:database {:old db-1-id :new db-2-id}
                                  :table    {:old table-1-id :new table-2-id}
                                  :fields   {"field 1" "field 3"}}))))))
