(ns metabase.sql-tools.sqlglot.core-test
  (:require
   #_[metabase.driver.sql :as driver.sql]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.native-validation :as deps.native-validation]
   [metabase-enterprise.dependencies.test-util :as deps.tu]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.sqlglot.core :as sql-tools.sqlglot]
   [metabase.test :as mt]))

;; copied from enterprise/backend/test/metabase_enterprise/dependencies/native_validation_test.clj
(defn- fake-query
  ([mp query]
   (fake-query mp query {}))
  ([mp query template-tags]
   (-> (lib/native-query mp query)
       (lib/with-template-tags template-tags))))

(defn- validates?
  [mp driver card-id expected & [thunk]]
  (is (=? expected
          (-> (lib.metadata/card mp card-id)
              :dataset-query
              (assoc :lib/metadata mp)
              (as-> $ (if (fn? thunk)
                        (thunk $)
                        ;; here, use thunk for my tests
                        (deps.native-validation/validate-native-query driver $)))))))

;;; 2026-01-29 Thu
;;     going thru existing validation tests
;; 
(deftest WIP-validation-test
  (testing "validate-native-query handles nonsense queries"
    (let [mp (mt/metadata-provider) #_(deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "complete nonsense query"
          ;; ; error: ParseError: ParseError: Invalid expression / Unexpected token. Line 1, Col: 23.
        (let [query (lib/native-query mp "complete nonsense query")]
          @(def rere1 (sql-tools.sqlglot/validate-query driver query))))
      (testing "bad table wildcard"
        ;; error: OptimizeError: OptimizeError: Unknown table: products (qualify_columns.py:30)
        (let [query (lib/native-query mp "select products.* from orders")]
          @(def rere2 (sql-tools.sqlglot/validate-query driver query))))
      (testing "bad col reference"
        ;; error: OptimizeError: OptimizeError: Column 'bad' could not be resolved. Line: 1, Col: 10
        (let [query (lib/native-query mp "select bad from products")]
          @(def rere3 (sql-tools.sqlglot/validate-query driver query))))
      (testing "can validate queries using table functions"
        ;; error: OptimizeError: OptimizeError: Column 'i' could not be resolved. Line: 1, Col: 8
        ;; TODO: This is probably not right. Correct behavior?
        (let [query (lib/native-query mp
                                      #_"select * from my_function(1, 100)"
                                      "select i from my_function(1, 100)")]
              ;; however the "select i from my_function(1, 100)" passes
              ;;
              ;; The fact we do not have udtf's schema may pose a problem. TODO: learn specifics of how this is
              ;; handled in sqlglot
              ;; TODO: infer_schema=True in sql_tools.py makes it pass, figure out broader implications (later)
          @(def rere4 (sql-tools.sqlglot/validate-query driver query)))))))

;; copied, OK
(deftest ^:parallel validate-native-query-with-subquery-columns-test
  (testing "validate-native-query should detect invalid columns in subqueries"
    (let [mp (deps.tu/default-metadata-provider)
          driver (:engine (lib.metadata/database mp))]
      (testing "Valid query - selecting existing columns from subquery"
        (validates? mp driver 10 empty?
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query))))
      (testing "Invalid query - selecting non-existent column from subquery"
        (validates? mp driver 11 #{(lib/missing-column-error "CATEGORY")}
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query)))
        (validates? mp driver 12 #{(lib/missing-column-error "CATEGORY")}
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query))))
      (testing "Nested subqueries"
        (validates? mp driver 13 empty?
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query)))
        (validates? mp driver 14 #{(lib/missing-column-error "CATEGORY")}
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query))))
      (testing "SELECT * from subquery expands to subquery columns"
        (validates? mp driver 15 empty?
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query)))
        (validates? mp driver 16 empty?
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query)))
        (validates? mp driver 17 #{(lib/missing-column-error "EMAIL")}
                    (fn [query]
                      (sql-tools.sqlglot/validate-query driver query)))))))

(deftest www-returned-columns-001-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select * from orders")]
      (is (=? {:base-type :type/Float,
               :effective-type :type/Float,
               :semantic-type nil,
               :database-type "float8",
               :lib/type :metadata/column,
               :lib/desired-column-alias "total",
               :name "total",
               :display-name "Total"}
              (try
                (first @(def ss (#'sql-tools.sqlglot/returned-columns driver/*driver* query)))
                (catch Throwable t
                  (def ttt t)
                  (throw t))))))))

(deftest schema-001-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select * from orders")]
      (is (=? {"public"
               {"orders"
                {"total" "UNKNOWN",
                 "product_id" "UNKNOWN",
                 "user_id" "UNKNOWN",
                 "discount" "UNKNOWN",
                 "id" "UNKNOWN",
                 "quantity" "UNKNOWN",
                 "subtotal" "UNKNOWN",
                 "created_at" "UNKNOWN",
                 "tax" "UNKNOWN"}}}
              @(def ss (#'sql-tools.sqlglot/sqlglot-schema :postgres query)))))))
