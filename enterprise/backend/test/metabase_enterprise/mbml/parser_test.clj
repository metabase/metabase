(ns metabase-enterprise.mbml.parser-test
  "Comprehensive unit tests for MBML parser engine functions.
  
  Tests cover all parser engine functions:
  - extract-sql-frontmatter: SQL comment block extraction
  - extract-python-frontmatter: Python comment block extraction
  - detect-file-type: File type detection from extensions
  - extract-content: Content extraction routing
  - parse-yaml: YAML parsing with error handling
  - validate-mbml: Schema validation with Malli
  
  All test data is inline to ensure self-contained, reproducible tests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mbml.parser :as mbml.parser]
   [metabase.test :as mt]))

;;; ------------------------------------------ Test Data --------------------------------------------------

(def valid-sql-with-frontmatter
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Customer Sales Analysis
-- identifier: customer_sales_transform
-- description: Transform customer data with sales metrics
-- database: analytics_db
-- target: customer_sales_view
-- tags:
--   - sales
--   - customer
-- METABASE_END

SELECT 
  c.customer_id,
  c.customer_name,
  SUM(o.total_amount) as total_sales
FROM customers c
JOIN orders o ON c.customer_id = o.customer_id
GROUP BY c.customer_id, c.customer_name;")

(def valid-python-with-frontmatter
  "# METABASE_BEGIN
# entity: model/Transform:v1
# name: Data Processing Pipeline
# identifier: data_processing_transform
# description: Python-based data transformation
# database: warehouse_db
# target: processed_data
# tags:
#   - etl
#   - pipeline
# METABASE_END

import pandas as pd
import numpy as np

def process_data(df):
    return df.groupby('category').sum()

if __name__ == '__main__':
    data = pd.read_csv('input.csv')
    result = process_data(data)
    result.to_csv('output.csv')")

(def sql-without-frontmatter
  "SELECT * FROM customers WHERE status = 'active';")

(def python-without-frontmatter
  "import pandas as pd
print('Hello, world!')")

(def sql-with-incomplete-frontmatter
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Incomplete Transform

SELECT * FROM table;")

(def python-with-incomplete-frontmatter
  "# METABASE_BEGIN
# entity: model/Transform:v1
# name: Incomplete Transform

print('Missing end marker')")

(def sql-with-indented-markers
  "    -- METABASE_BEGIN
    -- entity: model/Transform:v1
    -- name: Indented Transform
    -- identifier: indented_transform
    -- database: test_db
    -- target: indented_view
    -- METABASE_END

SELECT * FROM indented_table;")

(def python-with-indented-markers
  "    # METABASE_BEGIN
    # entity: model/Transform:v1
    # name: Indented Transform
    # identifier: indented_transform
    # database: test_db
    # target: indented_view
    # METABASE_END

print('Indented Python code')")

(def valid-yaml-content
  "entity: model/Transform:v1
name: YAML Transform
identifier: yaml_transform
description: Pure YAML configuration
database: yaml_db
target: yaml_view
tags:
  - yaml
  - config")

(def malformed-yaml-content
  "entity: model/Transform:v1
name: Malformed YAML
identifier: malformed_transform
invalid_yaml: [unclosed_array
database: test_db")

(def empty-content "")

(def whitespace-only-content "   \n\t  \n  ")

;;; ---------------------------------- extract-sql-frontmatter Tests ------------------------------------

(deftest extract-sql-frontmatter-test
  (testing "Extracts front-matter from valid SQL file"
    (let [result (mbml.parser/extract-sql-frontmatter valid-sql-with-frontmatter)]
      (is (map? result))
      (is (contains? result :metadata))
      (is (contains? result :source))
      (is (string? (:metadata result)))
      (is (string? (:source result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:metadata result) "name: Customer Sales Analysis"))
      (is (str/includes? (:source result) "SELECT"))
      (is (str/includes? (:source result) "customers c"))))

  (testing "Returns nil metadata for SQL without front-matter"
    (let [result (mbml.parser/extract-sql-frontmatter sql-without-frontmatter)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= sql-without-frontmatter (:source result)))))

  (testing "Returns nil metadata for incomplete front-matter (missing end marker)"
    (let [result (mbml.parser/extract-sql-frontmatter sql-with-incomplete-frontmatter)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= sql-with-incomplete-frontmatter (:source result)))))

  (testing "Handles indented markers correctly"
    (let [result (mbml.parser/extract-sql-frontmatter sql-with-indented-markers)]
      (is (map? result))
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:metadata result) "name: Indented Transform"))
      (is (str/includes? (:source result) "SELECT * FROM indented_table"))))

  (testing "Strips comment prefixes correctly"
    (let [result (mbml.parser/extract-sql-frontmatter valid-sql-with-frontmatter)
          metadata (:metadata result)]
      (is (not (str/includes? metadata "--")))
      (is (str/includes? metadata "entity:"))
      (is (str/includes? metadata "tags:\n  - sales\n  - customer")))))

(deftest extract-sql-frontmatter-edge-cases-test
  (testing "Handles empty content"
    (is (thrown? Exception (mbml.parser/extract-sql-frontmatter empty-content))))

  (testing "Handles whitespace-only content"
    (is (thrown? Exception (mbml.parser/extract-sql-frontmatter whitespace-only-content))))

  (testing "Handles content with only begin marker"
    (let [content "-- METABASE_BEGIN\n-- entity: test\nSELECT * FROM test;"
          result (mbml.parser/extract-sql-frontmatter content)]
      (is (nil? (:metadata result)))
      (is (= content (:source result)))))

  (testing "Handles content with only end marker"
    (let [content "-- entity: test\n-- METABASE_END\nSELECT * FROM test;"
          result (mbml.parser/extract-sql-frontmatter content)]
      (is (nil? (:metadata result)))
      (is (= content (:source result))))))

;;; --------------------------------- extract-python-frontmatter Tests ---------------------------------

(deftest extract-python-frontmatter-test
  (testing "Extracts front-matter from valid Python file"
    (let [result (mbml.parser/extract-python-frontmatter valid-python-with-frontmatter)]
      (is (map? result))
      (is (contains? result :metadata))
      (is (contains? result :source))
      (is (string? (:metadata result)))
      (is (string? (:source result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:metadata result) "name: Data Processing Pipeline"))
      (is (str/includes? (:source result) "import pandas as pd"))
      (is (str/includes? (:source result) "def process_data"))))

  (testing "Returns nil metadata for Python without front-matter"
    (let [result (mbml.parser/extract-python-frontmatter python-without-frontmatter)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= python-without-frontmatter (:source result)))))

  (testing "Returns nil metadata for incomplete front-matter (missing end marker)"
    (let [result (mbml.parser/extract-python-frontmatter python-with-incomplete-frontmatter)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= python-with-incomplete-frontmatter (:source result)))))

  (testing "Handles indented markers correctly"
    (let [result (mbml.parser/extract-python-frontmatter python-with-indented-markers)]
      (is (map? result))
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:metadata result) "name: Indented Transform"))
      (is (str/includes? (:source result) "print('Indented Python code')"))))

  (testing "Strips comment prefixes correctly"
    (let [result (mbml.parser/extract-python-frontmatter valid-python-with-frontmatter)
          metadata (:metadata result)]
      (is (not (str/includes? metadata "#")))
      (is (str/includes? metadata "entity:"))
      (is (str/includes? metadata "tags:\n  - etl\n  - pipeline")))))

