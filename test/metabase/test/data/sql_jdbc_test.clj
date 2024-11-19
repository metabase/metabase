(ns ^:mb/driver-tests metabase.test.data.sql-jdbc-test
  "Tests for SQL JDBC test extensions."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql-jdbc]))

(comment metabase.test.data.sql-jdbc/keep-me)

(deftest ^:parallel dataset-already-loaded?-test
  (mt/test-drivers (into #{}
                         (filter #(isa? driver/hierarchy % :sql-jdbc))
                         (mt/normal-drivers))
    (let [dbdef (tx/get-dataset-definition defs/test-data)]
      (testing `tx/dataset-already-loaded?
      ;; force loading of test-data
        (mt/db)
        (testing "should return true for test-data"
          (is (tx/dataset-already-loaded? driver/*driver* dbdef)))
        (testing "should return false for dataset that definitely does not exist"
          (is (not (tx/dataset-already-loaded? driver/*driver* (assoc dbdef :database-name "test-dataaaaa")))))))))
