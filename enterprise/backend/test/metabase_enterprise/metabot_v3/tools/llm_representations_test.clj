(ns metabase-enterprise.metabot-v3.tools.llm-representations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]))

(deftest escape-xml-test
  (testing "escape-xml handles special characters"
    (is (= "&amp;" (#'llm-rep/escape-xml "&")))
    (is (= "&lt;" (#'llm-rep/escape-xml "<")))
    (is (= "&gt;" (#'llm-rep/escape-xml ">")))
    (is (= "&quot;" (#'llm-rep/escape-xml "\"")))
    (is (= "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
           (#'llm-rep/escape-xml "<script>alert(\"xss\")</script>"))))

  (testing "escape-xml handles nil"
    (is (nil? (#'llm-rep/escape-xml nil)))))

(deftest field->xml-test
  (testing "formats field with all attributes matching Python format"
    (let [field {:field_id "f1"
                 :name "user_id"
                 :display_name "User ID"
                 :base-type :type/Integer
                 :database_type "INTEGER"
                 :description "The user identifier"}
          xml (llm-rep/field->xml field)]
      ;; Python format: name="\"user_id\""
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"\\\"user_id\\\"\""))
      (is (str/includes? xml "display_name=\"User ID\""))
      (is (str/includes? xml "type=\"Integer\""))
      (is (str/includes? xml "database_type=\"INTEGER\""))
      (is (str/includes? xml "## Description"))
      (is (str/includes? xml "The user identifier"))))

  (testing "handles missing optional attributes with defaults"
    (let [field {:field_id "f1" :name "test"}
          xml (llm-rep/field->xml field)]
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"\\\"test\\\"\""))
      (is (str/includes? xml "database_type=\"unknown\"")))))

(deftest collection->xml-test
  (testing "formats collection with name"
    (let [collection {:name "Finance" :description "Finance reports" :authority_level "official"}
          xml (llm-rep/collection->xml collection)]
      (is (str/includes? xml "<collection"))
      (is (str/includes? xml "name=\"Finance\""))
      (is (str/includes? xml "authority_level=\"official\""))
      (is (str/includes? xml "<description>Finance reports</description>"))))

  (testing "uses default name for nil"
    (let [collection {:name nil}
          xml (llm-rep/collection->xml collection)]
      (is (str/includes? xml "name=\"Our analytics\"")))))

(deftest metric->xml-test
  (testing "formats metric with all attributes matching Python"
    (let [metric {:id 42
                  :name "Total Revenue"
                  :description "Sum of all revenue"
                  :verified true
                  :collection {:name "Finance"}
                  :default_time_dimension_field {:name "created_at"}
                  :queryable-dimensions [{:name "date" :field_id "d1" :base-type :type/Date :database_type "DATE"}]}
          xml (llm-rep/metric->xml metric)]
      (is (str/starts-with? xml "<metric"))
      ;; Python format: id="42", name="Total Revenue"
      (is (str/includes? xml "id=\"42\", name=\"Total Revenue\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "### Metric Description"))
      (is (str/includes? xml "Sum of all revenue"))
      (is (str/includes? xml "### Dimensions"))
      (is (str/includes? xml "The following dimensions can be used for filter- or group-by operations"))
      (is (str/includes? xml "metabase://metric/42/dimensions/{field_id}"))
      (is (str/includes? xml "The metric is stored in the following collection"))
      (is (str/includes? xml "Default Time Dimension Field: created_at"))
      (is (str/ends-with? (str/trim xml) "</metric>"))))

  (testing "handles metric without dimensions"
    (let [metric {:id 1 :name "Test" :verified false}
          xml (llm-rep/metric->xml metric)]
      (is (str/includes? xml "is_verified=\"false\""))
      (is (not (str/includes? xml "### Dimensions"))))))

(deftest table->xml-test
  (testing "formats table with all attributes matching Python"
    (let [table {:id 10
                 :name "users"
                 :display_name "Users"
                 :database_id 1
                 :database_engine "postgres"
                 :database_schema "public"
                 :description "User accounts"
                 :fields [{:name "id" :field_id "f1" :base-type :type/Integer :database_type "INTEGER"}]
                 :related_tables [{:id 20 :name "orders" :fully_qualified_name "public.orders"
                                   :related_by "user_id" :fields []}]}
          xml (llm-rep/table->xml table)]
      (is (str/starts-with? xml "<table"))
      ;; Python format: id="10", name="users"
      (is (str/includes? xml "id=\"10\", name=\"users\""))
      (is (str/includes? xml "database_id=\"1\""))
      (is (str/includes? xml "database_engine=\"postgres\""))
      (is (str/includes? xml "fully_qualified_name=\"public.users\""))
      (is (str/includes? xml "### Description"))
      (is (str/includes? xml "### Fields"))
      (is (str/includes? xml "The following fields are available in this table"))
      (is (str/includes? xml "### Related Tables"))
      (is (str/includes? xml "Foreign key fields from related tables"))
      (is (str/includes? xml "<related-table"))
      (is (str/includes? xml "metabase://table/10/fields/{field_id}"))
      (is (str/ends-with? (str/trim xml) "</table>")))))

(deftest model->xml-test
  (testing "formats model with all attributes matching Python"
    (let [model {:id 5
                 :name "Sales Model"
                 :description "Aggregated sales data"
                 :verified true
                 :database_id 1
                 :database_engine "postgres"
                 :fields [{:name "revenue" :field_id "r1" :base-type :type/Float :database_type "DOUBLE"}]}
          xml (llm-rep/model->xml model)]
      ;; Python uses <metabase-model> tag
      (is (str/starts-with? xml "<metabase-model"))
      (is (str/includes? xml "id=\"5\""))
      (is (str/includes? xml "name=\"Sales Model\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "database_id=\"1\""))
      (is (str/includes? xml "database_engine=\"postgres\""))
      (is (str/includes? xml "fully_qualified_name=\"{#5}-sales-model\""))
      (is (str/includes? xml "### Description"))
      (is (str/includes? xml "### Fields"))
      (is (str/includes? xml "The following fields are available in this model"))
      (is (str/includes? xml "metabase://model/5/fields/{field_id}"))
      ;; Python closes with </model>
      (is (str/ends-with? (str/trim xml) "</model>")))))

(deftest query->xml-test
  (testing "formats query result matching Python"
    (let [query {:query-type :sql
                 :query-id "q123"
                 :database_id 1
                 :query-content "SELECT * FROM users"
                 :result {:result_columns [{:name "id" :display_name "ID" :type "number"}]
                          :rows [[1] [2]]}}
          xml (llm-rep/query->xml query)]
      (is (str/starts-with? xml "<query"))
      (is (str/includes? xml "type=\"sql\""))
      (is (str/includes? xml "id=\"q123\""))
      (is (str/includes? xml "database_id=\"1\""))
      (is (str/includes? xml "SELECT * FROM users"))
      (is (str/includes? xml "<query_results>"))
      (is (str/includes? xml "### Result Columns"))
      (is (str/includes? xml "### Result Rows"))
      (is (str/ends-with? (str/trim xml) "</query>"))))

  (testing "handles query with no result"
    (let [query {:query-type :notebook :query-id "m1" :database_id 1}
          xml (llm-rep/query->xml query)]
      (is (str/includes? xml "type=\"notebook\""))
      (is (not (str/includes? xml "<query_results>"))))))

(deftest chart->xml-test
  (testing "formats chart (simplified version)"
    (let [chart {:chart-id "ch-abc-123"
                 :query-id "q1"
                 :chart-type :bar}
          xml (llm-rep/chart->xml chart)]
      (is (str/starts-with? xml "<chart"))
      (is (str/includes? xml "id=\"ch-abc-123\""))
      (is (str/includes? xml "type=\"bar\""))
      (is (str/includes? xml "query-id=\"q1\""))
      (is (str/includes? xml "metabase://chart/ch-abc-123"))
      (is (str/ends-with? (str/trim xml) "</chart>"))))

  (testing "handles nil chart-type"
    (let [chart {:chart-id "c1" :query-id "q1" :chart-type nil}
          xml (llm-rep/chart->xml chart)]
      (is (str/includes? xml "type=\"table\"")))))

(deftest visualization->xml-test
  (testing "formats visualization with queries"
    (let [viz {:chart-id "v1"
               :queries [{:query-type :sql :query-id "q1" :database_id 1 :query-content "SELECT 1"}]
               :visualization_settings {:chart_type "bar"}}
          xml (llm-rep/visualization->xml viz)]
      (is (str/starts-with? xml "<chart"))
      (is (str/includes? xml "id=\"v1\""))
      (is (str/includes? xml "The chart is powered by the following queries"))
      (is (str/includes? xml "<query"))
      (is (str/includes? xml "<visualization>")))))

(deftest question->xml-test
  (testing "formats question matching Python"
    (let [question {:id 100
                    :name "Revenue Report"
                    :description "Monthly revenue breakdown"
                    :verified true
                    :collection {:name "Finance"}}
          xml (llm-rep/question->xml question)]
      (is (str/starts-with? xml "<metabase_question"))
      (is (str/includes? xml "id=\"100\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "<name>Revenue Report</name>"))
      (is (str/includes? xml "<description>Monthly revenue breakdown</description>"))
      (is (str/includes? xml "The question is stored in the following collection"))
      (is (str/ends-with? (str/trim xml) "</metabase_question>")))))

(deftest dashboard->xml-test
  (testing "formats dashboard matching Python"
    (let [dashboard {:id 50
                     :name "Sales Dashboard"
                     :description "Overview of sales metrics"
                     :verified true
                     :collection {:name "Sales"}
                     :dashcards [{:id 1 :type :text :order 1 :width 6 :height 2
                                  :dashboard_tab_id 0 :row 0 :col 0 :text "Welcome"}]}
          xml (llm-rep/dashboard->xml dashboard)]
      (is (str/starts-with? xml "<dashboard"))
      (is (str/includes? xml "id=\"50\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "<name>Sales Dashboard</name>"))
      (is (str/includes? xml "<description>Overview of sales metrics</description>"))
      (is (str/includes? xml "The dashboard is stored in the following collection"))
      (is (str/includes? xml "<tabs>"))
      (is (str/includes? xml "<tab id=\"0\">"))
      (is (str/includes? xml "<text_card"))
      (is (str/ends-with? (str/trim xml) "</dashboard>")))))

(deftest user->xml-test
  (testing "formats user matching Python"
    (let [user {:id 1
                :name "John Doe"
                :email "john@example.com"
                :glossary {"ARR" "Annual Recurring Revenue"}}
          xml (llm-rep/user->xml user)]
      (is (str/starts-with? xml "<user>"))
      (is (str/includes? xml "### User Info"))
      (is (str/includes? xml "- Name: John Doe"))
      (is (str/includes? xml "- User ID: 1"))
      (is (str/includes? xml "- Email: john@example.com"))
      (is (str/includes? xml "### Glossary Terms"))
      (is (str/includes? xml "| ARR | Annual Recurring Revenue |"))
      (is (str/ends-with? (str/trim xml) "</user>")))))

(deftest search-result->xml-test
  (testing "formats search result with correct tag names"
    (let [result {:id 100
                  :type :metric
                  :name "Revenue Metric"
                  :description "Total revenue calculation"
                  :verified true
                  :collection {:name "Finance"}}
          xml (llm-rep/search-result->xml result)]
      (is (str/starts-with? xml "<metric"))
      (is (str/includes? xml "id=\"100\""))
      (is (str/includes? xml "name=\"Revenue Metric\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "Total revenue calculation"))
      (is (str/includes? xml "Collection: Finance"))
      (is (str/ends-with? (str/trim xml) "</metric>"))))

  (testing "uses correct tag names for different types"
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :table :name "t"}) "<table"))
    ;; Model uses <metabase-model> tag
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :model :name "m"}) "<metabase-model"))
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :dashboard :name "d"}) "<dashboard"))
    ;; Card/question uses <metabase_question> tag
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :card :name "c"}) "<metabase_question"))
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :dataset :name "d"}) "<metabase-model"))))

(deftest search-results->xml-test
  (testing "formats multiple search results"
    (let [results [{:id 1 :type :metric :name "Metric 1"}
                   {:id 2 :type :table :name "Table 1"}]
          xml (llm-rep/search-results->xml results)]
      (is (str/includes? xml "Here are the search results:"))
      (is (str/includes? xml "<search-results>"))
      (is (str/includes? xml "<metric id=\"1\""))
      (is (str/includes? xml "<table id=\"2\""))
      (is (str/includes? xml "</search-results>"))))

  (testing "handles empty results"
    (let [xml (llm-rep/search-results->xml [])]
      (is (str/includes? xml "<search-results>"))
      (is (str/includes? xml "</search-results>")))))

(deftest field-values-metadata->xml-test
  (testing "formats field values with samples"
    (let [metadata {:field_values ["US" "DE" "FR"]
                    :statistics {:sample_distinct_count 3
                                 :sample_percent_null 0.05}}
          xml (llm-rep/field-values-metadata->xml metadata)]
      (is (str/includes? xml "**Sample Values (for understanding format pattern)**"))
      (is (str/includes? xml "| Value |"))
      (is (str/includes? xml "| US |"))
      (is (str/includes? xml "**Field Statistics (SAMPLE-BASED)**"))
      (is (str/includes? xml "sample_distinct_count"))))

  (testing "handles empty field values"
    (let [metadata {:field_values []}
          xml (llm-rep/field-values-metadata->xml metadata)]
      (is (str/includes? xml "This field hasn't been sampled yet")))))

(deftest field-metadata->xml-test
  (testing "formats field metadata"
    (let [metadata {:field_id "f1"
                    :value_metadata {:field_values ["A" "B"]}}
          xml (llm-rep/field-metadata->xml metadata)]
      (is (str/includes? xml "<field-metadata field_id=\"f1\">"))
      (is (str/includes? xml "**Sample Values"))))

  (testing "handles nil value_metadata"
    (let [metadata {:field_id "f1" :value_metadata nil}
          xml (llm-rep/field-metadata->xml metadata)]
      (is (str/includes? xml "No metadata available to display")))))

(deftest get-metadata-result->xml-test
  (testing "formats metadata with metrics, tables, and models"
    (let [result {:metrics [{:id 1 :name "M1" :description "Metric 1"}]
                  :tables [{:id 2 :name "T1" :database_id 1 :description "Table 1"}]
                  :models [{:id 3 :name "Mo1" :description "Model 1"}]}
          xml (llm-rep/get-metadata-result->xml result)]
      (is (str/includes? xml "<metrics>"))
      (is (str/includes? xml "</metrics>"))
      (is (str/includes? xml "<tables>"))
      (is (str/includes? xml "</tables>"))
      ;; Uses <metabase-models> to match Python
      (is (str/includes? xml "<metabase-models>"))
      (is (str/includes? xml "</metabase-models>"))))

  (testing "handles no metadata"
    (let [result {:metrics [] :tables [] :models []}
          xml (llm-rep/get-metadata-result->xml result)]
      (is (str/includes? xml "No metadata was returned"))))

  (testing "includes errors"
    (let [result {:metrics [] :tables [] :models [] :errors ["Error 1"]}
          xml (llm-rep/get-metadata-result->xml result)]
      (is (str/includes? xml "<errors>"))
      (is (str/includes? xml "Error 1")))))

(deftest entity->xml-test
  (testing "dispatches to correct formatter based on type"
    (is (str/starts-with? (llm-rep/entity->xml {:type :metric :id 1 :name "m"}) "<metric"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :table :id 1 :name "t" :database_id 1}) "<table"))
    ;; Model uses <metabase-model>
    (is (str/starts-with? (llm-rep/entity->xml {:type :model :id 1 :name "m"}) "<metabase-model"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :question :id 1 :name "q"}) "<metabase_question"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :dashboard :id 1 :name "d"}) "<dashboard"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :user :id 1 :name "u" :email "u@test.com"}) "<user"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :collection :name "c"}) "<collection")))

  (testing "falls back to pr-str for unknown types"
    (let [result (llm-rep/entity->xml {:type :unknown :data "test"})]
      (is (str/includes? result ":type")))))