(deftest extract-python-frontmatter-edge-cases-test
  (testing "Handles empty content"
    (is (thrown? Exception (mbml.parser/extract-python-frontmatter empty-content))))

  (testing "Handles whitespace-only content"
    (is (thrown? Exception (mbml.parser/extract-python-frontmatter whitespace-only-content))))

  (testing "Handles content with only begin marker"
    (let [content "# METABASE_BEGIN\n# entity: test\nprint('hello')"
          result (mbml.parser/extract-python-frontmatter content)]
      (is (nil? (:metadata result)))
      (is (= content (:source result)))))

  (testing "Handles content with only end marker"
    (let [content "# entity: test\n# METABASE_END\nprint('hello')"
          result (mbml.parser/extract-python-frontmatter content)]
      (is (nil? (:metadata result)))
      (is (= content (:source result))))))

;;; ------------------------------------ detect-file-type Tests --------------------------------------

(deftest detect-file-type-test
  (testing "Detects YAML files correctly"
    (is (= :yaml (mbml.parser/detect-file-type "config.yaml")))
    (is (= :yaml (mbml.parser/detect-file-type "data.yml")))
    (is (= :yaml (mbml.parser/detect-file-type "/path/to/config.yaml")))
    (is (= :yaml (mbml.parser/detect-file-type "CONFIG.YAML"))) ; case insensitive
    (is (= :yaml (mbml.parser/detect-file-type "DATA.YML")))) ; case insensitive

  (testing "Detects SQL files correctly"
    (is (= :sql (mbml.parser/detect-file-type "query.sql")))
    (is (= :sql (mbml.parser/detect-file-type "/path/to/query.sql")))
    (is (= :sql (mbml.parser/detect-file-type "QUERY.SQL")))) ; case insensitive

  (testing "Detects Python files correctly"
    (is (= :python (mbml.parser/detect-file-type "script.py")))
    (is (= :python (mbml.parser/detect-file-type "/path/to/script.py")))
    (is (= :python (mbml.parser/detect-file-type "SCRIPT.PY")))) ; case insensitive

  (testing "Returns unknown for unsupported file types"
    (is (= :unknown (mbml.parser/detect-file-type "document.txt")))
    (is (= :unknown (mbml.parser/detect-file-type "image.png")))
    (is (= :unknown (mbml.parser/detect-file-type "data.json")))
    (is (= :unknown (mbml.parser/detect-file-type "no-extension"))))

  (testing "Handles nil filename"
    (is (= :unknown (mbml.parser/detect-file-type nil))))

  (testing "Handles empty filename"
    (is (= :unknown (mbml.parser/detect-file-type "")))))

