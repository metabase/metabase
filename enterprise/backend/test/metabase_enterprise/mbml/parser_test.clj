(ns metabase-enterprise.mbml.parser-test
  "Comprehensive unit tests for MBML parser engine functions.
  
  Tests cover all parser engine functions:
  - extract-frontmatter: Front-matter extraction for SQL and Python files
  - detect-file-type: File type detection from extensions
  - extract-content: Content extraction routing
  - parse-yaml: YAML parsing with error handling
  - validate-mbml: Schema validation with Malli
  
  All test data is inline to ensure self-contained, reproducible tests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mbml.parser :as mbml.parser]))

;;; ------------------------------------------ Test Data --------------------------------------------------

(def valid-sql-with-frontmatter
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Customer Sales Analysis
-- identifier: customer_sales_transform
-- description: Transform customer data with sales metrics
-- database: analytics_db
-- target:
--   name: customer_sales_view
--   type: table
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
# target:
#   name: processed_data
#   type: table
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
    -- target:
    --   type: table
    --   name: indented_view
    -- METABASE_END

SELECT * FROM indented_table;")

(def python-with-indented-markers
  "    # METABASE_BEGIN
    # entity: model/Transform:v1
    # name: Indented Transform
    # identifier: indented_transform
    # database: test_db
    # target:
    #   type: table
    #   name: indented_view
    # METABASE_END

print('Indented Python code')")

(def valid-yaml-content
  "entity: model/Transform:v1
name: YAML Transform
identifier: yaml_transform
description: Pure YAML configuration
database: yaml_db
target:
  type: table
  name: yaml_view
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

;;; ---------------------------------- extract-frontmatter Tests ------------------------------------

(deftest ^:parallel extract-frontmatter-sql-test
  (testing "Extracts front-matter from valid SQL file"
    (let [result (mbml.parser/extract-frontmatter valid-sql-with-frontmatter :sql)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1")
                               (str/includes? % "name: Customer Sales Analysis"))
               :body #(and (string? %)
                           (str/includes? % "SELECT")
                           (str/includes? % "customers c"))}
              result))))

  (testing "Handles SQL without front-matter"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-frontmatter sql-without-frontmatter :sql))))

  (testing "Handles incomplete SQL front-matter (missing end marker)"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-frontmatter sql-with-incomplete-frontmatter :sql))))

  (testing "Handles indented markers correctly"
    (let [result (mbml.parser/extract-frontmatter sql-with-indented-markers :sql)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1")
                               (str/includes? % "name: Indented Transform"))
               :body #(str/includes? % "SELECT * FROM indented_table")}
              result))))

  (testing "Strips comment prefixes correctly"
    (let [result (mbml.parser/extract-frontmatter valid-sql-with-frontmatter :sql)]
      (is (=? {:metadata #(and (not (str/includes? % "--"))
                               (str/includes? % "entity:")
                               (str/includes? % "tags:\n  - sales\n  - customer"))}
              result)))))

(deftest ^:parallel extract-frontmatter-sql-edge-cases-test
  (testing "Handles empty SQL content"
    (is (thrown? Exception (mbml.parser/extract-frontmatter empty-content :sql))))

  (testing "Handles whitespace-only SQL content"
    (is (thrown? Exception (mbml.parser/extract-frontmatter whitespace-only-content :sql))))

  (testing "Handles SQL content with only begin marker"
    (let [content "-- METABASE_BEGIN\n-- entity: test\nSELECT * FROM test;"]
      (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                            (mbml.parser/extract-frontmatter content :sql)))))

  (testing "Handles SQL content with only end marker"
    (let [content "-- entity: test\n-- METABASE_END\nSELECT * FROM test;"]
      (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                            (mbml.parser/extract-frontmatter content :sql))))))

;;; --------------------------------- extract-frontmatter Python Tests ---------------------------------

