(ns metabase.metabot.tools.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.metadata :as metadata-tools]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

;;; ----------------------------------- pure helpers ----------------------------------------

(deftest list-available-fields-input-test
  (testing "builds typed entries per source list"
    (is (= [{:type "table"  :id 1}
            {:type "table"  :id 2}
            {:type "model"  :id 7}
            {:type "metric" :id 12}]
           (#'metadata-tools/list-available-fields-input
            {:table_ids [1 2] :model_ids [7] :metric_ids [12]}))))
  (testing "all empty lists → empty input"
    (is (= [] (#'metadata-tools/list-available-fields-input
               {:table_ids [] :model_ids [] :metric_ids []}))))
  (testing "nil lists tolerated"
    (is (= [] (#'metadata-tools/list-available-fields-input {})))))

(deftest fields-from-entity-test
  (testing "projects fields with integer :field_id; skips pseudo-fields"
    (is (= [{:type "field" :id 10 :metadata {:table_id 3}}
            {:type "field" :id 11 :metadata {:table_id 3}}]
           (#'metadata-tools/fields-from-entity
            {:id 3
             :fields [{:field_id 10}
                      {:field_id "expr_alias"}
                      {:field_id 11}
                      {:field_id nil}]}))))
  (testing "entity with no :fields → empty output"
    (is (= [] (#'metadata-tools/fields-from-entity {:id 3})))))

(deftest list-available-fields-output-test
  (testing "concatenates field projections from tables and models"
    (let [result {:structured-output {:tables [{:id 1 :fields [{:field_id 100}]}]
                                      :models [{:id 50 :fields [{:field_id 200}]}]
                                      :metrics []}}]
      (is (= [{:type "field" :id 100 :metadata {:table_id 1}}
              {:type "field" :id 200 :metadata {:table_id 50}}]
             (#'metadata-tools/list-available-fields-output result)))))
  (testing "empty result → empty output"
    (is (= [] (#'metadata-tools/list-available-fields-output
               {:structured-output {:tables [] :models [] :metrics []}})))))

;;; ----------------------------------- list_available_fields ----------------------------------------

(deftest list-available-fields-entity-usage-success-test
  (testing "list_available_fields emits input from args and output from surfaced fields"
    (mt/with-dynamic-fn-redefs [entity-details-tools/get-table-details
                                (fn [{:keys [entity-type entity-id]}]
                                  {:structured-output
                                   (case entity-type
                                     :table {:id entity-id
                                             :type :table
                                             :name "orders"
                                             :fields [{:field_id 100 :name "id"}
                                                      {:field_id 101 :name "total"}
                                                      ;; aggregation column with string id — must be skipped
                                                      {:field_id "sum_total" :name "sum_total"}]}
                                     :model {:id entity-id
                                             :type :model
                                             :name "Best Model"
                                             :fields [{:field_id 200 :name "x"}]})})
                                entity-details-tools/get-metric-details
                                (fn [{:keys [metric-id]}]
                                  {:structured-output
                                   {:id metric-id :type :metric :name "M" :default_time_dimension_field_id nil}})]
      (let [result (metadata-tools/list-available-fields-tool
                    {:table_ids [3] :model_ids [50] :metric_ids [12]})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= [{:type "table"  :id 3}
                {:type "model"  :id 50}
                {:type "metric" :id 12}]
               (:input eu)))
        (is (= [{:type "field" :id 100 :metadata {:table_id 3}}
                {:type "field" :id 101 :metadata {:table_id 3}}
                {:type "field" :id 200 :metadata {:table_id 50}}]
               (:output eu)))))))

(deftest list-available-fields-entity-usage-empty-args-test
  (testing "all-empty arg lists still produce a valid entity-usage with empty channels"
    (let [result (metadata-tools/list-available-fields-tool
                  {:table_ids [] :model_ids [] :metric_ids []})
          eu     (get-in result [:structured-output :entity-usage])]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= {:input [] :output []} eu)))))

(deftest list-available-fields-entity-usage-validation-error-test
  (testing "agent-error from get-metadata (too many ids) still emits input from args"
    (let [result (metadata-tools/list-available-fields-tool
                  {:table_ids [1 2 3 4 5 6] :model_ids [] :metric_ids []})
          eu     (get-in result [:structured-output :entity-usage])]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [{:type "table" :id 1}
              {:type "table" :id 2}
              {:type "table" :id 3}
              {:type "table" :id 4}
              {:type "table" :id 5}
              {:type "table" :id 6}]
             (:input eu)))
      (is (= [] (:output eu))))))

;;; ----------------------------------- get_field_values ----------------------------------------

(deftest get-field-values-entity-usage-success-test
  (testing "get_field_values emits data-source + field input, empty output"
    (mt/with-dynamic-fn-redefs [field-stats-tools/field-values
                                (fn [_]
                                  {:structured-output {:result-type :field-metadata
                                                       :field_id 99
                                                       :value_metadata {:field_values ["a" "b"]}}})]
      (let [result (metadata-tools/get-field-values-tool
                    {:data_source "table" :source_id 7 :field_id 99})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "table" :id 7}
                         {:type "field" :id 99}]
                :output []}
               eu))))))

(deftest get-field-values-entity-usage-string-field-id-test
  (testing "string field_id (aggregation column) is recorded verbatim"
    (mt/with-dynamic-fn-redefs [field-stats-tools/field-values
                                (fn [_] {:structured-output {:field_id "sum_total"
                                                             :value_metadata {}}})]
      (let [result (metadata-tools/get-field-values-tool
                    {:data_source "model" :source_id 50 :field_id "sum_total"})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "model" :id 50}
                         {:type "field" :id "sum_total"}]
                :output []}
               eu))))))

(deftest get-field-values-entity-usage-error-test
  (testing "field-values agent-error path still emits input from args"
    (mt/with-dynamic-fn-redefs [field-stats-tools/field-values
                                (fn [_] {:output "No such field"})]
      (let [result (metadata-tools/get-field-values-tool
                    {:data_source "metric" :source_id 8 :field_id 99})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "metric" :id 8}
                         {:type "field"  :id 99}]
                :output []}
               eu))))))
