(ns metabase.sql-tools.sqlglot.core-test
  (:require
   #_[metabase-enterprise.dependencies.test-util :as deps.tu]
   #_[metabase.driver.sql :as driver.sql]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sql-tools.sqlglot.core :as sql-tools.sqlglot]
   [metabase.test :as mt]))

;; copied from enterprise/backend/test/metabase_enterprise/dependencies/native_validation_test.clj
#_(defn- fake-query
    ([mp query]
     (fake-query mp query {}))
    ([mp query template-tags]
     (-> (lib/native-query mp query)
         (lib/with-template-tags template-tags))))

#_(defn- validates?
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
#_(deftest WIP-validation-test
    (testing "validate-native-query handles nonsense queries"
      (let [mp (mt/metadata-provider) #_(deps.tu/default-metadata-provider)
            driver (:engine (lib.metadata/database mp))]
        (try
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
              @(def rere4 (sql-tools.sqlglot/validate-query driver query))))
          (catch Throwable t
            (def ttt t)
            (throw t))))))

;; copied, OK
#_(deftest ^:parallel validate-native-query-with-subquery-columns-test
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

#_(deftest www-returned-columns-001-test
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

#_(deftest schema-001-test
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

;;;; referenced-tables

(deftest referenced-tables-basic-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select id from orders")]
      (is (=? #{{:table (mt/id :orders)}}
              (#'sql-tools.sqlglot/referenced-tables driver/*driver* query))))))

(deftest referenced-tables-join-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp (str "select o.id\n"
                                          "from orders o\n"
                                          "join products p on o.product_id = p.id"))]
      (is (=? #{{:table (mt/id :orders)}
                {:table (mt/id :products)}}
              (#'sql-tools.sqlglot/referenced-tables driver/*driver* query))))))

(deftest referenced-tables-no-appdb-table-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select id from xix")]
      (is (=? #{}
              (#'sql-tools.sqlglot/referenced-tables driver/*driver* query))))))

(deftest referenced-tables-cte-and-subquery-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp (str "with CTE as(\n"
                                          "  select * from orders\n"
                                          ")\n"
                                          "select *\n"
                                          "from CTE c\n"
                                          "join (select * from products) p on c.product_id = p.id"))]
      (is (=? #{{:table (mt/id :orders)}
                {:table (mt/id :products)}}
              (#'sql-tools.sqlglot/referenced-tables driver/*driver* query))))))

;;;; referenced-fields

(deftest referenced-columns-single-column-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select id from orders")]
      (is (= #{"id"}
             (->> (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                  (map :name)
                  set))))))

(deftest referenced-columns-select-*-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select * from orders")]
      (is (=? [{:name "id"}
               {:name "user_id"}
               {:name "product_id"}
               {:name "subtotal"}
               {:name "tax"}
               {:name "total"}
               {:name "discount"}
               {:name "created_at"}
               {:name "quantity"}]
              (->> (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                   (sort-by :position)))))))

(deftest referenced-columns-select-missing-entity-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)]
      (testing "Missing referenced table results in an error"
        (let [query (lib/native-query mp "select * from xix")]
          (is (= :error (try
                          (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                          :success
                          (catch Exception e
                            (is (instance? clojure.lang.ExceptionInfo e))
                            (is (= "Referenced field not available."
                                   (ex-message e)))
                            (is (= {:table-name "xix"
                                    :field-name "*"}
                                   (ex-data e)))
                            :error))))))
      (testing "Missing referenced field results in an error"
        (let [query (lib/native-query mp "select xix from orders")]
          (is (= :error (try
                          (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                          :success
                          (catch Exception e
                            (is (instance? clojure.lang.ExceptionInfo e))
                            (is (= "Referenced field not available."
                                   (ex-message e)))
                            (is (= {:table-name "orders"
                                    :field-name "xix"}
                                   (ex-data e)))
                            :error)))))))))

(deftest referenced-columns-select-multi-stars-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp (str "select o.*, p.* \n"
                                          "from (select * from orders) o\n"
                                          "join (select * from products) p on o.product_id = p.id\n"))]
      (is (=? {"orders"
               [{:name "id"}
                {:name "user_id"}
                {:name "product_id"}
                {:name "subtotal"}
                {:name "tax"}
                {:name "total"}
                {:name "discount"}
                {:name "created_at"}
                {:name "quantity"}],
               "products"
               [{:name "id"}
                {:name "ean"}
                {:name "title"}
                {:name "category"}
                {:name "vendor"}
                {:name "price"}
                {:name "rating"}
                {:name "created_at"}]}
              (-> (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                  (->> (group-by :table-id))
                  (update-keys (fn [table-id] (:name (lib.metadata/table mp table-id))))
                  (update-vals (partial sort-by :position))))))))

(deftest referenced-columns-duplicate-fields-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp (str "select o.id, oo.* \n"
                                          "from (select id from orders) o\n"
                                          "join (select * from orders) oo on o.id = oo.id\n"))]
      (testing "No duplicate columns were returned"
        (is (=? [{:name "id"}
                 {:name "user_id"}
                 {:name "product_id"}
                 {:name "subtotal"}
                 {:name "tax"}
                 {:name "total"}
                 {:name "discount"}
                 {:name "created_at"}
                 {:name "quantity"}]
                (->> (sql-tools.sqlglot/referenced-columns driver/*driver* query)
                     (sort-by :position))))))))

;;;; validate-query

(deftest validate-query-syntax-error-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "complete nonsense query")]
      (testing "Gibberish SQL returns syntax error"
        (is (= #{(lib/syntax-error)}
               (sql-tools.sqlglot/validate-query driver/*driver* query)))))))

(deftest validate-query-missing-table-alias-wildcard-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select foo.* from (select id from orders)")]
      (testing "Wildcard with unknown table alias returns missing-table-alias error"
        (is (= #{(lib/missing-table-alias-error "foo")}
               (sql-tools.sqlglot/validate-query driver/*driver* query)))))))

(deftest validate-query-missing-table-alias-column-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select bad.id from products")]
      (testing "Column with unknown table qualifier returns missing-table-alias error"
        (is (= #{(lib/missing-table-alias-error "bad")}
               (sql-tools.sqlglot/validate-query driver/*driver* query)))))))

(deftest validate-query-missing-column-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select nonexistent from orders")]
      (testing "Reference to non-existent column returns missing-column error"
        (is (= #{(lib/missing-column-error "nonexistent")}
               (sql-tools.sqlglot/validate-query driver/*driver* query)))))))

(deftest validate-query-valid-test
  (mt/test-driver
    :postgres
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "select id, total from orders")]
      (testing "Valid query returns empty error set"
        (is (= #{}
               (sql-tools.sqlglot/validate-query driver/*driver* query)))))))