;;; ------------------------------------- extract-content Tests -------------------------------------

(deftest extract-content-test
  (testing "Routes YAML files correctly"
    (let [result (mbml.parser/extract-content valid-yaml-content :yaml)]
      (is (map? result))
      (is (= valid-yaml-content (:metadata result)))
      (is (nil? (:source result)))))

  (testing "Routes SQL files correctly"
    (let [result (mbml.parser/extract-content valid-sql-with-frontmatter :sql)]
      (is (map? result))
      (is (string? (:metadata result)))
      (is (string? (:source result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:source result) "SELECT"))))

  (testing "Routes Python files correctly"
    (let [result (mbml.parser/extract-content valid-python-with-frontmatter :python)]
      (is (map? result))
      (is (string? (:metadata result)))
      (is (string? (:source result)))
      (is (str/includes? (:metadata result) "entity: model/Transform:v1"))
      (is (str/includes? (:source result) "import pandas"))))

  (testing "Handles unknown file types"
    (let [result (mbml.parser/extract-content "some content" :unknown)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= "some content" (:source result)))))

  (testing "Handles SQL files without front-matter"
    (let [result (mbml.parser/extract-content sql-without-frontmatter :sql)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= sql-without-frontmatter (:source result)))))

  (testing "Handles Python files without front-matter"
    (let [result (mbml.parser/extract-content python-without-frontmatter :python)]
      (is (map? result))
      (is (nil? (:metadata result)))
      (is (= python-without-frontmatter (:source result))))))

(deftest extract-content-edge-cases-test
  (testing "Handles empty content"
    (is (thrown? Exception (mbml.parser/extract-content empty-content :yaml))))

  (testing "Handles whitespace-only content"
    (is (thrown? Exception (mbml.parser/extract-content whitespace-only-content :sql)))))

;;; --------------------------------------- parse-yaml Tests ----------------------------------------

