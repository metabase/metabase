(ns metabase.test.data.sql-jdbc-test
  "Tests for SQL JDBC test extensions."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql-jdbc]))

(comment metabase.test.data.sql-jdbc/keep-me)

(deftest ^:parallel dataset-already-loaded-test?
  (mt/test-drivers (into #{}
                         (filter #(isa? driver/hierarchy % :sql-jdbc))
                         (mt/normal-drivers))
    (testing `tx/dataset-already-loaded?
      ;; force loading of test-data
      (mt/db)
      (testing "should return true for test-data"
        (is (tx/dataset-already-loaded? driver/*driver* "test-data")))
      (testing "should return false for dataset that definitely does not exist"
        (is (not (tx/dataset-already-loaded? driver/*driver* "test-dataaaaa")))))))
