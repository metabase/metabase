(ns metabase-enterprise.mbml.core-test
  "Comprehensive unit tests for the main MBML API functions.

  Tests cover the two main entry points:
  - parse-mbml-file: Parse MBML from files on disk
  - parse-mbml-string: Parse MBML from string content
  - mbml-file->model: Create Metabase models from MBML files

  All test data is inline to ensure self-contained, reproducible tests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mbml.core :as mbml.core]
   [metabase-enterprise.mbml.parser :as mbml.parser]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ---------------------------------------- Test Data ------------------------------------------------

(def valid-yaml-content
  "entity: model/Transform:v1
name: Customer Analysis Transform
identifier: customer-analysis
description: Transform for analyzing customer data patterns
tags:
  - analytics
  - customer
database: analytics-db
target:
  type: table
  name: customer_analysis_results
source: |
  SELECT customer_id, total_orders, avg_order_value
  FROM customer_metrics
  WHERE last_order_date >= '2024-01-01'")

(def valid-sql-with-frontmatter
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Sales Report Transform
-- identifier: sales-report
-- description: Generate sales reports for management
-- tags:
--   - reporting
--   - sales
-- database: sales-db
-- target:
--   type: table
--   name: monthly_sales_report
-- METABASE_END

SELECT
  DATE_TRUNC('month', order_date) as month,
  SUM(order_total) as total_sales,
  COUNT(*) as total_orders
FROM orders
WHERE order_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY DATE_TRUNC('month', order_date)
ORDER BY month;")

(def valid-python-with-frontmatter
  "# METABASE_BEGIN
# entity: model/Transform:v1
# name: Data Processing Transform
# identifier: data-processing
# description: Process raw data for analytics
# tags:
#   - etl
#   - processing
# database: warehouse-db
# target:
#   type: table
#   name: processed_data
# METABASE_END

import pandas as pd
import numpy as np

def process_customer_data(df):
    df['customer_lifetime_value'] = df['total_orders'] * df['avg_order_value']
    return df.fillna(0)

if __name__ == '__main__':
    data = pd.read_csv('customer_data.csv')
    result = process_customer_data(data)
    result.to_csv('processed_data.csv', index=False)")

(def invalid-yaml-missing-required-fields
  "entity: model/Transform:v1
name: Incomplete Transform
description: Missing required fields")

(def invalid-yaml-wrong-entity-type
  "entity: model/InvalidType:v1
name: Wrong Entity Type
identifier: wrong-type
database: test-db
target: test_table")

(def malformed-yaml-content
  "entity: model/Transform:v1
name: Malformed YAML
identifier: malformed
  invalid_indentation: true
database: test-db
target: test_table")

(def sql-without-frontmatter
  "SELECT * FROM customers WHERE active = true;")

(def sql-with-incomplete-frontmatter
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: Incomplete Front-matter
-- No METABASE_END marker

SELECT * FROM incomplete;")

(def empty-content "")

(def whitespace-only-content "   \n  \t  \n   ")

;;; ---------------------------------------- parse-mbml-file Tests ------------------------------------

(deftest ^:parallel parse-mbml-file-yaml-test
  (testing "Parse valid YAML file"
    (mt/with-temp-file [temp-file "transform.yaml"]
      (spit temp-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (=? {:entity "model/Transform:v1"
                 :name "Customer Analysis Transform"
                 :identifier "customer-analysis"
                 :database "analytics-db"
                 :target {:name "customer_analysis_results"}
                 :tags ["analytics" "customer"]
                 :source string?}
                result)))))

  (testing "Parse valid SQL file with front-matter"
    (mt/with-temp-file [temp-file "transform.sql"]
      (spit temp-file valid-sql-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (=? {:entity "model/Transform:v1"
                 :name "Sales Report Transform"
                 :identifier "sales-report"
                 :database "sales-db"
                 :target {:name "monthly_sales_report"}
                 :body #(and (string? %)
                             (str/includes? % "SELECT")
                             (str/includes? % "DATE_TRUNC"))}
                result)))))

  (testing "Parse valid Python file with front-matter"
    (mt/with-temp-file [temp-file "transform.py"]
      (spit temp-file valid-python-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (=? {:entity "model/Transform:v1"
                 :name "Data Processing Transform"
                 :identifier "data-processing"
                 :database "warehouse-db"
                 :target {:name "processed_data"}
                 :body #(and (string? %)
                             (str/includes? % "import pandas")
                             (str/includes? % "def process_customer_data"))}
                result))))))

(deftest ^:parallel parse-mbml-file-error-handling-test
  (testing "File not found error"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"File not found"
         (mbml.core/parse-mbml-file "/nonexistent/path/file.yaml"))))

  (testing "Empty file error"
    (mt/with-temp-file [temp-file "empty.yaml"]
      (spit temp-file empty-content)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"File is empty"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "Whitespace-only file error"
    (mt/with-temp-file [temp-file "whitespace.yaml"]
      (spit temp-file whitespace-only-content)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"File is empty"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "Schema validation error"
    (mt/with-temp-file [temp-file "invalid.yaml"]
      (spit temp-file invalid-yaml-missing-required-fields)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"MBML validation failed"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "Malformed YAML error"
    (mt/with-temp-file [temp-file "malformed.yaml"]
      (spit temp-file malformed-yaml-content)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"YAML|parse"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "SQL file without front-matter metadata"
    (mt/with-temp-file [temp-file "no-metadata.sql"]
      (spit temp-file sql-without-frontmatter)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Front-matter extraction failed"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "SQL file with incomplete front-matter"
    (mt/with-temp-file [temp-file "incomplete.sql"]
      (spit temp-file sql-with-incomplete-frontmatter)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Front-matter extraction failed"
           (mbml.core/parse-mbml-file temp-file))))))

;;; ---------------------------------------- parse-mbml-string Tests ----------------------------------

(deftest ^:parallel parse-mbml-string-yaml-test
  (testing "Parse valid YAML content with explicit file type"
    (let [result (mbml.core/parse-mbml-string valid-yaml-content :yaml)]
      (is (=? {:entity "model/Transform:v1"
               :name "Customer Analysis Transform"
               :identifier "customer-analysis"
               :source string?}
              result))))

  (testing "Parse valid YAML content without file type hint (defaults to :yaml)"
    (let [result (mbml.core/parse-mbml-string valid-yaml-content nil)]
      (is (=? {:entity "model/Transform:v1"
               :name "Customer Analysis Transform"}
              result)))))

(deftest ^:parallel parse-mbml-string-sql-test
  (testing "Parse valid SQL content with front-matter"
    (let [result (mbml.core/parse-mbml-string valid-sql-with-frontmatter :sql)]
      (is (=? {:entity "model/Transform:v1"
               :name "Sales Report Transform"
               :identifier "sales-report"
               :body #(and (string? %)
                           (str/includes? % "SELECT")
                           (not (str/includes? % "METABASE_BEGIN")))}
              result))))

  (testing "Parse SQL content without front-matter"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Front-matter extraction failed"
         (mbml.core/parse-mbml-string sql-without-frontmatter :sql)))))

