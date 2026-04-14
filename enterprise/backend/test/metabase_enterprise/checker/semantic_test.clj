(ns metabase-enterprise.checker.semantic-test
  "Tests for the semantic checker.

   Uses real YAML fixture files from test_resources/yaml_checks for most tests.
   Uses in-memory sources for edge cases like unresolved refs."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.format.serdes :as serdes-format]
   [metabase-enterprise.checker.provider :as provider]
   [metabase-enterprise.checker.semantic :as checker]
   [metabase-enterprise.checker.source :as source]
   [metabase-enterprise.checker.store :as store]
   [metabase-enterprise.checker.test-helpers :as helpers]
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

(defn- make-test-source []
  (serdes-format/make-source (fixtures-path)))

(defn- check-all [source]
  (checker/check-entities source source (serdes-format/source-index source)))

(defn- check-specific [source entity-ids]
  (checker/check-entities source source (serdes-format/source-index source) entity-ids))

;;; ===========================================================================
;;; Tests Using Real YAML Files
;;; ===========================================================================

(deftest source-index-test
  (testing "Source correctly indexes databases and cards; tables/fields are on-demand"
    (let [source (make-test-source)
          index  (serdes-format/source-index source)]
      ;; Databases are in the schema model, not the assets index
      (is (= #{"Test Database" "SQLite DB"} (set (source/all-database-names source))))
      ;; Cards are in the assets index
      (is (= 5 (count (:card index))) "Should have 5 cards")
      ;; Tables and fields are resolved on demand
      (is (= 4 (count (source/all-table-paths source))) "Should have 4 tables via source")
      (is (= 11 (count (source/all-field-paths source))) "Should have 11 fields via source"))))

(deftest simple-mbql-query-test
  (testing "Simple MBQL query on orders table validates successfully"
    (let [source (make-test-source)
          results (check-all source)
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
          results (check-all source)
          result (get results "native-orders")]
      (is (some? result) "Card should be found")
      (is (= "Native Orders" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs"))))

(deftest mbql-with-joins-test
  (testing "MBQL query with joins validates successfully"
    (let [source (make-test-source)
          results (check-all source)
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
          results (check-all source)]
      (is (>= (count results) 5) "Should check at least 5 cards")
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
    (let [source (make-test-source)]
      (is (= #{"Test Database" "SQLite DB"} (set (source/all-database-names source))))
      (is (= 4 (count (source/all-table-paths source))) "Should have 4 tables via source"))))

(deftest schemaless-query-test
  (testing "Query on schema-less database validates successfully"
    (let [source (make-test-source)
          results (check-all source)
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
          index (serdes-format/source-index source)
          provider (provider/make-provider (store/make-store source source index))
          ;; Get the product_id field which has FK to products.id
          fields (lib.metadata.protocols/metadatas
                  provider {:lib/type :metadata/column})
          fk-field (first (filter #(= "product_id" (:name %)) fields))]
      (is (some? fk-field) "Should find product_id field")
      (is (= :type/FK (:semantic-type fk-field)) "Should be FK type")
      (is (pos-int? (:fk-target-field-id fk-field))
          "FK target should be resolved to positive integer"))))

(deftest fk-in-result-metadata-test
  (testing "FK target in card result_metadata is resolved to integer ID"
    (let [source (make-test-source)
          results (check-all source)
          result (get results "orders-with-fk")]
      (is (some? result) "Card should be found")
      (is (= "Orders With FK" (:name result)) "Card name should match")
      (is (nil? (:error result)) (str "Should not have errors: " (:error result)))
      (is (empty? (:unresolved result)) "Should not have unresolved refs")
      (is (empty? (:bad-refs result)) "Should not have bad refs"))))

;;; ===========================================================================
;;; Tests Using In-Memory Source for Edge Cases
;;;
;;; ===========================================================================
;;; MBQL normalization tests
;;; ===========================================================================

(deftest template-tag-default-not-keywordized-test
  (testing "Template tag :default values are not incorrectly keywordized as MBQL operators"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["DB" "PUBLIC" "ORDERS" "CREATED_AT"]
                                {:name "CREATED_AT" :base_type "type/DateTimeWithLocalTZ"
                                 :database_type "TIMESTAMP WITH TIME ZONE"}}
                    :cards     {"tMpLtAgDeFaUlT00card1"
                                {:name "Field Filter Card"
                                 :entity_id "tMpLtAgDeFaUlT00card1"
                                 :dataset_query
                                 {:database "DB"
                                  :stages [{:native "SELECT * FROM ORDERS WHERE {{date_filter}}"
                                            :template-tags
                                            {"date_filter"
                                             {:type "dimension"
                                              :dimension ["field" {} ["DB" "PUBLIC" "ORDERS" "CREATED_AT"]]
                                              :default "past30days"
                                              :display-name "Date Filter"
                                              :name "date_filter"
                                              :widget-type "date/all-options"}}
                                            "lib/type" "mbql.stage/native"}]
                                  "lib/type" "mbql/query"}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["tMpLtAgDeFaUlT00card1"])
          result  (get results "tMpLtAgDeFaUlT00card1")]
      (is (nil? (:error result))
          (str "Should not error: " (:error result))))))

;;; ===========================================================================
;;; Create a simple in-memory source to test unresolved references
;;; without needing temp files.
;;; ===========================================================================

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
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["test-card"])
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
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["test-card"])
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
          results (check-specific source ["simple-orders" "native-orders"])]
      (is (>= (count results) 2) "Should check at least 2 cards")
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

(deftest format-result-non-card-entity-test
  (testing "format-result shows kind for non-card entities instead of Card ID"
    (let [output (checker/format-result
                  ["eid" {:name "My Dashboard" :entity-id "eid" :kind :dashboard
                          :unresolved [{:type :collection :entity-id "bad" :message "not found"}]}])]
      (is (re-find #"Kind: dashboard" output))
      (is (not (re-find #"Card ID" output))))))

(deftest format-error-non-card-entity-test
  (testing "format-error uses kind name for non-card entities"
    (let [output (checker/format-error
                  ["eid" {:name "My Transform" :entity-id "eid" :kind :transform
                          :error "Unknown database: foo"}])]
      (is (re-find #"^transform:" output))
      (is (not (re-find #"^card:" output))))))

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
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["bad-field"])
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
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["bad-join"])
          result (get results "bad-join")]
      (is (some? result))
      ;; Should NOT have an :error (query should build with sentinel)
      (is (nil? (:error result)) (str "Should not blow up: " (:error result)))
      ;; Should track the unresolved table
      (is (seq (:unresolved result)) "Should track unresolved table")
      (is (some #(= :table (:type %)) (:unresolved result))
          "Should have unresolved table ref"))))

;;; ===========================================================================
;;; Native SQL validation via deps.analysis
;;;
;;; These tests verify that deps.analysis/check-entity is properly invoked
;;; for native SQL cards (requires sql-tools.init to be loaded).
;;; ===========================================================================

(deftest native-card-bad-sql-produces-native-errors-test
  (testing "Card with bad SQL produces native-errors, not validation-exception-error"
    (let [entities {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
                    :tables    {["Test DB" "PUBLIC" "ORDERS"]
                                {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["Test DB" "PUBLIC" "ORDERS" "ID"]
                                {:name "ID" :base_type "type/BigInteger"
                                 :database_type "BIGINT"
                                 :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
                    :cards     {"bad-sql" {:name "Bad SQL"
                                           :entity_id "bad-sql"
                                           :type "question"
                                           :dataset_query {:database "Test DB"
                                                           :type "native"
                                                           :native {:query "SELLECT * FROM ORDERS"}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["bad-sql"])
          result  (get results "bad-sql")]
      (is (some? result))
      (is (or (seq (:native-errors result))
              (:error result))
          "Bad SQL should produce native-errors or error, not validation-exception-error")
      (is (empty? (filter #(= :validation-exception-error (:type %))
                          (:bad-refs result)))
          "Should not have validation-exception-error in bad-refs"))))

(deftest native-card-valid-sql-no-errors-test
  (testing "Card with valid native SQL produces no errors"
    (let [entities {:databases {"Test DB" {:name "Test DB" :engine "h2"}}
                    :tables    {["Test DB" "PUBLIC" "ORDERS"]
                                {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["Test DB" "PUBLIC" "ORDERS" "ID"]
                                {:name "ID" :base_type "type/BigInteger"
                                 :database_type "BIGINT"
                                 :table_id ["Test DB" "PUBLIC" "ORDERS"]}
                                ["Test DB" "PUBLIC" "ORDERS" "TOTAL"]
                                {:name "TOTAL" :base_type "type/Float"
                                 :database_type "DOUBLE PRECISION"
                                 :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
                    :cards     {"good-sql" {:name "Good SQL"
                                            :entity_id "good-sql"
                                            :type "question"
                                            :dataset_query {:database "Test DB"
                                                            :type "native"
                                                            :native {:query "SELECT ID, TOTAL FROM ORDERS"}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["good-sql"])
          result  (get results "good-sql")]
      (is (some? result))
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (empty? (:native-errors result)) "Valid SQL should have no native errors")
      (is (empty? (:bad-refs result)) "Valid SQL should have no bad refs"))))

;;; ===========================================================================
;;; Computed result-metadata tests
;;;
;;; When YAML has no result_metadata, the checker computes it from the query
;;; so deps.analysis can verify card subquery column references.
;;; ===========================================================================

(deftest mbql-card-computes-result-metadata-test
  (testing "MBQL card without result_metadata computes columns from query"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["DB" "PUBLIC" "ORDERS" "ID"]
                                {:name "ID" :base_type "type/BigInteger" :database_type "BIGINT"
                                 :table_id ["DB" "PUBLIC" "ORDERS"]}
                                ["DB" "PUBLIC" "ORDERS" "TOTAL"]
                                {:name "TOTAL" :base_type "type/Float" :database_type "DOUBLE PRECISION"
                                 :table_id ["DB" "PUBLIC" "ORDERS"]}}
                    ;; Card with MBQL query but no result_metadata
                    :cards     {"mbql-card" {:name "MBQL Card"
                                             :entity_id "mbql-card"
                                             :type "question"
                                             :dataset_query {:database "DB"
                                                             :type "query"
                                                             :query {:source-table ["DB" "PUBLIC" "ORDERS"]}}}
                                ;; Native card referencing the MBQL card's columns
                                "native-card" {:name "Native Ref"
                                               :entity_id "native-card"
                                               :type "question"
                                               :dataset_query {:database "DB"
                                                               :type "native"
                                                               :native {:query "SELECT ID FROM {{#1-mbql}}"
                                                                        :template-tags {"#1-mbql" {:type :card
                                                                                                   :name "#1-mbql"
                                                                                                   :card-id "mbql-card"}}}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["native-card"])
          result  (get results "native-card")]
      (is (some? result))
      ;; ID exists in ORDERS and in the MBQL card's computed result-metadata,
      ;; so it should NOT be flagged as missing
      (is (not (some #(and (= :missing-column (:type %))
                           (= "ID" (:name %)))
                     (:native-errors result)))
          "ID should not be flagged — it exists in the MBQL card's computed columns"))))

(deftest mbql-card-named-aggregation-in-result-metadata-test
  (testing "Named aggregation columns appear in computed result-metadata"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["DB" "PUBLIC" "ORDERS" "TOTAL"]
                                {:name "TOTAL" :base_type "type/Float" :database_type "DOUBLE PRECISION"
                                 :table_id ["DB" "PUBLIC" "ORDERS"]}}
                    ;; Card with named aggregation but no result_metadata
                    :cards     {"agg-card" {:name "Agg Card"
                                            :entity_id "agg-card"
                                            :type "question"
                                            :dataset_query {:database "DB"
                                                            :type "query"
                                                            :query {:source-table ["DB" "PUBLIC" "ORDERS"]
                                                                    :aggregation [[:sum {:name "total_revenue"
                                                                                         :display-name "Total Revenue"}
                                                                                   [:field
                                                                                    ["DB" "PUBLIC" "ORDERS" "TOTAL"]
                                                                                    {:base-type :type/Float}]]]}}}
                                ;; Native card referencing the named aggregation column
                                "ref-card" {:name "Ref Card"
                                            :entity_id "ref-card"
                                            :type "question"
                                            :dataset_query {:database "DB"
                                                            :type "native"
                                                            :native {:query "SELECT total_revenue FROM {{#1-agg}}"
                                                                     :template-tags {"#1-agg" {:type :card
                                                                                               :name "#1-agg"
                                                                                               :card-id "agg-card"}}}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["ref-card"])
          result  (get results "ref-card")]
      (is (some? result))
      (is (not (some #(and (= :missing-column (:type %))
                           (= "total_revenue" (:name %)))
                     (:native-errors result)))
          "total_revenue should not be flagged — it's a named aggregation in the source card"))))

(deftest native-card-without-result-metadata-no-false-positives-test
  (testing "Native card without result_metadata doesn't produce false positive errors"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["DB" "PUBLIC" "ORDERS" "ID"]
                                {:name "ID" :base_type "type/BigInteger" :database_type "BIGINT"
                                 :table_id ["DB" "PUBLIC" "ORDERS"]}
                                ["DB" "PUBLIC" "ORDERS" "TOTAL"]
                                {:name "TOTAL" :base_type "type/Float" :database_type "DOUBLE PRECISION"
                                 :table_id ["DB" "PUBLIC" "ORDERS"]}}
                    :cards     {"sql-card" {:name "SQL Card"
                                            :entity_id "sql-card"
                                            :type "question"
                                            :dataset_query {:database "DB"
                                                            :type "native"
                                                            :native {:query "SELECT ID, TOTAL FROM ORDERS"}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["sql-card"])
          result  (get results "sql-card")]
      (is (some? result))
      (is (nil? (:error result)))
      (is (empty? (:bad-refs result)) "Valid native SQL should have no bad refs"))))

;;; ===========================================================================
;;; Measure and Segment reference tests
;;; ===========================================================================

(deftest measure-ref-resolved-test
  (testing "Card referencing a known measure resolves without errors"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Uses Measure"
                                      :entity_id "card-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]
                                                              :aggregation [["measure" "mSrAvgProdPrice00008x"]]}}}}
                    :measures {"mSrAvgProdPrice00008x" {:name "Avg Product Price"
                                                        :entity_id "mSrAvgProdPrice00008x"}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (empty? (filter #(= :measure (:type %)) (or (:unresolved result) [])))
          "Should not have unresolved measure refs"))))

(deftest measure-ref-missing-test
  (testing "Card referencing unknown measure is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Bad Measure Ref"
                                      :entity_id "card-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]
                                                              :aggregation [["measure" "xXxNoExIsT0MeAsUrExx1"]]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (some #(= :measure (:type %)) (or (:unresolved result) []))
          "Should have unresolved measure ref"))))

(deftest segment-ref-resolved-test
  (testing "Card referencing a known segment resolves without errors"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Uses Segment"
                                      :entity_id "card-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]
                                                              :filter ["segment" "aB3kLmN9pQrStUvWxYz1a"]}}}}
                    :segments {"aB3kLmN9pQrStUvWxYz1a" {:name "Known Segment"
                                                        :entity_id "aB3kLmN9pQrStUvWxYz1a"}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)) (str "Should not error: " (:error result)))
      (is (empty? (filter #(= :segment (:type %)) (or (:unresolved result) [])))
          "Should not have unresolved segment refs"))))

(deftest segment-ref-missing-test
  (testing "Card referencing unknown segment is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Bad Segment Ref"
                                      :entity_id "card-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]
                                                              :filter ["segment" "xXxNoExIsT0SeGmEnTx12"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (some #(= :segment (:type %)) (or (:unresolved result) []))
          "Should have unresolved segment ref"))))

;;; ===========================================================================
;;; Transitive entity ref tests
;;; ===========================================================================

(deftest transitive-snippet-refs-test
  (testing "Card sourcing from another card that uses a snippet surfaces that snippet transitively"
    ;; Entity-ids must be 21-char NanoIDs to pass portable-id? checks
    (let [inner-eid "tRaNsInNeRsNiPpEt0001"
          outer-eid "tRaNsOuTeRsNiPpEt0001"
          snip-eid  "tRaNsSnIpPeTiD0000001"
          entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
                    :fields    {["DB" "PUBLIC" "ORDERS" "ID"] {:name "ID" :base_type "type/BigInteger"
                                                               :database_type "BIGINT"}}
                    :cards     {inner-eid {:name "Inner Card"
                                           :entity_id inner-eid
                                           :dataset_query {:database "DB"
                                                           :stages [{:native "SELECT * FROM ORDERS WHERE {{snippet: My Filter}}"
                                                                     :template-tags {"snippet: My Filter"
                                                                                     {:type "snippet"
                                                                                      :snippet-name "My Filter"
                                                                                      :snippet-id snip-eid}}
                                                                     "lib/type" "mbql.stage/native"}]
                                                           "lib/type" "mbql/query"}
                                           :result_metadata [{:name "ID" :base_type "type/BigInteger"}]}
                                outer-eid {:name "Outer Card"
                                           :entity_id outer-eid
                                           :dataset_query {:database "DB"
                                                           :stages [{:source-card inner-eid
                                                                     "lib/type" "mbql.stage/mbql"}]
                                                           "lib/type" "mbql/query"}}}
                    :snippets  {snip-eid {:name "My Filter" :content "1=1"}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index [outer-eid inner-eid])
          outer   (get results outer-eid)]
      (is (= ["Inner Card"] (get-in outer [:refs :source-cards]))
          "Should list inner card as source")
      (is (= ["My Filter"] (get-in outer [:refs :snippets]))
          "Should transitively surface the inner card's snippet"))))

(deftest transitive-measure-refs-test
  (testing "Card sourcing from another card that uses measures/segments surfaces them transitively"
    (let [inner-eid "tRaNsInNeRmEaSuRe0001"
          outer-eid "tRaNsOuTeRmEaSuRe0001"
          msr-eid   "tRaNsMeAsUrEiD0000001"
          seg-eid   "tRaNsSeGmEnTiD0000001"
          entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables    {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields    {}
                    :cards     {inner-eid {:name "Inner Metrics"
                                           :entity_id inner-eid
                                           :dataset_query {:database "DB"
                                                           :stages [{:source-table ["DB" "PUBLIC" "T"]
                                                                     :aggregation [["measure" msr-eid]]
                                                                     :filters [["segment" seg-eid]]
                                                                     "lib/type" "mbql.stage/mbql"}]
                                                           "lib/type" "mbql/query"}
                                           :result_metadata [{:name "count" :base_type "type/Integer"}]}
                                outer-eid {:name "Outer Query"
                                           :entity_id outer-eid
                                           :dataset_query {:database "DB"
                                                           :stages [{:source-card inner-eid
                                                                     "lib/type" "mbql.stage/mbql"}]
                                                           "lib/type" "mbql/query"}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          index   (assoc index
                         :measure {msr-eid :memory}
                         :segment {seg-eid :memory})
          results (checker/check-entities schema assets index [outer-eid inner-eid])
          outer   (get results outer-eid)]
      (is (= ["Inner Metrics"] (get-in outer [:refs :source-cards])))
      (is (= [msr-eid] (get-in outer [:refs :measures]))
          "Should transitively surface the inner card's measure")
      (is (= [seg-eid] (get-in outer [:refs :segments]))
          "Should transitively surface the inner card's segment"))))

;;; ===========================================================================
;;; Collection reference tests
;;; ===========================================================================

(deftest valid-collection-id-test
  (testing "Card with valid collection_id passes"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Good Card"
                                      :entity_id "card-1"
                                      :collection_id "coll-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          ;; Index includes the collection
          index (assoc index :collection {"coll-1" :memory})
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)))
      (is (empty? (:unresolved result)) "Valid collection_id should not produce unresolved refs"))))

(deftest missing-collection-id-test
  (testing "Card with collection_id pointing to nonexistent entity is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Bad Collection Card"
                                      :entity_id "card-1"
                                      :collection_id "nonexistent"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (seq (:unresolved result)) "Missing collection should be flagged")
      (is (some #(= :collection (:type %)) (:unresolved result))
          "Should have unresolved collection ref"))))

(deftest collection-id-points-to-card-test
  (testing "Card with collection_id pointing to another card (not a collection) is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Card With Bad Collection"
                                      :entity_id "card-1"
                                      :collection_id "card-2"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}
                            "card-2" {:name "Other Card"
                                      :entity_id "card-2"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (seq (:unresolved result)) "collection_id pointing to a card should be flagged")
      (is (some #(and (= :collection (:type %))
                      (re-find #"card" (or (:message %) "")))
                (:unresolved result))
          "Error should mention it points to a card"))))

(deftest nil-collection-id-test
  (testing "Card with nil collection_id is fine"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Root Card"
                                      :entity_id "card-1"
                                      :collection_id nil
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)))
      (is (empty? (:unresolved result)) "nil collection_id should be fine"))))

;;; ===========================================================================
;;; Dashboard ID reference tests
;;; ===========================================================================

(deftest card-with-missing-dashboard-id-test
  (testing "Card with dashboard_id pointing to nonexistent dashboard is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Orphaned Card"
                                      :entity_id "card-1"
                                      :dashboard_id "nonexistent-dash"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (seq (:unresolved result)) "Missing dashboard_id should be flagged")
      (is (some #(= :dashboard (:type %)) (:unresolved result))
          "Should have unresolved dashboard ref"))))

(deftest card-with-valid-dashboard-id-test
  (testing "Card with dashboard_id pointing to a known dashboard passes"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Dashboard Card"
                                      :entity_id "card-1"
                                      :dashboard_id "dash-1"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          index (assoc index :dashboard {"dash-1" :memory})
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)))
      (is (empty? (:unresolved result)) "Valid dashboard_id should not produce unresolved refs"))))

(deftest card-with-null-dashboard-id-test
  (testing "Card with nil dashboard_id is fine"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Standalone Card"
                                      :entity_id "card-1"
                                      :dashboard_id nil
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (nil? (:error result)))
      (is (empty? (:unresolved result)) "nil dashboard_id should be fine"))))

(deftest card-with-dashboard-id-pointing-to-card-test
  (testing "Card with dashboard_id pointing to another card (not a dashboard) is flagged"
    (let [entities {:databases {"DB" {:name "DB" :engine "h2"}}
                    :tables {["DB" "PUBLIC" "T"] {:name "T" :schema "PUBLIC"}}
                    :fields {}
                    :cards {"card-1" {:name "Bad Dash Ref"
                                      :entity_id "card-1"
                                      :dashboard_id "card-2"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}
                            "card-2" {:name "Other Card"
                                      :entity_id "card-2"
                                      :dataset_query {:database "DB"
                                                      :type "query"
                                                      :query {:source-table ["DB" "PUBLIC" "T"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["card-1"])
          result (get results "card-1")]
      (is (seq (:unresolved result)) "dashboard_id pointing to a card should be flagged")
      (is (some #(and (= :dashboard (:type %))
                      (re-find #"card" (or (:message %) "")))
                (:unresolved result))
          "Error should mention it points to a card"))))

(deftest dashboard-bad-collection-id-test
  (testing "Dashboard with invalid collection_id is flagged"
    (let [entities {:databases {} :tables {} :fields {} :cards {}
                    :dashboards {"dash-1" {:name "My Dashboard"
                                           :entity_id "dash-1"
                                           :collection_id "nonexistent"}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index)]
      (is (contains? results "dash-1") "Dashboard should be in results")
      (let [result (get results "dash-1")]
        (is (seq (:unresolved result)) "Dashboard with bad collection_id should be flagged")
        (is (some #(= :collection (:type %)) (:unresolved result)))))))

(deftest dashboard-valid-collection-id-not-flagged-test
  (testing "Dashboard with valid collection_id passes"
    (let [entities {:databases {} :tables {} :fields {} :cards {}
                    :dashboards {"dash-1" {:name "Good Dashboard"
                                           :entity_id "dash-1"
                                           :collection_id "coll-1"}}
                    :collections {"coll-1" {:name "My Collection"
                                            :entity_id "coll-1"}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index)]
      (is (= :ok (checker/result-status (get results "dash-1")))
          "Dashboard with valid collection_id should be OK"))))

;;; ===========================================================================
;;; Dashboard semantic validation tests
;;; ===========================================================================

(defn- with-temp-dashboard
  "Run checks with a dashboard entity provided via in-memory source.
   `dashboard-data` is a map representing the dashboard.
   `extra-index` is merged into the index (e.g. to add cards).
   Calls `(f results)` with the check results."
  [dashboard-data extra-index f]
  (let [entity-id  (:entity_id dashboard-data)
        entities   {:databases  {}
                    :tables     {}
                    :fields     {}
                    :cards      {}
                    :dashboards {entity-id dashboard-data}}
        [schema assets base-index] (helpers/make-sources-and-index entities)
        index      (merge base-index
                          {:collection {}
                           :card {}}
                          extra-index)
        results    (checker/check-entities schema assets index)]
    (f results)))

(deftest dashboard-card-ref-valid-test
  (testing "Dashboard with valid card_id refs passes"
    (with-temp-dashboard
      {:name "Good Dashboard"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id "card-1"
                    :dashboard_tab_id ["dash-1" "tab-1"]
                    :row 0 :col 0 :size_x 12 :size_y 6}]}
      {:card {"card-1" :memory}}
      (fn [results]
        (is (= :ok (checker/result-status (get results "dash-1")))
            "Dashboard with valid refs should be OK")))))

(deftest dashboard-card-ref-missing-test
  (testing "Dashboard with card_id pointing to unknown card is flagged"
    (with-temp-dashboard
      {:name "Bad Card Ref"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id "nonexistent-card"
                    :dashboard_tab_id ["dash-1" "tab-1"]
                    :row 0 :col 0 :size_x 12 :size_y 6}]}
      {}
      (fn [results]
        (is (contains? results "dash-1"))
        (let [result (get results "dash-1")]
          (is (some #(= :dashcard-card-ref (:type %)) (:unresolved result))
              "Should flag missing card ref"))))))

(deftest dashboard-virtual-card-null-card-id-test
  (testing "Dashboard with null card_id (heading/text) is fine"
    (with-temp-dashboard
      {:name "Headings Dashboard"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id nil
                    :dashboard_tab_id ["dash-1" "tab-1"]
                    :row 0 :col 0 :size_x 24 :size_y 1}]}
      {}
      (fn [results]
        (is (= :ok (checker/result-status (get results "dash-1")))
            "Virtual card with null card_id should be fine")))))

(deftest dashboard-tab-ref-invalid-test
  (testing "Dashboard with dashcard referencing nonexistent tab is flagged"
    (with-temp-dashboard
      {:name "Bad Tab Ref"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id nil
                    :dashboard_tab_id ["dash-1" "wrong-tab"]
                    :row 0 :col 0 :size_x 12 :size_y 6}]}
      {}
      (fn [results]
        (is (contains? results "dash-1"))
        (let [result (get results "dash-1")]
          (is (some #(= :dashcard-tab-ref (:type %)) (:unresolved result))
              "Should flag bad tab ref"))))))

(deftest dashboard-grid-overflow-test
  (testing "Dashboard with dashcard extending beyond grid width is flagged"
    (with-temp-dashboard
      {:name "Grid Overflow"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id nil
                    :dashboard_tab_id ["dash-1" "tab-1"]
                    :row 0 :col 20 :size_x 12 :size_y 6}]}
      {}
      (fn [results]
        (is (contains? results "dash-1"))
        (let [result (get results "dash-1")]
          (is (some #(= :dashcard-grid (:type %)) (:unresolved result))
              "Should flag grid overflow"))))))

(deftest dashboard-grid-negative-col-test
  (testing "Dashboard with negative col is flagged"
    (with-temp-dashboard
      {:name "Negative Col"
       :entity_id "dash-1"
       :tabs []
       :dashcards [{:entity_id "dc-1"
                    :card_id nil
                    :row 0 :col -1 :size_x 12 :size_y 6}]}
      {}
      (fn [results]
        (is (contains? results "dash-1"))
        (let [result (get results "dash-1")]
          (is (some #(= :dashcard-grid (:type %)) (:unresolved result))
              "Should flag negative col"))))))

(deftest dashboard-valid-full-width-test
  (testing "Dashboard with full-width card (col=0, size_x=24) passes"
    (with-temp-dashboard
      {:name "Full Width"
       :entity_id "dash-1"
       :tabs [{:entity_id "tab-1" :name "Tab 1" :position 0}]
       :dashcards [{:entity_id "dc-1"
                    :card_id nil
                    :dashboard_tab_id ["dash-1" "tab-1"]
                    :row 0 :col 0 :size_x 24 :size_y 1}]}
      {}
      (fn [results]
        (is (= :ok (checker/result-status (get results "dash-1")))
            "Full-width card should be valid")))))

;;; ===========================================================================
;;; Transform query validation tests
;;; ===========================================================================

(defn- with-temp-transform
  "Run checks with a transform entity provided via in-memory source.
   `transform-data` is a map representing the transform.
   `extra-index` is merged into the index (e.g. to add databases).
   Calls `(f results)` with the check results."
  [transform-data extra-index f]
  (let [entity-id (:entity_id transform-data)
        entities  {:databases  (get extra-index :_databases {})
                   :tables     (get extra-index :_tables {})
                   :fields     (get extra-index :_fields {})
                   :cards      {}
                   :transforms {entity-id transform-data}}
        [schema assets base-index] (helpers/make-sources-and-index entities)
        index     (merge base-index
                         {:collection {}
                          :card {}}
                         (dissoc extra-index :_databases :_tables :_fields))
        results   (checker/check-entities schema assets index)]
    (f results)))

(deftest transform-bad-native-sql-test
  (testing "Transform with invalid native SQL is flagged"
    (with-temp-transform
      {:name "Bad SQL Transform"
       :entity_id "tx-1"
       :source_database_id "Test DB"
       :source {:type "query"
                :query {"lib/type" "mbql/query"
                        :database "Test DB"
                        :stages [{"lib/type" "mbql.stage/native"
                                  :native "SELET * FROM ORDERS"}]}}
       :target {:type "table" :schema "TRANSFORMS" :name "bad_transform"}
       :serdes/meta [{:id "tx-1" :model "Transform"}]}
      {:_databases {"Test DB" {:name "Test DB" :engine "h2"}}
       :_tables    {["Test DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
       :_fields    {}
       :database   {"Test DB" :memory}}
      (fn [results]
        (is (contains? results "tx-1") "Transform with bad SQL should be in results")
        (let [result (get results "tx-1")]
          (is (or (seq (:native-errors result))
                  (:error result)
                  (seq (:unresolved result)))
              "Should have native errors, error, or unresolved refs"))))))

(deftest transform-valid-native-sql-test
  (testing "Transform with valid native SQL passes"
    (with-temp-transform
      {:name "Good SQL Transform"
       :entity_id "tx-1"
       :source_database_id "Test DB"
       :source {:type "query"
                :query {"lib/type" "mbql/query"
                        :database "Test DB"
                        :stages [{"lib/type" "mbql.stage/native"
                                  :native "SELECT ID, TOTAL FROM ORDERS"}]}}
       :target {:type "table" :schema "TRANSFORMS" :name "good_transform"}
       :serdes/meta [{:id "tx-1" :model "Transform"}]}
      {:_databases {"Test DB" {:name "Test DB" :engine "h2"}}
       :_tables    {["Test DB" "PUBLIC" "ORDERS"] {:name "ORDERS" :schema "PUBLIC"}}
       :_fields    {["Test DB" "PUBLIC" "ORDERS" "ID"]
                    {:name "ID" :base_type "type/BigInteger" :database_type "BIGINT"
                     :table_id ["Test DB" "PUBLIC" "ORDERS"]}
                    ["Test DB" "PUBLIC" "ORDERS" "TOTAL"]
                    {:name "TOTAL" :base_type "type/Float" :database_type "DOUBLE PRECISION"
                     :table_id ["Test DB" "PUBLIC" "ORDERS"]}}
       :database   {"Test DB" :memory}}
      (fn [results]
        (is (= :ok (checker/result-status (get results "tx-1")))
            "Transform with valid SQL should be OK")))))

(deftest transform-mbql-unresolved-table-test
  (testing "Transform with MBQL referencing nonexistent table is flagged"
    (with-temp-transform
      {:name "Bad MBQL Transform"
       :entity_id "tx-1"
       :source_database_id "Test DB"
       :source {:type "query"
                :query {"lib/type" "mbql/query"
                        :database "Test DB"
                        :stages [{"lib/type" "mbql.stage/mbql"
                                  :source-table ["Test DB" "PUBLIC" "NONEXISTENT"]}]}}
       :target {:type "table" :schema "TRANSFORMS" :name "bad_mbql_transform"}
       :serdes/meta [{:id "tx-1" :model "Transform"}]}
      {:_databases {"Test DB" {:name "Test DB" :engine "h2"}}
       :_tables    {}
       :_fields    {}
       :database   {"Test DB" :memory}}
      (fn [results]
        (is (contains? results "tx-1") "Transform with unresolved table should be in results")
        (let [result (get results "tx-1")]
          (is (seq (:unresolved result)) "Should have unresolved refs"))))))

(deftest transform-missing-database-test
  (testing "Transform referencing nonexistent database is flagged"
    (with-temp-transform
      {:name "Bad DB Transform"
       :entity_id "tx-1"
       :source_database_id "Nonexistent DB"
       :source {:type "query"
                :query {"lib/type" "mbql/query"
                        :database "Nonexistent DB"
                        :stages [{"lib/type" "mbql.stage/native"
                                  :native "SELECT 1"}]}}
       :target {:type "table" :schema "TRANSFORMS" :name "bad_db"}
       :serdes/meta [{:id "tx-1" :model "Transform"}]}
      {}
      (fn [results]
        (is (contains? results "tx-1") "Transform with missing DB should be in results")
        (let [result (get results "tx-1")]
          (is (some #(= :database (:type %)) (:unresolved result))
              "Should flag missing database"))))))

;;; ===========================================================================
;;; Multi-database tests
;;;
;;; The provider's `(database)` method must return the correct database for the
;;; entity being checked, not just the first database in the store.
;;; ===========================================================================

(deftest multi-database-cards-test
  (testing "Cards from different databases each get the correct database metadata"
    (let [entities {:databases {"H2 DB"     {:name "H2 DB" :engine "h2"}
                                "Postgres DB" {:name "Postgres DB" :engine "postgres"}}
                    :tables    {["H2 DB" "PUBLIC" "ORDERS"]
                                {:name "ORDERS" :schema "PUBLIC"}
                                ["Postgres DB" "public" "customers"]
                                {:name "customers" :schema "public"}}
                    :fields    {["H2 DB" "PUBLIC" "ORDERS" "ID"]
                                {:name "ID" :base_type "type/BigInteger"
                                 :database_type "BIGINT"
                                 :table_id ["H2 DB" "PUBLIC" "ORDERS"]}
                                ["Postgres DB" "public" "customers" "id"]
                                {:name "id" :base_type "type/BigInteger"
                                 :database_type "bigint"
                                 :table_id ["Postgres DB" "public" "customers"]}}
                    :cards     {"h2-card"       {:name "H2 Card"
                                                 :entity_id "h2-card"
                                                 :type "question"
                                                 :dataset_query {:database "H2 DB"
                                                                 :type "query"
                                                                 :query {:source-table ["H2 DB" "PUBLIC" "ORDERS"]}}}
                                "postgres-card" {:name "Postgres Card"
                                                 :entity_id "postgres-card"
                                                 :type "question"
                                                 :dataset_query {:database "Postgres DB"
                                                                 :type "query"
                                                                 :query {:source-table ["Postgres DB" "public" "customers"]}}}}}
          [schema assets index] (helpers/make-sources-and-index entities)
          results (checker/check-entities schema assets index ["h2-card" "postgres-card"])
          h2-result (get results "h2-card")
          pg-result (get results "postgres-card")]
      (is (some? h2-result) "H2 card should be checked")
      (is (some? pg-result) "Postgres card should be checked")
      (is (nil? (:error h2-result)) (str "H2 card should not error: " (:error h2-result)))
      (is (nil? (:error pg-result)) (str "Postgres card should not error: " (:error pg-result)))
      (is (empty? (:bad-refs h2-result)) "H2 card should have no bad refs")
      (is (empty? (:bad-refs pg-result)) "Postgres card should have no bad refs"))))

;;; ===========================================================================
;;; REPL Helpers
;;; ===========================================================================

(comment
  ;; Run all tests
  (clojure.test/run-tests 'metabase-enterprise.checker.semantic-test)

  ;; Check fixtures path
  (fixtures-path)

  ;; Manually check all cards in fixtures
  (def source (make-test-source))
  (check-all source))
