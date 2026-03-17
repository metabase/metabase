(ns metabase-enterprise.checker.checker-test
  "Tests for the CI checker.

   Uses real YAML fixture files from test_resources/nocommit/ci_test/ for most tests.
   Uses inline YAML strings + custom resolvers for edge cases like unresolved refs."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.checker.checker :as checker]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Test Fixture Path
;;; ===========================================================================

(def ^:private test-fixtures-dir
  "Path to test fixtures directory (real YAML files)."
  "test_resources/yaml_checks")

(defn- fixtures-path []
  (let [f (io/file test-fixtures-dir)]
    (if (.isAbsolute f)
      test-fixtures-dir
      (.getPath (io/file (System/getProperty "user.dir") test-fixtures-dir)))))

;;; ===========================================================================
;;; Test Fixtures - Reset state between tests
;;; ===========================================================================


;; don't love this. I'm not sure a better way forward. Depends on use cases.
(defn reset-state-fixture [f]
  (checker/reset-state!)
  (f)
  (checker/reset-state!))

(use-fixtures :each reset-state-fixture)

;;; ===========================================================================
;;; Tests Using Real YAML Files
;;; ===========================================================================

(deftest file-index-test
  (testing "File index correctly indexes databases, tables, fields, and cards"
    (checker/build-index! (fixtures-path))
    (let [stats (checker/file-index-stats)]
      (is (:file-index-built? stats) "Index should be built")
      (is (= 2 (get-in stats [:indexed :databases])) "Should have 2 databases (Test Database, SQLite DB)")
      (is (= 4 (get-in stats [:indexed :tables])) "Should have 4 tables")
      (is (= 11 (get-in stats [:indexed :fields])) "Should have 11 fields")
      (is (= 5 (get-in stats [:indexed :cards])) "Should have 5 cards")
      (is (some #{"Test Database"} (:database-names stats)) "Should include Test Database")
      (is (some #{"SQLite DB"} (:database-names stats)) "Should include SQLite DB"))))

(deftest simple-mbql-query-test
  (testing "Simple MBQL query on orders table validates successfully"
    (let [results (checker/check-all-cards (fixtures-path))
          result (get results "simple-orders")]
      (is (some? result) "Card should be found")
      (is (= "Simple Orders" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      (is (empty? (:bad-refs result)) "Should not have bad refs from lib")
      ;; Check that table refs were extracted
      (is (seq (get-in result [:refs :tables])) "Should have table refs"))))

(deftest native-query-test
  (testing "Native SQL query validates successfully"
    (let [results (checker/check-all-cards (fixtures-path))
          result (get results "native-orders")]
      (is (some? result) "Card should be found")
      (is (= "Native Orders" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs"))))

(deftest mbql-with-joins-test
  (testing "MBQL query with joins validates successfully"
    (let [results (checker/check-all-cards (fixtures-path))
          result (get results "orders-with-products")]
      (is (some? result) "Card should be found")
      (is (= "Orders With Products" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      ;; Check that both tables are referenced
      (let [tables (get-in result [:refs :tables])]
        (is (some #(re-find #"orders" %) tables) "Should reference orders table")
        (is (some #(re-find #"products" %) tables) "Should reference products table")))))

(deftest all-cards-checked-test
  (testing "All cards in fixtures are checked"
    (let [results (checker/check-all-cards (fixtures-path))]
      (is (= 5 (count results)) "Should check all 5 cards")
      (is (contains? results "simple-orders"))
      (is (contains? results "native-orders"))
      (is (contains? results "orders-with-products"))
      (is (contains? results "schemaless-query"))
      (is (contains? results "orders-with-fk")))))

;;; ===========================================================================
;;; Schema-less Database Tests
;;;
;;; Databases like SQLite don't have schemas, so tables are stored directly
;;; under databases/<db>/tables/ instead of databases/<db>/schemas/<schema>/tables/
;;; ===========================================================================

(deftest schemaless-database-index-test
  (testing "Schema-less databases are indexed correctly with nil schema"
    (checker/build-index! (fixtures-path))
    (let [stats (checker/file-index-stats)]
      ;; Should have both "Test Database" and "SQLite DB"
      (is (= 2 (get-in stats [:indexed :databases])) "Should have 2 databases")
      ;; Test Database has 2 tables, SQLite DB has 2 tables = 4 total
      (is (= 4 (get-in stats [:indexed :tables])) "Should have 4 tables")
      (is (some #{"SQLite DB"} (:database-names stats)) "Should include SQLite DB"))))

(deftest schemaless-query-test
  (testing "Query on schema-less database validates successfully"
    (let [results (checker/check-all-cards (fixtures-path))
          result (get results "schemaless-query")]
      (is (some? result) "Card should be found")
      (is (= "Schemaless Query" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      (is (empty? (:bad-refs result)) "Should not have bad refs"))))

;;; ===========================================================================
;;; FK Resolution Tests
;;;
;;; Foreign key references in field metadata and result_metadata must be
;;; converted from path vectors to integer IDs.
;;; ===========================================================================

(deftest fk-in-field-metadata-test
  (testing "FK target in field metadata is resolved to integer ID"
    (checker/build-index! (fixtures-path))
    (let [provider (checker/make-provider (fixtures-path))
          ;; Get the product_id field which has FK to products.id
          fields (metabase.lib.metadata.protocols/metadatas
                  provider {:lib/type :metadata/column})
          fk-field (first (filter #(= "product_id" (:name %)) fields))]
      (is (some? fk-field) "Should find product_id field")
      (is (= :type/FK (:semantic-type fk-field)) "Should be FK type")
      (is (pos-int? (:fk-target-field-id fk-field))
          "FK target should be resolved to positive integer"))))

(deftest fk-in-result-metadata-test
  (testing "FK target in card result_metadata is resolved to integer ID"
    (let [results (checker/check-all-cards (fixtures-path))
          result (get results "orders-with-fk")]
      (is (some? result) "Card should be found")
      (is (= "Orders With FK" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      (is (empty? (:bad-refs result)) "Should not have bad refs"))))

;;; ===========================================================================
;;; Tests Using Custom Resolvers for Edge Cases
;;;
;;; These tests use the composable *resolvers* to simulate unresolved references
;;; without needing actual broken YAML files.
;;; ===========================================================================

(deftest unresolved-field-with-custom-resolver-test
  (testing "Custom resolver that returns nil for a specific field"
    (checker/reset-state!)
    (let [;; Create a resolver that returns nil for a specific field path
          custom-resolvers (assoc checker/default-resolvers
                                  :field (fn [path]
                                           (if (= (last path) "nonexistent_field")
                                             nil  ; This field doesn't exist
                                             (checker/default-resolvers :field path))))
          provider (checker/make-provider (fixtures-path))]
      ;; Bind custom resolvers and check a card
      ;; The card will validate, but if we manually resolve a nonexistent field, it returns nil
      (binding [checker/*resolvers* custom-resolvers]
        (let [unresolved (atom [])
              _ (binding [checker/*unresolved-refs* unresolved]
                  ;; Try to resolve a nonexistent field - this should track it
                  (#'checker/resolve-field-path ["Test Database" "public" "orders" "nonexistent_field"]))]
          (is (= 1 (count @unresolved)) "Should have one unresolved ref")
          (is (= :field (:type (first @unresolved))) "Should be a field ref"))))))

(deftest unresolved-table-with-custom-resolver-test
  (testing "Custom resolver that returns nil for a specific table"
    (checker/reset-state!)
    (let [custom-resolvers (assoc checker/default-resolvers
                                  :table (fn [path]
                                           (if (= (last path) "nonexistent_table")
                                             nil
                                             (checker/default-resolvers :table path))))]
      (binding [checker/*resolvers* custom-resolvers]
        (let [unresolved (atom [])
              _ (binding [checker/*unresolved-refs* unresolved]
                  (#'checker/resolve-table-path ["Test Database" "public" "nonexistent_table"]))]
          (is (= 1 (count @unresolved)) "Should have one unresolved ref")
          (is (= :table (:type (first @unresolved))) "Should be a table ref"))))))

(deftest unresolved-database-with-custom-resolver-test
  (testing "Custom resolver that returns nil for unknown databases"
    (checker/reset-state!)
    (let [custom-resolvers (assoc checker/default-resolvers
                                  :database (fn [name]
                                              (if (= name "Unknown Database")
                                                nil
                                                (checker/default-resolvers :database name))))]
      (binding [checker/*resolvers* custom-resolvers]
        (let [unresolved (atom [])
              _ (binding [checker/*unresolved-refs* unresolved]
                  (#'checker/resolve-db-name "Unknown Database"))]
          (is (= 1 (count @unresolved)) "Should have one unresolved ref")
          (is (= :database (:type (first @unresolved))) "Should be a database ref"))))))

;;; ===========================================================================
;;; Tests Using Temporary Files for Unresolved References
;;;
;;; For testing actual card validation with unresolved refs, we create temp files.
;;; ===========================================================================

(def ^:private card-with-unresolved-table-yaml
  "name: Card With Missing Table
description: References a table that does not exist
entity_id: unresolved-table-card
created_at: '2026-01-01T00:00:00.000000Z'
creator_id: test@metabase.com
display: table
archived: false
query_type: query
database_id: Test Database
table_id:
- Test Database
- public
- nonexistent_table
dataset_query:
  database: Test Database
  query:
    source-table:
    - Test Database
    - public
    - nonexistent_table
  type: query
result_metadata: []
serdes/meta:
- id: unresolved-table-card
  label: card_with_missing_table
  model: Card
type: question
")

(def ^:private card-with-unresolved-database-yaml
  "name: Card With Missing Database
description: References a database that does not exist
entity_id: unresolved-db-card
created_at: '2026-01-01T00:00:00.000000Z'
creator_id: test@metabase.com
display: table
archived: false
query_type: query
database_id: Nonexistent Database
table_id:
- Nonexistent Database
- public
- orders
dataset_query:
  database: Nonexistent Database
  query:
    source-table:
    - Nonexistent Database
    - public
    - orders
  type: query
result_metadata: []
serdes/meta:
- id: unresolved-db-card
  label: card_with_missing_database
  model: Card
type: question
")

(defn- create-temp-card!
  "Add a temporary card YAML to the test fixtures directory.
   Returns the file path. Caller should delete after test."
  [entity-id content]
  (let [file (io/file (fixtures-path) "collections" "cards" (str entity-id "_temp.yaml"))]
    (spit file content)
    (.getPath file)))

(deftest unresolved-table-in-card-test
  (testing "Card referencing nonexistent table is detected"
    (let [temp-file (create-temp-card! "unresolved-table-card" card-with-unresolved-table-yaml)]
      (try
        (checker/reset-state!)
        (let [results (checker/check-all-cards (fixtures-path))
              result (get results "unresolved-table-card")]
          (is (some? result) "Card should be found")
          (is (= "Card With Missing Table" (:name result)) "Card name should match")
          (is (seq (:unresolved result)) "Should have unresolved refs")
          (is (some #(= :table (:type %)) (:unresolved result))
              "Should have unresolved table ref"))
        (finally
          (io/delete-file temp-file true))))))

(deftest unresolved-database-in-card-test
  (testing "Card referencing nonexistent database is detected"
    (let [temp-file (create-temp-card! "unresolved-db-card" card-with-unresolved-database-yaml)]
      (try
        (checker/reset-state!)
        (let [results (checker/check-all-cards (fixtures-path))
              result (get results "unresolved-db-card")]
          (is (some? result) "Card should be found")
          (is (= "Card With Missing Database" (:name result)) "Card name should match")
          ;; Either has an error about missing database, or unresolved refs
          (is (or (:error result)
                  (some #(= :database (:type %)) (:unresolved result)))
              "Should have unresolved database or error"))
        (finally
          (io/delete-file temp-file true))))))

;;; ===========================================================================
;;; REPL Helpers
;;; ===========================================================================

(comment
  ;; Run all tests
  (clojure.test/run-tests 'metabase-enterprise.checker.checker-test)

    ;; Check fixtures path
  (fixtures-path)
  (checker/file-index-stats)

  ;; Manually check all cards in fixtures
  (checker/reset-state!)
  (checker/check-all-cards (fixtures-path)))
