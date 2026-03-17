(ns metabase-enterprise.checker.structural-test
  "Tests for structural validation of serdes YAML files."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.structural :as structural]))

(set! *warn-on-reflection* true)

(def ^:private test-fixtures-dir "test_resources/yaml_checks")

(defn- fixtures-path []
  (let [f (io/file test-fixtures-dir)]
    (if (.isAbsolute f)
      test-fixtures-dir
      (.getPath (io/file (System/getProperty "user.dir") test-fixtures-dir)))))

;;; ===========================================================================
;;; Schema Validation Tests
;;; ===========================================================================

(deftest database-schema-test
  (testing "Valid database YAML passes validation"
    (let [data {:name "Test Database"
                :engine "h2"
                :created_at "2026-01-01T00:00:00.000000Z"
                :serdes/meta [{:id "Test Database" :model "Database"}]}]
      (is (nil? (structural/validate structural/Database data))))))

(deftest table-schema-test
  (testing "Valid table YAML passes validation"
    (let [data {:name "orders"
                :display_name "Orders"
                :active true
                :serdes/meta [{:id "Test Database" :model "Database"}
                              {:id "public" :model "Schema"}
                              {:id "orders" :model "Table"}]}]
      (is (nil? (structural/validate structural/Table data))))))

(deftest field-schema-test
  (testing "Valid field YAML passes validation"
    (let [data {:name "id"
                :display_name "ID"
                :table_id ["Test Database" "public" "orders"]
                :database_type "INTEGER"
                :base_type "type/Integer"
                :serdes/meta [{:id "Test Database" :model "Database"}
                              {:id "public" :model "Schema"}
                              {:id "orders" :model "Table"}
                              {:id "id" :model "Field"}]}]
      (is (nil? (structural/validate structural/Field data)))))

  (testing "Field with null schema (schema-less DB) passes validation"
    (let [data {:name "id"
                :display_name "ID"
                :table_id ["SQLite DB" nil "users"]
                :database_type "INTEGER"
                :base_type "type/Integer"
                :serdes/meta [{:id "SQLite DB" :model "Database"}
                              {:id "users" :model "Table"}
                              {:id "id" :model "Field"}]}]
      (is (nil? (structural/validate structural/Field data)))))

  (testing "Field with FK reference passes validation"
    (let [data {:name "user_id"
                :display_name "User ID"
                :table_id ["Test Database" "public" "orders"]
                :database_type "INTEGER"
                :base_type "type/Integer"
                :semantic_type "type/FK"
                :fk_target_field_id ["Test Database" "public" "users" "id"]
                :serdes/meta [{:id "Test Database" :model "Database"}
                              {:id "public" :model "Schema"}
                              {:id "orders" :model "Table"}
                              {:id "user_id" :model "Field"}]}]
      (is (nil? (structural/validate structural/Field data))))))

(deftest card-schema-test
  (testing "Valid MBQL card passes validation"
    (let [data {:name "Simple Query"
                :entity_id "abc123"
                :database_id "Test Database"
                :dataset_query {:database "Test Database"
                                :type "query"
                                :query {:source-table ["Test Database" "public" "orders"]}}
                :serdes/meta [{:id "abc123" :label "simple_query" :model "Card"}]}]
      (is (nil? (structural/validate structural/Card data)))))

  (testing "Valid native card passes validation"
    (let [data {:name "Native Query"
                :entity_id "def456"
                :database_id "Test Database"
                :dataset_query {:database "Test Database"
                                :type "native"
                                :native {:query "SELECT * FROM orders"}}
                :serdes/meta [{:id "def456" :label "native_query" :model "Card"}]}]
      (is (nil? (structural/validate structural/Card data))))))

(deftest invalid-schema-test
  (testing "Missing required field returns error"
    (let [data {:engine "h2"
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)]
      (is (some? result) "Should have validation error")
      (is (contains? (:errors result) :name) "Should report missing name")))

  (testing "Invalid base_type pattern returns error"
    (let [data {:name "id"
                :table_id ["Test" "public" "orders"]
                :database_type "INTEGER"
                :base_type "invalid"
                :serdes/meta [{:id "Test" :model "Database"}
                              {:id "public" :model "Schema"}
                              {:id "orders" :model "Table"}
                              {:id "id" :model "Field"}]}
          result (structural/validate structural/Field data)]
      (is (some? result) "Should have validation error"))))

;;; ===========================================================================
;;; Typo Detection Tests
;;; ===========================================================================

(deftest typo-detection-test
  (testing "Detects typo when required key is missing but similar key exists"
    (let [data {:nname "Test Database"  ; typo: nname instead of name
                :engine "h2"
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)]
      (is (some? result) "Should have validation error")
      (is (seq (:diagnostics result)) "Should have diagnostics")
      (let [diag (first (:diagnostics result))]
        (is (= :likely-typo (:type diag)) "Should detect as typo")
        (is (= :name (:missing diag)) "Should identify missing key")
        (is (= :nname (:found diag)) "Should identify the typo"))))

  (testing "Detects typo with multiple character difference"
    (let [data {:namee "Test Database"  ; typo: namee instead of name
                :engine "h2"
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)]
      (is (some? result) "Should have validation error")
      (is (seq (:diagnostics result)) "Should have diagnostics")
      (is (= :likely-typo (:type (first (:diagnostics result)))) "Should detect as typo")))

  (testing "Reports missing key without typo suggestion when no similar key"
    (let [data {:engine "h2"
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)]
      (is (some? result) "Should have validation error")
      (is (seq (:diagnostics result)) "Should have diagnostics")
      (let [diag (first (:diagnostics result))]
        (is (= :missing-required (:type diag)) "Should be missing-required type")
        (is (= :name (:key diag)) "Should identify the missing key"))))

  (testing "Extra keys are allowed without error"
    (let [data {:name "Test Database"
                :engine "h2"
                :extra_field "should be ignored"
                :another_extra 123
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)]
      (is (nil? result) "Extra keys should not cause validation error")))

  (testing "Typo message format is correct"
    (let [data {:nnnname "Test"
                :engine "h2"
                :serdes/meta [{:id "Test" :model "Database"}]}
          result (structural/validate structural/Database data)
          diag (first (:diagnostics result))]
      (is (re-find #"Missing required key 'name'" (:message diag))
          "Message should mention the missing key")
      (is (re-find #"'nnnname'" (:message diag))
          "Message should mention the typo found")
      (is (re-find #"typo" (:message diag))
          "Message should suggest it may be a typo"))))

;;; ===========================================================================
;;; File Validation Tests
;;; ===========================================================================

(deftest validate-export-dir-test
  (testing "All test fixtures pass structural validation"
    (let [results (structural/validate-export-dir (fixtures-path))]
      (is (pos? (:valid results)) "Should have valid files")
      (is (empty? (:invalid results))
          (str "Should have no invalid files: " (pr-str (:invalid results)))))))

;;; ===========================================================================
;;; JSON Schema Export Tests
;;; ===========================================================================

(deftest json-schema-export-test
  (testing "Schemas can be converted to JSON Schema"
    (doseq [[type schema] structural/schemas]
      (let [json-schema (structural/schema->json-schema schema)]
        (is (map? json-schema) (str "Should produce map for " type))
        (is (= "object" (:type json-schema)) (str "Should be object type for " type))
        (is (contains? json-schema :properties) (str "Should have properties for " type))))))

(comment
  (clojure.test/run-tests 'metabase-enterprise.checker.structural-test))
