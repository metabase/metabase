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
  (testing "formats field with all attributes"
    (let [field {:field_id "f1"
                 :name "user_id"
                 :display_name "User ID"
                 :base-type :type/Integer
                 :description "The user identifier"}
          xml (llm-rep/field->xml field)]
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"user_id\""))
      (is (str/includes? xml "display_name=\"User ID\""))
      (is (str/includes? xml "type=\"Integer\""))
      (is (str/includes? xml "The user identifier"))))

  (testing "handles missing optional attributes"
    (let [field {:field_id "f1" :name "test"}
          xml (llm-rep/field->xml field)]
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"test\"")))))

(deftest format-fields-table-test
  (testing "formats fields as markdown table"
    (let [fields [{:name "id" :field_id "f1" :base-type :type/Integer :description "Primary key"}
                  {:name "name" :field_id "f2" :base-type :type/Text :description "User name"}]
          table (llm-rep/format-fields-table fields)]
      (is (str/includes? table "| Field Name | Field ID | Type | Description |"))
      (is (str/includes? table "|------------|----------|------|-------------|"))
      (is (str/includes? table "| id | f1 | Integer | Primary key |"))
      (is (str/includes? table "| name | f2 | Text | User name |"))))

  (testing "returns nil for empty fields"
    (is (nil? (llm-rep/format-fields-table [])))
    (is (nil? (llm-rep/format-fields-table nil)))))

(deftest metric->xml-test
  (testing "formats metric with all attributes"
    (let [metric {:id 42
                  :name "Total Revenue"
                  :description "Sum of all revenue"
                  :verified true
                  :queryable-dimensions [{:name "date" :field_id "d1" :base-type :type/Date}]}
          xml (llm-rep/metric->xml metric)]
      (is (str/starts-with? xml "<metric"))
      (is (str/includes? xml "id=\"42\""))
      (is (str/includes? xml "name=\"Total Revenue\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "### Metric Description"))
      (is (str/includes? xml "Sum of all revenue"))
      (is (str/includes? xml "### Dimensions"))
      (is (str/ends-with? (str/trim xml) "</metric>"))))

  (testing "handles metric without dimensions"
    (let [metric {:id 1 :name "Test" :verified false}
          xml (llm-rep/metric->xml metric)]
      (is (str/includes? xml "is_verified=\"false\""))
      (is (not (str/includes? xml "### Dimensions"))))))

(deftest table->xml-test
  (testing "formats table with all attributes"
    (let [table {:id 10
                 :name "users"
                 :display_name "Users"
                 :database_id 1
                 :database_schema "public"
                 :description "User accounts"
                 :fields [{:name "id" :field_id "f1" :base-type :type/Integer}]}
          xml (llm-rep/table->xml table)]
      (is (str/starts-with? xml "<table"))
      (is (str/includes? xml "id=\"10\""))
      (is (str/includes? xml "name=\"users\""))
      (is (str/includes? xml "database_id=\"1\""))
      (is (str/includes? xml "schema=\"public\""))
      (is (str/includes? xml "Display name: Users"))
      (is (str/includes? xml "### Description"))
      (is (str/includes? xml "### Fields"))
      (is (str/ends-with? (str/trim xml) "</table>")))))

(deftest model->xml-test
  (testing "formats model with all attributes"
    (let [model {:id 5
                 :name "Sales Model"
                 :description "Aggregated sales data"
                 :verified true
                 :fields [{:name "revenue" :field_id "r1" :base-type :type/Float}]}
          xml (llm-rep/model->xml model)]
      (is (str/starts-with? xml "<model"))
      (is (str/includes? xml "id=\"5\""))
      (is (str/includes? xml "name=\"Sales Model\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "### Description"))
      (is (str/includes? xml "### Fields"))
      (is (str/ends-with? (str/trim xml) "</model>")))))

(deftest query->xml-test
  (testing "formats query result"
    (let [query {:type :query
                 :query-id "q123"
                 :result-columns [{:name "count" :field_id "c1" :base-type :type/Integer}
                                  {:name "date" :field_id "c2" :base-type :type/Date}]}
          xml (llm-rep/query->xml query)]
      (is (str/starts-with? xml "<query"))
      (is (str/includes? xml "type=\"query\""))
      (is (str/includes? xml "id=\"q123\""))
      (is (str/includes? xml "Result columns:"))
      (is (str/includes? xml "- count (id: c1, type: Integer)"))
      (is (str/includes? xml "- date (id: c2, type: Date)"))
      (is (str/ends-with? (str/trim xml) "</query>"))))

  (testing "handles query with no result columns"
    (let [query {:type :metric :query-id "m1"}
          xml (llm-rep/query->xml query)]
      (is (str/includes? xml "type=\"metric\""))
      (is (not (str/includes? xml "Result columns:"))))))

(deftest chart->xml-test
  (testing "formats chart"
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

(deftest search-result->xml-test
  (testing "formats search result with all fields"
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
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :model :name "m"}) "<model"))
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :dashboard :name "d"}) "<dashboard"))
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :card :name "c"}) "<question"))
    (is (str/starts-with? (llm-rep/search-result->xml {:id 1 :type :dataset :name "d"}) "<model"))))

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

(deftest entity->xml-test
  (testing "dispatches to correct formatter based on type"
    (is (str/starts-with? (llm-rep/entity->xml {:type :metric :id 1 :name "m"}) "<metric"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :table :id 1 :name "t" :database_id 1}) "<table"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :model :id 1 :name "m"}) "<model"))
    (is (str/starts-with? (llm-rep/entity->xml {:type :query :query-id "q1"}) "<query")))

  (testing "falls back to pr-str for unknown types"
    (let [result (llm-rep/entity->xml {:type :unknown :data "test"})]
      (is (str/includes? result ":type")))))
