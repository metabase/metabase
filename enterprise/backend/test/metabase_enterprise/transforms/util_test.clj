(ns ^:mb/driver-tests metabase-enterprise.transforms.util-test
  "Tests for transform utility functions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]))

(set! *warn-on-reflection* true)

(deftest temp-table-name-test
  (testing "temp-table-name generates valid table names respecting driver limits"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (let [driver driver/*driver*]

        (testing "Basic table name generation"
          (let [result (transforms.util/temp-table-name driver :base_table "test")]
            (is (keyword? result))
            (is (nil? (namespace result)))
            (is (str/starts-with? (name result) "base_table_test_"))))

        (testing "Table name with very large base name respects driver limits"
          (let [very-long-base-name (keyword (apply str (repeat 200 "a")))
                result (transforms.util/temp-table-name driver very-long-base-name "test")
                max-len (or (driver/table-name-length-limit driver) Integer/MAX_VALUE)
                actual-name (name result)]
            (is (keyword? result))
            (is (<= (count actual-name) max-len))
            (is (re-find #"_test_\d+$" actual-name))))

        (testing "Table name preserves namespace when present"
          (let [result (transforms.util/temp-table-name driver :schema/base_table "test")]
            (is (= "schema" (namespace result)))
            (is (str/starts-with? (name result) "base_table_test_"))))))))

(deftest temp-table-name-creates-table-test
  (testing "temp-table-name produces names that can actually create tables"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (let [driver driver/*driver*
            db-id (mt/id)

            long-base-name (keyword (apply str (repeat 1000 "test")))

            table-name (transforms.util/temp-table-name driver long-base-name "temp")
            schema-name (when (get-method sql.tx/session-schema driver)
                          (sql.tx/session-schema driver))
            qualified-table-name (if schema-name
                                   (keyword schema-name (name table-name))
                                   table-name)
            column-definitions {"id" (driver/type->database-type driver :type/Integer)}]
        (mt/as-admin
          (try
            (testing "Can create table with generated temp name"
              (driver/create-table! driver db-id qualified-table-name column-definitions {})
              (when-not (= driver :mongo) ;; mongo doesn't actually create tables
                (is (driver/table-exists? driver (mt/db) {:schema schema-name :name (name table-name)}))))
            (finally
              (try
                (driver/drop-table! driver db-id qualified-table-name)
                (catch Exception _e
                  ;; Ignore cleanup errors
                  nil)))))))))
