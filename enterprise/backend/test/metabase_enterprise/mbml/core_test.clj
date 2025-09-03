(ns metabase-enterprise.mbml.core-test
  "Comprehensive unit tests for the main MBML API functions.
  
  Tests cover the two main entry points:
  - parse-mbml-file: Parse MBML from files on disk
  - parse-mbml-string: Parse MBML from string content
  
  Alr test data is inline to ensure self-contained, reproducible tests."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.mbml.core :as mbml.core]
   [metabase.test :as mt]))

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
target: customer_analysis_results
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
-- target: monthly_sales_report
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
# target: processed_data
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

(deftest parse-mbml-file-yaml-test
  (testing "Parse valid YAML file"
    (mt/with-temp-file [temp-file "transform.yaml"]
      (spit temp-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (map? result))
        (is (= "model/Transform:v1" (:entity result)))
        (is (= "Customer Analysis Transform" (:name result)))
        (is (= "customer-analysis" (:identifier result)))
        (is (= "analytics-db" (:database result)))
        (is (= "customer_analysis_results" (:target result)))
        (is (vector? (:tags result)))
        (is (= 2 (count (:tags result))))
        (is (contains? result :source)))))

  (testing "Parse valid SQL file with front-matter"
    (mt/with-temp-file [temp-file "transform.sql"]
      (spit temp-file valid-sql-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (map? result))
        (is (= "model/Transform:v1" (:entity result)))
        (is (= "Sales Report Transform" (:name result)))
        (is (= "sales-report" (:identifier result)))
        (is (= "sales-db" (:database result)))
        (is (= "monthly_sales_report" (:target result)))
        (is (str/includes? (:source result) "SELECT"))
        (is (str/includes? (:source result) "DATE_TRUNC")))))

  (testing "Parse valid Python file with front-matter"
    (mt/with-temp-file [temp-file "transform.py"]
      (spit temp-file valid-python-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file temp-file)]
        (is (map? result))
        (is (= "model/Transform:v1" (:entity result)))
        (is (= "Data Processing Transform" (:name result)))
        (is (= "data-processing" (:identifier result)))
        (is (= "warehouse-db" (:database result)))
        (is (= "processed_data" (:target result)))
        (is (str/includes? (:source result) "import pandas"))
        (is (str/includes? (:source result) "def process_customer_data"))))))

(deftest parse-mbml-file-error-handling-test
  (testing "File not found error"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"File does not exist"
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
           #"Value does not match schema"
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
           #"No MBML metadata"
           (mbml.core/parse-mbml-file temp-file)))))

  (testing "SQL file with incomplete front-matter"
    (mt/with-temp-file [temp-file "incomplete.sql"]
      (spit temp-file sql-with-incomplete-frontmatter)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No MBML metadata"
           (mbml.core/parse-mbml-file temp-file))))))

;;; ---------------------------------------- parse-mbml-string Tests ----------------------------------

(deftest parse-mbml-string-yaml-test
  (testing "Parse valid YAML content with explicit file type"
    (let [result (mbml.core/parse-mbml-string valid-yaml-content :yaml)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "Customer Analysis Transform" (:name result)))
      (is (= "customer-analysis" (:identifier result)))
      (is (contains? result :source))))

  (testing "Parse valid YAML content without file type hint (defaults to :yaml)"
    (let [result (mbml.core/parse-mbml-string valid-yaml-content nil)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "Customer Analysis Transform" (:name result))))))

(deftest parse-mbml-string-sql-test
  (testing "Parse valid SQL content with front-matter"
    (let [result (mbml.core/parse-mbml-string valid-sql-with-frontmatter :sql)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "Sales Report Transform" (:name result)))
      (is (= "sales-report" (:identifier result)))
      (is (str/includes? (:source result) "SELECT"))
      (is (not (str/includes? (:source result) "METABASE_BEGIN")))))

  (testing "Parse SQL content without front-matter"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"No MBML metadata"
         (mbml.core/parse-mbml-string sql-without-frontmatter :sql)))))

