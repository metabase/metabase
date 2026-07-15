(ns metabase.typed-schemas.api.schema.metric-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.typed-schemas.api.schema.metric :as schema.metric]
   [toucan2.core :as t2]))

(deftest metric-dimension-schema-uses-dimension-id-test
  (is (= {:type        "column"
          :name        "category"
          :displayName "Category"
          :baseType    "type/Text"
          :jsType      "string"
          :key         "category"
          :id          "550e8400-e29b-41d4-a716-446655440001"
          :fieldId     3815
          :tableId     12
          :metricId    247}
         (#'schema.metric/dimension-schema
          {:id             "550e8400-e29b-41d4-a716-446655440001"
           :name           "category"
           :display-name   "Category"
           :effective-type :type/Text
           :table-id       12
           :sources        [{:type :field, :field-id 3815}]}
          247))))

(deftest metric-dimension-schema-preserves-source-field-id-test
  (is (= 102
         (:sourceFieldId
          (#'schema.metric/dimension-schema
           {:id              "550e8400-e29b-41d4-a716-446655440001"
            :name            "category"
            :display-name    "Category"
            :effective-type  :type/Text
            :table-id        12
            :source-field-id 102
            :sources         [{:type :field, :field-id 3815}]}
           247)))))

(deftest metric-source-id-test
  (testing "integer source-table emits sourceTableId but not sourceCardId"
    (let [card {:dataset_query {:query {:source-table 10}}}]
      (is (= 10 (#'schema.metric/source-table-id card)))
      (is (nil? (#'schema.metric/source-card-id card)))))
  (testing "card source-table emits sourceCardId but not sourceTableId"
    (let [card {:dataset_query {:query {:source-table "card__42"}}}]
      (is (nil? (#'schema.metric/source-table-id card)))
      (is (= 42 (#'schema.metric/source-card-id card)))))
  (testing "stage source-card emits sourceCardId"
    (is (= 42 (#'schema.metric/source-card-id
               {:dataset_query {:stages [{:source-card 42}]}})))))

(deftest table-source-names-filters-unreadable-tables-test
  (with-redefs [t2/select (constantly [{:id 10 :name "orders" :display_name "Orders"}
                                       {:id 20 :name "franchises" :display_name "Franchises"}])
                mi/can-read? (fn [{:keys [id]}] (= id 10))]
    (is (= {10 "orders"}
           (#'schema.metric/table-source-names [10 20])))
    (is (= {10 "Orders"}
           (#'schema.metric/table-key-disambiguators [10 20])))))

(deftest metric-schema-keys-dimensions-test
  (with-redefs [schema.metric/metric-result-column (constantly nil)
                schema.metric/readable-table-source-rows
                (constantly [{:id 10 :name "orders" :display_name "Orders"}])
                schema.metric/metric-dimensions
                (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                              :name           "orders"
                              :display-name   "Orders"
                              :effective-type :type/Integer
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:type           "metric"
            :key            "customerLifetimeValue"
            :id             247
            :name           "Customer Lifetime Value"
            :columns        [{:type        "column"
                              :name        "Customer Lifetime Value"
                              :displayName "Customer Lifetime Value"
                              :jsType      "unknown"}]
            :mappedTableIds [10]
            :dimensions     {"orders" {:type        "column"
                                       :name        "orders"
                                       :sourceName  "orders"
                                       :displayName "Orders"
                                       :baseType    "type/Integer"
                                       :jsType      "number"
                                       :key         "orders"
                                       :id          "550e8400-e29b-41d4-a716-446655440001"
                                       :fieldId     42
                                       :tableId     10
                                       :metricId    247}}}
           (#'schema.metric/metric-schema
            {:id   247
             :name "Customer Lifetime Value"}
            {:id 247})))))

(deftest metric-schema-reuses-table-source-rows-test
  (let [table-select-count (atom 0)]
    (with-redefs [schema.metric/metric-result-column (constantly nil)
                  schema.metric/metric-dimensions
                  (constantly [{:id             "550e8400-e29b-41d4-a716-446655440001"
                                :name           "orders"
                                :display-name   "Orders"
                                :effective-type :type/Integer
                                :table-id       10
                                :sources        [{:type :field, :field-id 42}]}])
                  mi/can-read? (constantly true)
                  t2/select (fn [columns & _args]
                              (when (= columns [:model/Table :id :name :display_name])
                                (swap! table-select-count inc)
                                [{:id 10 :name "orders" :display_name "Orders"}]))]
      (#'schema.metric/metric-schema
       {:id   247
        :name "Customer Lifetime Value"}
       {:id 247})
      (is (= 1 @table-select-count)))))

(deftest source-card-metric-schema-omits-mapped-table-dimensions-test
  (with-redefs [schema.metric/metric-result-column (constantly nil)
                schema.metric/table-source-names (constantly {10 "employee_store_roster"})
                schema.metric/metric-dimensions
                (constantly [{:id   "count-dimension-uuid"
                              :name "count"}
                             {:id             "store-name-dimension-uuid"
                              :name           "store_name"
                              :display-name   "Store Name"
                              :effective-type :type/Text
                              :table-id       10
                              :sources        [{:type :field, :field-id 42}]}])]
    (is (= {:type         "metric"
            :key          "storesWithOver5Employees"
            :id           259
            :name         "Stores with Over 5 Employees"
            :columns      [{:type        "column"
                            :name        "Stores with Over 5 Employees"
                            :displayName "Stores with Over 5 Employees"
                            :jsType      "unknown"}]
            :sourceCardId 258
            :dimensions   {"count" {:type        "column"
                                    :name        "count"
                                    :displayName "count"
                                    :jsType      "unknown"
                                    :key         "count"
                                    :id          "count-dimension-uuid"
                                    :metricId    259}}}
           (#'schema.metric/metric-schema
            {:id   259
             :name "Stores with Over 5 Employees"}
            {:id            259
             :dataset_query {:stages [{:source-card 258}]}})))))