(deftest ^:parallel parse-mbml-string-python-test
  (testing "Parse valid Python content with front-matter"
    (let [result (mbml.core/parse-mbml-string valid-python-with-frontmatter :python)]
      (is (=? {:entity "model/Transform:v1"
               :name "Data Processing Transform"
               :identifier "data-processing"
               :body #(and (string? %)
                           (str/includes? % "import pandas")
                           (not (str/includes? % "METABASE_BEGIN")))}
              result)))))

(deftest ^:parallel parse-mbml-string-validation-test
  (testing "Schema validation with missing required fields"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"MBML validation failed"
         (mbml.core/parse-mbml-string invalid-yaml-missing-required-fields :yaml))))

  (testing "Schema validation with invalid entity type"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"MBML validation failed"
         (mbml.core/parse-mbml-string invalid-yaml-wrong-entity-type :yaml))))

  (testing "YAML parsing error with malformed content"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"YAML|parse"
         (mbml.core/parse-mbml-string malformed-yaml-content :yaml)))))

(deftest ^:parallel parse-mbml-string-edge-cases-test
  (testing "Empty content"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid input|non-blank string"
         (mbml.core/parse-mbml-string empty-content :yaml))))

  (testing "Whitespace-only content"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid input|non-blank string"
         (mbml.core/parse-mbml-string whitespace-only-content :yaml))))

  (testing "Valid content with different file type hints"
    ;; SQL content parsed as YAML should fail
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"YAML|parse|metadata"
         (mbml.core/parse-mbml-string valid-sql-with-frontmatter :yaml)))

    ;; YAML content parsed as SQL should fail (no front-matter)
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Front-matter extraction failed"
         (mbml.core/parse-mbml-string valid-yaml-content :sql)))))

