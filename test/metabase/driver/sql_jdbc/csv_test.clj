(ns metabase.driver.sql-jdbc.csv-test
  (:require
   [clojure.test :refer [is testing]]
   [metabase.driver.sql-jdbc.csv :as csv]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest create-table-test
  (mt/with-driver :postgres
    ;; TODO: replace with another database creating macro
    (mt/with-actions-test-data
      (mt/with-db (mt/db)
        (testing "create a table from a csv file")
        (let [file-path "test/data/csv/airports.csv"
              table-name "airports"
              schema    (csv/file-schema file-path)
              rows      (csv/parse-rows schema file-path)]
          (csv/create-table! (mt/id) table-name schema)
          (csv/insert-rows! (mt/id) table-name rows)
          (sync/sync-database! (mt/db))
          (testing "table exists"
            (is (some? (t2/select-one 'Table :db_id (mt/id) :name table-name))))
          (is (some? (t2/select-one 'Field :table_id (mt/id :airports)))))
        (is (seq (mt/run-mbql-query airports
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :airports)}})))))))
