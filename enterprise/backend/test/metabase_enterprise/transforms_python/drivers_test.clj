(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms-python.drivers-test
  "Comprehensive tests for Python transforms across all supported drivers with all base and exotic types."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-python.execute :as transforms-python.execute]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.python-runner-test :as python-runner-test]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- execute-e2e-transform!
  "Execute an e2e Python transform test using execute-python-transform!"
  [table-name transform-code source-tables]
  (let [schema (when (#{:postgres :bigquery-cloud-sdk} driver/*driver*)
                 (sql.tx/session-schema driver/*driver*))
        target {:type "table"
                :schema schema
                :name table-name
                :database (mt/id)}
        transform-def {:name (str "E2E Transform Test " table-name)
                       :source_database_id (mt/id)
                       :source {:type "python"
                                :source-tables source-tables
                                :body transform-code}
                       :target target}]
    (with-transform-cleanup! [_target target]
      (mt/with-temp [:model/Transform transform transform-def]
        (transforms-python.execute/execute-python-transform! transform {:run-method :manual})
        (let [table (transforms.tu/wait-for-table table-name 10000)
              columns (t2/select :model/Field :table_id (:id table) {:order-by [:position]})
              column-names (filterv (fn [x] (not= x "_id")) ;; for mongo
                                    (map :name columns))
              rows (transforms.tu/table-rows table-name)]
          {:columns column-names
           :rows rows})))))

(def ^:private base-type-test-data
  "Base types that all drivers should support with test data."
  {:columns [{:name "id" :type :type/Integer :nullable? false}
             {:name "name" :type :type/Text :nullable? true}
             {:name "price" :type :type/Float :nullable? true}
             {:name "active" :type :type/Boolean :nullable? true}
             {:name "created_date" :type :type/Date :nullable? true}
             {:name "created_at" :type :type/DateTime :nullable? true}]
   :data [[1 "Product A" 19.99 true "2024-01-01" "2024-01-01T12:00:00"]
          [2 "Product B" 15.50 false "2024-02-01" "2024-02-01T09:15:30"]
          [3 nil nil nil nil nil]]})

(def ^:private driver-exotic-types
  "Driver-specific exotic types with test data."
  {:postgres {:columns [{:name "id" :type :type/Integer :nullable? false}
                        {:name "bigint" :type :type/BigInteger :nullable? false}
                        {:name "created_tz" :type :type/DateTimeWithTZ :nullable? true}
                        {:name "uuid_field" :type :type/UUID :nullable? true}
                        {:name "json_field" :type :type/JSON :nullable? true}
                        {:name "ip_field" :type :type/IPAddress :nullable? true}
                        {:name "int_array" :type :type/* :nullable? true :database-type "integer[]"}
                        {:name "text_array" :type :type/* :nullable? true :database-type "text[]"}
                        {:name "uuid_array" :type :type/* :nullable? true :database-type "uuid[]"}]
              :data [[1 -9223372036854775808 "2024-01-01T12:00:00Z" "550e8400-e29b-41d4-a716-446655440000" "{\"key\": \"value\"}" "192.168.1.1"
                      "{1,2,3,4,5}" "{\"hello\",\"world\",\"test\"}" "{550e8400-e29b-41d4-a716-446655440000,123e4567-e89b-12d3-a456-426614174000}"]
                     [2 0 nil nil nil nil nil nil nil]
                     [3 nil "2024-02-01T09:15:30-05:00" nil nil nil "{}" "{}" "{}"]]}

   :mysql {:columns [{:name "id" :type :type/Integer :nullable? false}
                     {:name "json_field" :type :type/JSON :nullable? true}
                     {:name "timestamp" :type :type/DateTimeWithLocalTZ :nullable? true :database-type "timestamp"}]
           :data [[1 "{\"key\": \"value\"}" "2024-01-01 12:00:00"]
                  [2 nil
                   nil]]}
   :mariadb {:columns [{:name "id" :type :type/Integer :nullable? false}
                       {:name "json_field" :type :type/JSON :nullable? true}]
             :data [[1 "{\"key\": \"mariadb_value\"}"]
                    [2 nil]]}

   :bigquery-cloud-sdk {:columns [{:name "id" :type :type/Integer :nullable? false}
                                  {:name "json_field" :type :type/JSON :nullable? true}
                                  {:name "dict_field" :type :type/Dictionary :nullable? true :database-type "STRUCT<key STRING, value INT64>"}]
                        :data [[1 "{\"key\": \"value\"}" {"key" "test", "value" 42}]
                               [2 nil nil]]}
   :sqlserver {:columns [{:name "id" :type :type/Integer :nullable? false}
                         {:name "uuid_field" :type :type/UUID :nullable? true}
                         {:name "datetimeoffset_field" :type :type/DateTimeWithTZ :nullable? true :database-type "datetimeoffset"}]
               :data [[1 "550e8400-e29b-41d4-a716-446655440000" "2024-01-01 12:00:00 -05:00"]
                      [2 nil nil]]}
   :mongo {:columns [{:name "id" :type :type/Integer :nullable? false}
                     {:name "uuid_field" :type :type/UUID :nullable? true}
                     {:name "array_field" :type :type/Array :nullable? true :database-type "array"}
                     {:name "dict_field" :type :type/Dictionary :nullable? true :database-type "object"}]
           :data [[1 #uuid "550e8400-e29b-41d4-a716-446655440000" [1, 2, 3] {"nested" "object"}]
                  [2 nil nil nil]]}})

(defn- create-test-table-with-data!
  "Create a test table with the given schema and data for the current driver."
  [table-name schema data]
  (let [driver driver/*driver*
        db-id (mt/id)
        schema-name (case driver

                      :clickhouse (-> (mt/db) :details :db)

                      :mongo nil

                      (sql.tx/session-schema driver))
        qualified-table-name (if schema-name
                               (keyword schema-name table-name)
                               (keyword table-name))
        table-schema {:name qualified-table-name
                      :columns (:columns schema)}]
    (mt/as-admin
      (transforms.util/create-table-from-schema! driver db-id table-schema))

    (when (seq data)
      (driver/insert-from-source! driver db-id table-schema
                                  {:type :rows
                                   :data (map (fn [row]
                                                (map #(cond
                                                        (and (= :sqlserver driver) (boolean? %))
                                                        (if % 1 0)

                                                        (and (= :mongo driver) (string? %) (try (u.date/parse %) (catch Exception _)))
                                                        (u.date/parse %)

                                                        :else
                                                        %) row))
                                              data)}))

    (sync/sync-database! (mt/db) {:scan :schema})

    (t2/select-one-pk :model/Table :name (name qualified-table-name) :db_id db-id)))

(defn- cleanup-table!
  "Drop the test table by table ID."
  [table-id]
  (try
    (when-let [table (t2/select-one :model/Table :id table-id)]
      (let [table-name (:name table)
            qualified-name (case driver/*driver*
                             :bigquery-cloud-sdk
                             (let [schema (sql.tx/session-schema driver/*driver*)]
                               (if schema
                                 (keyword (str schema "." table-name))
                                 (keyword table-name)))

                             (let [schema (sql.tx/session-schema driver/*driver*)]
                               (if schema
                                 (keyword schema table-name)
                                 (keyword table-name))))]
        (driver/drop-table! driver/*driver* (mt/id) qualified-name)))
    (catch Exception _e
      nil)))

(defn- validate-transform-output
  "Validate that the Python transform output preserves types and data correctly,
   assuming output is in JSONL format."
  [result expected-columns expected-row-count]
  (testing "Transform execution succeeded"
    (is (some? result))
    (is (contains? result :output))
    (is (contains? result :output-manifest)))

  (when result
    (let [lines (str/split-lines (:output result))
          rows (map json/decode lines)
          metadata (:output-manifest result)
          headers (map :name (:fields metadata))]

      (testing "Column headers are correct"
        (is (= (set expected-columns) (disj (set headers) "_id"))))

      (testing "Row count is correct"
        (is (= expected-row-count (count rows))))

      (testing "Metadata contains all expected columns"
        (is (= (set expected-columns)
               (disj (set (map :name (:fields metadata))) "_id"))))

      {:headers headers
       :rows rows
       :metadata metadata})))

#_:clj-kondo/ignore
(defmacro with-test-table
  [[table-id table-name] [schema data] & body]
  `(let [table-name# (if (= :redshift driver/*driver*)
                       (tx/db-qualified-table-name (get-in (mt/db) [:settings :database-source-dataset-name]) (mt/random-name))
                       (mt/random-name))
         table-id# (create-test-table-with-data! table-name# ~schema ~data)]
     (try
       (let [~table-id table-id#
             ~table-name table-name#]
         ~@body)
       (finally
         (cleanup-table! table-id#)))))

(defn- simple-identity-transform-code
  "Generate Python code for a simple identity transform."
  [table-name]
  (str "import pandas as pd\n"
       "\n"
       "def transform(" table-name "):\n"
       "    df = " table-name ".copy()\n"
       "    return df"))

(defn- execute-and-validate-transform!
  "Execute a Python transform and validate the output, returning validation results."
  [transform-code table-name table-id expected-columns expected-row-count]
  (let [result (python-runner-test/execute! {:code transform-code
                                             :tables {table-name table-id}})]
    (validate-transform-output result expected-columns expected-row-count)))

(defn- test-exotic-types-for-driver!
  "Helper to test exotic types for the current driver."
  [driver-key]
  (when-let [exotic-config (get driver-exotic-types (if (mysql/mariadb? (mt/db)) :mariadb driver-key))]
    (with-test-table [table-id table-name] [exotic-config (:data exotic-config)]
      (let [transform-code (simple-identity-transform-code table-name)
            expected-columns (map :name (:columns exotic-config))
            expected-row-count (count (:data exotic-config))
            validation (execute-and-validate-transform!
                        transform-code table-name table-id
                        expected-columns expected-row-count)]

        (when validation
          (testing (str "Exotic types for " driver-key)
            (let [{:keys [metadata]} validation
                  type-map (u/for-map [{:keys [name base_type]} (:fields metadata)]
                             [name (python-runner/restricted-insert-type base_type)])]

              (is (isa? :type/Integer (type-map "id")))

              (case driver-key
                :postgres (do
                            (is (isa? (type-map "bigint") :type/BigInteger))
                            (is (isa? (type-map "uuid_field") :type/Text #_:type/UUID))
                            (is (isa? (type-map "json_field") :type/Text #_:type/JSON))
                            (is (isa? (type-map "ip_field") :type/Text #_:type/IPAddress)))
                :mysql (if (mysql/mariadb? (mt/db))
                         (is (isa? (type-map "json_field") :type/Text #_:type/JSON))
                         (do
                           (is (isa? (type-map "json_field") :type/Text #_:type/JSON))
                           (is (isa? (type-map "timestamp") :type/DateTimeWithLocalTZ))))

                :bigquery-cloud-sdk (do
                                      (is (isa? (type-map "json_field") :type/Text #_:type/JSON))
                                      (is (isa? (type-map "dict_field") :type/Text #_:type/JSON)))

                :mongo (do
                         (is (isa? (type-map "array_field") :type/Text #_:type/Array))
                         (is (isa? (type-map "dict_field") :type/Text #_:type/Dictionary)))

                :sqlserver (do
                             (is (isa? (type-map "uuid_field") :type/Text #_:type/UUID))
                             (is (isa? (type-map "datetimeoffset_field") :type/DateTimeWithTZ)))))))
        validation))))

(deftest create-table-test
  (testing "Test we can create base table"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (mt/with-empty-db
        (with-test-table [table-id _table-name] [base-type-test-data (:data base-type-test-data)]
          (is table-id "Table should be created and have an ID"))))))

(deftest base-types-python-transform-test
  (testing "Test Python transforms with base types across all supported drivers"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (mt/with-empty-db
        (with-test-table [table-id table-name] [base-type-test-data (:data base-type-test-data)]
          (let [transform-code (simple-identity-transform-code table-name)
                expected-columns ["id" "name" "price" "active" "created_date" "created_at"]
                validation (execute-and-validate-transform!
                            transform-code table-name table-id expected-columns 3)]

            (when validation
              (let [{:keys [metadata]} validation]
                (testing "Base type preservation"
                  (let [type-map (u/for-map [{:keys [name base_type]} (:fields metadata)]
                                   [name (python-runner/restricted-insert-type base_type)])]
                    (is (isa? (type-map "id") (if (= driver/*driver* :snowflake) :type/Number :type/Integer)))
                    (is (isa? (type-map "name") :type/Text))
                    (is (isa? (type-map "price") :type/Float))
                    (is (isa? (type-map "active") :type/Boolean))
                    (is (isa? (type-map "created_date") (if (= driver/*driver* :mongo) :type/Instant :type/Date)))
                    (is (isa? (type-map "created_at") :type/DateTime))))))))))))

(deftest exotic-types-python-transform-test
  (testing "Test Python transforms with driver-specific exotic types"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (mt/with-empty-db
        (test-exotic-types-for-driver! driver/*driver*)))))

(deftest edge-cases-python-transform-test
  (testing "Test Python transforms with edge cases: null values, empty strings, extreme values"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (mt/with-empty-db
        (let [edge-case-schema {:columns [{:name "id" :type :type/Integer :nullable? false}
                                          {:name "text_field" :type :type/Text :nullable? true}
                                          {:name "int_field" :type :type/Integer :nullable? true}
                                          {:name "float_field" :type :type/Float :nullable? true}
                                          {:name "bool_field" :type :type/Boolean :nullable? true}
                                          {:name "date_field" :type :type/Date :nullable? true}]
                                :data [[1 "" 0 0.0 false "2024-01-01"]
                                       [2 "Very long text with special chars: !@#$%^&*(){}[]|\\:;\"'<>,.?/~`"
                                        2147483647 1.79769313486 true "2222-12-31"]
                                       [3 nil nil nil nil nil]]}]
          (with-test-table [table-id table-name] [edge-case-schema (:data edge-case-schema)]
            (let [transform-code (str "import pandas as pd\n"
                                      "import numpy as np\n"
                                      "\n"
                                      "def transform(" table-name "):\n"
                                      "    df = " table-name ".copy()\n"
                                      "    \n"
                                      "    # Handle text operations safely\n"
                                      "    df['text_length'] = df['text_field'].fillna(\"\").astype(str).str.len()"
                                      "    \n"
                                      "    # Handle numeric operations with null safety\n"
                                      "    df['int_doubled'] = df['int_field'] * 2\n"
                                      "    df['float_squared'] = df['float_field'] ** 2\n"
                                      "    \n"
                                      "    # Boolean operations\n"
                                      "    df['bool_inverted'] = ~df['bool_field'].fillna(False)\n"
                                      "    \n"
                                      "    return df")
                  expected-columns ["id" "text_field" "int_field" "float_field" "bool_field" "date_field"
                                    "text_length" "int_doubled" "float_squared" "bool_inverted"]
                  validation (execute-and-validate-transform!
                              transform-code table-name table-id expected-columns 3)]

              (when validation
                (let [{:keys [rows metadata]} validation
                      type-map (u/for-map [{:keys [name base_type]} (:fields metadata)]
                                 [name (python-runner/restricted-insert-type base_type)])]

                  (testing "Original columns preserved"
                    (is (isa? (type-map "id") (if (= driver/*driver* :snowflake) :type/Number :type/Integer)))
                    (is (isa? (type-map "text_field") :type/Text))
                    (is (isa? (type-map "int_field") (if (= driver/*driver* :snowflake) :type/Number :type/Integer)))
                    (is (isa? (type-map "float_field") :type/Float))
                    (is (isa? (type-map "bool_field") :type/Boolean))
                    (is (isa? (type-map "date_field") (if (= driver/*driver* :mongo) :type/Instant :type/Date))))

                  (testing "Computed columns have correct types"
                    (is (isa? (type-map "text_length") :type/Integer))
                    (is (isa? (type-map "int_doubled") :type/Integer))
                    (is (isa? (type-map "float_squared") :type/Float))
                    (is (isa? (type-map "bool_inverted") :type/Boolean)))

                  (testing "Edge case data handling"
                    (let [[row1 row2 row3] rows]
                      (is (= 1 (get row1 "id")))
                      (is (= 0 (get row1 "text_length"))) ; empty string length
                      (is (= 0 (get row1 "int_doubled"))) ; 0 * 2

                      (is (= 2 (get row2 "id")))
                      (is (not= "" (get row2 "text_length"))) ; long string has length

                      (is (= 3 (get row3 "id"))))))))))))))

(deftest idempotent-transform-test
  (testing "Test that running the same transform multiple times produces identical results"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
      (mt/with-empty-db
        (with-test-table [table-id table-name] [base-type-test-data (:data base-type-test-data)]
          (let [transform-code (str "import pandas as pd\n"
                                    "\n"
                                    "def transform(" table-name "):\n"
                                    "    df = " table-name ".copy()\n"
                                    "    df['computed_field'] = df['price'] * 1.1  # 10% markup\n"
                                    "    df['name_upper'] = df['name'].str.upper()\n"
                                    "    return df")
                ;; Run the transform twice
                result1 (python-runner-test/execute!
                         {:code transform-code
                          :tables {table-name table-id}})

                result2 (python-runner-test/execute!
                         {:code transform-code
                          :tables {table-name table-id}})]
            (testing "Both transforms succeeded"
              (is (some? result1))
              (is (some? result2)))

            (when (and result1 result2)
              (testing "Results are identical"
                (is (= (:output result1) (:output result2)))
                (is (= (count (:fields (:output-manifest result1)))
                       (count (:fields (:output-manifest result2))))))

              (let [expected-columns ["id" "name" "price" "active" "created_date" "created_at"
                                      "computed_field" "name_upper"]
                    validation (validate-transform-output result1 expected-columns 3)]

                (when validation
                  (testing "Computed columns are added correctly"
                    (let [{:keys [metadata]} validation
                          type-map (u/for-map [{:keys [name base_type]} (:fields metadata)]
                                     [name (python-runner/restricted-insert-type base_type)])]
                      (is (= :type/Float (type-map "computed_field")))
                      (is (= :type/Text (type-map "name_upper"))))))))))))))

(deftest comprehensive-e2e-python-transform-test
  (testing "End-to-end test using execute-python-transform! across all supported drivers with comprehensive type coverage"
    (mt/test-drivers (disj (mt/normal-drivers-with-feature :transforms/python)
                           ;; we sometimes get I/O error in CI due to it taking too long. it's too slow, too flakey to keep enabled
                           :redshift)
      (mt/with-empty-db
        (mt/with-premium-features #{:transforms-python :transforms}
          (with-test-table [source-table-id source-table-name] [base-type-test-data (:data base-type-test-data)]
            (let [table-name (mt/random-name)
                  exotic-config (get driver-exotic-types driver/*driver*)
                  exotic-table-id (when exotic-config
                                    (create-test-table-with-data!
                                     (str source-table-name "_exotic")
                                     exotic-config
                                     (:data exotic-config)))]

              (try
                (let [transform-code (str "import pandas as pd\n"
                                          "\n"
                                          "def transform(" source-table-name
                                          (when exotic-config (str ", " source-table-name "_exotic"))
                                          "):\n"
                                          "    # Start with base types table\n"
                                          "    df = " source-table-name ".copy()\n"
                                          "    \n"
                                          "    # Add computed columns to test type handling\n"
                                          "    df['price_with_tax'] = df['price'] * 1.08  # Float computation\n"
                                          "    df['name_length'] = df['name'].str.len()   # String operations\n"
                                          "    df['is_expensive'] = df['price'] > 18.0    # Boolean computation\n"
                                          "    \n"
                                          "    # Date operations\n"
                                          "    df['created_year'] = pd.to_datetime(df['created_date']).dt.year\n"
                                          "    \n"
                                          (when exotic-config
                                            (str "    # Merge with exotic types if available\n"
                                                 "    exotic_df = " source-table-name "_exotic.copy()\n"
                                                 "    df = df.merge(exotic_df, on='id', how='left', suffixes=('', '_exotic'))\n"
                                                 "    df.attrs[\"source_metadata\"] = {**df.attrs.get(\"source_metadata\", {}), **exotic_df.attrs.get(\"source_metadata\", {})}"
                                                 "    \n"))
                                          "    # Return processed dataframe\n"
                                          "    return df")

                      source-tables (cond-> {source-table-name source-table-id}
                                      exotic-table-id
                                      (assoc (str source-table-name "_exotic") exotic-table-id))

                      result (execute-e2e-transform! table-name transform-code source-tables)
                      {:keys [columns] result-rows :rows} result]

                  (testing "E2E transform execution succeeded"
                    (is (seq result-rows) "Transform should produce results"))

                  (testing "Expected data transformations"
                    (let [first-row (first result-rows)
                          second-row (second result-rows)
                          third-row (nth result-rows 2)
                          get-column (fn [row col-name] (get (zipmap columns row) col-name))]
                      (testing "Computed columns are present and have reasonable values"
                        (is (> (count columns) 7) "Should have additional computed columns")
                        (is (= 3 (count result-rows)) "Should have 3 rows from source data"))

                      (testing "Computed column values are mathematically correct"
                        (testing "Row 1 price_with_tax calculation"
                          (let [price-with-tax (get-column first-row "price_with_tax")]
                            (is (and (number? price-with-tax) (> price-with-tax 21.5) (< price-with-tax 21.7))
                                "First row price_with_tax should be ~21.59")))

                        (testing "Row 2 price_with_tax calculation"
                          (let [price-with-tax (get-column second-row "price_with_tax")]
                            (is (and (number? price-with-tax) (> price-with-tax 16.7) (< price-with-tax 16.8))
                                "Second row price_with_tax should be ~16.74")))

                        (testing "Name length calculations"
                          (is (== 9 (get-column first-row "name_length")) "First row name_length should be 9")
                          (is (== 9 (get-column second-row "name_length")) "Second row name_length should be 9"))

                        (testing "Boolean expense calculations"
                          (is (true? (get-column first-row "is_expensive")) "First row is_expensive should be true")
                          (is (false? (get-column second-row "is_expensive")) "Second row is_expensive should be false"))

                        (testing "Date year extraction"
                          (is (== 2024 (get-column first-row "created_year")) "First row created_year should be 2024")
                          (is (== 2024 (get-column second-row "created_year")) "Second row created_year should be 2024"))

                        (testing "Null value handling"
                          (is (seq third-row) "Third row should contain values (nulls handled gracefully)"))))))
                (finally
                  (when exotic-table-id
                    (cleanup-table! exotic-table-id)))))))))))
