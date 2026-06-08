(ns metabase.metabot.tools.shared.llm-shape-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]))

(deftest ^:parallel escape-xml-test
  (testing "escape-xml handles special characters"
    (is (= "&amp;" (#'llm-shape/escape-xml "&")))
    (is (= "&lt;" (#'llm-shape/escape-xml "<")))
    (is (= "&gt;" (#'llm-shape/escape-xml ">")))
    (is (= "&quot;" (#'llm-shape/escape-xml "\"")))
    (is (= "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
           (#'llm-shape/escape-xml "<script>alert(\"xss\")</script>"))))
  (testing "escape-xml handles nil"
    (is (nil? (#'llm-shape/escape-xml nil)))))

(deftest ^:parallel field->xml-test
  (testing "formats field with all attributes matching Python format"
    ;; for field data format see `metabase.metabot.tools.util/->result-column`
    (let [field {:field_id "f1"
                 :name "user_id"
                 :display_name "User ID"
                 :type :integer
                 :database_type "INTEGER"
                 :description "The user identifier"}
          xml (llm-shape/field->xml field)]
      ;; The column name is emitted bare (unquoted) so the LLM copies it verbatim into a
      ;; portable field reference; wrapping it in quotes made the model paste `"user_id"`
      ;; into MBQL field refs, which the resolver rejected.
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"user_id\""))
      (is (not (str/includes? xml "name=\"\\\"user_id\\\"\"")))
      (is (str/includes? xml "display_name=\"User ID\""))
      (is (str/includes? xml "type=\"integer\""))
      (is (str/includes? xml "database_type=\"INTEGER\""))
      (is (str/includes? xml "## Description"))
      (is (str/includes? xml "The user identifier"))))
  (testing "handles missing optional attributes with defaults"
    (let [field {:field_id "f1" :name "test"}
          xml (llm-shape/field->xml field)]
      (is (str/includes? xml "id=\"f1\""))
      (is (str/includes? xml "name=\"test\""))
      (is (str/includes? xml "database_type=\"unknown\""))))
  (testing "FK columns expose `fk_target_fully_qualified_name` so the LLM can join via the target table"
    ;; Regression: earlier the `<field>` element rendered no FK hint, so a bare `customer_id`
    ;; with no context led the LLM to assume related fields (like `email`) lived on the same
    ;; table and produce `:unknown-field` errors. `->result-column` already computes
    ;; `:fk_target_portable_fk`; `field->xml` now surfaces it.
    (let [field {:field_id "892"
                 :name "customer_id"
                 :display_name "Customer ID"
                 :type :string
                 :database_type "varchar"
                 :fk_target_portable_fk ["Analytics" "customerio_data" "customer" "id"]}
          xml (llm-shape/field->xml field)]
      (is (str/includes? xml "fk_target_fully_qualified_name=\"customerio_data.customer.id\""))))
  (testing "non-FK fields do not render an empty `fk_target_fully_qualified_name` attribute"
    (let [field {:field_id "1" :name "total" :type :number}
          xml (llm-shape/field->xml field)]
      (is (not (str/includes? xml "fk_target_fully_qualified_name"))))))

(deftest ^:parallel collection->xml-test
  (testing "formats collection with name"
    (let [collection {:name "Finance" :description "Finance reports" :authority_level "official"}
          xml (llm-shape/collection->xml collection)]
      (is (str/includes? xml "<collection"))
      (is (str/includes? xml "name=\"Finance\""))
      (is (str/includes? xml "authority_level=\"official\""))
      (is (str/includes? xml "<description>Finance reports</description>"))))
  (testing "uses default name for nil"
    (let [collection {:name nil}
          xml (llm-shape/collection->xml collection)]
      (is (str/includes? xml "name=\"Our analytics\"")))))

(deftest ^:parallel metric->xml-test
  (testing "formats metric with all attributes matching Python"
    (let [metric {:id 42
                  :name "Total Revenue"
                  :description "Sum of all revenue"
                  :verified true
                  :collection {:name "Finance"}
                  :default_time_dimension_field {:name "created_at"}
                  :queryable-dimensions [{:name "date" :field_id "d1" :base-type :type/Date :database_type "DATE"}]}
          xml (llm-shape/metric->xml metric)]
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
          xml (llm-shape/metric->xml metric)]
      (is (str/includes? xml "is_verified=\"false\""))
      (is (not (str/includes? xml "### Dimensions"))))))

(deftest ^:parallel format-metric-dimensions-table-test
  (testing "dimensions carry their source table + a copy-paste portable FK, disambiguating
           duplicate names across the metric's joined tables"
    (let [dims  [{:name "campaign_id" :field_id 757 :type "number"
                  :portable_fk ["Analytics" "customerio_enriched" "int_customerio_engagement_facts" "campaign_id"]}
                 {:name "name" :field_id 722 :type "string"
                  :portable_fk ["Analytics" "customerio_data" "campaign" "name"]
                  :table_reference "Campaign"}
                 {:name "campaign_id" :field_id 887 :type "number"
                  :portable_fk ["Analytics" "customerio_data" "campaign" "id"]
                  :table_reference "Campaign"}]
          table (llm-shape/format-metric-dimensions-table dims)]
      (testing "attribution columns are present"
        (is (str/includes? table "Source table"))
        (is (str/includes? table "Reference")))
      (testing "each dimension shows its owning table (with join label when joined in)"
        (is (str/includes? table "customerio_enriched.int_customerio_engagement_facts"))
        (is (str/includes? table "customerio_data.campaign (via Campaign)")))
      (testing "reference is the exact, unescaped portable FK to copy"
        (is (str/includes? table "[\"Analytics\",\"customerio_data\",\"campaign\",\"name\"]")))
      (testing "the two campaign_id dimensions are distinguishable by table + reference"
        (is (str/includes? table "[\"Analytics\",\"customerio_enriched\",\"int_customerio_engagement_facts\",\"campaign_id\"]"))
        (is (str/includes? table "[\"Analytics\",\"customerio_data\",\"campaign\",\"id\"]")))))
  (testing "a pipe in a value is escaped so it can't break the table row"
    (let [table (llm-shape/format-metric-dimensions-table
                 [{:name "weird|name" :field_id 1 :type "string"
                   :portable_fk ["Analytics" "public" "t" "weird|name"]}])]
      (is (str/includes? table "weird\\|name"))
      (testing "but the copyable reference remains valid JSON"
        (is (str/includes? table "\"weird\\u007cname\""))
        (is (not (str/includes? table "\"weird\\|name\"")))))))

(deftest ^:parallel field-metadata->xml-reference-test
  (testing "a drilled-into field detail surfaces the source table + portable FK when provided"
    (let [xml (llm-shape/field-metadata->xml
               {:field_id 722
                :value_metadata {:field_values ["Onboarding" "Welcome Series"]}
                :portable_fk ["Analytics" "customerio_data" "campaign" "name"]
                :table_reference "Campaign"})]
      (is (str/includes? xml "Source table: customerio_data.campaign (via Campaign)"))
      (is (str/includes? xml "[\"Analytics\",\"customerio_data\",\"campaign\",\"name\"]"))))
  (testing "without a portable FK the detail is unchanged (backward compatible)"
    (let [xml (llm-shape/field-metadata->xml
               {:field_id 1 :value_metadata {:field_values ["x"]}})]
      (is (not (str/includes? xml "Source table:")))
      (is (not (str/includes? xml "Reference (copy")))))
  (testing "XML structural chars in a portable-FK segment are escaped (the template uses |safe)"
    (let [xml (llm-shape/field-metadata->xml
               {:field_id 1
                :value_metadata {:field_values ["x"]}
                :portable_fk ["DB" "public" "t" "a<&>b"]})]
      (is (str/includes? xml "a&lt;&amp;&gt;b"))
      (testing "but the JSON's quotes stay readable"
        (is (str/includes? xml "\"a&lt;&amp;&gt;b\""))))))

(deftest ^:parallel measure->xml-test
  (testing "formats measure with all attributes"
    (let [;; The new contract: `:definition` is a portable aggregation clause vector,
          ;; produced by `convert-measure-or-segment` via `repr.resolve/export-query`.
          ;; `:portable-entity-id` is the 21-char NanoID the agent pastes into
          ;; `["measure", {}, "<pid>"]` clauses.
          measure {:id 1
                   :name "total_revenue"
                   :display-name "Total Revenue"
                   :description "Sum of all revenue"
                   :portable-entity-id "Xagv1NMQROhFqne5Z3l3N"
                   :definition [["sum" {} ["field" {} ["DB" "PUBLIC" "ORDERS" "TOTAL"]]]]
                   :definition-description "Sum of Total"}
          xml (llm-shape/measure->xml measure)]
      (is (str/starts-with? xml "<measure"))
      (is (str/includes? xml "measure_id=\"1\""))
      (is (str/includes? xml "name=\"total_revenue\""))
      (is (str/includes? xml "display_name=\"Total Revenue\""))
      (is (str/includes? xml "portable_entity_id=\"Xagv1NMQROhFqne5Z3l3N\""))
      (is (str/includes? xml "Sum of all revenue"))
      ;; The human-prose `Definition: <description>` line is gone. The structured
      ;; `<definition>...</definition>` block below carries the same information for the LLM.
      (is (not (str/includes? xml "Definition: Sum of Total")))
      (is (str/includes? xml "<definition>"))
      (testing "definition renders as a fenced JSON code block"
        (is (str/includes? xml "```json"))
        (is (str/includes? xml "\"sum\""))
        (is (str/includes? xml "\"ORDERS\""))
        (is (str/includes? xml "\"TOTAL\"")))
      (is (str/ends-with? (str/trim xml) "</measure>"))))
  (testing "omits portable_entity_id attribute when not present (legacy / unsaved measure)"
    (let [measure {:id 99 :name "no_pid"}
          xml (llm-shape/measure->xml measure)]
      (is (not (str/includes? xml "portable_entity_id")))))
  (testing "handles measure without description or definition"
    (let [measure {:id 2 :name "count_orders"}
          xml (llm-shape/measure->xml measure)]
      (is (str/includes? xml "measure_id=\"2\""))
      (is (str/includes? xml "name=\"count_orders\""))
      (is (str/includes? xml "display_name=\"count_orders\""))
      (is (not (str/includes? xml "<definition>")))
      (is (not (str/includes? xml "Definition:")))
      (is (str/ends-with? (str/trim xml) "</measure>"))))
  (testing "uses name as display_name fallback"
    (let [measure {:id 3 :name "avg_price" :display-name nil}
          xml (llm-shape/measure->xml measure)]
      (is (str/includes? xml "display_name=\"avg_price\"")))))

(deftest ^:parallel segment->xml-test
  (testing "formats segment with all attributes"
    (let [;; The new contract: `:definition` is a portable filter clause vector;
          ;; `:portable-entity-id` is the NanoID the agent pastes into `["segment", {}, "<pid>"]`.
          segment {:id 1
                   :name "active_customers"
                   :display-name "Active Customers"
                   :description "Customers who made a purchase in the last 30 days"
                   :portable-entity-id "SU_Ge6qwCh_-2XE10h11p"
                   :definition [[">" {} ["field" {} ["DB" "PUBLIC" "ORDERS" "TOTAL"]] 0]]
                   :definition-description "Total is greater than 0"}
          xml (llm-shape/segment->xml segment)]
      (is (str/starts-with? xml "<segment"))
      ;; The `<segment id=...>` attribute is named `id` (not `segment_id`) for consistency with
      ;; <table>, <metabase-model>, <metric> and friends. Renamed in the d47d35b7bec slim-down.
      (is (str/includes? xml "id=\"1\""))
      (is (str/includes? xml "name=\"active_customers\""))
      (is (str/includes? xml "display_name=\"Active Customers\""))
      (is (str/includes? xml "portable_entity_id=\"SU_Ge6qwCh_-2XE10h11p\""))
      (is (str/includes? xml "Customers who made a purchase in the last 30 days"))
      ;; The human-prose `Definition: <description>` line is gone. The structured
      ;; `<definition>...</definition>` block below carries the same information for the LLM.
      (is (not (str/includes? xml "Definition: Total is greater than 0")))
      (is (str/includes? xml "<definition>"))
      (testing "definition renders as a fenced JSON code block"
        (is (str/includes? xml "```json"))
        (is (str/includes? xml "\">\""))
        (is (str/includes? xml "\"ORDERS\""))
        (is (str/includes? xml "\"TOTAL\"")))
      (is (str/ends-with? (str/trim xml) "</segment>"))))
  (testing "omits portable_entity_id attribute when not present"
    (let [segment {:id 99 :name "no_pid"}
          xml (llm-shape/segment->xml segment)]
      (is (not (str/includes? xml "portable_entity_id")))))
  (testing "handles segment without description or definition-description"
    (let [segment {:id 2 :name "new_users"}
          xml (llm-shape/segment->xml segment)]
      (is (str/includes? xml "id=\"2\""))
      (is (str/includes? xml "name=\"new_users\""))
      (is (not (str/includes? xml "<definition>")))
      (is (not (str/includes? xml "Definition:")))
      (is (str/ends-with? (str/trim xml) "</segment>"))))
  (testing "uses name as display_name fallback"
    (let [segment {:id 3 :name "q4_orders" :display-name nil}
          xml (llm-shape/segment->xml segment)]
      (is (str/includes? xml "display_name=\"q4_orders\"")))))

(deftest ^:parallel table->xml-test
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
          xml (llm-shape/table->xml table)]
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
      (is (str/ends-with? (str/trim xml) "</table>"))))
  (testing "includes measures and segments when present"
    (let [table {:id 10
                 :name "order_facts"
                 :database_id 1
                 :database_engine "postgres"
                 :database_schema "shopify"
                 :description "Order facts table"
                 :measures [{:id 1 :name "avg_order_value" :display-name "Average Order Value"
                             :description "Average value of orders"}]
                 :segments [{:id 2 :name "q4_orders" :display-name "Q4 Orders"
                             :description "Orders placed in Q4"}]}
          xml (llm-shape/table->xml table)]
      (is (str/includes? xml "### Measures (Pre-defined Aggregation Formulas)"))
      (is (str/includes? xml "MEASURES (NOT metrics!)"))
      (is (str/includes? xml "<measure measure_id=\"1\""))
      (is (str/includes? xml "Average Order Value"))
      (is (str/includes? xml "### Segments (Pre-defined Filter Conditions)"))
      (is (str/includes? xml "<segment id=\"2\""))
      (is (str/includes? xml "Q4 Orders"))))
  (testing "omits measures and segments sections when empty"
    (let [table {:id 10 :name "users" :database_id 1 :database_engine "postgres"}
          xml (llm-shape/table->xml table)]
      (is (not (str/includes? xml "### Measures")))
      (is (not (str/includes? xml "### Segments"))))))

(deftest ^:parallel model->xml-test
  (testing "formats model with all attributes matching Python"
    (let [model {:id 5
                 :name "Sales Model"
                 :description "Aggregated sales data"
                 :verified true
                 :database_id 1
                 :database_engine "postgres"
                 :fields [{:name "revenue" :field_id "r1" :base-type :type/Float :database_type "DOUBLE"}]}
          xml (llm-shape/model->xml model)]
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

(deftest ^:parallel model->xml-test-2
  (testing "includes measures and segments when present"
    (let [model {:id 5
                 :name "Sales Model"
                 :database_id 1
                 :database_engine "postgres"
                 :description "Sales data"
                 :measures [{:id 1 :name "total_net_revenue" :display-name "Total Net Revenue"
                             :description "Net revenue after returns"}]
                 :segments [{:id 1 :name "new_customers" :display-name "New Customers"
                             :description "First-time buyers"}]}
          xml (llm-shape/model->xml model)]
      (is (str/includes? xml "### Measures (Pre-defined Aggregation Formulas)"))
      (is (str/includes? xml "MEASURES (NOT metrics!)"))
      (is (str/includes? xml "<measure measure_id=\"1\""))
      (is (str/includes? xml "Total Net Revenue"))
      (is (str/includes? xml "### Segments (Pre-defined Filter Conditions)"))
      (is (str/includes? xml "<segment id=\"1\""))
      (is (str/includes? xml "New Customers")))))

(deftest ^:parallel model->xml-test-3
  (testing "omits measures and segments sections when empty"
    (let [model {:id 5 :name "Empty Model" :database_id 1 :database_engine "postgres"}
          xml (llm-shape/model->xml model)]
      (is (not (str/includes? xml "### Measures")))
      (is (not (str/includes? xml "### Segments"))))))

(deftest ^:parallel model->xml-test-4
  (testing "includes portable_entity_id when present (for `source-card:` lookups)"
    (let [model {:id 6 :name "Portable Model" :database_id 1 :database_engine "postgres"
                 :portable_entity_id "bw41Vx2d-9d7sOScnaKlf"}
          xml (llm-shape/model->xml model)]
      (is (str/includes? xml "portable_entity_id=\"bw41Vx2d-9d7sOScnaKlf\"")))))

(deftest ^:parallel model->xml-test-5
  (testing "omits portable_entity_id when absent"
    (let [model {:id 7 :name "No EID Model" :database_id 1 :database_engine "postgres"}
          xml (llm-shape/model->xml model)]
      (is (not (str/includes? xml "portable_entity_id"))))))

(deftest ^:parallel model->xml-test-6
  (testing "renders the saved query body as a <query> block when :query_json is provided"
    (let [query-json {"lib/type" "mbql/query"
                      "database" "Sample"
                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                   "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          model {:id 8 :name "M" :database_id 1 :database_engine "postgres" :query_json query-json}
          xml (llm-shape/model->xml model)]
      (is (str/includes? xml "### Saved query"))
      (is (str/includes? xml "<query>"))
      (is (str/includes? xml "```json"))
      (is (str/includes? xml "\"lib/type\""))
      (is (str/includes? xml "</query>")))))

(deftest ^:parallel model->xml-test-7
  (testing "omits the <query> block when :query_json is missing or blank"
    (let [xml-missing (llm-shape/model->xml {:id 9 :name "M" :database_id 1 :database_engine "postgres"})
          xml-empty   (llm-shape/model->xml {:id 10 :name "M" :database_id 1 :database_engine "postgres"
                                             :query_json {}})]
      (is (not (str/includes? xml-missing "<query>")))
      (is (not (str/includes? xml-empty "<query>"))))))

(deftest ^:parallel query->xml-test
  (testing "formats query result matching Python"
    (let [query {:query-type :sql
                 :query-id "q123"
                 :database_id 1
                 :query-content "SELECT * FROM users"
                 :result {:result_columns [{:name "id" :display_name "ID" :type "number"}]
                          :rows [[1] [2]]}}
          xml (llm-shape/query->xml query)]
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
          xml (llm-shape/query->xml query)]
      (is (str/includes? xml "type=\"notebook\""))
      (is (not (str/includes? xml "<query_results>"))))))

(deftest ^:parallel chart->xml-test
  (testing "formats chart (simplified version)"
    (let [chart {:chart-id "ch-abc-123"
                 :query-id "q1"
                 :chart-type :bar}
          xml (llm-shape/chart->xml chart)]
      (is (str/starts-with? xml "<chart"))
      (is (str/includes? xml "id=\"ch-abc-123\""))
      (is (str/includes? xml "type=\"bar\""))
      (is (str/includes? xml "query-id=\"q1\""))
      (is (str/includes? xml "metabase://chart/ch-abc-123"))
      (is (str/ends-with? (str/trim xml) "</chart>"))))
  (testing "handles nil chart-type"
    (let [chart {:chart-id "c1" :query-id "q1" :chart-type nil}
          xml (llm-shape/chart->xml chart)]
      (is (str/includes? xml "type=\"table\"")))))

(deftest ^:parallel visualization->xml-test
  (testing "formats visualization with queries"
    (let [viz {:chart-id "v1"
               :queries [{:query-type :sql :query-id "q1" :database_id 1 :query-content "SELECT 1"}]
               :visualization_settings {:chart_type "bar"}}
          xml (llm-shape/visualization->xml viz)]
      (is (str/starts-with? xml "<chart"))
      (is (str/includes? xml "id=\"v1\""))
      (is (str/includes? xml "The chart is powered by the following queries"))
      (is (str/includes? xml "<query"))
      (is (str/includes? xml "<visualization>")))))

(deftest ^:parallel question->xml-test
  (testing "formats question matching Python"
    (let [question {:id 100
                    :name "Revenue Report"
                    :description "Monthly revenue breakdown"
                    :verified true
                    :collection {:name "Finance"}}
          xml (llm-shape/question->xml question)]
      (is (str/starts-with? xml "<metabase_question"))
      (is (str/includes? xml "id=\"100\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "<name>Revenue Report</name>"))
      (is (str/includes? xml "<description>Monthly revenue breakdown</description>"))
      (is (str/includes? xml "The question is stored in the following collection"))
      (is (str/ends-with? (str/trim xml) "</metabase_question>"))))
  (testing "includes display_type when present"
    (let [question {:id 101
                    :name "Pie Chart"
                    :display :pie}
          xml (llm-shape/question->xml question)]
      (is (str/includes? xml "display_type=\"pie\""))))
  (testing "omits display_type when not present"
    (let [question {:id 102
                    :name "No Display"}
          xml (llm-shape/question->xml question)]
      (is (not (str/includes? xml "display_type")))))
  (testing "includes portable_entity_id when present (for `source-card:` lookups)"
    (let [question {:id 103
                    :name "Portable Q"
                    :portable_entity_id "dh9P5mz7vhpqYUPosLPqL"}
          xml (llm-shape/question->xml question)]
      (is (str/includes? xml "portable_entity_id=\"dh9P5mz7vhpqYUPosLPqL\""))))
  (testing "omits portable_entity_id when absent"
    (let [question {:id 104 :name "No EID"}
          xml (llm-shape/question->xml question)]
      (is (not (str/includes? xml "portable_entity_id")))))
  (testing "renders the saved query body as a <query> block when :query_json is provided"
    (let [query-json {"lib/type" "mbql/query"
                      "database" "Sample"
                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                   "source-table" ["Sample" "PUBLIC" "ORDERS"]}]}
          xml (llm-shape/question->xml {:id 200 :name "Q" :query_json query-json})]
      (is (str/includes? xml "<query>"))
      (is (str/includes? xml "```json"))
      (is (str/includes? xml "\"lib/type\""))
      (is (str/includes? xml "\"source-table\""))
      (is (str/includes? xml "</query>"))))
  (testing "omits the <query> block when :query_json is missing or blank"
    (let [xml-missing (llm-shape/question->xml {:id 201 :name "Q"})
          xml-empty   (llm-shape/question->xml {:id 202 :name "Q" :query_json {}})]
      (is (not (str/includes? xml-missing "<query>")))
      (is (not (str/includes? xml-empty "<query>"))))))

(deftest ^:parallel dashboard->xml-test
  (testing "formats dashboard matching Python"
    (let [dashboard {:id 50
                     :name "Sales Dashboard"
                     :description "Overview of sales metrics"
                     :verified true
                     :collection {:name "Sales"}
                     :dashcards [{:id 1 :type :text :order 1 :width 6 :height 2
                                  :dashboard_tab_id 0 :row 0 :col 0 :text "Welcome"}]}
          xml (llm-shape/dashboard->xml dashboard)]
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

(deftest ^:parallel user->xml-test
  (testing "formats user matching Python"
    (let [user {:id 1
                :name "John Doe"
                :email "john@example.com"
                :glossary {"ARR" "Annual Recurring Revenue"}}
          xml (llm-shape/user->xml user)]
      (is (str/starts-with? xml "<user>"))
      (is (str/includes? xml "### User Info"))
      (is (str/includes? xml "- Name: John Doe"))
      (is (str/includes? xml "- User ID: 1"))
      (is (str/includes? xml "- Email: john@example.com"))
      (is (str/includes? xml "### Glossary Terms"))
      (is (str/includes? xml "| ARR | Annual Recurring Revenue |"))
      (is (str/ends-with? (str/trim xml) "</user>")))))

(deftest ^:parallel search-result->xml-test
  (testing "formats search result with correct tag names"
    (let [result {:id 100
                  :type :metric
                  :name "Revenue Metric"
                  :description "Total revenue calculation"
                  :verified true
                  :collection {:name "Finance"}}
          xml (llm-shape/search-result->xml result)]
      (is (str/starts-with? xml "<metric"))
      (is (str/includes? xml "id=\"100\""))
      (is (str/includes? xml "name=\"Revenue Metric\""))
      (is (str/includes? xml "is_verified=\"true\""))
      (is (str/includes? xml "Total revenue calculation"))
      (is (str/includes? xml "Collection: Finance"))
      (is (str/ends-with? (str/trim xml) "</metric>")))))

(deftest ^:parallel search-result->xml-test-2
  (testing "table search result includes database_id, database_engine, and fully_qualified_name"
    (let [result {:id 133
                  :type "table"
                  :name "order"
                  :database_id 2
                  :database_engine :postgres
                  :database_schema "shopify_data"}
          xml (llm-shape/search-result->xml result)]
      (is (str/starts-with? xml "<table"))
      (is (str/includes? xml "id=\"133\""))
      (is (str/includes? xml "name=\"order\""))
      (is (str/includes? xml "database_id=\"2\""))
      (is (str/includes? xml "database_engine=\"postgres\""))
      (is (str/includes? xml "fully_qualified_name=\"shopify_data.order\"")))))

(deftest ^:parallel search-result->xml-test-3
  (testing "table search result without schema omits schema prefix in fqn"
    (let [result {:id 10
                  :type "table"
                  :name "users"
                  :database_id 1
                  :database_engine :h2}
          xml (llm-shape/search-result->xml result)]
      (is (str/includes? xml "fully_qualified_name=\"users\""))
      (is (str/includes? xml "database_engine=\"h2\"")))))

(deftest ^:parallel search-result->xml-test-4
  (testing "model search result includes database_id, database_engine, and fully_qualified_name"
    (let [result {:id 5
                  :type "model"
                  :name "Sales Model"
                  :database_id 1
                  :database_engine :postgres
                  :verified true}
          xml (llm-shape/search-result->xml result)]
      (is (str/starts-with? xml "<model"))
      (is (str/includes? xml "database_id=\"1\""))
      (is (str/includes? xml "database_engine=\"postgres\""))
      (is (str/includes? xml "fully_qualified_name=\"{#5}-sales-model\"")))))

(deftest ^:parallel search-result->xml-test-5
  (testing "question search result includes portable_entity_id attribute when present"
    (let [result {:id 175
                  :type "question"
                  :name "Orders, Count"
                  :verified false
                  :database_id 1
                  :database_engine "h2"
                  :portable_entity_id "dh9P5mz7vhpqYUPosLPqL"}
          xml (llm-shape/search-result->xml result)]
      (is (str/starts-with? xml "<question"))
      (is (str/includes? xml "id=\"175\""))
      (is (str/includes? xml "portable_entity_id=\"dh9P5mz7vhpqYUPosLPqL\"")))))

(deftest ^:parallel search-result->xml-test-6
  (testing "model search result includes portable_entity_id attribute when present"
    (let [result {:id 42
                  :type "model"
                  :name "Sales Model"
                  :verified true
                  :database_id 1
                  :database_engine "postgres"
                  :portable_entity_id "AbCdEfGhIjKlMnOpQrStU"}
          xml (llm-shape/search-result->xml result)]
      (is (str/includes? xml "portable_entity_id=\"AbCdEfGhIjKlMnOpQrStU\"")))))

(deftest ^:parallel search-result->xml-test-7
  (testing "search result without portable_entity_id simply omits the attribute"
    (let [result {:id 99 :type "question" :name "Legacy"
                  :verified false :database_id 1 :database_engine "h2"}
          xml (llm-shape/search-result->xml result)]
      (is (not (str/includes? xml "portable_entity_id"))))))

(deftest ^:parallel search-result->xml-test-8
  (testing "table search result never carries portable_entity_id"
    (let [result {:id 10 :type "table" :name "ORDERS"
                  :verified false :database_id 1 :database_engine "h2"
                  :database_schema "PUBLIC"}
          xml (llm-shape/search-result->xml result)]
      (is (not (str/includes? xml "portable_entity_id"))))))

(deftest ^:parallel search-result->xml-test-9
  (testing "non-table/model search results omit table-specific attributes"
    (let [result {:id 50
                  :type :dashboard
                  :name "Sales Dashboard"
                  :database_id nil}
          xml (llm-shape/search-result->xml result)]
      (is (not (str/includes? xml "fully_qualified_name")))
      (is (not (str/includes? xml "database_id")))
      (is (not (str/includes? xml "database_engine"))))))

(deftest ^:parallel search-result->xml-test-10
  (testing "uses correct tag names for different types"
    (is (str/starts-with? (llm-shape/search-result->xml {:id 1 :type :table :name "t"}) "<table"))
    ;; Model uses <metabase-model> tag
    (is (str/starts-with? (llm-shape/search-result->xml {:id 1 :type :model :name "m"}) "<metabase-model"))
    (is (str/starts-with? (llm-shape/search-result->xml {:id 1 :type :dashboard :name "d"}) "<dashboard"))
    ;; Card/question uses <metabase_question> tag
    (is (str/starts-with? (llm-shape/search-result->xml {:id 1 :type :card :name "c"}) "<metabase_question"))
    (is (str/starts-with? (llm-shape/search-result->xml {:id 1 :type :dataset :name "d"}) "<metabase-model"))))

(deftest ^:parallel search-results->xml-test
  (testing "formats multiple search results"
    (let [results [{:id 1 :type :metric :name "Metric 1"}
                   {:id 2 :type :table :name "Table 1"}]
          xml (llm-shape/search-results->xml results)]
      (is (str/includes? xml "Here are the search results:"))
      (is (str/includes? xml "<search-results>"))
      (is (str/includes? xml "<metric id=\"1\""))
      (is (str/includes? xml "<table id=\"2\""))
      (is (str/includes? xml "</search-results>"))))
  (testing "handles empty results"
    (let [xml (llm-shape/search-results->xml [])]
      (is (str/includes? xml "<search-results>"))
      (is (str/includes? xml "</search-results>")))))

(deftest ^:parallel field-values-metadata->xml-test
  (testing "formats field values with samples"
    (let [metadata {:field_values ["US" "DE" "FR"]
                    :statistics {:sample_distinct_count 3
                                 :sample_percent_null 0.05}}
          xml (llm-shape/field-values-metadata->xml metadata)]
      (is (str/includes? xml "**Sample Values (for understanding format pattern)**"))
      (is (str/includes? xml "| Value |"))
      (is (str/includes? xml "| US |"))
      (is (str/includes? xml "**Field Statistics (SAMPLE-BASED)**"))
      (is (str/includes? xml "sample_distinct_count"))))
  (testing "handles empty field values"
    (let [metadata {:field_values []}
          xml (llm-shape/field-values-metadata->xml metadata)]
      (is (str/includes? xml "This field hasn't been sampled yet"))))
  (testing "a pipe in a sample value is escaped so it can't break the table"
    (let [xml (llm-shape/field-values-metadata->xml {:field_values ["a|b"]})]
      (is (str/includes? xml "a\\|b")))))

(deftest ^:parallel field-metadata->xml-test
  (testing "formats field metadata"
    (let [metadata {:field_id "f1"
                    :value_metadata {:field_values ["A" "B"]}}
          xml (llm-shape/field-metadata->xml metadata)]
      (is (str/includes? xml "<field-metadata field_id=\"f1\">"))
      (is (str/includes? xml "**Sample Values"))))
  (testing "handles nil value_metadata"
    (let [metadata {:field_id "f1" :value_metadata nil}
          xml (llm-shape/field-metadata->xml metadata)]
      (is (str/includes? xml "No metadata available to display")))))

(deftest ^:parallel get-metadata-result->xml-test
  (testing "formats metadata with metrics, tables, and models"
    (let [result {:metrics [{:id 1 :name "M1" :description "Metric 1"}]
                  :tables [{:id 2 :name "T1" :database_id 1 :description "Table 1"}]
                  :models [{:id 3 :name "Mo1" :description "Model 1"}]}
          xml (llm-shape/get-metadata-result->xml result)]
      (is (str/includes? xml "<metrics>"))
      (is (str/includes? xml "</metrics>"))
      (is (str/includes? xml "<tables>"))
      (is (str/includes? xml "</tables>"))
      ;; Uses <metabase-models> to match Python
      (is (str/includes? xml "<metabase-models>"))
      (is (str/includes? xml "</metabase-models>"))))
  (testing "handles no metadata"
    (let [result {:metrics [] :tables [] :models []}
          xml (llm-shape/get-metadata-result->xml result)]
      (is (str/includes? xml "No metadata was returned"))))
  (testing "includes errors"
    (let [result {:metrics [] :tables [] :models [] :errors ["Error 1"]}
          xml (llm-shape/get-metadata-result->xml result)]
      (is (str/includes? xml "<errors>"))
      (is (str/includes? xml "Error 1")))))

(deftest ^:parallel entity->xml-test
  (testing "dispatches to correct formatter based on type"
    (is (str/starts-with? (llm-shape/entity->xml {:type :metric :id 1 :name "m"}) "<metric"))
    (is (str/starts-with? (llm-shape/entity->xml {:type :table :id 1 :name "t" :database_id 1}) "<table"))
    ;; Model uses <metabase-model>
    (is (str/starts-with? (llm-shape/entity->xml {:type :model :id 1 :name "m"}) "<metabase-model"))
    (is (str/starts-with? (llm-shape/entity->xml {:type :question :id 1 :name "q"}) "<metabase_question"))
    (is (str/starts-with? (llm-shape/entity->xml {:type :dashboard :id 1 :name "d"}) "<dashboard"))
    (is (str/starts-with? (llm-shape/entity->xml {:type :user :id 1 :name "u" :email "u@test.com"}) "<user"))
    (is (str/starts-with? (llm-shape/entity->xml {:type :collection :name "c"}) "<collection")))
  (testing "falls back to pr-str for unknown types"
    (let [result (llm-shape/entity->xml {:type :unknown :data "test"})]
      (is (str/includes? result ":type")))))
