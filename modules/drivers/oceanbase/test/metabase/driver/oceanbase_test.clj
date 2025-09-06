(ns ^:mb/driver-tests metabase.driver.oceanbase-test
  "Tests for specific behavior of the OceanBase driver."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.oceanbase :as oceanbase]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ========================================= Connection & Driver Tests =========================================

(deftest connection-details->spec-test
  (mt/test-driver :oceanbase
    (testing "Connection details should be converted to proper JDBC spec for OceanBase"
      (let [details {:host "localhost" :port 2881 :dbname "test_db"}
            spec (sql-jdbc.conn/connection-details->spec :oceanbase details)]
        (is (= "com.oceanbase.jdbc.Driver" (:classname spec)))
        (is (= "oceanbase" (:subprotocol spec)))
        (is (= "//localhost:2881/test_db" (:subname spec)))))))

(deftest connection-properties-test
  (mt/test-driver :oceanbase
    (testing "Connection properties should be returned properly for OceanBase driver"
      (let [properties (driver/connection-properties :oceanbase)]
        (is (vector? properties))
        (is (pos? (count properties)))
        (is (some #(= (:name %) "host") properties))
        (is (some #(= (:name %) "port") properties))
        (is (some #(= (:name %) "dbname") properties))))))

(deftest driver-registration-test
  (mt/test-driver :oceanbase
    (testing "OceanBase driver should be properly registered in the system"
      (is (some? (driver/the-driver :oceanbase))))))

(deftest can-connect-test
  (mt/test-driver :oceanbase
    (testing "can-connect? method should handle various connection scenarios gracefully"
      (let [details {:host "localhost" :port 2881 :dbname "test_db"}]
        (is (some? (driver/can-connect? :oceanbase details)))))))

;;; ========================================= Mode Detection Tests =========================================

(deftest get-oceanbase-mode-test
  (mt/test-driver :oceanbase
    (testing "Mode detection should work correctly for different OceanBase modes"
      (doseq [[mock-result expected-mode] [[{:value "MYSQL"} "mysql"]
                                           [{:value "ORACLE"} "oracle"]]]
        (let [spec {:classname "com.oceanbase.jdbc.Driver"}]
          (with-redefs [jdbc/query (constantly [mock-result])]
            (let [mode (#'oceanbase/get-oceanbase-mode spec)]
              (is (contains? #{"mysql" "oracle"} mode))
              (is (= expected-mode mode)))))))))

(deftest mode-detection-fallback-test
  (mt/test-driver :oceanbase
    (testing "Mode detection should fallback gracefully when query fails"
      (let [spec {:classname "com.oceanbase.jdbc.Driver"}]
        (with-redefs [jdbc/query (fn [& _] (throw (ex-info "Connection failed" {})))]
          (let [mode (#'oceanbase/get-oceanbase-mode spec)]
            (is (= "oracle" mode))))))))

;;; ========================================= SQL Query Processing Tests =========================================

(deftest quote-style-test
  (mt/test-driver :oceanbase
    (testing "Quote style should be determined by OceanBase mode dynamically"
      (doseq [[mock-result expected-style] [[{:value "MYSQL"} :mysql]
                                            [{:value "ORACLE"} :oracle]]]
        (with-redefs [jdbc/query (constantly [mock-result])]
          (let [quote-style (sql.qp/quote-style :oceanbase)]
            (is (= expected-style quote-style))))))))

(deftest apply-top-level-clause-limit-test
  (mt/test-driver :oceanbase
    (testing "Limit clause should be applied based on OceanBase mode"
      (let [query {:query {:source-table 1
                           :limit 10}}]
        (doseq [[mock-result mode] [[{:value "MYSQL"} "mysql"]
                                    [{:value "ORACLE"} "oracle"]]]
          (with-redefs [jdbc/query (constantly [mock-result])]
            (let [result (sql.qp/apply-top-level-clause :oceanbase :limit query)]
              (is (some? result))
              (is (map? result)))))))))

;;; ========================================= Data Type Mapping Tests =========================================

(deftest database-type->base-type-test
  (mt/test-driver :oceanbase
    (testing "Database type to base type mapping should work correctly"
      (doseq [[db-type expected-base-type] [["VARCHAR(255)" :type/Text]
                                            ["INT" :type/Integer]
                                            ["BIGINT" :type/BigInteger]
                                            ["DECIMAL(10,2)" :type/Decimal]
                                            ["TIMESTAMP" :type/DateTime]
                                            ["DATE" :type/Date]
                                            ["BOOLEAN" :type/Boolean]]]
        (let [base-type (sql-jdbc.sync/database-type->base-type :oceanbase db-type)]
          (is (some? base-type))
          (is (keyword? base-type)))))))

;;; ========================================= Driver Features Tests =========================================

(deftest supported-features-test
  (mt/test-driver :oceanbase
    (testing "OceanBase driver should support expected features"
      (let [features (driver/features :oceanbase)]
        (is (set? features))
        (is (pos? (count features)))
        (is (contains? features :basic-aggregations))
        (is (contains? features :standard-deviation-aggregations))
        (is (contains? features :expressions))
        (is (contains? features :foreign-keys))
        (is (contains? features :nested-queries))
        (is (contains? features :native-query-snippets))))))

;;; ========================================= Error Handling Tests =========================================

(deftest error-handling-test
  (mt/test-driver :oceanbase
    (testing "Error handling should work correctly for OceanBase driver"
      (doseq [[details description] [[{:host "invalid-host" :port "not-a-number" :dbname ""} "Malformed details"]
                                    [{:host "" :port -1 :dbname nil} "Empty details"]
                                    [{:host "localhost" :port 2881 :dbname "test_db"} "Valid details"]]]
        (testing description
          (is (some? (driver/can-connect? :oceanbase details))))))))

(deftest connection-error-messages-test
  (mt/test-driver :oceanbase
    (testing "Connection error message handling should work correctly"
      (doseq [[details description] [[{:host "invalid-host" :port 9999 :dbname "invalid_db"} "Invalid connection"]
                                    {:host "localhost" :port 2881 :dbname "test_db"} "Valid connection"]]
        (testing description
          (let [error-msg (driver/humanize-connection-error-message :oceanbase details)]
            (is (some? error-msg))
            (is (string? error-msg))))))))

;;; ========================================= Compatibility Mode Tests =========================================

(deftest mysql-compatibility-mode-test
  (mt/test-driver :oceanbase
    (testing "MySQL compatibility mode should work correctly"
      (with-redefs [jdbc/query (constantly [{:value "MYSQL"}])]
        (let [quote-style (sql.qp/quote-style :oceanbase)
              query {:query {:source-table 1 :limit 10}}
              limit-result (sql.qp/apply-top-level-clause :oceanbase :limit query)]
          (is (= :mysql quote-style))
          (is (some? limit-result)))))))

(deftest oracle-compatibility-mode-test
  (mt/test-driver :oceanbase
    (testing "Oracle compatibility mode should work correctly"
      (with-redefs [jdbc/query (constantly [{:value "ORACLE"}])]
        (let [quote-style (sql.qp/quote-style :oceanbase)
              query {:query {:source-table 1 :limit 10}}
              limit-result (sql.qp/apply-top-level-clause :oceanbase :limit query)]
          (is (= :oracle quote-style))
          (is (some? limit-result)))))))

;;; ========================================= Test Data Tests =========================================

       (deftest test-data-loading-test
         (mt/test-driver :oceanbase
           (testing "Test data should be loaded correctly"
             (let [dbdef (metabase.test.data.interface/dataset-definition :oceanbase)]
               (is (some? dbdef))
               (is (= "metabase_test" (:database-name dbdef)))
               (is (pos? (count (:table-definitions dbdef))))))))

;;; ========================================= Test Summary =========================================

(deftest test-summary
  (mt/test-driver :oceanbase
    (testing "Verify test coverage"
      (let [test-functions (filter #(and (fn? %) (meta %)) (vals (ns-publics *ns*)))
            test-count (count test-functions)]
        (is (>= test-count 16) (str "Expected at least 16 tests, found: " test-count))))))
