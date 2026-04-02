(ns metabase-enterprise.checker.native-test
  "Tests for native SQL validation in the checker module."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.native :as native]
   [metabase-enterprise.checker.semantic :as checker]
   [metabase-enterprise.checker.store :as store]
   [metabase-enterprise.checker.test-helpers :as helpers]
   [metabase.util.malli.fn :as mu.fn]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Integration: native errors surface through check-card
;;; ===========================================================================

(deftest bad-sql-syntax-produces-error-test
  (testing "Card with SQL syntax error (SELLECT) produces an error"
    (let [entities {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
                    :tables {["Test DB" "PUBLIC" "ORDERS"]
                             {:name "ORDERS" :schema "PUBLIC"}}
                    :fields {["Test DB" "PUBLIC" "ORDERS" "ID"]
                             {:name "ID" :base_type "type/BigInteger"
                              :database_type "BIGINT"
                              :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
                    :cards {"bad-sql" {:name "Bad SQL"
                                       :entity_id "bad-sql"
                                       :type "question"
                                       :dataset_query {:database "Test DB"
                                                       :type "native"
                                                       :native {:query "SELLECT * FROM ORDERS"}}}}}
          source (helpers/make-memory-source entities)
          index  (helpers/make-memory-index entities)
          results (checker/check-entities source index ["bad-sql"])
          result (get results "bad-sql")]
      (is (some? result))
      ;; Bad syntax should produce either :error (parse failure) or :native-errors
      (is (or (:error result)
              (seq (:native-errors result)))
          "Bad SQL should produce an error or native-errors"))))

(deftest valid-native-query-no-errors-test
  (testing "Valid native query produces no native errors"
    (let [entities {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
                    :tables {["Test DB" "PUBLIC" "ORDERS"]
                             {:name "ORDERS" :schema "PUBLIC"}}
                    :fields {["Test DB" "PUBLIC" "ORDERS" "ID"]
                             {:name "ID" :base_type "type/BigInteger"
                              :database_type "BIGINT"
                              :table_id ["Test DB" "PUBLIC" "ORDERS"]}
                             ["Test DB" "PUBLIC" "ORDERS" "TOTAL"]
                             {:name "TOTAL" :base_type "type/Float"
                              :database_type "DOUBLE PRECISION"
                              :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
                    :cards {"good-sql" {:name "Good SQL"
                                         :entity_id "good-sql"
                                         :type "question"
                                         :dataset_query {:database "Test DB"
                                                         :type "native"
                                                         :native {:query "SELECT ID, TOTAL FROM ORDERS"}}}}}
          source (helpers/make-memory-source entities)
          index  (helpers/make-memory-index entities)
          results (checker/check-entities source index ["good-sql"])
          result (get results "good-sql")]
      (is (some? result))
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (empty? (:native-errors result)) "Valid SQL should have no native errors"))))

(deftest native-errors-status-test
  (testing "result-status returns :native-errors when native-errors present"
    (is (= :native-errors
           (checker/result-status {:native-errors #{{:type :missing-column :name "foo"}}})))))

(deftest native-errors-in-summary-test
  (testing "summarize-results counts native errors"
    (let [results {"ok" {}
                   "bad" {:native-errors #{{:type :missing-column :name "x"}}}}
          summary (checker/summarize-results results)]
      (is (= 2 (:total summary)))
      (is (= 1 (:ok summary)))
      (is (= 1 (:native-errors summary))))))

(deftest native-errors-in-format-error-test
  (testing "format-error includes native SQL errors"
    (let [output (checker/format-error
                  ["eid" {:name "Card"
                          :native-errors #{{:type :missing-column :name "bad_col"}}}])]
      (is (some? output))
      (is (re-find #"sql error" output))
      (is (re-find #"bad_col" output)))))

;;; ===========================================================================
;;; Direct tests for native.clj functions
;;; ===========================================================================

(def ^:private db-entities
  {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
   :tables    {["Test DB" "PUBLIC" "ORDERS"]   {:name "ORDERS" :schema "PUBLIC"}
               ["Test DB" "PUBLIC" "PRODUCTS"] {:name "PRODUCTS" :schema "PUBLIC"}}
   :fields    {["Test DB" "PUBLIC" "ORDERS" "ID"]
               {:name "ID" :base_type "type/BigInteger" :database_type "BIGINT"
                :table_id ["Test DB" "PUBLIC" "ORDERS"]}
               ["Test DB" "PUBLIC" "ORDERS" "TOTAL"]
               {:name "TOTAL" :base_type "type/Float" :database_type "DOUBLE PRECISION"
                :table_id ["Test DB" "PUBLIC" "ORDERS"]}
               ["Test DB" "PUBLIC" "PRODUCTS" "ID"]
               {:name "ID" :base_type "type/BigInteger" :database_type "BIGINT"
                :table_id ["Test DB" "PUBLIC" "PRODUCTS"]}
               ["Test DB" "PUBLIC" "PRODUCTS" "CATEGORY"]
               {:name "CATEGORY" :base_type "type/Text" :database_type "VARCHAR"
                :table_id ["Test DB" "PUBLIC" "PRODUCTS"]}}
   :cards     {}})

(defn- make-store-and-provider []
  (binding [mu.fn/*enforce* false]
    (let [store    (store/make-store
                    (helpers/make-memory-source db-entities)
                    (helpers/make-memory-index db-entities))
          provider (checker/make-provider store)]
      {:store store :provider provider})))

(deftest extract-sql-refs-test
  (testing "extract-sql-refs finds table and field references in SQL"
    (let [{:keys [store]} (make-store-and-provider)]
      ;; Load the database so the engine is available
      (store/load-database! store "Test DB")
      (let [query {:lib/type :mbql/query
                   :database (store/ref->id store :database "Test DB")
                   :stages [{:lib/type :mbql.stage/native
                             :native "SELECT ID, TOTAL FROM ORDERS"}]}
            refs  (native/extract-sql-refs store "Test DB" query)]
        (is (some? refs))
        (is (seq (:tables refs)) "Should find table references")
        (is (seq (:fields refs)) "Should find field references")))))

(deftest extract-sql-refs-unknown-db-test
  (testing "extract-sql-refs returns nil for unknown database"
    (let [{:keys [store]} (make-store-and-provider)]
      (is (nil? (native/extract-sql-refs store "Nonexistent DB"
                                         {:lib/type :mbql/query
                                          :stages [{:lib/type :mbql.stage/native
                                                    :native "SELECT 1"}]}))))))

(deftest validate-native-sql-valid-query-test
  (testing "validate-native-sql returns nil for valid SQL"
    (let [{:keys [store provider]} (make-store-and-provider)]
      (store/load-database! store "Test DB")
      (let [query {:lib/type :mbql/query
                   :database (store/ref->id store :database "Test DB")
                   :stages [{:lib/type :mbql.stage/native
                             :native "SELECT ID, TOTAL FROM ORDERS"}]}]
        (is (nil? (native/validate-native-sql store provider query "Test DB"))
            "Valid SQL should produce no errors")))))

(deftest validate-native-sql-missing-column-test
  (testing "validate-native-sql catches missing columns"
    (let [{:keys [store provider]} (make-store-and-provider)]
      (store/load-database! store "Test DB")
      (let [query {:lib/type :mbql/query
                   :database (store/ref->id store :database "Test DB")
                   :stages [{:lib/type :mbql.stage/native
                             :native "SELECT NONEXISTENT_COL FROM ORDERS"}]}
            errors (native/validate-native-sql store provider query "Test DB")]
        (is (seq errors) "Should catch missing column")
        (is (some #(= :missing-column (:type %)) errors))))))

(deftest validate-native-sql-syntax-error-test
  (testing "validate-native-sql catches syntax errors"
    (let [{:keys [store provider]} (make-store-and-provider)]
      (store/load-database! store "Test DB")
      (let [query {:lib/type :mbql/query
                   :database (store/ref->id store :database "Test DB")
                   :stages [{:lib/type :mbql.stage/native
                             :native "SELLECT * FROM ORDERS"}]}
            errors (native/validate-native-sql store provider query "Test DB")]
        (is (seq errors) "Should catch syntax error")
        (is (some #(= :syntax-error (:type %)) errors))))))

(deftest validate-native-sql-nil-db-test
  (testing "validate-native-sql returns nil when db-name is nil"
    (let [{:keys [store provider]} (make-store-and-provider)]
      (is (nil? (native/validate-native-sql store provider {} nil))))))

(comment
  (clojure.test/run-tests 'metabase-enterprise.checker.native-test))
