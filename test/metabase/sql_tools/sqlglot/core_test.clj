(ns metabase.sql-tools.sqlglot.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.test :as mt]))

;;;; validate-query

(deftest validate-query-syntax-error-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "complete nonsense query")]
      (testing "Gibberish SQL returns syntax error"
        (is (= #{(lib/syntax-error)}
               (sql-tools/validate-query-impl :sqlglot driver/*driver* query)))))))

(deftest validate-query-missing-table-alias-wildcard-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select foo.* from (select id from orders)")]
      (testing "Wildcard with unknown table alias returns missing-table-alias error"
        (is (= #{(lib/missing-table-alias-error "foo")}
               (sql-tools/validate-query-impl :sqlglot driver/*driver* query)))))))

(deftest validate-query-missing-table-alias-column-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select bad.id from products")]
      (sql-tools/validate-query-impl :sqlglot :postgres query)
      (testing "Column with unknown table qualifier returns missing-table-alias error"
        (sql-tools/validate-query-impl :sqlglot :postgres query)))))

(deftest validate-query-missing-column-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select nonexistent from orders")]
      (testing "Reference to non-existent column returns missing-column error"
        (is (= #{(lib/missing-column-error "nonexistent")}
               (sql-tools/validate-query-impl :sqlglot driver/*driver* query)))))))

(deftest validate-query-valid-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select id, total from orders")]
      (testing "Valid query returns empty error set"
        (is (= #{}
               (sql-tools/validate-query-impl :sqlglot driver/*driver* query)))))))
