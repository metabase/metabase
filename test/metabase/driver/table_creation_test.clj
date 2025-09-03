(ns ^:mb/driver-tests metabase.driver.table-creation-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.table-creation :as tc]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]))

(set! *warn-on-reflection* true)

(deftest data-source->rows-test
  (testing "should return data for :rows type"
    (is (= [[1 "a"] [2 "b"]] (tc/data-source->rows {:type :rows :data [[1 "a"] [2 "b"]]}))))

  (testing "should throw for unsupported type"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Unsupported data source type: :unsupported"
         (tc/data-source->rows {:type :unsupported :data []})))))

(deftest create-table-from-schema!-test
  (mt/test-drivers (mt/normal-drivers)
    (let [driver       driver/*driver*
          db-id        (mt/id)
          table-name   (mt/random-name)
          schema-name  (sql.tx/session-schema driver)
          table-schema {:name    (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
                        :columns [{:name "id" :type :int :nullable? false}
                                  {:name "name" :type :text :nullable? true}]}]
      (mt/as-admin
        (testing "create-table-from-schema! should create the table successfully"
          (tc/create-table-from-schema! driver db-id table-schema)
          (let [table-exists? (driver/table-exists? driver db-id {:schema schema-name :name table-name})]
            (is (some? table-exists?) "Table should exist in the database schema")
            (driver/drop-table! driver db-id (:name table-schema))))))))

(deftest insert-from-source!-test
  (mt/test-drivers (mt/normal-drivers)
    (let [driver       driver/*driver*
          db-id        (mt/id)
          table-name   (mt/random-name)
          schema-name  (sql.tx/session-schema driver)
          table-schema {:name    (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
                        :columns [{:name "id" :type :int :nullable? false}
                                  {:name "name" :type :text :nullable? true}]}]
      (mt/as-admin
        (tc/create-table-from-schema! driver db-id table-schema)

        (testing "insert-from-source! should insert new rows correctly"
          (let [new-rows     [[2 "New Luke"] [3 "New Leia"]]
                data-source  {:type :rows :data new-rows}
                rows-inserted (tc/insert-from-source! driver db-id
                                                      (:name table-schema)
                                                      (mapv :name (:columns table-schema))
                                                      data-source)]
            (is (= (count new-rows) rows-inserted))))

        (driver/drop-table! driver db-id (:name table-schema))))))