(deftest ^:parallel extract-frontmatter-python-test
  (testing "Extracts front-matter from valid Python file"
    (let [result (mbml.parser/extract-frontmatter valid-python-with-frontmatter :python)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1")
                               (str/includes? % "name: Data Processing Pipeline"))
               :body #(and (string? %)
                           (str/includes? % "import pandas as pd")
                           (str/includes? % "def process_data"))}
              result))))

  (testing "Handles Python without front-matter"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-frontmatter python-without-frontmatter :python))))

  (testing "Handles incomplete Python front-matter (missing end marker)"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-frontmatter python-with-incomplete-frontmatter :python))))

  (testing "Handles indented markers correctly"
    (let [result (mbml.parser/extract-frontmatter python-with-indented-markers :python)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1")
                               (str/includes? % "name: Indented Transform"))
               :body #(str/includes? % "print('Indented Python code')")}
              result))))

  (testing "Strips comment prefixes correctly"
    (let [result (mbml.parser/extract-frontmatter valid-python-with-frontmatter :python)]
      (is (=? {:metadata #(and (not (str/includes? % "#"))
                               (str/includes? % "entity:")
                               (str/includes? % "tags:\n  - etl\n  - pipeline"))}
              result)))))

(deftest ^:parallel extract-frontmatter-python-edge-cases-test
  (testing "Handles empty Python content"
    (is (thrown? Exception (mbml.parser/extract-frontmatter empty-content :python))))

  (testing "Handles whitespace-only Python content"
    (is (thrown? Exception (mbml.parser/extract-frontmatter whitespace-only-content :python))))

  (testing "Handles Python content with only begin marker"
    (let [content "# METABASE_BEGIN\n# entity: test\nprint('hello')"]
      (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                            (mbml.parser/extract-frontmatter content :python)))))

  (testing "Handles Python content with only end marker"
    (let [content "# entity: test\n# METABASE_END\nprint('hello')"]
      (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                            (mbml.parser/extract-frontmatter content :python))))))

;;; ------------------------------------- *file* Dynamic Variable Tests ----------------------------------

