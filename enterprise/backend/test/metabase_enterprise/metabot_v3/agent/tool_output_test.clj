(ns metabase-enterprise.metabot-v3.agent.tool-output-test
  "Tests that agent-level tools return pre-formatted `:output` strings
   suitable for LLM consumption — not raw data in `:structured-output`.

   Each tool should own its formatting. These tests catch tools that still
   leak EDN/Clojure data structures to the LLM."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools.metadata :as metadata-tools]
   [metabase-enterprise.metabot-v3.agent.tools.resources :as resource-tools]
   [metabase-enterprise.metabot-v3.agent.tools.search :as search-tools]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

;; ---------------------------------------------------------------------------
;; Helpers
;; ---------------------------------------------------------------------------

(defn- ensure-fresh-field-values!
  [field-id]
  (t2/delete! :model/FieldValues :field_id field-id :type :full)
  (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id field-id)))

(def ^:private edn-patterns
  "Regex patterns that indicate raw EDN/Clojure data leaked into the output.
   If any of these match, a tool is dumping data structures instead of formatted text."
  [#"\{:result-type"
   #":structured-output"
   #":structured_output"
   #"#:model"
   #"#metabase"
   #"clojure\.lang\."])

(defn- find-field-index
  "Find the index of a field by name in a table's visible columns."
  [table-id field-name]
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/table mp table-id))
        cols  (lib/visible-columns query -1 {:include-implicitly-joinable? false})]
    (some (fn [[i col]] (when (= field-name (:name col)) i))
          (map-indexed vector cols))))

(defn- assert-formatted-output
  "Assert that a tool result contains a well-formatted :output string.
   Checks it's a string, matches expected-pattern, has no EDN leaks, and is within size budget."
  [{:keys [output]} description expected-pattern]
  (testing description
    (is (string? output) "tool must return :output string")
    (is (re-find expected-pattern output) "output must contain expected XML structure")
    (testing "Should not contain EDN patterns"
      (doseq [pattern edn-patterns]
        (is (not (re-find pattern output)) (str "output contains EDN pattern " pattern))))
    (is (> 10000 (count output)) "Should not be too big")))

(defn- assert-formatted-structured
  "Assert that a tool returns both :structured-output and a well-formatted :output string."
  [tool-result description expected-pattern]
  (testing description
    (let [structured (or (:structured-output tool-result) (:structured_output tool-result))]
      (is (some? structured) "tool must return :structured-output"))
    (let [output (:output tool-result)]
      (is (string? output) "tool must return :output string")
      (is (re-find expected-pattern output) "output must contain expected XML structure")
      (testing "Should not contain EDN patterns"
        (doseq [pattern edn-patterns]
          (is (not (re-find pattern output)) (str "output contains EDN pattern " pattern))))
      (is (> 20000 (count output)) "Should not be too big"))))

;; ---------------------------------------------------------------------------
;; Tool invocations: [description, thunk, expected-pattern]
;;
;; thunk returns the tool result map (as the agent tool function returns it).
;; expected-pattern is a regex the :output string must match.
;; ---------------------------------------------------------------------------

