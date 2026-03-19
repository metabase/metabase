(ns metabase-enterprise.checker.format.concise-test
  "Tests for the concise YAML format."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.checker :as checker]
   [metabase-enterprise.checker.format.concise :as concise]
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Format Parsing Tests
;;; ===========================================================================

(deftest schema-less-format-test
  (testing "Schema-less format (SQLite style) is parsed correctly"
    (let [db-yaml {:name "my_db"
                   :engine "sqlite"
                   :tables {"users" {:fields ["id" "name" "email"]}
                            "orders" {:fields ["id" "user_id" "total"]}}}
          src (concise/make-source-from-data [db-yaml] [])]
      ;; Check database resolution
      (is (= {:name "my_db" :engine "sqlite"}
             (source/resolve-database src "my_db")))
      ;; Check table resolution - schema is nil for schema-less
      (is (= {:name "users" :schema nil}
             (source/resolve-table src ["my_db" nil "users"])))
      (is (= {:name "orders" :schema nil}
             (source/resolve-table src ["my_db" nil "orders"])))
      ;; Check field resolution
      (let [field (source/resolve-field src ["my_db" nil "users" "id"])]
        (is (= "id" (:name field)))
        (is (= "type/*" (:base_type field)))
        (is (= ["my_db" nil "users"] (:table_id field)))))))

(deftest schema-based-format-test
  (testing "Schema-based format (Postgres style) is parsed correctly"
    (let [db-yaml {:name "my_db"
                   :engine "postgres"
                   :schemas {"public" {"users" {:fields ["id" "name"]}
                                       "orders" {:fields ["id" "total"]}}
                             "analytics" {"events" {:fields ["id" "type"]}}}}
          src (concise/make-source-from-data [db-yaml] [])]
      ;; Check database resolution
      (is (= {:name "my_db" :engine "postgres"}
             (source/resolve-database src "my_db")))
      ;; Check table resolution with schema
      (is (= {:name "users" :schema "public"}
             (source/resolve-table src ["my_db" "public" "users"])))
      (is (= {:name "events" :schema "analytics"}
             (source/resolve-table src ["my_db" "analytics" "events"])))
      ;; Check field resolution
      (let [field (source/resolve-field src ["my_db" "public" "users" "id"])]
        (is (= "id" (:name field)))
        (is (= ["my_db" "public" "users"] (:table_id field)))))))

(deftest multiple-databases-test
  (testing "Multiple databases can be loaded"
    (let [db1 {:name "db1" :engine "sqlite" :tables {"t1" {:fields ["id"]}}}
          db2 {:name "db2" :engine "postgres" :schemas {"public" {"t2" {:fields ["id"]}}}}
          src (concise/make-source-from-data [db1 db2] [])]
      (is (some? (source/resolve-database src "db1")))
      (is (some? (source/resolve-database src "db2")))
      (is (some? (source/resolve-table src ["db1" nil "t1"])))
      (is (some? (source/resolve-table src ["db2" "public" "t2"]))))))

(deftest field-with-details-test
  (testing "Fields can have additional details beyond just name"
    (let [db-yaml {:name "my_db"
                   :engine "postgres"
                   :schemas {"public" {"users" {:fields [{:name "id"
                                                          :base_type "type/Integer"
                                                          :semantic_type "type/PK"}
                                                         "name"
                                                         {:name "email"
                                                          :semantic_type "type/Email"}]}}}}
          src (concise/make-source-from-data [db-yaml] [])]
      ;; Field with all details
      (let [id-field (source/resolve-field src ["my_db" "public" "users" "id"])]
        (is (= "id" (:name id-field)))
        (is (= "type/Integer" (:base_type id-field)))
        (is (= "type/PK" (:semantic_type id-field))))
      ;; Simple string field gets defaults
      (let [name-field (source/resolve-field src ["my_db" "public" "users" "name"])]
        (is (= "name" (:name name-field)))
        (is (= "type/*" (:base_type name-field))))
      ;; Partial details field
      (let [email-field (source/resolve-field src ["my_db" "public" "users" "email"])]
        (is (= "email" (:name email-field)))
        (is (= "type/*" (:base_type email-field))) ; defaulted
        (is (= "type/Email" (:semantic_type email-field)))))))