;;; ---------------------------------------- API Function Edge Cases ----------------------------------

(deftest ^:parallel api-function-parameter-validation-test
  (testing "parse-mbml-file with invalid parameters"
    ;; This should be caught by mu/defn parameter validation
    (is (thrown?
         clojure.lang.ExceptionInfo
         (mbml.core/parse-mbml-file nil)))

    (is (thrown?
         clojure.lang.ExceptionInfo
         (mbml.core/parse-mbml-file ""))))

  (testing "parse-mbml-string with invalid parameters"
    ;; This should be caught by mu/defn parameter validation
    (is (thrown?
         clojure.lang.ExceptionInfo
         (mbml.core/parse-mbml-string nil :yaml)))

    (is (thrown?
         clojure.lang.ExceptionInfo
         (mbml.core/parse-mbml-string "" :yaml)))))

(deftest ^:parallel file-type-detection-integration-test
  (testing "File type detection integration with different extensions"
    (mt/with-temp-file [yaml-file "test.yml"]
      (spit yaml-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file yaml-file)]
        (is (=? {:name "Customer Analysis Transform"} result))))

    (mt/with-temp-file [yaml-file "test.YAML"]
      (spit yaml-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file yaml-file)]
        (is (=? {:name "Customer Analysis Transform"} result))))

    (mt/with-temp-file [sql-file "test.SQL"]
      (spit sql-file valid-sql-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file sql-file)]
        (is (=? {:name "Sales Report Transform"} result))))

    (mt/with-temp-file [py-file "test.PY"]
      (spit py-file valid-python-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file py-file)]
        (is (=? {:name "Data Processing Transform"} result))))))

(deftest ^:parallel error-context-preservation-test
  (testing "Error context includes relevant debugging information"
    (try
      (mbml.core/parse-mbml-file "/nonexistent/file.yaml")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (=? {:type :file-not-found
                   :file "/nonexistent/file.yaml"}
                  data)))))

    (mt/with-temp-file [temp-file "malformed.yaml"]
      (spit temp-file malformed-yaml-content)
      (try
        (mbml.core/parse-mbml-file temp-file)
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (=? {:type some?} data))
            (is (or (str/includes? (str data) "YAML")
                    (str/includes? (str data) "parse")))))))))

(deftest ^:parallel comprehensive-integration-test
  (testing "Complete parse workflow with all supported formats"
    ;; Test the complete workflow from file creation to validated result
    (let [test-cases [{:extension "yaml" :content valid-yaml-content :expected-name "Customer Analysis Transform"}
                      {:extension "sql" :content valid-sql-with-frontmatter :expected-name "Sales Report Transform"}
                      {:extension "py" :content valid-python-with-frontmatter :expected-name "Data Processing Transform"}]]

      (doseq [{:keys [extension content expected-name]} test-cases]
        (mt/with-temp-file [temp-file (str "test." extension)]
          (spit temp-file content)
          (let [result (mbml.core/parse-mbml-file temp-file)]
            (is (=? {:entity "model/Transform:v1"
                     :name expected-name
                     :identifier string?
                     :database string?
                     :target map?}
                    result))
            (when (not= extension "yaml")
              (is (contains? result :body)
                  (str "Source code should be present for " extension " files")))))))))

;;; ---------------------------------------- mbml-file->model Tests -----------------------------------