(deftest parse-mbml-string-python-test
  (testing "Parse valid Python content with front-matter"
    (let [result (mbml.core/parse-mbml-string valid-python-with-frontmatter :python)]
      (is (map? result))
      (is (= "model/Transform:v1" (:entity result)))
      (is (= "Data Processing Transform" (:name result)))
      (is (= "data-processing" (:identifier result)))
      (is (str/includes? (:source result) "import pandas"))
      (is (not (str/includes? (:source result) "METABASE_BEGIN"))))))

(deftest parse-mbml-string-validation-test
  (testing "Schema validation with missing required fields"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Value does not match schema"
         (mbml.core/parse-mbml-string invalid-yaml-missing-required-fields :yaml))))

  (testing "Schema validation with invalid entity type"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Value does not match schema"
         (mbml.core/parse-mbml-string invalid-yaml-wrong-entity-type :yaml))))

  (testing "YAML parsing error with malformed content"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"YAML|parse"
         (mbml.core/parse-mbml-string malformed-yaml-content :yaml)))))

(deftest parse-mbml-string-edge-cases-test
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
         #"No MBML metadata"
         (mbml.core/parse-mbml-string valid-yaml-content :sql)))))

;;; ---------------------------------------- API Function Edge Cases ----------------------------------

(deftest api-function-parameter-validation-test
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

(deftest file-type-detection-integration-test
  (testing "File type detection integration with different extensions"
    (mt/with-temp-file [yaml-file "test.yml"]
      (spit yaml-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file yaml-file)]
        (is (= "Customer Analysis Transform" (:name result)))))

    (mt/with-temp-file [yaml-file "test.YAML"]
      (spit yaml-file valid-yaml-content)
      (let [result (mbml.core/parse-mbml-file yaml-file)]
        (is (= "Customer Analysis Transform" (:name result)))))

    (mt/with-temp-file [sql-file "test.SQL"]
      (spit sql-file valid-sql-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file sql-file)]
        (is (= "Sales Report Transform" (:name result)))))

    (mt/with-temp-file [py-file "test.PY"]
      (spit py-file valid-python-with-frontmatter)
      (let [result (mbml.core/parse-mbml-file py-file)]
        (is (= "Data Processing Transform" (:name result)))))))

(deftest error-context-preservation-test
  (testing "Error context includes relevant debugging information"
    (try
      (mbml.core/parse-mbml-file "/nonexistent/file.yaml")
      (catch clojure.lang.ExceptionInfo e
        (let [data (ex-data e)]
          (is (= :file-not-found (:type data)))
          (is (contains? data :file))
          (is (= "/nonexistent/file.yaml" (:file data))))))

    (mt/with-temp-file [temp-file "malformed.yaml"]
      (spit temp-file malformed-yaml-content)
      (try
        (mbml.core/parse-mbml-file temp-file)
        (catch clojure.lang.ExceptionInfo e
          (let [data (ex-data e)]
            (is (contains? data :type))
            (is (or (str/includes? (str data) "YAML")
                    (str/includes? (str data) "parse")))))))))

(deftest comprehensive-integration-test
  (testing "Complete parse workflow with all supported formats"
    ;; Test the complete workflow from file creation to validated result
    (let [test-cases [{:extension "yaml" :content valid-yaml-content :expected-name "Customer Analysis Transform"}
                      {:extension "sql" :content valid-sql-with-frontmatter :expected-name "Sales Report Transform"}
                      {:extension "py" :content valid-python-with-frontmatter :expected-name "Data Processing Transform"}]]

      (doseq [{:keys [extension content expected-name]} test-cases]
        (mt/with-temp-file [temp-file (str "test." extension)]
          (spit temp-file content)
          (let [result (mbml.core/parse-mbml-file temp-file)]
            (is (map? result))
            (is (= "model/Transform:v1" (:entity result)))
            (is (= expected-name (:name result)))
            (is (contains? result :identifier))
            (is (contains? result :database))
            (is (contains? result :target))
            (when (not= extension "yaml")
              (is (contains? result :source)
                  (str "Source code should be present for " extension " files")))))))))