(deftest ^:parallel file-dynamic-variable-test
  (testing "extract-frontmatter uses *file* in error messages when bound"
    (binding [mbml.parser/*file* "test.sql"]
      (try
        (mbml.parser/extract-frontmatter sql-without-frontmatter :sql)
        (is false "Should have thrown exception")
        (catch Exception e
          (is (str/includes? (ex-message e) "test.sql"))))))

  (testing "extract-frontmatter works without *file* binding"
    (try
      (mbml.parser/extract-frontmatter sql-without-frontmatter :sql)
      (is false "Should have thrown exception")
      (catch Exception e
        (is (not (str/includes? (ex-message e) "test.sql")))))))

;;; ------------------------------------ detect-file-type Tests --------------------------------------

(deftest ^:parallel detect-file-type-test
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

(deftest ^:parallel extract-content-test
  (testing "Routes YAML files correctly"
    (let [result (mbml.parser/extract-content valid-yaml-content :yaml)]
      (is (=? {:metadata valid-yaml-content
               :body nil}
              result))))

  (testing "Routes SQL files correctly"
    (let [result (mbml.parser/extract-content valid-sql-with-frontmatter :sql)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1"))
               :body #(and (string? %)
                           (str/includes? % "SELECT"))}
              result))))

  (testing "Routes Python files correctly"
    (let [result (mbml.parser/extract-content valid-python-with-frontmatter :python)]
      (is (=? {:metadata #(and (string? %)
                               (str/includes? % "entity: model/Transform:v1"))
               :body #(and (string? %)
                           (str/includes? % "import pandas"))}
              result))))

  (testing "Handles unknown file types"
    (let [result (mbml.parser/extract-content "some content" :unknown)]
      (is (=? {:metadata nil
               :body "some content"}
              result))))

  (testing "Handles SQL files without front-matter"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-content sql-without-frontmatter :sql))))

  (testing "Handles Python files without front-matter"
    (is (thrown-with-msg? Exception #"Front-matter extraction failed"
                          (mbml.parser/extract-content python-without-frontmatter :python)))))

(deftest ^:parallel extract-content-edge-cases-test
  (testing "Handles empty content"
    (is (thrown? Exception (mbml.parser/extract-content empty-content :yaml))))

  (testing "Handles whitespace-only content"
    (is (thrown? Exception (mbml.parser/extract-content whitespace-only-content :sql)))))

;;; --------------------------------------- parse-yaml Tests ----------------------------------------

(deftest ^:parallel parse-yaml-test
  (testing "Parses valid YAML content"
    (let [result (mbml.parser/parse-yaml valid-yaml-content)]
      (is (=? {:entity "model/Transform:v1"
               :name "YAML Transform"
               :identifier "yaml_transform"
               :tags ["yaml" "config"]}
              result))))

  (testing "Returns nil for empty content"
    (is (nil? (mbml.parser/parse-yaml empty-content)))
    (is (nil? (mbml.parser/parse-yaml whitespace-only-content)))
    (is (nil? (mbml.parser/parse-yaml nil))))

  (testing "Throws exception for malformed YAML"
    (is (thrown-with-msg? Exception #"YAML" (mbml.parser/parse-yaml malformed-yaml-content))))

  (testing "Parses YAML with nested structures"
    (let [nested-yaml "config:\n  database:\n    host: localhost\n    port: 5432\n  features:\n    - auth\n    - analytics"
          result (mbml.parser/parse-yaml nested-yaml)]
      (is (=? {:config {:database {:host "localhost"
                                   :port 5432}
                        :features ["auth" "analytics"]}}
              result))))

  (testing "Handles YAML with special characters"
    (let [special-yaml "name: 'Transform with special chars: @#$%'\ndescription: \"Multi-line\ntext with newlines\""
          result (mbml.parser/parse-yaml special-yaml)]
      (is (=? {:name "Transform with special chars: @#$%"
               :description #(str/includes? % "Multi-line")}
              result)))))

(deftest ^:parallel parse-yaml-error-handling-test
  (testing "Provides structured error for YAML parse failure"
    (try
      (mbml.parser/parse-yaml malformed-yaml-content)
      (is false "Should have thrown exception")
      (catch Exception e
        (let [data (ex-data e)]
          (is (=? {:message string?
                   :type some?}
                  data))))))

  (testing "Handles various YAML syntax errors"
    (let [invalid-yamls ["unmatched: [array"
                         "invalid:\n  - item\nunmatched_indent"
                         "key: value\n  invalid_indented_key: value"]]
      (doseq [invalid-yaml invalid-yamls]
        (is (thrown? Exception (mbml.parser/parse-yaml invalid-yaml))
            (str "Should throw exception for: " invalid-yaml))))))

;;; ------------------------------------- validate-mbml Tests --------------------------------------

(deftest ^:parallel validate-mbml-test
  (testing "Validates valid MBML entity without source code"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Test Transform"
                      :identifier "test_transform"
                      :database "test_db"
                      :target {:type "table" :name "test_view"}}
          result (mbml.parser/validate-mbml valid-data nil)]
      (is (=? {:entity "model/Transform:v1"
               :name "Test Transform"
               :identifier "test_transform"
               :database "test_db"
               :target {:type "table" :name "test_view"}}
              result))
      (is (not (contains? result :body)))))

  (testing "Validates valid MBML entity with source code"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Test Transform"
                      :identifier "test_transform"
                      :database "test_db"
                      :target {:type "table" :name "test_view"}}
          source-code "SELECT * FROM test_table;"
          result (mbml.parser/validate-mbml valid-data source-code)]
      (is (=? {:body source-code}
              result))))

  (testing "Validates MBML entity with optional fields"
    (let [valid-data {:entity "model/Transform:v1"
                      :name "Complete Transform"
                      :identifier "complete_transform"
                      :database "test_db"
                      :target {:type "table" :name "test_view"}
                      :description "A complete transform with all fields"
                      :tags ["test" "complete"]}
          result (mbml.parser/validate-mbml valid-data nil)]
      (is (=? {:description "A complete transform with all fields"
               :tags ["test" "complete"]}
              result))))

  (testing "Throws exception for missing required fields"
    (let [invalid-data {:entity "model/Transform:v1"
                        :name "Incomplete Transform"}] ; missing identifier, database, target
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil)))))

  (testing "Throws exception for invalid entity type"
    (let [invalid-data {:entity "invalid/EntityType:v1"
                        :name "Invalid Transform"
                        :identifier "invalid_transform"
                        :database "test_db"
                        :target {:type "table" :name "test_view"}}]
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil)))))

  (testing "Throws exception for invalid field types"
    (let [invalid-data {:entity "model/Transform:v1"
                        :name 123 ; should be string
                        :identifier "test_transform"
                        :database "test_db"
                        :target {:type "table" :name "test_view"}}]
      (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil))))))

(deftest ^:parallel validate-mbml-error-handling-test
  (testing "Provides structured error for validation failure"
    (try
      (mbml.parser/validate-mbml {:entity "invalid"} nil)
      (is false "Should have thrown exception")
      (catch Exception e
        (is (string? (ex-message e)))
        (is (not (str/blank? (ex-message e)))))))

  (testing "Validates field constraints"
    (let [test-cases [{:entity "" ; empty entity
                       :name "Test"
                       :identifier "test"
                       :database "db"
                       :target {:type "table" :name "view"}}
                      {:entity "model/Transform:v1"
                       :name "" ; empty name
                       :identifier "test"
                       :database "db"
                       :target {:type "table" :name "view"}}
                      {:entity "model/Transform:v1"
                       :name "Test"
                       :identifier "" ; empty identifier
                       :database "db"
                       :target {:type "table" :name "view"}}]]
      (doseq [invalid-data test-cases]
        (is (thrown? Exception (mbml.parser/validate-mbml invalid-data nil))
            (str "Should throw exception for: " invalid-data))))))

;;; ----------------------------------- Frontmatter Edge Cases -----------------------------------

(deftest ^:parallel frontmatter-edge-cases-test
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
          result (mbml.parser/extract-frontmatter content :sql)]
      (is (=? {:metadata #(and (str/includes? % "name: First Block")
                               (not (str/includes? % "name: Second Block")))
               :body #(and (str/includes? % "SELECT * FROM first_table")
                           (str/includes? % "SELECT * FROM second_table"))}
              result))))

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
          result (mbml.parser/extract-frontmatter content :sql)]
      (is (=? {:metadata #(and (str/includes? % "description: |")
                               (str/includes? % "This is a multi-line description"))
               :body #(str/includes? % "/* This is a block comment")}
              result))))

  (testing "Handles markers with different spacing"
    (let [variations ["--METABASE_BEGIN\n-- entity: test\n--METABASE_END"
                      "--  METABASE_BEGIN\n-- entity: test\n--  METABASE_END"
                      "-- METABASE_BEGIN \n-- entity: test\n-- METABASE_END "]]
      (doseq [content variations]
        (let [result (mbml.parser/extract-frontmatter (str content "\nSELECT 1;") :sql)]
          (is (=? {:metadata string?}
                  result)
              (str "Should extract metadata from: " content)))))))

(deftest ^:parallel unicode-content-test
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
          result (mbml.parser/extract-frontmatter content :sql)]
      (is (=? {:metadata #(and (str/includes? % "Análisis de Données 数据分析")
                               (str/includes? % "émojis 🚀"))
               :body #(str/includes? % "test_tëst")}
              result))))

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
          result (mbml.parser/extract-frontmatter content :python)]
      (is (=? {:metadata #(and (str/includes? % "Pythön Trànsförm")
                               (str/includes? % "Unicode test with 中文"))
               :body #(str/includes? % "Hello 世界")}
              result))))

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
      (is (=? {:name "Transformación Ünicøde"
               :description #(and (str/includes? % "日本語")
                                  (str/includes? % "Русский"))
               :database "tëst_db"
               :tags ["tést" "测试"]}
              result)))))
