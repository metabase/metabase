(ns metabase-enterprise.checker.native-test
  "Tests for native SQL validation in the checker module."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.semantic :as checker]
   [metabase-enterprise.checker.test-helpers :as helpers]))

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
          results (checker/check-cards source index ["bad-sql"])
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
          results (checker/check-cards source index ["good-sql"])
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

(comment
  (clojure.test/run-tests 'metabase-enterprise.checker.native-test))