(defn- read-resource-invocations! []
  [["read_resource: table (no fields)"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://table/" (mt/id :orders))]})
    #"<table\b"]

   ["read_resource: table with fields"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://table/" (mt/id :orders) "/fields")]})
    #"<table\b"]

   ["read_resource: table field values"
    #(let [table-id (mt/id :orders)
           idx      (find-field-index table-id "QUANTITY")]
       (ensure-fresh-field-values! (mt/id :orders :quantity))
       (resource-tools/read-resource-tool
        {:uris [(str "metabase://table/" table-id "/fields/t" table-id "-" idx)]}))
    #"<field-metadata\b"]])

(defn- read-resource-metric-invocations [metric-id]
  [["read_resource: metric (no dimensions)"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://metric/" metric-id)]})
    #"<metric\b"]

   ["read_resource: metric with dimensions"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://metric/" metric-id "/dimensions")]})
    #"<metric\b"]])

(defn- read-resource-model-invocations [model-id]
  [["read_resource: model (no fields)"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://model/" model-id)]})
    ;; model->xml outputs <metabase-model> tag
    #"<metabase-model\b"]

   ["read_resource: model with fields"
    #(resource-tools/read-resource-tool
      {:uris [(str "metabase://model/" model-id "/fields")]})
    #"<metabase-model\b"]])

;; ---------------------------------------------------------------------------
;; The tests
;; ---------------------------------------------------------------------------

(deftest tool-output-is-formatted-string-test
  (testing "Agent-level tools return :output with formatted strings, not :structured-output"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (doseq [[description thunk expected-pattern] (read-resource-invocations!)]
          (testing description
            (let [{:keys [output]} (thunk)]
              (is (string? output) "tool must return :output string")
              (is (re-find expected-pattern output) "output must contain expected XML structure")
              (testing "Should not contain EDN patterns"
                (doseq [pattern edn-patterns]
                  (is (not (re-find pattern output)) (str "output contains EDN pattern " pattern))))
              (is (> 10000 (count output)) "Should be not too big"))))

        (let [metric-query (-> (lib/query (mt/metadata-provider)
                                          (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                               (lib/aggregate (lib/sum (lib.metadata/field (mt/metadata-provider)
                                                                           (mt/id :orders :total)))))]
          (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                      :database_id   (mt/id)
                                                      :name          "Test Metric"
                                                      :type          :metric}]
            (doseq [[description thunk expected-pattern] (read-resource-metric-invocations metric-id)]
              (testing description
                (let [{:keys [output]} (thunk)]
                  (is (string? output) "tool must return :output string")
                  (is (re-find expected-pattern output) "output must contain expected XML structure")
                  (testing "Should not contain EDN patterns"
                    (doseq [pattern edn-patterns]
                      (is (not (re-find pattern output)) (str "output contains EDN pattern " pattern)))))))))))))

(deftest read-resource-model-output-test
  (testing "read_resource returns formatted :output for model URIs"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-query (-> (lib/query (mt/metadata-provider)
                                         (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                              (lib/with-fields [(lib.metadata/field (mt/metadata-provider) (mt/id :orders :id))
                                                (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total))]))]
          (mt/with-temp [:model/Card {model-id :id} {:dataset_query model-query
                                                     :database_id   (mt/id)
                                                     :name          "Test Model"
                                                     :type          :model}]
            (doseq [[description thunk expected-pattern] (read-resource-model-invocations model-id)]
              (assert-formatted-output (thunk) description expected-pattern))))))))

(deftest read-resource-multiple-uris-test
  (testing "read_resource with multiple URIs returns a single formatted :output string"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (resource-tools/read-resource-tool
                      {:uris [(str "metabase://table/" (mt/id :orders))
                              (str "metabase://table/" (mt/id :products))]})]
          (assert-formatted-output result "multiple tables" #"<resources>"))))))

(deftest read-resource-error-uri-test
  (testing "read_resource with bad URI returns :output string, not an exception"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [{:keys [output]} (resource-tools/read-resource-tool
                                {:uris ["metabase://table/999999999"]})]
          (is (string? output) "error case must still return :output string")
          (testing "Should not contain EDN patterns"
            (doseq [pattern edn-patterns]
              (is (not (re-find pattern output)) (str "error output contains EDN pattern " pattern)))))))))

(deftest search-tool-structured-output-formats-correctly-test
  (testing "search tool :structured-output formats to clean XML via format-structured-result"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [result (search-tools/search-tool
                      {:semantic_queries ["orders"]
                       :keyword_queries  ["orders"]
                       :entity_types     ["table"]})]
          (assert-formatted-structured result "search: tables" #"<search-results\b"))))))

(deftest search-tool-with-models-structured-output-test
  (testing "search tool with model results formats correctly"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-query (-> (lib/query (mt/metadata-provider)
                                         (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                              (lib/with-fields [(lib.metadata/field (mt/metadata-provider) (mt/id :orders :id))
                                                (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total))]))]
          (mt/with-temp [:model/Card {_model-id :id} {:dataset_query model-query
                                                      :database_id   (mt/id)
                                                      :name          "Searchable Test Model"
                                                      :type          :model}]
            (let [result (search-tools/search-tool
                          {:semantic_queries ["Searchable Test Model"]
                           :keyword_queries  ["Searchable Test Model"]
                           :entity_types     ["model"]})]
              (assert-formatted-structured
               result "search: model" #"<search-results\b"))))))))

(deftest list-available-fields-structured-output-test
  (testing "list_available_fields :structured-output formats to clean XML"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        ;; get-metadata result renders <tables> directly (no <metadata> wrapper)
        (let [result (metadata-tools/list-available-fields-tool
                      {:table_ids  [(mt/id :orders)]
                       :model_ids  []
                       :metric_ids []})]
          (assert-formatted-structured result "list_available_fields: table" #"<tables\b"))))))

(deftest list-available-fields-multiple-sources-test
  (testing "list_available_fields with multiple source types formats correctly"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [metric-query (-> (lib/query (mt/metadata-provider)
                                          (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                               (lib/aggregate (lib/sum (lib.metadata/field (mt/metadata-provider)
                                                                           (mt/id :orders :total)))))]
          (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                      :database_id   (mt/id)
                                                      :name          "Metadata Test Metric"
                                                      :type          :metric}]
            (let [result (metadata-tools/list-available-fields-tool
                          {:table_ids  [(mt/id :orders)]
                           :model_ids  []
                           :metric_ids [metric-id]})]
              (assert-formatted-structured result "list_available_fields: table + metric" #"<(?:tables|metrics)\b"))))))))

(deftest get-field-values-table-structured-output-test
  (testing "get_field_values for table field formats correctly"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [table-id (mt/id :orders)
              idx      (find-field-index table-id "QUANTITY")]
          (ensure-fresh-field-values! (mt/id :orders :quantity))
          (let [result (metadata-tools/get-field-values-tool
                        {:data_source "table"
                         :source_id   table-id
                         :field_id    (str "t" table-id "-" idx)})]
            (assert-formatted-structured result "get_field_values: table field" #"<field-metadata\b")))))))

(deftest get-field-values-metric-structured-output-test
  (testing "get_field_values for metric dimensions formats correctly"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [metric-query (-> (lib/query (mt/metadata-provider)
                                          (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                               (lib/aggregate (lib/sum (lib.metadata/field (mt/metadata-provider)
                                                                           (mt/id :orders :total)))))]
          (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                      :database_id   (mt/id)
                                                      :name          "Test Metric For Fields"
                                                      :type          :metric}]
            ;; Use the card-field-id-prefix format: c<id>-<index>
            ;; Temp metrics may not have fingerprints, so field metadata may be "No metadata available"
            ;; — still a valid formatted string, just not XML-wrapped
            (let [field-id (str "c" metric-id "-0")
                  result   (metadata-tools/get-field-values-tool
                            {:data_source "metric"
                             :source_id   metric-id
                             :field_id    field-id})]
              (assert-formatted-structured
               result "get_field_values: metric dimension" #"(?:<field-metadata\b|No metadata available)"))))))))

(deftest get-field-values-model-structured-output-test
  (testing "get_field_values for model field formats correctly"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-query (-> (lib/query (mt/metadata-provider)
                                         (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                              (lib/with-fields [(lib.metadata/field (mt/metadata-provider) (mt/id :orders :id))
                                                (lib.metadata/field (mt/metadata-provider) (mt/id :orders :total))]))]
          (mt/with-temp [:model/Card {model-id :id} {:dataset_query model-query
                                                     :database_id   (mt/id)
                                                     :name          "Test Model For Fields"
                                                     :type          :model}]
            ;; Temp models may not have fingerprints, so we accept either
            ;; <field-metadata> XML or "No metadata available" fallback
            (let [field-id (str "c" model-id "-0")
                  result   (metadata-tools/get-field-values-tool
                            {:data_source "model"
                             :source_id   model-id
                             :field_id    field-id})]
              (assert-formatted-structured
               result "get_field_values: model field" #"(?:<field-metadata\b|No metadata available)"))))))))

(deftest read-resource-model-field-values-test
  (testing "read_resource for model field values returns formatted :output"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [model-query (-> (lib/query (mt/metadata-provider)
                                         (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                              (lib/with-fields [(lib.metadata/field (mt/metadata-provider) (mt/id :orders :id))
                                                (lib.metadata/field (mt/metadata-provider) (mt/id :orders :quantity))]))]
          (mt/with-temp [:model/Card {model-id :id} {:dataset_query model-query
                                                     :database_id   (mt/id)
                                                     :name          "Test Model Field Values"
                                                     :type          :model}]
            ;; field index 1 = :quantity (second field)
            (ensure-fresh-field-values! (mt/id :orders :quantity))
            (let [field-id (str "c" model-id "-1")
                  result   (resource-tools/read-resource-tool
                            {:uris [(str "metabase://model/" model-id "/fields/" field-id)]})]
              (assert-formatted-output result "model field values" #"<field-metadata\b"))))))))

(deftest read-resource-metric-dimension-values-test
  (testing "read_resource for metric dimension values returns formatted :output"
    (mt/test-driver :h2
      (mt/with-current-user (mt/user->id :crowberto)
        (let [metric-query (-> (lib/query (mt/metadata-provider)
                                          (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))
                               (lib/aggregate (lib/sum (lib.metadata/field (mt/metadata-provider)
                                                                           (mt/id :orders :total)))))]
          (mt/with-temp [:model/Card {metric-id :id} {:dataset_query metric-query
                                                      :database_id   (mt/id)
                                                      :name          "Test Metric Dim Values"
                                                      :type          :metric}]
            ;; dimension index 0 = first filterable column
            ;; Temp metrics may not have fingerprints — "No metadata available" is also valid
            (let [field-id (str "c" metric-id "-0")
                  result   (resource-tools/read-resource-tool
                            {:uris [(str "metabase://metric/" metric-id "/dimensions/" field-id)]})]
              (assert-formatted-output result "metric dimension values" #"(?:<field-metadata\b|No metadata available)"))))))))