;;; ===========================================================================
;;; Enumeration Tests
;;; ===========================================================================

(deftest enumeration-test
  (testing "All entities can be enumerated"
    (let [db-yaml {:name "test_db"
                   :engine "sqlite"
                   :tables {"users" {:fields ["id" "name"]}
                            "orders" {:fields ["id" "user_id" "total"]}}}
          src (concise/make-source-from-data [db-yaml] [])]
      (is (= ["test_db"] (vec (concise/all-database-names src))))
      (is (= 2 (count (concise/all-table-paths src))))
      (is (= 5 (count (concise/all-field-paths src))))))) ; 2 + 3 fields

;;; ===========================================================================
;;; Integration with Checker
;;; ===========================================================================

(deftest check-card-with-concise-source-test
  (testing "Cards can be validated against concise format metadata"
    (let [db-yaml {:name "Test Database"
                   :engine "h2"
                   :schemas {"PUBLIC" {"ORDERS" {:fields ["ID" "USER_ID" "TOTAL" "CREATED_AT"]}}}}
          card {:name "Test Card"
                :entity_id "test-card-1"
                :dataset_query {:database "Test Database"
                                :type "query"
                                :query {:source-table ["Test Database" "PUBLIC" "ORDERS"]}}}
          src (concise/make-source-from-data [db-yaml] [card])
          enums (concise/make-enumerators src)
          results (checker/check-cards src enums ["test-card-1"])
          result (get results "test-card-1")]
      (is (some? result) "Card should be checked")
      (is (= "Test Card" (:name result)))
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs"))))

(deftest check-card-missing-table-test
  (testing "Card referencing missing table is detected"
    (let [db-yaml {:name "Test Database"
                   :engine "h2"
                   :schemas {"PUBLIC" {"USERS" {:fields ["ID"]}}}} ; No ORDERS table
          card {:name "Test Card"
                :entity_id "test-card-1"
                :dataset_query {:database "Test Database"
                                :type "query"
                                :query {:source-table ["Test Database" "PUBLIC" "ORDERS"]}}}
          src (concise/make-source-from-data [db-yaml] [card])
          enums (concise/make-enumerators src)
          results (checker/check-cards src enums ["test-card-1"])
          result (get results "test-card-1")]
      (is (some? result) "Card should be checked")
      (is (or (seq (:unresolved result))
              (:error result))
          "Should have unresolved refs or error for missing table"))))

(deftest check-card-missing-field-test
  (testing "Card referencing missing field is detected"
    (let [db-yaml {:name "Test Database"
                   :engine "h2"
                   :schemas {"PUBLIC" {"ORDERS" {:fields ["ID"]}}}} ; No TOTAL field
          card {:name "Test Card"
                :entity_id "test-card-1"
                :dataset_query {:database "Test Database"
                                :type "query"
                                :query {:source-table ["Test Database" "PUBLIC" "ORDERS"]
                                        :fields [[:field ["Test Database" "PUBLIC" "ORDERS" "TOTAL"] nil]]}}}
          src (concise/make-source-from-data [db-yaml] [card])
          enums (concise/make-enumerators src)
          results (checker/check-cards src enums ["test-card-1"])
          result (get results "test-card-1")]
      (is (some? result) "Card should be checked")
      (is (seq (:unresolved result)) "Should have unresolved refs for missing field"))))

;;; ===========================================================================
;;; REPL Helpers
;;; ===========================================================================

(comment
  ;; Run all tests
  (clojure.test/run-tests 'metabase-enterprise.checker.format.concise-test))