(def transform-yaml-no-db-for-model-test
  "entity: model/Transform:v1
name: Test Transform for Model Creation
identifier: test-transform-model
description: Transform used for testing model creation
tags:
  - test
  - hourly
database: test-data
target:
  type: table
  name: test_transform_output
source: |
  SELECT id, name, created_at
  FROM test_table
  WHERE active = true")

(def transform-yaml-for-model-test
  "entity: model/Transform:v1
name: Test Transform for Model Creation
identifier: test-transform-model
description: Transform used for testing model creation
tags:
  - test
  - hourly
database: test-data (postgres)
target:
  type: table
  name: test_transform_output
source: |
  SELECT id, name, created_at
  FROM test_table
  WHERE active = true")

(def transform-sql-for-model-test
  "-- METABASE_BEGIN
-- entity: model/Transform:v1
-- name: SQL Transform for Model Creation
-- identifier: sql-transform-model
-- description: SQL transform used for testing
-- tags:
--   - test
--   - daily
-- database: test-data (postgres)
-- target:
--   type: table
--   name: sql_transform_output
-- METABASE_END

SELECT
  customer_id,
  COUNT(*) as order_count,
  SUM(total) as total_value
FROM orders
WHERE status = 'completed'
GROUP BY customer_id;")

(deftest mbml-file->model-transform-creation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (testing "Create Transform model from YAML file"
        (mt/with-temp [:model/TransformTag _ {:name "test"}]
          (mt/with-temp-file [temp-file "transform.yaml"]
            (spit temp-file transform-yaml-for-model-test)
            (let [result (mbml.core/mbml-file->model temp-file)]
              (is (=? {:id int?
                       :name "Test Transform for Model Creation"
                       :description "Transform used for testing model creation"
                       :source map?
                       :target map?
                       :entity_id string?
                       :created_at some?
                       :updated_at some?}
                      result))

              ;; Verify the transform was actually created in the database
              (let [saved-transform (t2/select-one :model/Transform :id (:id result))]
                (is (=? {:name "Test Transform for Model Creation"
                         :description "Transform used for testing model creation"}
                        saved-transform)))))))

      (testing "Create Transform model from SQL file"
        (mt/with-temp [:model/TransformTag _ {:name "test"}]
          (mt/with-temp-file [temp-file "transform.sql"]
            (spit temp-file transform-sql-for-model-test)
            (let [result (mbml.core/mbml-file->model temp-file)]
              (is (=? {:id int?
                       :name "SQL Transform for Model Creation"
                       :description "SQL transform used for testing"
                       :source map?
                       :target map?}
                      result))

              ;; Verify the source came from the SQL body, not the original source field
              (let [saved-transform (t2/select-one :model/Transform :id (:id result))]
                (is (=? {:name "SQL Transform for Model Creation"}
                        saved-transform)))))))

      (testing "Test update functionality"
        (mt/with-temp [:model/TransformTag {tag-id-1 :id} {:name "test"}
                       :model/Transform {transform-id :id} {:name "Existing Transform"
                                                            :library_identifier "test-transform-model"
                                                            :description "Old description"
                                                            :source "{\"type\":\"native\",\"native\":{\"query\":\"SELECT 1\"}}"
                                                            :target "{\"type\":\"table\",\"name\":\"old_table\"}"}
                       :model/TransformTransformTag _ {:tag_id tag-id-1 :transform_id transform-id :position 0}]
          (mt/with-temp-file [temp-file "transform.yaml"]
            (spit temp-file transform-yaml-for-model-test)
            (let [result (mbml.core/mbml-file->model temp-file)]
              (is (=? {:id transform-id
                       :name "Test Transform for Model Creation"
                       :description "Transform used for testing model creation"}
                      result))

              ;; Verify the transform was actually updated in the database
              (let [updated-transform (t2/select-one :model/Transform :id transform-id)]
                (is (=? {:name "Test Transform for Model Creation"
                         :description "Transform used for testing model creation"}
                        updated-transform))))))))))

(deftest ^:parallel mbml-file->model-error-handling-test
  (testing "Error when database doesn't exist"
    (mt/with-temp [:model/TransformTag _ {:name "test"}]
      (mt/with-temp-file [temp-file "transform.yaml"]
        (spit temp-file transform-yaml-no-db-for-model-test)
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"The database does not exist.*test-data"
             (mbml.core/mbml-file->model temp-file))))))

  (testing "Error when tags don't exist"
    (mt/with-temp-file [temp-file "transform.yaml"]
      (spit temp-file transform-yaml-for-model-test)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Supplied tags do not exist.*test"
           (mbml.core/mbml-file->model temp-file)))))

  (testing "Error context includes file information"
    (mt/with-temp-file [temp-file "bad-transform.yaml"]
      (spit temp-file transform-yaml-for-model-test)
      (try
        (mbml.core/mbml-file->model temp-file)
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (=? {:type :model-transformation-error
                     :file string?}
                    data))
            (is (str/includes? (:file data) "bad-transform.yaml"))))))))
