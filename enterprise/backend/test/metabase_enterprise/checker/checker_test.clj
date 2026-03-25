(ns metabase-enterprise.checker.checker-test
  "Tests for the CI checker.

   Uses real YAML fixture files from test_resources/yaml_checks for most tests.
   Uses in-memory sources for edge cases like unresolved refs."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.checker :as checker]
   [metabase-enterprise.checker.format.serdes :as serdes-format]
   [metabase-enterprise.checker.source :as source]))

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

(defn- make-test-source []
  (serdes-format/make-source (fixtures-path)))

;;; ===========================================================================
;;; Tests Using Real YAML Files
;;; ===========================================================================

(deftest source-index-test
  (testing "Source correctly indexes databases, tables, fields, and cards"
    (let [source (make-test-source)
          index (serdes-format/source-index source)]
      (is (= 2 (count (:database index))) "Should have 2 databases (Test Database, SQLite DB)")
      (is (= 4 (count (:table index))) "Should have 4 tables")
      (is (= 11 (count (:field index))) "Should have 11 fields")
      (is (= 5 (count (:card index))) "Should have 5 cards")
      (is (contains? (:database index) "Test Database") "Should include Test Database")
      (is (contains? (:database index) "SQLite DB") "Should include SQLite DB"))))

(deftest simple-mbql-query-test
  (testing "Simple MBQL query on orders table validates successfully"
    (let [source (make-test-source)
          results (serdes-format/check source)
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
    (let [source (make-test-source)
          results (serdes-format/check source)
          result (get results "native-orders")]
      (is (some? result) "Card should be found")
      (is (= "Native Orders" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs"))))

(deftest mbql-with-joins-test
  (testing "MBQL query with joins validates successfully"
    (let [source (make-test-source)
          results (serdes-format/check source)
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
    (let [source (make-test-source)
          results (serdes-format/check source)]
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
    (let [source (make-test-source)
          index (serdes-format/source-index source)]
      ;; Should have both "Test Database" and "SQLite DB"
      (is (= 2 (count (:database index))) "Should have 2 databases")
      ;; Test Database has 2 tables, SQLite DB has 2 tables = 4 total
      (is (= 4 (count (:table index))) "Should have 4 tables")
      (is (contains? (:database index) "SQLite DB") "Should include SQLite DB"))))

(deftest schemaless-query-test
  (testing "Query on schema-less database validates successfully"
    (let [source (make-test-source)
          results (serdes-format/check source)
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
    (let [source (make-test-source)
          enumerators (serdes-format/make-enumerators source)
          store (checker/make-store source enumerators)
          provider (checker/make-provider store)
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
    (let [source (make-test-source)
          results (serdes-format/check source)
          result (get results "orders-with-fk")]
      (is (some? result) "Card should be found")
      (is (= "Orders With FK" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      (is (empty? (:bad-refs result)) "Should not have bad refs"))))

;;; ===========================================================================
;;; Tests Using In-Memory Source for Edge Cases
;;;
;;; Create a simple in-memory source to test unresolved references
;;; without needing temp files.
;;; ===========================================================================

(defn- make-memory-source
  "Create an in-memory source with the given entities.
   entities is a map with :databases, :tables, :fields, :cards."
  [{:keys [databases tables fields cards]}]
  (reify
    source/MetadataSource
    (resolve-database [_ db-name]
      (get databases db-name))
    (resolve-table [_ table-path]
      (get tables table-path))
    (resolve-field [_ field-path]
      (get fields field-path))
    (resolve-card [_ entity-id]
      (get cards entity-id))))

(defn- make-memory-enumerators
  "Create enumerators for an in-memory source."
  [{:keys [databases tables fields cards]}]
  {:databases #(keys databases)
   :tables    #(keys tables)
   :fields    #(keys fields)
   :cards     #(keys cards)})

(deftest unresolved-table-in-card-test
  (testing "Card referencing nonexistent table is detected"
    (let [entities {:databases {"Test Database" {:name "Test Database"
                                                 :engine "h2"}}
                    :tables {} ; No tables!
                    :fields {}
                    :cards {"test-card" {:name "Test Card"
                                         :entity_id "test-card"
                                         :dataset_query {:database "Test Database"
                                                         :type "query"
                                                         :query {:source-table ["Test Database" "public" "orders"]}}}}}
          source (make-memory-source entities)
          enumerators (make-memory-enumerators entities)
          results (checker/check-cards source enumerators ["test-card"])
          result (get results "test-card")]
      (is (some? result) "Card should be found")
      (is (= "Test Card" (:name result)) "Card name should match")
      (is (seq (:unresolved result)) "Should have unresolved refs")
      (is (some #(= :table (:type %)) (:unresolved result))
          "Should have unresolved table ref"))))

(deftest unresolved-database-in-card-test
  (testing "Card referencing nonexistent database is detected"
    (let [entities {:databases {} ; No databases!
                    :tables {}
                    :fields {}
                    :cards {"test-card" {:name "Test Card"
                                         :entity_id "test-card"
                                         :dataset_query {:database "Nonexistent Database"
                                                         :type "query"
                                                         :query {:source-table ["Nonexistent Database" "public" "orders"]}}}}}
          source (make-memory-source entities)
          enumerators (make-memory-enumerators entities)
          results (checker/check-cards source enumerators ["test-card"])
          result (get results "test-card")]
      (is (some? result) "Card should be found")
      (is (= "Test Card" (:name result)) "Card name should match")
      ;; Either has an error about missing database, or unresolved refs
      (is (or (:error result)
              (some #(= :database (:type %)) (:unresolved result)))
          "Should have unresolved database or error"))))

(deftest check-specific-cards-test
  (testing "Can check specific cards by entity-id"
    (let [source (make-test-source)
          results (serdes-format/check-cards source ["simple-orders" "native-orders"])]
      (is (= 2 (count results)) "Should only check 2 cards")
      (is (contains? results "simple-orders"))
      (is (contains? results "native-orders"))
      (is (not (contains? results "orders-with-products"))))))

;;; ===========================================================================
;;; Results Processing Tests
;;; ===========================================================================

(deftest result-status-test
  (testing "Result status is computed correctly"
    (is (= :ok (checker/result-status {})))
    (is (= :error (checker/result-status {:error "Something went wrong"})))
    (is (= :unresolved (checker/result-status {:unresolved [{:type :table}]})))
    (is (= :issues (checker/result-status {:bad-refs [{:type :field}]})))))

(deftest summarize-results-test
  (testing "Results are summarized correctly"
    (let [results {"card1" {}
                   "card2" {:error "oops"}
                   "card3" {:unresolved [{:type :table}]}
                   "card4" {:bad-refs [{:type :field}]}}
          summary (checker/summarize-results results)]
      (is (= 4 (:total summary)))
      (is (= 1 (:ok summary)))
      (is (= 1 (:errors summary)))
      (is (= 1 (:unresolved summary)))
      (is (= 1 (:issues summary))))))

;;; ===========================================================================
;;; Format-error Tests (LLM-friendly error output)
;;; ===========================================================================

(deftest format-error-returns-nil-for-ok-test
  (testing "format-error returns nil for OK results"
    (is (nil? (checker/format-error ["card-1" {}])))
    (is (nil? (checker/format-error ["card-1" {:refs {:tables ["t"]}}])))))

(deftest format-error-includes-card-identity-test
  (testing "format-error includes card name and entity-id"
    (let [output (checker/format-error ["abc123" {:name "My Card" :error "boom"}])]
      (is (some? output))
      (is (re-find #"My Card" output))
      (is (re-find #"abc123" output)))))

(deftest format-error-includes-unresolved-refs-test
  (testing "format-error includes unresolved field/table refs"
    (let [output (checker/format-error
                  ["eid" {:name "Bad Card"
                          :unresolved [{:type :field :path ["db" "public" "t" "bad_col"]}
                                       {:type :table :path ["db" "public" "missing"]}]}])]
      (is (re-find #"unresolved field" output))
      (is (re-find #"bad_col" output))
      (is (re-find #"unresolved table" output))
      (is (re-find #"missing" output)))))

(deftest format-error-includes-bad-refs-test
  (testing "format-error includes bad-refs"
    (let [output (checker/format-error
                  ["eid" {:name "Issue Card"
                          :bad-refs [{:type :missing-column :name "gone"}]}])]
      (is (re-find #"bad ref" output))
      (is (re-find #"missing-column" output)))))

(deftest format-error-includes-error-message-test
  (testing "format-error includes the error message"
    (let [output (checker/format-error
                  ["eid" {:name "Error Card" :error "Unknown database: foo"}])]
      (is (re-find #"error: Unknown database: foo" output)))))

;;; ===========================================================================
;;; Sentinel ID Tests — unresolved refs get IDs so queries can be constructed
;;; ===========================================================================

(deftest sentinel-id-for-unresolved-field-test
  (testing "Card with unresolved field gets sentinel ID — query builds, field flagged"
    (let [entities {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
                    :tables {["Test DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields {["Test DB" "PUBLIC" "ORDERS" "ID"] {:name "ID"
                                                                  :base_type "type/BigInteger"
                                                                  :database_type "BIGINT"
                                                                  :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
                    ;; Card references NONEXISTENT_FIELD which doesn't exist
                    :cards {"bad-field" {:name "Bad Field Card"
                                         :entity_id "bad-field"
                                         :type "question"
                                         :dataset_query {:database "Test DB"
                                                         :type "query"
                                                         :query {:source-table ["Test DB" "PUBLIC" "ORDERS"]
                                                                 :breakout [[:field
                                                                             ["Test DB" "PUBLIC" "ORDERS" "NONEXISTENT_FIELD"]
                                                                             {:base-type :type/Text}]]}}}}}
          source (make-memory-source entities)
          enumerators (make-memory-enumerators entities)
          results (checker/check-cards source enumerators ["bad-field"])
          result (get results "bad-field")]
      (is (some? result))
      ;; Should NOT have an :error (query should build successfully with sentinel)
      (is (nil? (:error result)) (str "Should not blow up: " (:error result)))
      ;; Should have unresolved refs tracking the bad field
      (is (seq (:unresolved result)) "Should track unresolved field")
      (is (some #(= :field (:type %)) (:unresolved result))
          "Should have unresolved field ref"))))

(deftest sentinel-id-for-unresolved-table-in-join-test
  (testing "Card with unresolved table in join gets sentinel ID — query builds"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields {}
                    ;; Card joins to a nonexistent table
                    :cards {"bad-join" {:name "Bad Join Card"
                                        :entity_id "bad-join"
                                        :type "question"
                                        :dataset_query {:database "DB"
                                                        :type "query"
                                                        :query {:source-table ["DB" "PUBLIC" "ORDERS"]
                                                                :joins [{:source-table ["DB" "PUBLIC" "NONEXISTENT"]
                                                                         :alias "n"
                                                                         :condition [:= 1 1]}]}}}}}
          source (make-memory-source entities)
          enumerators (make-memory-enumerators entities)
          results (checker/check-cards source enumerators ["bad-join"])
          result (get results "bad-join")]
      (is (some? result))
      ;; Should NOT have an :error (query should build with sentinel)
      (is (nil? (:error result)) (str "Should not blow up: " (:error result)))
      ;; Should track the unresolved table
      (is (seq (:unresolved result)) "Should track unresolved table")
      (is (some #(= :table (:type %)) (:unresolved result))
          "Should have unresolved table ref"))))

;;; ===========================================================================
;;; REPL Helpers
;;; ===========================================================================

(comment
  ;; Run all tests
  (clojure.test/run-tests 'metabase-enterprise.checker.checker-test)

  ;; Check fixtures path
  (fixtures-path)

  ;; Manually check all cards in fixtures
  (def source (make-test-source))
  (serdes-format/check source))