(deftest parse-yaml-test
  (testing "Parses valid YAML content"
    (let [result (mbml.parser/parse-yaml valid-yaml-content)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "YAML Transform" (:name result)))
      (is (= "yaml_transform" (:identifier result)))
      (is (vector? (:tags result)))
      (is (= ["yaml" "config"] (:tags result)))))

  (testing "Returns nil for empty content"
    (is (nil? (mbml.parser/parse-yaml empty-content)))
    (is (nil? (mbml.parser/parse-yaml whitespace-only-content)))
    (is (nil? (mbml.parser/parse-yaml nil))))

  (testing "Throws exception for malformed YAML"
    (is (thrown-with-msg? Exception #"YAML" (mbml.parser/parse-yaml malformed-yaml-content))))

  (testing "Parses YAML with nested structures"
    (let [nested-yaml "config:\n  database:\n    host: localhost\n    port: 5432\n  features:\n    - auth\n    - analytics"
          result (mbml.parser/parse-yaml nested-yaml)]
      (is (map? result))
      (is (map? (:config result)))
      (is (= "localhost" (get-in result [:config :database :host])))
      (is (= 5432 (get-in result [:config :database :port])))
      (is (vector? (get-in result [:config :features])))
      (is (= ["auth" "analytics"] (get-in result [:config :features])))))

  (testing "Handles YAML with special characters"
    (let [special-yaml "name: 'Transform with special chars: @#$%'\ndescription: \"Multi-line\ntext with newlines\""
          result (mbml.parser/parse-yaml special-yaml)]
      (is (map? result))
      (is (= "Transform with special chars: @#$%" (:name result)))
      (is (str/includes? (:description result) "Multi-line")))))

(deftest parse-yaml-error-handling-test
  (testing "Provides structured error for YAML parse failure"
    (try
      (mbml.parser/parse-yaml malformed-yaml-content)
      (is false "Should have thrown exception")
      (catch Exception e
        (let [data (ex-data e)]
          (is (map? data))
          (is (contains? data :message))
          (is (contains? data :type))))))

  (testing "Handles various YAML syntax errors"
    (let [invalid-yamls ["unmatched: [array"
                         "invalid:\n  - item\nunmatched_indent"
                         "key: value\n  invalid_indented_key: value"]]
      (doseq [invalid-yaml invalid-yamls]
        (is (thrown? Exception (mbml.parser/parse-yaml invalid-yaml))
            (str "Should throw exception for: " invalid-yaml))))))

;;; ------------------------------------- validate-mbml Tests --------------------------------------

(deftest validate-mbml-test
  (testing "Validates valid MBML entity without source code"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Test Transform"
                      :identifier "test_transform"
                      :database "test_db"
                      :target "test_view"}
          result (mbml.parser/validate-mbml valid-data nil)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "Test Transform" (:name result)))
      (is (= "test_transform" (:identifier result)))
      (is (= "test_db" (:database result)))
      (is (= "test_view" (:target result)))
      (is (not (contains? result :source)))))

  (testing "Validates valid MBML entity with source code"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Test Transform"
                      :identifier "test_transform"
                      :database "test_db"
                      :target "test_view"}
          source-code "SELECT * FROM test_table;"
          result (mbml.parser/validate-mbml valid-data source-code)]
      (is (map? result))
      (is (= source-code (:source result)))))

  (testing "Validates MBML entity with optional fields"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Complete Transform"
                      :identifier "complete_transform"
                      :database "test_db"
                      :target "test_view"
                      :description "A complete transform with all fields"
                      :tags ["test" "complete"]}
          result (mbml.parser/validate-mbml valid-data nil)]
      (is (map? result))
      (is (= "A complete transform with all fields" (:description result)))
      (is (vector? (:tags result)))
      (is (= ["test" "complete"] (:tags result)))))

  (testing "Throws exception for missing required fields"
    (let [invalid-data {:entity "model/Transform:v1"
                        :name "Incomplete Transform"}] ; missing identifier, database, target
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil)))))

  (testing "Throws exception for invalid entity type"
    (let [invalid-data {:entity "invalid/EntityType:v1"
                        :name "Invalid Transform"
                        :identifier "invalid_transform"
                        :database "test_db"
                        :target "test_view"}]
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil)))))

  (testing "Throws exception for invalid field types"
    (let [invalid-data {:entity "model/Transform:v1"
                        :name 123 ; should be string
                        :identifier "test_transform"
                        :database "test_db"
                        :target "test_view"}]
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil))))))

(deftest validate-mbml-error-handling-test
  (testing "Provides structured error for validation failure"
    (try
      (mbml.parser/validate-mbml {:entity "invalid"} nil)
      (is false "Should have thrown exception")
      (catch Exception e
        (is (string? (.getMessage e)))
        (is (not (str/blank? (.getMessage e)))))))

  (testing "Validates field constraints"
    (let [test-cases [{:entity "" ; empty entity
                       :name "Test"
                       :identifier "test"
                       :database "db"
                       :target "view"}
                      {:entity "model/Transform:v1"
                       :name "" ; empty name
                       :identifier "test"
                       :database "db"
                       :target "view"}
                      {:entity "model/Transform:v1"
                       :name "Test"
                       :identifier "" ; empty identifier
                       :database "db"
                       :target "view"}]]
      (doseq [invalid-data test-cases]
        (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil))
            (str "Should throw exception for: " invalid-data))))))

;;; ----------------------------------- Frontmatter Edge Cases -----------------------------------

(deftest frontmatter-edge-cases-test
  (testing "Handles multiple METABASE blocks in SQL (uses first valid one)"
    (let [content "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: First Block
-- identifier: first_block
-- database: test_db
-- target: first_view
-- METABASE_END

SELECT * FROM first_table;

-- METABASE_BEGIN  
-- entity: model/Transform:v1
-- name: Second Block
-- identifier: second_block
-- database: test_db
-- target: second_view
-- METABASE_END

SELECT * FROM second_table;"
          result (mbml.parser/extract-sql-frontmatter content)]
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "name: First Block"))
      (is (not (str/includes? (:metadata result) "name: Second Block")))
      (is (str/includes? (:source result) "SELECT * FROM first_table"))
      (is (str/includes? (:source result) "SELECT * FROM second_table"))))

  (testing "Handles nested comment structures in SQL"
    (let [content "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Nested Comments Test
-- identifier: nested_test
-- database: test_db
-- target: test_view
-- description: |
--   This is a multi-line description
--   with -- nested comment markers
--   that should be preserved
-- METABASE_END

/* This is a block comment
   with -- line comment inside */
SELECT * FROM test;"
          result (mbml.parser/extract-sql-frontmatter content)]
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "description: |"))
      (is (str/includes? (:metadata result) "This is a multi-line description"))
      (is (str/includes? (:source result) "/* This is a block comment"))))

  (testing "Handles markers with different spacing"
    (let [variations ["--METABASE_BEGIN\n-- entity: test\n--METABASE_END"
                      "--  METABASE_BEGIN\n-- entity: test\n--  METABASE_END"
                      "-- METABASE_BEGIN \n-- entity: test\n-- METABASE_END "]]
      (doseq [content variations]
        (let [result (mbml.parser/extract-sql-frontmatter (str content "\nSELECT 1;"))]
          (is (string? (:metadata result)) (str "Should extract metadata from: " content)))))))

(deftest unicode-content-test
  (testing "Handles unicode characters in SQL frontmatter"
    (let [content "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Análisis de Données 数据分析
-- identifier: unicode_transform
-- description: Transform with émojis 🚀 and ñoñó characters
-- database: test_db
-- target: test_view
-- METABASE_END

SELECT * FROM test_tëst;"
          result (mbml.parser/extract-sql-frontmatter content)]
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "Análisis de Données 数据分析"))
      (is (str/includes? (:metadata result) "émojis 🚀"))
      (is (str/includes? (:source result) "test_tëst"))))

  (testing "Handles unicode characters in Python frontmatter"
    (let [content "# METABASE_BEGIN
# entity: model/Transform:v1
# name: Pythön Trànsförm
# identifier: python_unicode
# description: Unicode test with 中文 characters
# database: test_db
# target: test_view
# METABASE_END

print('Hello 世界')"
          result (mbml.parser/extract-python-frontmatter content)]
      (is (string? (:metadata result)))
      (is (str/includes? (:metadata result) "Pythön Trànsförm"))
      (is (str/includes? (:metadata result) "Unicode test with 中文"))
      (is (str/includes? (:source result) "Hello 世界"))))

  (testing "Handles unicode in YAML parsing"
    (let [yaml-content "entity: model/Transform:v1
name: Transformación Ünicøde
identifier: unicode_yaml_test
description: Test with 日本語 and Русский
database: tëst_db
target: ünicode_view
tags:
  - tést
  - 测试"
          result (mbml.parser/parse-yaml yaml-content)]
      (is (map? result))
      (is (= "Transformación Ünicøde" (:name result)))
      (is (str/includes? (:description result) "日本語"))
      (is (str/includes? (:description result) "Русский"))
      (is (= "tëst_db" (:database result)))
      (is (= ["tést" "测试"] (:tags result))))))